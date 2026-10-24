import { Type, type Static } from "@sinclair/typebox";

const CLOSED = { additionalProperties: false } as const;

// The source of one Framer import (plan S3.1): a URL (the engine fetches the
// SSR-HTML), a local mirror folder (offline mode, plan S2.4) or the raw HTML
// itself. Exactly one channel must carry content.
export const ImportSourceSchema = Type.Object(
  {
    url: Type.Optional(Type.String({ maxLength: 2048 })),
    rootDir: Type.Optional(Type.String({ maxLength: 1024 })),
    // Which page of the export folder (`rootDir`) is read: `/about` reads
    // `about/index.html` or `about.html`. Absent = the home page. The path the
    // page lands on in Senify is the request's `pagePath`.
    page: Type.Optional(Type.String({ maxLength: 512 })),
    html: Type.Optional(Type.String()),
    // The base for relative asset URLs; defaults to the URL origin.
    baseUrl: Type.Optional(Type.String({ maxLength: 2048 })),
  },
  CLOSED,
);
export type ImportSourceBody = Static<typeof ImportSourceSchema>;

export const CreateImportBodySchema = Type.Object(
  {
    source: ImportSourceSchema,
    // Optional page path: defaults to "/" or the URL's pathname.
    pagePath: Type.Optional(Type.String({ maxLength: 512 })),
    // Assets: "upload" routes the downloads through the media pipeline
    // (default), "skip" imports structure only (the report names the URLs).
    assets: Type.Optional(Type.Union([Type.Literal("upload"), Type.Literal("skip")])),
    // Fonts (DSGVO, plan S2.3b): "rewrite" fetches the files and rewrites the
    // @font-face sources to local paths (default), "skip" keeps the CDN URLs
    // and reports them.
    fonts: Type.Optional(Type.Union([Type.Literal("rewrite"), Type.Literal("skip")])),
    // Theme: apply the derived theme patch (fonts, brand colour, neutral tint,
    // body text size) with update_theme on write.
    applyTheme: Type.Optional(Type.Boolean()),
    // "dna" (default) rewrites what the design DNA forbids (gradients, shadows,
    // radii, centered headings); "fidelity" keeps the source's look.
    mode: Type.Optional(Type.Union([Type.Literal("dna"), Type.Literal("fidelity")])),
    // The `irHash` the analysis (dry run) reported. A write whose source no
    // longer produces this hash (the live site changed between "Analysieren"
    // and "Übernehmen") is rejected instead of writing something the person
    // never saw.
    expectedIrHash: Type.Optional(Type.String()),
    // Write the imported document as one revision (S3.1). Absent = dry run.
    write: Type.Optional(Type.Boolean()),
    // Target page for `write: true`. Absent = a new page is created under
    // `pagePath`.
    pageId: Type.Optional(Type.String({ minLength: 1 })),
    baseDraftVersion: Type.Optional(Type.Number({ minimum: 1 })),
    idempotencyKey: Type.Optional(Type.String({ minLength: 8, maxLength: 128 })),
  },
  CLOSED,
);
export type CreateImportBody = Static<typeof CreateImportBodySchema>;

