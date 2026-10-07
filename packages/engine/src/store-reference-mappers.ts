// Row types and mappers for the reference library: references, collections, settings, profiles, jobs and assignments (P3-2, moved out of store.ts).
import {
  type Reference,
  type ReferenceAssignment,
  type ReferenceCollection,
  type ReferenceCollectionExample,
  type ReferenceDna,
  type ReferenceDocuments,
  type ReferenceEvidence,
  type ReferenceJob,
  type ReferenceJobStatus,
  type ReferenceListSort,
  type ReferenceMethod,
  type ReferenceProfile,
  type ReferenceProfileRevision,
  type ReferenceProvenance,
  type ReferenceScale,
  type ReferenceSettings,
  type ReferenceSnapshot,
  type ReferenceStatus,
  type ReferenceSummary,
} from "./types.ts";
import { selectCardSnapshot } from "./references-library.ts";
import { toBoolean, toFiniteNumber, toIso, toJson } from "./store-row-utils.ts";

// ------------------------------------------------------------ references (T14)

export const REFERENCE_COLUMNS =
  "id, name, source_url, method, status, stage, progress, failure_reason, families, vocabulary, style_brief, snapshots, provenance, created_at, updated_at, collection_id, note, image_recipe, hero_usage, family, origin";

// The documents are tens of kilobytes each: the card list never selects them,
// only the detail view reads them along with the row.
export const REFERENCE_COLUMNS_WITH_DOCUMENTS = `${REFERENCE_COLUMNS}, documents`;

export const REFERENCE_COLLECTION_COLUMNS =
  "id, name, description, deploy_for, vocabulary, risk, accent, image_style, recognize, examples, warning, kind, external_id, position, created_at, updated_at";

export const REFERENCE_SETTINGS_COLUMNS = "dna, include_dna, overrides, updated_at";

export function referenceOrderBy(sort: ReferenceListSort | undefined): string {
  return sort === "name"
    ? "lower(name) ASC, id ASC"
    : "created_at DESC, id DESC";
}

export const REFERENCE_PROFILE_COLUMNS =
  "id, reference_id, revision, profile, evidence, provenance, author, note, created_at";

export const REFERENCE_JOB_COLUMNS =
  "id, reference_id, status, stage, progress, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, finished_at";

export const REFERENCE_ASSIGNMENT_COLUMNS =
  "id, site_id, reference_id, scales, priority, created_at, updated_at";

