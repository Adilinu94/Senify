import { Value } from "@sinclair/typebox/value";
import { Type, type TSchema } from "@sinclair/typebox";
import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import {
  FIELD_DEF_SCHEMAS,
  entryConflictError,
  type CreateCollectionBody,
  type CreateEntryBody,
  type EntryListFilters,
  type EntryListSort,
  type FieldDefInput,
  type UpdateCollectionBody,
  type UpdateEntryBody,
} from "./content-contract.ts";
import { newEntityId } from "./ids.ts";
import { slugify, type NewAuditEntry, type Store } from "./store.ts";
import {
  ENTRY_VERSION_RETENTION,
  FIELD_TYPES,
  SUPPORTS_FLAGS,
  type CellValue,
  type Collection,
  type Entry,
  type EntryRedirect,
  type EntrySearchHit,
  type EntryStatus,
  type EntryVersion,
  type FieldDef,
  type FieldType,
  type RepeaterCell,
  type SupportsFlag,
} from "./types.ts";

const CLOSED = { additionalProperties: false } as const;

// Schedule ticks and restores run without a human in front of them; the audit
// log still names an author.
const SCHEDULER_AUTHOR: Author = {
  kind: "agent",
  id: "senify-scheduler",
  label: "Scheduler",
};

// Ranking of the three searchable parts (title A / slug B / body C). The
// number is the rank, not the Postgres weight — the order is what matters.
const SEARCH_WEIGHTS = { title: 3, slug: 2, body: 1 } as const;
const MAX_SEARCH_TOKENS = 8;

const FOCAL_SCHEMA = Type.Object(
  { x: Type.Number(), y: Type.Number() },
  CLOSED,
);
const MEDIA_REF_SCHEMA = Type.Object(
  {
    assetId: Type.String({ minLength: 1 }),
    focal: Type.Optional(Type.Union([FOCAL_SCHEMA, Type.Null()])),
  },
  CLOSED,
);
const REPEATER_ITEM_SCHEMA = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    cells: Type.Record(Type.String(), Type.Any()),
  },
  CLOSED,
);

