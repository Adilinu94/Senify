import { Type, type Static } from "@sinclair/typebox";
import { AuthorSchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

// Transport contracts of the reference pipeline (T14). The `snapshot` branch is
// the documented fallback (artifacts/28 §1): a blocked site is analysed from an
// uploaded/inline snapshot instead of a live Playwright capture.

export const BreakpointNameSchema = Type.Union([
  Type.Literal("desktop"),
  Type.Literal("tablet"),
  Type.Literal("mobile"),
]);
export type BreakpointName = Static<typeof BreakpointNameSchema>;

export const SampleKindSchema = Type.Union([
  Type.Literal("color"),
  Type.Literal("font"),
  Type.Literal("typeScale"),
  Type.Literal("spacing"),
  Type.Literal("radius"),
  Type.Literal("shadow"),
]);
export type SampleKind = Static<typeof SampleKindSchema>;

// One measured computed style: the runtime value plus where it painted
// (research/29 §2.3). Markup-derived samples come back as `source: "markup"`.
export const ComputedSampleSchema = Type.Object(
  {
    breakpoint: BreakpointNameSchema,
    kind: SampleKindSchema,
    role: Type.Optional(Type.String({ maxLength: 60 })),
    value: Type.String({ minLength: 1, maxLength: 400 }),
    where: Type.String({ minLength: 1, maxLength: 200 }),
    source: Type.Optional(Type.Union([Type.Literal("runtime"), Type.Literal("markup")])),
  },
  CLOSED,
);
export type ComputedSampleInput = Static<typeof ComputedSampleSchema>;

export const CustomPropertySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    value: Type.String({ minLength: 1, maxLength: 400 }),
    role: Type.Optional(Type.String({ maxLength: 40 })),
  },
  CLOSED,
);
export type CustomPropertyInput = Static<typeof CustomPropertySchema>;

export const CapturedMotionSchema = Type.Object(
  {
    libraries: Type.Optional(Type.Array(Type.String({ maxLength: 60 }))),
    transitions: Type.Optional(
      Type.Array(
        Type.Object(
          {
            property: Type.String({ maxLength: 120 }),
            duration: Type.String({ maxLength: 40 }),
            timing: Type.String({ maxLength: 120 }),
            where: Type.String({ maxLength: 200 }),
            uses: Type.Optional(Type.Integer({ minimum: 1 })),
          },
          CLOSED,
        ),
      ),
    ),
    scrollTriggers: Type.Optional(
      Type.Array(
        Type.Object(
          {
            trigger: Type.String({ maxLength: 200 }),
            pin: Type.Optional(Type.Boolean()),
            scrub: Type.Optional(Type.Union([Type.Boolean(), Type.Number()])),
            start: Type.Optional(Type.String({ maxLength: 60 })),
            end: Type.Optional(Type.String({ maxLength: 60 })),
            animationTargets: Type.Optional(Type.Array(Type.String({ maxLength: 200 }))),
          },
          CLOSED,
        ),
      ),
    ),
    animations: Type.Optional(
      Type.Array(
        Type.Object(
          {
            name: Type.String({ maxLength: 120 }),
            duration: Type.String({ maxLength: 40 }),
            timing: Type.String({ maxLength: 120 }),
            where: Type.String({ maxLength: 200 }),
          },
          CLOSED,
        ),
      ),
    ),
    // Reveal inventory with the exact runtime params (motion-probe.js).
    reveals: Type.Optional(
      Type.Array(
        Type.Object(
          {
            name: Type.String({ maxLength: 80 }),
            mechanism: Type.String({ maxLength: 200 }),
            params: Type.Optional(Type.Record(Type.String(), Type.String({ maxLength: 120 }))),
            where: Type.Optional(Type.String({ maxLength: 200 })),
            uses: Type.Optional(Type.Integer({ minimum: 1 })),
          },
          CLOSED,
        ),
      ),
    ),
    smoothScroll: Type.Optional(
      Type.Object(
        {
          library: Type.String({ maxLength: 60 }),
          params: Type.Optional(Type.Record(Type.String(), Type.String({ maxLength: 60 }))),
        },
        CLOSED,
      ),
    ),
  },
  CLOSED,
);
export type CapturedMotionInput = Static<typeof CapturedMotionSchema>;

