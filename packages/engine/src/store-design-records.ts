// Design records of the Store (ADR 0019, Fahrplan P2-4, R4): the frozen design reports of a site, written once per measurement. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import type { DesignRecord, DesignRecordStage, DesignReport } from "./design-report.ts";
import { newEntityId } from "./ids.ts";
import { toFiniteNumber, toIso, toJson, toJsonParam } from "./store-row-utils.ts";

type DesignRecordRow = {
  id: string;
  site_id: string;
  stage: string;
  draft_version: unknown;
  theme_version: unknown;
  report: unknown;
  created_at: unknown;
};

function mapDesignRecord(row: DesignRecordRow): DesignRecord {
  if (row.stage !== "publish" && row.stage !== "review") {
    throw new Error(`Stored design record stage is invalid: ${row.stage}`);
  }
  return {
    id: row.id,
    siteId: row.site_id,
    stage: row.stage,
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    themeVersion: toFiniteNumber(row.theme_version, "theme_version"),
    report: toJson<DesignReport>(row.report),
    createdAt: toIso(row.created_at),
  };
}

export type CreateDesignRecordInput = {
  siteId: string;
  stage: DesignRecordStage;
  draftVersion: number;
  themeVersion: number;
  report: DesignReport;
};

export type ListDesignRecordsOptions = { stage?: DesignRecordStage; limit?: number };

export class DesignRecordsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  // Design records (Fahrplan P2-4, R4). Written once, never updated: a
  // measurement of the same site at a later moment is a new record, not a
  // correction of the old one. That is what makes "this release was green" a
  // fact about the release instead of a claim about the present.
  async createDesignRecord(input: CreateDesignRecordInput): Promise<DesignRecord> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<DesignRecordRow>(
      `INSERT INTO design_records
        (id, site_id, stage, draft_version, theme_version, report, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, site_id, stage, draft_version, theme_version, report, created_at`,
      [
        id,
        input.siteId,
        input.stage,
        input.draftVersion,
        input.themeVersion,
        toJsonParam(input.report),
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Design record insert returned no row");
    return mapDesignRecord(row);
  }

  // The newest record per stage, newest first within a stage. `stages` filters
  // the read; without it the caller gets every measurement the site ever had.
  async listDesignRecords(
    siteId: string,
    options: ListDesignRecordsOptions = {},
  ): Promise<DesignRecord[]> {
    const limit = options.limit ?? 20;
    const result =
      options.stage === undefined
        ? await this.#db.query<DesignRecordRow>(
            `SELECT id, site_id, stage, draft_version, theme_version, report, created_at
               FROM design_records WHERE site_id = $1
              ORDER BY created_at DESC, id DESC LIMIT $2`,
            [siteId, limit],
          )
        : await this.#db.query<DesignRecordRow>(
            `SELECT id, site_id, stage, draft_version, theme_version, report, created_at
               FROM design_records WHERE site_id = $1 AND stage = $2
              ORDER BY created_at DESC, id DESC LIMIT $3`,
            [siteId, options.stage, limit],
          );
    return result.rows.map(mapDesignRecord);
  }

  async getDesignRecord(id: string): Promise<DesignRecord> {
    const result = await this.#db.query<DesignRecordRow>(
      `SELECT id, site_id, stage, draft_version, theme_version, report, created_at
         FROM design_records WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Design record "${id}" does not exist`, {
        field: "recordId",
      });
    }
    return mapDesignRecord(row);
  }
}
