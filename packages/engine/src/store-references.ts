// Design references (T14) of the Store (ADR 0019, P3-2): the reference rows, their profile revisions, the
// analysis jobs and the site assignments. `Store` delegates here. The collection of a card comes from the
// reference library module, which the constructor receives; the module never sees the `Store`.
import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import type { ReferenceLibraryRepository } from "./store-reference-library.ts";
import {
  REFERENCE_ASSIGNMENT_COLUMNS,
  REFERENCE_COLUMNS,
  REFERENCE_COLUMNS_WITH_DOCUMENTS,
  REFERENCE_JOB_COLUMNS,
  REFERENCE_PROFILE_COLUMNS,
  type ReferenceAssignmentRow,
  type ReferenceJobRow,
  type ReferenceProfileRow,
  type ReferenceRow,
  mapReference,
  mapReferenceAssignment,
  mapReferenceJob,
  mapReferenceProfile,
  mapReferenceSummary,
  referenceOrderBy,
} from "./store-reference-mappers.ts";
import { isUniqueViolation, toFiniteNumber, toJson, toJsonParam } from "./store-row-utils.ts";
import {
  EMPTY_REFERENCE_DOCUMENTS,
  type Reference,
  type ReferenceAssignment,
  type ReferenceDocuments,
  type ReferenceEvidence,
  type ReferenceJob,
  type ReferenceJobStatus,
  type ReferenceListSort,
  type ReferenceMethod,
  type ReferenceOrigin,
  type ReferenceProfile,
  type ReferenceProfileRevision,
  type ReferenceProvenance,
  type ReferenceScale,
  type ReferenceSnapshot,
  type ReferenceStatus,
  type ReferenceSummary,
} from "./types.ts";

export type CreateReferenceInput = {
  name: string;
  sourceUrl: string;
  method: ReferenceMethod;
  provenance: ReferenceProvenance;
  origin?: ReferenceOrigin;
  collectionId?: string | null;
  note?: string | null;
  imageRecipe?: string | null;
  heroUsage?: string | null;
  family?: string | null;
  documents?: ReferenceDocuments;
  // Manually stored references are ready on arrival: there is no pipeline.
  status?: ReferenceStatus;
  stage?: string;
  progress?: number;
};

export type ReferencePatch = {
  name?: string;
  sourceUrl?: string;
  status?: ReferenceStatus;
  stage?: string;
  progress?: number;
  failureReason?: string | null;
  families?: string[];
  vocabulary?: string[];
  styleBrief?: string;
  snapshots?: ReferenceSnapshot[];
  provenance?: ReferenceProvenance;
  origin?: ReferenceOrigin;
  collectionId?: string | null;
  note?: string | null;
  imageRecipe?: string | null;
  heroUsage?: string | null;
  family?: string | null;
  documents?: ReferenceDocuments;
};

export type CreateReferenceProfileRevisionInput = {
  referenceId: string;
  profile: ReferenceProfile;
  evidence: ReferenceEvidence[];
  provenance: ReferenceProvenance;
  author: Author;
  note: string | null;
};

export type CreateReferenceJobInput = {
  referenceId: string;
  maxAttempts: number;
  // Analysis input that must survive a retry (e.g. the snapshot fallback).
  payload?: Record<string, unknown> | null;
};

export type UpdateReferenceJobInput = {
  id: string;
  status: ReferenceJobStatus;
  stage: string;
  progress: number;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  finishedAt: string | null;
};

export type UpsertReferenceAssignmentInput = {
  siteId: string;
  referenceId: string;
  scales: ReferenceScale[];
  priority: number;
};

export type DeleteReferenceAssignmentInput = {
  siteId: string;
  referenceId: string;
};

export type ReferenceSearchHit = {
  reference: ReferenceSummary;
  documents: ReferenceDocuments;
  weight: number;
};

export type ReferenceDuplicate = {
  reference: ReferenceSummary;
  duplicateOf: ReferenceSummary;
  reason: string;
};

export class ReferencesRepository {
  readonly #db: Db;
  readonly #referenceLibrary: ReferenceLibraryRepository;

  constructor(db: Db, referenceLibrary: ReferenceLibraryRepository) {
    this.#db = db;
    this.#referenceLibrary = referenceLibrary;
  }