export type ReferenceRow = {
  id: string;
  name: string;
  source_url: string;
  method: string;
  status: string;
  stage: string;
  progress: unknown;
  failure_reason: unknown;
  families: unknown;
  vocabulary: unknown;
  style_brief: string;
  snapshots: unknown;
  provenance: unknown;
  created_at: unknown;
  updated_at: unknown;
  collection_id: string | null;
  note: unknown;
  image_recipe: unknown;
  hero_usage: unknown;
  family: unknown;
  origin: unknown;
  // Only the detail view selects the column.
  documents?: unknown;
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// Imported documents are a JSONB object with three optional texts; a row from
// before the column exists reads as an empty object.
function mapReferenceDocuments(value: unknown): ReferenceDocuments {
  const parsed = toJson<Partial<Record<keyof ReferenceDocuments, unknown>>>(value);
  return {
    design: optionalText(parsed?.design),
    guidelines: optionalText(parsed?.guidelines),
    components: optionalText(parsed?.components),
  };
}

// Rows written before the library fields existed carry neither a collection nor
// an origin: they are analysed references.
export function mapReferenceSummary(
  row: ReferenceRow,
  revision: number,
  usedInProjects: string[],
  collection: ReferenceCollection | null = null,
): ReferenceSummary {
  const snapshots = toJson<ReferenceSnapshot[]>(row.snapshots);
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    method: row.method as ReferenceMethod,
    origin: row.origin === "manual" ? "manual" : "analysis",
    status: row.status as ReferenceStatus,
    stage: row.stage,
    progress: toFiniteNumber(row.progress, "progress"),
    failureReason: typeof row.failure_reason === "string" ? row.failure_reason : null,
    families: toJson<string[]>(row.families),
    vocabulary: toJson<string[]>(row.vocabulary),
    styleBrief: row.style_brief,
    snapshots,
    cardSnapshot: selectCardSnapshot(snapshots),
    provenance: toJson<ReferenceProvenance>(row.provenance),
    collectionId: collection?.id ?? optionalText(row.collection_id),
    collection,
    note: optionalText(row.note),
    imageRecipe: optionalText(row.image_recipe),
    heroUsage: optionalText(row.hero_usage),
    family: optionalText(row.family),
    revision,
    usedInProjects,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapReference(
  row: ReferenceRow,
  profileRevision: ReferenceProfileRevision | null,
  usedInProjects: string[],
  collection: ReferenceCollection | null = null,
): Reference {
  return {
    ...mapReferenceSummary(row, profileRevision?.revision ?? 0, usedInProjects, collection),
    documents: mapReferenceDocuments(row.documents),
    profile: profileRevision?.profile ?? null,
    evidence: profileRevision?.evidence ?? [],
  };
}

export type ReferenceCollectionRow = {
  id: string;
  name: string;
  description: string;
  deploy_for: string;
  vocabulary: unknown;
  risk: string;
  accent: string;
  image_style: string;
  recognize: unknown;
  examples: unknown;
  warning: unknown;
  kind: string;
  external_id: unknown;
  position: unknown;
  created_at: unknown;
  updated_at: unknown;
};

export function mapReferenceCollection(
  row: ReferenceCollectionRow,
  referenceCount: number,
): ReferenceCollection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    deployFor: row.deploy_for,
    vocabulary: toJson<string[]>(row.vocabulary),
    risk: row.risk,
    accent: row.accent,
    imageStyle: row.image_style,
    recognize: toJson<string[]>(row.recognize),
    examples: toJson<ReferenceCollectionExample[]>(row.examples),
    warning: typeof row.warning === "string" && row.warning !== "" ? row.warning : null,
    kind: row.kind === "style" ? "style" : "collection",
    externalId: optionalText(row.external_id),
    position: toFiniteNumber(row.position, "position"),
    referenceCount,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export type ReferenceSettingsRow = {
  dna: unknown;
  include_dna: unknown;
  overrides: string;
  updated_at: unknown;
};

export function mapReferenceSettings(row: ReferenceSettingsRow): ReferenceSettings {
  const dna = toJson<Partial<ReferenceDna>>(row.dna);
  return {
    dna: {
      name: typeof dna.name === "string" ? dna.name : "",
      description: typeof dna.description === "string" ? dna.description : "",
      constants: Array.isArray(dna.constants) ? dna.constants : [],
      never: Array.isArray(dna.never) ? dna.never : [],
    },
    preferences: {
      includeDna: toBoolean(row.include_dna),
      overrides: typeof row.overrides === "string" ? row.overrides : "",
    },
    updatedAt: toIso(row.updated_at),
  };
}

export function defaultReferenceSettings(): ReferenceSettings {
  return {
    dna: { name: "", description: "", constants: [], never: [] },
    preferences: { includeDna: false, overrides: "" },
    updatedAt: new Date().toISOString(),
  };
}

export type ReferenceProfileRow = {
  id: string;
  reference_id: string;
  revision: unknown;
  profile: unknown;
  evidence: unknown;
  provenance: unknown;
  author: unknown;
  note: unknown;
  created_at: unknown;
};

export function mapReferenceProfile(row: ReferenceProfileRow): ReferenceProfileRevision {
  return {
    id: row.id,
    referenceId: row.reference_id,
    revision: toFiniteNumber(row.revision, "revision"),
    profile: toJson<ReferenceProfile>(row.profile),
    evidence: toJson<ReferenceEvidence[]>(row.evidence),
    provenance: toJson<ReferenceProvenance>(row.provenance),
    author: toJson<ReferenceProfileRevision["author"]>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: toIso(row.created_at),
  };
}

export type ReferenceJobRow = {
  id: string;
  reference_id: string;
  status: string;
  stage: string;
  progress: unknown;
  attempts: unknown;
  max_attempts: unknown;
  next_attempt_at: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  finished_at: unknown;
};

export function mapReferenceJob(row: ReferenceJobRow): ReferenceJob {
  return {
    id: row.id,
    referenceId: row.reference_id,
    status: row.status as ReferenceJobStatus,
    stage: row.stage,
    progress: toFiniteNumber(row.progress, "progress"),
    attempts: toFiniteNumber(row.attempts, "attempts"),
    maxAttempts: toFiniteNumber(row.max_attempts, "max_attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    finishedAt:
      row.finished_at === null || row.finished_at === undefined ? null : toIso(row.finished_at),
  };
}

export type ReferenceAssignmentRow = {
  id: string;
  site_id: string;
  reference_id: string;
  scales: unknown;
  priority: unknown;
  created_at: unknown;
  updated_at: unknown;
};

export function mapReferenceAssignment(row: ReferenceAssignmentRow): ReferenceAssignment {
  return {
    id: row.id,
    siteId: row.site_id,
    referenceId: row.reference_id,
    scales: toJson<ReferenceScale[]>(row.scales),
    priority: toFiniteNumber(row.priority, "priority"),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