// Cell shapes per field type (artifacts/22 §"Feldsystem v1"). Null never
// reaches storage: "clear a field" removes the key.
const CELL_SCHEMAS: Record<FieldType, TSchema> = {
  text: Type.String(),
  longText: Type.String(),
  // Markdown is canonical: the boundary stays a plain string.
  richtext: Type.String(),
  number: Type.Number(),
  boolean: Type.Boolean(),
  date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  dateTime: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}" }),
  select: Type.String({ minLength: 1 }),
  multiSelect: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  url: Type.String({ minLength: 1 }),
  email: Type.String({ pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" }),
  media: MEDIA_REF_SCHEMA,
  mediaMulti: Type.Array(MEDIA_REF_SCHEMA),
  relation: Type.String({ minLength: 1 }),
  relationMulti: Type.Array(Type.String({ minLength: 1 }), {
    uniqueItems: true,
  }),
  repeater: Type.Array(REPEATER_ITEM_SCHEMA),
};

const BUILTIN_TITLE_FIELD: FieldDef = {
  id: "title",
  key: "title",
  label: "Titel",
  type: "text",
  required: true,
  description:
    "Titel des Eintrags: Listen-Anzeige, Slug-Vorschlag und stärkstes Suchgewicht (A).",
};

// ---------------------------------------------------------------- rebake stub

export type RebakeTrigger = {
  siteId: string;
  reason: string;
  queued: true;
  at: string;
};

const rebakeCounts = new Map<string, number>();

// Trigger stub for ticket 23: T09 owns the trigger, not the job. It records
// and counts the request so tests and diagnostics can observe it.
export function triggerRebake(siteId: string, reason: string): RebakeTrigger {
  rebakeCounts.set(siteId, (rebakeCounts.get(siteId) ?? 0) + 1);
  const trigger: RebakeTrigger = {
    siteId,
    reason,
    queued: true,
    at: new Date().toISOString(),
  };
  console.log(`[engine] rebake requested (site ${siteId}): ${reason}`);
  return trigger;
}

export function rebakeCount(siteId: string): number {
  return rebakeCounts.get(siteId) ?? 0;
}

// ------------------------------------------------------------------- helpers

function entrySlugValue(value: string): string {
  const slug = slugify(value);
  // slugify falls back to "page" (it was written for pages).
  return slug === "page" ? "entry" : slug;
}

function entryPath(collection: Collection, slug: string): string {
  const pattern = collection.urlPattern ?? `/${collection.slug}/{slug}`;
  return pattern.replace("{slug}", slug);
}

function patternParts(
  collection: Collection,
): { prefix: string; suffix: string } {
  const pattern = collection.urlPattern ?? `/${collection.slug}/{slug}`;
  const index = pattern.indexOf("{slug}");
  if (index < 0) return { prefix: pattern, suffix: "" };
  return {
    prefix: pattern.slice(0, index),
    suffix: pattern.slice(index + "{slug}".length),
  };
}

function slugFromPath(collection: Collection, path: string): string | undefined {
  const { prefix, suffix } = patternParts(collection);
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const slug = path.slice(prefix.length, path.length - suffix.length);
  if (slug === "" || slug.includes("/")) return undefined;
  return slug;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function cellText(value: CellValue | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ");
  }
  return "";
}

function cellEquals(a: CellValue | undefined, b: CellValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function contentAudit(input: {
  siteId: string;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  versionAfter: number;
}): NewAuditEntry {
  return {
    siteId: input.siteId,
    // Entries are not page-scoped; the nullable page_id keeps the audit log
    // one table (site-level filters still work).
    pageId: null,
    batchId: newEntityId(),
    opIndex: 0,
    mutation: input.mutation,
    params: input.params,
    author: input.author,
    undoPatch: [],
    draftVersionAfter: input.versionAfter,
  };
}

// Query tokens narrow the SQL haystack; the ranking happens on the rows.
function searchTokens(query: string): string[] {
  const tokens: string[] = [];
  for (const raw of query.toLowerCase().split(/\s+/)) {
    // % and _ would turn into wildcards; dropping them keeps the LIKE narrow
    // honest instead of surprising.
    const token = raw.replace(/[%_]/g, "");
    if (token !== "" && !tokens.includes(token)) tokens.push(token);
    if (tokens.length >= MAX_SEARCH_TOKENS) break;
  }
  return tokens;
}

function buildSearchText(
  collection: Collection,
  input: { cells: Record<string, CellValue>; slug: string },
): string {
  const parts: string[] = [];
  const title = cellText(input.cells[collection.titleField]);
  if (title !== "") parts.push(title);
  parts.push(input.slug);
  for (const field of collection.fields) {
    if (field.id === collection.titleField) continue;
    const text = cellText(input.cells[field.id]);
    if (text !== "") parts.push(text);
  }
  return normalizeSearchText(parts.join(" \n "));
}

function scoreEntry(
  collection: Collection,
  entry: Entry,
  tokens: readonly string[],
): number {
  const title = normalizeSearchText(cellText(entry.cells[collection.titleField]));
  const slug = entry.slug.toLowerCase();
  const bodyField = collection.fields.find(
    (field) => field.type === "richtext" && field.deprecated !== true,
  );
  const body =
    bodyField === undefined
      ? ""
      : normalizeSearchText(cellText(entry.cells[bodyField.id]));
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += SEARCH_WEIGHTS.title;
    if (slug.includes(token)) score += SEARCH_WEIGHTS.slug;
    if (body !== "" && body.includes(token)) score += SEARCH_WEIGHTS.body;
  }
  return score;
}

function entryDateValue(collection: Collection, entry: Entry): string {
  if (collection.dateField !== null) {
    const value = entry.cells[collection.dateField];
    if (typeof value === "string" && value !== "") return value;
  }
  return entry.publishedAt ?? entry.updatedAt;
}

function compareEntries(
  collectionOf: (entry: Entry) => Collection | undefined,
  sort: EntryListSort,
  dir: "asc" | "desc",
): (a: Entry, b: Entry) => number {
  return (a, b) => {
    const collection = collectionOf(a);
    let left: string;
    let right: string;
    if (sort === "title") {
      left = collection === undefined ? "" : cellText(a.cells[collection.titleField]);
      right = collection === undefined ? "" : cellText(b.cells[collection.titleField]);
    } else if (sort === "dateField") {
      const other = collectionOf(b);
      left = collection === undefined ? "" : entryDateValue(collection, a);
      right = other === undefined ? "" : entryDateValue(other, b);
    } else if (sort === "createdAt") {
      left = a.createdAt;
      right = b.createdAt;
    } else if (sort === "publishedAt") {
      left = a.publishedAt ?? "";
      right = b.publishedAt ?? "";
    } else {
      left = a.updatedAt;
      right = b.updatedAt;
    }
    const order = left.localeCompare(right) || a.id.localeCompare(b.id);
    return dir === "asc" ? order : -order;
  };
}

// ------------------------------------------------------ field normalization

function fail(
  message: string,
  field: string,
  suggestion?: string,
): never {
  throw new SenifyError("validation", message, {
    field,
    ...(suggestion === undefined ? {} : { suggestion }),
  });
}

function fieldPath(index: number, suffix?: string): string {
  return `fields[${index}]${suffix ?? ""}`;
}

// TypeBox paths ("/options/0/value") become dotted cell paths.
function formatErrorPath(path: string): string {
  const parts = path.split("/").filter((part) => part.length > 0);
  let out = "";
  for (const part of parts) {
    out += /^\d+$/.test(part) ? `[${part}]` : `.${part}`;
  }
  return out;
}

// Validates one transport field spec against the schema of its own type: a
// union would collapse every mistake into "Expected union value".
function validateFieldSpec(
  raw: unknown,
  options: { path: string; allowRepeater: boolean },
): FieldDefInput {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail(
      "Field definition must be an object",
      options.path,
      "Pass label, type and description per field.",
    );
  }
  const spec = raw as Record<string, unknown>;
  const type = spec.type;
  if (
    typeof type !== "string" ||
    !(FIELD_TYPES as readonly string[]).includes(type)
  ) {
    fail(
      typeof type === "string"
        ? `Unknown field type "${type}"`
        : "Field type is required",
      `${options.path}.type`,
      `Use one of: ${FIELD_TYPES.join(", ")}.`,
    );
  }
  if (type === "repeater" && !options.allowRepeater) {
    fail(
      "Repeaters nest exactly one level",
      `${options.path}.type`,
      "Use plain sub fields (no repeater inside a repeater).",
    );
  }
  const schema = FIELD_DEF_SCHEMAS[type as FieldType];
  const first = [...Value.Errors(schema, spec)][0];
  if (first !== undefined) {
    fail(
      `Invalid field definition: ${first.message}`,
      `${options.path}${formatErrorPath(first.path)}`,
      `Check the value against the "${type}" field shape.`,
    );
  }
  return spec as unknown as FieldDefInput;
}

function assertUniqueFieldIdentity(
  fields: readonly FieldDef[],
  key: "id" | "key",
): void {
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    const value = key === "id" ? field.id : field.key;
    if (seen.has(value)) {
      fail(
        `Field ${key} "${value}" is used twice in this collection`,
        fieldPath(index, `.${key}`),
        `Every field needs a unique ${key}.`,
      );
    }
    seen.add(value);
  });
}

function assertFieldShape(
  field: FieldDef,
  path: string,
  knownCollectionIds: Set<string>,
): void {
  if (field.type === "select" || field.type === "multiSelect") {
    const values = new Set<string>();
    for (const [optionIndex, option] of (field.options ?? []).entries()) {
      if (values.has(option.value)) {
        fail(
          `Option value "${option.value}" is used twice`,
          `${path}.options[${optionIndex}].value`,
          "Option values must be unique inside a field.",
        );
      }
      values.add(option.value);
    }
  }
  if (field.type === "relation" || field.type === "relationMulti") {
    (field.targetCollections ?? []).forEach((target, targetIndex) => {
      if (!knownCollectionIds.has(target)) {
        fail(
          `Relation target "${target}" does not exist on this site`,
          `${path}.targetCollections[${targetIndex}]`,
          `Use the id of an existing collection: ${[...knownCollectionIds].join(", ")}.`,
        );
      }
    });
  }
  if (field.type === "repeater") {
    const subFields = field.subFields ?? [];
    assertUniqueFieldIdentity(subFields, "id");
    assertUniqueFieldIdentity(subFields, "key");
    subFields.forEach((subField, subIndex) => {
      assertFieldShape(
        subField,
        `${path}.subFields[${subIndex}]`,
        knownCollectionIds,
      );
    });
  }
}

