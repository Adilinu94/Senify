import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { SenifyError } from "@senify/core";
import { AuthorSchema } from "./mutations/contract.ts";
import {
  ENTRY_STATUSES,
  MEDIA_KINDS,
  SUPPORTS_FLAGS,
  type CellValue,
  type EntryStatus,
  type FieldType,
  type MediaKind,
} from "./types.ts";

const CLOSED = { additionalProperties: false } as const;

const FieldIdSchema = Type.String({ minLength: 1 });
const OptionSchema = Type.Object(
  {
    value: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
  },
  CLOSED,
);

// Shared field metadata. `description` is mandatory on purpose: a field an
// agent cannot read is a field it cannot fill. `id`/`key` stay optional here
// because the form route (T11) derives them; the collection route requires
// them and says so.
const fieldBase = {
  id: Type.Optional(FieldIdSchema),
  key: Type.Optional(
    Type.String({ pattern: "^[A-Za-z][A-Za-z0-9_-]*$", maxLength: 60 }),
  ),
  label: Type.String({ minLength: 1, maxLength: 120 }),
  description: Type.String({ minLength: 1, maxLength: 400 }),
  required: Type.Optional(Type.Boolean()),
  unique: Type.Optional(Type.Boolean()),
  deprecated: Type.Optional(Type.Boolean()),
  defaultValue: Type.Optional(Type.Unsafe<CellValue>(Type.Any())),
};

function fieldVariant<
  T extends FieldType,
  E extends Record<string, TSchema>,
>(type: T, extra: E) {
  return Type.Object(
    { ...fieldBase, ...extra, type: Type.Literal(type) },
    CLOSED,
  );
}

const TextFieldSchema = fieldVariant("text", {});
const LongTextFieldSchema = fieldVariant("longText", {});
const RichtextFieldSchema = fieldVariant("richtext", {});
const NumberFieldSchema = fieldVariant("number", {});
const BooleanFieldSchema = fieldVariant("boolean", {});
const DateFieldSchema = fieldVariant("date", {});
const DateTimeFieldSchema = fieldVariant("dateTime", {});
const SelectFieldSchema = fieldVariant("select", {
  options: Type.Array(OptionSchema, { minItems: 1, maxItems: 100 }),
});
const MultiSelectFieldSchema = fieldVariant("multiSelect", {
  options: Type.Array(OptionSchema, { minItems: 1, maxItems: 100 }),
});
const UrlFieldSchema = fieldVariant("url", {});
const EmailFieldSchema = fieldVariant("email", {});
const MediaFieldSchema = fieldVariant("media", {
  mediaKind: Type.Optional(
    Type.Union(MEDIA_KINDS.map((kind) => Type.Literal(kind))),
  ),
});
const MediaMultiFieldSchema = fieldVariant("mediaMulti", {
  mediaKind: Type.Optional(
    Type.Union(MEDIA_KINDS.map((kind) => Type.Literal(kind))),
  ),
});
const RelationFieldSchema = fieldVariant("relation", {
  targetCollections: Type.Array(FieldIdSchema, {
    minItems: 1,
    maxItems: 20,
    uniqueItems: true,
  }),
});
const RelationMultiFieldSchema = fieldVariant("relationMulti", {
  targetCollections: Type.Array(FieldIdSchema, {
    minItems: 1,
    maxItems: 20,
    uniqueItems: true,
  }),
});

// Repeaters nest exactly one level: sub fields carry the 15 other types and
// are validated one by one (see content.ts), which keeps error paths precise.
const RepeaterFieldSchema = fieldVariant("repeater", {
  subFields: Type.Array(Type.Any(), { minItems: 1, maxItems: 50 }),
});

// One schema per field type. A union would report every mistake as a generic
// "Expected union value" at the field, so callers validate per type.
export const FIELD_DEF_SCHEMAS = {
  text: TextFieldSchema,
  longText: LongTextFieldSchema,
  richtext: RichtextFieldSchema,
  number: NumberFieldSchema,
  boolean: BooleanFieldSchema,
  date: DateFieldSchema,
  dateTime: DateTimeFieldSchema,
  select: SelectFieldSchema,
  multiSelect: MultiSelectFieldSchema,
  url: UrlFieldSchema,
  email: EmailFieldSchema,
  media: MediaFieldSchema,
  mediaMulti: MediaMultiFieldSchema,
  relation: RelationFieldSchema,
  relationMulti: RelationMultiFieldSchema,
  repeater: RepeaterFieldSchema,
} satisfies Record<FieldType, TSchema>;

