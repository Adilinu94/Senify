import { SenifyError } from "@senify/core";
import { renderMarkdown } from "@senify/registry";
import {
  validatePropValues,
  type Node,
  type NodeTree,
  type PropValue,
  type SectionDefinition,
} from "@senify/section-sdk";

// One resolver for the bake and the live preview (artifacts/23 §2): props carry
// either a whole-prop binding (`{ "$entry": "cover" }`) or a text mix
// (`"Neues von {entry.title}"`), both resolved against the same sources.

export type BindingField = { id: string; key: string; type: string };

export type BindingEntry = {
  id: string;
  path: string;
  slug: string;
  cells: Record<string, unknown>;
  fields: BindingField[];
  titleField?: string;
};

export type BindingSource = {
  entry?: BindingEntry;
  parentEntry?: BindingEntry;
  site?: Record<string, unknown>;
  query?: Record<string, string>;
  entries?: Record<string, BindingEntry>;
};

export type BindingIssue = {
  field: string;
  message: string;
  suggestion?: string;
};

const WHOLE_KEYS = ["$entry", "$parentEntry", "$site", "$query"] as const;

// Field types that may bind to a prop control: a media cell never lands on a
// text prop, a richtext body never on a number (artifacts/23 §"Typ-Kompatibilität").
const CONTROL_FIELD_TYPES: Record<string, readonly string[]> = {
  text: ["text", "longText", "select", "date", "dateTime", "url", "email"],
  richtext: ["richtext", "longText", "text"],
  number: ["number"],
  boolean: ["boolean"],
  asset: ["media"],
  link: ["url"],
  list: ["repeater"],
  enum: ["select", "text"],
  color: ["text"],
  scale: ["text"],
  slot: [],
};

type Bound = { value: unknown; fieldType: string | undefined; ok: boolean };

const NOT_FOUND: Bound = { value: undefined, fieldType: undefined, ok: false };

function fieldOf(entry: BindingEntry, segment: string): BindingField | undefined {
  return entry.fields.find(
    (field) => field.id === segment || field.key === segment,
  );
}

function resolveEntryPath(
  entry: BindingEntry,
  segments: string[],
  source: BindingSource,
): Bound {
  const head = segments[0];
  if (head === undefined) return NOT_FOUND;
  const rest = segments.slice(1);
  if (head === "path" || head === "url") {
    return { value: entry.path, fieldType: "text", ok: true };
  }
  if (head === "slug" || head === "id") {
    return {
      value: head === "slug" ? entry.slug : entry.id,
      fieldType: "text",
      ok: true,
    };
  }
  if (head === "title" && rest.length === 0) {
    const field =
      entry.titleField === undefined ? undefined : fieldOf(entry, entry.titleField);
    return {
      value: field === undefined ? entry.cells["title"] : entry.cells[field.id],
      fieldType: field?.type ?? "text",
      ok: true,
    };
  }
  const field = fieldOf(entry, head);
  if (field === undefined) return NOT_FOUND;
  const value = entry.cells[field.id];
  if (rest.length === 0) return { value, fieldType: field.type, ok: true };
  // Dotted paths follow a relation to its target entry (entry.author.name).
  if (field.type === "relation" && typeof value === "string") {
    const target = source.entries?.[value];
    return target === undefined ? NOT_FOUND : resolveEntryPath(target, rest, source);
  }
  return NOT_FOUND;
}

function resolveSource(
  source: BindingSource,
  root: string,
  segments: string[],
): Bound {
  if (root === "entry") {
    return source.entry === undefined
      ? NOT_FOUND
      : resolveEntryPath(source.entry, segments, source);
  }
  if (root === "parentEntry") {
    return source.parentEntry === undefined
      ? NOT_FOUND
      : resolveEntryPath(source.parentEntry, segments, source);
  }
  if (root === "site") {
    let current: unknown = source.site ?? {};
    for (const segment of segments) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return NOT_FOUND;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current === undefined
      ? NOT_FOUND
      : { value: current, fieldType: "text", ok: true };
  }
  if (root === "route" && segments[0] === "query") {
    const value = source.query?.[segments.slice(1).join(".")];
    return value === undefined ? NOT_FOUND : { value, fieldType: "text", ok: true };
  }
  if (root === "query") {
    const value = source.query?.[segments.join(".")];
    return value === undefined ? NOT_FOUND : { value, fieldType: "text", ok: true };
  }
  return NOT_FOUND;
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map(stringifyValue)
      .filter((part) => part !== "")
      .join(", ");
  }
  return "";
}