// Turns transport field specs into stored field definitions. The collection
// route requires id + key; the form route (T11) may omit both. Sub fields are
// normalised the same way: repeater cells address them by id.
function resolveFields(
  specs: readonly unknown[],
  options: {
    requireIdentity: boolean;
    existing?: readonly FieldDef[];
    path?: string;
  },
): FieldDef[] {
  const existing = options.existing ?? [];
  const resolved: FieldDef[] = [];
  specs.forEach((raw, index) => {
    const path =
      options.path === undefined
        ? fieldPath(index)
        : `${options.path}[${index}]`;
    const spec = validateFieldSpec(raw, {
      path,
      allowRepeater: options.path === undefined,
    });
    const stored =
      spec.id === undefined
        ? undefined
        : existing.find((field) => field.id === spec.id);
    if (options.requireIdentity && spec.id === undefined) {
      fail(
        "Field id is required",
        `${path}.id`,
        "Pass id and key, or use POST /api/sites/:siteId/collections/from-fields.",
      );
    }
    const id = spec.id ?? newEntityId();
    if (stored !== undefined && stored.type !== spec.type) {
      fail(
        `Field "${id}" is stored as ${stored.type} and cannot become ${spec.type}`,
        `${path}.type`,
        "Types are immutable: deprecate the field and add a new one instead.",
      );
    }
    const key =
      spec.key ?? stored?.key ?? resolveGeneratedKey(spec, existing, resolved);
    if (spec.type === "repeater") {
      resolved.push(
        toFieldDef(
          spec,
          id,
          key,
          resolveFields(spec.subFields ?? [], {
            requireIdentity: false,
            path: `${path}.subFields`,
          }),
        ),
      );
      return;
    }
    resolved.push(toFieldDef(spec, id, key));
  });
  return resolved;
}

// The transport type stays loosely typed (sub fields are re-validated per
// type); this is the one place where a validated spec becomes stored shape.
function toFieldDef(
  spec: FieldDefInput,
  id: string,
  key: string,
  subFields?: FieldDef[],
): FieldDef {
  return {
    id,
    key,
    label: spec.label,
    description: spec.description,
    type: spec.type,
    ...(spec.required === undefined ? {} : { required: spec.required }),
    ...(spec.unique === undefined ? {} : { unique: spec.unique }),
    ...(spec.deprecated === undefined ? {} : { deprecated: spec.deprecated }),
    ...(spec.defaultValue === undefined
      ? {}
      : { defaultValue: spec.defaultValue }),
    ...(spec.options === undefined ? {} : { options: spec.options }),
    ...(spec.targetCollections === undefined
      ? {}
      : { targetCollections: spec.targetCollections }),
    ...(spec.mediaKind === undefined ? {} : { mediaKind: spec.mediaKind }),
    ...(subFields === undefined ? {} : { subFields }),
  };
}

function resolveGeneratedKey(
  spec: FieldDefInput,
  existing: readonly FieldDef[],
  resolved: readonly FieldDef[],
): string {
  const base = slugify(spec.label) || "field";
  const taken = new Set(
    [...existing, ...resolved].map((field) => field.key),
  );
  if (!taken.has(base)) return base;
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new SenifyError("validation", "Could not derive a unique field key", {
    field: "fields",
    suggestion: "Pass an explicit key per field.",
  });
}

function mergeFields(
  current: readonly FieldDef[],
  specs: readonly unknown[],
  options: { requireIdentity: boolean },
): FieldDef[] {
  const resolved = resolveFields(specs, {
    ...options,
    existing: current,
  });
  const merged = [...current];
  resolved.forEach((field) => {
    const index = merged.findIndex((candidate) => candidate.id === field.id);
    if (index >= 0) merged[index] = field;
    else merged.push(field);
  });
  return merged;
}

function assertFieldSet(
  fields: readonly FieldDef[],
  knownCollectionIds: Set<string>,
): void {
  assertUniqueFieldIdentity(fields, "id");
  assertUniqueFieldIdentity(fields, "key");
  fields.forEach((field, index) =>
    assertFieldShape(field, fieldPath(index), knownCollectionIds),
  );
}

function assertFieldReference(
  fields: readonly FieldDef[],
  id: string,
  field: string,
  label: string,
): void {
  if (!fields.some((candidate) => candidate.id === id)) {
    fail(
      `${label} "${id}" is not a field of this collection`,
      field,
      `Use one of: ${fields.map((candidate) => candidate.id).join(", ")}.`,
    );
  }
}

async function knownCollectionIds(
  store: Store,
  siteId: string,
  extra?: Collection,
): Promise<Set<string>> {
  const collections = await store.listCollections(siteId, {
    includeDeprecated: true,
  });
  const ids = new Set(collections.map((collection) => collection.id));
  if (extra !== undefined) ids.add(extra.id);
  return ids;
}

function resolveSupports(
  requested: readonly SupportsFlag[] | undefined,
): SupportsFlag[] {
  return requested === undefined ? [...SUPPORTS_FLAGS] : [...requested];
}

// ------------------------------------------------------------ cell validation

function assertCellType(field: FieldDef, value: unknown, path: string): void {
  const schema = CELL_SCHEMAS[field.type];
  const errors = [...Value.Errors(schema, value)];
  const first = errors[0];
  if (first === undefined) return;
  throw new SenifyError(
    "validation",
    `Invalid value for field "${field.label}" (${field.type}): ${first.message}`,
    {
      field: path,
      suggestion: `Field "${field.key}" expects the ${field.type} cell shape.`,
    },
  );
}

function assertUrlValue(value: string, path: string, field: FieldDef): void {
  if (value.startsWith("/")) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return;
  } catch {
    // falls through to the error below
  }
  throw new SenifyError("validation", `"${value}" is not a valid URL`, {
    field: path,
    suggestion: `Field "${field.key}" expects an absolute http(s) URL or a site-relative path.`,
  });
}

