import { createHash } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { IdempotencyKeySchema } from "./mutations/contract.ts";
import { REDESIGN_PROPOSAL_STATUSES, type RedesignProposalStatus } from "./types.ts";

export type { RedesignProposalStatus };

const CLOSED = { additionalProperties: false } as const;

// Redesign proposals (ADR-0012): the offered direction is derived server-side
// from the redesign package, the human decision is persisted with it, and the
// apply result travels in the same row. An agent may propose and read; only a
// human operator decides.

export const CreateRedesignProposalBodySchema = Type.Object(
  {
    referenceIds: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 3,
    }),
    idempotencyKey: IdempotencyKeySchema,
  },
  CLOSED,
);
export type CreateRedesignProposalBody = Static<typeof CreateRedesignProposalBodySchema>;

export const ConfirmRedesignProposalBodySchema = Type.Object(
  {
    directionId: Type.String({ minLength: 1 }),
    idempotencyKey: IdempotencyKeySchema,
  },
  CLOSED,
);
export type ConfirmRedesignProposalBody = Static<typeof ConfirmRedesignProposalBodySchema>;

// Closing an open media need after the apply (Fahrplan P2-2). The caller names
// the need and says how it was closed. The four treatments differ in exactly
// one way, and the schema says so rather than leaving it to the handler:
//
//   - `select` / `upload` / `generate` all end in "this asset of the target
//     site fills this slot". They differ in where the bytes came from, which is
//     the caller's business and not something the server can check.
//   - `manual` has NO asset. The human decided the slot stays empty, and an
//     `assetId` next to it is a contradiction, not a hint.
//
// The union is over the whole entry, not over a nested `treatment` field: a
// caller sends `{ needId, treatment, assetId }`, and a nested union would make
// the `assetId` an unexpected property of the outer object.
const NEED_ID = Type.String({ minLength: 1 });
const ASSET_ID = Type.String({ minLength: 1 });

export const ResolveMediaNeedSchema = Type.Union([
  Type.Object(
    { needId: NEED_ID, treatment: Type.Literal("select"), assetId: ASSET_ID },
    CLOSED,
  ),
  Type.Object(
    { needId: NEED_ID, treatment: Type.Literal("upload"), assetId: ASSET_ID },
    CLOSED,
  ),
  Type.Object(
    { needId: NEED_ID, treatment: Type.Literal("generate"), assetId: ASSET_ID },
    CLOSED,
  ),
  Type.Object({ needId: NEED_ID, treatment: Type.Literal("manual") }, CLOSED),
]);
export type ResolveMediaNeed = Static<typeof ResolveMediaNeedSchema>;

export const ResolveMediaNeedsBodySchema = Type.Object(
  {
    resolutions: Type.Array(ResolveMediaNeedSchema, { minItems: 1 }),
    idempotencyKey: IdempotencyKeySchema,
  },
  CLOSED,
);
export type ResolveMediaNeedsBody = Static<typeof ResolveMediaNeedsBodySchema>;

// Sektions-Plan (ADR-0013): the offered direction also says which registered
// sections of the source page it touches, with which variant, which slots and
// which media are needed. Derived server-side, immutable, and proven against a
// copy of the source draft before it is stored.
export type DirectionSectionEntry = {
  source: {
    nodeId: string;
    type: string;
    variant: string | null;
    parentNodeId: string;
    slot: string | null;
    index: number;
    hidden: boolean;
  };
  target: {
    // null means: no registered target, a human decides this one.
    type: string | null;
    typeVersion: number | null;
    variant: string | null;
    // The complete preset of the chosen variant. updateNodeMeta does not apply
    // presets afterwards, so a later executor materializes these explicitly.
    variantPreset: Record<string, unknown>;
  };
  content: { policy: "preserve"; propKeys: string[] };
  design: { policy: "theme-inheritance"; stylePropKeys: string[] };
  children: string[];
  slots: Record<string, string[]>;
  status: "exact" | "fallback" | "manual";
  warnings: string[];
};

export type DirectionMediaNeed = {
  id: string;
  // The section this need belongs to. Without it the `targetPath` below is not
  // addressable: the executor knows which node it seeded, but a caller
  // answering later only has the need - so the node travels with it (P2-2).
  targetNodeId: string;
  // Prop path inside the planned section, e.g. "items[0].cover".
  targetPath: string;
  role: "source-asset" | "reference-asset" | "new-visual";
  treatment: "reuse" | "select" | "upload" | "generate" | "avoid" | "manual";
  source: {
    siteId: string | null;
    assetId: string | null;
    hash: string | null;
    reference: "site-asset" | "reference-profile" | "proposed" | null;
  };
  // A later work instruction, never an executed job.
  prompt: string | null;
  alt: string | null;
  decorative: boolean;
  reason: string;
};

