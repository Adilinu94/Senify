import { SenifyError } from "@senify/core";
import type { BindingEntry, ListPrefetch } from "@senify/renderer";
import type { Node, NodeTree, PropValue } from "@senify/section-sdk";
import { entryPathFor } from "./paths.ts";
import type { Store } from "./store.ts";
import type { Collection, Entry } from "./types.ts";

// Build-time prefetch of every `collection-list` (artifacts/23 §3): the query
// runs now, the page ships as static HTML with the resolved items.

const FILTER_OPS = ["is", "isNot", "isTrue", "isFalse", "isSet", "isEmpty"] as const;
export type ListFilterOp = (typeof FILTER_OPS)[number];

// multiSelect, media, mediaMulti, repeater and relationMulti are not comparable
// and stay out of the closed filter set.
const FILTERABLE_TYPES = new Set([
  "text",
  "longText",
  "richtext",
  "number",
  "boolean",
  "date",
  "dateTime",
  "select",
  "url",
  "email",
  "relation",
]);

const DEFAULT_LIMIT = 6;
const DEFAULT_PARAM = "seite";
const MAX_LIST_ENTRIES = 500;

function asString(value: PropValue | undefined, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

export function findListNodes(tree: NodeTree): { id: string; node: Node }[] {
  return Object.values(tree.nodes)
    .filter((node) => node.type === "collection-list")
    .map((node) => ({ id: node.id, node }));
}

export function toBindingEntry(entry: Entry, collection: Collection): BindingEntry {
  return {
    id: entry.id,
    path: entryPathFor(collection.urlPattern, entry.slug),
    slug: entry.slug,
    cells: entry.cells as Record<string, unknown>,
    fields: collection.fields.map((field) => ({
      id: field.id,
      key: field.key,
      type: field.type,
    })),
    titleField: collection.titleField,
  };
}

function fieldOf(collection: Collection, key: string): Collection["fields"][number] | undefined {
  return collection.fields.find((field) => field.id === key || field.key === key);
}

function passesFilter(
  collection: Collection,
  node: Node,
  entry: Entry,
): boolean {
  const fieldKey = asString(node.props.filterField);
  if (fieldKey === "") return true;
  const field = fieldOf(collection, fieldKey);
  if (field === undefined) {
    throw new SenifyError(
      "validation",
      `Filter field "${fieldKey}" is not a field of collection "${collection.name}"`,
      {
        field: "props.filterField",
        suggestion: "Use the id or key of an existing field.",
      },
    );
  }
  if (!FILTERABLE_TYPES.has(field.type)) {
    throw new SenifyError(
      "validation",
      `Field type "${field.type}" cannot be filtered`,
      {
        field: "props.filterField",
        suggestion: `Filterable types: ${[...FILTERABLE_TYPES].join(", ")}.`,
      },
    );
  }
  const op = asString(node.props.filterOp);
  const value = entry.cells[field.id];
  const expected = asString(node.props.filterValue);
  if (op === "" || !(FILTER_OPS as readonly string[]).includes(op)) {
    throw new SenifyError("validation", `Unknown filter operator "${op}"`, {
      field: "props.filterOp",
      suggestion: `Use one of: ${FILTER_OPS.join(", ")}.`,
    });
  }
  const isSet = value !== undefined && value !== null && value !== "";
  switch (op as ListFilterOp) {
    case "is":
      return String(value ?? "") === expected;
    case "isNot":
      return String(value ?? "") !== expected;
    case "isTrue":
      return value === true;
    case "isFalse":
      return value !== true;
    case "isSet":
      return isSet;
    case "isEmpty":
      return !isSet;
  }
}

function dateValue(collection: Collection, entry: Entry): string {
  if (collection.dateField !== null) {
    const value = entry.cells[collection.dateField];
    if (typeof value === "string" && value !== "") return value;
  }
  return entry.publishedAt ?? entry.updatedAt;
}

function sortEntries(
  collection: Collection,
  node: Node,
  entries: Entry[],
): Entry[] {
  const fieldKey = asString(node.props.orderByField);
  const field = fieldKey === "" ? undefined : fieldOf(collection, fieldKey);
  const direction = asString(node.props.orderByDirection, "desc") === "asc" ? 1 : -1;
  const sorted = [...entries];
  sorted.sort((a, b) => {
    let left: string;
    let right: string;
    if (field === undefined) {
      // Default: the collection's date field, descending ("newest first").
      left = dateValue(collection, a);
      right = dateValue(collection, b);
    } else {
      left = String(a.cells[field.id] ?? "");
      right = String(b.cells[field.id] ?? "");
    }
    return (left.localeCompare(right) || a.id.localeCompare(b.id)) * direction;
  });
  return sorted;
}

export type ListPrefetchResult = {
  lists: Record<string, ListPrefetch>;
  maxPageCount: number;
  // The `?seite=N` parameter names found on this page (for static variants).
  pageParams: string[];
};

export async function prefetchLists(input: {
  store: Store;
  tree: NodeTree;
  collections: Map<string, Collection>;
  currentEntryId: string | null;
  query: Record<string, string>;
  basePath: string;
}): Promise<ListPrefetchResult> {
  const lists: Record<string, ListPrefetch> = {};
  let maxPageCount = 1;
  const pageParams: string[] = [];
  for (const { id, node } of findListNodes(input.tree)) {
    const collectionId = asString(node.props.collectionId);
    if (collectionId === "") continue;
    const collection = input.collections.get(collectionId);
    if (collection === undefined) {
      throw new SenifyError(
        "validation",
        `Collection "${collectionId}" of a collection-list does not exist`,
        {
          field: "props.collectionId",
          suggestion: "Point the list at a collection of this site.",
        },
      );
    }
    const limit =
      typeof node.props.limit === "number" && node.props.limit > 0
        ? Math.min(Math.trunc(node.props.limit), 48)
        : DEFAULT_LIMIT;
    const published = await input.store.listEntries({
      siteId: collection.siteId,
      collectionId: collection.id,
      status: "published",
      limit: MAX_LIST_ENTRIES,
    });
    let entries = published.filter((entry) => passesFilter(collection, node, entry));
    if (node.props.excludeCurrent === true && input.currentEntryId !== null) {
      entries = entries.filter((entry) => entry.id !== input.currentEntryId);
    }
    entries = sortEntries(collection, node, entries);

    const paginated = node.props.pagination === "pages";
    const paramName = asString(node.props.paramName, DEFAULT_PARAM);
    const pageCount = paginated
      ? Math.max(1, Math.ceil(entries.length / limit))
      : 1;
    const rawPage = input.query[paramName];
    const requested = rawPage === undefined ? 1 : Number.parseInt(rawPage, 10);
    const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
    // Page 0 and out-of-range land on an empty list, never on an error.
    const slice =
      requested < 1 || requested > pageCount
        ? []
        : paginated
          ? entries.slice((requested - 1) * limit, requested * limit)
          : entries.slice(0, limit);
    lists[id] = {
      entries: slice.map((entry) => toBindingEntry(entry, collection)),
      page,
      pageCount,
      paramName,
      path: input.basePath,
    };
    maxPageCount = Math.max(maxPageCount, pageCount);
    if (paginated && pageCount > 1 && !pageParams.includes(paramName)) {
      pageParams.push(paramName);
    }
  }
  return { lists, maxPageCount, pageParams };
}