async function assertRelationTargets(
  store: Store,
  field: FieldDef,
  ids: readonly string[],
  path: string,
): Promise<void> {
  const allowed = new Set(field.targetCollections ?? []);
  for (const [index, id] of ids.entries()) {
    let target: Entry;
    try {
      target = await store.getEntry(id);
    } catch {
      throw new SenifyError(
        "validation",
        `Relation target "${id}" does not exist`,
        {
          field: ids.length === 1 ? path : `${path}[${index}]`,
          suggestion: "Create the target entry first or fix the id.",
        },
      );
    }
    if (!allowed.has(target.collectionId)) {
      throw new SenifyError(
        "validation",
        `Relation target "${id}" is not part of the allowed collections`,
        {
          field: ids.length === 1 ? path : `${path}[${index}]`,
          suggestion: `Allowed collections: ${[...allowed].join(", ")}.`,
        },
      );
    }
  }
}

async function validateCellsAgainst(
  store: Store,
  fields: readonly FieldDef[],
  values: Record<string, unknown>,
  options: { requireAll: boolean; path: string },
): Promise<void> {
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const key of Object.keys(values)) {
    if (!byId.has(key)) {
      fail(
        `Unknown field "${key}" in cells`,
        `${options.path}.${key}`,
        `Use the field ids of this collection: ${fields.map((field) => field.id).join(", ")}.`,
      );
    }
  }
  for (const field of fields) {
    const value = values[field.id];
    if (value === undefined || value === null) {
      if (
        options.requireAll &&
        field.required === true &&
        field.deprecated !== true
      ) {
        throw new SenifyError(
          "validation",
          `Field "${field.label}" is required for publishing`,
          {
            field: `${options.path}.${field.id}`,
            suggestion: `Set a value for "${field.key}" before publishing.`,
          },
        );
      }
      continue;
    }
    const path = `${options.path}.${field.id}`;
    assertCellType(field, value, path);
    if (field.type === "select") {
      const allowed = (field.options ?? []).map((option) => option.value);
      if (!allowed.includes(String(value))) {
        fail(
          `"${String(value)}" is not an option of "${field.key}"`,
          path,
          `Use one of: ${allowed.join(", ")}.`,
        );
      }
    } else if (field.type === "multiSelect") {
      const allowed = (field.options ?? []).map((option) => option.value);
      for (const entry of value as string[]) {
        if (!allowed.includes(entry)) {
          fail(
            `"${entry}" is not an option of "${field.key}"`,
            path,
            `Use one of: ${allowed.join(", ")}.`,
          );
        }
      }
    } else if (field.type === "url") {
      assertUrlValue(String(value), path, field);
    } else if (field.type === "relation") {
      await assertRelationTargets(store, field, [String(value)], path);
    } else if (field.type === "relationMulti") {
      await assertRelationTargets(store, field, value as string[], path);
    } else if (field.type === "repeater") {
      const items = value as RepeaterCell[];
      const ids = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (ids.has(item.id)) {
          fail(
            `Repeater item id "${item.id}" is used twice`,
            `${path}[${index}].id`,
            "Repeater items need stable, unique ids.",
          );
        }
        ids.add(item.id);
        await validateCellsAgainst(store, field.subFields ?? [], item.cells, {
          requireAll: false,
          path: `${path}[${index}].cells`,
        });
      }
    }
  }
}

async function validateCells(
  store: Store,
  collection: Collection,
  cells: Record<string, CellValue>,
  options: { requireAll: boolean },
): Promise<void> {
  await validateCellsAgainst(store, collection.fields, cells, {
    requireAll: options.requireAll,
    path: "cells",
  });
}

// "clear this field" for a partial write: the key goes away instead of
// storing null, so stored cells only ever carry set values.
function applyCellPatch(
  current: Record<string, CellValue>,
  patch: Record<string, unknown>,
): Record<string, CellValue> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value as CellValue;
  }
  return next;
}

async function assertUniqueFields(
  store: Store,
  collection: Collection,
  entry: Entry,
): Promise<void> {
  const unique = collection.fields.filter(
    (field) => field.unique === true && field.deprecated !== true,
  );
  if (unique.length === 0) return;
  const siblings = await store.listEntries({
    siteId: entry.siteId,
    collectionId: collection.id,
    limit: 500,
  });
  for (const field of unique) {
    const value = entry.cells[field.id];
    if (value === undefined) continue;
    const clash = siblings.find(
      (candidate) =>
        candidate.id !== entry.id &&
        candidate.deletedAt === null &&
        cellEquals(candidate.cells[field.id], value),
    );
    if (clash !== undefined) {
      throw new SenifyError(
        "conflict",
        `Value of unique field "${field.label}" is already used by entry "${clash.slug}"`,
        {
          field: `cells.${field.id}`,
          suggestion: `Pick a different value for "${field.key}".`,
        },
      );
    }
  }
}

async function assertSlugFree(
  store: Store,
  collection: Collection,
  slug: string,
  exceptId?: string,
): Promise<void> {
  const existing = await store.findLiveEntryBySlug(collection.id, slug, exceptId);
  if (existing === undefined) return;
  throw new SenifyError(
    "conflict",
    `Entry slug "${slug}" is already in use in collection "${collection.name}"`,
    {
      field: "slug",
      suggestion: "Choose a different slug or edit the existing entry.",
    },
  );
}

function normalizeCellInput(
  cells: Record<string, unknown>,
): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const [key, value] of Object.entries(cells)) {
    // null is the "clear this field" marker: the key disappears.
    if (value === undefined || value === null) continue;
    out[key] = value as CellValue;
  }
  return out;
}

async function collectionFor(
  store: Store,
  siteId: string,
  collectionId: string,
): Promise<Collection> {
  const collection = await store.getCollection(collectionId);
  if (collection.siteId !== siteId) {
    fail(
      `Collection "${collectionId}" belongs to another site`,
      "collectionId",
      "Use a collection of this site.",
    );
  }
  return collection;
}

// ------------------------------------------------------------- collections

