import { Type, type Static } from "@sinclair/typebox";
import { SenifyError } from "@senify/core";
import { AuthorSchema } from "./mutations/contract.ts";
import {
  REFERENCE_COLLECTION_KINDS,
  REFERENCE_LIST_SORTS,
  REFERENCE_STATUSES,
  type ReferenceListSort,
  type ReferenceStatus,
} from "./types.ts";

const CLOSED = { additionalProperties: false } as const;

// Limits of the manual upload: an image up to 20 MB, base64 grows by ~4/3, so
// the JSON request may carry a body of up to 32 MB.
export const MANUAL_REFERENCE_MAX_BYTES = 20 * 1024 * 1024;
export const MANUAL_REFERENCE_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

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
    // Screenshot-Upload beim Snapshot-Fallback (blockierte Seite): ein
    // optionaler PNG-Data-URL, der als Datei neben den Metadaten landet.
    dataUrl: Type.Optional(Type.String({ maxLength: 4_000_000 })),
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

// ------------------------------------------- reference library (T14, Taste Vault)

export const ReferenceCollectionExampleSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    url: Type.String({ maxLength: 500 }),
  },
  CLOSED,
);
export type ReferenceCollectionExampleBody = Static<
  typeof ReferenceCollectionExampleSchema
>;

const CollectionKindSchema = Type.Union(
  REFERENCE_COLLECTION_KINDS.map((kind) => Type.Literal(kind)),
);

const VocabularySchema = Type.Array(
  Type.String({ minLength: 1, maxLength: 60 }),
  { maxItems: 24 },
);

export const CreateReferenceCollectionBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.Optional(Type.String({ maxLength: 2000 })),
    deployFor: Type.Optional(Type.String({ maxLength: 400 })),
    vocabulary: Type.Optional(VocabularySchema),
    risk: Type.Optional(Type.String({ maxLength: 500 })),
    accent: Type.Optional(Type.String({ maxLength: 40 })),
    imageStyle: Type.Optional(Type.String({ maxLength: 2000 })),
    recognize: Type.Optional(
      Type.Array(Type.String({ maxLength: 200 }), { maxItems: 20 }),
    ),
    examples: Type.Optional(
      Type.Array(ReferenceCollectionExampleSchema, { maxItems: 20 }),
    ),
    warning: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
    kind: Type.Optional(CollectionKindSchema),
    position: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
  },
  CLOSED,
);
export type CreateReferenceCollectionBody = Static<
  typeof CreateReferenceCollectionBodySchema
>;

// The edit of a collection: kind and external id are set at creation only.
export const UpdateReferenceCollectionBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    description: Type.Optional(Type.String({ maxLength: 2000 })),
    deployFor: Type.Optional(Type.String({ maxLength: 400 })),
    vocabulary: Type.Optional(VocabularySchema),
    risk: Type.Optional(Type.String({ maxLength: 500 })),
    accent: Type.Optional(Type.String({ maxLength: 40 })),
    imageStyle: Type.Optional(Type.String({ maxLength: 2000 })),
    recognize: Type.Optional(
      Type.Array(Type.String({ maxLength: 200 }), { maxItems: 20 }),
    ),
    examples: Type.Optional(
      Type.Array(ReferenceCollectionExampleSchema, { maxItems: 20 }),
    ),
    warning: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
    position: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
  },
  CLOSED,
);
export type UpdateReferenceCollectionBody = Static<
  typeof UpdateReferenceCollectionBodySchema
>;

// Library fields of a reference: name, collection, note, vocabulary, recipe,
// composition and family. null clears a field.
export const UpdateReferenceBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    collectionId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    note: Type.Optional(
      Type.Union([Type.String({ maxLength: 1000 }), Type.Null()]),
    ),
    vocabulary: Type.Optional(VocabularySchema),
    imageRecipe: Type.Optional(
      Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
    ),
    heroUsage: Type.Optional(
      Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
    ),
    family: Type.Optional(
      Type.Union([Type.String({ maxLength: 60 }), Type.Null()]),
    ),
  },
  CLOSED,
);
export type UpdateReferenceBody = Static<typeof UpdateReferenceBodySchema>;

// The manual reference: an uploaded image plus the fields of the library form.
// `image` is base64, with or without the `data:image/...;base64,` prefix.
export const ManualReferenceBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    collectionId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    note: Type.Optional(Type.String({ maxLength: 1000 })),
    vocabulary: Type.Optional(VocabularySchema),
    imageRecipe: Type.Optional(Type.String({ maxLength: 2000 })),
    heroUsage: Type.Optional(Type.String({ maxLength: 2000 })),
    image: Type.String({ minLength: 1, maxLength: MANUAL_REFERENCE_BODY_LIMIT_BYTES }),
    author: AuthorSchema,
  },
  CLOSED,
);
export type ManualReferenceBody = Static<typeof ManualReferenceBodySchema>;

export const ReferenceBriefBodySchema = Type.Object(
  {
    referenceIds: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 12,
    }),
  },
  CLOSED,
);
export type ReferenceBriefBody = Static<typeof ReferenceBriefBodySchema>;

export type ReferenceListFilters = {
  // A collection id, "none" for references without a collection.
  collection?: string;
  family?: string;
  status?: ReferenceStatus;
  query?: string;
  sort: ReferenceListSort;
};

const REFERENCE_STATUS_VALUES: readonly string[] = REFERENCE_STATUSES;

// Query of the reference list: the collection, the search term and the sort.
export function parseReferenceListFilters(
  params: URLSearchParams,
): ReferenceListFilters {
  const collection = params.get("collection");
  const status = params.get("status");
  if (status !== null && !REFERENCE_STATUS_VALUES.includes(status)) {
    throw new SenifyError("validation", `Unknown reference status "${status}"`, {
      field: "status",
      suggestion: `Use one of: ${REFERENCE_STATUSES.join(", ")}.`,
    });
  }
  const sort = params.get("sort");
  if (sort !== null && !REFERENCE_LIST_SORTS.includes(sort as ReferenceListSort)) {
    throw new SenifyError("validation", `Unknown reference sort "${sort}"`, {
      field: "sort",
      suggestion: `Use one of: ${REFERENCE_LIST_SORTS.join(", ")}.`,
    });
  }
  const family = params.get("family");
  const query = params.get("q");
  return {
    ...(collection === null || collection === "" ? {} : { collection }),
    ...(family === null ? {} : { family }),
    ...(status === null ? {} : { status: status as ReferenceStatus }),
    ...(query === null || query.trim() === "" ? {} : { query: query.trim() }),
    sort: (sort as ReferenceListSort | null) ?? "newest",
  };
}

// Footer line of the list ("n references in view"), word for word like the
// reference library.
export function referenceFooterText(input: {
  count: number;
  query?: string;
}): string {
  return `${input.count} references${
    input.query === undefined ? " in view" : ` matching “${input.query}”`
  }`;
}