// One open media need, in the shape a caller can act on (Fahrplan P2-2, R2
// Nachfolger). The plan's `media` entries are the immutable record of what the
// direction was built from; this is the work item derived from them, and it
// answers three questions a client would otherwise have to guess: what exactly
// is missing, which of the five treatments applies, and what the caller may
// send to close it.
//
// `resolution` is what the caller supplies, never something the server guesses.
// A `select` with an asset the caller did not name stays open rather than
// picking the first plausible match - a wrong image is worse than a missing one,
// and the alternative would make `open` a claim instead of a fact.
export type MediaNeedResolution =
  // `select`: an asset of the TARGET site. The server checks it belongs there.
  | { treatment: "select"; assetId: string }
  // `upload` and `generate` both end in a new asset of the target site. They
  // differ in where the bytes come from, which is the caller's business; by the
  // time the server sees them, both are "this asset now fills this slot".
  | { treatment: "upload"; assetId: string }
  | { treatment: "generate"; assetId: string }
  // `manual`: the human will place something themselves. The slot stays empty
  // and the need is closed, because "a human owns this" is a decision, not an
  // omission. It is recorded in the report so the emptiness is not later read
  // as a bug.
  | { treatment: "manual" };

export type OpenMediaNeed = {
  // The plan entry this came from, so a resolution can be checked against the
  // plan and a report can be traced back to the direction that asked for it.
  needId: string;
  targetNodeId: string;
  targetPath: string;
  role: DirectionMediaNeed["role"];
  treatment: "select" | "upload" | "generate" | "manual";
  reason: string;
  // Present for `generate`: the prompt the plan derived. The provider chain
  // (ADR-0008) takes it as it is; the caller may narrow it, never widen it into
  // something that copies the reference.
  prompt: string | null;
  alt: string | null;
  decorative: boolean;
  // Set when the caller closed the need; null while it is open.
  resolvedWith: { treatment: MediaNeedResolution["treatment"]; assetId: string | null } | null;
};

export type DirectionSectionPlan = {
  schemaVersion: 1;
  mappingVersion: 1;
  planHash: string;
  source: { pageId: string; draftVersion: number; treeHash: string };
  target: {
    mode: "preserve-registered-sections";
    scope: "page";
    contentPolicy: "preserve";
    themePolicy: "confirmed-patch";
  };
  registry: {
    fingerprint: string;
    sections: { type: string; version: number; hash: string }[];
  };
  entries: DirectionSectionEntry[];
  media: DirectionMediaNeed[];
  summary: {
    exact: number;
    fallback: number;
    manual: number;
    reuse: number;
    select: number;
    generate: number;
    avoid: number;
  };
};

export type DirectionCard = {
  id: string;
  referenceId: string;
  reference: {
    name: string;
    sourceUrl: string;
    collection: string | null;
    family: string | null;
    vocabulary: string[];
  };
  // The proposal's own immutable copy of the reference image. An unversioned
  // remote URL is not a trustworthy picture for a decision (ADR-0012).
  screenshot: {
    fileName: string;
    hash: string;
    alt: string;
  };
  theme: {
    patch: Record<string, unknown>;
    specimen: {
      brand: string;
      neutralBase: string | null;
      displayFont: string;
      bodyFont: string;
      typeBase: number | null;
      radiusBase: string | null;
    };
  };
  rationale: { field: string; value: string; source: string; referenceId: string }[];
  rules: { constants: string[]; never: string[] };
  warnings: string[];
  // The offered build scope: which sections, variants, slots and media.
  sectionPlan: DirectionSectionPlan;
  // SHA-256 over the canonical card content: without its own id and without the
  // derived screenshot file name, but with the screenshot hash, the section plan
  // and the media needs. Two proposals for the same page and reference therefore
  // share one hash, and a stored card can be re-verified before a confirm.
  offerHash: string;
};