export async function createCollection(
  store: Store,
  input: {
    siteId: string;
    body: CreateCollectionBody;
    // The form route (T11) derives ids and keys instead of demanding them.
    autoIdentity?: boolean;
  },
): Promise<Collection> {
  await store.getSite(input.siteId);
  const known = await knownCollectionIds(store, input.siteId);
  const requireIdentity = input.autoIdentity !== true;
  const resolved = resolveFields(input.body.fields, { requireIdentity });
  // Validate against the request indexes first: the error path has to match
  // fields[i] of the request (the builtin title field is prepended after).
  assertFieldSet(resolved, known);
  const fields = withBuiltinTitle(resolved);
  assertFieldSet(fields, known);
  const titleField = resolveTitleField(input.body.titleField, fields);
  const dateField = resolveDateField(input.body.dateField, fields);
  const listColumns = resolveListColumns(input.body.listColumns, fields);
  const urlPattern = resolveUrlPattern(input.body.urlPattern);
  const slug = input.body.slug === undefined ? slugify(input.body.name) : slugify(input.body.slug);
  const collection = await store.createCollection({
    id: newEntityId(),
    siteId: input.siteId,
    name: input.body.name.trim(),
    slug: slug === "page" ? "collection" : slug,
    fields,
    titleField,
    dateField,
    urlPattern,
    supports: resolveSupports(input.body.supports),
    listColumns,
    description: input.body.description?.trim() ?? null,
    deprecatedAt: null,
  });
  return collection;
}

export async function createCollectionFromFields(
  store: Store,
  input: { siteId: string; body: CreateCollectionBody },
): Promise<Collection> {
  return createCollection(store, {
    siteId: input.siteId,
    body: input.body,
    autoIdentity: true,
  });
}

function withBuiltinTitle(fields: FieldDef[]): FieldDef[] {
  if (fields.some((field) => field.id === BUILTIN_TITLE_FIELD.id)) return fields;
  return [BUILTIN_TITLE_FIELD, ...fields];
}

function resolveTitleField(
  requested: string | undefined,
  fields: readonly FieldDef[],
): string {
  if (requested === undefined) {
    if (fields.some((field) => field.id === BUILTIN_TITLE_FIELD.id)) {
      return BUILTIN_TITLE_FIELD.id;
    }
    return fields[0]?.id ?? BUILTIN_TITLE_FIELD.id;
  }
  assertFieldReference(fields, requested, "titleField", "titleField");
  return requested;
}

function resolveDateField(
  requested: string | undefined | null,
  fields: readonly FieldDef[],
): string | null {
  if (requested === undefined || requested === null) return null;
  assertFieldReference(fields, requested, "dateField", "dateField");
  const field = fields.find((candidate) => candidate.id === requested);
  if (field === undefined || (field.type !== "date" && field.type !== "dateTime")) {
    fail(
      "dateField must reference a date or dateTime field",
      "dateField",
      "Use a field of type date or dateTime for sorting.",
    );
  }
  return requested;
}

function resolveListColumns(
  requested: readonly string[] | undefined,
  fields: readonly FieldDef[],
): string[] {
  if (requested === undefined) return [];
  requested.forEach((id, index) =>
    assertFieldReference(fields, id, `listColumns[${index}]`, "listColumns"),
  );
  return [...requested];
}

function resolveUrlPattern(requested: string | undefined | null): string | null {
  if (requested === undefined || requested === null) return null;
  if (!requested.includes("{slug}")) {
    fail(
      'urlPattern must contain the "{slug}" placeholder',
      "urlPattern",
      'Example: "/blog/{slug}".',
    );
  }
  return requested;
}

export async function updateCollection(
  store: Store,
  input: { collectionId: string; body: UpdateCollectionBody },
): Promise<Collection> {
  const current = await store.getCollection(input.collectionId);
  const { body } = input;
  const known = await knownCollectionIds(store, current.siteId, current);
  const fields = withBuiltinTitle(
    body.fields === undefined
      ? [...current.fields]
      : mergeFields(current.fields, body.fields, { requireIdentity: false }),
  );
  assertFieldSet(fields, known);
  const titleField =
    body.titleField === undefined
      ? (fields.some((field) => field.id === current.titleField)
          ? current.titleField
          : resolveTitleField(undefined, fields))
      : resolveTitleField(body.titleField, fields);
  const dateField =
    body.dateField === undefined
      ? resolveDateField(current.dateField, fields)
      : resolveDateField(body.dateField, fields);
  const urlPattern =
    body.urlPattern === undefined
      ? resolveUrlPattern(current.urlPattern)
      : resolveUrlPattern(body.urlPattern);
  const now = new Date().toISOString();
  let deprecatedAt = current.deprecatedAt;
  if (body.deprecated === true) deprecatedAt = current.deprecatedAt ?? now;
  if (body.deprecated === false) deprecatedAt = null;
  return store.updateCollection(current.id, {
    name: body.name?.trim() ?? current.name,
    fields,
    titleField,
    dateField,
    urlPattern,
    supports:
      body.supports === undefined
        ? [...current.supports]
        : [...body.supports],
    listColumns:
      body.listColumns === undefined
        ? [...current.listColumns]
        : [...body.listColumns],
    description:
      body.description === undefined
        ? current.description
        : (body.description.trim() === "" ? null : body.description.trim()),
    deprecatedAt,
  });
}

// ------------------------------------------------------------------ entries

export async function createEntry(
  store: Store,
  input: { siteId: string; body: CreateEntryBody },
): Promise<Entry> {
  const collection = await collectionFor(
    store,
    input.siteId,
    input.body.collectionId,
  );
  if (collection.deprecatedAt !== null) {
    fail(
      `Collection "${collection.name}" is deprecated`,
      "collectionId",
      "Create the entry in an active collection.",
    );
  }
  const cells = normalizeCellInput(input.body.cells ?? {});
  await validateCells(store, collection, cells, { requireAll: false });
  const slug =
    input.body.slug === undefined || input.body.slug.trim() === ""
      ? deriveSlug(collection, cells)
      : entrySlugValue(input.body.slug);
  await assertSlugFree(store, collection, slug);
  const entry = await store.createEntry({
    id: newEntityId(),
    siteId: input.siteId,
    collectionId: collection.id,
    slug,
    status: "draft",
    cells,
    author: input.body.author,
    searchText: buildSearchText(collection, { cells, slug }),
    publishedAt: null,
    scheduledAt: null,
  });
  await store.appendAudit([
    contentAudit({
      siteId: input.siteId,
      mutation: "create_entry",
      params: { entryId: entry.id, collectionId: collection.id, slug },
      author: input.body.author,
      versionAfter: entry.version,
    }),
  ]);
  return entry;
}