// The report answer: same shape for dry run and write, so CLI, MCP and the
// editor dialog cannot drift (plan S3 acceptance).
export const ImportReportSchema = Type.Object(
  {
    jobId: Type.String(),
    dryRun: Type.Boolean(),
    pageId: Type.Union([Type.String(), Type.Null()]),
    newDraftVersion: Type.Union([Type.Number(), Type.Null()]),
    receiptId: Type.Union([Type.String(), Type.Null()]),
    replayed: Type.Boolean(),
    // The idempotency fingerprint of the imported IR (plan S2.5): a second
    // run over an unchanged source produces the same hash.
    irHash: Type.String(),
    // The other pages of the site this page links to (root-relative paths), so
    // a whole site can be imported page by page. Nothing is fetched for them.
    discoveredPages: Type.Optional(Type.Array(Type.String())),
    // Set when the write replaced an existing page: the revision holding the
    // draft it replaced, restorable with `POST /api/pages/:pageId/restore`.
    replacedRevisionId: Type.Optional(Type.String()),
    // The page the path already holds, so "Übernehmen" can say what it would
    // replace and send that draft version back as `baseDraftVersion`.
    existingPage: Type.Optional(
      Type.Object({ pageId: Type.String(), draftVersion: Type.Number(), title: Type.String() }),
    ),
    // The source's own breakpoint pair and what the import did with it
    // (ADR-0020): `set` took it over for the site, `unchanged` the site already
    // breaks there, `kept` the site keeps its own numbers (named in `reason`).
    // Absent: the source gives no pair Senify can carry.
    breakpoints: Type.Optional(
      Type.Object({
        tablet: Type.Number(),
        mobile: Type.Number(),
        outcome: Type.Union([Type.Literal("set"), Type.Literal("unchanged"), Type.Literal("kept")]),
        reason: Type.Union([Type.Literal("site-pair"), Type.Literal("other-pages"), Type.Null()]),
      }),
    ),
    score: Type.Number(),
    counts: Type.Object({
      nodes: Type.Number(),
      mapped: Type.Number(),
      placeholders: Type.Number(),
    }),
    declarations: Type.Object({
      total: Type.Number(),
      carried: Type.Number(),
      dropped: Type.Number(),
    }),
    assets: Type.Object({
      downloaded: Type.Number(),
      deduped: Type.Number(),
      failed: Type.Number(),
      fonts: Type.Number(),
    }),
    motion: Type.Object({
      measured: Type.Number(),
      mappedToPreset: Type.Number(),
      documented: Type.Number(),
    }),
    findings: Type.Array(
      Type.Object({
        kind: Type.String(),
        nodeKey: Type.Union([Type.String(), Type.Null()]),
        message: Type.String(),
        evidence: Type.String(),
        severity: Type.String(),
        suggestion: Type.String(),
      }),
    ),
    marqueeCandidates: Type.Array(
      Type.Object({
        nodeKey: Type.Union([Type.String(), Type.Null()]),
        preset: Type.String(),
        reason: Type.String(),
        params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
    ),
    candidates: Type.Optional(
      Type.Array(
        Type.Object({
          fingerprint: Type.String(),
          label: Type.String(),
          kind: Type.String(),
          occurrences: Type.Array(Type.Object({ nodeId: Type.String(), pagePath: Type.String() })),
          reason: Type.String(),
          similarTo: Type.Optional(Type.Array(Type.Object({ fingerprint: Type.String(), label: Type.String(), similarity: Type.Number() }))),
        }),
      ),
    ),
    resolutions: Type.Optional(
      Type.Array(
        Type.Object({
          nodeKey: Type.String(),
          nodeId: Type.Union([Type.String(), Type.Null()]),
          kind: Type.String(),
          reason: Type.String(),
          evidence: Type.String(),
          payloadId: Type.Optional(Type.String()),
        }),
      ),
    ),
    payloads: Type.Optional(
      Type.Array(
        Type.Object({
          nodeKey: Type.String(),
          name: Type.String(),
          kind: Type.String(),
          bytes: Type.Number(),
          integrity: Type.String(),
          sourcePath: Type.String(),
          license: Type.Object({ id: Type.String(), note: Type.Union([Type.String(), Type.Null()]) }),
          payloadId: Type.Optional(Type.String()),
        }),
      ),
    ),
    // What the editor can actually edit, in percent (step 7 of the 1:1 plan):
    // `editable` is the share the tree carries, `original` the share the
    // imported runtime renders in the release. Both are 0/100 or 100/0 — a
    // page-level payload covers the whole page.
    editableShare: Type.Optional(
      Type.Object({
        editable: Type.Number(),
        original: Type.Number(),
        nodes: Type.Number(),
      }),
    ),
    steps: Type.Array(Type.String()),
  },
  CLOSED,
);
export type ImportReport = Static<typeof ImportReportSchema>;