function isWholeBinding(
  value: PropValue | undefined,
): { root: string; path: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1) return undefined;
  const key = keys[0];
  if (key === undefined || !(WHOLE_KEYS as readonly string[]).includes(key)) {
    return undefined;
  }
  const path = record[key];
  if (typeof path !== "string" || path.trim() === "") return undefined;
  return { root: key.slice(1), path };
}

const TOKEN_PATTERN = /\{([A-Za-z][A-Za-z0-9_.]*)\}/g;

function convertBound(
  bound: Bound,
  control: string | undefined,
  field: string,
): { value: PropValue; issue?: BindingIssue } {
  if (control !== undefined) {
    const allowed = CONTROL_FIELD_TYPES[control];
    if (
      bound.fieldType !== undefined &&
      allowed !== undefined &&
      !allowed.includes(bound.fieldType)
    ) {
      return {
        value: null,
        issue: {
          field,
          message: `Binding of type "${bound.fieldType}" does not fit the "${control}" prop`,
          suggestion: `Bind a field of type ${allowed.join(", ") || "—"}.`,
        },
      };
    }
  }
  if (control === "link" && typeof bound.value === "string") {
    return { value: { url: bound.value } };
  }
  if (control === "richtext" && typeof bound.value === "string") {
    // Markdown never reaches the page as raw HTML: registered + sanitized.
    return { value: renderMarkdown(bound.value) };
  }
  return { value: (bound.value ?? null) as PropValue };
}

// Resolves the declared props of one node; unknown fields and type mismatches
// come back as issues with the prop path.
export function resolveNodeProps(input: {
  node: Node;
  definition: SectionDefinition | undefined;
  source: BindingSource;
}): { props: Record<string, PropValue>; issues: BindingIssue[] } {
  const { node, definition, source } = input;
  const specs = new Map<string, { control?: string }>();
  for (const spec of [
    ...(definition?.props ?? []),
    ...(definition?.styleProps ?? []),
  ]) {
    specs.set(spec.key, spec);
  }
  const issues: BindingIssue[] = [];
  const props: Record<string, PropValue> = {};
  // Only bound props are schema-checked: the bake tolerates existing props that
  // predate a schema change (it warns), it does not fail on them.
  const bound: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(node.props)) {
    const field = `props.${key}`;
    const control = specs.get(key)?.control;
    const whole = isWholeBinding(value);
    if (whole !== undefined) {
      const resolved = resolveSource(source, whole.root, whole.path.split("."));
      if (!resolved.ok) {
        issues.push({
          field,
          message: `Binding "${whole.root}.${whole.path}" does not resolve`,
          suggestion: "Bind an existing field of the entry, the site or the route query.",
        });
        props[key] = null;
        bound[key] = null;
        continue;
      }
      const converted = convertBound(resolved, control, field);
      if (converted.issue) issues.push(converted.issue);
      props[key] = converted.value;
      bound[key] = converted.value;
      continue;
    }
    if (typeof value === "string" && value.includes("{")) {
      let failed = false;
      const swapped = value.replace(TOKEN_PATTERN, (match, token: string) => {
        const [root, ...segments] = token.split(".");
        if (root === undefined || segments.length === 0) return match;
        const resolved = resolveSource(source, root, segments);
        if (!resolved.ok) {
          issues.push({
            field,
            message: `Token "${token}" does not resolve`,
            suggestion:
              "Use entry.*, parentEntry.*, site.* or route.query.* of existing fields.",
          });
          failed = true;
          return "";
        }
        return stringifyValue(resolved.value);
      });
      props[key] = control === "richtext" && !failed ? renderMarkdown(swapped) : swapped;
      bound[key] = props[key] ?? "";
      continue;
    }
    props[key] = value;
  }
  if (definition !== undefined && Object.keys(bound).length > 0) {
    for (const issue of validatePropValues(definition, bound, "props")) {
      issues.push({
        field: issue.path,
        message: issue.message,
        ...(issue.suggestion === undefined ? {} : { suggestion: issue.suggestion }),
      });
    }
  }
  return { props, issues };
}