function deriveSlug(
  collection: Collection,
  cells: Record<string, CellValue>,
): string {
  const title = cellText(cells[collection.titleField]).trim();
  if (title === "") {
    throw new SenifyError("validation", "Entry needs a slug or a title", {
      field: "slug",
      suggestion: `Set the title field "${collection.titleField}" or pass an explicit slug.`,
    });
  }
  return entrySlugValue(title);
}

export async function updateEntry(
  store: Store,
  input: { entryId: string; body: UpdateEntryBody },
): Promise<Entry> {
  const entry = await store.getEntry(input.entryId);
  if (entry.deletedAt !== null) {
    throw new SenifyError("conflict", "Entry is in the trash", {
      field: "entryId",
      suggestion: "Restore the entry first (restore_entry).",
    });
  }
  if (input.body.baseVersion !== entry.version) {
    throw entryConflictError(input.body.baseVersion, entry.version);
  }
  const collection = await store.getCollection(entry.collectionId);
  const cells =
    input.body.cells === undefined
      ? entry.cells
      : applyCellPatch(entry.cells, input.body.cells);
  await validateCells(store, collection, cells, { requireAll: false });
  const slug =
    input.body.slug === undefined
      ? entry.slug
      : entrySlugValue(input.body.slug);
  if (slug !== entry.slug) {
    await assertSlugFree(store, collection, slug, entry.id);
  }
  if (input.body.status === "published") {
    fail(
      "Publishing is not an update",
      "status",
      `Use POST /api/entries/${entry.id}/publish (it writes the version, the redirect and the re-bake).`,
    );
  }
  const { status, scheduledAt } = resolveStatusTransition({
    body: input.body,
    entry,
    collection,
  });
  const updatedAt = new Date().toISOString();
  const version = await store.updateEntryRow({
    entryId: entry.id,
    expectedVersion: input.body.baseVersion,
    changes: {
      slug,
      status,
      cells,
      activeVersionId: entry.activeVersionId,
      author: input.body.author,
      searchText: buildSearchText(collection, { cells, slug }),
      publishedAt: entry.publishedAt,
      scheduledAt,
      updatedAt,
    },
  });
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "update_entry",
      params: { entryId: entry.id, status, version },
      author: input.body.author,
      versionAfter: version,
    }),
  ]);
  return store.getEntry(entry.id);
}

function resolveStatusTransition(input: {
  body: UpdateEntryBody;
  entry: Entry;
  collection: Collection;
}): { status: EntryStatus; scheduledAt: string | null } {
  const { body, entry, collection } = input;
  const status = body.status ?? entry.status;
  if (status !== "scheduled") return { status, scheduledAt: null };
  const raw = body.scheduledAt === undefined ? entry.scheduledAt : body.scheduledAt;
  if (raw === null || raw === undefined || raw.trim() === "") {
    fail(
      "A scheduled entry needs scheduledAt",
      "scheduledAt",
      "Pass the ISO timestamp to publish at.",
    );
  }
  if (!collection.supports.includes("scheduling")) {
    fail(
      `Collection "${collection.name}" does not support scheduling`,
      "status",
      'Add "scheduling" to the collection supports first.',
    );
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    fail(
      `"${raw}" is not a valid ISO timestamp`,
      "scheduledAt",
      "Use an ISO-8601 datetime, e.g. 2026-10-01T09:00:00Z.",
    );
  }
  if (timestamp <= Date.now()) {
    fail(
      "scheduledAt must be in the future",
      "scheduledAt",
      "Publish now instead, or pick a later timestamp.",
    );
  }
  return { status, scheduledAt: new Date(timestamp).toISOString() };
}

export async function publishEntry(
  store: Store,
  input: { entryId: string; author: Author; baseVersion?: number },
): Promise<{
  entry: Entry;
  version: EntryVersion;
  redirect: EntryRedirect | null;
  rebake: RebakeTrigger;
}> {
  const entry = await store.getEntry(input.entryId);
  if (entry.deletedAt !== null) {
    throw new SenifyError("conflict", "Entry is in the trash", {
      field: "entryId",
      suggestion: "Restore the entry first (restore_entry).",
    });
  }
  if (input.baseVersion !== undefined && input.baseVersion !== entry.version) {
    throw entryConflictError(input.baseVersion, entry.version);
  }
  const collection = await store.getCollection(entry.collectionId);
  if (collection.deprecatedAt !== null) {
    fail(
      `Collection "${collection.name}" is deprecated`,
      "collectionId",
      "Deprecated collections do not receive new publishes.",
    );
  }
  await validateCells(store, collection, entry.cells, { requireAll: true });
  await assertSlugFree(store, collection, entry.slug, entry.id);
  await assertUniqueFields(store, collection, entry);

  // A slug change on a published entry leaves a 301 behind.
  const previous =
    entry.activeVersionId === null
      ? undefined
      : await store.getEntryVersion(entry.activeVersionId);
  let redirect: EntryRedirect | null = null;
  if (previous !== undefined && previous.slug !== entry.slug) {
    const fromPath = entryPath(collection, previous.slug);
    const toPath = entryPath(collection, entry.slug);
    await store.deleteEntryRedirect(entry.siteId, fromPath);
    redirect = await store.createEntryRedirect({
      id: newEntityId(),
      siteId: entry.siteId,
      collectionId: collection.id,
      fromPath,
      toPath,
    });
  }

  const versionNumber = (await store.maxEntryVersionNumber(entry.id)) + 1;
  const version = await store.createEntryVersion({
    id: newEntityId(),
    entryId: entry.id,
    siteId: entry.siteId,
    versionNumber,
    cells: entry.cells,
    slug: entry.slug,
    status: "published",
    author: input.author,
  });
  const now = new Date().toISOString();
  const entryVersion = await store.updateEntryRow({
    entryId: entry.id,
    expectedVersion: entry.version,
    changes: {
      slug: entry.slug,
      status: "published",
      cells: entry.cells,
      activeVersionId: version.id,
      author: input.author,
      searchText: buildSearchText(collection, {
        cells: entry.cells,
        slug: entry.slug,
      }),
      publishedAt: now,
      scheduledAt: null,
      updatedAt: now,
    },
  });
  await pruneEntryVersions(store, entry.id);
  const rebake = triggerRebake(entry.siteId, `entry.published:${entry.id}`);
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "publish_entry",
      params: { entryId: entry.id, versionNumber, slug: entry.slug },
      author: input.author,
      versionAfter: entryVersion,
    }),
  ]);
  return { entry: await store.getEntry(entry.id), version, redirect, rebake };
}

