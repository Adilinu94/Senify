// Release operations of the Store (ADR 0019): create, activate, finalize and read releases and the active-release pointer. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { toIso, toJson, toJsonParam } from "./store-row-utils.ts";
import type { Release, ReleaseManifest, ReleasePageRevision } from "./types.ts";

export type CreateReleaseInput = {
  siteId: string;
  pageRevisions: ReleasePageRevision[];
  themeSnapshot: unknown;
  buildRef: string | null;
  manifest?: ReleaseManifest | null;
  author: Author;
  note: string | null;
  basisReleaseId: string | null;
};

export type ActivateReleaseInput = {
  siteId: string;
  releaseId: string;
  buildRef: string;
};

export type FinalizeReleaseInput = {
  siteId: string;
  releaseId: string;
  buildRef: string;
  manifest: ReleaseManifest;
};

type ReleaseRow = {
  id: string;
  site_id: string;
  page_revisions: unknown;
  theme_snapshot: unknown;
  build_ref: unknown;
  manifest: unknown;
  author: unknown;
  note: unknown;
  basis_release_id: unknown;
  created_at: unknown;
};

function mapRelease(row: ReleaseRow): Release {
  return {
    id: row.id,
    siteId: row.site_id,
    pageRevisions: toJson<ReleasePageRevision[]>(row.page_revisions),
    themeSnapshot: toJson<unknown>(row.theme_snapshot),
    buildRef: typeof row.build_ref === "string" ? row.build_ref : null,
    manifest:
      row.manifest === null || row.manifest === undefined
        ? null
        : toJson<ReleaseManifest>(row.manifest),
    author: toJson<Author>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    basisReleaseId:
      typeof row.basis_release_id === "string" ? row.basis_release_id : null,
    createdAt: toIso(row.created_at),
  };
}

export class ReleasesRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async createRelease(input: CreateReleaseInput): Promise<Release> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    const manifest = input.manifest ?? null;
    await this.#db.query(
      `INSERT INTO releases
        (id, site_id, page_revisions, theme_snapshot, build_ref, manifest, author, note, basis_release_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        input.siteId,
        toJsonParam(input.pageRevisions),
        toJsonParam(input.themeSnapshot),
        input.buildRef,
        manifest === null ? null : toJsonParam(manifest),
        toJsonParam(input.author),
        input.note,
        input.basisReleaseId,
        createdAt,
      ],
    );
    return {
      id,
      siteId: input.siteId,
      pageRevisions: input.pageRevisions,
      themeSnapshot: input.themeSnapshot,
      buildRef: input.buildRef,
      manifest,
      author: input.author,
      note: input.note,
      basisReleaseId: input.basisReleaseId,
      createdAt,
    };
  }

  // Atomic activation (E2): the build reference and the active-release row are
  // written in one transaction. A crash before this call leaves the previous
  // release serving and the new release inactive (harmless orphan); a crash
  // after it never sees a half-activated release.
  async activateRelease(input: ActivateReleaseInput): Promise<void> {
    const now = new Date().toISOString();
    await this.#db.withTransaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(
        `UPDATE releases SET build_ref = $2
         WHERE id = $1 AND build_ref IS NULL
         RETURNING id`,
        [input.releaseId, input.buildRef],
      );
      if (updated.rows.length === 0) {
        throw new SenifyError("conflict", `Release "${input.releaseId}" is already finalized`, {
          field: "releaseId",
        });
      }
      await tx.query(
        `INSERT INTO active_releases (site_id, release_id, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (site_id) DO UPDATE
           SET release_id = EXCLUDED.release_id, updated_at = EXCLUDED.updated_at`,
        [input.siteId, input.releaseId, now],
      );
    });
  }

  async finalizeRelease(input: FinalizeReleaseInput): Promise<void> {
    const now = new Date().toISOString();
    await this.#db.withTransaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(
        `UPDATE releases SET build_ref = $2, manifest = $3
         WHERE id = $1 AND build_ref IS NULL
         RETURNING id`,
        [input.releaseId, input.buildRef, toJsonParam(input.manifest)],
      );
      if (updated.rows.length === 0) {
        throw new SenifyError("conflict", `Release "${input.releaseId}" is already finalized`, {
          field: "releaseId",
        });
      }
      await tx.query(
        `INSERT INTO active_releases (site_id, release_id, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (site_id) DO UPDATE
           SET release_id = EXCLUDED.release_id, updated_at = EXCLUDED.updated_at`,
        [input.siteId, input.releaseId, now],
      );
    });
  }

  async updateReleaseManifest(id: string, manifest: ReleaseManifest): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `UPDATE releases SET manifest = $2 WHERE id = $1 AND build_ref IS NULL RETURNING id`,
      [id, toJsonParam(manifest)],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("conflict", `Release "${id}" is already finalized`, {
        field: "releaseId",
      });
    }
  }

  async getRelease(id: string): Promise<Release> {
    const result = await this.#db.query<ReleaseRow>(
      `SELECT id, site_id, page_revisions, theme_snapshot, build_ref, manifest, author, note, basis_release_id, created_at
       FROM releases WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Release "${id}" does not exist`, {
        field: "releaseId",
      });
    }
    return mapRelease(row);
  }

  async listReleases(siteId: string, limit = 50): Promise<Release[]> {
    const result = await this.#db.query<ReleaseRow>(
      `SELECT id, site_id, page_revisions, theme_snapshot, build_ref, manifest, author, note, basis_release_id, created_at
       FROM releases WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapRelease);
  }

  async getActiveReleaseId(siteId: string): Promise<string | null> {
    const result = await this.#db.query<{ release_id: string }>(
      `SELECT release_id FROM active_releases WHERE site_id = $1`,
      [siteId],
    );
    return result.rows[0]?.release_id ?? null;
  }

  async attachReleaseBuild(id: string, buildRef: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `UPDATE releases SET build_ref = $2 WHERE id = $1 AND build_ref IS NULL RETURNING id`,
      [id, buildRef],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("conflict", `Release "${id}" is already finalized`, {
        field: "releaseId",
      });
    }
  }
}