function stylePropsOf(
  node: Node,
  definition: SectionDefinition | undefined,
): Record<string, PropValue> {
  const keys = new Set((definition?.styleProps ?? []).map((spec) => spec.key));
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (keys.has(key)) out[key] = value;
  }
  return out;
}

export type ListPrefetch = {
  entries: BindingEntry[];
  page: number;
  pageCount: number;
  paramName: string;
  path: string;
};

// Per baked page: the binding source (entry/site/query) plus the prefetched
// collection lists of that page, keyed by node id.
export type PageContext = {
  source: BindingSource;
  lists?: Record<string, ListPrefetch>;
};

function pageUrls(list: ListPrefetch): string[] {
  const urls: string[] = [];
  for (let page = 1; page <= list.pageCount; page += 1) {
    urls.push(page === 1 ? list.path : `${list.path}/seite/${page}`);
  }
  return urls;
}

// The card in the `item` slot is the template; each prefetched entry resolves
// it with the entry as binding context (parentEntry keeps the enclosing one).
function expandCollectionList(input: {
  node: Node;
  definition: SectionDefinition | undefined;
  list: ListPrefetch;
  source: BindingSource;
  tree: NodeTree;
  definitions: Map<string, SectionDefinition>;
}): { props: Record<string, PropValue>; issues: BindingIssue[] } {
  const { node, definition, list, source, tree, definitions } = input;
  const resolved = resolveNodeProps({ node, definition, source });
  const cardId = node.slots?.item?.[0];
  const card = cardId === undefined ? undefined : tree.nodes[cardId];
  const cardDefinition =
    card === undefined ? undefined : definitions.get(card.type);
  const variant = card?.variant ?? "image-top";
  const items: PropValue[] = [];
  for (const entry of list.entries) {
    const perItem = resolveNodeProps({
      node: { ...(card ?? { id: "", type: "card", props: {} }), props: card?.props ?? {} },
      definition: cardDefinition,
      source: { ...source, entry, parentEntry: source.entry ?? source.parentEntry },
    });
    for (const issue of perItem.issues) resolved.issues.push(issue);
    items.push({ variant, props: perItem.props });
  }
  const props: Record<string, PropValue> = {
    ...resolved.props,
    items,
    itemTemplate: {
      variant,
      styleProps: stylePropsOf(card ?? node, cardDefinition),
    },
  };
  if (node.props.pagination === "pages" && list.pageCount > 1) {
    props.pageInfo = {
      current: list.page,
      count: list.pageCount,
      urls: pageUrls(list),
    };
  }
  return { props, issues: resolved.issues };
}

export function expandPageTree(input: {
  tree: NodeTree;
  definitions: Map<string, SectionDefinition>;
  source: BindingSource;
  lists?: Record<string, ListPrefetch>;
}): { tree: NodeTree; issues: BindingIssue[] } {
  const issues: BindingIssue[] = [];
  const nodes: Record<string, Node> = {};
  for (const [id, node] of Object.entries(input.tree.nodes)) {
    const definition = input.definitions.get(node.type);
    const list = input.lists?.[id];
    const resolved =
      node.type === "collection-list" && list !== undefined
        ? expandCollectionList({
            node,
            definition,
            list,
            source: input.source,
            tree: input.tree,
            definitions: input.definitions,
          })
        : resolveNodeProps({ node, definition, source: input.source });
    for (const issue of resolved.issues) {
      issues.push({ ...issue, field: `${node.type}:${id}.${issue.field}` });
    }
    nodes[id] = { ...node, props: resolved.props };
  }
  return { tree: { rootNodeId: input.tree.rootNodeId, nodes }, issues };
}

export function bindingError(issues: BindingIssue[]): SenifyError {
  const first = issues[0];
  const extra = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
  return new SenifyError(
    "validation",
    `Bindings failed: ${first?.message ?? "unknown"}${extra}`,
    {
      field: first?.field,
      suggestion: first?.suggestion,
    },
  );
}
