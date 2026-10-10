// Entries of the Store (ADR 0019): the entries of a collection with their version snapshots and slug redirects. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { entryConflictError } from "./content-contract.ts";
import {
  ENTRY_COLUMNS,
  type EntryRedirectRow,
  type EntryRow,
  type EntryVersionRow,
  mapEntry,
  mapEntryRedirect,
  mapEntryVersion,
} from "./store-record-mappers.ts";
import { toFiniteNumber, toJsonParam } from "./store-row-utils.ts";
import type { Author } from "@senify/section-sdk";
import type {
  CellValue,
  Entry,
  EntryRedirect,
  EntryStatus,
  EntryVersion,
} from "./types.ts";

export type ListEntriesFilter = {
  siteId: string;
  collectionId?: string;
  status?: EntryStatus;
  trashed?: boolean;
  searchTokens?: readonly string[];
  limit?: number;
};

export type CreateEntryInput = {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: EntryStatus;
  cells: Record<string, CellValue>;
  author: Author;
  searchText: string;
  publishedAt: string | null;
  scheduledAt: string | null;
};

export type UpdateEntryRowInput = {
  entryId: string;
  expectedVersion: number;
  changes: {
    slug: string;
    status: EntryStatus;
    cells: Record<string, CellValue>;
    activeVersionId: string | null;
    author: Author;
    searchText: string;
    publishedAt: string | null;
    scheduledAt: string | null;
    updatedAt: string;
  };
};

export type CreateEntryVersionInput = {
  id: string;
  entryId: string;
  siteId: string;
  versionNumber: number;
  cells: Record<string, CellValue>;
  slug: string;
  status: EntryStatus;
  author: Author;
};

export type CreateEntryRedirectInput = {
  id: string;
  siteId: string;
  collectionId: string;
  fromPath: string;
  toPath: string;
};

