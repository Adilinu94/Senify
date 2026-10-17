// Asset records of a site (ADR 0019, P3-2): the rows, their encoded derivatives (ladder and blur hash),
// the usage map of the check pipeline and the restore from a release snapshot. `Store` delegates here.
// The site existence check comes in as a function, because sites stay on the Store. The folder guard
// (`getAssetFolderOfSite`) and the cross-domain copy (`duplicateAssetRecords`) stay on the Store too.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import {
  ASSET_COLUMNS,
  mapAsset,
  mapAssetVariant,
  type AssetRow,
  type AssetVariantRow,
} from "./store-record-mappers.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type {
  Asset,
  AssetKind,
  AssetStatus,
  AssetUpdate,
  AssetUsage,
  AssetVariant,
  ReleaseAssetSnapshot,
} from "./types.ts";
import type { GeneratedVariant } from "./variants.ts";

export type CreateAssetInput = {
  id: string;
  siteId: string;
  filename: string;
  mime: string;
  kind: AssetKind;
  byteSize: number;
  width: number | null;
  height: number | null;
  hash: string;
  altText: string | null;
  decorative: boolean;
  folderId: string | null;
  tags: string[];
  storageRef: string;
};

export class AssetsRepository {
  readonly #db: Db;
  readonly #getSite: (siteId: string) => Promise<unknown>;

  constructor(db: Db, getSite: (siteId: string) => Promise<unknown>) {
    this.#db = db;
    this.#getSite = getSite;
  }