// The plan the cards were derived from. Draft and theme version pin the source;
// the profile revision and hash pin the references. The section plan adds the
// source tree, the site profile, the design contract and the registry sections
// it actually uses (ADR-0013).
export type RedesignProposalBasis = {
  source: {
    siteId: string;
    pageId: string;
    title: string;
    path: string;
    draftVersion: number;
    themeVersion: number;
    // Absent on proposals created before ADR-0013.
    treeHash?: string;
    siteProfile?: string;
    designContractHash?: string | null;
  };
  references: { referenceId: string; profileRevision: number; profileHash: string }[];
  registry?: {
    fingerprint: string;
    sections: { type: string; version: number; hash: string }[];
  };
  mappingVersion?: number;
};

export type DirectionDecision = {
  directionId: string;
  referenceId: string;
  offerHash: string;
  author: { kind: "human"; id: string; label: string };
  at: string;
};

export type RedesignProposalApplyResult = {
  status: "applied" | "failed";
  // What this run actually wrote. Since P2-1 the confirm carries the section
  // plan into the atomic commit, so the scope is no longer only a scaffold:
  // `section-plan` means the plan's sections were written, `scaffold-theme`
  // means the run fell back to the generic skeleton (no plan, or the plan
  // matched no page). The value is read from the same flag that
  // `sectionPlanApplied` reports, so the two can never disagree.
  scope: "scaffold-theme" | "section-plan";
  // Whether the run really wrote the plan its card was carrying. `false` is
  // the honest default: the plan then stays the handoff document and the human
  // still has work to do. `true` only when the run actually produced a rebuild
  // write AND no media need is left open (Fahrplan P2-1 Punkt 5, R3). This is
  // an honesty statement, not a progress indicator.
  sectionPlanApplied: boolean;
  planHash: string | null;
  // Every media need this run could not cover, as work items rather than text
  // (Fahrplan P2-2). The `warnings` array says the same thing in prose; these
  // say it in a shape a client can act on - which treatment applies, which prompt
  // a `generate` would use, and which need id a later call has to name. Empty
  // when the plan's media were all reusable or deliberately avoided.
  openMediaNeeds: OpenMediaNeed[];
  // The draft handoff: the site and the page the operator continues in.
  siteId: string | null;
  pageId: string | null;
  pagePath: string | null;
  pages: { pageId: string; path: string; seeded: boolean }[];
  verificationOk: boolean;
  warnings: string[];
  // Set when status is "failed": the chosen direction stays, the error does not
  // vanish with a retry.
  error: { category: string; message: string } | null;
};

// Staleness is computed from the current source, never stored: a stored flag
// would go stale itself.
export type RedesignProposalFreshness = {
  current: boolean;
  reasons: string[];
};

export type RedesignProposal = {
  id: string;
  sourcePageId: string;
  status: RedesignProposalStatus;
  source: RedesignProposalBasis["source"];
  cards: DirectionCard[];
  decision: DirectionDecision | null;
  applyResult: RedesignProposalApplyResult | null;
  createdAt: string;
  // When the human's window to decide this proposal runs out (Fahrplan P2-3,
  // R2). Null on a proposal created before the column existed.
  expiresAt: string | null;
};

export type RedesignProposalView = RedesignProposal & {
  freshness: RedesignProposalFreshness;
};

export function isRedesignProposalStatus(value: unknown): value is RedesignProposalStatus {
  return (
    typeof value === "string" &&
    (REDESIGN_PROPOSAL_STATUSES as readonly string[]).includes(value)
  );
}

// Deterministic JSON for hashes: object keys are sorted recursively, array order
// is content. The same shape the idempotency fingerprint uses.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

// The content hash of a card (ADR-0013). It leaves out everything that is
// random per proposal — the direction id and the screenshot file name derived
// from it — and keeps everything that describes what the human was shown: the
// screenshot hash, the theme patch, the rules, the section plan and the media
// needs. Two proposals for the same page and reference therefore agree, and a
// stored card can be re-verified before a confirm.
export function directionCardContentHash(
  card: Omit<DirectionCard, "offerHash"> | DirectionCard,
): string {
  // Both the id and the hash field itself are excluded, so hashing before the
  // write and re-hashing after the read produce the same value.
  const { id: _id, screenshot, ...rest } = card as DirectionCard;
  const { fileName: _fileName, ...screenshotContent } = screenshot;
  const { offerHash: _offerHash, ...content } = rest;
  return canonicalHash({ ...content, screenshot: screenshotContent });
}

// Recomputes the content hash of a stored card. A mismatch means the row was
// changed after it was written, and the direction may no longer be confirmed.
export function verifyDirectionCardContentHash(card: DirectionCard): boolean {
  return directionCardContentHash(card) === card.offerHash;
}
