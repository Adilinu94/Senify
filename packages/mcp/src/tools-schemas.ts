// Die Ausgabeschemas der lesenden Werkzeuge (P3-3, R8).
//
// Sie standen in `tools.ts` neben den Werkzeugen, die sie tragen. Als die
// Medienwerkzeuge nach `tools-medien.ts` wanderten (P3-2, Schritt 57),
// entstand daraus ein Zirkelimport: `tools.ts` importiert `MEDIEN_TOOLS`,
// `tools-medien.ts` importiert `ASSET_SCHEMA` - und ES-Module loesen das
// mit einer TDZ auf (`Cannot access 'ASSET_SCHEMA' before initialization`).
// `tsc` und ESLint melden dabei nichts, weil der Typ stimmt; erst der
// laufende Server bricht.
//
// Schemas sind Daten, keine Werkzeuge: sie gehoeren in ein Modul, das beide
// Seiten importieren. Damit gibt es keinen Zyklus.

// The output schemas of the reading tools (P3-3, R8). They are written next to
// the handler that produces the value, and the server refuses to send
// `structuredContent` whose value does not validate - a schema the code does not
// keep is worse than no schema, because the client stops checking.
//
// Only the fields a client actually branches on are required; everything else
// is described but not demanded, so a later field addition does not break a
// client that validated against the older schema.
export const SITE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    slug: { type: "string" },
    profile: { type: "string" },
    themeId: { type: ["string", "null"] },
    // Public origin visitors open the site under; absent until the operator
    // sets it (then the `<slug>.senify.xyz` placeholder is baked).
    baseUrl: { type: "string" },
    // The site's own breakpoint pair (ADR-0020): below `tablet` px the tablet
    // layout applies, below `mobile` px the mobile one. Absent: the platform
    // default (1024 / 640). Agents read it; the operator sets it.
    breakpoints: {
      type: "object",
      properties: { tablet: { type: "number" }, mobile: { type: "number" } },
      required: ["tablet", "mobile"],
    },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["id", "name", "slug", "profile"],
  additionalProperties: true,
} as const;

export const PAGE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    siteId: { type: "string" },
    path: { type: "string" },
    title: { type: "string" },
    draft: { type: "object" },
    draftVersion: { type: "number" },
  },
  required: ["id", "siteId", "path", "title", "draftVersion"],
  additionalProperties: true,
} as const;

export const ASSET_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    siteId: { type: "string" },
    filename: { type: "string" },
    mime: { type: "string" },
    byteSize: { type: "number" },
    status: { type: "string" },
  },
  required: ["id", "siteId", "filename"],
  additionalProperties: true,
} as const;

export const REFERENCE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    sourceUrl: { type: "string" },
  },
  required: ["id", "name"],
  additionalProperties: true,
} as const;

// The write results a client has to read the new id from (P3-3, R8). The shapes
// are the engine's own: `create_site` and `create_page` answer with the entity,
// the other three wrap it (`preview`, `review`, `release`) next to the checks
// that ran. `token` on a preview is deliberately not described - the signed
// `url` is what a client uses.
export const PREVIEW_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    siteId: { type: "string" },
    status: { type: "string" },
    expiresAt: { type: "string" },
  },
  required: ["id", "siteId", "status"],
  additionalProperties: true,
} as const;

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    siteId: { type: "string" },
    previewId: { type: "string" },
    status: { type: "string" },
    thread: { type: "array" },
    createdAt: { type: "string" },
  },
  required: ["id", "siteId", "status"],
  additionalProperties: true,
} as const;

export const RELEASE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    siteId: { type: "string" },
    buildRef: { type: "string" },
    note: { type: ["string", "null"] },
    basisReleaseId: { type: ["string", "null"] },
    createdAt: { type: "string" },
  },
  required: ["id", "siteId", "buildRef"],
  additionalProperties: true,
} as const;

// `hard` and `soft` are the violation lists of the publish checks; a review
// submit additionally names the `stage`. Only the lists a client branches on are
// described.
export const CHECKS_SCHEMA = {
  type: "object",
  properties: {
    hard: { type: "array" },
    soft: { type: "array" },
  },
  required: ["hard", "soft"],
  additionalProperties: true,
} as const;

// Publishing and rolling back answer alike: a new release next to the checks
// that ran, the rollback's `basisReleaseId` pointing at the release it restored.
export const RELEASE_RESULT_SCHEMA = {
  type: "object",
  properties: { release: RELEASE_SCHEMA, checks: CHECKS_SCHEMA },
  required: ["release", "checks"],
  additionalProperties: true,
} as const;

// `get_page` returns an outline, not the page itself (see outline.ts). Its
// `sections[].summary` is a human-readable one-liner, deliberately not a
// structured value: a client that needs exact props calls `get_nodes`.
export const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    pageId: { type: "string" },
    path: { type: "string" },
    title: { type: "string" },
    draftVersion: { type: "number" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          variant: { type: "string" },
          hidden: { type: "boolean" },
          summary: { type: "string" },
        },
        required: ["id", "type", "summary"],
        additionalProperties: true,
      },
    },
  },
  required: ["pageId", "path", "title", "draftVersion", "sections"],
  additionalProperties: true,
} as const;