  // Loads encoded variants and blur hashes for a set of assets in two queries
  // and merges them onto the mapped rows (single fetch per read path).
  async #attachDerivatives(assets: Asset[]): Promise<Asset[]> {
    if (assets.length === 0) return assets;
    const ids = assets.map((asset) => asset.id);
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const [variantRows, blurhashRows] = await Promise.all([
      this.#db.query<AssetVariantRow>(
        `SELECT id, asset_id, width, format, storage_ref, byte_size, created_at
         FROM asset_variants WHERE asset_id IN (${placeholders})
         ORDER BY asset_id ASC, width ASC, format ASC, id ASC`,
        ids,
      ),
      this.#db.query<{ asset_id: string; value: string }>(
        `SELECT asset_id, value FROM asset_blurhash
         WHERE asset_id IN (${placeholders})`,
        ids,
      ),
    ]);
    const variants = new Map<string, AssetVariant[]>();
    for (const row of variantRows.rows) {
      const list = variants.get(row.asset_id) ?? [];
      list.push(mapAssetVariant(row));
      variants.set(row.asset_id, list);
    }
    const blurhashes = new Map(
      blurhashRows.rows.map((row) => [row.asset_id, row.value]),
    );
    return assets.map((asset) => ({
      ...asset,
      variants: variants.get(asset.id) ?? [],
      blurhash: blurhashes.get(asset.id) ?? null,
    }));
  }

  // Restores one asset row from a release snapshot (Fahrplan P3-4, R7).
  //
  // An UPSERT by id, deliberately: the id is what the pages reference, and a
  // rollback that handed out a new id would leave every page pointing at
  // nothing. The hash goes along because the release's pages were built against
  // those bytes, not against the id.
  //
  // `site_id` is taken from the snapshot, not from the caller: a rollback must
  // not be able to move an asset between sites, and a snapshot of another site
  // belongs to another site.
  async replaceAssetFromSnapshot(snapshot: ReleaseAssetSnapshot): Promise<Asset> {
    const now = new Date().toISOString();
    const result = await this.#db.query<AssetRow>(
      `INSERT INTO assets
        (id, site_id, filename, mime, kind, byte_size, width, height, hash, alt_text, decorative, folder_id, tags, storage_ref, status, replaced_at, trashed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ready', NULL, NULL, $15, $15)
       ON CONFLICT (id) DO UPDATE SET
         filename = EXCLUDED.filename,
         mime = EXCLUDED.mime,
         kind = EXCLUDED.kind,
         byte_size = EXCLUDED.byte_size,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         hash = EXCLUDED.hash,
         alt_text = EXCLUDED.alt_text,
         decorative = EXCLUDED.decorative,
         folder_id = EXCLUDED.folder_id,
         tags = EXCLUDED.tags,
         storage_ref = EXCLUDED.storage_ref,
         status = 'ready',
         trashed_at = NULL,
         replaced_at = NULL,
         updated_at = EXCLUDED.updated_at
       RETURNING ${ASSET_COLUMNS}`,
      [
        snapshot.id,
        snapshot.siteId,
        snapshot.filename,
        snapshot.mime,
        snapshot.kind as AssetKind,
        snapshot.byteSize,
        snapshot.width,
        snapshot.height,
        snapshot.hash,
        snapshot.altText,
        snapshot.decorative,
        snapshot.folderId,
        toJsonParam(snapshot.tags),
        snapshot.storageRef,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset snapshot restore returned no row");
    return mapAsset(row);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const now = new Date().toISOString();
    const result = await this.#db.query<AssetRow>(
      `INSERT INTO assets
        (id, site_id, filename, mime, kind, byte_size, width, height, hash, alt_text, decorative, folder_id, tags, storage_ref, status, replaced_at, trashed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ready', NULL, NULL, $15, $15)
       RETURNING ${ASSET_COLUMNS}`,
      [
        input.id,
        input.siteId,
        input.filename,
        input.mime,
        input.kind,
        input.byteSize,
        input.width,
        input.height,
        input.hash,
        input.altText,
        input.decorative,
        input.folderId,
        toJsonParam(input.tags),
        input.storageRef,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset insert returned no row");
    return mapAsset(row);
  }

  async getAsset(id: string): Promise<Asset> {
    const result = await this.#db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Asset "${id}" does not exist`, {
        field: "assetId",
        suggestion: "List the library with `list_assets` or check the id.",
      });
    }
    const asset = mapAsset(row);
    const [withDerivatives = asset] = await this.#attachDerivatives([asset]);
    return withDerivatives;
  }

  // An asset belongs to exactly one site (ADR-0014). This guard is the one
  // place that enforces it, so an id from another site can never be read,
  // changed or destroyed. `getAsset` stays unscoped on purpose: the redesign
  // plan loads a draft's assets first and then checks the ownership itself.
  async #getAssetInSite(assetId: string, siteId: string): Promise<Asset> {
    const asset = await this.getAsset(assetId);
    if (asset.siteId !== siteId) {
      throw new SenifyError("validation", `Asset "${assetId}" belongs to another site`, {
        field: "assetId",
        suggestion: "Use an asset of this site.",
      });
    }
    return asset;
  }

  // Public, site-scoped entry points for the access paths (ADR-0014).
  async getAssetOfSite(assetId: string, siteId: string): Promise<Asset> {
    return this.#getAssetInSite(assetId, siteId);
  }

  // Dedupe only looks at live assets: re-uploading the same bytes after a trash
  // must create a fresh, usable record.
  async findAssetByHash(siteId: string, hash: string): Promise<Asset | undefined> {
    const result = await this.#db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets
       WHERE site_id = $1 AND hash = $2 AND status = 'ready'
       ORDER BY created_at ASC, id ASC LIMIT 1`,
      [siteId, hash],
    );
    const row = result.rows[0];
    return row ? (await this.#attachDerivatives([mapAsset(row)]))[0] : undefined;
  }

  async listAssets(
    siteId: string,
    options: { status?: AssetStatus | "all" } = {},
  ): Promise<Asset[]> {
    const status = options.status ?? "ready";
    await this.#getSite(siteId);
    const result =
      status === "all"
        ? await this.#db.query<AssetRow>(
            `SELECT ${ASSET_COLUMNS} FROM assets WHERE site_id = $1
             ORDER BY created_at DESC, id DESC`,
            [siteId],
          )
        : await this.#db.query<AssetRow>(
            `SELECT ${ASSET_COLUMNS} FROM assets WHERE site_id = $1 AND status = $2
             ORDER BY created_at DESC, id DESC`,
            [siteId, status],
          );
    return this.#attachDerivatives(result.rows.map(mapAsset));
  }

  async updateAsset(id: string, patch: AssetUpdate): Promise<Asset> {
    const current = await this.getAsset(id);
    const next = {
      filename: patch.filename ?? current.filename,
      mime: patch.mime ?? current.mime,
      kind: patch.kind ?? current.kind,
      byteSize: patch.byteSize ?? current.byteSize,
      width: patch.width === undefined ? current.width : patch.width,
      height: patch.height === undefined ? current.height : patch.height,
      hash: patch.hash ?? current.hash,
      altText: patch.altText === undefined ? current.altText : patch.altText,
      decorative:
        patch.decorative === undefined ? current.decorative : patch.decorative,
      folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
      tags: patch.tags ?? current.tags,
      storageRef: patch.storageRef ?? current.storageRef,
      status: patch.status ?? current.status,
      replacedAt:
        patch.replacedAt === undefined ? current.replacedAt : patch.replacedAt,
      trashedAt:
        patch.trashedAt === undefined ? current.trashedAt : patch.trashedAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    await this.#db.query(
      `UPDATE assets SET
         filename = $2, mime = $3, kind = $4, byte_size = $5, width = $6, height = $7,
         hash = $8, alt_text = $9, decorative = $10, folder_id = $11, tags = $12,
         storage_ref = $13, status = $14, replaced_at = $15, trashed_at = $16, updated_at = $17
       WHERE id = $1`,
      [
        id,
        next.filename,
        next.mime,
        next.kind,
        next.byteSize,
        next.width,
        next.height,
        next.hash,
        next.altText,
        next.decorative,
        next.folderId,
        toJsonParam(next.tags),
        next.storageRef,
        next.status,
        next.replacedAt,
        next.trashedAt,
        next.updatedAt,
      ],
    );
    return { ...current, ...next };
  }

  async deleteAssetRecord(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM assets WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Asset "${id}" does not exist`, {
        field: "assetId",
      });
    }
  }

  // Replaces ladder and blur hash atomically: callers regenerate both after an
  // upload or replace, so stale rows never survive a dimension change.
  async replaceAssetDerivatives(
    assetId: string,
    variants: readonly GeneratedVariant[],
    blurhash: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM asset_variants WHERE asset_id = $1`, [assetId]);
      await tx.query(`DELETE FROM asset_blurhash WHERE asset_id = $1`, [assetId]);
      for (const variant of variants) {
        await tx.query(
          `INSERT INTO asset_variants
            (id, asset_id, width, format, storage_ref, byte_size, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            newEntityId(),
            assetId,
            variant.width,
            variant.format,
            variant.storageRef,
            variant.byteSize,
            now,
          ],
        );
      }
      if (blurhash !== null) {
        await tx.query(
          `INSERT INTO asset_blurhash (asset_id, value, created_at) VALUES ($1, $2, $3)`,
          [assetId, blurhash, now],
        );
      }
    });
  }

  async deleteAssetDerivatives(assetId: string): Promise<void> {
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM asset_variants WHERE asset_id = $1`, [assetId]);
      await tx.query(`DELETE FROM asset_blurhash WHERE asset_id = $1`, [assetId]);
    });
  }

  // The check pipeline needs status + decorative for every asset of a site;
  // ids that are absent are "missing" for the caller.
  async assetUsageMap(siteId: string): Promise<Map<string, AssetUsage>> {
    const result = await this.#db.query<{
      id: string;
      status: string;
      decorative: unknown;
    }>(`SELECT id, status, decorative FROM assets WHERE site_id = $1`, [siteId]);
    const map = new Map<string, AssetUsage>();
    for (const row of result.rows) {
      map.set(row.id, {
        status: row.status === "trashed" ? "trashed" : "ready",
        decorative: row.decorative === true || row.decorative === "true",
      });
    }
    return map;
  }
}