  async createReference(input: CreateReferenceInput): Promise<Reference> {
    const now = new Date().toISOString();
    const id = newEntityId();
    await this.#db.query(
      `INSERT INTO design_references
        (id, name, source_url, method, status, stage, progress, failure_reason,
         families, vocabulary, style_brief, snapshots, provenance, created_at, updated_at,
         collection_id, note, image_recipe, hero_usage, family, origin, documents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL,
         '[]', '[]', '', '[]', $8, $9, $9, $10, $11, $12, $13, NULL, $14, $15)`,
      [
        id,
        input.name,
        input.sourceUrl,
        input.method,
        input.status ?? "analyzing",
        input.stage ?? "governance",
        input.progress ?? 0,
        toJsonParam(input.provenance),
        now,
        input.collectionId ?? null,
        input.note ?? null,
        input.imageRecipe ?? null,
        input.heroUsage ?? null,
        input.origin ?? "analysis",
        toJsonParam(input.documents ?? {}),
      ],
    );
    return this.getReference(id);
  }

  async getReference(id: string): Promise<Reference> {
    const result = await this.#db.query<ReferenceRow>(
      `SELECT ${REFERENCE_COLUMNS_WITH_DOCUMENTS} FROM design_references WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Reference "${id}" does not exist`, {
        field: "referenceId",
        suggestion: "Use list_references to find an existing reference id.",
      });
    }
    const usage = await this.#referenceUsage();
    const collection =
      row.collection_id === null || row.collection_id === undefined
        ? null
        : await this.#referenceLibrary.findReferenceCollection(row.collection_id);
    return mapReference(
      row,
      await this.getLatestReferenceProfile(id),
      usage.get(id) ?? [],
      collection,
    );
  }

  // The card list of the library: newest first by default, "Name A-Z" optional.
  async listReferences(
    options: { sort?: ReferenceListSort } = {},
  ): Promise<ReferenceSummary[]> {
    const result = await this.#db.query<ReferenceRow>(
      `SELECT ${REFERENCE_COLUMNS} FROM design_references
       ORDER BY ${referenceOrderBy(options.sort)}`,
    );
    const usage = await this.#referenceUsage();
    const revisions = await this.#db.query<{ reference_id: string; revision: unknown }>(
      `SELECT reference_id, MAX(revision) AS revision FROM reference_profiles
       GROUP BY reference_id`,
    );
    const revisionByReference = new Map(
      revisions.rows.map((row) => [row.reference_id, toFiniteNumber(row.revision, "revision")]),
    );
    const collections = await this.#referenceLibrary.referenceCollections();
    return result.rows.map((row) => {
      const revision = revisionByReference.get(row.id) ?? 0;
      const collection =
        row.collection_id === null || row.collection_id === undefined
          ? null
          : (collections.get(row.collection_id) ?? null);
      return mapReferenceSummary(row, revision, usage.get(row.id) ?? [], collection);
    });
  }

  // Ready reference ids of a collection, oldest first (the collection's order
  // is the set's order — the first entry leads the redesign).
  async listReferenceIdsByCollection(collectionId: string): Promise<string[]> {
    const result = await this.#db.query<{ id: string }>(
      `SELECT id FROM design_references
       WHERE collection_id = $1 AND status = 'ready'
       ORDER BY created_at ASC, id ASC`,
      [collectionId],
    );
    return result.rows.map((row) => row.id);
  }

  // FTS over the library (E24, L42 vault-first): every query token must hit
  // the searchable haystack — name, note, vocabulary, families, collection
  // name AND the verbatim documents (design.md & Co.). The weight ranking is
  // title A / vocabulary+note B / documents C, done on the loaded rows.
  async searchReferences(searchTokens: readonly string[]): Promise<ReferenceSearchHit[]> {
    const tokens = searchTokens
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token !== "");
    if (tokens.length === 0) return [];
    const rows = await this.#db.query<ReferenceRow & { documents: unknown }>(
      `SELECT ${REFERENCE_COLUMNS_WITH_DOCUMENTS} FROM design_references`,
    );
    const usage = await this.#referenceUsage();
    const revisions = await this.#db.query<{ reference_id: string; revision: unknown }>(
      `SELECT reference_id, MAX(revision) AS revision FROM reference_profiles
       GROUP BY reference_id`,
    );
    const revisionByReference = new Map(
      revisions.rows.map((row) => [row.reference_id, toFiniteNumber(row.revision, "revision")]),
    );
    const collections = await this.#referenceLibrary.referenceCollections();
    const hits: { reference: ReferenceSummary; documents: ReferenceDocuments; weight: number }[] = [];
    for (const row of rows.rows) {
      const revision = revisionByReference.get(row.id) ?? 0;
      const collection =
        row.collection_id === null || row.collection_id === undefined
          ? null
          : (collections.get(row.collection_id) ?? null);
      const documents = toJson<ReferenceDocuments>(row.documents ?? EMPTY_REFERENCE_DOCUMENTS);
      const haystacks = {
        a: [row.name].join(" ").toLowerCase(),
        b: [
          row.note ?? "",
          ...(toJson<string[]>(row.vocabulary) ?? []),
          ...(toJson<string[]>(row.families) ?? []),
          row.family ?? "",
          collection?.name ?? "",
        ]
          .join(" ")
          .toLowerCase(),
        c: [documents.design ?? "", documents.guidelines ?? "", documents.components ?? ""]
          .join(" ")
          .toLowerCase(),
      };
      let weight = 0;
      let all = true;
      for (const token of tokens) {
        if (haystacks.a.includes(token)) weight += 4;
        else if (haystacks.b.includes(token)) weight += 2;
        else if (haystacks.c.includes(token)) weight += 1;
        else {
          all = false;
          break;
        }
      }
      if (!all) continue;
      hits.push({
        reference: mapReferenceSummary(row, revision, usage.get(row.id) ?? [], collection),
        documents,
        weight,
      });
    }
    hits.sort(
      (left, right) =>
        right.weight - left.weight ||
        left.reference.name.localeCompare(right.reference.name),
    );
    return hits;
  }

  // Dedupe candidates (E24, L42): two references are near-duplicates when
  // their source urls match (ignoring trailing slash / protocol) or their
  // names normalise to the same string. The newer entry is the duplicate of
  // the older one (the list is newest-first, so the *later* row wins the
  // duplicate role). Document hashes stay out — the same design.md on two
  // urls is a fork, not a duplicate.
  async findDuplicateReferences(): Promise<ReferenceDuplicate[]> {
    const all = (await this.listReferences()).slice().reverse();
    const byUrlKey = new Map<string, ReferenceSummary>();
    const byNameKey = new Map<string, ReferenceSummary>();
    const duplicates: { reference: ReferenceSummary; duplicateOf: ReferenceSummary; reason: string }[] = [];
    for (const reference of all) {
      const urlKey = (reference.sourceUrl ?? "")
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const nameKey = reference.name.toLowerCase().replace(/\s+/g, " ").trim();
      if (urlKey !== "") {
        const existing = byUrlKey.get(urlKey);
        if (existing) {
          duplicates.push({ reference, duplicateOf: existing, reason: "sourceUrl" });
          continue;
        }
        byUrlKey.set(urlKey, reference);
      }
      const existingByName = byNameKey.get(nameKey);
      if (existingByName) {
        duplicates.push({ reference, duplicateOf: existingByName, reason: "name" });
        continue;
      }
      byNameKey.set(nameKey, reference);
    }
    return duplicates;
  }

  async updateReference(id: string, patch: ReferencePatch): Promise<Reference> {
    const current = await this.getReference(id);
    await this.#db.query(
      `UPDATE design_references SET
         status = $2, stage = $3, progress = $4, failure_reason = $5,
         families = $6, vocabulary = $7, style_brief = $8, snapshots = $9, updated_at = $10,
         provenance = $11, name = $12, collection_id = $13, note = $14, image_recipe = $15,
         hero_usage = $16, family = $17, origin = $18, documents = $19, source_url = $20
       WHERE id = $1`,
      [
        id,
        patch.status ?? current.status,
        patch.stage ?? current.stage,
        patch.progress ?? current.progress,
        patch.failureReason === undefined ? current.failureReason : patch.failureReason,
        toJsonParam(patch.families ?? current.families),
        toJsonParam(patch.vocabulary ?? current.vocabulary),
        patch.styleBrief ?? current.styleBrief,
        toJsonParam(patch.snapshots ?? current.snapshots),
        new Date().toISOString(),
        toJsonParam(patch.provenance ?? current.provenance),
        patch.name ?? current.name,
        patch.collectionId === undefined ? current.collectionId : patch.collectionId,
        patch.note === undefined ? current.note : patch.note,
        patch.imageRecipe === undefined ? current.imageRecipe : patch.imageRecipe,
        patch.heroUsage === undefined ? current.heroUsage : patch.heroUsage,
        patch.family === undefined ? current.family : patch.family,
        patch.origin ?? current.origin,
        toJsonParam(patch.documents ?? current.documents),
        patch.sourceUrl ?? current.sourceUrl,
      ],
    );
    return this.getReference(id);
  }

  async deleteReference(id: string): Promise<void> {
    await this.getReference(id);
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM reference_profiles WHERE reference_id = $1`, [id]);
      await tx.query(`DELETE FROM reference_jobs WHERE reference_id = $1`, [id]);
      await tx.query(`DELETE FROM reference_assignments WHERE reference_id = $1`, [id]);
      await tx.query(`DELETE FROM design_references WHERE id = $1`, [id]);
    });
  }

  async createReferenceProfileRevision(
    input: CreateReferenceProfileRevisionInput,
  ): Promise<ReferenceProfileRevision> {
    await this.getReference(input.referenceId);
    const next = await this.#db.query<{ revision: unknown }>(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM reference_profiles
       WHERE reference_id = $1`,
      [input.referenceId],
    );
    const revision = toFiniteNumber(next.rows[0]?.revision ?? 1, "revision");
    const result = await this.#db.query<ReferenceProfileRow>(
      `INSERT INTO reference_profiles
        (id, reference_id, revision, profile, evidence, provenance, author, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${REFERENCE_PROFILE_COLUMNS}`,
      [
        newEntityId(),
        input.referenceId,
        revision,
        toJsonParam(input.profile),
        toJsonParam(input.evidence),
        toJsonParam(input.provenance),
        toJsonParam(input.author),
        input.note,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Reference profile insert returned no row");
    return mapReferenceProfile(row);
  }

  async getLatestReferenceProfile(
    referenceId: string,
  ): Promise<ReferenceProfileRevision | null> {
    const result = await this.#db.query<ReferenceProfileRow>(
      `SELECT ${REFERENCE_PROFILE_COLUMNS} FROM reference_profiles
       WHERE reference_id = $1 ORDER BY revision DESC, id DESC LIMIT 1`,
      [referenceId],
    );
    const row = result.rows[0];
    return row ? mapReferenceProfile(row) : null;
  }

  async listReferenceProfileRevisions(
    referenceId: string,
  ): Promise<ReferenceProfileRevision[]> {
    const result = await this.#db.query<ReferenceProfileRow>(
      `SELECT ${REFERENCE_PROFILE_COLUMNS} FROM reference_profiles
       WHERE reference_id = $1 ORDER BY revision DESC, id DESC`,
      [referenceId],
    );
    return result.rows.map(mapReferenceProfile);
  }

  async createReferenceJob(input: CreateReferenceJobInput): Promise<ReferenceJob> {
    const now = new Date().toISOString();
    const result = await this.#db.query<ReferenceJobRow>(
      `INSERT INTO reference_jobs
        (id, reference_id, status, stage, progress, attempts, max_attempts,
         next_attempt_at, last_error, created_at, updated_at, finished_at, payload)
       VALUES ($1, $2, 'queued', 'queued', 0, 0, $3, $4, NULL, $4, $4, NULL, $5)
       RETURNING ${REFERENCE_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.referenceId,
        input.maxAttempts,
        now,
        input.payload === undefined || input.payload === null
          ? null
          : toJsonParam(input.payload),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Reference job insert returned no row");
    return mapReferenceJob(row);
  }

  // The stored analysis input (snapshot fallback) for a queued job.
  async getReferenceJobPayload(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.#db.query<{ payload: unknown }>(
      `SELECT payload FROM reference_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || row.payload === null || row.payload === undefined) return null;
    return toJson<Record<string, unknown>>(row.payload);
  }

  async getReferenceJob(id: string): Promise<ReferenceJob> {
    const result = await this.#db.query<ReferenceJobRow>(
      `SELECT ${REFERENCE_JOB_COLUMNS} FROM reference_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Reference job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapReferenceJob(row);
  }

  // Jobs that are due: queued and past their next attempt time.
  async listDueReferenceJobs(now: string, limit = 20): Promise<ReferenceJob[]> {
    const result = await this.#db.query<ReferenceJobRow>(
      `SELECT ${REFERENCE_JOB_COLUMNS} FROM reference_jobs
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapReferenceJob);
  }

  async updateReferenceJob(input: UpdateReferenceJobInput): Promise<ReferenceJob> {
    const result = await this.#db.query<ReferenceJobRow>(
      `UPDATE reference_jobs SET
         status = $2, stage = $3, progress = $4, attempts = $5,
         next_attempt_at = $6, last_error = $7, finished_at = $8, updated_at = $9
       WHERE id = $1 RETURNING ${REFERENCE_JOB_COLUMNS}`,
      [
        input.id,
        input.status,
        input.stage,
        input.progress,
        input.attempts,
        input.nextAttemptAt,
        input.lastError,
        input.finishedAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Reference job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapReferenceJob(row);
  }

  async upsertReferenceAssignment(
    input: UpsertReferenceAssignmentInput,
  ): Promise<ReferenceAssignment> {
    await this.getReference(input.referenceId);
    const now = new Date().toISOString();
    try {
      const result = await this.#db.query<ReferenceAssignmentRow>(
        `INSERT INTO reference_assignments
          (id, site_id, reference_id, scales, priority, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING ${REFERENCE_ASSIGNMENT_COLUMNS}`,
        [
          newEntityId(),
          input.siteId,
          input.referenceId,
          toJsonParam(input.scales),
          input.priority,
          now,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Reference assignment insert returned no row");
      return mapReferenceAssignment(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const result = await this.#db.query<ReferenceAssignmentRow>(
        `UPDATE reference_assignments SET scales = $3, priority = $4, updated_at = $5
         WHERE site_id = $1 AND reference_id = $2
         RETURNING ${REFERENCE_ASSIGNMENT_COLUMNS}`,
        [input.siteId, input.referenceId, toJsonParam(input.scales), input.priority, now],
      );
      const row = result.rows[0];
      if (!row) throw error;
      return mapReferenceAssignment(row);
    }
  }

  async listReferenceAssignments(siteId: string): Promise<ReferenceAssignment[]> {
    const result = await this.#db.query<ReferenceAssignmentRow>(
      `SELECT ${REFERENCE_ASSIGNMENT_COLUMNS} FROM reference_assignments
       WHERE site_id = $1 ORDER BY priority ASC, created_at ASC, id ASC`,
      [siteId],
    );
    return result.rows.map(mapReferenceAssignment);
  }

  async deleteReferenceAssignment(input: DeleteReferenceAssignmentInput): Promise<boolean> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM reference_assignments WHERE site_id = $1 AND reference_id = $2 RETURNING id`,
      [input.siteId, input.referenceId],
    );
    return result.rows.length > 0;
  }

  async countReferenceAssignments(referenceId: string): Promise<number> {
    const result = await this.#db.query<{ total: unknown }>(
      `SELECT COUNT(*) AS total FROM reference_assignments WHERE reference_id = $1`,
      [referenceId],
    );
    return toFiniteNumber(result.rows[0]?.total ?? 0, "total");
  }

  async #referenceUsage(): Promise<Map<string, string[]>> {
    const result = await this.#db.query<{ reference_id: string; site_id: string }>(
      `SELECT reference_id, site_id FROM reference_assignments
       ORDER BY site_id ASC`,
    );
    const usage = new Map<string, string[]>();
    for (const row of result.rows) {
      const sites = usage.get(row.reference_id) ?? [];
      sites.push(row.site_id);
      usage.set(row.reference_id, sites);
    }
    return usage;
  }
}