export class EntriesRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async listEntries(filter: ListEntriesFilter): Promise<Entry[]> {
    const params: unknown[] = [filter.siteId];
    let sql = `SELECT ${ENTRY_COLUMNS} FROM entries
      WHERE site_id = $1 AND deleted_at IS ${filter.trashed === true ? "NOT NULL" : "NULL"}`;
    if (filter.collectionId !== undefined) {
      params.push(filter.collectionId);
      sql += ` AND collection_id = $${params.length}`;
    }
    if (filter.status !== undefined) {
      params.push(filter.status);
      sql += ` AND status = $${params.length}`;
    }
    // Every query token must appear somewhere in the haystack; the ranking
    // (title A / slug B / body C) happens on the loaded rows.
    for (const token of filter.searchTokens ?? []) {
      params.push(`%${token}%`);
      sql += ` AND search_text LIKE $${params.length}`;
    }
    params.push(Math.max(1, Math.min(500, filter.limit ?? 200)));
    sql += ` ORDER BY updated_at DESC, id DESC LIMIT $${params.length}`;
    const result = await this.#db.query<EntryRow>(sql, params);
    return result.rows.map(mapEntry);
  }

  async getEntry(id: string): Promise<Entry> {
    const result = await this.#db.query<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Entry "${id}" does not exist`, {
        field: "entryId",
        suggestion: "List the entries of the collection with list_entries.",
      });
    }
    return mapEntry(row);
  }

  // Slug uniqueness is checked in code (a trashed entry frees its slug again);
  // the unique index would forbid that.
  async findLiveEntryBySlug(
    collectionId: string,
    slug: string,
    exceptId?: string,
  ): Promise<Entry | undefined> {
    const params: unknown[] = [collectionId, slug];
    let sql = `SELECT ${ENTRY_COLUMNS} FROM entries
       WHERE collection_id = $1 AND slug = $2 AND deleted_at IS NULL`;
    if (exceptId !== undefined) {
      params.push(exceptId);
      sql += ` AND id <> $${params.length}`;
    }
    sql += ` LIMIT 1`;
    const result = await this.#db.query<EntryRow>(sql, params);
    const row = result.rows[0];
    return row ? mapEntry(row) : undefined;
  }

  // The live route follows the active version: a draft rename only breaks the
  // published URL once the rename itself is published.
  async findPublishedEntryBySlug(
    collectionId: string,
    slug: string,
  ): Promise<Entry | undefined> {
    const result = await this.#db.query<EntryRow>(
      `SELECT e.id, e.site_id, e.collection_id, e.slug, e.status, e.cells,
              e.active_version_id, e.version, e.author, e.published_at,
              e.scheduled_at, e.deleted_at, e.created_at, e.updated_at
       FROM entries e
       LEFT JOIN entry_versions v ON v.id = e.active_version_id
       WHERE e.collection_id = $1
         AND e.deleted_at IS NULL
         AND e.status = 'published'
         AND (e.slug = $2 OR v.slug = $2)
       ORDER BY e.updated_at DESC, e.id DESC LIMIT 1`,
      [collectionId, slug],
    );
    const row = result.rows[0];
    return row ? mapEntry(row) : undefined;
  }

  async createEntry(input: CreateEntryInput): Promise<Entry> {
    const now = new Date().toISOString();
    const result = await this.#db.query<EntryRow>(
      `INSERT INTO entries
        (id, site_id, collection_id, slug, status, cells, active_version_id,
         version, author, search_text, published_at, scheduled_at, deleted_at,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, 1, $7, $8, $9, $10, NULL, $11, $11)
       RETURNING ${ENTRY_COLUMNS}`,
      [
        input.id,
        input.siteId,
        input.collectionId,
        input.slug,
        input.status,
        toJsonParam(input.cells),
        toJsonParam(input.author),
        input.searchText,
        input.publishedAt,
        input.scheduledAt,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Entry insert returned no row");
    return mapEntry(row);
  }

  async updateEntryRow(input: UpdateEntryRowInput): Promise<number> {
    const { changes } = input;
    const result = await this.#db.query<{ version: unknown }>(
      `UPDATE entries SET
         slug = $3, status = $4, cells = $5, active_version_id = $6, author = $7,
         search_text = $8, published_at = $9, scheduled_at = $10,
         version = version + 1, updated_at = $11
       WHERE id = $1 AND version = $2
       RETURNING version`,
      [
        input.entryId,
        input.expectedVersion,
        changes.slug,
        changes.status,
        toJsonParam(changes.cells),
        changes.activeVersionId,
        toJsonParam(changes.author),
        changes.searchText,
        changes.publishedAt,
        changes.scheduledAt,
        changes.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      const current = await this.#db.query<{ version: unknown }>(
        `SELECT version FROM entries WHERE id = $1`,
        [input.entryId],
      );
      const currentRow = current.rows[0];
      if (!currentRow) {
        throw new SenifyError("not_found", `Entry "${input.entryId}" does not exist`, {
          field: "entryId",
        });
      }
      throw entryConflictError(
        input.expectedVersion,
        toFiniteNumber(currentRow.version, "version"),
      );
    }
    return toFiniteNumber(row.version, "version");
  }

  // Trash and restore are state flips, not content writes: no version bump.
  async setEntryDeleted(id: string, deletedAt: string | null): Promise<Entry> {
    const result = await this.#db.query<EntryRow>(
      `UPDATE entries SET deleted_at = $2, updated_at = $3
       WHERE id = $1 RETURNING ${ENTRY_COLUMNS}`,
      [id, deletedAt, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Entry "${id}" does not exist`, {
        field: "entryId",
      });
    }
    return mapEntry(row);
  }

  async createEntryVersion(input: CreateEntryVersionInput): Promise<EntryVersion> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<EntryVersionRow>(
      `INSERT INTO entry_versions
        (id, entry_id, site_id, version_number, cells, slug, status, author, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, entry_id, site_id, version_number, cells, slug, status, author, created_at`,
      [
        input.id,
        input.entryId,
        input.siteId,
        input.versionNumber,
        toJsonParam(input.cells),
        input.slug,
        input.status,
        toJsonParam(input.author),
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Entry version insert returned no row");
    return mapEntryVersion(row);
  }

  async getEntryVersion(id: string): Promise<EntryVersion> {
    const result = await this.#db.query<EntryVersionRow>(
      `SELECT id, entry_id, site_id, version_number, cells, slug, status, author, created_at
       FROM entry_versions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Entry version "${id}" does not exist`, {
        field: "versionId",
        suggestion: "Read the timeline with GET /api/entries/:id/versions.",
      });
    }
    return mapEntryVersion(row);
  }

  async listEntryVersions(entryId: string, limit = 50): Promise<EntryVersion[]> {
    const result = await this.#db.query<EntryVersionRow>(
      `SELECT id, entry_id, site_id, version_number, cells, slug, status, author, created_at
       FROM entry_versions WHERE entry_id = $1
       ORDER BY version_number DESC, id DESC LIMIT $2`,
      [entryId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapEntryVersion);
  }

  async maxEntryVersionNumber(entryId: string): Promise<number> {
    const result = await this.#db.query<{ max_version: unknown }>(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM entry_versions WHERE entry_id = $1`,
      [entryId],
    );
    return toFiniteNumber(result.rows[0]?.max_version ?? 0, "max_version");
  }

  async deleteEntryVersions(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    await this.#db.query(
      `DELETE FROM entry_versions WHERE id IN (${placeholders})`,
      [...ids],
    );
  }

  async deleteEntryRecord(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM entries WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Entry "${id}" does not exist`, {
        field: "entryId",
      });
    }
  }

  async createEntryRedirect(input: CreateEntryRedirectInput): Promise<EntryRedirect> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<EntryRedirectRow>(
      `INSERT INTO entry_redirects
        (id, site_id, collection_id, from_path, to_path, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, site_id, collection_id, from_path, to_path, created_at`,
      [
        input.id,
        input.siteId,
        input.collectionId,
        input.fromPath,
        input.toPath,
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Entry redirect insert returned no row");
    return mapEntryRedirect(row);
  }

  async findEntryRedirect(
    siteId: string,
    fromPath: string,
  ): Promise<EntryRedirect | undefined> {
    const result = await this.#db.query<EntryRedirectRow>(
      `SELECT id, site_id, collection_id, from_path, to_path, created_at
       FROM entry_redirects WHERE site_id = $1 AND from_path = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [siteId, fromPath],
    );
    const row = result.rows[0];
    return row ? mapEntryRedirect(row) : undefined;
  }

  async deleteEntryRedirect(siteId: string, fromPath: string): Promise<void> {
    await this.#db.query(
      `DELETE FROM entry_redirects WHERE site_id = $1 AND from_path = $2`,
      [siteId, fromPath],
    );
  }

  // Every slug history row of a site: the bake turns them into static redirect
  // files so an old detail path keeps pointing at the new one.
  async listEntryRedirects(siteId: string): Promise<EntryRedirect[]> {
    const result = await this.#db.query<EntryRedirectRow>(
      `SELECT id, site_id, collection_id, from_path, to_path, created_at
       FROM entry_redirects WHERE site_id = $1
       ORDER BY created_at ASC, id ASC`,
      [siteId],
    );
    return result.rows.map(mapEntryRedirect);
  }
}
