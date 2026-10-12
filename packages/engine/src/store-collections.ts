// Collection schemas of the Store (ADR 0019, T09): list, read, find by slug, create and update the field definitions of a site's collections. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { COLLECTION_COLUMNS, type CollectionRow, mapCollection } from "./store-record-mappers.ts";
import { isUniqueViolation, toJsonParam } from "./store-row-utils.ts";
import type { Collection, FieldDef, SupportsFlag } from "./types.ts";

export type ListCollectionsOptions = { includeDeprecated?: boolean };

export type CollectionUpdate = {
  name: string;
  fields: FieldDef[];
  titleField: string;
  dateField: string | null;
  urlPattern: string | null;
  supports: SupportsFlag[];
  listColumns: string[];
  description: string | null;
  deprecatedAt: string | null;
};

export type CreateCollectionInput = CollectionUpdate & { id: string; siteId: string; slug: string };

export class CollectionsRepository {
  readonly #db: Db;
  readonly #getSite: (siteId: string) => Promise<unknown>;

  constructor(db: Db, getSite: (siteId: string) => Promise<unknown>) {
    this.#db = db;
    this.#getSite = getSite;
  }

  async listCollections(siteId: string, options: ListCollectionsOptions = {}): Promise<Collection[]> {
    await this.#getSite(siteId);
    const result =
      options.includeDeprecated === true
        ? await this.#db.query<CollectionRow>(
            `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE site_id = $1
             ORDER BY created_at ASC, id ASC`,
            [siteId],
          )
        : await this.#db.query<CollectionRow>(
            `SELECT ${COLLECTION_COLUMNS} FROM collections
             WHERE site_id = $1 AND deprecated_at IS NULL
             ORDER BY created_at ASC, id ASC`,
            [siteId],
          );
    return result.rows.map(mapCollection);
  }

  async getCollection(id: string): Promise<Collection> {
    const result = await this.#db.query<CollectionRow>(
      `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Collection "${id}" does not exist`, {
        field: "collectionId",
        suggestion: "List the collections of the site with list_collections.",
      });
    }
    return mapCollection(row);
  }

  async findCollectionBySlug(
    siteId: string,
    slug: string,
  ): Promise<Collection | undefined> {
    const result = await this.#db.query<CollectionRow>(
      `SELECT ${COLLECTION_COLUMNS} FROM collections
       WHERE site_id = $1 AND slug = $2`,
      [siteId, slug],
    );
    const row = result.rows[0];
    return row ? mapCollection(row) : undefined;
  }

  async createCollection(input: CreateCollectionInput): Promise<Collection> {
    const now = new Date().toISOString();
    try {
      const result = await this.#db.query<CollectionRow>(
        `INSERT INTO collections
          (id, site_id, name, slug, fields, title_field, date_field, url_pattern,
           supports, list_columns, description, deprecated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
         RETURNING ${COLLECTION_COLUMNS}`,
        [
          input.id,
          input.siteId,
          input.name,
          input.slug,
          toJsonParam(input.fields),
          input.titleField,
          input.dateField,
          input.urlPattern,
          toJsonParam(input.supports),
          toJsonParam(input.listColumns),
          input.description,
          input.deprecatedAt,
          now,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Collection insert returned no row");
      return mapCollection(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Collection slug "${input.slug}" is already in use on this site`,
          {
            field: "slug",
            suggestion: "Choose a different collection slug.",
          },
        );
      }
      throw error;
    }
  }

  async updateCollection(id: string, next: CollectionUpdate): Promise<Collection> {
    const updatedAt = new Date().toISOString();
    const result = await this.#db.query<CollectionRow>(
      `UPDATE collections SET
         name = $2, fields = $3, title_field = $4, date_field = $5,
         url_pattern = $6, supports = $7, list_columns = $8, description = $9,
         deprecated_at = $10, updated_at = $11
       WHERE id = $1
       RETURNING ${COLLECTION_COLUMNS}`,
      [
        id,
        next.name,
        toJsonParam(next.fields),
        next.titleField,
        next.dateField,
        next.urlPattern,
        toJsonParam(next.supports),
        toJsonParam(next.listColumns),
        next.description,
        next.deprecatedAt,
        updatedAt,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Collection "${id}" does not exist`, {
        field: "collectionId",
      });
    }
    return mapCollection(row);
  }
}
