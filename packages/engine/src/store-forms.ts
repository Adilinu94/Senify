// Form operations of the Store (ADR 0019): the signing secret and the per-bake form snapshots. `Store` delegates here.
import { randomBytes } from "node:crypto";
import { SenifyError } from "@senify/core";
import type { FormSnapshot } from "@senify/renderer";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { mapFormSnapshot, type FormSnapshotRow } from "./store-form-mappers.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type { FormSnapshotRecord } from "./types.ts";

export type SaveFormSnapshotInput = {
  id: string;
  formId: string;
  siteId: string;
  pageId: string;
  nodeId: string;
  pagePath: string;
  sectionType: string;
  snapshot: FormSnapshot;
};

export class FormsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  // The HMAC secret is generated once and lives in its own table so tokens
  // baked into static HTML keep verifying across engine restarts.
  async getOrCreateFormSecret(): Promise<string> {
    const existing = await this.#db.query<{ secret: string }>(
      `SELECT secret FROM form_settings ORDER BY created_at ASC LIMIT 1`,
    );
    const row = existing.rows[0];
    if (row) return row.secret;
    const secret = randomBytes(32).toString("base64url");
    await this.#db.query(
      `INSERT INTO form_settings (id, secret, created_at) VALUES ($1, $2, $3)`,
      [newEntityId(), secret, new Date().toISOString()],
    );
    return secret;
  }

  // A form id is stable per site + page + node; a re-bake keeps it and only
  // writes a new snapshot.
  async resolveFormId(input: {
    siteId: string;
    pageId: string;
    nodeId: string;
  }): Promise<string> {
    const existing = await this.#db.query<{ form_id: string }>(
      `SELECT form_id FROM form_snapshots
       WHERE site_id = $1 AND page_id = $2 AND node_id = $3
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [input.siteId, input.pageId, input.nodeId],
    );
    return existing.rows[0]?.form_id ?? newEntityId();
  }

  async saveFormSnapshot(input: SaveFormSnapshotInput): Promise<FormSnapshotRecord> {
    const result = await this.#db.query<FormSnapshotRow>(
      `INSERT INTO form_snapshots
        (id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at`,
      [
        input.id,
        input.formId,
        input.siteId,
        input.pageId,
        input.nodeId,
        input.pagePath,
        input.sectionType,
        toJsonParam(input.snapshot),
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Form snapshot insert returned no row");
    return mapFormSnapshot(row);
  }

  async getFormSnapshot(id: string): Promise<FormSnapshotRecord> {
    const result = await this.#db.query<FormSnapshotRow>(
      `SELECT id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at
       FROM form_snapshots WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Form snapshot "${id}" does not exist`, {
        field: "formId",
        suggestion: "Re-bake the site so a fresh token is stamped into the page.",
      });
    }
    return mapFormSnapshot(row);
  }

  async getFormSnapshotForForm(
    formId: string,
  ): Promise<FormSnapshotRecord | undefined> {
    const result = await this.#db.query<FormSnapshotRow>(
      `SELECT id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at
       FROM form_snapshots WHERE form_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [formId],
    );
    const row = result.rows[0];
    return row ? mapFormSnapshot(row) : undefined;
  }

  async listFormSnapshots(siteId: string): Promise<FormSnapshotRecord[]> {
    const result = await this.#db.query<FormSnapshotRow>(
      `SELECT id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at
       FROM form_snapshots WHERE site_id = $1
       ORDER BY created_at DESC, id DESC`,
      [siteId],
    );
    return result.rows.map(mapFormSnapshot);
  }
}
