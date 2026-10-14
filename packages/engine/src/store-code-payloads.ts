// Imported foreign code of the Store (ADR 0019, ADR 0010): create, list, read, read with bundle and delete a site's code payloads. `Store` delegates here.
import { createHash } from "node:crypto";
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { CODE_PAYLOAD_COLUMNS, type CodePayloadRow, mapCodePayload } from "./store-record-mappers.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type {
  CodePayload,
  CodePayloadKind,
  CodePayloadLicense,
  CodePayloadProvenance,
} from "./types.ts";

export type CreateCodePayloadInput = {
  id: string;
  siteId: string;
  name: string;
  kind: CodePayloadKind;
  bundle: string;
  provenance: CodePayloadProvenance;
  license: CodePayloadLicense;
};

export class CodePayloadsRepository {
  readonly #db: Db;
  readonly #getSite: (siteId: string) => Promise<unknown>;

  constructor(db: Db, getSite: (siteId: string) => Promise<unknown>) {
    this.#db = db;
    this.#getSite = getSite;
  }

  // The bundle arrives already self-contained (the importer's job, ADR-0010
  // §2); the store keeps it verbatim and derives `bytes` and the SHA-256
  // integrity from the very text it stores, so the two can never disagree.
  async createCodePayload(input: CreateCodePayloadInput): Promise<CodePayload> {
    await this.#getSite(input.siteId);
    const now = new Date().toISOString();
    const result = await this.#db.query<CodePayloadRow>(
      `INSERT INTO site_code_payloads
        (id, site_id, name, kind, bundle, bytes, integrity, version, provenance, license, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $10)
       RETURNING ${CODE_PAYLOAD_COLUMNS}`,
      [
        input.id,
        input.siteId,
        input.name,
        input.kind,
        input.bundle,
        Buffer.byteLength(input.bundle, "utf8"),
        createHash("sha256").update(input.bundle, "utf8").digest("hex"),
        toJsonParam(input.provenance),
        toJsonParam(input.license),
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Code payload insert returned no row");
    return mapCodePayload(row);
  }

  async listCodePayloads(siteId: string): Promise<CodePayload[]> {
    await this.#getSite(siteId);
    const result = await this.#db.query<CodePayloadRow>(
      `SELECT ${CODE_PAYLOAD_COLUMNS} FROM site_code_payloads WHERE site_id = $1
       ORDER BY created_at DESC, id DESC`,
      [siteId],
    );
    return result.rows.map(mapCodePayload);
  }

  async getCodePayload(id: string): Promise<CodePayload> {
    const result = await this.#db.query<CodePayloadRow>(
      `SELECT ${CODE_PAYLOAD_COLUMNS} FROM site_code_payloads WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Code payload "${id}" does not exist`, {
        field: "payloadId",
        suggestion: "List the site's payloads with `GET /api/sites/:siteId/code-payloads`.",
      });
    }
    return mapCodePayload(row);
  }

  // The bake is the only caller that wants the code itself.
  async getCodePayloadBundle(id: string): Promise<{ payload: CodePayload; bundle: string }> {
    const result = await this.#db.query<CodePayloadRow & { bundle: string }>(
      `SELECT ${CODE_PAYLOAD_COLUMNS}, bundle FROM site_code_payloads WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Code payload "${id}" does not exist`, {
        field: "payloadId",
      });
    }
    return { payload: mapCodePayload(row), bundle: row.bundle };
  }

  async deleteCodePayload(id: string): Promise<CodePayload> {
    const payload = await this.getCodePayload(id);
    await this.#db.query(`DELETE FROM site_code_payloads WHERE id = $1`, [id]);
    return payload;
  }
}
