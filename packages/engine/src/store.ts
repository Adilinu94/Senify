import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import { publishSecretFile, readSecretFile } from "./secrets.ts";
import { normalizeSiteBaseUrl } from "./site-url.ts";
import { RULE_ID_PATTERN } from "@senify/framer-import";
import {
  PAGE_ROOT_TYPE,
  type Author,
  type NodeTree,
} from "@senify/section-sdk";
import type { FormSnapshot } from "@senify/renderer";
import type {
  DesignRecord,
  DesignRecordStage,
  DesignReport,
} from "./design-report.ts";
import type { ReleaseAssetSnapshot } from "./types.ts";
import {
  defaultTheme,
  emitCss,
  mergeThemePatch,
  resolveTheme,
  ThemeSchema,
  validateTheme,
  type Theme,
} from "@senify/tokens";
import {
  STATE_ORDER,
  assertValidCssClassName,
  classKindSelector,
  createAmbientRule,
  createClassRule,
  createScopedRule,
  isSafeRawCss,
  isValidCssSelector,
  normalizeRuleOrder,
  parseStyleRuleRegistry,
  reservedContextIds,
  styleRuleErrors,
  type StyleRule,
} from "@senify/widget-engine";
import type { Db, DbClient, Row } from "./db.ts";
import type { ImportReport } from "./imports-contract.ts";
import { jsonColumns, tableNames } from "./db.ts";
import {
  isRedesignProposalStatus,
  type DirectionCard,
  type DirectionDecision,
  type RedesignProposal,
  type RedesignProposalApplyResult,
  type RedesignProposalBasis,
  type RedesignProposalStatus,
} from "./redesign-proposal-contract.ts";
import { generateToken } from "./auth.ts";
import { selectCardSnapshot } from "./references-library.ts";
import { deriveDesignContract } from "./design-contract.ts";
import { entryConflictError } from "./content-contract.ts";
import { newEntityId, newNodeId } from "./ids.ts";
import {
  assetStorageRef,
  historyStorageRef,
  storedFileName,
  variantStorageRef,
} from "./storage.ts";
import { validateShape } from "./mutations/contract.ts";
import { assertPagePathFormat, draftConflictError } from "./paths.ts";
import {
  agentStyleViolations,
  rawCssViolations,
  styleRuleBags,
  type StyleBag,
} from "./style-fence.ts";
import type { GeneratedVariant } from "./variants.ts";
import {
  IMAGE_CUSTOM_FORMATS,
  IMAGE_FALLBACK_PROVIDERS,
  IMAGE_JOB_STATUSES,
  IMAGE_PROVIDERS,
  REVIEW_STATUSES,
  SITE_PROFILES,
  SMTP_TLS_MODES,
  type ApiToken,
  type Asset,
  type AssetFolder,
  type AssetHistoryEntry,
  type AssetKind,
  type AssetStatus,
  type AssetUpdate,
  type AssetUsage,
  type AssetVariant,
  type AuditEntry,
  type CellValue,
  type CodePayload,
  type CodePayloadKind,
  type CodePayloadLicense,
  type CodePayloadProvenance,
  type Collection,
  type ImportJob,
  type ImportJobSource,
  type ImportJobStatus,
  type ImportReceipt,
  type Deployment,
  type DeploymentStatus,
  type DeployProvider,
  type DeploySettings,
  type EngineSettings,
  type Entry,
  type EntryRedirect,
  type EntryStatus,
  type EntryVersion,
  type FieldDef,
  type FormSnapshotRecord,
  type ImageCustomFormat,
  type ImageFallbackProvider,
  type ImageJob,
  type ImageJobAttempt,
  type ImageJobRequest,
  type ImageJobStatus,
  type ImageProviderName,
  type ImageSettings,
  type McpAuditEntry,
  type NewsletterToken,
  type NewsletterTokenKind,
  type NotificationMessage,
  type NotificationStatus,
  type Page,
  type PageMeta,
  type PageRevision,
  type PageSummary,
  type PageTemplate,
  type Preview,
  type PreviewStatus,
  type ProviderCooldown,
  type ReleaseManifest,
  type Reference,
  type ReferenceAssignment,
  type BakeJob,
  type BakeJobStatus,
  type ReferenceCollection,
  type ReferenceCollectionExample,
  type ReferenceCollectionKind,
  type ReferenceDna,
  type ReferenceDocuments,
  EMPTY_REFERENCE_DOCUMENTS,
  type ReferenceEvidence,
  type ReferenceJob,
  type ReferenceJobStatus,
  type ReferenceListSort,
  type ReferenceMethod,
  type ReferenceOrigin,
  type ReferencePreferences,
  type ReferenceProfile,
  type ReferenceProfileRevision,
  type ReferenceProvenance,
  type ReferenceScale,
  type ReferenceSettings,
  type ReferenceSnapshot,
  type ReferenceStatus,
  type ReferenceSummary,
  type Release,
  type ReleasePageRevision,
  type ReviewComment,
  type ReviewItem,
  type ReviewStatus,
  type RevisionSummary,
  type DesignContract,
  type LibraryAuditEntry,
  type LibraryComponent,
  type LibraryInstall,
  type LibraryLicense,
  type LibraryProvenance,
  type Site,
  type SiteTheme,
  type SmtpSettingsRecord,
  type SmtpTlsMode,
  type StructureChange,
  type SupportsFlag,
  type TokenKind,
  type TokenRecord,
  type TokenScope,
} from "./types.ts";

import {
  ASSET_COLUMNS,
  CODE_PAYLOAD_COLUMNS,
  COLLECTION_COLUMNS,
  ENTRY_COLUMNS,
  mapAsset,
  mapAssetFolder,
  mapAssetHistory,
  mapAssetVariant,
  mapCodePayload,
  mapCollection,
  mapEntry,
  mapEntryVersion,
  mapEntryRedirect,
  type AssetRow,
  type AssetFolderRow,
  type AssetHistoryRow,
  type AssetVariantRow,
  type CodePayloadRow,
  type CollectionRow,
  type EntryRow,
  type EntryVersionRow,
  type EntryRedirectRow,
} from "./store-record-mappers.ts";
import {
  toFiniteNumber,
  toIso,
  toJson,
  toJsonParam,
  toNullableIso,
} from "./store-row-utils.ts";
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "page";
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "23505") return true;
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return /(duplicate|unique|already exists)/i.test(message);
}

type SiteRow = {
  id: string;
  name: string;
  slug: string;
  profile: string;
  theme_id: unknown;
  // Only `getSite` selects it; list/rename/profile rows leave it out.
  base_url?: unknown;
  created_at: unknown;
  updated_at: unknown;
};

// The design contract column is read on its own (getSite joins it lazily
// through a second query in updateDesignContract/refresh), the SiteRow stays
// lean like StyleRuleRow above.

// The style rule column is read on its own, never through `SiteRow`: the rules
// are a separate resource with their own endpoints.
type StyleRuleRow = {
  style_rules_json: unknown;
  style_rules_version: unknown;
};

type PageRow = {
  id: string;
  site_id: string;
  path: string;
  title: string;
  meta: unknown;
  draft: unknown;
  draft_version: unknown;
  created_at: unknown;
  updated_at: unknown;
  template_kind?: unknown;
  collection_ids?: unknown;
  priority?: unknown;
  layout_id?: unknown;
};

type PageSummaryRow = Omit<PageRow, "draft">;

// The template columns come from the additive page_templates table via LEFT
// JOIN; a page without a row is a normal page.
const PAGE_COLUMNS =
  "p.id, p.site_id, p.path, p.title, p.meta, p.draft, p.draft_version, p.created_at, p.updated_at, pt.kind AS template_kind, pt.collection_ids, pt.priority, pt.layout_id";
const PAGE_SUMMARY_COLUMNS =
  "p.id, p.site_id, p.path, p.title, p.meta, p.draft_version, p.created_at, p.updated_at, pt.kind AS template_kind, pt.collection_ids, pt.priority, pt.layout_id";
const PAGE_WRITE_COLUMNS =
  "id, site_id, path, title, meta, draft, draft_version, created_at, updated_at";

type AuditRow = {
  id: string;
  site_id: string;
  page_id: unknown;
  batch_id: string;
  op_index: unknown;
  mutation: string;
  params: unknown;
  author: unknown;
  undo_patch: unknown;
  draft_version_after: unknown;
  created_at: unknown;
};