// Retention per entry: the newest ENTRY_VERSION_RETENTION snapshots stay.
async function pruneEntryVersions(store: Store, entryId: string): Promise<void> {
  const versions = await store.listEntryVersions(entryId, 200);
  if (versions.length <= ENTRY_VERSION_RETENTION) return;
  await store.deleteEntryVersions(
    versions.slice(ENTRY_VERSION_RETENTION).map((version) => version.id),
  );
}

export async function unpublishEntry(
  store: Store,
  input: { entryId: string; author: Author; baseVersion?: number },
): Promise<{ entry: Entry; rebake: RebakeTrigger }> {
  const entry = await store.getEntry(input.entryId);
  if (entry.deletedAt !== null) {
    throw new SenifyError("conflict", "Entry is in the trash", {
      field: "entryId",
      suggestion: "Restore the entry first (restore_entry).",
    });
  }
  if (input.baseVersion !== undefined && input.baseVersion !== entry.version) {
    throw entryConflictError(input.baseVersion, entry.version);
  }
  if (entry.status !== "published" && entry.status !== "scheduled") {
    throw new SenifyError("conflict", `Entry is ${entry.status}, not published`, {
      field: "entryId",
      suggestion: "Only published or scheduled entries can be unpublished.",
    });
  }
  const collection = await store.getCollection(entry.collectionId);
  const now = new Date().toISOString();
  const version = await store.updateEntryRow({
    entryId: entry.id,
    expectedVersion: entry.version,
    changes: {
      slug: entry.slug,
      status: "unpublished",
      cells: entry.cells,
      activeVersionId: entry.activeVersionId,
      author: input.author,
      searchText: buildSearchText(collection, {
        cells: entry.cells,
        slug: entry.slug,
      }),
      publishedAt: entry.publishedAt,
      scheduledAt: null,
      updatedAt: now,
    },
  });
  const rebake = triggerRebake(entry.siteId, `entry.unpublished:${entry.id}`);
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "unpublish_entry",
      params: { entryId: entry.id },
      author: input.author,
      versionAfter: version,
    }),
  ]);
  return { entry: await store.getEntry(entry.id), rebake };
}

export type TickResult = {
  published: { entryId: string; versionNumber: number }[];
  failed: { entryId: string; reason: string }[];
};

// The scheduled job tick: due entries publish, broken ones fall back to draft
// instead of staying stuck in "scheduled" forever.
export async function tickScheduledEntries(
  store: Store,
  input: { siteId?: string; limit?: number } = {},
): Promise<TickResult> {
  const limit = input.limit ?? 50;
  const sites =
    input.siteId === undefined
      ? (await store.listSites()).map((site) => site.id)
      : [input.siteId];
  const result: TickResult = { published: [], failed: [] };
  const now = Date.now();
  for (const siteId of sites) {
    const due = (
      await store.listEntries({ siteId, status: "scheduled", limit: 200 })
    )
      .filter(
        (entry) =>
          entry.scheduledAt !== null && Date.parse(entry.scheduledAt) <= now,
      )
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    for (const entry of due) {
      if (result.published.length + result.failed.length >= limit) return result;
      try {
        const published = await publishEntry(store, {
          entryId: entry.id,
          author: SCHEDULER_AUTHOR,
        });
        result.published.push({
          entryId: entry.id,
          versionNumber: published.version.versionNumber,
        });
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Unknown scheduling error";
        const current = await store.getEntry(entry.id);
        const collection = await store.getCollection(current.collectionId);
        const version = await store.updateEntryRow({
          entryId: current.id,
          expectedVersion: current.version,
          changes: {
            slug: current.slug,
            status: "draft",
            cells: current.cells,
            activeVersionId: current.activeVersionId,
            author: SCHEDULER_AUTHOR,
            searchText: buildSearchText(collection, {
              cells: current.cells,
              slug: current.slug,
            }),
            publishedAt: current.publishedAt,
            scheduledAt: null,
            updatedAt: new Date().toISOString(),
          },
        });
        await store.appendAudit([
          contentAudit({
            siteId: current.siteId,
            mutation: "schedule_failed",
            params: { entryId: current.id, reason },
            author: SCHEDULER_AUTHOR,
            versionAfter: version,
          }),
        ]);
        result.failed.push({ entryId: current.id, reason });
      }
    }
  }
  return result;
}

// Restore is append-only: the snapshot lands in the draft, nothing publishes.
export async function restoreEntryVersionAsDraft(
  store: Store,
  input: { entryId: string; versionId: string; author: Author },
): Promise<Entry> {
  const entry = await store.getEntry(input.entryId);
  const version = await store.getEntryVersion(input.versionId);
  if (version.entryId !== entry.id) {
    fail(
      `Version "${version.id}" belongs to another entry`,
      "versionId",
      "Use a version of the entry you are restoring.",
    );
  }
  const collection = await store.getCollection(entry.collectionId);
  await validateCells(store, collection, version.cells, { requireAll: false });
  const updatedAt = new Date().toISOString();
  const newVersion = await store.updateEntryRow({
    entryId: entry.id,
    expectedVersion: entry.version,
    changes: {
      // The slug is not part of a draft restore: URLs must not move silently.
      slug: entry.slug,
      status: entry.status,
      cells: version.cells,
      activeVersionId: entry.activeVersionId,
      author: input.author,
      searchText: buildSearchText(collection, {
        cells: version.cells,
        slug: entry.slug,
      }),
      publishedAt: entry.publishedAt,
      scheduledAt: entry.scheduledAt,
      updatedAt,
    },
  });
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "restore_entry_version",
      params: { entryId: entry.id, versionId: version.id },
      author: input.author,
      versionAfter: newVersion,
    }),
  ]);
  return store.getEntry(entry.id);
}

export async function trashEntry(
  store: Store,
  input: { entryId: string; author: Author },
): Promise<Entry> {
  const entry = await store.getEntry(input.entryId);
  if (entry.deletedAt !== null) return entry;
  const trashed = await store.setEntryDeleted(
    entry.id,
    new Date().toISOString(),
  );
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "delete_entry",
      params: { entryId: entry.id, slug: entry.slug },
      author: input.author,
      versionAfter: entry.version,
    }),
  ]);
  // A trashed published entry loses its route: the bake has to catch up.
  triggerRebake(entry.siteId, `entry.trashed:${entry.id}`);
  return trashed;
}