export const CapturedSurfaceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("canvas"),
      Type.Literal("video"),
      Type.Literal("svg"),
      Type.Literal("iframe"),
      Type.Literal("webgl"),
      Type.Literal("webgpu"),
      Type.Literal("css"),
    ]),
    detail: Type.String({ maxLength: 200 }),
    live: Type.Optional(Type.Boolean()),
    where: Type.Optional(Type.String({ maxLength: 200 })),
  },
  CLOSED,
);
export type CapturedSurfaceInput = Static<typeof CapturedSurfaceSchema>;

export const CapturedAssetSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("image"),
      Type.Literal("logo"),
      Type.Literal("font"),
      Type.Literal("video"),
      Type.Literal("icon"),
    ]),
    ref: Type.String({ maxLength: 400 }),
    where: Type.Optional(Type.String({ maxLength: 200 })),
  },
  CLOSED,
);
export type CapturedAssetInput = Static<typeof CapturedAssetSchema>;

export const ReferenceSnapshotInputSchema = Type.Object(
  {
    breakpoint: Type.String({ maxLength: 40 }),
    width: Type.Integer({ minimum: 1, maximum: 8000 }),
    height: Type.Integer({ minimum: 1, maximum: 200000 }),
    kind: Type.Union([Type.Literal("fullpage"), Type.Literal("section")]),
    storageRef: Type.String({ minLength: 1, maxLength: 400 }),
    hash: Type.String({ minLength: 1, maxLength: 80 }),
  },
  CLOSED,
);
export type ReferenceSnapshotInput = Static<typeof ReferenceSnapshotInputSchema>;

export const ReferenceSnapshotBodySchema = Type.Object(
  {
    html: Type.Optional(Type.String({ maxLength: 4_000_000 })),
    computedSamples: Type.Optional(Type.Array(ComputedSampleSchema, { maxItems: 20000 })),
    customProperties: Type.Optional(Type.Array(CustomPropertySchema, { maxItems: 2000 })),
    breakpoints: Type.Optional(
      Type.Array(Type.Integer({ minimum: 200, maximum: 4000 }), { maxItems: 40 }),
    ),
    motion: Type.Optional(CapturedMotionSchema),
    surfaces: Type.Optional(Type.Array(CapturedSurfaceSchema, { maxItems: 200 })),
    assets: Type.Optional(Type.Array(CapturedAssetSchema, { maxItems: 2000 })),
    screenshots: Type.Optional(Type.Array(ReferenceSnapshotInputSchema, { maxItems: 20 })),
  },
  CLOSED,
);
export type ReferenceSnapshotBody = Static<typeof ReferenceSnapshotBodySchema>;

export const AnalyzeReferenceBodySchema = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 2048 }),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    author: AuthorSchema,
    // false leaves the job queued for the tick route (long captures).
    wait: Type.Optional(Type.Boolean()),
    snapshot: Type.Optional(ReferenceSnapshotBodySchema),
  },
  CLOSED,
);
export type AnalyzeReferenceBody = Static<typeof AnalyzeReferenceBodySchema>;

export const ReferenceTickBodySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
  CLOSED,
);
export type ReferenceTickBody = Static<typeof ReferenceTickBodySchema>;

export const EditReferenceProfileBodySchema = Type.Object(
  {
    author: AuthorSchema,
    note: Type.Optional(Type.String({ maxLength: 500 })),
    // Nachbearbeitung: each edit writes a new profile revision (append-only).
    vocabulary: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { minItems: 1, maxItems: 12 }),
    ),
    families: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { minItems: 1, maxItems: 8 }),
    ),
    rules: Type.Optional(
      Type.Object(
        {
          constants: Type.Optional(Type.Array(Type.String({ maxLength: 200 }))),
          never: Type.Optional(Type.Array(Type.String({ maxLength: 200 }))),
        },
        CLOSED,
      ),
    ),
  },
  CLOSED,
);
export type EditReferenceProfileBody = Static<typeof EditReferenceProfileBodySchema>;

export const ApplyReferenceBodySchema = Type.Object(
  {
    author: AuthorSchema,
    referenceId: Type.String({ minLength: 1 }),
    scales: Type.Optional(
      Type.Array(
        Type.Union([
          Type.Literal("color"),
          Type.Literal("type"),
          Type.Literal("motion"),
          Type.Literal("rest"),
        ]),
        { minItems: 1, maxItems: 4 },
      ),
    ),
  },
  CLOSED,
);
export type ApplyReferenceBody = Static<typeof ApplyReferenceBodySchema>;