type ThemeRow = {
  id: string;
  site_id: string;
  name: string;
  definition: unknown;
  version: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function mapThemeRow(row: ThemeRow): SiteTheme {
  const theme = toJson<Theme>(row.definition);
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    version: toFiniteNumber(row.version, "version"),
    theme,
    css: emitCss(resolveTheme(theme)),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapSite(row: SiteRow): Site {
  const profile = row.profile;
  if (profile !== "clean" && profile !== "standard" && profile !== "showcase") {
    throw new Error(`Stored site profile is invalid: ${String(profile)}`);
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile,
    themeId: typeof row.theme_id === "string" ? row.theme_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
// -------------------------------------------------- style rule helpers (P2)

// The schema reports a dotted field; the write path surfaces the first one.
function StyleRuleSchemaErrors(rule: unknown): string[] {
  return styleRuleErrors(rule);
}

function assertValidClassName(name: string): string {
  return assertValidCssClassName(name);
}

function isWritableSelector(selector: string): boolean {
  return isValidCssSelector(selector);
}

// A class-kind or scoped rule owns its class token; a second rule with the
// same name would emit a duplicate selector that no assignment can separate.
function assertClassNameFree(
  rules: readonly StyleRule[],
  name: string,
  exceptId: string,
  field: string,
): void {
  const clash = rules.find(
    (rule) => rule.id !== exceptId && rule.kind !== "ambient" && rule.name === name,
  );
  if (clash !== undefined) {
    throw new SenifyError("conflict", `Style class "${name}" already exists`, {
      field,
      suggestion: "Pick a name that is not in use yet.",
    });
  }
}

// One scoped rule per node: a second rule for the same node would compete with
// the first without a user-visible way to tell them apart.
function assertSingleScopedRule(
  rules: readonly StyleRule[],
  nodeId: string,
  exceptId: string,
): void {
  const clash = rules.find(
    (rule) =>
      rule.id !== exceptId &&
      rule.scope !== undefined &&
      rule.scope.nodeId === nodeId,
  );
  if (clash !== undefined) {
    throw new SenifyError(
      "conflict",
      `Node "${nodeId}" already owns a scoped style rule`,
      {
        field: "nodeId",
        suggestion: "Update the existing rule instead of creating a second one.",
      },
    );
  }
}

type CreateStyleRuleInput = {
  id?: string;
  name: string;
  kind?: "class" | "ambient" | "scoped";
  selector?: string;
  nodeId?: string;
  description?: string;
  styles?: Record<string, unknown>;
  stylePriorities?: Record<string, "important">;
  states?: Record<string, Record<string, unknown>>;
  statePriorities?: Record<string, Record<string, "important">>;
  contextStyles?: Record<string, Record<string, unknown>>;
  contextStylePriorities?: Record<string, Record<string, "important">>;
  rawCss?: string;
};

// Turns the transport input into a complete rule through the widget engine
// constructors, so name and selector can never drift apart.
function buildStyleRule(
  input: CreateStyleRuleInput,
  kind: "class" | "ambient" | "scoped",
  id: string,
  order: number,
): StyleRule {
  const styles = (input.styles ?? {}) as StyleRule["styles"];
  const base = { id, order, styles };

  if (kind === "ambient") {
    if (input.selector === undefined) {
      throw new Error("An ambient rule requires a selector");
    }
    return withExtras(
      createAmbientRule({
        ...base,
        selector: input.selector,
        ...(input.description === undefined ? {} : { description: input.description }),
      }),
      input,
    );
  }
  if (kind === "scoped") {
    if (input.nodeId === undefined) {
      throw new Error("A scoped rule requires the node it belongs to");
    }
    return withExtras(
      createScopedRule({ ...base, nodeId: input.nodeId }),
      input,
    );
  }
  return withExtras(
    createClassRule({
      ...base,
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
    }),
    input,
  );
}

// The optional extras a transport input may carry: custom conditions, the four
// pseudo states (O11) and the author provenance (ADR-0005).
function withExtras(rule: StyleRule, input: CreateStyleRuleInput): StyleRule {
  let next = rule;
  if (input.contextStyles !== undefined) {
    const contexts: StyleRule["contextStyles"] = { ...next.contextStyles };
    for (const [contextId, bag] of Object.entries(input.contextStyles)) {
      contexts[contextId] = { ...(bag as StyleRule["styles"]) };
    }
    next = { ...next, contextStyles: contexts };
  }
  if (input.states !== undefined) {
    const states: NonNullable<StyleRule["states"]> = { ...next.states };
    for (const state of STATE_ORDER) {
      const bag = input.states[state];
      if (bag !== undefined) states[state] = { ...(bag as StyleRule["styles"]) };
    }
    next = { ...next, states };
  }
  if (input.stylePriorities !== undefined) {
    next = { ...next, stylePriorities: { ...input.stylePriorities } };
  }
  if (input.statePriorities !== undefined) {
    const statePriorities: NonNullable<StyleRule["statePriorities"]> = {
      ...next.statePriorities,
    };
    for (const state of STATE_ORDER) {
      const priority = input.statePriorities[state];
      if (priority !== undefined) statePriorities[state] = { ...priority };
    }
    next = { ...next, statePriorities };
  }
  if (input.contextStylePriorities !== undefined) {
    next = {
      ...next,
      contextStylePriorities: {
        ...next.contextStylePriorities,
        ...input.contextStylePriorities,
      },
    };
  }
  if (input.rawCss !== undefined) {
    next = { ...next, rawCss: input.rawCss };
  }
  return next;
}

function assertDraftShape(draft: unknown): asserts draft is NodeTree {
  if (
    !draft ||
    typeof draft !== "object" ||
    typeof (draft as { rootNodeId?: unknown }).rootNodeId !== "string" ||
    typeof (draft as { nodes?: unknown }).nodes !== "object" ||
    (draft as { nodes?: unknown }).nodes === null
  ) {
    throw new Error("Stored page draft has an invalid shape");
  }
}

function mapPageTemplate(row: {
  title?: string;
  template_kind?: unknown;
  collection_ids?: unknown;
  priority?: unknown;
}): PageTemplate | null {
  if (row.template_kind === "layout") {
    return { kind: "layout", label: row.title ?? "" };
  }
  if (row.template_kind === "collection") {
    return {
      kind: "collection",
      collectionIds: toJson<string[]>(row.collection_ids),
      priority: toFiniteNumber(row.priority ?? 0, "priority"),
    };
  }
  return null;
}

function mapPage(row: PageRow): Page {
  const draft = toJson<unknown>(row.draft);
  assertDraftShape(draft);
  return {
    id: row.id,
    siteId: row.site_id,
    path: row.path,
    title: row.title,
    meta: toJson<PageMeta>(row.meta),
    draft,
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    template: mapPageTemplate(row),
    layoutId: typeof row.layout_id === "string" ? row.layout_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toSummary(row: PageSummaryRow): PageSummary {
  return {
    id: row.id,
    siteId: row.site_id,
    path: row.path,
    title: row.title,
    meta: toJson<PageMeta>(row.meta),
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    template: mapPageTemplate(row),
    layoutId: typeof row.layout_id === "string" ? row.layout_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapAudit(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    siteId: row.site_id,
    pageId: typeof row.page_id === "string" ? row.page_id : null,
    batchId: row.batch_id,
    opIndex: toFiniteNumber(row.op_index, "op_index"),
    mutation: row.mutation,
    params: toJson<Record<string, unknown>>(row.params),
    author: toJson<Author>(row.author),
    undoPatch: toJson<AuditEntry["undoPatch"]>(row.undo_patch),
    draftVersionAfter: toFiniteNumber(row.draft_version_after, "draft_version_after"),
    createdAt: toIso(row.created_at),
  };
}

type TokenRow = {
  id: string;
  name: string;
  kind: unknown;
  scopes: unknown;
  token_prefix: string;
  created_at: unknown;
  expires_at: unknown;
  last_used_at: unknown;
  revoked_at: unknown;
};

type TokenRecordRow = TokenRow & { token_hash: string };

type McpAuditRow = {
  id: string;
  token_id: unknown;
  client: string;
  tool: string;
  args: unknown;
  result: string;
  entity: unknown;
  duration_ms: unknown;
  created_at: unknown;
};

type IdempotencyRow = {
  fingerprint: string;
  status: unknown;
  response: unknown;
  created_at: unknown;
};

// A completed idempotent response is replayable for a day; a claim without a
// response older than two minutes is a crashed attempt and may be taken over.
// A slot with a committed marker is never taken over and never cleaned up
// before the slot itself expires: the two rows share one lifetime, so a retry
// can never see a free slot for a write that already happened.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_STALE_MS = 2 * 60 * 1000;

export type IdempotencyClaim =
  | { state: "claimed" }
  | { state: "replay"; status: number; body: unknown }
  | { state: "in_progress" }
  | // The write is committed but its response was lost (R6): the caller must
    // not write again, and there is nothing to replay.
    { state: "committed_unknown" }
  | { state: "mismatch" };

type RevisionRow = {
  id: string;
  page_id: string;
  site_id: string;
  tree: unknown;
  title: string;
  path: string;
  author: unknown;
  note: unknown;
  created_at: unknown;
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

type PreviewRow = {
  id: string;
  site_id: string;
  build_ref: string;
  token: string;
  status: string;
  created_by: unknown;
  created_at: unknown;
  expires_at: unknown;
};

type DeploymentRow = {
  id: string;
  site_id: string;
  release_id: string;
  provider: string;
  status: string;
  target: string;
  file_count: unknown;
  byte_size: unknown;
  error: unknown;
  author: unknown;
  created_at: unknown;
  finished_at: unknown;
};

type DeploySettingsRow = {
  provider: string;
  netlify_site_id: unknown;
  netlify_token_encrypted: unknown;
  vercel_project_id: unknown;
  vercel_token_encrypted: unknown;
  updated_at: unknown;
};

type ReviewRow = {
  id: string;
  site_id: string;
  preview_id: unknown;
  base_state: unknown;
  pages: unknown;
  author: unknown;
  status: string;
  structure_diff: unknown;
  guardrails: unknown;
  thread: unknown;
  visuals: unknown;
  import_reports: unknown;
  release_id: unknown;
  created_at: unknown;
  resolved_at: unknown;
};

const REVIEW_STATUS_VALUES: readonly ReviewStatus[] = REVIEW_STATUSES;

type RedesignProposalRow = {
  id: string;
  source_page_id: string;
  status: string;
  cards: unknown;
  basis: unknown;
  decision: unknown;
  apply_result: unknown;
  created_at: unknown;
  expires_at: unknown;
};

const REDESIGN_PROPOSAL_COLUMNS =
  "id, source_page_id, status, cards, basis, decision, apply_result, created_at, expires_at";

// How long a direction stays decidable (Fahrplan P2-3, R2). A proposal is
// offered against a pinned draft and theme version, so a decision taken weeks
// later would apply a plan to a source that has moved on. Seven days is long
// enough for a human to come back to it and short enough that the inbox does
// not fill with proposals nobody will ever read.
const DEFAULT_PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function mapRedesignProposal(row: RedesignProposalRow): RedesignProposal {
  if (!isRedesignProposalStatus(row.status)) {
    throw new Error(`Stored redesign proposal status is invalid: ${row.status}`);
  }
  const basis = toJson<RedesignProposalBasis>(row.basis);
  return {
    id: row.id,
    sourcePageId: row.source_page_id,
    status: row.status,
    source: basis.source,
    cards: toJson<DirectionCard[]>(row.cards),
    decision: row.decision === null || row.decision === undefined
      ? null
      : toJson<DirectionDecision>(row.decision),
    applyResult:
      row.apply_result === null || row.apply_result === undefined
        ? null
        : toJson<RedesignProposalApplyResult>(row.apply_result),
    createdAt: toIso(row.created_at),
    expiresAt: row.expires_at === null || row.expires_at === undefined
      ? null
      : toIso(row.expires_at),
  };
}

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

function mapRevision(row: RevisionRow): PageRevision {
  const tree = toJson<unknown>(row.tree);
  assertDraftShape(tree);
  return {
    id: row.id,
    pageId: row.page_id,
    siteId: row.site_id,
    title: row.title,
    path: row.path,
    tree,
    author: toJson<Author>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: toIso(row.created_at),
  };
}

function toRevisionSummary(revision: PageRevision): RevisionSummary {
  const { tree, ...rest } = revision;
  return { ...rest, nodeCount: Object.keys(tree.nodes).length };
}

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

function mapDeployment(row: DeploymentRow): Deployment {
  const status: DeploymentStatus =
    row.status === "succeeded"
      ? "succeeded"
      : row.status === "failed"
        ? "failed"
        : "running";
  return {
    id: row.id,
    siteId: row.site_id,
    releaseId: row.release_id,
    // One provider today; the seam widens when hosted adapters arrive.
    provider: "static",
    status,
    target: row.target,
    fileCount: Number(row.file_count ?? 0),
    byteSize: Number(row.byte_size ?? 0),
    error: typeof row.error === "string" ? row.error : null,
    author: toJson<Author>(row.author),
    createdAt: toIso(row.created_at),
    finishedAt:
      row.finished_at === null || row.finished_at === undefined
        ? null
        : toIso(row.finished_at),
  };
}

function mapPreview(row: PreviewRow): Preview {
  const status: PreviewStatus =
    row.status === "failed"
      ? "failed"
      : row.status === "expired"
        ? "expired"
        : "ready";
  return {
    id: row.id,
    siteId: row.site_id,
    buildRef: row.build_ref,
    token: row.token,
    status,
    createdBy: toJson<Author>(row.created_by),
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}

function mapReviewItem(row: ReviewRow): ReviewItem {
  const status = row.status as ReviewStatus;
  if (!REVIEW_STATUS_VALUES.includes(status)) {
    throw new Error(`Stored review status is invalid: ${row.status}`);
  }
  return {
    id: row.id,
    siteId: row.site_id,
    previewId: typeof row.preview_id === "string" ? row.preview_id : null,
    baseState: toJson<ReviewItem["baseState"]>(row.base_state),
    pages: toJson<string[]>(row.pages),
    author: toJson<Author>(row.author),
    status,
    structureDiff: toJson<StructureChange[]>(row.structure_diff),
    guardrails: toJson<ReviewItem["guardrails"]>(row.guardrails),
    thread: toJson<ReviewComment[]>(row.thread),
    importReports:
      row.import_reports === null || row.import_reports === undefined
        ? []
        : toJson<ReviewItem["importReports"]>(row.import_reports),
    visuals:
      row.visuals === null || row.visuals === undefined
        ? null
        : toJson<ReviewItem["visuals"]>(row.visuals),
    releaseId: typeof row.release_id === "string" ? row.release_id : null,
    createdAt: toIso(row.created_at),
    resolvedAt:
      row.resolved_at === null || row.resolved_at === undefined
        ? null
        : toIso(row.resolved_at),
  };
}

function mapToken(row: TokenRow): ApiToken {
  const scopes = toJson<unknown>(row.scopes);
  if (
    !Array.isArray(scopes) ||
    scopes.some(
      (scope) => scope !== "read" && scope !== "write" && scope !== "publish",
    )
  ) {
    throw new Error(`Stored token scopes are invalid: ${String(row.scopes)}`);
  }
  if (row.kind !== "human" && row.kind !== "agent") {
    throw new Error(`Stored token kind is invalid: ${String(row.kind)}`);
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    scopes: scopes as TokenScope[],
    prefix: row.token_prefix,
    createdAt: toIso(row.created_at),
    expiresAt: toNullableIso(row.expires_at),
    lastUsedAt: toNullableIso(row.last_used_at),
    revokedAt: toNullableIso(row.revoked_at),
  };
}

function mapMcpAudit(row: McpAuditRow): McpAuditEntry {
  return {
    id: row.id,
    tokenId: typeof row.token_id === "string" ? row.token_id : null,
    client: row.client,
    tool: row.tool,
    args: toJson<Record<string, unknown>>(row.args),
    result: row.result === "error" ? "error" : "ok",
    entity: typeof row.entity === "string" ? row.entity : null,
    durationMs: toFiniteNumber(row.duration_ms, "duration_ms"),
    createdAt: toIso(row.created_at),
  };
}

export type CreateSiteInput = {
  name: string;
  slug?: string;
  profile?: Site["profile"];
};

export type CreatePageInput = {
  title?: string;
  path?: string;
};

export type NewAuditEntry = {
  siteId: string;
  pageId: string | null;
  batchId: string;
  opIndex: number;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  undoPatch: AuditEntry["undoPatch"];
  draftVersionAfter: number;
};

export type PreparedCodePayload = {
  id: string;
  name: string;
  kind: CodePayloadKind;
  bundle: string;
  provenance: CodePayloadProvenance;
  license: CodePayloadLicense;
};

export type FramerImportCommitPlan = {
  siteId: string;
  jobId: string;
  contentKey: string;
  requestFingerprint: string;
  author: Author;
  target:
    | { kind: "new"; path: string; title: string }
    | { kind: "page"; pageId: string; baseDraftVersion: number };
  draft: NodeTree;
  payloads: readonly PreparedCodePayload[];
  styleRules: readonly StyleRule[];
  themePatch: Record<string, unknown> | null;
  report: Omit<
    ImportReport,
    "pageId" | "newDraftVersion" | "receiptId" | "replayed"
  >;
};

export type FramerImportCommitResult = {
  receipt: ImportReceipt;
  job: ImportJob;
  report: ImportReport;
  replayed: boolean;
};

export type SmtpSettingsPatch = {
  host?: string;
  port?: number;
  tls?: SmtpTlsMode;
  user?: string;
  from?: string;
  passwordEncrypted?: string | null;
};

export type EngineSettingsPatch = {
  defaultProfile?: Site["profile"];
  defaultLayout?: string;
  autostart?: boolean;
  backupDir?: string | null;
};

export type ImageSettingsPatch = {
  provider?: ImageProviderName;
  fallbackProvider?: ImageFallbackProvider;
  cooldownMinutes?: number;
  cliPath?: string;
  baseUrl?: string;
  diffusionModel?: string;
  textEncoder?: string;
  vae?: string;
  defaultSteps?: number;
  maxPixels?: number;
  timeoutMinutes?: number;
  customBaseUrl?: string;
  customModel?: string;
  customFormat?: ImageCustomFormat;
  customApiKeyEncrypted?: string | null;
};

export type LibraryCreateInput = {
  id: string;
  name: string;
  kind: LibraryComponent["kind"];
  definition: NodeTree;
  fingerprint: string;
  tags: string[];
  provenance: LibraryProvenance;
  license: LibraryLicense;
  notes: string;
  author: Author;
};

export type LibraryPatchInput = {
  id: string;
  name?: string;
  tags?: string[];
  notes?: string;
  license?: LibraryLicense;
  deprecated?: boolean;
  author: Author;
};

export type LibraryInstallInput = {
  id: string;
  siteId: string;
  componentId: string;
  mode: LibraryInstall["mode"];
  pageId?: string;
  parentNodeId?: string;
  author: Author;
};

type LibraryComponentRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  definition: unknown;
  fingerprint: string;
  tags: unknown;
  provenance: unknown;
  license: unknown;
  notes: string;
  version: unknown;
  deprecated_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type LibraryInstallRow = {
  id: string;
  site_id: string;
  library_component_id: string;
  installed_version: unknown;
  mode: string;
  created_at: unknown;
  updated_at: unknown;
};

const LIBRARY_COLUMNS = "id, name, slug, kind, definition, fingerprint, tags, provenance, license, notes, version, deprecated_at, created_at, updated_at";
const LIBRARY_INSTALL_COLUMNS = "id, site_id, library_component_id, installed_version, mode, created_at, updated_at";

function mapLibraryComponent(row: LibraryComponentRow): LibraryComponent {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as LibraryComponent["kind"],
    definition: toJson<NodeTree>(row.definition),
    fingerprint: row.fingerprint,
    tags: toJson<string[]>(row.tags),
    provenance: toJson<LibraryProvenance>(row.provenance),
    license: toJson<LibraryLicense>(row.license),
    notes: row.notes,
    version: toFiniteNumber(row.version, "version"),
    deprecatedAt: row.deprecated_at === null || row.deprecated_at === undefined ? null : toIso(row.deprecated_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapLibraryInstall(row: LibraryInstallRow): LibraryInstall {
  return {
    id: row.id,
    siteId: row.site_id,
    componentId: row.library_component_id,
    installedVersion: toFiniteNumber(row.installed_version, "installed_version"),
    mode: row.mode as LibraryInstall["mode"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class Store {
  readonly #db: Db;

  // Where the encryption key lives. Without it (a bare Store in a test) the key
  // stays in the database, as before.
  readonly #secretFile: string | undefined;
  #engineSecret: Promise<string> | undefined;

  constructor(db: Db, options: { secretFile?: string } = {}) {
    this.#db = db;
    this.#secretFile = options.secretFile;
  }

  async createSite(input: CreateSiteInput): Promise<Site> {
    const name = input.name?.trim();
    if (!name) {
      throw new SenifyError("validation", "Site name is required", {
        field: "name",
        suggestion: "Provide a non-empty site name.",
      });
    }
    const profile: Site["profile"] =
      input.profile ?? (await this.getEngineSettings()).defaultProfile;
    if (!SITE_PROFILES.includes(profile)) {
      throw new SenifyError(
        "validation",
        `Unknown site profile "${profile}"`,
        {
          field: "profile",
          suggestion: `Choose one of: ${SITE_PROFILES.join(", ")}.`,
        },
      );
    }
    const now = new Date().toISOString();
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      const site = await this.#insertSite(newEntityId(), name, slug, profile, now);
      await this.ensureSiteTheme(site.id);
      return this.getSite(site.id);
    }
    const base = slugify(name);
    let site: Site | undefined;
    let lastConflict: SenifyError | undefined;
    for (let attempt = 0; attempt < 50 && !site; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        site = await this.#insertSite(newEntityId(), name, slug, profile, now);
      } catch (error) {
        if (error instanceof SenifyError && error.category === "conflict") {
          lastConflict = error;
          continue;
        }
        throw error;
      }
    }
    if (!site) {
      throw (
        lastConflict ??
        new SenifyError("conflict", `Site slug "${base}" is already in use`, {
          field: "slug",
          suggestion: "Choose a different site slug.",
        })
      );
    }
    await this.ensureSiteTheme(site.id);
    return this.getSite(site.id);
  }

  async #insertSite(
    id: string,
    name: string,
    slug: string,
    profile: Site["profile"],
    now: string,
  ): Promise<Site> {
    try {
      const result = await this.#db.query<SiteRow>(
        `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)
         RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
        [id, name, slug, profile, now],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Site insert returned no row");
      return mapSite(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Site slug "${slug}" is already in use`,
          {
            field: "slug",
            suggestion: "Choose a different site slug.",
          },
        );
      }
      throw error;
    }
  }

  async listSites(): Promise<Site[]> {
    const result = await this.#db.query<SiteRow>(
      `SELECT s.id, s.name, s.slug, s.profile, s.theme_id, s.created_at, s.updated_at
       FROM sites s
       LEFT JOIN site_trash t ON t.site_id = s.id
       WHERE t.site_id IS NULL
       ORDER BY s.created_at ASC, s.id ASC`,
    );
    return result.rows.map(mapSite);
  }

  async getSite(id: string): Promise<Site> {
    const result = await this.#db.query<SiteRow>(
      `SELECT id, name, slug, profile, theme_id, base_url, created_at, updated_at
       FROM sites WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
        suggestion: "Create the site first or check the id.",
      });
    }
    const site = mapSite(row);
    site.designContract = await this.readDesignContract(id);
    if (typeof row.base_url === "string") site.baseUrl = row.base_url;
    return site;
  }

  // The public address: validated and reduced to its origin; blank or `null`
  // clears it. Returns the full site so the caller sees the stored value.
  async updateSiteBaseUrl(id: string, raw: string | null): Promise<Site> {
    const baseUrl = raw === null ? null : normalizeSiteBaseUrl(raw);
    const result = await this.#db.query<{ id: string }>(
      `UPDATE sites SET base_url = $2, updated_at = $3 WHERE id = $1 RETURNING id`,
      [id, baseUrl, new Date().toISOString()],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
      });
    }
    return this.getSite(id);
  }

  // The design contract lives in its own column; absent means "no DNA yet".
  private async readDesignContract(siteId: string): Promise<DesignContract | undefined> {
    const result = await this.#db.query<{ design_contract: unknown }>(
      `SELECT design_contract FROM sites WHERE id = $1`,
      [siteId],
    );
    const raw = result.rows[0]?.design_contract;
    if (raw === null || raw === undefined) return undefined;
    const parsed = toJson<DesignContract>(raw);
    if (
      parsed === null ||
      !Array.isArray(parsed.constants) ||
      !Array.isArray(parsed.never) ||
      !Array.isArray(parsed.vocabulary) ||
      (parsed.source !== "references" && parsed.source !== "manual")
    ) {
      return undefined;
    }
    return parsed;
  }

  async getDesignContract(siteId: string): Promise<DesignContract | null> {
    return (await this.readDesignContract(siteId)) ?? null;
  }

  // Manual override: the caller supplies the full contract; the store trims
  // and dedupes the entries. `null` clears the contract.
  async updateDesignContract(
    siteId: string,
    contract: {
      constants: string[];
      never: string[];
      vocabulary: string[];
    } | null,
  ): Promise<DesignContract | null> {
    await this.getSite(siteId);
    if (contract === null) {
      await this.#db.query(
        `UPDATE sites SET design_contract = NULL, updated_at = $2 WHERE id = $1`,
        [siteId, new Date().toISOString()],
      );
      return null;
    }
    const value: DesignContract = {
      constants: [...new Set(contract.constants.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, 12),
      never: [...new Set(contract.never.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, 12),
      vocabulary: [...new Set(contract.vocabulary.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, 12),
      source: "manual",
      updatedAt: new Date().toISOString(),
    };
    await this.#db.query(
      `UPDATE sites SET design_contract = $2, updated_at = $3 WHERE id = $1`,
      [siteId, toJsonParam(value), new Date().toISOString()],
    );
    return value;
  }

  // Re-derive the contract from the assigned references (called after
  // applyReference/unassign): manual contracts are never overwritten.
  async refreshDesignContractFromReferences(
    siteId: string,
    profiles: readonly {
      constants: readonly string[];
      never: readonly string[];
      vocabulary: readonly string[];
    }[],
  ): Promise<DesignContract | null> {
    const existing = await this.readDesignContract(siteId);
    if (existing?.source === "manual") return existing;
    if (profiles.length === 0) {
      await this.#db.query(
        `UPDATE sites SET design_contract = NULL, updated_at = $2 WHERE id = $1`,
        [siteId, new Date().toISOString()],
      );
      return null;
    }
    const derived = deriveDesignContract(profiles);
    const value: DesignContract = {
      constants: [...derived.constants],
      never: [...derived.never],
      vocabulary: [...derived.vocabulary],
      source: "references",
      updatedAt: new Date().toISOString(),
    };
    await this.#db.query(
      `UPDATE sites SET design_contract = $2, updated_at = $3 WHERE id = $1`,
      [siteId, toJsonParam(value), new Date().toISOString()],
    );
    return value;
  }

  async deleteSite(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM sites WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
      });
    }
  }

  async renameSite(id: string, name: string): Promise<Site> {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw new SenifyError("validation", "Site name is required", {
        field: "name",
        suggestion: "Provide a non-empty site name.",
      });
    }
    const now = new Date().toISOString();
    const result = await this.#db.query<SiteRow>(
      `UPDATE sites SET name = $2, updated_at = $3 WHERE id = $1
       RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
      [id, trimmed, now],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
      });
    }
    return mapSite(row);
  }

  // The site profile (ticket 21/20): same validation as `createSite`. The
  // editor validates the document against the new profile before it asks for
  // the change; the engine stays the authoritative gate.
  async updateSiteProfile(id: string, profile: Site["profile"]): Promise<Site> {
    if (!SITE_PROFILES.includes(profile)) {
      throw new SenifyError("validation", `Unknown site profile "${profile}"`, {
        field: "profile",
        suggestion: `Choose one of: ${SITE_PROFILES.join(", ")}.`,
      });
    }
    const now = new Date().toISOString();
    const result = await this.#db.query<SiteRow>(
      `UPDATE sites SET profile = $2, updated_at = $3 WHERE id = $1
       RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
      [id, profile, now],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
      });
    }
    return mapSite(row);
  }

  // The trash lives in its own table: the schema stays additive (no ALTERs)
  // and listSites simply excludes trashed sites.
  async trashSite(id: string): Promise<Site> {
    const site = await this.getSite(id);
    const existing = await this.#db.query<{ site_id: string }>(
      `SELECT site_id FROM site_trash WHERE site_id = $1`,
      [id],
    );
    if (existing.rows.length > 0) {
      throw new SenifyError("conflict", `Site "${id}" is already in the trash`, {
        field: "siteId",
        suggestion: "Restore the site first.",
      });
    }
    await this.#db.query(
      `INSERT INTO site_trash (site_id, trashed_at) VALUES ($1, $2)`,
      [id, new Date().toISOString()],
    );
    return site;
  }

  async restoreSite(id: string): Promise<Site> {
    const result = await this.#db.query<{ site_id: string }>(
      `DELETE FROM site_trash WHERE site_id = $1 RETURNING site_id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Site "${id}" is not in the trash`, {
        field: "siteId",
      });
    }
    return this.getSite(id);
  }

  async listTrashedSites(): Promise<(Site & { trashedAt: string })[]> {
    const result = await this.#db.query<SiteRow & { trashed_at: unknown }>(
      `SELECT s.id, s.name, s.slug, s.profile, s.theme_id, s.created_at, s.updated_at, t.trashed_at
       FROM site_trash t JOIN sites s ON s.id = t.site_id
       ORDER BY t.trashed_at DESC, s.id ASC`,
    );
    return result.rows.map((row) => ({
      ...mapSite(row),
      trashedAt: toIso(row.trashed_at),
    }));
  }

  // Used by the atomic redesign compile (ADR-0014): the slug and the page path
  // of a prepared copy have to be free before the transaction opens, because a
  // unique violation inside a transaction cannot be retried.
  async listSiteSlugs(): Promise<string[]> {
    const result = await this.#db.query<{ slug: string }>(`SELECT slug FROM sites`);
    return result.rows.map((row) => row.slug);
  }

  async listPagePaths(siteId: string): Promise<string[]> {
    const result = await this.#db.query<{ path: string }>(
      `SELECT path FROM pages WHERE site_id = $1`,
      [siteId],
    );
    return result.rows.map((row) => row.path);
  }

  // Writes a prepared redesign plan in ONE transaction (ADR-0014): the
  // duplicate, the theme, the seeded drafts, the audit trail and the proposal's
  // final state. Nothing is read back and no branch is taken inside, because
  // everything was decided by the compile. A crash therefore leaves neither a
  // half-written site nor a proposal stuck in `applying`.
  async applyRedesignPlan(
    plan: {
      targetSite: { id: string; name: string; slug: string; profile: string; withContent: boolean };
      // The duplicate's own theme row, created from the source definition and
      // then patched by `themeWrite`.
      themeId: string;
      startPage: { id: string; title: string; path: string } | null;
      copiedPages: {
        sourcePageId: string;
        targetPageId: string;
        path: string;
        title: string;
        meta: unknown;
        draft: unknown;
        draftVersion: number;
      }[];
      themeWrite: { themeId: string; expectedVersion: number; patch: Record<string, unknown> } | null;
      pageWrites: {
        pageId: string;
        expectedVersion: number;
        draft: unknown;
        title: string;
        path: string;
      }[];
      auditEntries: NewAuditEntry[];
    },
    input: {
      now: string;
      author: Author;
      sourceSite: Site;
      themeDefinition: unknown;
      proposalClaim: { proposalId: string; directionId: string; decision: unknown } | null;
      proposalFinalize: { proposalId: string; applyResult: unknown } | null;
    },
  ): Promise<void> {
    await this.#db.withTransaction(async (tx) => {
      // The decision is claimed inside the same transaction as its effects, so
      // a rollback removes both together.
      if (input.proposalClaim !== null) {
        const locked = await tx.query<{ status: string; expires_at: unknown }>(
          `SELECT status, expires_at FROM redesign_proposals WHERE id = $1 FOR UPDATE`,
          [input.proposalClaim.proposalId],
        );
        const row = locked.rows[0];
        if (row === undefined) {
          throw new SenifyError("not_found", "The redesign proposal does not exist", {
            field: "proposalId",
          });
        }
        if (row.status === "expired") {
          // Aged out (P2-3, R2). Its own message, because "already decided"
          // would be a lie: nobody decided this one, it simply ran out of time.
          throw new SenifyError(
            "conflict",
            "This direction expired before anyone decided it",
            {
              field: "proposalId",
              suggestion:
                "Create a new proposal for the page. The source page may have changed since this one was derived.",
            },
          );
        }
        if (row.status !== "proposed") {
          throw new SenifyError("conflict", "The direction was already decided", {
            field: "proposalId",
          });
        }
        // The deadline is checked here, inside the claim, not only in the list
        // sweep: a confirm that arrives between two sweeps must still lose
        // against its own expiry rather than write a plan nobody can take back.
        if (row.expires_at !== null && row.expires_at !== undefined) {
          const expiresAt = toIso(row.expires_at);
          if (Date.parse(expiresAt) <= Date.parse(input.now)) {
            // The row is still `proposed`, so move it to its end state in this
            // transaction; the rollback removes it again if the apply fails.
            await tx.query(
              `UPDATE redesign_proposals SET status = 'expired' WHERE id = $1`,
              [input.proposalClaim.proposalId],
            );
            throw new SenifyError(
              "conflict",
              "This direction expired before anyone decided it",
              {
                field: "proposalId",
                suggestion:
                  "Create a new proposal for the page. The source page may have changed since this one was derived.",
              },
            );
          }
        }
        await tx.query(
          `UPDATE redesign_proposals SET status = 'applying', decision = $2 WHERE id = $1`,
          [input.proposalClaim.proposalId, toJsonParam(input.proposalClaim.decision)],
        );
      }

      const target = plan.targetSite;
      await tx.query(
        `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)`,
        [target.id, target.name, target.slug, target.profile, input.now],
      );
      // The copy's theme row. Its id comes from the plan so the theme write
      // below targets this row and not the source site's theme.
      await tx.query(
        `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, $5)`,
        [
          plan.themeId,
          target.id,
          input.sourceSite.name,
          toJsonParam(input.themeDefinition),
          input.now,
        ],
      );
      await tx.query(`UPDATE sites SET theme_id = $2 WHERE id = $1`, [target.id, plan.themeId]);

      if (plan.startPage !== null) {
        const rootId = newNodeId();
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, 1, $6, $6)`,
          [
            plan.startPage.id,
            target.id,
            plan.startPage.path,
            plan.startPage.title,
            toJsonParam({ rootNodeId: rootId, nodes: { [rootId]: { id: rootId, type: "page", props: {} } } }),
            input.now,
          ],
        );
      }

      // The copy's own page rows come first, so the seeded draft writes below
      // land in the target site and never touch the source.
      for (const page of plan.copiedPages) {
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [
            page.targetPageId,
            target.id,
            page.path,
            page.title,
            toJsonParam(page.meta),
            toJsonParam(page.draft),
            page.draftVersion,
            input.now,
          ],
        );
      }

      for (const page of plan.pageWrites) {
        const updated = await tx.query<{ draft_version: unknown }>(
          `UPDATE pages SET draft = $4, title = $5, path = $6,
             draft_version = draft_version + 1, updated_at = $3
           WHERE id = $1 AND site_id = $2 AND draft_version = $7
           RETURNING draft_version`,
          [
            page.pageId,
            target.id,
            input.now,
            toJsonParam(page.draft),
            page.title,
            page.path,
            page.expectedVersion,
          ],
        );
        if (updated.rows.length === 0) {
          throw draftConflictError(page.expectedVersion, page.expectedVersion + 1);
        }
      }

      if (plan.themeWrite !== null) {
        // Same merge and validation as `updateTheme`, so a prepared plan cannot
        // write a theme the direct path would have refused.
        const currentDefinition = toJson<Theme>(input.themeDefinition);
        const merged = mergeThemePatch(currentDefinition, plan.themeWrite.patch);
        merged.id = plan.themeWrite.themeId;
        validateShape(ThemeSchema, merged, "theme");
        const issues = validateTheme(merged);
        const first = issues[0];
        if (first !== undefined) {
          throw new SenifyError(
            "validation",
            `Theme ist ungültig: ${first.message}`,
            { field: "theme", suggestion: first.suggestion },
          );
        }
        const updated = await tx.query<{ version: unknown }>(
          `UPDATE themes SET definition = $3, version = version + 1, updated_at = $4
           WHERE id = $1 AND version = $2 RETURNING version`,
          [
            plan.themeWrite.themeId,
            plan.themeWrite.expectedVersion,
            toJsonParam(merged),
            input.now,
          ],
        );
        if (updated.rows.length === 0) {
          throw new SenifyError("conflict", "The theme changed while the redesign was prepared", {
            field: "theme",
            suggestion: "Confirm the direction again.",
          });
        }
      }

      if (plan.auditEntries.length > 0) {
        const insert = buildAuditInsert(
          plan.auditEntries.map((entry) => ({ ...entry, author: input.author })),
        );
        await tx.query(insert.text, insert.params);
      }

      if (input.proposalFinalize !== null) {
        const finalized = await tx.query(
          `UPDATE redesign_proposals
             SET status = 'applied', apply_result = $2
           WHERE id = $1 RETURNING id`,
          [
            input.proposalFinalize.proposalId,
            toJsonParam(input.proposalFinalize.applyResult),
          ],
        );
        if (finalized.rows.length === 0) {
          throw new SenifyError("conflict", "The redesign proposal is not in the applying state", {
            field: "proposalId",
          });
        }
      }
    });
  }

  // Writes a page's draft without going through the mutation pipeline. Only
  // the site duplicate uses it, to point the copied drafts at the copied media
  // (ADR-0014); every normal edit still goes through `applyMutations`.
  async replacePageDraft(pageId: string, draft: NodeTree): Promise<number> {
    const result = await this.#db.query<{ draft_version: unknown }>(
      `UPDATE pages SET draft = $2, draft_version = draft_version + 1, updated_at = $3
       WHERE id = $1 RETURNING draft_version`,
      [pageId, toJsonParam(draft), new Date().toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new SenifyError("not_found", `Page "${pageId}" does not exist`, {
        field: "pageId",
      });
    }
    return toFiniteNumber(row.draft_version, "draft_version");
  }

  // Undoes a record copy whose files could not be written (ADR-0014). A file
  // copy can fail after the rows committed, and rows without files would bake
  // into silently broken images.
  async deleteCopiedAssetRecords(
    targetSiteId: string,
    idMap: ReadonlyMap<string, string>,
  ): Promise<void> {
    const ids = [...idMap.values()];
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    await this.#db.withTransaction(async (tx) => {
      await tx.query(
        `DELETE FROM asset_history WHERE asset_id IN (${placeholders})`,
        ids,
      );
      await tx.query(
        `DELETE FROM asset_variants WHERE asset_id IN (${placeholders})`,
        ids,
      );
      await tx.query(
        `DELETE FROM asset_blurhash WHERE asset_id IN (${placeholders})`,
        ids,
      );
      await tx.query(
        `DELETE FROM assets WHERE site_id = $1 AND id IN (${placeholders})`,
        [targetSiteId, ...ids],
      );
    });
  }

  // A copy is a fresh project: pages, theme and collection schemas come
  // along; entries are copied as drafts (no publish state carries over). The
  // media the pages use are copied as well (ADR-0014) — see `copySiteAssets`
  // in media.ts, which owns the files and calls `duplicateAssetRecords` here.
  async duplicateSite(
    sourceId: string,
    options: { withContent: boolean; author: Author; targetSiteId?: string },
  ): Promise<Site> {
    return (await this.duplicateSiteWithPlan(sourceId, options)).site;
  }

  // Same as `duplicateSite`, but it also hands back the source-to-target page
  // and collection id maps. The media copy needs them to rewrite the copied
  // drafts' asset references (ADR-0014).
  async duplicateSiteWithPlan(
    sourceId: string,
    options: { withContent: boolean; author: Author; targetSiteId?: string },
  ): Promise<{ site: Site; pageIds: Map<string, string>; collectionIds: Map<string, string> }> {
    const source = await this.getSite(sourceId);
    const now = new Date().toISOString();
    const name = `${source.name} (Kopie)`;
    const taken = new Set(
      (
        await this.#db.query<{ slug: string }>(`SELECT slug FROM sites`)
      ).rows.map((row) => row.slug),
    );
    const base = slugify(name);
    let slug = base;
    for (let attempt = 2; taken.has(slug) && attempt < 100; attempt += 1) {
      slug = `${base}-${attempt}`;
    }
    if (taken.has(slug)) {
      throw new SenifyError("conflict", `Site slug "${base}" is already in use`, {
        field: "slug",
        suggestion: "Rename the source site or free the slug.",
      });
    }

    const themeRow = (
      await this.#db.query<{
        name: string;
        definition: unknown;
        version: unknown;
      }>(`SELECT name, definition, version FROM themes WHERE site_id = $1`, [
        sourceId,
      ])
    ).rows[0];
    const pageRows = (
      await this.#db.query<{
        id: string;
        path: string;
        title: string;
        meta: unknown;
        draft: unknown;
        draft_version: unknown;
      }>(
        `SELECT id, path, title, meta, draft, draft_version FROM pages WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
        [sourceId],
      )
    ).rows;
    const collectionRows = (
      await this.#db.query<{
        id: string;
        name: string;
        slug: string;
        fields: unknown;
        title_field: string;
        date_field: string | null;
        url_pattern: string | null;
        supports: unknown;
        list_columns: unknown;
        description: string | null;
        deprecated_at: unknown;
      }>(
        `SELECT id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at
         FROM collections WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
        [sourceId],
      )
    ).rows;
    const entryRows = options.withContent
      ? (
          await this.#db.query<{
            collection_id: string;
            slug: string;
            cells: unknown;
            search_text: string;
          }>(
            `SELECT collection_id, slug, cells, search_text FROM entries
             WHERE site_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC, id ASC`,
            [sourceId],
          )
        ).rows
      : [];

    const siteId = options.targetSiteId ?? newEntityId();
    const pageIds = new Map<string, string>();
    const collectionIds = new Map<string, string>();
    await this.#db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)`,
        [siteId, name, slug, source.profile, now],
      );
      if (themeRow) {
        const themeId = newEntityId();
        await tx.query(
          `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            themeId,
            siteId,
            themeRow.name,
            toJsonParam(themeRow.definition),
            themeRow.version,
            now,
          ],
        );
        await tx.query(`UPDATE sites SET theme_id = $2 WHERE id = $1`, [
          siteId,
          themeId,
        ]);
      }
      for (const page of pageRows) {
        const newPageId = newEntityId();
        pageIds.set(page.id, newPageId);
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [
            newPageId,
            siteId,
            page.path,
            page.title,
            toJsonParam(page.meta),
            toJsonParam(page.draft),
            page.draft_version,
            now,
          ],
        );
      }
      for (const collection of collectionRows) {
        const newId = newEntityId();
        collectionIds.set(collection.id, newId);
        await tx.query(
          `INSERT INTO collections (id, site_id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
          [
            newId,
            siteId,
            collection.name,
            collection.slug,
            toJsonParam(collection.fields),
            collection.title_field,
            collection.date_field,
            collection.url_pattern,
            toJsonParam(collection.supports),
            toJsonParam(collection.list_columns),
            collection.description,
            collection.deprecated_at,
            now,
          ],
        );
      }
      for (const entry of entryRows) {
        const collectionId = collectionIds.get(entry.collection_id);
        if (!collectionId) continue;
        await tx.query(
          `INSERT INTO entries (id, site_id, collection_id, slug, status, cells, active_version_id, version, author, search_text, published_at, scheduled_at, deleted_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'draft', $5, NULL, 1, $6, $7, NULL, NULL, NULL, $8, $8)`,
          [
            newEntityId(),
            siteId,
            collectionId,
            entry.slug,
            toJsonParam(entry.cells),
            toJsonParam(options.author),
            entry.search_text,
            now,
          ],
        );
      }
    });
    await this.recordSiteEvent({
      siteId,
      mutation: "duplicate_site",
      params: {
        sourceSiteId: sourceId,
        withContent: options.withContent,
        pages: pageRows.length,
        entries: entryRows.length,
      },
      author: options.author,
    });
    return { site: await this.getSite(siteId), pageIds, collectionIds };
  }

  // Copies the media records of one site into another (ADR-0014). Every target
  // id and every storage ref is new, so the two sites share no file: a purge on
  // one side cannot take the other down. Files live in media.ts; this method
  // only writes rows and returns the id map the caller needs.
  async duplicateAssetRecords(input: {
    sourceSiteId: string;
    targetSiteId: string;
    assetIds: ReadonlySet<string>;
    now: string;
  }): Promise<{
    idMap: Map<string, string>;
    // source asset id → source history id → new history id, so the caller can
    // place the history files on exactly the ids the copied rows carry.
    historyIds: Map<string, Map<string, string>>;
    folders: number;
    assets: number;
  }> {
    const idMap = new Map<string, string>();
    const historyIds = new Map<string, Map<string, string>>();
    const folderMap = new Map<string, string>();
    return this.#db.withTransaction(async (tx) => {
      const folders = (
        await tx.query<{ id: string; name: string; parent_id: string | null }>(
          `SELECT id, name, parent_id FROM asset_folders WHERE site_id = $1
           ORDER BY created_at ASC, id ASC`,
          [input.sourceSiteId],
        )
      ).rows;
      for (const folder of folders) {
        const newId = newEntityId();
        folderMap.set(folder.id, newId);
        await tx.query(
          `INSERT INTO asset_folders (id, site_id, name, parent_id, created_at)
           VALUES ($1, $2, $3, NULL, $4)`,
          [newId, input.targetSiteId, folder.name, input.now],
        );
      }
      for (const folder of folders) {
        const parent = folder.parent_id === null ? null : folderMap.get(folder.parent_id) ?? null;
        await tx.query(`UPDATE asset_folders SET parent_id = $2 WHERE id = $1`, [
          folderMap.get(folder.id),
          parent,
        ]);
      }

      if (input.assetIds.size === 0) {
        return { idMap, historyIds, folders: folders.length, assets: 0 };
      }
      const wanted = [...input.assetIds];
      const placeholders = wanted.map((_, index) => `$${index + 2}`).join(", ");
      const assets = (
        await tx.query<AssetRow>(
          `SELECT ${ASSET_COLUMNS} FROM assets
           WHERE site_id = $1 AND id IN (${placeholders})
           ORDER BY created_at ASC, id ASC`,
          [input.sourceSiteId, ...wanted],
        )
      ).rows;
      for (const row of assets) {
        const source = mapAsset(row);
        const newId = newEntityId();
        idMap.set(source.id, newId);
        const storageRef = assetStorageRef(
          input.targetSiteId,
          newId,
          source.filename,
        );
        const folderId =
          source.folderId === null ? null : folderMap.get(source.folderId) ?? null;
        await tx.query(
          `INSERT INTO assets (id, site_id, filename, mime, kind, byte_size, width, height,
             hash, alt_text, decorative, folder_id, tags, storage_ref, status,
             replaced_at, trashed_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
          [
            newId,
            input.targetSiteId,
            source.filename,
            source.mime,
            source.kind,
            source.byteSize,
            source.width,
            source.height,
            source.hash,
            source.altText,
            source.decorative,
            folderId,
            toJsonParam(source.tags),
            storageRef,
            source.status,
            source.replacedAt,
            source.trashedAt,
            input.now,
          ],
        );

        const variants = (
          await tx.query<{ id: string; width: number; format: string; byte_size: number }>(
            `SELECT id, width, format, byte_size FROM asset_variants WHERE asset_id = $1`,
            [source.id],
          )
        ).rows;
        for (const variant of variants) {
          await tx.query(
            `INSERT INTO asset_variants (id, asset_id, width, format, storage_ref, byte_size, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              newEntityId(),
              newId,
              variant.width,
              variant.format,
              variantStorageRef(
                input.targetSiteId,
                newId,
                variant.width,
                variant.format,
              ),
              variant.byte_size,
              input.now,
            ],
          );
        }

        const blurhash = (
          await tx.query<{ value: string }>(
            `SELECT value FROM asset_blurhash WHERE asset_id = $1`,
            [source.id],
          )
        ).rows[0];
        if (blurhash !== undefined) {
          await tx.query(
            `INSERT INTO asset_blurhash (asset_id, value, created_at) VALUES ($1,$2,$3)`,
            [newId, blurhash.value, input.now],
          );
        }

        const history = (
          await tx.query<{ id: string; mime: string; byte_size: number; storage_ref: string }>(
            `SELECT id, mime, byte_size, storage_ref FROM asset_history WHERE asset_id = $1`,
            [source.id],
          )
        ).rows;
        for (const entry of history) {
          const newHistoryId = newEntityId();
          const name = storedFileName(entry.storage_ref) || source.filename;
          const perAsset = historyIds.get(source.id) ?? new Map<string, string>();
          perAsset.set(entry.id, newHistoryId);
          historyIds.set(source.id, perAsset);
          await tx.query(
            `INSERT INTO asset_history (id, asset_id, storage_ref, mime, byte_size, created_at)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              newHistoryId,
              newId,
              historyStorageRef(input.targetSiteId, newId, newHistoryId, name),
              entry.mime,
              entry.byte_size,
              input.now,
            ],
          );
        }
      }
      return { idMap, historyIds, folders: folders.length, assets: assets.length };
    });
  }

  // Site-level activity (rename, trash, duplicate, theme) lands in the same
  // append-only audit log the page mutations use.
  async recordSiteEvent(input: {
    siteId: string;
    mutation: string;
    params: Record<string, unknown>;
    author: Author;
  }): Promise<void> {
    const { text, params } = buildAuditInsert([
      {
        siteId: input.siteId,
        pageId: null,
        batchId: newEntityId(),
        opIndex: 0,
        mutation: input.mutation,
        params: input.params,
        author: input.author,
        undoPatch: [],
        draftVersionAfter: 0,
      },
    ]);
    await this.#db.query(text, params);
  }

  async ensureSiteTheme(siteId: string): Promise<ThemeRow> {
    const existing = await this.#db.query<ThemeRow>(
      `SELECT id, site_id, name, definition, version, created_at, updated_at
       FROM themes WHERE site_id = $1`,
      [siteId],
    );
    const found = existing.rows[0];
    if (found) return found;
    const id = newEntityId();
    const definition: Theme = { ...defaultTheme(), id };
    const issues = validateTheme(definition);
    if (issues.length > 0) {
      throw new Error(
        `Default theme is invalid: ${issues[0]?.message ?? "unknown error"}`,
      );
    }
    const now = new Date().toISOString();
    try {
      const inserted = await this.#db.query<ThemeRow>(
        `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, $5)
         RETURNING id, site_id, name, definition, version, created_at, updated_at`,
        [id, siteId, definition.name, toJsonParam(definition), now],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Theme insert returned no row");
      await this.#db.query(
        `UPDATE sites SET theme_id = $2, updated_at = $3 WHERE id = $1`,
        [siteId, id, now],
      );
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost the race: another writer created the theme first.
        const retry = await this.#db.query<ThemeRow>(
          `SELECT id, site_id, name, definition, version, created_at, updated_at
           FROM themes WHERE site_id = $1`,
          [siteId],
        );
        const row = retry.rows[0];
        if (!row) throw error;
        return row;
      }
      throw error;
    }
  }

  async getTheme(siteId: string): Promise<SiteTheme> {
    await this.getSite(siteId);
    // Lazy ensure is intentional: themes created before T04 (none in
    // practice — greenfield) or restored backups still resolve.
    return mapThemeRow(await this.ensureSiteTheme(siteId));
  }

  async updateTheme(
    siteId: string,
    patch: Record<string, unknown>,
    author: Author,
  ): Promise<SiteTheme> {
    if (Object.keys(patch).length === 0) {
      throw new SenifyError("validation", "Theme patch is empty", {
        field: "theme",
        suggestion: "Provide at least one change.",
      });
    }
    await this.getSite(siteId);
    const current = await this.ensureSiteTheme(siteId);
    const currentDefinition = toJson<Theme>(current.definition);
    const merged = mergeThemePatch(currentDefinition, patch);
    merged.id = current.id;
    validateShape(ThemeSchema, merged, "theme");
    const issues = validateTheme(merged);
    if (issues.length > 0) {
      const first = issues[0];
      const extra =
        issues.length > 1 ? ` Plus ${issues.length - 1} more theme problems.` : "";
      throw new SenifyError(
        "validation",
        `Invalid theme: ${first?.message ?? "value does not resolve"}`,
        {
          field: first?.path ?? "theme",
          suggestion: `${first?.suggestion ?? "Fix the flagged value."}${extra}`,
        },
      );
    }
    const now = new Date().toISOString();
    await this.#db.withTransaction(async (tx) => {
      const updated = await tx.query<{ version: unknown }>(
        `UPDATE themes SET definition = $2, name = $3, version = version + 1, updated_at = $4
         WHERE id = $1 RETURNING version`,
        [current.id, toJsonParam(merged), merged.name, now],
      );
      const versionRow = updated.rows[0];
      if (!versionRow) {
        throw new SenifyError("not_found", `Theme for site "${siteId}" does not exist`, {
          field: "siteId",
        });
      }
      const newVersion = toFiniteNumber(versionRow.version, "version");
      const { text, params } = buildAuditInsert([
        {
          siteId,
          pageId: null,
          batchId: newEntityId(),
          opIndex: 0,
          mutation: "update_theme",
          params: { patch, previous: currentDefinition },
          author,
          undoPatch: [],
          draftVersionAfter: newVersion,
        },
      ]);
      await tx.query(text, params);
      return newVersion;
    });
    return this.getTheme(siteId);
  }

  // ------------------------------------------------- style rules (Phase 2)
  //
  // The rule registry is site-wide: a reusable class (`hero-button`) applies to
  // every page, so it belongs to the site and not to a page draft. Reads are
  // tolerant (a corrupt entry drops, it never blocks the registry), writes are
  // hard (the shape either matches `StyleRuleSchema` or the write fails with
  // the offending field).
  //
  // Every write appends to the same append-only audit log the page mutations
  // use (`pageId: null`), so a rule change is traceable like any other edit.

  async #readStyleRules(siteId: string, client: DbClient = this.#db): Promise<StyleRule[]> {
    const result = await client.query<StyleRuleRow>(
      `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${siteId}" does not exist`, {
        field: "siteId",
        suggestion: "Create the site first or check the id.",
      });
    }
    if (row.style_rules_json === null || row.style_rules_json === undefined) {
      return [];
    }
    return parseStyleRuleRegistry(toJson<unknown>(row.style_rules_json));
  }

  async getStyleRegistry(siteId: string): Promise<{ version: number; rules: StyleRule[] }> {
    const result = await this.#db.query<StyleRuleRow>(
      `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${siteId}" does not exist`, { field: "siteId" });
    }
    return {
      version: toFiniteNumber(row.style_rules_version ?? 0, "style_rules_version"),
      rules:
        row.style_rules_json === null || row.style_rules_json === undefined
          ? []
          : parseStyleRuleRegistry(toJson<unknown>(row.style_rules_json)),
    };
  }

  async listStyleRules(siteId: string): Promise<StyleRule[]> {
    return (await this.getStyleRegistry(siteId)).rules;
  }

  async getStyleRule(siteId: string, ruleId: string): Promise<StyleRule> {
    const rules = await this.#readStyleRules(siteId);
    const found = rules.find((rule) => rule.id === ruleId);
    if (found === undefined) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
        suggestion: "List the style rules of the site and pick an existing id.",
      });
    }
    return found;
  }

  // Rollback path of the release manifest (E2): the snapshot's registry
  // replaces the current one. Every rule passes the same hard checks as a
  // normal write; the audit records the restore, not the whole array.
  async replaceStyleRules(
    siteId: string,
    rules: readonly StyleRule[],
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    rules.forEach((rule, index) =>
      this.#assertWritableRule(rule, `rules[${index}]`),
    );
    return this.#writeStyleRules(siteId, [...rules], {
      mutation: "restoreReleaseStyleRules",
      params: { count: rules.length },
      author,
      baseVersion,
    });
  }

  // Framer import (plan S3.1): appends the imported rules to the site
  // registry with their `framer-import` origin intact. Every rule passes the
  // same hard checks as a manual write; the audit records the import, so an
  // undo of the batch does not need to touch the site-wide registry.
  async appendImportedStyleRules(
    siteId: string,
    rules: readonly StyleRule[],
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    const existing = await this.#readStyleRules(siteId);
    const appended = rules.map((rule, index) => {
      const ordered: StyleRule = { ...rule, order: existing.length + index };
      this.#assertWritableRule(ordered, `rules[${index}]`);
      return ordered;
    });
    return this.#writeStyleRules(siteId, [...existing, ...appended], {
      mutation: "importFramerStyleRules",
      params: { count: appended.length },
      author,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    });
  }

  // The whole registry is rewritten in one transaction-free UPDATE: the array
  // is the document, so a partial write cannot leave two sources of truth. The
  // audit entry records what changed, not the whole array.
  async #writeStyleRules(
    siteId: string,
    rules: StyleRule[],
    event: { mutation: string; params: Record<string, unknown>; author: Author; baseVersion?: number },
  ): Promise<StyleRule[]> {
    const normalized = normalizeRuleOrder(rules);
    return this.#db.withTransaction(async (tx) => {
      const locked = await tx.query<StyleRuleRow>(
        `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      const current = locked.rows[0];
      if (!current) {
        throw new SenifyError("not_found", `Site "${siteId}" does not exist`, { field: "siteId" });
      }
      const version = toFiniteNumber(current.style_rules_version ?? 0, "style_rules_version");
      if (event.baseVersion !== undefined && event.baseVersion !== version) {
        throw new SenifyError("conflict", "Die Style-Registry wurde zwischenzeitlich geändert", {
          field: "baseVersion",
          suggestion: "Lade die Style-Registry neu und sende den Write erneut.",
        });
      }
      const nextVersion = version + 1;
      const now = new Date().toISOString();
      const result = await tx.query<{ style_rules_version: unknown }>(
        `UPDATE sites
         SET style_rules_json = $2, style_rules_version = $3, updated_at = $4
         WHERE id = $1 RETURNING style_rules_version`,
        [siteId, toJsonParam(normalized), nextVersion, now],
      );
      if (result.rows.length === 0) {
        throw new SenifyError("not_found", `Site "${siteId}" does not exist`, { field: "siteId" });
      }
      const { text, params } = buildAuditInsert([
        {
          siteId,
          pageId: null,
          batchId: newEntityId(),
          opIndex: 0,
          mutation: event.mutation,
          params: { ...event.params, styleRegistryVersion: nextVersion },
          author: event.author,
          undoPatch: [],
          draftVersionAfter: nextVersion,
        },
      ]);
      await tx.query(text, params);
      return normalized;
    });
  }

  // Hard shape check of one rule plus the semantic rules the schema cannot
  // express: context ids may not shadow the device suffixes, a scoped rule
  // must name its node, and an ambient rule needs a real selector.
  #assertWritableRule(rule: StyleRule, field: string): void {
    const errors = StyleRuleSchemaErrors(rule);
    if (errors.length > 0) {
      throw new SenifyError("validation", `Invalid style rule: ${errors[0]}`, {
        field,
        suggestion: "Check the rule against the documented shape.",
      });
    }
    if (rule.rawCss !== undefined && !isSafeRawCss(rule.rawCss)) {
      throw new SenifyError("validation", "rawCss must be a single @keyframes block", {
        field: `${field}.rawCss`,
        suggestion:
          "Only sanitised @keyframes are carried verbatim; everything else is structured.",
      });
    }
    if (rule.rawCss !== undefined) {
      const violation = rawCssViolations(rule.rawCss, `${field}.rawCss`)[0];
      if (violation !== undefined) {
        throw new SenifyError("validation", violation.message, {
          field: violation.field,
          suggestion: violation.suggestion,
        });
      }
    }
    const reserved = reservedContextIds(rule);
    if (reserved.length > 0) {
      throw new SenifyError(
        "validation",
        `Context id "${reserved[0]}" is reserved for a built-in device`,
        {
          field: `${field}.contextStyles`,
          suggestion:
            "Use the device suffix form (`padding_tablet`) for tablet and mobile; use context ids only for custom conditions.",
        },
      );
    }
  }

  // Ticket 18, slice 3: the value-level fence for agent writes. The theme is
  // loaded only when there is something to check, so human writes pay nothing.
  async #assertAgentValues(siteId: string, bags: readonly StyleBag[]): Promise<void> {
    if (bags.length === 0) return;
    const theme = (await this.getTheme(siteId)).theme;
    const violation = agentStyleViolations({ theme, bags })[0];
    if (violation === undefined) return;
    throw new SenifyError("validation", violation.message, {
      field: violation.field,
      suggestion: violation.suggestion,
    });
  }

  // Ambient rules and rawCss stay a human capability: an agent cannot author
  // free selectors or free CSS (ticket 18; ADR-0005 keeps the property space
  // open, this closes only the value form for agents).
  #assertAgentRuleKind(rule: { kind: StyleRule["kind"]; rawCss?: string }): void {
    if (rule.kind === "ambient") {
      throw new SenifyError(
        "validation",
        "Ambient rules are authored in the editor, not by agents",
        {
          field: "rule.kind",
          suggestion: "Use a class or scoped rule; ambient selectors stay human.",
        },
      );
    }
    if (rule.rawCss !== undefined) {
      throw new SenifyError(
        "validation",
        "rawCss is authored in the editor, not by agents",
        {
          field: "rule.rawCss",
          suggestion: "Use a registered motion preset instead of a custom animation.",
        },
      );
    }
  }

  async createStyleRule(
    siteId: string,
    input: {
      id?: string;
      name: string;
      kind?: "class" | "ambient" | "scoped";
      selector?: string;
      nodeId?: string;
      description?: string;
      styles?: Record<string, unknown>;
      contextStyles?: Record<string, Record<string, unknown>>;
      baseVersion?: number;
    },
    author: Author,
  ): Promise<StyleRule> {
    const rules = await this.#readStyleRules(siteId);
    const kind = input.kind ?? "class";

    let rule: StyleRule;
    try {
      rule = buildStyleRule(input, kind, input.id ?? newEntityId(), rules.length);
    } catch (error) {
      throw new SenifyError(
        "validation",
        error instanceof Error ? error.message : "Invalid style rule",
        { field: "name", suggestion: "Check the class name or selector." },
      );
    }

    // Provenance comes from the token, never from the body (ticket 18): only
    // an agent token produces an agent-authored rule, and a rule created by
    // the editor stays user-authored even if a body field claims otherwise.
    rule = { ...rule, authoredBy: author.kind === "agent" ? "agent" : "user" };

    // The scope check comes first: a scoped rule derives its name from its node,
    // so a second rule for the same node would also trip the name check and
    // report the wrong cause.
    if (rule.scope !== undefined) {
      assertSingleScopedRule(rules, rule.scope.nodeId, rule.id);
    }
    if (kind !== "ambient") {
      assertClassNameFree(rules, rule.name, rule.id, "name");
    }
    this.#assertWritableRule(rule, "rule");
    if (author.kind === "agent") {
      this.#assertAgentRuleKind(rule);
      await this.#assertAgentValues(siteId, styleRuleBags(rule, "rule"));
    }

    const next = [...rules, rule];
    const written = await this.#writeStyleRules(siteId, next, {
      mutation: "create_style_rule",
      params: { ruleId: rule.id, name: rule.name, kind: rule.kind },
      author,
      ...(input.baseVersion === undefined ? {} : { baseVersion: input.baseVersion }),
    });
    return written.find((entry) => entry.id === rule.id) ?? rule;
  }

  async updateStyleRule(
    siteId: string,
    ruleId: string,
    patch: {
      name?: string;
      selector?: string;
      description?: string | null;
      styles?: Record<string, unknown>;
      stylePriorities?: Record<string, "important">;
      states?: Record<string, Record<string, unknown>>;
      statePriorities?: Record<string, Record<string, "important">>;
      contextStyles?: Record<string, Record<string, unknown>>;
      contextStylePriorities?: Record<string, Record<string, "important">>;
      rawCss?: string | null;
      baseVersion?: number;
    },
    author: Author,
  ): Promise<StyleRule> {
    const rules = await this.#readStyleRules(siteId);
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    const current = rules[index]!;
    const next: StyleRule = { ...current, styles: { ...current.styles }, contextStyles: { ...current.contextStyles } };

    if (patch.name !== undefined) {
      if (current.kind === "ambient") {
        throw new SenifyError(
          "validation",
          "An ambient rule is renamed through its selector",
          {
            field: "name",
            suggestion: "Send `selector` instead; the name mirrors it.",
          },
        );
      }
      if (current.scope !== undefined) {
        throw new SenifyError("validation", "A scoped rule cannot be renamed", {
          field: "name",
          suggestion: "Scoped rules are owned by their node and generated.",
        });
      }
      try {
        next.name = assertValidClassName(patch.name);
      } catch (error) {
        throw new SenifyError(
          "validation",
          error instanceof Error ? error.message : "Invalid style class name",
          { field: "name" },
        );
      }
      next.selector = classKindSelector(next.name);
      assertClassNameFree(rules, next.name, ruleId, "name");
    }

    if (patch.selector !== undefined) {
      if (current.kind !== "ambient") {
        throw new SenifyError(
          "validation",
          "Only an ambient rule carries a free selector",
          {
            field: "selector",
            suggestion: "A class rule derives its selector from its name.",
          },
        );
      }
      const selector = patch.selector.trim();
      if (!isWritableSelector(selector)) {
        throw new SenifyError("validation", `Invalid CSS selector "${patch.selector}"`, {
          field: "selector",
        });
      }
      next.selector = selector;
      next.name = selector;
    }

    if (patch.description !== undefined) {
      if (patch.description === null) delete next.description;
      else next.description = patch.description;
    }
    if (patch.styles !== undefined) {
      next.styles = { ...next.styles, ...(patch.styles as StyleRule["styles"]) };
    }
    if (patch.contextStyles !== undefined) {
      next.contextStyles = {
        ...next.contextStyles,
        ...(patch.contextStyles as StyleRule["contextStyles"]),
      };
    }
    if (patch.states !== undefined) {
      const states: NonNullable<StyleRule["states"]> = { ...next.states };
      for (const state of STATE_ORDER) {
        const bag = patch.states[state];
        if (bag !== undefined) states[state] = { ...(bag as StyleRule["styles"]) };
      }
      next.states = states;
    }
    if (patch.stylePriorities !== undefined) {
      next.stylePriorities = { ...next.stylePriorities, ...patch.stylePriorities };
    }
    if (patch.statePriorities !== undefined) {
      const statePriorities: NonNullable<StyleRule["statePriorities"]> = {
        ...next.statePriorities,
      };
      for (const state of STATE_ORDER) {
        const priority = patch.statePriorities[state];
        if (priority !== undefined) statePriorities[state] = { ...priority };
      }
      next.statePriorities = statePriorities;
    }
    if (patch.contextStylePriorities !== undefined) {
      next.contextStylePriorities = {
        ...next.contextStylePriorities,
        ...patch.contextStylePriorities,
      };
    }
    if (patch.rawCss !== undefined) {
      if (patch.rawCss === null) delete next.rawCss;
      else next.rawCss = patch.rawCss;
    }
    next.updatedAt = new Date().toISOString();
    this.#assertWritableRule(next, "rule");
    if (author.kind === "agent") {
      // The fence checks only what the patch writes, not the whole rule: a
      // human value that predates the fence must not block an unrelated edit.
      if (patch.rawCss !== undefined) {
        throw new SenifyError(
          "validation",
          "rawCss is authored in the editor, not by agents",
          {
            field: "rule.rawCss",
            suggestion: "Use a registered motion preset instead of a custom animation.",
          },
        );
      }
      if (patch.selector !== undefined) {
        throw new SenifyError(
          "validation",
          "Ambient selectors are authored in the editor, not by agents",
          {
            field: "rule.selector",
            suggestion: "Change the rule's styles; selectors stay human.",
          },
        );
      }
      const bags: StyleBag[] = [];
      if (patch.styles !== undefined) {
        bags.push({ field: "rule.styles", values: patch.styles });
      }
      if (patch.states !== undefined) {
        for (const [state, values] of Object.entries(patch.states)) {
          if (values !== undefined) {
            bags.push({ field: `rule.states.${state}`, values });
          }
        }
      }
      if (patch.contextStyles !== undefined) {
        for (const [contextId, values] of Object.entries(patch.contextStyles)) {
          if (values !== undefined) {
            bags.push({ field: `rule.contextStyles.${contextId}`, values });
          }
        }
      }
      await this.#assertAgentValues(siteId, bags);
    }

    const result = [...rules];
    result[index] = next;
    const written = await this.#writeStyleRules(siteId, result, {
      mutation: "update_style_rule",
      params: { ruleId, patch: Object.keys(patch) },
      author,
      ...(patch.baseVersion === undefined ? {} : { baseVersion: patch.baseVersion }),
    });
    return written[index] ?? next;
  }

  async deleteStyleRule(
    siteId: string,
    ruleId: string,
    author: Author,
    baseVersion?: number,
  ): Promise<void> {
    const rules = await this.#readStyleRules(siteId);
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    const next = rules.filter((rule) => rule.id !== ruleId);
    await this.#writeStyleRules(siteId, next, {
      mutation: "delete_style_rule",
      params: { ruleId, name: rules[index]!.name, kind: rules[index]!.kind },
      author,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    });
  }

  // Reorder is a permutation of the array; `order` is normalized to the array
  // position afterwards, so a stale number can never win over it.
  async reorderStyleRule(
    siteId: string,
    ruleId: string,
    toIndex: number,
    author: Author,
    baseVersion?: number,
  ): Promise<StyleRule[]> {
    const rules = await this.#readStyleRules(siteId);
    const from = rules.findIndex((rule) => rule.id === ruleId);
    if (from < 0) {
      throw new SenifyError("not_found", `Style rule "${ruleId}" does not exist`, {
        field: "ruleId",
      });
    }
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= rules.length) {
      throw new SenifyError(
        "validation",
        `Index ${toIndex} is outside the style rule list`,
        {
          field: "index",
          suggestion: `Use an index between 0 and ${rules.length - 1}.`,
        },
      );
    }
    if (from === toIndex) return rules;

    const moved = rules[from]!;
    // Reordering a rule another author wrote is allowed, but the audit marks
    // it (ticket 18, point 2): the rule keeps its provenance, the entry names
    // the foreign authorship.
    const expected = author.kind === "agent" ? "agent" : "user";
    const authoredBy = moved.authoredBy ?? "user";
    const next = [...rules];
    next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    return this.#writeStyleRules(siteId, next, {
      mutation: "reorder_style_rule",
      params: {
        ruleId,
        from,
        to: toIndex,
        ...(authoredBy === expected ? {} : { foreignAuthoredBy: authoredBy }),
      },
      author,
      ...(baseVersion === undefined ? {} : { baseVersion }),
    });
  }

  async listPageDrafts(siteId: string): Promise<Page[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.site_id = $1 ORDER BY p.created_at ASC, p.id ASC`,
      [siteId],
    );
    return result.rows.map((row) => mapPage(row));
  }

  async createPage(siteId: string, input: CreatePageInput): Promise<Page> {
    await this.getSite(siteId);
    const title = input.title?.trim() ? input.title.trim() : "Neue Seite";
    const now = new Date().toISOString();
    const id = newEntityId();
    const rootId = newNodeId();
    const draft: NodeTree = {
      rootNodeId: rootId,
      nodes: { [rootId]: { id: rootId, type: PAGE_ROOT_TYPE, props: {} } },
    };

    if (input.path !== undefined) {
      const path = input.path.trim();
      assertPagePathFormat(path);
      try {
        return await this.#insertPage(id, siteId, path, title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new SenifyError(
            "conflict",
            `Page path "${path}" is already in use on this site`,
            {
              field: "path",
              suggestion: "Choose a different page path.",
            },
          );
        }
        throw error;
      }
    }
    const existing = await this.#pageCount(siteId);
    // TOCTOU note: two concurrent first-page creates can both read 0 and
    // race for "/". The UNIQUE(site_id, path) constraint decides; the loser
    // retries through the suffix loop below instead of failing.
    if (existing === 0) {
      try {
        return await this.#insertPage(id, siteId, "/", title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Lost the race for "/" — fall through to suffix generation below.
        } else {
          throw error;
        }
      }
    }
    const base = slugify(title);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const path = attempt === 0 ? `/${base}` : `/${base}-${attempt + 1}`;
      try {
        return await this.#insertPage(id, siteId, path, title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new SenifyError("conflict", `Page path "/${base}" is already in use`, {
      field: "path",
      suggestion: "Choose a different page path.",
    });
  }

  async #pageCount(siteId: string): Promise<number> {
    const result = await this.#db.query<{ count: unknown }>(
      `SELECT COUNT(*) AS count FROM pages WHERE site_id = $1`,
      [siteId],
    );
    return toFiniteNumber(result.rows[0]?.count ?? 0, "count");
  }

  async #insertPage(
    id: string,
    siteId: string,
    path: string,
    title: string,
    draft: NodeTree,
    now: string,
  ): Promise<Page> {
    const result = await this.#db.query<PageRow>(
      `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $7)
       RETURNING id, site_id, path, title, meta, draft, draft_version, created_at, updated_at`,
      [id, siteId, path, title, toJsonParam({}), toJsonParam(draft), now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Page insert returned no row");
    return mapPage(row);
  }

  async listLibraryComponents(): Promise<LibraryComponent[]> {
    const result = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components ORDER BY updated_at DESC, id DESC`,
    );
    return result.rows.map(mapLibraryComponent);
  }

  async getLibraryComponent(id: string): Promise<LibraryComponent> {
    const result = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Library component "${id}" does not exist`, {
        field: "componentId",
      });
    }
    return mapLibraryComponent(row);
  }

  async createLibraryComponent(input: LibraryCreateInput): Promise<LibraryComponent> {
    assertDraftShape(input.definition);
    const existing = await this.#db.query<LibraryComponentRow>(
      `SELECT ${LIBRARY_COLUMNS} FROM library_components WHERE fingerprint = $1`,
      [input.fingerprint],
    );
    if (existing.rows[0]) return mapLibraryComponent(existing.rows[0]);
    const now = new Date().toISOString();
    const result = await this.#db.query<LibraryComponentRow>(
      `INSERT INTO library_components
        (id, name, slug, kind, definition, fingerprint, tags, provenance, license, notes, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $11)
       RETURNING ${LIBRARY_COLUMNS}`,
      [
        input.id,
        input.name,
        slugify(input.name),
        input.kind,
        toJsonParam(input.definition),
        input.fingerprint,
        toJsonParam(input.tags),
        toJsonParam(input.provenance),
        toJsonParam(input.license),
        input.notes,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Library component insert returned no row");
    await this.appendAudit([{
      siteId: "__library__",
      pageId: null,
      batchId: input.id,
      opIndex: 0,
      mutation: "library.component.created",
      params: { componentId: input.id, version: 1 },
      author: input.author,
      undoPatch: [],
      draftVersionAfter: 0,
    }]);
    return mapLibraryComponent(row);
  }

  async updateLibraryComponent(input: LibraryPatchInput): Promise<LibraryComponent> {
    const current = await this.getLibraryComponent(input.id);
    const now = new Date().toISOString();
    const result = await this.#db.query<LibraryComponentRow>(
      `UPDATE library_components SET
        name = $2, tags = $3, notes = $4, license = $5,
        version = version + 1, deprecated_at = $6, updated_at = $7
       WHERE id = $1 RETURNING ${LIBRARY_COLUMNS}`,
      [
        input.id,
        input.name ?? current.name,
        toJsonParam(input.tags ?? current.tags),
        input.notes ?? current.notes,
        toJsonParam(input.license ?? current.license),
        input.deprecated === true ? now : input.deprecated === false ? null : current.deprecatedAt,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library component "${input.id}" does not exist`, { field: "componentId" });
    await this.appendAudit([{
      siteId: "__library__", pageId: null, batchId: input.id, opIndex: 0,
      mutation: input.deprecated === true ? "library.component.deprecated" : "library.component.updated",
      params: { componentId: input.id, version: row.version },
      author: input.author, undoPatch: [], draftVersionAfter: 0,
    }]);
    return mapLibraryComponent(row);
  }

  async deleteLibraryComponent(id: string): Promise<LibraryComponent> {
    const component = await this.getLibraryComponent(id);
    const installs = await this.#db.query<{ id: string }>(
      `SELECT id FROM site_library_installs WHERE library_component_id = $1 LIMIT 1`,
      [id],
    );
    if (installs.rows.length > 0) {
      throw new SenifyError("conflict", "Library component is still installed", { field: "componentId" });
    }
    await this.#db.query(`DELETE FROM library_components WHERE id = $1`, [id]);
    return component;
  }

  async listLibraryInstalls(siteId: string): Promise<LibraryInstall[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE site_id = $1 ORDER BY updated_at DESC, id DESC`,
      [siteId],
    );
    return result.rows.map(mapLibraryInstall);
  }

  async installLibraryComponent(input: LibraryInstallInput): Promise<LibraryInstall> {
    const site = await this.getSite(input.siteId);
    const component = await this.getLibraryComponent(input.componentId);
    const now = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO site_library_installs (id, site_id, library_component_id, installed_version, mode, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (site_id, library_component_id) DO UPDATE SET
         installed_version = EXCLUDED.installed_version, mode = EXCLUDED.mode, updated_at = EXCLUDED.updated_at`,
      [input.id, input.siteId, input.componentId, component.version, input.mode, now],
    );
    if (input.pageId !== undefined) {
      const page = await this.getPage(input.pageId);
      if (page.siteId !== site.id) throw new SenifyError("validation", "Page belongs to another site", { field: "pageId" });
      const tree = structuredClone(page.draft) as NodeTree;
      const definitionRoot = component.definition.nodes[component.definition.rootNodeId];
      if (definitionRoot === undefined) throw new SenifyError("validation", "Library component has no root", { field: "definition" });
      const ids = new Map<string, string>();
      for (const id of Object.keys(component.definition.nodes)) ids.set(id, newEntityId());
      const definitionId = ids.get(component.definition.rootNodeId) as string;
      for (const [oldId, node] of Object.entries(component.definition.nodes)) {
        const nextId = ids.get(oldId) as string;
        const children = node.children?.map((id) => ids.get(id) as string);
        const slots = node.slots === undefined
          ? undefined
          : Object.fromEntries(Object.entries(node.slots).map(([slot, slotIds]) => [slot, slotIds.map((id) => ids.get(id) as string)]));
        tree.nodes[nextId] = { ...node, id: nextId, ...(children === undefined ? {} : { children }), ...(slots === undefined ? {} : { slots }), props: { ...node.props, name: component.name, version: component.version, libraryComponentId: component.id, libraryOrigin: "linked" } };
      }
      const instanceId = newEntityId();
      tree.nodes[instanceId] = { id: instanceId, type: "__component_instance", props: { componentId: definitionId, componentVersion: component.version, name: component.name, libraryComponentId: component.id, libraryOrigin: "linked" }, children: [] };
      const root = tree.nodes[tree.rootNodeId];
      if (root === undefined) throw new SenifyError("validation", "Page root is missing", { field: "pageId" });
      const parentId = input.parentNodeId ?? tree.rootNodeId;
      const parent = tree.nodes[parentId];
      if (parent === undefined) throw new SenifyError("not_found", `Target node "${parentId}" does not exist`, { field: "parentNodeId" });
      parent.children = [...(parent.children ?? []), definitionId, instanceId];
      const definitionNode = tree.nodes[definitionId];
      if (definitionNode !== undefined) {
        definitionNode.type = "__component";
        definitionNode.props = { ...definitionNode.props, name: component.name, version: component.version, libraryComponentId: component.id, libraryOrigin: "linked" };
      }
      const result = await this.persistBatch({
        pageId: page.id, expectedVersion: page.draftVersion, draft: tree,
        title: page.title, path: page.path,
        entries: [{ siteId: site.id, pageId: page.id, batchId: input.id, opIndex: 0, mutation: "library.component.installed", params: { componentId: component.id, version: component.version }, author: input.author, undoPatch: [], draftVersionAfter: page.draftVersion + 1 }],
      });
      void result;
    }
    const row = (await this.#db.query<LibraryInstallRow>(`SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE site_id = $1 AND library_component_id = $2`, [input.siteId, input.componentId])).rows[0];
    if (!row) throw new Error("Library install insert returned no row");
    return mapLibraryInstall(row);
  }

  async updateLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
    const current = (await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE id = $1`,
      [id],
    )).rows[0];
    if (!current) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    const component = await this.getLibraryComponent(current.library_component_id);
    const result = await this.#db.query<LibraryInstallRow>(
      `UPDATE site_library_installs SET installed_version = $2, updated_at = $3 WHERE id = $1 RETURNING ${LIBRARY_INSTALL_COLUMNS}`,
      [id, component.version, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    await this.appendAudit([{ siteId: row.site_id, pageId: null, batchId: id, opIndex: 0, mutation: "library.install.updated", params: { componentId: row.library_component_id, version: row.installed_version }, author, undoPatch: [], draftVersionAfter: 0 }]);
    return mapLibraryInstall(row);
  }

  async deleteLibraryInstall(id: string, author: Author): Promise<LibraryInstall> {
    const current = (await this.#db.query<LibraryInstallRow>(
      `SELECT ${LIBRARY_INSTALL_COLUMNS} FROM site_library_installs WHERE id = $1`,
      [id],
    )).rows[0];
    if (!current) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    const component = await this.getLibraryComponent(current.library_component_id);
    const pages = await this.listPages(current.site_id);
    for (const summary of pages) {
      const page = await this.getPage(summary.id);
      const tree = structuredClone(page.draft) as NodeTree;
      let changed = false;
      for (const node of Object.values(tree.nodes)) {
        if (node.type === "__component_instance" && node.props["libraryComponentId"] === component.id) {
          node.type = "__component";
          node.props = {
            ...node.props,
            name: component.name,
            version: component.version,
            libraryOrigin: "detached",
            libraryDetachedFrom: component.id,
          };
          delete node.props["componentId"];
          delete node.props["libraryComponentId"];
          changed = true;
        }
        if (node.type === "__component" && node.props["libraryComponentId"] === component.id) {
          node.props = {
            ...node.props,
            libraryOrigin: "detached",
            libraryDetachedFrom: component.id,
          };
          delete node.props["libraryComponentId"];
          changed = true;
        }
      }
      if (!changed) continue;
      await this.persistBatch({
        pageId: page.id,
        expectedVersion: page.draftVersion,
        draft: tree,
        title: page.title,
        path: page.path,
        entries: [{
          siteId: page.siteId,
          pageId: page.id,
          batchId: id,
          opIndex: 0,
          mutation: "library.install.detached",
          params: { componentId: component.id, version: component.version },
          author,
          undoPatch: [],
          draftVersionAfter: page.draftVersion + 1,
        }],
      });
    }
    const result = await this.#db.query<LibraryInstallRow>(
      `DELETE FROM site_library_installs WHERE id = $1 RETURNING ${LIBRARY_INSTALL_COLUMNS}`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new SenifyError("not_found", `Library install "${id}" does not exist`, { field: "installId" });
    await this.appendAudit([{ siteId: row.site_id, pageId: null, batchId: id, opIndex: 0, mutation: "library.install.detached", params: { componentId: row.library_component_id }, author, undoPatch: [], draftVersionAfter: 0 }]);
    return mapLibraryInstall(row);
  }

  async listLibraryAudit(): Promise<LibraryAuditEntry[]> {
    const result = await this.#db.query<{ mutation: string; params: unknown; author: unknown; site_id: string; created_at: unknown }>(
      `SELECT mutation, params, author, site_id, created_at FROM audit_entries WHERE mutation LIKE 'library.%' ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => ({ componentId: String((toJson<Record<string, unknown>>(row.params) ?? {}).componentId ?? ""), siteId: row.site_id === "__library__" ? null : row.site_id, action: row.mutation.endsWith("created") ? "created" : row.mutation.endsWith("installed") ? "installed" : row.mutation.endsWith("detached") ? "detached" : row.mutation.endsWith("deprecated") ? "deprecated" : "updated", author: toJson<Author>(row.author), createdAt: toIso(row.created_at) }));
  }

  async listPages(siteId: string): Promise<PageSummary[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<PageSummaryRow>(
      `SELECT ${PAGE_SUMMARY_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.site_id = $1 ORDER BY p.created_at ASC, p.id ASC`,
      [siteId],
    );
    return result.rows.map((row) => toSummary(row));
  }

  async getPage(id: string): Promise<Page> {
    const result = await this.#db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Page "${id}" does not exist`, {
        field: "pageId",
        suggestion: "Create the page first or check the id.",
      });
    }
    return mapPage(row);
  }

  // Upsert of the template/layout row (the page itself is never touched).
  async setPageTemplate(input: {
    pageId: string;
    template: PageTemplate | null;
    layoutId: string | null;
  }): Promise<Page> {
    const now = new Date().toISOString();
    const kind = input.template?.kind ?? null;
    const collectionIds =
      input.template?.kind === "collection" ? input.template.collectionIds : [];
    const priority = input.template?.kind === "collection" ? input.template.priority : 0;
    await this.#db.query(
      `INSERT INTO page_templates
        (page_id, kind, collection_ids, priority, layout_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (page_id) DO UPDATE SET
         kind = EXCLUDED.kind,
         collection_ids = EXCLUDED.collection_ids,
         priority = EXCLUDED.priority,
         layout_id = EXCLUDED.layout_id,
         updated_at = EXCLUDED.updated_at`,
      [
        input.pageId,
        kind,
        toJsonParam(collectionIds),
        priority,
        input.layoutId,
        now,
      ],
    );
    return this.getPage(input.pageId);
  }

  async deletePage(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM pages WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Page "${id}" does not exist`, {
        field: "pageId",
      });
    }
  }

  async updatePage(
    id: string,
    expectedVersion: number,
    changes: { draft: NodeTree; title: string; path: string },
  ): Promise<number> {
    assertPagePathFormat(changes.path);
    try {
      const result = await this.#db.query<{ draft_version: unknown }>(
        `UPDATE pages
         SET draft = $2, title = $3, path = $4, draft_version = draft_version + 1, updated_at = $5
         WHERE id = $1 AND draft_version = $6
         RETURNING draft_version`,
        [id, toJsonParam(changes.draft), changes.title, changes.path, new Date().toISOString(), expectedVersion],
      );
      const row = result.rows[0];
      if (!row) {
        const current = await this.#db.query<{ draft_version: unknown }>(
          `SELECT draft_version FROM pages WHERE id = $1`,
          [id],
        );
        const currentRow = current.rows[0];
        if (!currentRow) {
          throw new SenifyError("not_found", `Page "${id}" does not exist`, {
            field: "pageId",
          });
        }
        throw draftConflictError(
          expectedVersion,
          toFiniteNumber(currentRow.draft_version, "draft_version"),
        );
      }
      return Number(row.draft_version);
    } catch (error) {
      if (error instanceof SenifyError) throw error;
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Page path "${changes.path}" is already in use on this site`,
          {
            field: "path",
            suggestion: "Choose a different page path.",
          },
        );
      }
      throw error;
    }
  }

  async appendAudit(entries: NewAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { text, params } = buildAuditInsert(entries);
    await this.#db.query(text, params);
  }

  async assertPathFree(
    siteId: string,
    pageId: string,
    path: string,
  ): Promise<void> {
    assertPagePathFormat(path);
    const result = await this.#db.query<{ id: string }>(
      `SELECT id FROM pages WHERE site_id = $1 AND path = $2 AND id <> $3`,
      [siteId, path, pageId],
    );
    if (result.rows.length > 0) {
      throw new SenifyError(
        "conflict",
        `Page path "${path}" is already in use on this site`,
        {
          field: "path",
          suggestion: "Choose a different page path.",
        },
      );
    }
  }

  async persistBatch(input: {
    pageId: string;
    expectedVersion: number;
    draft: NodeTree;
    title: string;
    path: string;
    entries: NewAuditEntry[];
  }): Promise<number> {
    assertPagePathFormat(input.path);
    try {
      return await this.#db.withTransaction(async (tx) => {
        const updated = await tx.query<{ draft_version: unknown }>(
          `UPDATE pages
           SET draft = $2, title = $3, path = $4, draft_version = draft_version + 1, updated_at = $5
           WHERE id = $1 AND draft_version = $6
           RETURNING draft_version`,
          [
            input.pageId,
            toJsonParam(input.draft),
            input.title,
            input.path,
            new Date().toISOString(),
            input.expectedVersion,
          ],
        );
        const row = updated.rows[0];
        if (!row) {
          const current = await tx.query<{ draft_version: unknown }>(
            `SELECT draft_version FROM pages WHERE id = $1`,
            [input.pageId],
          );
          const currentRow = current.rows[0];
          if (!currentRow) {
            throw new SenifyError("not_found", `Page "${input.pageId}" does not exist`, {
              field: "pageId",
            });
          }
          throw draftConflictError(
            input.expectedVersion,
            toFiniteNumber(currentRow.draft_version, "draft_version"),
          );
        }
        if (input.entries.length > 0) {
          const stamped = input.entries.map((entry) => ({
            ...entry,
            draftVersionAfter: toFiniteNumber(row.draft_version, "draft_version"),
          }));
          const { text, params } = buildAuditInsert(stamped);
          await tx.query(text, params);
        }
        return toFiniteNumber(row.draft_version, "draft_version");
      });
    } catch (error) {
      if (error instanceof SenifyError) throw error;
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Page path "${input.path}" is already in use on this site`,
          {
            field: "path",
            suggestion: "Choose a different page path.",
          },
        );
      }
      throw error;
    }
  }

  async listAudit(pageId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.#db.query<AuditRow>(
      `SELECT id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at
       FROM audit_entries WHERE page_id = $1
       ORDER BY created_at DESC, op_index DESC, id DESC LIMIT $2`,
      [pageId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapAudit);
  }

  async listSiteAudit(siteId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.#db.query<AuditRow>(
      `SELECT id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at
       FROM audit_entries WHERE site_id = $1
       ORDER BY created_at DESC, op_index DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapAudit);
  }

  async createToken(input: {
    name: string;
    scopes: TokenScope[];
    expiresAt: string | null;
    kind?: TokenKind;
  }): Promise<{ token: ApiToken; secret: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new SenifyError("validation", "Token name is required", {
        field: "name",
        suggestion: "Give the client a name, e.g. \"Claude Code\".",
      });
    }
    const scopes = [...new Set(input.scopes)];
    if (scopes.length === 0) {
      throw new SenifyError("validation", "A token needs at least one scope", {
        field: "scopes",
        suggestion: 'Use one or more of "read", "write", "publish".',
      });
    }
    // Default "agent": a token created by hand is an integration, not the
    // program's own operator identity (ticket 18).
    const kind: TokenKind = input.kind ?? "agent";
    const generated = generateToken();
    const id = newEntityId();
    await this.#db.query(
      `INSERT INTO api_tokens
        (id, name, kind, scopes, token_hash, token_prefix, created_at, expires_at, last_used_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)`,
      [
        id,
        name,
        kind,
        toJsonParam(scopes),
        generated.hash,
        generated.prefix,
        new Date().toISOString(),
        input.expiresAt,
      ],
    );
    return { token: await this.getToken(id), secret: generated.secret };
  }

  async getToken(id: string): Promise<ApiToken> {
    const result = await this.#db.query<TokenRow>(
      `SELECT id, name, kind, scopes, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Token "${id}" does not exist`, {
        field: "tokenId",
        suggestion: "List tokens with `senify tokens list`.",
      });
    }
    return mapToken(row);
  }

  async listTokens(): Promise<ApiToken[]> {
    const result = await this.#db.query<TokenRow>(
      `SELECT id, name, kind, scopes, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens ORDER BY created_at DESC, id DESC`,
    );
    return result.rows.map(mapToken);
  }

  async findTokenByHash(tokenHash: string): Promise<TokenRecord | undefined> {
    const result = await this.#db.query<TokenRecordRow>(
      `SELECT id, name, kind, scopes, token_hash, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { ...mapToken(row), tokenHash: row.token_hash };
  }

  async revokeToken(id: string): Promise<void> {
    const revoked = await this.#db.query<{ id: string }>(
      `UPDATE api_tokens SET revoked_at = $2
       WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [id, new Date().toISOString()],
    );
    if (revoked.rows.length > 0) return;
    // Unknown ids surface as not_found; revoking twice stays idempotent.
    await this.getToken(id);
  }

  async touchToken(id: string): Promise<void> {
    await this.#db.query(
      `UPDATE api_tokens SET last_used_at = $2 WHERE id = $1`,
      [id, new Date().toISOString()],
    );
  }

  // Self-healing for the program's own token (ticket 18): an installation from
  // before the `kind` column carries "agent" by default; the operator heals
  // its token to "human" on the next start instead of recreating it.
  async updateTokenKind(id: string, kind: TokenKind): Promise<void> {
    const updated = await this.#db.query<{ id: string }>(
      `UPDATE api_tokens SET kind = $2
       WHERE id = $1 AND kind <> $2 RETURNING id`,
      [id, kind],
    );
    if (updated.rows.length > 0) return;
    await this.getToken(id);
  }

  // ------------------------------------------------------- idempotency keys

  // Claim-first (ticket 18, slice 2): the slot is taken before the operation
  // runs, so two concurrent requests with the same key cannot both write.
  // A completed slot replays its stored response; a slot still in flight
  // answers "in_progress"; a slot from a crashed attempt (older than the stale
  // window) may be taken over once. The fingerprint pins the key to the body,
  // so reusing it for a different request fails loudly instead of replaying a
  // foreign response.
  async claimIdempotencyKey(input: {
    tokenId: string;
    route: string;
    key: string;
    fingerprint: string;
  }): Promise<IdempotencyClaim> {
    const now = new Date().toISOString();
    const expired = new Date(Date.now() - IDEMPOTENCY_TTL_MS).toISOString();
    // Slot and marker share one lifetime: removing one without the other would
    // hand a retry a free slot for a write that already happened.
    await this.#db.query(`DELETE FROM idempotency_keys WHERE created_at < $1`, [
      expired,
    ]);
    await this.#db.query(
      `DELETE FROM idempotency_committed WHERE created_at < $1`,
      [expired],
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // The committed marker is checked FIRST (R6): it records that the write
      // behind this key already happened even when its slot is gone (the very
      // failure that used to free the slot and invite a second write). Checking
      // it after the insert would claim the freshly free slot anyway and
      // produce exactly the second entity the marker exists to prevent.
      const seed = await this.#db.query<IdempotencyRow>(
        `SELECT fingerprint, status, response, created_at FROM idempotency_keys
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      const seedRow = seed.rows[0];
      const markerBefore = await this.#db.query(
        `SELECT token_id FROM idempotency_committed
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      if (markerBefore.rows.length > 0) {
        if (seedRow !== undefined && seedRow.fingerprint !== input.fingerprint) {
          return { state: "mismatch" };
        }
        return { state: "committed_unknown" };
      }
      try {
        await this.#db.query(
          `INSERT INTO idempotency_keys
            (token_id, route, idempotency_key, fingerprint, status, response, created_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, $5)`,
          [input.tokenId, input.route, input.key, input.fingerprint, now],
        );
        return { state: "claimed" };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      const existing = await this.#db.query<IdempotencyRow>(
        `SELECT fingerprint, status, response, created_at FROM idempotency_keys
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      const row = existing.rows[0];
      // A committed marker outranks every other reading of the slot (R6): the
      // write happened, so neither a slot that looks stale nor a foreign body
      // may hand this key back to another attempt.
      const marker = await this.#db.query(
        `SELECT token_id FROM idempotency_committed
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      if (marker.rows.length > 0) {
        if (row !== undefined && row.fingerprint !== input.fingerprint) {
          return { state: "mismatch" };
        }
        return { state: "committed_unknown" };
      }
      // Raced with a release between insert and read: try to claim again.
      if (row === undefined) continue;
      if (row.status === null || row.response === null) {
        const age = Date.now() - Date.parse(toIso(row.created_at));
        if (age <= IDEMPOTENCY_STALE_MS) return { state: "in_progress" };
        // A crashed attempt never completes: release it and claim once more.
        await this.#db.query(
          `DELETE FROM idempotency_keys
           WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
          [input.tokenId, input.route, input.key],
        );
        continue;
      }
      if (row.fingerprint !== input.fingerprint) return { state: "mismatch" };
      return {
        state: "replay",
        status: toFiniteNumber(row.status, "status"),
        body: toJson<unknown>(row.response),
      };
    }
    throw new SenifyError(
      "conflict",
      "Idempotency key could not be claimed",
      {
        field: "idempotencyKey",
        suggestion: "Retry the request; use a fresh key for a new operation.",
      },
    );
  }

  async completeIdempotencyKey(input: {
    tokenId: string;
    route: string;
    key: string;
    status: number;
    body: unknown;
  }): Promise<void> {
    const stored = await this.#db.query<{ idempotency_key: unknown }>(
      `UPDATE idempotency_keys SET status = $4, response = $5
       WHERE token_id = $1 AND route = $2 AND idempotency_key = $3
       RETURNING idempotency_key`,
      [
        input.tokenId,
        input.route,
        input.key,
        input.status,
        toJsonParam(input.body ?? null),
      ],
    );
    // An UPDATE that hits no row is not a success: the slot is gone, so the
    // response is stored nowhere and a retry could not replay it. The caller
    // decides what a lost slot means (R6), it must not read this as "done".
    if (stored.rows.length === 0) {
      throw new SenifyError(
        "conflict",
        "The idempotency slot vanished before its response could be stored",
        {
          field: "idempotencyKey",
          suggestion: "Check whether the resource was created before retrying.",
        },
      );
    }
  }

  // Records that the operation behind a key is committed even though its
  // response could not be stored (R6). This is the answer to "may I retry?":
  // no, the write happened, only the response is missing.
  async markIdempotencyCommitted(input: {
    tokenId: string;
    route: string;
    key: string;
  }): Promise<void> {
    try {
      await this.#db.query(
        `INSERT INTO idempotency_committed
          (token_id, route, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)`,
        [input.tokenId, input.route, input.key, new Date().toISOString()],
      );
    } catch (error) {
      // A concurrent attempt already recorded the fact: nothing to add.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  // A failed attempt does not burn the key: releasing it lets the caller retry
  // with the same key (and a corrected body, if the failure was validation).
  async releaseIdempotencyKey(input: {
    tokenId: string;
    route: string;
    key: string;
  }): Promise<void> {
    await this.#db.query(
      `DELETE FROM idempotency_keys
       WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
      [input.tokenId, input.route, input.key],
    );
  }

  // Design records (Fahrplan P2-4, R4). Written once, never updated: a
  // measurement of the same site at a later moment is a new record, not a
  // correction of the old one. That is what makes "this release was green" a
  // fact about the release instead of a claim about the present.
  async createDesignRecord(input: {
    siteId: string;
    stage: DesignRecordStage;
    draftVersion: number;
    themeVersion: number;
    report: DesignReport;
  }): Promise<DesignRecord> {
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
    options: { stage?: DesignRecordStage; limit?: number } = {},
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

  // Replaces the open media needs an apply left (Fahrplan P2-2). Only the
  // `apply_result` column moves, and only its `openMediaNeeds` list: the
  // proposal's status, decision, cards and the rest of the result are the
  // record of what happened and must not shift when someone later closes a
  // need. A closing is a follow-up act, not a rewrite of history.
  async recordMediaNeedResolutions(input: {
    proposalId: string;
    openMediaNeeds: RedesignProposalApplyResult["openMediaNeeds"];
  }): Promise<RedesignProposal> {
    const result = await this.#db.query<{ apply_result: unknown }>(
      `SELECT apply_result FROM redesign_proposals WHERE id = $1`,
      [input.proposalId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Redesign proposal "${input.proposalId}" does not exist`, {
        field: "proposalId",
      });
    }
    const current =
      row.apply_result === null || row.apply_result === undefined
        ? null
        : toJson<RedesignProposalApplyResult>(row.apply_result);
    if (current === null) {
      throw new SenifyError("conflict", "Dieser Vorschlag hat kein Apply-Ergebnis.", {
        field: "proposalId",
      });
    }
    const next = { ...current, openMediaNeeds: input.openMediaNeeds };
    // `sectionPlanApplied` deliberately stays as the apply left it. Closing the
    // last need makes the run COMPLETE, not retroactive: a run that wrote no
    // rebuild does not get to claim it did just because someone supplied the
    // missing image afterwards. The client reads `openMediaNeeds` for "what is
    // left", `sectionPlanApplied` for "what the run did".
    const updated = await this.#db.query<RedesignProposalRow>(
      `UPDATE redesign_proposals SET apply_result = $2 WHERE id = $1
       RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
      [input.proposalId, toJsonParam(next)],
    );
    const stored = updated.rows[0];
    if (!stored) throw new Error("Redesign proposal media-need update returned no row");
    return mapRedesignProposal(stored);
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

  async appendMcpAudit(input: {
    tokenId: string | null;
    client: string;
    tool: string;
    args: Record<string, unknown>;
    result: "ok" | "error";
    entity: string | null;
    durationMs: number;
  }): Promise<McpAuditEntry> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO mcp_audit_entries
        (id, token_id, client, tool, args, result, entity, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.tokenId,
        input.client,
        input.tool,
        toJsonParam(input.args),
        input.result,
        input.entity,
        input.durationMs,
        createdAt,
      ],
    );
    return { id, ...input, createdAt };
  }

  async listMcpAudit(limit = 50): Promise<McpAuditEntry[]> {
    const result = await this.#db.query<McpAuditRow>(
      `SELECT id, token_id, client, tool, args, result, entity, duration_ms, created_at
       FROM mcp_audit_entries
       ORDER BY created_at DESC, id DESC LIMIT $1`,
      [Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapMcpAudit);
  }

  async createRevision(input: {
    pageId: string;
    siteId: string;
    title: string;
    path: string;
    tree: NodeTree;
    author: Author;
    note: string | null;
  }): Promise<PageRevision> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO page_revisions
        (id, page_id, site_id, tree, title, path, author, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.pageId,
        input.siteId,
        toJsonParam(input.tree),
        input.title,
        input.path,
        toJsonParam(input.author),
        input.note,
        createdAt,
      ],
    );
    return {
      id,
      pageId: input.pageId,
      siteId: input.siteId,
      title: input.title,
      path: input.path,
      tree: input.tree,
      author: input.author,
      note: input.note,
      createdAt,
    };
  }

  async getRevision(id: string): Promise<PageRevision> {
    const result = await this.#db.query<RevisionRow>(
      `SELECT id, page_id, site_id, tree, title, path, author, note, created_at
       FROM page_revisions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Revision "${id}" does not exist`, {
        field: "revisionId",
      });
    }
    return mapRevision(row);
  }

  async listRevisions(pageId: string, limit = 50): Promise<RevisionSummary[]> {
    const result = await this.#db.query<RevisionRow>(
      `SELECT id, page_id, site_id, tree, title, path, author, note, created_at
       FROM page_revisions WHERE page_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [pageId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapRevision).map(toRevisionSummary);
  }

  async createRelease(input: {
    siteId: string;
    pageRevisions: ReleasePageRevision[];
    themeSnapshot: unknown;
    buildRef: string | null;
    manifest?: ReleaseManifest | null;
    author: Author;
    note: string | null;
    basisReleaseId: string | null;
  }): Promise<Release> {
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
  async activateRelease(input: {
    siteId: string;
    releaseId: string;
    buildRef: string;
  }): Promise<void> {
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

  async finalizeRelease(input: {
    siteId: string;
    releaseId: string;
    buildRef: string;
    manifest: ReleaseManifest;
  }): Promise<void> {
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

  // ------------------------------------------------------- deployments (E14)

  async createDeployment(input: {
    siteId: string;
    releaseId: string;
    provider: DeployProvider;
    target: string;
    author: Author;
  }): Promise<Deployment> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO deployments
        (id, site_id, release_id, provider, status, target, file_count, byte_size, error, author, created_at, finished_at)
       VALUES ($1, $2, $3, $4, 'running', $5, 0, 0, NULL, $6, $7, NULL)`,
      [
        id,
        input.siteId,
        input.releaseId,
        input.provider,
        input.target,
        toJsonParam(input.author),
        createdAt,
      ],
    );
    return this.getDeployment(id);
  }

  async finishDeployment(input: {
    id: string;
    status: "succeeded" | "failed";
    fileCount?: number;
    byteSize?: number;
    error?: string;
  }): Promise<Deployment> {
    const finishedAt = new Date().toISOString();
    const updated = await this.#db.query<{ id: string }>(
      `UPDATE deployments
       SET status = $2, file_count = $3, byte_size = $4, error = $5, finished_at = $6
       WHERE id = $1 RETURNING id`,
      [
        input.id,
        input.status,
        input.fileCount ?? 0,
        input.byteSize ?? 0,
        input.error ?? null,
        finishedAt,
      ],
    );
    if (updated.rows.length === 0) {
      throw new SenifyError(
        "not_found",
        `Deployment "${input.id}" does not exist`,
        { field: "deploymentId" },
      );
    }
    return this.getDeployment(input.id);
  }

  async getDeployment(id: string): Promise<Deployment> {    const result = await this.#db.query<DeploymentRow>(
      `SELECT id, site_id, release_id, provider, status, target, file_count, byte_size, error, author, created_at, finished_at
       FROM deployments WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Deployment "${id}" does not exist`, {
        field: "deploymentId",
      });
    }
    return mapDeployment(row);
  }

  async listDeployments(siteId: string, limit = 20): Promise<Deployment[]> {
    const result = await this.#db.query<DeploymentRow>(
      `SELECT id, site_id, release_id, provider, status, target, file_count, byte_size, error, author, created_at, finished_at
       FROM deployments WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapDeployment);
  }

  // ------------------------------------------------------- deploy settings (E14)

  // The settings of a site, or the static defaults when nothing was stored.
  async getDeploySettings(siteId: string): Promise<DeploySettings> {
    await this.getSite(siteId);
    const result = await this.#db.query<DeploySettingsRow>(
      `SELECT provider, netlify_site_id, netlify_token_encrypted,
              vercel_project_id, vercel_token_encrypted, updated_at
       FROM deploy_settings WHERE site_id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    if (!row) {
      return {
        provider: "static",
        netlifySiteId: null,
        hasNetlifyToken: false,
        vercelProjectId: null,
        hasVercelToken: false,
        updatedAt: "",
      };
    }
    return {
      provider: row.provider as DeployProvider,
      netlifySiteId: typeof row.netlify_site_id === "string" ? row.netlify_site_id : null,
      hasNetlifyToken: typeof row.netlify_token_encrypted === "string",
      vercelProjectId: typeof row.vercel_project_id === "string" ? row.vercel_project_id : null,
      hasVercelToken: typeof row.vercel_token_encrypted === "string",
      updatedAt: toIso(row.updated_at),
    };
  }

  // Writes the hosted-provider target. A new token is encrypted; null clears
  // it; omitting keeps it. The plaintext never persists and never returns.
  async updateDeploySettings(
    siteId: string,
    patch: {
      provider?: DeployProvider;
      netlifySiteId?: string | null;
      netlifyTokenEncrypted?: string | null;
      vercelProjectId?: string | null;
      vercelTokenEncrypted?: string | null;
    },
  ): Promise<DeploySettings> {
    await this.getSite(siteId);
    const now = new Date().toISOString();
    const current = await this.getDeploySettings(siteId);
    const row = (
      await this.#db.query<DeploySettingsRow>(
        `SELECT netlify_token_encrypted, vercel_token_encrypted FROM deploy_settings WHERE site_id = $1`,
        [siteId],
      )
    ).rows[0];
    const existingNetlifyToken =
      typeof row?.netlify_token_encrypted === "string" ? row.netlify_token_encrypted : null;
    const nextNetlifyToken =
      patch.netlifyTokenEncrypted === undefined
        ? existingNetlifyToken
        : patch.netlifyTokenEncrypted;
    const existingVercelToken =
      typeof row?.vercel_token_encrypted === "string" ? row.vercel_token_encrypted : null;
    const nextVercelToken =
      patch.vercelTokenEncrypted === undefined
        ? existingVercelToken
        : patch.vercelTokenEncrypted;
    const provider = patch.provider ?? current.provider;
    const netlifySiteId =
      patch.netlifySiteId === undefined ? current.netlifySiteId : patch.netlifySiteId;
    const vercelProjectId =
      patch.vercelProjectId === undefined ? current.vercelProjectId : patch.vercelProjectId;
    if (provider === "netlify" && (netlifySiteId === null || nextNetlifyToken === null)) {
      throw new SenifyError(
        "validation",
        'Netlify braucht eine site id und einen token (deploy settings)',
        {
          field: "netlifySiteId",
          suggestion:
            "PUT /api/sites/:siteId/deploy-settings mit provider netlify, netlifySiteId und netlifyToken setzen.",
        },
      );
    }
    if (provider === "vercel" && (vercelProjectId === null || nextVercelToken === null)) {
      throw new SenifyError(
        "validation",
        "Vercel braucht eine project id und einen token (deploy settings)",
        {
          field: "vercelProjectId",
          suggestion:
            "PUT /api/sites/:siteId/deploy-settings mit provider vercel, vercelProjectId und vercelToken setzen.",
        },
      );
    }
    await this.#db.query(
      `INSERT INTO deploy_settings (site_id, provider, netlify_site_id, netlify_token_encrypted, vercel_project_id, vercel_token_encrypted, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (site_id) DO UPDATE SET
         provider = $2, netlify_site_id = $3, netlify_token_encrypted = $4, vercel_project_id = $5, vercel_token_encrypted = $6, updated_at = $7`,
      [siteId, provider, netlifySiteId, nextNetlifyToken, vercelProjectId, nextVercelToken, now],
    );
    return this.getDeploySettings(siteId);
  }

  // The encrypted token for the deploy itself; decryption happens in the
  // settings layer (resolveNetlifyToken / resolveVercelToken), never in the store.
  async getNetlifyTokenEncrypted(siteId: string): Promise<string | null> {
    const row = (
      await this.#db.query<DeploySettingsRow>(
        `SELECT netlify_token_encrypted FROM deploy_settings WHERE site_id = $1`,
        [siteId],
      )
    ).rows[0];
    const stored =
      typeof row?.netlify_token_encrypted === "string" ? row.netlify_token_encrypted : null;
    return stored;
  }

  async getVercelTokenEncrypted(siteId: string): Promise<string | null> {
    const row = (
      await this.#db.query<DeploySettingsRow>(
        `SELECT vercel_token_encrypted FROM deploy_settings WHERE site_id = $1`,
        [siteId],
      )
    ).rows[0];
    const stored =
      typeof row?.vercel_token_encrypted === "string" ? row.vercel_token_encrypted : null;
    return stored;
  }

  // Carries the live URL of a hosted deploy into the record's target field
  // (static keeps its directory, netlify gets its deploy URL).
  async updateDeploymentTarget(id: string, target: string): Promise<void> {
    await this.#db.query(`UPDATE deployments SET target = $2 WHERE id = $1`, [
      id,
      target,
    ]);
  }

  // --------------------------------------------------------- re-bake jobs (E12)

  // Enqueue with dedup: a queued job for the same site absorbs the new request
  // (paths merged, reason appended) instead of stacking a second one. A running
  // job does not absorb — the new job waits in the queue behind it.
  async enqueueBakeJob(input: {
    siteId: string;
    reason: string;
    paths?: readonly string[];
    maxAttempts?: number;
    now?: string;
  }): Promise<BakeJob> {
    const now = input.now ?? new Date().toISOString();
    const paths = [...new Set(input.paths ?? [])].sort();
    const existing = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs
       WHERE site_id = $1 AND status = 'queued'
       ORDER BY created_at ASC, id ASC LIMIT 1`,
      [input.siteId],
    );
    const row = existing.rows[0];
    if (row !== undefined) {
      const current = mapBakeJob(row);
      const merged = [...new Set([...current.paths, ...paths])].sort();
      const reason = current.reason.includes(input.reason)
        ? current.reason
        : `${current.reason}, ${input.reason}`;
      const updated = await this.#db.query<BakeJobRow>(
        `UPDATE bake_jobs SET reason = $2, paths = $3, updated_at = $4
         WHERE id = $1 RETURNING ${BAKE_JOB_COLUMNS}`,
        [current.id, reason, toJsonParam(merged), now],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new Error("Bake job update returned no row");
      return mapBakeJob(updatedRow);
    }
    const inserted = await this.#db.query<BakeJobRow>(
      `INSERT INTO bake_jobs
        (id, site_id, reason, paths, status, attempts, max_attempts,
         next_attempt_at, lease_until, last_error, created_at, updated_at, finished_at)
       VALUES ($1, $2, $3, $4, 'queued', 0, $5, $6, NULL, NULL, $6, $6, NULL)
       RETURNING ${BAKE_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.reason,
        toJsonParam(paths),
        input.maxAttempts ?? 3,
        now,
      ],
    );
    const insertedRow = inserted.rows[0];
    if (!insertedRow) throw new Error("Bake job insert returned no row");
    return mapBakeJob(insertedRow);
  }

  // Claim the oldest due job whose site has no live running job (the
  // concurrency key). The conditional update makes the claim atomic: a second
  // worker that races gets no row.
  async claimBakeJob(input: { now: string; leaseMs: number }): Promise<BakeJob | null> {
    const running = await this.#db.query<{ site_id: string }>(
      `SELECT DISTINCT site_id FROM bake_jobs
       WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until > $1`,
      [input.now],
    );
    const busy = new Set(running.rows.map((row) => row.site_id));
    const due = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT 50`,
      [input.now],
    );
    const candidate = due.rows.map(mapBakeJob).find((job) => !busy.has(job.siteId));
    if (candidate === undefined) return null;
    const leaseUntil = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const claimed = await this.#db.query<BakeJobRow>(
      `UPDATE bake_jobs SET status = 'running', attempts = attempts + 1,
         lease_until = $2, updated_at = $1
       WHERE id = $3 AND status = 'queued'
       RETURNING ${BAKE_JOB_COLUMNS}`,
      [input.now, leaseUntil, candidate.id],
    );
    const row = claimed.rows[0];
    return row === undefined ? null : mapBakeJob(row);
  }

  async completeBakeJob(id: string, now = new Date().toISOString()): Promise<BakeJob> {
    const result = await this.#db.query<BakeJobRow>(
      `UPDATE bake_jobs SET status = 'done', lease_until = NULL,
         last_error = NULL, finished_at = $2, updated_at = $2
       WHERE id = $1 RETURNING ${BAKE_JOB_COLUMNS}`,
      [id, now],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Bake job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapBakeJob(row);
  }

  // A failed attempt: back to the queue with the next attempt time, or the
  // final state when the attempts are used up.
  async failBakeJob(input: {
    id: string;
    error: string;
    backoffMs: number;
    now?: string;
  }): Promise<BakeJob> {
    const now = input.now ?? new Date().toISOString();
    const current = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs WHERE id = $1`,
      [input.id],
    );
    const row = current.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Bake job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    const job = mapBakeJob(row);
    const exhausted = job.attempts >= job.maxAttempts;
    const nextAttemptAt = exhausted
      ? job.nextAttemptAt
      : new Date(Date.parse(now) + Math.max(0, input.backoffMs)).toISOString();
    const updated = await this.#db.query<BakeJobRow>(
      `UPDATE bake_jobs SET status = $2, lease_until = NULL, last_error = $3,
         next_attempt_at = $4, finished_at = $5, updated_at = $6
       WHERE id = $1 RETURNING ${BAKE_JOB_COLUMNS}`,
      [
        input.id,
        exhausted ? "failed" : "queued",
        input.error,
        nextAttemptAt,
        exhausted ? now : null,
        now,
      ],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw new Error("Bake job update returned no row");
    return mapBakeJob(updatedRow);
  }

  // Crash recovery: a running job whose lease expired goes back to the queue.
  async expireBakeLeases(now: string): Promise<number> {
    const result = await this.#db.query<{ id: string }>(
      `UPDATE bake_jobs SET status = 'queued', lease_until = NULL, updated_at = $1
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until <= $1)
       RETURNING id`,
      [now],
    );
    return result.rows.length;
  }

  async getBakeJob(id: string): Promise<BakeJob> {
    const result = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Bake job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapBakeJob(row);
  }

  async listBakeJobs(siteId: string, limit = 20): Promise<BakeJob[]> {
    const result = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs
       WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapBakeJob);
  }

  async createPreview(input: {
    siteId: string;
    buildRef: string;
    token: string;
    createdBy: Author;
    expiresAt: string;
  }): Promise<Preview> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO previews
        (id, site_id, build_ref, token, status, created_by, created_at, expires_at)
       VALUES ($1, $2, $3, $4, 'ready', $5, $6, $7)`,
      [
        id,
        input.siteId,
        input.buildRef,
        input.token,
        toJsonParam(input.createdBy),
        createdAt,
        input.expiresAt,
      ],
    );
    return {
      id,
      siteId: input.siteId,
      buildRef: input.buildRef,
      token: input.token,
      status: "ready",
      createdBy: input.createdBy,
      createdAt,
      expiresAt: input.expiresAt,
    };
  }

  async getPreview(id: string): Promise<Preview> {
    const result = await this.#db.query<PreviewRow>(
      `SELECT id, site_id, build_ref, token, status, created_by, created_at, expires_at
       FROM previews WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Preview "${id}" does not exist`, {
        field: "previewId",
      });
    }
    return mapPreview(row);
  }

  async listPreviews(siteId: string, limit = 50): Promise<Preview[]> {
    const result = await this.#db.query<PreviewRow>(
      `SELECT id, site_id, build_ref, token, status, created_by, created_at, expires_at
       FROM previews WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapPreview);
  }

  async markPreviewExpired(id: string): Promise<void> {
    await this.#db.query(
      `UPDATE previews SET status = 'expired' WHERE id = $1 AND status <> 'expired'`,
      [id],
    );
  }

  async createReviewItem(input: {
    siteId: string;
    previewId: string | null;
    baseState: ReviewItem["baseState"];
    pages: string[];
    author: Author;
    structureDiff: StructureChange[];
    guardrails: ReviewItem["guardrails"];
    importReports?: ReviewItem["importReports"];
    note: string | null;
  }): Promise<ReviewItem> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    const thread: ReviewComment[] = input.note
      ? [{ at: createdAt, author: input.author, note: input.note }]
      : [];
    const status: ReviewStatus = "submitted";
    await this.#db.query(
      `INSERT INTO review_items
        (id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, visuals, import_reports, release_id, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, NULL, $12, NULL)`,
      [
        id,
        input.siteId,
        input.previewId,
        toJsonParam(input.baseState),
        toJsonParam(input.pages),
        toJsonParam(input.author),
        status,
        toJsonParam(input.structureDiff),
        toJsonParam(input.guardrails),
        toJsonParam(thread),
        toJsonParam(input.importReports ?? []),
        createdAt,
      ],
    );
    return {
      id,
      siteId: input.siteId,
      previewId: input.previewId,
      baseState: input.baseState,
      pages: input.pages,
      author: input.author,
      status,
      structureDiff: input.structureDiff,
      guardrails: input.guardrails,
      thread,
      importReports: input.importReports ?? [],
      visuals: null,
      releaseId: null,
      createdAt,
      resolvedAt: null,
    };
  }

  async getReviewItem(id: string): Promise<ReviewItem> {
    const result = await this.#db.query<ReviewRow>(
      `SELECT id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, visuals, import_reports, release_id, created_at, resolved_at
       FROM review_items WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Review item "${id}" does not exist`, {
        field: "reviewId",
      });
    }
    return mapReviewItem(row);
  }

  async listReviewItems(
    siteId: string,
    options: { status?: ReviewStatus; limit?: number } = {},
  ): Promise<ReviewItem[]> {
    const limit = Math.max(1, Math.min(200, options.limit ?? 50));
    const result = options.status
      ? await this.#db.query<ReviewRow>(
          `SELECT id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, visuals, import_reports, release_id, created_at, resolved_at
           FROM review_items WHERE site_id = $1 AND status = $2
           ORDER BY created_at DESC, id DESC LIMIT $3`,
          [siteId, options.status, limit],
        )
      : await this.#db.query<ReviewRow>(
          `SELECT id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, visuals, import_reports, release_id, created_at, resolved_at
           FROM review_items WHERE site_id = $1
           ORDER BY created_at DESC, id DESC LIMIT $2`,
          [siteId, limit],
        );
    return result.rows.map(mapReviewItem);
  }

  async updateReviewItem(
    id: string,
    patch: {
      status?: ReviewStatus;
      comment?: ReviewComment;
      releaseId?: string | null;
      resolvedAt?: string | null;
      visuals?: ReviewItem["visuals"];
    },
  ): Promise<ReviewItem> {
    const current = await this.getReviewItem(id);
    const thread = patch.comment
      ? [...current.thread, patch.comment]
      : current.thread;
    const status = patch.status ?? current.status;
    const releaseId =
      patch.releaseId === undefined ? current.releaseId : patch.releaseId;
    const resolvedAt =
      patch.resolvedAt === undefined ? current.resolvedAt : patch.resolvedAt;
    const visuals = patch.visuals === undefined ? current.visuals : patch.visuals;
    await this.#db.query(
      `UPDATE review_items
       SET status = $2, thread = $3, release_id = $4, resolved_at = $5, visuals = $6
       WHERE id = $1`,
      [id, status, toJsonParam(thread), releaseId, resolvedAt, toJsonParam(visuals)],
    );
    return {
      ...current,
      status,
      thread,
      releaseId,
      resolvedAt,
      visuals,
    };
  }

  // -------------------------------------------------- redesign proposals (ADR-0012)
  // Cards and basis are written once and never change; only status, decision
  // and apply_result move. The claim below is the whole "exactly one human
  // decision" guarantee: the row is locked, and a proposal that is not
  // `proposed` can no longer be claimed.
  async createRedesignProposal(input: {
    // The caller owns the id: the card images are written into the proposal's
    // own folder before the row exists, so both must share one identity.
    id: string;
    sourcePageId: string;
    cards: DirectionCard[];
    basis: RedesignProposalBasis;
    // How long the human has to decide. The proposal is offered against a
    // pinned draft and theme version, so a decision made long after the fact
    // would apply to a source that has moved on; the sweep below moves the row
    // to `expired` instead of letting it linger and half-write (P2-3, R2).
    ttlMs?: number;
  }): Promise<RedesignProposal> {
    const { id } = input;
    const createdAt = new Date();
    const ttl = input.ttlMs ?? DEFAULT_PROPOSAL_TTL_MS;
    const expiresAt = new Date(createdAt.getTime() + ttl).toISOString();
    const result = await this.#db.query<RedesignProposalRow>(
      `INSERT INTO redesign_proposals
        (id, source_page_id, status, cards, basis, decision, apply_result, created_at, expires_at)
       VALUES ($1, $2, 'proposed', $3, $4, NULL, NULL, $5, $6)
       RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
      [
        id,
        input.sourcePageId,
        toJsonParam(input.cards),
        toJsonParam(input.basis),
        createdAt.toISOString(),
        expiresAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Redesign proposal insert returned no row");
    return mapRedesignProposal(row);
  }

  async getRedesignProposal(id: string): Promise<RedesignProposal> {
    // The sweep runs here too, so a single-proposal read cannot show a
    // direction as still open when its deadline has passed. Reading the inbox
    // and reading one proposal must not disagree about whether it is alive.
    await this.expireStaleRedesignProposals();
    const result = await this.#db.query<RedesignProposalRow>(
      `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Redesign proposal "${id}" does not exist`, {
        field: "proposalId",
        suggestion: "Die Id kommt aus create_redesign_proposal.",
      });
    }
    return mapRedesignProposal(row);
  }

  // The inbox of a source page: the open proposals first, then the finished
  // ones for the history. `status: null` asks for everything.
  //
  // The sweep runs first: an undecided proposal past its deadline is `expired`
  // before anyone reads the list, so the inbox never offers a direction that
  // can no longer be taken. A row created before the column existed has
  // `expires_at` NULL and is deliberately left alone - ageing out rows we never
  // gave a deadline would be a guess.
  async listRedesignProposals(
    sourcePageId: string,
    options: { status?: RedesignProposalStatus } = {},
  ): Promise<RedesignProposal[]> {
    await this.expireStaleRedesignProposals();
    const openFirst =
      "ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'applying' THEN 1 ELSE 2 END, created_at DESC, id DESC";
    const result =
      options.status === undefined
        ? await this.#db.query<RedesignProposalRow>(
            `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals
             WHERE source_page_id = $1 ${openFirst}`,
            [sourcePageId],
          )
        : await this.#db.query<RedesignProposalRow>(
            `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals
             WHERE source_page_id = $1 AND status = $2 ${openFirst}`,
            [sourcePageId, options.status],
          );
    return result.rows.map(mapRedesignProposal);
  }

  // Ages out the proposals nobody decided (Fahrplan P2-3, R2).
  //
  // Only `proposed` rows are touched. An `applying` row is a run in flight and
  // an `applied`/`failed` row is history; moving either would destroy the fact
  // that the human decided, or would race a transaction that is about to write
  // its effects. The rows are marked `expired`, never deleted: "the human never
  // chose this" is worth keeping, and a confirm against an expired proposal
  // must fail loudly (see the claim below) instead of half-writing.
  //
  // Returns the ids it moved, so a caller can log or audit the sweep.
  async expireStaleRedesignProposals(
    now: string = new Date().toISOString(),
  ): Promise<string[]> {
    const result = await this.#db.query<{ id: string }>(
      `UPDATE redesign_proposals
          SET status = 'expired'
        WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at <= $1
        RETURNING id`,
      [now],
    );
    return result.rows.map((row) => row.id);
  }

  // The human decision, stored before the first effect. Returns "claimed"
  // only for the caller that moved the row; a second confirm of the same
  // proposal loses and must not run the apply again.
  async claimRedesignProposal(input: {
    proposalId: string;
    directionId: string;
    decision: DirectionDecision;
  }): Promise<
    | { state: "claimed"; proposal: RedesignProposal }
    | { state: "already_decided"; proposal: RedesignProposal }
    | { state: "expired"; proposal: RedesignProposal }
  > {
    return this.#db.withTransaction(async (tx) => {
      const locked = await tx.query<RedesignProposalRow>(
        `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals WHERE id = $1 FOR UPDATE`,
        [input.proposalId],
      );
      const row = locked.rows[0];
      if (!row) {
        throw new SenifyError("not_found", `Redesign proposal "${input.proposalId}" does not exist`, {
          field: "proposalId",
        });
      }
      const current = mapRedesignProposal(row);
      if (current.status === "expired") {
        // Aged out (P2-3, R2). A distinct state, not `already_decided`: the
        // caller must answer "this direction can no longer be taken, create a
        // new proposal" rather than replaying a decision that never happened.
        return { state: "expired" as const, proposal: current };
      }
      if (current.status !== "proposed") {
        return { state: "already_decided" as const, proposal: current };
      }
      const result = await tx.query<RedesignProposalRow>(
        `UPDATE redesign_proposals
         SET status = 'applying', decision = $2
         WHERE id = $1
         RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
        [input.proposalId, toJsonParam(input.decision)],
      );
      const updated = result.rows[0];
      if (!updated) throw new Error("Redesign proposal claim returned no row");
      return { state: "claimed" as const, proposal: mapRedesignProposal(updated) };
    });
  }

  async finalizeRedesignProposal(input: {
    proposalId: string;
    status: "applied" | "failed";
    applyResult: RedesignProposalApplyResult;
  }): Promise<RedesignProposal> {
    const result = await this.#db.query<RedesignProposalRow>(
      `UPDATE redesign_proposals
       SET status = $2, apply_result = $3
       WHERE id = $1 AND status = 'applying'
       RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
      [input.proposalId, input.status, toJsonParam(input.applyResult)],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError(
        "conflict",
        `Redesign proposal "${input.proposalId}" is not in the applying state`,
        {
          field: "proposalId",
          suggestion:
            "Der Lauf wurde bereits abgeschlossen oder abgebrochen; Status mit get_redesign_proposal prüfen.",
        },
      );
    }
    return mapRedesignProposal(row);
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

  async createAsset(input: {
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
  }): Promise<Asset> {
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

  async #getAssetFolderInSite(folderId: string, siteId: string): Promise<AssetFolder> {
    const folder = await this.getAssetFolder(folderId);
    if (folder.siteId !== siteId) {
      throw new SenifyError(
        "validation",
        `Folder "${folderId}" belongs to another site`,
        { field: "folderId", suggestion: "Use a folder of this site." },
      );
    }
    return folder;
  }

  // Public, site-scoped entry points for the access paths (ADR-0014).
  async getAssetOfSite(assetId: string, siteId: string): Promise<Asset> {
    return this.#getAssetInSite(assetId, siteId);
  }

  async getAssetFolderOfSite(folderId: string, siteId: string): Promise<AssetFolder> {
    return this.#getAssetFolderInSite(folderId, siteId);
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
    await this.getSite(siteId);
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

  // --- imported foreign code (ADR-0010) -----------------------------------

  // The bundle arrives already self-contained (the importer's job, ADR-0010
  // §2); the store keeps it verbatim and derives `bytes` and the SHA-256
  // integrity from the very text it stores, so the two can never disagree.
  async createCodePayload(input: {
    id: string;
    siteId: string;
    name: string;
    kind: CodePayloadKind;
    bundle: string;
    provenance: CodePayloadProvenance;
    license: CodePayloadLicense;
  }): Promise<CodePayload> {
    await this.getSite(input.siteId);
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
    await this.getSite(siteId);
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

  async createAssetFolder(input: {
    id: string;
    siteId: string;
    name: string;
    parentId: string | null;
  }): Promise<AssetFolder> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<AssetFolderRow>(
      `INSERT INTO asset_folders (id, site_id, name, parent_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, site_id, name, parent_id, created_at`,
      [input.id, input.siteId, input.name, input.parentId, createdAt],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset folder insert returned no row");
    return mapAssetFolder(row);
  }

  async getAssetFolder(id: string): Promise<AssetFolder> {
    const result = await this.#db.query<AssetFolderRow>(
      `SELECT id, site_id, name, parent_id, created_at
       FROM asset_folders WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Asset folder "${id}" does not exist`, {
        field: "folderId",
      });
    }
    return mapAssetFolder(row);
  }

  async listAssetFolders(siteId: string): Promise<AssetFolder[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<AssetFolderRow>(
      `SELECT id, site_id, name, parent_id, created_at
       FROM asset_folders WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
      [siteId],
    );
    return result.rows.map(mapAssetFolder);
  }

  // Deleting a folder never deletes content: assets and subfolders fall back
  // to "Ohne Ordner" (root), matching the library contract.
  async deleteAssetFolder(id: string): Promise<void> {
    await this.getAssetFolder(id);
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`UPDATE assets SET folder_id = NULL WHERE folder_id = $1`, [id]);
      await tx.query(
        `UPDATE asset_folders SET parent_id = NULL WHERE parent_id = $1`,
        [id],
      );
      await tx.query(`DELETE FROM asset_folders WHERE id = $1`, [id]);
    });
  }

  async createAssetHistory(input: {
    id: string;
    assetId: string;
    storageRef: string;
    mime: string;
    byteSize: number;
  }): Promise<AssetHistoryEntry> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<AssetHistoryRow>(
      `INSERT INTO asset_history (id, asset_id, storage_ref, mime, byte_size, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, asset_id, storage_ref, mime, byte_size, created_at`,
      [
        input.id,
        input.assetId,
        input.storageRef,
        input.mime,
        input.byteSize,
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset history insert returned no row");
    return mapAssetHistory(row);
  }

  async getAssetHistory(id: string): Promise<AssetHistoryEntry> {
    const result = await this.#db.query<AssetHistoryRow>(
      `SELECT id, asset_id, storage_ref, mime, byte_size, created_at
       FROM asset_history WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError(
        "not_found",
        `History entry "${id}" does not exist`,
        {
          field: "historyId",
          suggestion: "Read the file history with `GET /api/assets/:assetId/history`.",
        },
      );
    }
    return mapAssetHistory(row);
  }

  async listAssetHistory(assetId: string): Promise<AssetHistoryEntry[]> {
    await this.getAsset(assetId);
    const result = await this.#db.query<AssetHistoryRow>(
      `SELECT id, asset_id, storage_ref, mime, byte_size, created_at
       FROM asset_history WHERE asset_id = $1
       ORDER BY created_at DESC, id DESC`,
      [assetId],
    );
    return result.rows.map(mapAssetHistory);
  }

  async deleteAssetHistory(assetId: string): Promise<void> {
    await this.#db.query(`DELETE FROM asset_history WHERE asset_id = $1`, [
      assetId,
    ]);
  }

  // -------------------------------------------------------- collections (T09)

  async listCollections(
    siteId: string,
    options: { includeDeprecated?: boolean } = {},
  ): Promise<Collection[]> {
    await this.getSite(siteId);
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

  async createCollection(input: {
    id: string;
    siteId: string;
    name: string;
    slug: string;
    fields: FieldDef[];
    titleField: string;
    dateField: string | null;
    urlPattern: string | null;
    supports: SupportsFlag[];
    listColumns: string[];
    description: string | null;
    deprecatedAt: string | null;
  }): Promise<Collection> {
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

  async updateCollection(
    id: string,
    next: {
      name: string;
      fields: FieldDef[];
      titleField: string;
      dateField: string | null;
      urlPattern: string | null;
      supports: SupportsFlag[];
      listColumns: string[];
      description: string | null;
      deprecatedAt: string | null;
    },
  ): Promise<Collection> {
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

  // ------------------------------------------------------------ entries (T09)

  async listEntries(filter: {
    siteId: string;
    collectionId?: string;
    status?: EntryStatus;
    trashed?: boolean;
    searchTokens?: readonly string[];
    limit?: number;
  }): Promise<Entry[]> {
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

  async createEntry(input: {
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
  }): Promise<Entry> {
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

  async updateEntryRow(input: {
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
  }): Promise<number> {
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

  async createEntryVersion(input: {
    id: string;
    entryId: string;
    siteId: string;
    versionNumber: number;
    cells: Record<string, CellValue>;
    slug: string;
    status: EntryStatus;
    author: Author;
  }): Promise<EntryVersion> {
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

  async createEntryRedirect(input: {
    id: string;
    siteId: string;
    collectionId: string;
    fromPath: string;
    toPath: string;
  }): Promise<EntryRedirect> {
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

  // ------------------------------------------------------------ forms (T11)

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

  async saveFormSnapshot(input: {
    id: string;
    formId: string;
    siteId: string;
    pageId: string;
    nodeId: string;
    pagePath: string;
    sectionType: string;
    snapshot: FormSnapshot;
  }): Promise<FormSnapshotRecord> {
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

  async enqueueNotification(input: {
    siteId: string;
    formId: string | null;
    entryId: string | null;
    kind: string;
    recipient: string;
    subject: string;
    body: string;
    nextAttemptAt?: string;
  }): Promise<NotificationMessage> {
    const now = new Date().toISOString();
    const result = await this.#db.query<NotificationRow>(
      `INSERT INTO notification_outbox
        (id, site_id, form_id, entry_id, kind, recipient, subject, body, status,
         attempts, next_attempt_at, last_error, created_at, updated_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 0, $9, NULL, $10, $10, NULL)
       RETURNING ${NOTIFICATION_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.formId,
        input.entryId,
        input.kind,
        input.recipient,
        input.subject,
        input.body,
        input.nextAttemptAt ?? now,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Notification insert returned no row");
    return mapNotification(row);
  }

  async getNotification(id: string): Promise<NotificationMessage> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Notification "${id}" does not exist`, {
        field: "notificationId",
      });
    }
    return mapNotification(row);
  }

  async listNotifications(
    siteId: string,
    limit = 50,
  ): Promise<NotificationMessage[]> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox
       WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapNotification);
  }

  // Jobs that are due: queued and past their next attempt time.
  async listDueNotifications(
    now: string,
    limit = 50,
  ): Promise<NotificationMessage[]> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapNotification);
  }

  async markNotificationResult(input: {
    id: string;
    status: NotificationStatus;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    sentAt: string | null;
  }): Promise<NotificationMessage> {
    const result = await this.#db.query<NotificationRow>(
      `UPDATE notification_outbox SET
         status = $2, attempts = $3, next_attempt_at = $4, last_error = $5,
         sent_at = $6, updated_at = $7
       WHERE id = $1 RETURNING ${NOTIFICATION_COLUMNS}`,
      [
        input.id,
        input.status,
        input.attempts,
        input.nextAttemptAt,
        input.lastError,
        input.sentAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Notification "${input.id}" does not exist`, {
        field: "notificationId",
      });
    }
    return mapNotification(row);
  }

  async createNewsletterToken(input: {
    siteId: string;
    formId: string;
    entryId: string;
    email: string;
    kind: NewsletterTokenKind;
    expiresAt: string | null;
  }): Promise<NewsletterToken> {
    const token = randomBytes(24).toString("base64url");
    const result = await this.#db.query<NewsletterTokenRow>(
      `INSERT INTO newsletter_tokens
        (token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, NULL)
       RETURNING token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at`,
      [
        token,
        input.siteId,
        input.formId,
        input.entryId,
        input.email,
        input.kind,
        input.expiresAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Newsletter token insert returned no row");
    return mapNewsletterToken(row);
  }

  async getNewsletterToken(token: string): Promise<NewsletterToken | undefined> {
    const result = await this.#db.query<NewsletterTokenRow>(
      `SELECT token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at
       FROM newsletter_tokens WHERE token = $1`,
      [token],
    );
    const row = result.rows[0];
    return row ? mapNewsletterToken(row) : undefined;
  }

  // Single use: the flip to used is idempotent (already-used tokens stay used).
  async markNewsletterTokenUsed(
    token: string,
    status: string,
  ): Promise<NewsletterToken> {
    const result = await this.#db.query<NewsletterTokenRow>(
      `UPDATE newsletter_tokens SET status = $2, used_at = COALESCE(used_at, $3)
       WHERE token = $1
       RETURNING token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at`,
      [token, status, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Newsletter token is unknown`, {
        field: "token",
      });
    }
    return mapNewsletterToken(row);
  }

  // ------------------------------------------------------- references (T14)

  async createReference(input: {
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
  }): Promise<Reference> {
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
        : await this.#findReferenceCollection(row.collection_id);
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
    const collections = await this.#referenceCollections();
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
  async searchReferences(searchTokens: readonly string[]): Promise<
    { reference: ReferenceSummary; documents: ReferenceDocuments; weight: number }[]
  > {
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
    const collections = await this.#referenceCollections();
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
  async findDuplicateReferences(): Promise<
    { reference: ReferenceSummary; duplicateOf: ReferenceSummary; reason: string }[]
  > {
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

  async updateReference(
    id: string,
    patch: {
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
    },
  ): Promise<Reference> {
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

  async createReferenceProfileRevision(input: {
    referenceId: string;
    profile: ReferenceProfile;
    evidence: ReferenceEvidence[];
    provenance: ReferenceProvenance;
    author: Author;
    note: string | null;
  }): Promise<ReferenceProfileRevision> {
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

  async createReferenceJob(input: {
    referenceId: string;
    maxAttempts: number;
    // Analysis input that must survive a retry (e.g. the snapshot fallback).
    payload?: Record<string, unknown> | null;
  }): Promise<ReferenceJob> {
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

  async updateReferenceJob(input: {
    id: string;
    status: ReferenceJobStatus;
    stage: string;
    progress: number;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    finishedAt: string | null;
  }): Promise<ReferenceJob> {
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

  // ------------------------------------------------- import jobs (plan S3.2)

  async createImportJob(input: {
    siteId: string;
    source: ImportJobSource;
    pagePath: string;
    dryRun: boolean;
    maxAttempts: number;
    // The import request body, kept for a retry after a crash.
    payload?: Record<string, unknown> | null;
  }): Promise<ImportJob> {
    await this.getSite(input.siteId);
    const now = new Date().toISOString();
    const result = await this.#db.query<ImportJobRow>(
      `INSERT INTO import_jobs
        (id, site_id, source_kind, source_url, page_path, dry_run, status, stage,
         progress, attempts, max_attempts, next_attempt_at, last_error,
         created_at, updated_at, finished_at, payload, result)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', 'queued', 0, 0, $7, $8, NULL, $8, $8, NULL, $9, NULL)
       RETURNING ${IMPORT_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.source.kind,
        input.source.url,
        input.pagePath,
        input.dryRun,
        input.maxAttempts,
        now,
        input.payload === undefined || input.payload === null
          ? null
          : toJsonParam(input.payload),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Import job insert returned no row");
    return mapImportJob(row);
  }

  async getImportJob(id: string): Promise<ImportJob> {
    const result = await this.#db.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Import job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImportJob(row);
  }

  getImportJobPayload(id: string): Promise<Record<string, unknown> | null> {
    return this.getImportJobPayloadAsync(id);
  }

  private async getImportJobPayloadAsync(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.#db.query<{ payload: unknown }>(
      `SELECT payload FROM import_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || row.payload === null || row.payload === undefined) return null;
    return toJson<Record<string, unknown>>(row.payload);
  }

  // Due jobs: queued and past their next attempt time (the claim pattern of
  // `listDueReferenceJobs`, plan S3.2).
  async listDueImportJobs(now: string, limit = 20): Promise<ImportJob[]> {
    const result = await this.#db.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapImportJob);
  }

  async listImportJobsForSite(siteId: string, limit = 50): Promise<ImportJob[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs
       WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapImportJob);
  }

  async updateImportJob(input: {
    id: string;
    status: ImportJobStatus;
    stage: string;
    progress: number;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    finishedAt: string | null;
  }): Promise<ImportJob> {
    const result = await this.#db.query<ImportJobRow>(
      `UPDATE import_jobs SET
         status = $2, stage = $3, progress = $4, attempts = $5,
         next_attempt_at = $6, last_error = $7, finished_at = $8, updated_at = $9
       WHERE id = $1 RETURNING ${IMPORT_JOB_COLUMNS}`,
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
      throw new SenifyError("not_found", `Import job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImportJob(row);
  }

  // The report of a finished run (poll answer, plan S3.3).
  async getImportJobResult(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.#db.query<{ result: unknown }>(
      `SELECT result FROM import_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || row.result === null || row.result === undefined) return null;
    return toJson<Record<string, unknown>>(row.result);
  }

  async setImportJobResult(id: string, result: Record<string, unknown>): Promise<void> {
    await this.#db.query(
      `UPDATE import_jobs SET result = $2, updated_at = $3 WHERE id = $1`,
      [id, toJsonParam(result), new Date().toISOString()],
    );
  }

  async commitFramerImportPlan(plan: FramerImportCommitPlan): Promise<FramerImportCommitResult> {
    if (plan.target.kind === "new") assertPagePathFormat(plan.target.path);
    plan.payloads.forEach((payload, index) => {
      if (payload.id.trim() === "") {
        throw new SenifyError("validation", `Prepared payload ${index} has no id`, {
          field: "payloadId",
        });
      }
    });

    return this.#db.withTransaction(async (tx) => {
      const receiptRows = await tx.query<ImportReceiptRow>(
        `SELECT id, site_id, job_id, content_key, request_fingerprint,
                page_id, draft_version, result, created_at
           FROM import_receipts
          WHERE site_id = $1 AND content_key = $2 AND request_fingerprint = $3`,
        [plan.siteId, plan.contentKey, plan.requestFingerprint],
      );
      const receiptRow = receiptRows.rows[0];
      if (receiptRow !== undefined) {
        const receipt = mapImportReceipt(receiptRow);
        const job = await this.#importJobWithClient(tx, receipt.jobId);
        if (job === null) {
          throw new SenifyError("conflict", "Der Import-Receipt verweist auf einen fehlenden Job", {
            field: "receiptId",
          });
        }
        const stored = receipt.result as unknown as ImportReport;
        const report: ImportReport = {
          ...stored,
          receiptId: receipt.id,
          replayed: true,
        };
        const completed = await tx.query<ImportJobRow>(
          `UPDATE import_jobs
              SET status = 'succeeded', stage = 'done', progress = 100,
                  attempts = attempts + 1, last_error = NULL,
                  finished_at = $2, updated_at = $2, result = $3
            WHERE id = $1
            RETURNING ${IMPORT_JOB_COLUMNS}`,
          [plan.jobId, new Date().toISOString(), toJsonParam(report)],
        );
        const completedRow = completed.rows[0];
        if (completedRow === undefined) {
          throw new SenifyError("not_found", `Import job "${plan.jobId}" does not exist`, {
            field: "jobId",
          });
        }
        return {
          receipt,
          job: mapImportJob(completedRow),
          report,
          replayed: true,
        };
      }

      const site = await tx.query<{ id: string }>(
        `SELECT id FROM sites WHERE id = $1 FOR UPDATE`,
        [plan.siteId],
      );
      if (site.rows.length === 0) {
        throw new SenifyError("not_found", `Site "${plan.siteId}" does not exist`, {
          field: "siteId",
        });
      }
      const job = await this.#importJobWithClient(tx, plan.jobId);
      if (job === null || job.siteId !== plan.siteId || job.dryRun) {
        throw new SenifyError("validation", "Der Import-Job ist kein gültiges Write-Ziel", {
          field: "jobId",
        });
      }

      const now = new Date().toISOString();
      const batchId = newEntityId();
      let page: Page;
      if (plan.target.kind === "new") {
        const existingTarget = await tx.query<PageRow>(
          `SELECT ${PAGE_WRITE_COLUMNS} FROM pages WHERE site_id = $1 AND path = $2 FOR UPDATE`,
          [plan.siteId, plan.target.path],
        );
        if (existingTarget.rows[0] !== undefined) {
          throw new SenifyError("conflict", `Page path "${plan.target.path}" is already in use on this site`, {
            field: "path",
            suggestion: "Use the existing pageId with its current baseDraftVersion, or choose another path.",
          });
        }
        const pageId = newEntityId();
        const inserted = await tx.query<PageRow>(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 2, $7, $7)
           RETURNING ${PAGE_WRITE_COLUMNS}`,
          [
            pageId,
            plan.siteId,
            plan.target.path,
            plan.target.title,
            toJsonParam({}),
            toJsonParam(plan.draft),
            now,
          ],
        );
        const insertedPage = inserted.rows[0];
        if (insertedPage === undefined) throw new Error("Imported page insert returned no row");
        page = mapPage(insertedPage);
      } else {
        const locked = await tx.query<PageRow>(
          `SELECT ${PAGE_WRITE_COLUMNS} FROM pages WHERE id = $1 FOR UPDATE`,
          [plan.target.pageId],
        );
        const current = locked.rows[0];
        if (current === undefined) {
          throw new SenifyError("not_found", `Page "${plan.target.pageId}" does not exist`, {
            field: "pageId",
          });
        }
        if (current.site_id !== plan.siteId) {
          throw new SenifyError("validation", "Die Zielseite gehört zu einem anderen Projekt", {
            field: "pageId",
          });
        }
        const currentVersion = toFiniteNumber(current.draft_version, "draft_version");
        if (currentVersion !== plan.target.baseDraftVersion) {
          throw draftConflictError(plan.target.baseDraftVersion, currentVersion);
        }
        const updated = await tx.query<PageRow>(
          `UPDATE pages
              SET draft = $2, draft_version = draft_version + 1, updated_at = $3
            WHERE id = $1 AND draft_version = $4
            RETURNING ${PAGE_WRITE_COLUMNS}`,
          [
            plan.target.pageId,
            toJsonParam(plan.draft),
            now,
            plan.target.baseDraftVersion,
          ],
        );
        const updatedPage = updated.rows[0];
        if (updatedPage === undefined) {
          throw draftConflictError(plan.target.baseDraftVersion, currentVersion);
        }
        page = mapPage(updatedPage);
      }

      for (const payload of plan.payloads) {
        const bytes = Buffer.byteLength(payload.bundle, "utf8");
        await tx.query(
          `INSERT INTO site_code_payloads
             (id, site_id, name, kind, bundle, bytes, integrity, version, provenance, license, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $10)`,
          [
            payload.id,
            plan.siteId,
            payload.name,
            payload.kind,
            payload.bundle,
            bytes,
            createHash("sha256").update(payload.bundle, "utf8").digest("hex"),
            toJsonParam(payload.provenance),
            toJsonParam(payload.license),
            now,
          ],
        );
      }

      const styleSite = await tx.query<StyleRuleRow>(
        `SELECT style_rules_json, style_rules_version FROM sites WHERE id = $1 FOR UPDATE`,
        [plan.siteId],
      );
      const styleRow = styleSite.rows[0];
      if (styleRow === undefined) {
        throw new SenifyError("not_found", `Site "${plan.siteId}" does not exist`, {
          field: "siteId",
        });
      }
      const storedRules =
        styleRow.style_rules_json === null || styleRow.style_rules_json === undefined
          ? []
          : parseStyleRuleRegistry(toJson<unknown>(styleRow.style_rules_json));
      // The rules of the page being imported again are replaced, never stacked:
      // their ids carry the page scope (`fi-<scope>-<n>`), so a second import of
      // the same page swaps its own rules and leaves every other page's alone.
      // Stacking them would leave the registry holding the first version (it
      // keeps the first rule per id), so a change made in Framer never arrived.
      const importedScopes = new Set(
        plan.styleRules
          .map((rule) => RULE_ID_PATTERN.exec(rule.id)?.[1])
          .filter((scope): scope is string => scope !== undefined),
      );
      const currentRules = storedRules.filter((rule) => {
        const scope = RULE_ID_PATTERN.exec(rule.id)?.[1];
        return scope === undefined || !importedScopes.has(scope);
      });
      const importedRules = plan.styleRules.map((rule, index) => {
        const ordered: StyleRule = { ...rule, order: currentRules.length + index };
        this.#assertWritableRule(ordered, `styleRules[${index}]`);
        return ordered;
      });
      const nextRules = normalizeRuleOrder([...currentRules, ...importedRules]);
      const nextStyleVersion =
        toFiniteNumber(styleRow.style_rules_version ?? 0, "style_rules_version") + 1;
      if (importedRules.length > 0) {
        await tx.query(
          `UPDATE sites
              SET style_rules_json = $2, style_rules_version = $3, updated_at = $4
            WHERE id = $1`,
          [plan.siteId, toJsonParam(nextRules), nextStyleVersion, now],
        );
      }

      if (plan.themePatch !== null) {
        const themeRows = await tx.query<ThemeRow>(
          `SELECT id, site_id, name, definition, version, created_at, updated_at
             FROM themes WHERE site_id = $1 FOR UPDATE`,
          [plan.siteId],
        );
        const themeRow = themeRows.rows[0];
        if (themeRow === undefined) {
          throw new SenifyError("not_found", `Theme for site "${plan.siteId}" does not exist`, {
            field: "theme",
          });
        }
        const currentDefinition = toJson<Theme>(themeRow.definition);
        const merged = mergeThemePatch(currentDefinition, plan.themePatch);
        merged.id = themeRow.id;
        validateShape(ThemeSchema, merged, "theme");
        const issues = validateTheme(merged);
        const firstIssue = issues[0];
        if (firstIssue !== undefined) {
          throw new SenifyError(
            "validation",
            `Invalid theme: ${firstIssue.message}`,
            { field: firstIssue.path, suggestion: firstIssue.suggestion },
          );
        }
        const newThemeVersion =
          toFiniteNumber(themeRow.version, "version") + 1;
        await tx.query(
          `UPDATE themes
              SET definition = $2, name = $3, version = $4, updated_at = $5
            WHERE id = $1`,
          [themeRow.id, toJsonParam(merged), merged.name, newThemeVersion, now],
        );
      }

      const auditEntries: NewAuditEntry[] = [
        {
          siteId: plan.siteId,
          pageId: page.id,
          batchId,
          opIndex: 0,
          mutation: "importFramer",
          params: {
            sourceUrl: plan.report.payloads?.[0]?.sourcePath ?? null,
            pagePath: page.path,
            irHash: plan.report.irHash,
            score: plan.report.score,
            receiptKey: plan.contentKey,
            requestFingerprint: plan.requestFingerprint,
          },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: page.draftVersion,
        },
      ];
      if (importedRules.length > 0) {
        auditEntries.push({
          siteId: plan.siteId,
          pageId: null,
          batchId,
          opIndex: 1,
          mutation: "importFramerStyleRules",
          params: {
            count: importedRules.length,
            styleRegistryVersion: nextStyleVersion,
            receiptKey: plan.contentKey,
          },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: nextStyleVersion,
        });
      }
      if (plan.themePatch !== null) {
        auditEntries.push({
          siteId: plan.siteId,
          pageId: null,
          batchId,
          opIndex: auditEntries.length,
          mutation: "update_theme",
          params: { patch: plan.themePatch, import: true },
          author: plan.author,
          undoPatch: [],
          draftVersionAfter: 0,
        });
      }
      const audit = buildAuditInsert(auditEntries);
      await tx.query(audit.text, audit.params);

      const receiptId = newEntityId();
      const report: ImportReport = {
        ...plan.report,
        pageId: page.id,
        newDraftVersion: page.draftVersion,
        receiptId,
        replayed: false,
      };
      const updatedJob = await tx.query<ImportJobRow>(
        `UPDATE import_jobs
            SET status = 'succeeded', stage = 'done', progress = 100,
                attempts = attempts + 1, last_error = NULL,
                finished_at = $2, updated_at = $2, result = $3
          WHERE id = $1
          RETURNING ${IMPORT_JOB_COLUMNS}`,
        [plan.jobId, now, toJsonParam(report)],
      );
      const jobRow = updatedJob.rows[0];
      if (jobRow === undefined) {
        throw new SenifyError("not_found", `Import job "${plan.jobId}" does not exist`, {
          field: "jobId",
        });
      }
      const insertedReceipt = await tx.query<ImportReceiptRow>(
        `INSERT INTO import_receipts
           (id, site_id, job_id, content_key, request_fingerprint,
            page_id, draft_version, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, site_id, job_id, content_key, request_fingerprint,
                   page_id, draft_version, result, created_at`,
        [
          receiptId,
          plan.siteId,
          plan.jobId,
          plan.contentKey,
          plan.requestFingerprint,
          page.id,
          page.draftVersion,
          toJsonParam(report),
          now,
        ],
      );
      const receipt = mapImportReceipt(insertedReceipt.rows[0]!);
      return {
        receipt,
        job: mapImportJob(jobRow),
        report,
        replayed: false,
      };
    });
  }

  async #importJobWithClient(
    client: DbClient,
    id: string,
  ): Promise<ImportJob | null> {
    const result = await client.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapImportJob(row);
  }

  async upsertReferenceAssignment(input: {
    siteId: string;
    referenceId: string;
    scales: ReferenceScale[];
    priority: number;
  }): Promise<ReferenceAssignment> {
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

  async deleteReferenceAssignment(input: {
    siteId: string;
    referenceId: string;
  }): Promise<boolean> {
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

  // ------------------------------------------------ reference library (T14)

  async createReferenceCollection(input: {
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
  }): Promise<ReferenceCollection> {
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

  async updateReferenceCollection(
    id: string,
    patch: {
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
    },
  ): Promise<ReferenceCollection> {
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

  async #findReferenceCollection(id: string): Promise<ReferenceCollection | null> {
    const result = await this.#db.query<ReferenceCollectionRow>(
      `SELECT ${REFERENCE_COLLECTION_COLUMNS} FROM reference_collections WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return mapReferenceCollection(row, await this.#referenceCollectionCount(id));
  }

  async #referenceCollections(): Promise<Map<string, ReferenceCollection>> {
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

  // ---------------------------------------------------------- settings (T12)

  async getSmtpSettings(): Promise<SmtpSettingsRecord> {
    const existing = await this.#db.query<SmtpRow>(
      `SELECT ${SMTP_COLUMNS} FROM smtp_settings WHERE id = 'smtp'`,
    );
    const row = existing.rows[0];
    if (row) return mapSmtpSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO smtp_settings (id, host, port, tls, username, password_encrypted, from_address, updated_at)
         VALUES ('smtp', '', 587, 'starttls', '', NULL, '', $1)`,
        [new Date().toISOString()],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<SmtpRow>(
      `SELECT ${SMTP_COLUMNS} FROM smtp_settings WHERE id = 'smtp'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultSmtpSettings() : mapSmtpSettings(stored);
  }

  async updateSmtpSettings(patch: SmtpSettingsPatch): Promise<SmtpSettingsRecord> {
    const current = await this.getSmtpSettings();
    const next: SmtpSettingsRecord = {
      host: patch.host === undefined ? current.host : patch.host,
      port: patch.port === undefined ? current.port : patch.port,
      tls: patch.tls === undefined ? current.tls : patch.tls,
      user: patch.user === undefined ? current.user : patch.user,
      from: patch.from === undefined ? current.from : patch.from,
      passwordEncrypted:
        patch.passwordEncrypted === undefined
          ? current.passwordEncrypted
          : patch.passwordEncrypted,
    };
    await this.#db.query(
      `UPDATE smtp_settings SET host = $2, port = $3, tls = $4, username = $5,
         password_encrypted = $6, from_address = $7, updated_at = $8 WHERE id = $1`,
      [
        "smtp",
        next.host,
        next.port,
        next.tls,
        next.user,
        next.passwordEncrypted,
        next.from,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // Defaults for new projects and the program start (artifacts/27 §5).
  async getEngineSettings(): Promise<EngineSettings> {
    const existing = await this.#db.query<EngineSettingsRow>(
      `SELECT ${ENGINE_SETTINGS_COLUMNS} FROM engine_settings WHERE id = 'engine'`,
    );
    const row = existing.rows[0];
    if (row) return mapEngineSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO engine_settings (id, default_profile, default_layout, autostart, backup_dir, updated_at)
         VALUES ('engine', 'standard', 'Standard', false, NULL, $1)`,
        [new Date().toISOString()],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<EngineSettingsRow>(
      `SELECT ${ENGINE_SETTINGS_COLUMNS} FROM engine_settings WHERE id = 'engine'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultEngineSettings() : mapEngineSettings(stored);
  }

  async updateEngineSettings(patch: EngineSettingsPatch): Promise<EngineSettings> {
    const current = await this.getEngineSettings();
    const next: EngineSettings = {
      defaultProfile:
        patch.defaultProfile === undefined
          ? current.defaultProfile
          : patch.defaultProfile,
      defaultLayout:
        patch.defaultLayout === undefined
          ? current.defaultLayout
          : patch.defaultLayout,
      autostart:
        patch.autostart === undefined ? current.autostart : patch.autostart,
      backupDir:
        patch.backupDir === undefined ? current.backupDir : patch.backupDir,
    };
    await this.#db.query(
      `UPDATE engine_settings SET default_profile = $2, default_layout = $3,
         autostart = $4, backup_dir = $5, updated_at = $6 WHERE id = $1`,
      [
        "engine",
        next.defaultProfile,
        next.defaultLayout,
        next.autostart,
        next.backupDir,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // Image generation (S1, ADR-0008): one row with the provider chain, the
  // ComfyUI connection and the model file names. The defaults resolve the
  // image-use CLI from the skill installation of the operator.
  async getImageSettings(): Promise<ImageSettings> {
    const existing = await this.#db.query<ImageSettingsRow>(
      `SELECT ${IMAGE_SETTINGS_COLUMNS} FROM image_settings WHERE id = 'image'`,
    );
    const row = existing.rows[0];
    if (row) return mapImageSettings(row);
    const defaults = defaultImageSettings();
    try {
      await this.#db.query(
        `INSERT INTO image_settings (id, provider, fallback_provider, cooldown_minutes,
           cli_path, base_url, diffusion_model, text_encoder, vae, default_steps,
           max_pixels, timeout_minutes, custom_base_url, custom_model, custom_format,
           custom_api_key_encrypted, updated_at)
         VALUES ('image', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          defaults.provider,
          defaults.fallbackProvider,
          defaults.cooldownMinutes,
          defaults.cliPath,
          defaults.baseUrl,
          defaults.diffusionModel,
          defaults.textEncoder,
          defaults.vae,
          defaults.defaultSteps,
          defaults.maxPixels,
          defaults.timeoutMinutes,
          defaults.customBaseUrl,
          defaults.customModel,
          defaults.customFormat,
          defaults.customApiKeyEncrypted,
          new Date().toISOString(),
        ],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<ImageSettingsRow>(
      `SELECT ${IMAGE_SETTINGS_COLUMNS} FROM image_settings WHERE id = 'image'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaults : mapImageSettings(stored);
  }

  async updateImageSettings(patch: ImageSettingsPatch): Promise<ImageSettings> {
    const current = await this.getImageSettings();
    const next: ImageSettings = {
      provider: patch.provider ?? current.provider,
      fallbackProvider: patch.fallbackProvider ?? current.fallbackProvider,
      cooldownMinutes: patch.cooldownMinutes ?? current.cooldownMinutes,
      cliPath: patch.cliPath ?? current.cliPath,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      diffusionModel: patch.diffusionModel ?? current.diffusionModel,
      textEncoder: patch.textEncoder ?? current.textEncoder,
      vae: patch.vae ?? current.vae,
      defaultSteps: patch.defaultSteps ?? current.defaultSteps,
      maxPixels: patch.maxPixels ?? current.maxPixels,
      timeoutMinutes: patch.timeoutMinutes ?? current.timeoutMinutes,
      customBaseUrl: patch.customBaseUrl ?? current.customBaseUrl,
      customModel: patch.customModel ?? current.customModel,
      customFormat: patch.customFormat ?? current.customFormat,
      customApiKeyEncrypted:
        patch.customApiKeyEncrypted === undefined
          ? current.customApiKeyEncrypted
          : patch.customApiKeyEncrypted,
    };
    if (!IMAGE_PROVIDERS.includes(next.provider)) {
      throw new SenifyError("validation", `Unknown image provider "${next.provider}"`, {
        field: "image.provider",
        suggestion: `Choose one of: ${IMAGE_PROVIDERS.join(", ")}.`,
      });
    }
    if (!IMAGE_FALLBACK_PROVIDERS.includes(next.fallbackProvider)) {
      throw new SenifyError(
        "validation",
        `Unknown image fallback provider "${next.fallbackProvider}"`,
        {
          field: "image.fallbackProvider",
          suggestion: `Choose one of: ${IMAGE_FALLBACK_PROVIDERS.join(", ")}.`,
        },
      );
    }
    await this.#db.query(
      `UPDATE image_settings SET provider = $2, fallback_provider = $3,
         cooldown_minutes = $4, cli_path = $5, base_url = $6, diffusion_model = $7,
         text_encoder = $8, vae = $9, default_steps = $10, max_pixels = $11,
         timeout_minutes = $12, custom_base_url = $13, custom_model = $14,
         custom_format = $15, custom_api_key_encrypted = $16, updated_at = $17
         WHERE id = $1`,
      [
        "image",
        next.provider,
        next.fallbackProvider,
        next.cooldownMinutes,
        next.cliPath,
        next.baseUrl,
        next.diffusionModel,
        next.textEncoder,
        next.vae,
        next.defaultSteps,
        next.maxPixels,
        next.timeoutMinutes,
        next.customBaseUrl,
        next.customModel,
        next.customFormat,
        next.customApiKeyEncrypted,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // ------------------------------------------------------ image jobs (S2)

  async enqueueImageJob(input: {
    siteId: string;
    request: ImageJobRequest;
    maxAttempts?: number;
    now?: string;
  }): Promise<ImageJob> {
    const now = input.now ?? new Date().toISOString();
    const inserted = await this.#db.query<ImageJobRow>(
      `INSERT INTO image_jobs
        (id, site_id, status, request, provider_used, attempts, max_attempts,
         lease_until, provider_job_id, asset_id, error, created_at, started_at,
         finished_at, updated_at)
       VALUES ($1, $2, 'queued', $3, NULL, 0, $4, NULL, NULL, NULL, $5, $6, NULL, NULL, $6)
       RETURNING ${IMAGE_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        toJsonParam(input.request),
        input.maxAttempts ?? 3,
        toJsonParam([]),
        now,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("Image job insert returned no row");
    return mapImageJob(row);
  }

  // Claim the oldest due job whose site has no live running job (the
  // concurrency key: one generation per site at a time). The conditional
  // update makes the claim atomic.
  async claimImageJob(input: { now: string; leaseMs: number }): Promise<ImageJob | null> {
    const running = await this.#db.query<{ site_id: string }>(
      `SELECT DISTINCT site_id FROM image_jobs
       WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until > $1`,
      [input.now],
    );
    const busy = new Set(running.rows.map((row) => row.site_id));
    const due = await this.#db.query<ImageJobRow>(
      `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC, id ASC LIMIT 50`,
    );
    const candidate = due.rows.map(mapImageJob).find((job) => !busy.has(job.siteId));
    if (candidate === undefined) return null;
    const leaseUntil = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const claimed = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'running', attempts = attempts + 1,
         lease_until = $2, started_at = COALESCE(started_at, $1), updated_at = $1
       WHERE id = $3 AND status = 'queued'
       RETURNING ${IMAGE_JOB_COLUMNS}`,
      [input.now, leaseUntil, candidate.id],
    );
    const row = claimed.rows[0];
    return row === undefined ? null : mapImageJob(row);
  }

  // Records which provider is currently running (and its own job handle), so a
  // crash can resume instead of submitting a second run.
  async setImageJobProvider(input: {
    id: string;
    providerUsed: string;
    providerJobId?: string | null;
    now?: string;
  }): Promise<ImageJob> {
    const now = input.now ?? new Date().toISOString();
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET provider_used = $2, provider_job_id = $3, updated_at = $4
       WHERE id = $1 RETURNING ${IMAGE_JOB_COLUMNS}`,
      [input.id, input.providerUsed, input.providerJobId ?? null, now],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  async completeImageJob(
    id: string,
    result: { assetId: string; providerUsed: string; error: ImageJobAttempt[] },
    now = new Date().toISOString(),
  ): Promise<ImageJob> {
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'succeeded', asset_id = $2, provider_used = $3,
         error = $5, lease_until = NULL, provider_job_id = NULL,
         finished_at = $4, updated_at = $4
       WHERE id = $1 RETURNING ${IMAGE_JOB_COLUMNS}`,
      [id, result.assetId, result.providerUsed, now, toJsonParam(result.error)],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  // The final state: the error column carries the whole provider history.
  async failImageJob(input: {
    id: string;
    error: ImageJobAttempt[];
    now?: string;
  }): Promise<ImageJob> {
    const now = input.now ?? new Date().toISOString();
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'failed', error = $2, lease_until = NULL,
         provider_job_id = NULL, finished_at = $3, updated_at = $3
       WHERE id = $1 RETURNING ${IMAGE_JOB_COLUMNS}`,
      [input.id, toJsonParam(input.error), now],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  // Cancel only a queued job; a running job needs the provider's interrupt
  // (later slice) and answers with a conflict.
  async cancelImageJob(id: string, now = new Date().toISOString()): Promise<ImageJob> {
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'canceled', finished_at = $2, updated_at = $2
       WHERE id = $1 AND status = 'queued' RETURNING ${IMAGE_JOB_COLUMNS}`,
      [id, now],
    );
    const row = updated.rows[0];
    if (row) return mapImageJob(row);
    const current = await this.getImageJob(id);
    throw new SenifyError(
      "conflict",
      `Image job "${id}" cannot be canceled (status: ${current.status})`,
      {
        field: "jobId",
        suggestion: "Only a queued job can be canceled.",
      },
    );
  }

  // Crash recovery: a running job whose lease expired goes back to the queue;
  // a job that used up its attempts fails instead of looping forever.
  async expireImageLeases(now: string): Promise<number> {
    const requeued = await this.#db.query<{ id: string }>(
      `UPDATE image_jobs SET status = 'queued', lease_until = NULL, updated_at = $1
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until <= $1)
         AND attempts < max_attempts
       RETURNING id`,
      [now],
    );
    const failed = await this.#db.query<{ id: string }>(
      `UPDATE image_jobs SET status = 'failed', lease_until = NULL,
         provider_job_id = NULL, finished_at = $1, updated_at = $1
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until <= $1)
         AND attempts >= max_attempts
       RETURNING id`,
      [now],
    );
    return requeued.rows.length + failed.rows.length;
  }

  async getImageJob(id: string): Promise<ImageJob> {
    const result = await this.#db.query<ImageJobRow>(
      `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  async listImageJobs(
    siteId: string,
    options: { status?: ImageJobStatus; limit?: number } = {},
  ): Promise<ImageJob[]> {
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const result = options.status === undefined
      ? await this.#db.query<ImageJobRow>(
          `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs
           WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
          [siteId, limit],
        )
      : await this.#db.query<ImageJobRow>(
          `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs
           WHERE site_id = $1 AND status = $2 ORDER BY created_at DESC, id DESC LIMIT $3`,
          [siteId, options.status, limit],
        );
    return result.rows.map(mapImageJob);
  }

  // Active provider cooldowns at `now`; the worker skips those providers.
  async listProviderCooldowns(now: string): Promise<ProviderCooldown[]> {
    const result = await this.#db.query<{
      provider: string;
      until: string;
      reason: string;
    }>(
      `SELECT provider, until, reason FROM image_provider_cooldowns
       WHERE until > $1 ORDER BY provider ASC`,
      [now],
    );
    return result.rows.map((row) => ({
      provider: row.provider,
      until: new Date(row.until).toISOString(),
      reason: row.reason,
    }));
  }

  async setProviderCooldown(input: {
    provider: string;
    until: string;
    reason: string;
    now?: string;
  }): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    await this.#db.query(
      `INSERT INTO image_provider_cooldowns (provider, until, reason, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider) DO UPDATE SET until = $2, reason = $3, updated_at = $4`,
      [input.provider, input.until, input.reason, now],
    );
  }

  // House DNA and the preferences of the reference briefs (T14). They live in
  // the engine so the surface and the MCP tools build the same brief.
  async getReferenceSettings(): Promise<ReferenceSettings> {
    const existing = await this.#db.query<ReferenceSettingsRow>(
      `SELECT ${REFERENCE_SETTINGS_COLUMNS} FROM reference_settings WHERE id = 'references'`,
    );
    const row = existing.rows[0];
    if (row) return mapReferenceSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO reference_settings (id, dna, include_dna, overrides, updated_at)
         VALUES ('references', $1, false, '', $2)`,
        [
          toJsonParam({ name: "", description: "", constants: [], never: [] }),
          new Date().toISOString(),
        ],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<ReferenceSettingsRow>(
      `SELECT ${REFERENCE_SETTINGS_COLUMNS} FROM reference_settings WHERE id = 'references'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultReferenceSettings() : mapReferenceSettings(stored);
  }

  async updateReferenceSettings(patch: {
    dna?: ReferenceDna;
    preferences?: Partial<ReferencePreferences>;
  }): Promise<ReferenceSettings> {
    const current = await this.getReferenceSettings();
    const next: ReferenceSettings = {
      dna: patch.dna ?? current.dna,
      preferences: {
        includeDna:
          patch.preferences?.includeDna ?? current.preferences.includeDna,
        overrides:
          patch.preferences?.overrides ?? current.preferences.overrides,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.#db.query(
      `UPDATE reference_settings SET dna = $2, include_dna = $3, overrides = $4,
         updated_at = $5 WHERE id = $1`,
      [
        "references",
        toJsonParam(next.dna),
        next.preferences.includeDna,
        next.preferences.overrides,
        next.updatedAt,
      ],
    );
    return next;
  }

  // Persisted secret for encryption at rest. It lives in a file outside the
  // database (ADR-0017): the backup exports every table, and a key stored next
  // to the ciphertext it protects would make the backup plaintext.
  getOrCreateEngineSecret(): Promise<string> {
    // One resolution per Store: the settings and the image worker ask at once.
    this.#engineSecret ??= this.#resolveEngineSecret().catch((error: unknown) => {
      this.#engineSecret = undefined;
      throw error;
    });
    return this.#engineSecret;
  }

  async #resolveEngineSecret(): Promise<string> {
    const file = this.#secretFile;
    const existing = await this.#db.query<{ secret: string }>(
      `SELECT secret FROM engine_secrets WHERE name = 'settings' LIMIT 1`,
    );
    const row = existing.rows[0];
    if (file === undefined) {
      if (row) return row.secret;
      const secret = randomBytes(32).toString("base64url");
      await this.#db.query(
        `INSERT INTO engine_secrets (id, name, secret, created_at) VALUES ($1, 'settings', $2, $3)`,
        [newEntityId(), secret, new Date().toISOString()],
      );
      return secret;
    }
    const stored = readSecretFile(file);
    if (stored !== undefined) {
      // A row that differs is another key (an old backup on another machine):
      // it stays, it is the only copy of what that backup's ciphertext needs.
      if (row?.secret === stored) await this.#dropLegacySecret();
      return stored;
    }
    // No file yet: an older install keeps its key in the database and moves it
    // unchanged (its ciphertext stays readable); a fresh one issues a new key.
    publishSecretFile(file, row?.secret ?? randomBytes(32).toString("base64url"));
    const published = readSecretFile(file);
    if (published === undefined) {
      throw new SenifyError("conflict", `Die Schlüsseldatei ${file} ist nicht lesbar`, {
        suggestion: "Rechte des Datenordners prüfen.",
      });
    }
    // Only after the file reads back: the row is the only other copy.
    if (row?.secret === published) await this.#dropLegacySecret();
    return published;
  }

  async #dropLegacySecret(): Promise<void> {
    await this.#db.query(`DELETE FROM engine_secrets WHERE name = 'settings'`);
  }

  // Raw table dump for backups; names come from the schema, never from input.
  async dumpTable(name: string): Promise<Row[]> {
    if (!tableNames().includes(name)) {
      throw new SenifyError("validation", `Unbekannte Tabelle "${name}"`, {
        field: "table",
      });
    }
    const result = await this.#db.query(`SELECT * FROM ${name}`);
    return result.rows;
  }

  // Writes a dump back (restore): the listed tables are cleared and refilled in
  // one transaction, so a restored state is either fully there or not at all.
  // `order` names parents before children: clearing walks it backwards and
  // refilling forwards, which keeps foreign keys satisfied.
  async replaceTables(input: {
    order: readonly string[];
    rows: Record<string, Row[]>;
  }): Promise<Record<string, number>> {
    const known = tableNames();
    for (const name of input.order) {
      if (!known.includes(name)) {
        throw new SenifyError("validation", `Unbekannte Tabelle "${name}"`, {
          field: "table",
        });
      }
    }
    return this.#db.withTransaction(async (tx) => {
      for (const name of [...input.order].reverse()) {
        await tx.query(`DELETE FROM ${name}`);
      }
      const counts: Record<string, number> = {};
      for (const name of input.order) {
        const rows = input.rows[name] ?? [];
        counts[name] = rows.length;
        await insertDumpRows(tx, name, rows);
      }
      return counts;
    });
  }
}

// Rows of a dump still carry parsed JSON and Date objects: JSONB columns need
// their text form back (accepted twice, as object and as JSON text), every
// other value goes in as the driver returned it.
function dumpParam(value: unknown, json: boolean): unknown {
  if (value === null || value === undefined) return null;
  if (!json) return value;
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      // Not JSON text: the column holds a plain string, quote it below.
    }
  }
  return JSON.stringify(value);
}

const INSERT_DUMP_BATCH = 100;

async function insertDumpRows(
  client: DbClient,
  name: string,
  rows: Row[],
): Promise<void> {
  if (rows.length === 0) return;
  const json = jsonColumns(name);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  for (let start = 0; start < rows.length; start += INSERT_DUMP_BATCH) {
    const batch = rows.slice(start, start + INSERT_DUMP_BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const refs = columns.map((column) => {
        params.push(dumpParam(row[column], json.has(column)));
        return `$${params.length}`;
      });
      return `(${refs.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${name} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`,
      params,
    );
  }
}

function buildAuditInsert(entries: NewAuditEntry[]): {
  text: string;
  params: unknown[];
} {
  const values: string[] = [];
  const params: unknown[] = [];
  entries.forEach((entry, index) => {
    const base = index * 11;
    const refs = Array.from({ length: 11 }, (_, offset) => `$${base + offset + 1}`);
    values.push(`(${refs.join(", ")})`);
    params.push(
      newEntityId(),
      entry.siteId,
      entry.pageId,
      entry.batchId,
      entry.opIndex,
      entry.mutation,
      toJsonParam(entry.params),
      toJsonParam(entry.author),
      toJsonParam(entry.undoPatch),
      entry.draftVersionAfter,
      new Date().toISOString(),
    );
  });
  return {
    text: `INSERT INTO audit_entries
      (id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at)
      VALUES ${values.join(", ")}`,
    params,
  };
}

// -------------------------------------------------------------- forms (T11)

const NOTIFICATION_COLUMNS =
  "id, site_id, form_id, entry_id, kind, recipient, subject, body, status, attempts, next_attempt_at, last_error, created_at, updated_at, sent_at";

type FormSnapshotRow = {
  id: string;
  form_id: string;
  site_id: string;
  page_id: string;
  node_id: string;
  page_path: string;
  section_type: string;
  snapshot: unknown;
  created_at: unknown;
};

function mapFormSnapshot(row: FormSnapshotRow): FormSnapshotRecord {
  return {
    id: row.id,
    formId: row.form_id,
    siteId: row.site_id,
    pageId: row.page_id,
    nodeId: row.node_id,
    pagePath: row.page_path,
    sectionType: row.section_type,
    snapshot: toJson<FormSnapshot>(row.snapshot),
    createdAt: toIso(row.created_at),
  };
}

type NotificationRow = {
  id: string;
  site_id: string;
  form_id: unknown;
  entry_id: unknown;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  attempts: unknown;
  next_attempt_at: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  sent_at: unknown;
};

function mapNotification(row: NotificationRow): NotificationMessage {
  return {
    id: row.id,
    siteId: row.site_id,
    formId: typeof row.form_id === "string" ? row.form_id : null,
    entryId: typeof row.entry_id === "string" ? row.entry_id : null,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status as NotificationStatus,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    sentAt: row.sent_at === null || row.sent_at === undefined ? null : toIso(row.sent_at),
  };
}

type NewsletterTokenRow = {
  token: string;
  site_id: string;
  form_id: string;
  entry_id: string;
  email: string;
  kind: string;
  status: string;
  expires_at: unknown;
  created_at: unknown;
  used_at: unknown;
};

function mapNewsletterToken(row: NewsletterTokenRow): NewsletterToken {
  return {
    token: row.token,
    siteId: row.site_id,
    formId: row.form_id,
    entryId: row.entry_id,
    email: row.email,
    kind: row.kind as NewsletterTokenKind,
    status: row.status,
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    usedAt: row.used_at === null || row.used_at === undefined ? null : toIso(row.used_at),
  };
}

// ------------------------------------------------------------ references (T14)

const REFERENCE_COLUMNS =
  "id, name, source_url, method, status, stage, progress, failure_reason, families, vocabulary, style_brief, snapshots, provenance, created_at, updated_at, collection_id, note, image_recipe, hero_usage, family, origin";

// The documents are tens of kilobytes each: the card list never selects them,
// only the detail view reads them along with the row.
const REFERENCE_COLUMNS_WITH_DOCUMENTS = `${REFERENCE_COLUMNS}, documents`;

const REFERENCE_COLLECTION_COLUMNS =
  "id, name, description, deploy_for, vocabulary, risk, accent, image_style, recognize, examples, warning, kind, external_id, position, created_at, updated_at";

const REFERENCE_SETTINGS_COLUMNS = "dna, include_dna, overrides, updated_at";

function referenceOrderBy(sort: ReferenceListSort | undefined): string {
  return sort === "name"
    ? "lower(name) ASC, id ASC"
    : "created_at DESC, id DESC";
}

const REFERENCE_PROFILE_COLUMNS =
  "id, reference_id, revision, profile, evidence, provenance, author, note, created_at";

const REFERENCE_JOB_COLUMNS =
  "id, reference_id, status, stage, progress, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, finished_at";

const BAKE_JOB_COLUMNS =
  "id, site_id, reason, paths, status, attempts, max_attempts, next_attempt_at, lease_until, last_error, created_at, updated_at, finished_at";

const IMPORT_JOB_COLUMNS =
  "id, site_id, source_kind, source_url, page_path, dry_run, status, stage, progress, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, finished_at";

const REFERENCE_ASSIGNMENT_COLUMNS =
  "id, site_id, reference_id, scales, priority, created_at, updated_at";

type ReferenceRow = {
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
function mapReferenceSummary(
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

function mapReference(
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

type ReferenceCollectionRow = {
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

function mapReferenceCollection(
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

type ReferenceSettingsRow = {
  dna: unknown;
  include_dna: unknown;
  overrides: string;
  updated_at: unknown;
};

function mapReferenceSettings(row: ReferenceSettingsRow): ReferenceSettings {
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

function defaultReferenceSettings(): ReferenceSettings {
  return {
    dna: { name: "", description: "", constants: [], never: [] },
    preferences: { includeDna: false, overrides: "" },
    updatedAt: new Date().toISOString(),
  };
}

type ReferenceProfileRow = {
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

function mapReferenceProfile(row: ReferenceProfileRow): ReferenceProfileRevision {
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

type ReferenceJobRow = {
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

function mapReferenceJob(row: ReferenceJobRow): ReferenceJob {
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

type ImportReceiptRow = {
  id: string;
  site_id: string;
  job_id: string;
  content_key: string;
  request_fingerprint: string;
  page_id: string;
  draft_version: unknown;
  result: unknown;
  created_at: unknown;
};

function mapImportReceipt(row: ImportReceiptRow): ImportReceipt {
  return {
    id: row.id,
    siteId: row.site_id,
    jobId: row.job_id,
    contentKey: row.content_key,
    requestFingerprint: row.request_fingerprint,
    pageId: row.page_id,
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    result: toJson<Record<string, unknown>>(row.result),
    createdAt: toIso(row.created_at),
  };
}

type ImportJobRow = {
  id: string;
  site_id: string;
  source_kind: string;
  source_url: unknown;
  page_path: string;
  dry_run: unknown;
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

function mapImportJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    siteId: row.site_id,
    sourceKind: row.source_kind as ImportJobSource["kind"],
    sourceUrl: row.source_url === null || row.source_url === undefined ? null : String(row.source_url),
    pagePath: row.page_path,
    dryRun: row.dry_run === true,
    status: row.status as ImportJobStatus,
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

type BakeJobRow = {
  id: string;
  site_id: string;
  reason: string;
  paths: unknown;
  status: string;
  attempts: unknown;
  max_attempts: unknown;
  next_attempt_at: unknown;
  lease_until: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  finished_at: unknown;
};

function mapBakeJob(row: BakeJobRow): BakeJob {
  const paths = toJson<string[]>(row.paths);
  return {
    id: row.id,
    siteId: row.site_id,
    reason: row.reason,
    paths: Array.isArray(paths) ? paths : [],
    status: row.status as BakeJobStatus,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    maxAttempts: toFiniteNumber(row.max_attempts, "max_attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    leaseUntil:
      row.lease_until === null || row.lease_until === undefined ? null : toIso(row.lease_until),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    finishedAt:
      row.finished_at === null || row.finished_at === undefined ? null : toIso(row.finished_at),
  };
}

type ReferenceAssignmentRow = {
  id: string;
  site_id: string;
  reference_id: string;
  scales: unknown;
  priority: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function mapReferenceAssignment(row: ReferenceAssignmentRow): ReferenceAssignment {
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

// ------------------------------------------------------------ settings (T12)

const SMTP_COLUMNS = "host, port, tls, username, password_encrypted, from_address";

const ENGINE_SETTINGS_COLUMNS =
  "default_profile, default_layout, autostart, backup_dir";

function toBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return value === "true" || value === "t" || value === "1";
  }
  return false;
}

type SmtpRow = {
  host: string;
  port: unknown;
  tls: string;
  username: string;
  password_encrypted: unknown;
  from_address: string;
};

function defaultSmtpSettings(): SmtpSettingsRecord {
  return {
    host: "",
    port: 587,
    tls: "starttls",
    user: "",
    from: "",
    passwordEncrypted: null,
  };
}

function mapSmtpSettings(row: SmtpRow): SmtpSettingsRecord {
  const tls = SMTP_TLS_MODES.includes(row.tls as SmtpTlsMode)
    ? (row.tls as SmtpTlsMode)
    : "starttls";
  return {
    host: row.host,
    port: toFiniteNumber(row.port, "port"),
    tls,
    user: row.username,
    from: row.from_address,
    passwordEncrypted:
      typeof row.password_encrypted === "string" ? row.password_encrypted : null,
  };
}

type EngineSettingsRow = {
  default_profile: string;
  default_layout: string;
  autostart: unknown;
  backup_dir: unknown;
};

function defaultEngineSettings(): EngineSettings {
  return {
    defaultProfile: "standard",
    defaultLayout: "Standard",
    autostart: false,
    backupDir: null,
  };
}

function mapEngineSettings(row: EngineSettingsRow): EngineSettings {
  const profile = SITE_PROFILES.includes(row.default_profile as Site["profile"])
    ? (row.default_profile as Site["profile"])
    : "standard";
  return {
    defaultProfile: profile,
    defaultLayout: row.default_layout,
    autostart: toBoolean(row.autostart),
    backupDir: typeof row.backup_dir === "string" ? row.backup_dir : null,
  };
}

// ------------------------------------------------------------ images (S1)

const IMAGE_SETTINGS_COLUMNS =
  "provider, fallback_provider, cooldown_minutes, cli_path, base_url, diffusion_model, text_encoder, vae, default_steps, max_pixels, timeout_minutes, custom_base_url, custom_model, custom_format, custom_api_key_encrypted";

type ImageSettingsRow = {
  provider: string;
  fallback_provider: string;
  cooldown_minutes: unknown;
  cli_path: string;
  base_url: string;
  diffusion_model: string;
  text_encoder: string;
  vae: string;
  default_steps: unknown;
  max_pixels: unknown;
  timeout_minutes: unknown;
  custom_base_url: string;
  custom_model: string;
  custom_format: string;
  custom_api_key_encrypted: string | null;
};

export function defaultImageSettings(): ImageSettings {
  return {
    provider: "image-use",
    fallbackProvider: "comfyui",
    cooldownMinutes: 60,
    // The CLI of the image-use skill installation; an empty stored value keeps
    // this default, so a fresh installation works without setup.
    cliPath: join(homedir(), ".agents", "skills", "image-use", "image-use"),
    baseUrl: "http://127.0.0.1:8188",
    diffusionModel: "qwen-image-2.1-Q4_K_M.gguf",
    textEncoder: "qwen3vl_8b_int8_convrot.safetensors",
    vae: "qwen_image_2.1_vae_bf16.safetensors",
    defaultSteps: 40,
    maxPixels: 1_048_576,
    timeoutMinutes: 60,
    // The custom endpoint (third path) defaults to MiniMax; the API key has to
    // be stored before the provider can run.
    customBaseUrl: "https://api.minimax.io/v1",
    customModel: "image-01",
    customFormat: "minimax",
    customApiKeyEncrypted: null,
  };
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value, "image");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function mapImageSettings(row: ImageSettingsRow): ImageSettings {
  const defaults = defaultImageSettings();
  const provider = IMAGE_PROVIDERS.includes(row.provider as ImageProviderName)
    ? (row.provider as ImageProviderName)
    : defaults.provider;
  const fallbackProvider = IMAGE_FALLBACK_PROVIDERS.includes(
    row.fallback_provider as ImageFallbackProvider,
  )
    ? (row.fallback_provider as ImageFallbackProvider)
    : defaults.fallbackProvider;
  const customFormat = IMAGE_CUSTOM_FORMATS.includes(
    row.custom_format as ImageCustomFormat,
  )
    ? (row.custom_format as ImageCustomFormat)
    : defaults.customFormat;
  return {
    provider,
    fallbackProvider,
    cooldownMinutes: positiveInteger(row.cooldown_minutes, defaults.cooldownMinutes),
    cliPath: row.cli_path === "" ? defaults.cliPath : row.cli_path,
    baseUrl: row.base_url === "" ? defaults.baseUrl : row.base_url,
    diffusionModel: row.diffusion_model === "" ? defaults.diffusionModel : row.diffusion_model,
    textEncoder: row.text_encoder === "" ? defaults.textEncoder : row.text_encoder,
    vae: row.vae === "" ? defaults.vae : row.vae,
    defaultSteps: positiveInteger(row.default_steps, defaults.defaultSteps),
    maxPixels: positiveInteger(row.max_pixels, defaults.maxPixels),
    timeoutMinutes: positiveInteger(row.timeout_minutes, defaults.timeoutMinutes),
    customBaseUrl:
      row.custom_base_url === "" ? defaults.customBaseUrl : row.custom_base_url,
    customModel: row.custom_model === "" ? defaults.customModel : row.custom_model,
    customFormat,
    customApiKeyEncrypted:
      typeof row.custom_api_key_encrypted === "string"
        ? row.custom_api_key_encrypted
        : null,
  };
}

// ------------------------------------------------------ image jobs (S2)

const IMAGE_JOB_COLUMNS =
  "id, site_id, status, request, provider_used, attempts, max_attempts, lease_until, provider_job_id, asset_id, error, created_at, started_at, finished_at, updated_at";

type ImageJobRow = {
  id: string;
  site_id: string;
  status: string;
  request: unknown;
  provider_used: unknown;
  attempts: unknown;
  max_attempts: unknown;
  lease_until: unknown;
  provider_job_id: unknown;
  asset_id: unknown;
  error: unknown;
  created_at: unknown;
  started_at: unknown;
  finished_at: unknown;
  updated_at: unknown;
};

function timestampOrNull(value: unknown): string | null {
  return typeof value === "string" ? new Date(value).toISOString() : null;
}

function mapImageJob(row: ImageJobRow): ImageJob {
  const status = IMAGE_JOB_STATUSES.includes(row.status as ImageJobStatus)
    ? (row.status as ImageJobStatus)
    : "failed";
  const attempts = toJson<ImageJobAttempt[]>(row.error);
  return {
    id: row.id,
    siteId: row.site_id,
    status,
    request: toJson<ImageJobRequest>(row.request),
    providerUsed: typeof row.provider_used === "string" ? row.provider_used : null,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    maxAttempts: toFiniteNumber(row.max_attempts, "max_attempts"),
    leaseUntil: timestampOrNull(row.lease_until),
    providerJobId:
      typeof row.provider_job_id === "string" ? row.provider_job_id : null,
    assetId: typeof row.asset_id === "string" ? row.asset_id : null,
    error: Array.isArray(attempts) ? attempts : [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    startedAt: timestampOrNull(row.started_at),
    finishedAt: timestampOrNull(row.finished_at),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