export async function restoreEntryFromTrash(
  store: Store,
  input: { entryId: string; author: Author },
): Promise<Entry> {
  const entry = await store.getEntry(input.entryId);
  if (entry.deletedAt === null) return entry;
  const collection = await store.getCollection(entry.collectionId);
  await assertSlugFree(store, collection, entry.slug, entry.id);
  const restored = await store.setEntryDeleted(entry.id, null);
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "restore_entry",
      params: { entryId: entry.id, slug: entry.slug },
      author: input.author,
      versionAfter: entry.version,
    }),
  ]);
  triggerRebake(entry.siteId, `entry.restored:${entry.id}`);
  return restored;
}

export async function purgeEntry(
  store: Store,
  input: { entryId: string; author: Author },
): Promise<{ purged: string }> {
  const entry = await store.getEntry(input.entryId);
  if (entry.deletedAt === null) {
    throw new SenifyError(
      "guardrail",
      `Entry "${entry.id}" is not in the trash`,
      {
        field: "entryId",
        suggestion: "Move the entry to the trash first (delete_entry).",
      },
    );
  }
  await store.deleteEntryVersions(
    (await store.listEntryVersions(entry.id, 200)).map((version) => version.id),
  );
  await store.deleteEntryRecord(entry.id);
  await store.appendAudit([
    contentAudit({
      siteId: entry.siteId,
      mutation: "purge_entry",
      params: {
        entryId: entry.id,
        collectionId: entry.collectionId,
        slug: entry.slug,
      },
      author: input.author,
      versionAfter: entry.version,
    }),
  ]);
  return { purged: entry.id };
}

// -------------------------------------------------------------- list + search

async function collectionsById(
  store: Store,
  entries: readonly Entry[],
): Promise<Map<string, Collection>> {
  const map = new Map<string, Collection>();
  for (const entry of entries) {
    if (map.has(entry.collectionId)) continue;
    map.set(entry.collectionId, await store.getCollection(entry.collectionId));
  }
  return map;
}

export async function listEntries(
  store: Store,
  input: { siteId: string; filters: EntryListFilters },
): Promise<Entry[]> {
  await store.getSite(input.siteId);
  const { filters } = input;
  const tokens =
    filters.query === undefined ? undefined : searchTokens(filters.query);
  const entries = await store.listEntries({
    siteId: input.siteId,
    ...(filters.collectionId === undefined
      ? {}
      : { collectionId: filters.collectionId }),
    ...(filters.status === undefined ? {} : { status: filters.status }),
    trashed: filters.trashed,
    ...(tokens === undefined || tokens.length === 0
      ? {}
      : { searchTokens: tokens }),
    limit: 500,
  });
  if (tokens !== undefined && tokens.length > 0) {
    // A search in the list ranks by weight; an explicit sort would hide it.
    const collections = await collectionsById(store, entries);
    return entries
      .map((entry) => {
        const collection = collections.get(entry.collectionId);
        return {
          entry,
          score:
            collection === undefined ? 0 : scoreEntry(collection, entry, tokens),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.entry.updatedAt.localeCompare(a.entry.updatedAt) ||
          b.entry.id.localeCompare(a.entry.id),
      )
      .slice(0, filters.limit)
      .map((hit) => hit.entry);
  }
  const collections = await collectionsById(store, entries);
  return entries
    .sort(
      compareEntries(
        (entry) => collections.get(entry.collectionId),
        filters.sort,
        filters.dir,
      ),
    )
    .slice(0, filters.limit);
}

export async function searchEntries(
  store: Store,
  input: {
    siteId: string;
    q: string;
    collectionId?: string;
    status?: EntryStatus;
    limit?: number;
  },
): Promise<{ query: string; results: EntrySearchHit[] }> {
  await store.getSite(input.siteId);
  const tokens = searchTokens(input.q);
  if (tokens.length === 0) {
    fail(
      "Search query needs at least one letter or digit",
      "q",
      "Search for a word from title, slug or body.",
    );
  }
  const entries = await store.listEntries({
    siteId: input.siteId,
    ...(input.collectionId === undefined
      ? {}
      : { collectionId: input.collectionId }),
    ...(input.status === undefined ? {} : { status: input.status }),
    searchTokens: tokens,
    limit: 500,
  });
  const collections = await collectionsById(store, entries);
  const results = entries
    .map((entry) => {
      const collection = collections.get(entry.collectionId);
      return {
        entry,
        score:
          collection === undefined ? 0 : scoreEntry(collection, entry, tokens),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aCollection = collections.get(a.entry.collectionId);
      const bCollection = collections.get(b.entry.collectionId);
      const aDate =
        aCollection === undefined ? a.entry.updatedAt : entryDateValue(aCollection, a.entry);
      const bDate =
        bCollection === undefined ? b.entry.updatedAt : entryDateValue(bCollection, b.entry);
      return bDate.localeCompare(aDate) || b.entry.id.localeCompare(a.entry.id);
    })
    .slice(0, input.limit ?? 20);
  return { query: input.q, results };
}

// -------------------------------------------------------------------- resolve

export type EntryResolution =
  | { status: "published"; entry: Entry; collection: Collection; path: string }
  | { status: "redirect"; from: string; to: string }
  | { status: "not_found"; path: string };

// A live published entry always wins over a stale redirect row.
export async function resolveEntryPath(
  store: Store,
  input: { siteId: string; path: string },
): Promise<EntryResolution> {
  await store.getSite(input.siteId);
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  const collections = await store.listCollections(input.siteId, {
    includeDeprecated: true,
  });
  for (const collection of collections) {
    const slug = slugFromPath(collection, path);
    if (slug === undefined) continue;
    // The live route follows the published version, so a draft rename only
    // breaks it once the rename itself is published.
    const entry = await store.findPublishedEntryBySlug(collection.id, slug);
    if (entry === undefined) continue;
    return { status: "published", entry, collection, path };
  }
  const redirect = await store.findEntryRedirect(input.siteId, path);
  if (redirect !== undefined) {
    return { status: "redirect", from: path, to: redirect.toPath };
  }
  return { status: "not_found", path };
}