// Transport shape of a field: `id`/`key` are optional because the form route
// derives them, everything else is validated against FIELD_DEF_SCHEMAS.
export type FieldDefInput = {
  id?: string;
  key?: string;
  label: string;
  description: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  deprecated?: boolean;
  defaultValue?: CellValue;
  options?: { value: string; label: string }[];
  targetCollections?: string[];
  // Sub fields are re-validated per type, so they stay loosely typed here.
  subFields?: unknown[];
  mediaKind?: MediaKind;
};

// Envelope for `fields` arrays: the route only guarantees the discriminator,
// the content layer validates the rest per type. Same pattern as the mutation
// contract (op first, shape second, precise error paths).
const FieldDefEnvelopeSchema = Type.Object({
  type: Type.String({ minLength: 1 }),
});

const SupportsSchema = Type.Union(
  SUPPORTS_FLAGS.map((flag) => Type.Literal(flag)),
);
const EntryStatusSchema = Type.Union(
  ENTRY_STATUSES.map((status) => Type.Literal(status)),
);

export const CreateCollectionBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
    description: Type.Optional(Type.String({ maxLength: 400 })),
    fields: Type.Array(FieldDefEnvelopeSchema, { minItems: 1, maxItems: 100 }),
    titleField: Type.Optional(FieldIdSchema),
    dateField: Type.Optional(FieldIdSchema),
    urlPattern: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    supports: Type.Optional(
      Type.Array(SupportsSchema, { minItems: 1, uniqueItems: true }),
    ),
    listColumns: Type.Optional(
      Type.Array(FieldIdSchema, { maxItems: 4, uniqueItems: true }),
    ),
  },
  CLOSED,
);
export type CreateCollectionBody = Static<typeof CreateCollectionBodySchema>;

// "Sammlung aus Feld-Specs" (T11-Vorbereitung) takes the same shape: the
// collection route requires ids/keys, the form route derives them.
export const FromFieldsBodySchema = CreateCollectionBodySchema;
export type FromFieldsBody = CreateCollectionBody;

export const UpdateCollectionBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    description: Type.Optional(Type.String({ maxLength: 400 })),
    // Additive: fields are upserted by id, removing one is not a valid request.
    fields: Type.Optional(
      Type.Array(FieldDefEnvelopeSchema, { minItems: 1, maxItems: 100 }),
    ),
    titleField: Type.Optional(FieldIdSchema),
    dateField: Type.Optional(Type.Union([FieldIdSchema, Type.Null()])),
    urlPattern: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 200 }), Type.Null()]),
    ),
    supports: Type.Optional(
      Type.Array(SupportsSchema, { minItems: 1, uniqueItems: true }),
    ),
    listColumns: Type.Optional(
      Type.Array(FieldIdSchema, { maxItems: 4, uniqueItems: true }),
    ),
    deprecated: Type.Optional(Type.Boolean()),
  },
  CLOSED,
);
export type UpdateCollectionBody = Static<typeof UpdateCollectionBodySchema>;

export const CreateEntryBodySchema = Type.Object(
  {
    collectionId: FieldIdSchema,
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    cells: Type.Optional(Type.Record(Type.String(), Type.Any())),
    author: AuthorSchema,
  },
  CLOSED,
);
export type CreateEntryBody = Static<typeof CreateEntryBodySchema>;

export const UpdateEntryBodySchema = Type.Object(
  {
    baseVersion: Type.Integer({ minimum: 1 }),
    cells: Type.Optional(Type.Record(Type.String(), Type.Any())),
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    // "published" is accepted by the shape so it can be refused with a
    // pointer at the publish route instead of a generic schema error.
    status: Type.Optional(EntryStatusSchema),
    scheduledAt: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    author: AuthorSchema,
  },
  CLOSED,
);
export type UpdateEntryBody = Static<typeof UpdateEntryBodySchema>;

