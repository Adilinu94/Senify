// Reference library of the Store (ADR 0019): the collections (and style collections) that group design references. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import {
  REFERENCE_COLLECTION_COLUMNS,
  type ReferenceCollectionRow,
  mapReferenceCollection,
} from "./store-reference-mappers.ts";
import { toFiniteNumber, toJsonParam } from "./store-row-utils.ts";
import type {
  ReferenceCollection,
  ReferenceCollectionExample,
  ReferenceCollectionKind,
} from "./types.ts";

export type CreateReferenceCollectionInput = {
  name: string;
  description?: string;
  deployFor?: string;
  vocabulary?: string[];
  risk?: string;
  accent?: string;
  imageStyle?: string;
  recognize?: string[];
  examples?: ReferenceCollectionExample[];
  warning?: string | null;
  kind?: ReferenceCollectionKind;
  externalId?: string | null;
  position?: number;
};

export type ReferenceCollectionPatch = {
  name?: string;
  description?: string;
  deployFor?: string;
  vocabulary?: string[];
  risk?: string;
  accent?: string;
  imageStyle?: string;
  recognize?: string[];
  examples?: ReferenceCollectionExample[];
  warning?: string | null;
  position?: number;
};

export class ReferenceLibraryRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async createReferenceCollection(input: CreateReferenceCollectionInput): Promise<ReferenceCollection> {
    const now = new Date().toISOString();
    const id = newEntityId();
    const result = await this.#db.query<ReferenceCollectionRow>(
      `INSERT INTO reference_collections
        (id, name, description, deploy_for, vocabulary, risk, accent, image_style,
         recognize, examples, warning, kind, external_id, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
       RETURNING ${REFERENCE_COLLECTION_COLUMNS}`,
      [
        id,
        input.name,
        input.description ?? "",
        input.deployFor ?? "",
        toJsonParam(input.vocabulary ?? []),
        input.risk ?? "",
        input.accent ?? "",
        input.imageStyle ?? "",
        toJsonParam(input.recognize ?? []),
        toJsonParam(input.examples ?? []),
        input.warning ?? null,
        input.kind ?? "collection",
        input.externalId ?? null,
        input.position ?? 0,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Reference collection insert returned no row");
    return mapReferenceCollection(row, 0);
  }

  async getReferenceCollection(id: string): Promise<ReferenceCollection> {
    const result = await this.#db.query<ReferenceCollectionRow>(
      `SELECT ${REFERENCE_COLLECTION_COLUMNS} FROM reference_collections WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Collection "${id}" does not exist`, {
        field: "collectionId",
        suggestion:
          "Load the collections with GET /api/reference-collections and use one of their ids.",
      });
    }
    return mapReferenceCollection(row, await this.#referenceCollectionCount(id));
  }

  async listReferenceCollections(
    options: { kind?: ReferenceCollectionKind } = {},
  ): Promise<ReferenceCollection[]> {
    const result = await this.#db.query<ReferenceCollectionRow>(
      `SELECT ${REFERENCE_COLLECTION_COLUMNS} FROM reference_collections
       ${options.kind === undefined ? "" : "WHERE kind = $1"}
       ORDER BY position ASC, name ASC, id ASC`,
      options.kind === undefined ? [] : [options.kind],
    );
    const counts = await this.#referenceCollectionCounts();
    return result.rows.map((row) =>
      mapReferenceCollection(row, counts.get(row.id) ?? 0),
    );
  }

  async updateReferenceCollection(id: string, patch: ReferenceCollectionPatch): Promise<ReferenceCollection> {
    const current = await this.getReferenceCollection(id);
    await this.#db.query(
      `UPDATE reference_collections SET
         name = $2, description = $3, deploy_for = $4, vocabulary = $5, risk = $6,
         accent = $7, image_style = $8, recognize = $9, examples = $10, warning = $11,
         position = $12, updated_at = $13
       WHERE id = $1`,
      [
        id,
        patch.name ?? current.name,
        patch.description ?? current.description,
        patch.deployFor ?? current.deployFor,
        toJsonParam(patch.vocabulary ?? current.vocabulary),
        patch.risk ?? current.risk,
        patch.accent ?? current.accent,
        patch.imageStyle ?? current.imageStyle,
        toJsonParam(patch.recognize ?? current.recognize),
        toJsonParam(patch.examples ?? current.examples),
        patch.warning === undefined ? current.warning : patch.warning,
        patch.position ?? current.position,
        new Date().toISOString(),
      ],
    );
    return this.getReferenceCollection(id);
  }

  // Deleting a collection never deletes references: they fall back to "without
  // collection" and the caller reports how many were affected.
  async deleteReferenceCollection(id: string): Promise<number> {
    await this.getReferenceCollection(id);
    return this.#db.withTransaction(async (tx) => {
      const cleared = await tx.query<{ id: string }>(
        `UPDATE design_references SET collection_id = NULL, updated_at = $2
         WHERE collection_id = $1 RETURNING id`,
        [id, new Date().toISOString()],
      );
      await tx.query(`DELETE FROM reference_collections WHERE id = $1`, [id]);
      return cleared.rows.length;
    });
  }

  // Used by the reference operations of the Store; not part of the Store API.
  async findReferenceCollection(id: string): Promise<ReferenceCollection | null> {
    const result = await this.#db.query<ReferenceCollectionRow>(
      `SELECT ${REFERENCE_COLLECTION_COLUMNS} FROM reference_collections WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return mapReferenceCollection(row, await this.#referenceCollectionCount(id));
  }

  // Used by the reference operations of the Store; not part of the Store API.
  async referenceCollections(): Promise<Map<string, ReferenceCollection>> {
    const collections = await this.listReferenceCollections();
    return new Map(collections.map((collection) => [collection.id, collection]));
  }

  async #referenceCollectionCounts(): Promise<Map<string, number>> {
    const result = await this.#db.query<{ collection_id: string; total: unknown }>(
      `SELECT collection_id, COUNT(*) AS total FROM design_references
       WHERE collection_id IS NOT NULL GROUP BY collection_id`,
    );
    return new Map(
      result.rows.map((row) => [
        row.collection_id,
        toFiniteNumber(row.total, "total"),
      ]),
    );
  }

  async #referenceCollectionCount(id: string): Promise<number> {
    const result = await this.#db.query<{ total: unknown }>(
      `SELECT COUNT(*) AS total FROM design_references WHERE collection_id = $1`,
      [id],
    );
    return toFiniteNumber(result.rows[0]?.total ?? 0, "total");
  }
}
