import { Type, type Static } from "@sinclair/typebox";

const CLOSED = { additionalProperties: false } as const;

// The source of one Framer import (plan S3.1): a URL (the engine fetches the
// SSR-HTML), a local mirror folder (offline mode, plan S2.4) or the raw HTML
// itself. Exactly one channel must carry content.
export const ImportSourceSchema = Type.Object(
  {
    url: Type.Optional(Type.String({ maxLength: 2048 })),
    rootDir: Type.Optional(Type.String({ maxLength: 1024 })),
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
    // Theme: apply the derived font patch with update_theme on write.
    applyTheme: Type.Optional(Type.Boolean()),
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
    steps: Type.Array(Type.String()),
  },
  CLOSED,
);
export type ImportReport = Static<typeof ImportReportSchema>;