export const PublishEntryBodySchema = Type.Object(
  {
    author: AuthorSchema,
    baseVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  CLOSED,
);
export type PublishEntryBody = Static<typeof PublishEntryBodySchema>;

// Live preview (T10): the entry editor overlays its (possibly unsaved) form
// values on the stored row; everything is optional.
export const EntryPreviewBodySchema = Type.Object(
  {
    cells: Type.Optional(Type.Record(Type.String(), Type.Any())),
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  CLOSED,
);
export type EntryPreviewBody = Static<typeof EntryPreviewBodySchema>;

export const EntryActionBodySchema = Type.Object(
  { author: AuthorSchema },
  CLOSED,
);
export type EntryActionBody = Static<typeof EntryActionBodySchema>;

export const EntryTickBodySchema = Type.Object(
  {
    siteId: Type.Optional(FieldIdSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  },
  CLOSED,
);
export type EntryTickBody = Static<typeof EntryTickBodySchema>;

export const SearchEntriesBodySchema = Type.Object(
  {
    q: Type.String({ minLength: 1, maxLength: 200 }),
    collectionId: Type.Optional(FieldIdSchema),
    status: Type.Optional(EntryStatusSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  },
  CLOSED,
);
export type SearchEntriesBody = Static<typeof SearchEntriesBodySchema>;

export const ENTRY_LIST_SORTS = [
  "updatedAt",
  "createdAt",
  "publishedAt",
  "title",
  "dateField",
] as const;
export type EntryListSort = (typeof ENTRY_LIST_SORTS)[number];

export type EntryListFilters = {
  collectionId?: string;
  status?: EntryStatus;
  trashed: boolean;
  query?: string;
  sort: EntryListSort;
  dir: "asc" | "desc";
  limit: number;
};

const ENTRY_STATUS_VALUES: readonly string[] = ENTRY_STATUSES;

export function parseEntryListFilters(params: URLSearchParams): EntryListFilters {
  const collectionId = params.get("collectionId");
  const status = params.get("status");
  if (status !== null && !ENTRY_STATUS_VALUES.includes(status)) {
    throw new SenifyError("validation", `Unknown entry status "${status}"`, {
      field: "status",
      suggestion: `Use one of: ${ENTRY_STATUSES.join(", ")}.`,
    });
  }
  const trashedRaw = params.get("trashed");
  if (trashedRaw !== null && trashedRaw !== "true" && trashedRaw !== "false") {
    throw new SenifyError("validation", `Unknown trashed flag "${trashedRaw}"`, {
      field: "trashed",
      suggestion: 'Use trashed=true to list the trash.',
    });
  }
  const sort = params.get("sort");
  if (sort !== null && !ENTRY_LIST_SORTS.includes(sort as EntryListSort)) {
    throw new SenifyError("validation", `Unknown entry sort "${sort}"`, {
      field: "sort",
      suggestion: `Use one of: ${ENTRY_LIST_SORTS.join(", ")}.`,
    });
  }
  const dir = params.get("dir");
  if (dir !== null && dir !== "asc" && dir !== "desc") {
    throw new SenifyError("validation", `Unknown sort direction "${dir}"`, {
      field: "dir",
      suggestion: 'Use dir=asc or dir=desc.',
    });
  }
  const rawLimit = params.get("limit");
  let limit = 50;
  if (rawLimit !== null) {
    limit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new SenifyError("validation", "limit must be an integer between 1 and 200", {
        field: "limit",
      });
    }
  }
  const query = params.get("q");
  return {
    ...(collectionId === null ? {} : { collectionId }),
    ...(status === null ? {} : { status: status as EntryStatus }),
    trashed: trashedRaw === "true",
    ...(query === null || query.trim() === "" ? {} : { query }),
    sort: (sort as EntryListSort | null) ?? "updatedAt",
    dir: dir === "asc" ? "asc" : "desc",
    limit,
  };
}

// Every write carries the version it was based on; a mismatch is a conflict,
// never a silent overwrite.
export function entryConflictError(
  expected: number,
  current: number,
): SenifyError {
  return new SenifyError(
    "conflict",
    `Entry has changed (expected v${expected}, current v${current})`,
    {
      field: "baseVersion",
      suggestion: "Reload the entry, then retry the write with the new baseVersion.",
    },
  );
}
