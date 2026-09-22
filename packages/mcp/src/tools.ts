import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { SenifyError } from "@senify/core";
import {
  createRegistry,
  getPrimitive,
  isSectionPrimitiveTwin,
  PRIMITIVES,
  primitiveTypes,
  sectionTwinControls,
  STYLE_PROPERTIES,
  stylePropertyFor,
  type Control,
  type StyleGroup,
} from "@senify/registry";
import type { PropSpec, Registry, SectionDefinition } from "@senify/section-sdk";
import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
  componentDefinitions,
  componentDrift,
  definitionVariants,
  instanceVariants,
  instanceVersion,
  type NodeTree,
} from "@senify/section-sdk";
import type { EngineClient } from "./client.ts";
import { pageOutline, selectNodes, type PageSummaryInput } from "./outline.ts";

export type ToolScope = "read" | "write" | "publish";

export type ToolContext = {
  client: EngineClient;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  inputSchema: Record<string, unknown>;
  entity?: (args: Record<string, unknown>, result: unknown) => string | undefined;
  handler: (
    context: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
};

let cachedRegistry: Registry | undefined;

function registry(): Registry {
  cachedRegistry ??= createRegistry();
  return cachedRegistry;
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as a non-empty string.`,
    });
  }
  return value;
}

function requireNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as a number.`,
    });
  }
  return value;
}

function requireRecord(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = args[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as an object.`,
    });
  }
  return value as Record<string, unknown>;
}

function requireArray(args: Record<string, unknown>, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new SenifyError("validation", `Missing or invalid "${key}"`, {
      field: key,
      suggestion: `Pass "${key}" as a non-empty array.`,
    });
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new SenifyError("validation", `"${key}" must be a string`, {
      field: key,
    });
  }
  return value;
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new SenifyError("validation", `"${key}" must be a boolean`, {
      field: key,
    });
  }
  return value;
}

function optionalNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SenifyError("validation", `"${key}" must be a number`, {
      field: key,
    });
  }
  return value;
}

function optionalNullableString(
  args: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new SenifyError("validation", `"${key}" must be a string or null`, {
      field: key,
    });
  }
  return value;
}

function optionalStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new SenifyError("validation", `"${key}" must be an array of strings`, {
      field: key,
    });
  }
  return value as string[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

function readLocalFile(filePath: string): Buffer {
  try {
    return readFileSync(filePath);
  } catch {
    throw new SenifyError("not_found", `File "${filePath}" is not readable`, {
      field: "filePath",
      suggestion: "Pass an absolute path to an existing local file.",
    });
  }
}

function mimeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (mime === undefined) {
    throw new SenifyError(
      "validation",
      `Unsupported file extension "${extension}"`,
      {
        field: "filePath",
        suggestion: `Use one of: ${Object.keys(MIME_BY_EXTENSION).join(", ")}.`,
      },
    );
  }
  return mime;
}

// Signed upload, shared by upload_asset and replace_asset: ask the engine for a
// URL, then PUT the raw bytes to it.
async function uploadLocalFile(
  context: ToolContext,
  input: { siteId: string; filePath: string; extra: Record<string, unknown> },
): Promise<unknown> {
  const bytes = readLocalFile(input.filePath);
  const mime = mimeForPath(input.filePath);
  const ticket = await context.client.request<{ uploadId: string; url: string }>(
    "POST",
    `/api/sites/${input.siteId}/assets/upload-url`,
    {
      filename: basename(input.filePath),
      mime,
      byteSize: bytes.length,
      ...input.extra,
    },
  );
  return context.client.uploadBytes("PUT", ticket.url, bytes, mime);
}

function propInfo(spec: PropSpec): Record<string, unknown> {
  return {
    key: spec.key,
    label: spec.label,
    control: spec.control,
    ...(spec.group === undefined ? {} : { group: spec.group }),
    ...(spec.part === undefined ? {} : { part: spec.part }),
    ...(spec.tokenGroup === undefined ? {} : { tokenGroup: spec.tokenGroup }),
    ...(spec.options === undefined
      ? {}
      : { options: spec.options.map((option) => option.value) }),
    ...(spec.min === undefined ? {} : { min: spec.min }),
    ...(spec.max === undefined ? {} : { max: spec.max }),
    ...(spec.step === undefined ? {} : { step: spec.step }),
  };
}

function sectionInfo(definition: SectionDefinition): Record<string, unknown> {
  return {
    type: definition.type,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    props: definition.props.map(propInfo),
    styleProps: (definition.styleProps ?? []).map(propInfo),
    variants: Object.entries(definition.variants ?? {}).map(([name, variant]) => ({
      name,
      label: variant.label,
    })),
    allowedChildren: definition.allowedChildren ?? "none",
    motionPresets: definition.motionPresets ?? [],
    ...(definition.slots === undefined ? {} : { slots: definition.slots }),
    goldenVersion: definition.version,
  };
}

async function pageFor(
  context: ToolContext,
  pageId: string,
): Promise<PageSummaryInput> {
  return context.client.request<PageSummaryInput>("GET", `/api/pages/${pageId}`);
}

/* ------------------------------------------------------- components (ticket 04)
 * A component lives as ordinary nodes in the page draft: `__component` is the
 * definition, `__component_instance` an instance, `__component_slot` a
 * placeholder. The tools read the draft (list/get) and write the instance's
 * override bag through the same mutation route the editor uses. */

type ComponentWalk = {
  parts: { id: string; type: string; props: Record<string, unknown> }[];
  slots: { id: string; name: string }[];
};

// The declared parts and slot placeholders of a definition, in tree order.
// Parts are the override keys; slot placeholders are structure, not parts.
function walkComponent(tree: NodeTree, definitionId: string): ComponentWalk {
  const parts: ComponentWalk["parts"] = [];
  const slots: ComponentWalk["slots"] = [];
  const rootChildId = tree.nodes[definitionId]?.children?.[0];
  if (rootChildId === undefined) return { parts, slots };
  const visit = (id: string): void => {
    const node = tree.nodes[id];
    if (node === undefined) return;
    if (node.type === COMPONENT_SLOT_TYPE) {
      slots.push({
        id: node.id,
        name: typeof node.props["name"] === "string" ? node.props["name"] : node.id,
      });
      return;
    }
    if (node.type === COMPONENT_DEFINITION_TYPE) return;
    parts.push({
      id: node.id,
      type: node.type,
      props: node.props as Record<string, unknown>,
    });
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(rootChildId);
  return { parts, slots };
}

function readOverrideBag(value: unknown): Record<string, Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const bag: Record<string, Record<string, unknown>> = {};
  for (const [partId, props] of Object.entries(value)) {
    if (props === null || typeof props !== "object" || Array.isArray(props)) continue;
    bag[partId] = { ...(props as Record<string, unknown>) };
  }
  return bag;
}

// The version a definition carries (`props.version`, default 1) - the same
// reading the editor and the bake use (section-sdk `ComponentDefinition`).
function definitionVersion(tree: NodeTree, definitionId: string): number {
  return (
    componentDefinitions(tree).find((entry) => entry.id === definitionId)?.version ?? 1
  );
}

// Every instance of one definition, with its pin, its active variants and its
// current override bag. `outdated` marks the drift the update tool resolves.
function componentInstanceList(
  tree: NodeTree,
  definitionId: string,
): {
  id: string;
  componentVersion: number;
  outdated: boolean;
  variants: string[];
  overrides: Record<string, Record<string, unknown>>;
}[] {
  const current = definitionVersion(tree, definitionId);
  return Object.values(tree.nodes)
    .filter(
      (node) =>
        node.type === COMPONENT_INSTANCE_TYPE &&
        node.props["componentId"] === definitionId,
    )
    .map((node) => {
      const pinned = instanceVersion(node);
      return {
        id: node.id,
        componentVersion: pinned,
        outdated: pinned !== current,
        variants: instanceVariants(node),
        overrides: readOverrideBag(node.props["overrides"]),
      };
    });
}

function componentName(tree: NodeTree, definitionId: string): string {
  const value = tree.nodes[definitionId]?.props["name"];
  return typeof value === "string" ? value : definitionId;
}

// The control of a widget as the agent reads it: what it is called, which
// family it belongs to, the value type and the bounds that keep a write valid.
function controlInfo(control: Control): Record<string, unknown> {
  return {
    key: control.key,
    label: control.label,
    kind: control.kind,
    valueType: control.valueType,
    default: control.default,
    ...(control.options === undefined
      ? {}
      : { options: control.options.map((option) => option.value) }),
    ...(control.units === undefined ? {} : { units: [...control.units] }),
    ...(control.min === undefined ? {} : { min: control.min }),
    ...(control.max === undefined ? {} : { max: control.max }),
    ...(control.step === undefined ? {} : { step: control.step }),
    ...(control.responsive === false ? { responsive: false } : {}),
    ...(control.fields === undefined
      ? {}
      : { fields: control.fields.map((nested) => controlInfo(nested)) }),
  };
}

// The style properties an agent may write: the documented table (ADR-0005
// keeps the property space open for humans; agents stay on the schema, ticket
// 02 point 7). Accepts both spellings and returns the canonical camelCase key.
function requireStyleKey(property: string): string {
  const spec = stylePropertyFor(property);
  if (spec === undefined) {
    throw new SenifyError("validation", `Unknown style property "${property}"`, {
      field: "styles",
      suggestion:
        "Agents write the documented style properties (see get_widget.styleProperties); the editor's open CSS space stays a human capability.",
    });
  }
  return spec.prop;
}

// property → value as the style routes read it. `device` adds the engine's
// breakpoint suffix (`padding_tablet`), the same shape the editor writes.
function styleDeclarations(
  styles: Record<string, unknown>,
  device?: "tablet" | "mobile",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(styles)) {
    const key = requireStyleKey(property);
    out[device === undefined ? key : `${key}_${device}`] = styleValue(property, value);
  }
  return out;
}

function styleStates(states: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [state, bag] of Object.entries(states)) {
    if (!STATE_NAMES.includes(state as StyleState)) {
      throw new SenifyError("validation", `Unknown pseudo state "${state}"`, {
        field: "states",
        suggestion: `Use one of: ${STATE_NAMES.join(", ")}.`,
      });
    }
    if (bag === null || typeof bag !== "object" || Array.isArray(bag)) {
      throw new SenifyError("validation", `"states.${state}" must be an object`, {
        field: `states.${state}`,
      });
    }
    out[state] = styleDeclarations(bag as Record<string, unknown>);
  }
  return out;
}

function styleValue(property: string, value: unknown): unknown {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  ) {
    return value;
  }
  throw new SenifyError("validation", `Unsupported value for "${property}"`, {
    field: `styles.${property}`,
    suggestion: 'Use a string, a number or a token reference ({ $token: "accent" }).',
  });
}

const STATE_NAMES: readonly StyleState[] = ["hover", "focus", "active", "disabled"];

// The four pseudo states of O11, as the style routes spell them.
type StyleState = "hover" | "focus" | "active" | "disabled";

function requireDevice(args: Record<string, unknown>): "tablet" | "mobile" | undefined {
  const value = optionalString(args, "device");
  if (value === undefined) return undefined;
  if (value !== "tablet" && value !== "mobile") {
    throw new SenifyError("validation", `Unknown device "${value}"`, {
      field: "device",
      suggestion: 'Use "tablet" or "mobile" (desktop is the base value).',
    });
  }
  return value;
}

function requireState(args: Record<string, unknown>): StyleState | undefined {
  const value = optionalString(args, "state");
  if (value === undefined) return undefined;
  if (!STATE_NAMES.includes(value as StyleState)) {
    throw new SenifyError("validation", `Unknown pseudo state "${value}"`, {
      field: "state",
      suggestion: `Use one of: ${STATE_NAMES.join(", ")}.`,
    });
  }
  return value as StyleState;
}

// The rule shape the style routes answer with (the fields the tools read).
type StyleRuleResponse = {
  id: string;
  name: string;
  kind: "class" | "ambient" | "scoped";
  selector: string;
  styles: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  scope?: { type: "node"; nodeId: string; role: "module-style" };
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "whoami",
    title: "Who am I",
    description:
      "Returns the token identity, its scopes and last usage. Use it to debug a client setup and to check that `senify setup` worked.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async (context) => context.client.request("GET", "/api/whoami"),
  },
  {
    name: "list_sites",
    title: "List sites",
    description:
      "Lists all website projects with id, name, slug and profile. Start here to discover the siteId other tools need.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async (context) => context.client.request("GET", "/api/sites"),
  },
  {
    name: "get_site",
    title: "Get site",
    description:
      "Loads one site with its profile and timestamps. Use it to confirm a siteId before writing.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request("GET", `/api/sites/${requireString(args, "siteId")}`),
  },
  {
    name: "create_site",
    title: "Create site",
    description:
      "Legt ein Website-Projekt an: name ist Pflicht, slug und profile (clean|standard|showcase) sind optional. Für ein Redesign ist duplicate_site meist der bessere Start, weil es Inhalte und Theme mitbringt.",
    scope: "write",
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        slug: { type: "string" },
        profile: { type: "string" },
      },
      ["name"],
    ),
    handler: async (context, args) => {
      const name = requireString(args, "name");
      const slug = optionalString(args, "slug");
      const profile = optionalString(args, "profile");
      return context.client.request("POST", "/api/sites", {
        name,
        ...(slug === undefined ? {} : { slug }),
        ...(profile === undefined ? {} : { profile }),
      });
    },
  },
  {
    name: "duplicate_site",
    title: "Duplicate site",
    description:
      "Kopiert ein Projekt samt Theme; withContent (Default true) übernimmt Seiten, Artikel und Sammlungen, sonst nur Struktur und Design. name benennt die Kopie direkt um (sonst \"<Name> (Kopie)\"). Der Weg für ein Redesign: je Referenz eine Kopie, danach update_theme mit dem themePatch aus plan_redesign.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        name: { type: "string" },
        withContent: { type: "boolean" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const name = optionalString(args, "name");
      const withContent = optionalBoolean(args, "withContent");
      const created = (await context.client.request(
        "POST",
        `/api/sites/${siteId}/duplicate`,
        { withContent: withContent ?? true },
      )) as { id?: string };
      if (name === undefined || created.id === undefined) return created;
      // The copy is named "<Name> (Kopie)" by the store; the rename makes the
      // two redesign copies distinguishable in the project list.
      return context.client.request("PATCH", `/api/sites/${created.id}`, { name });
    },
  },
  {
    name: "list_pages",
    title: "List pages",
    description:
      "Lists the pages of a site with path, title and draftVersion. Use it to find the pageId for get_page and apply_mutations.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/pages`,
      ),
  },
  {
    name: "get_page",
    title: "Get page outline",
    description:
      "Returns the outline of a page: top-level sections with id, type, variant and a short content summary plus the draftVersion needed for apply_mutations. Use get_nodes for full props.",
    scope: "read",
    inputSchema: objectSchema({ pageId: { type: "string" } }, ["pageId"]),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) =>
      pageOutline(await pageFor(context, requireString(args, "pageId"))),
  },
  {
    name: "get_nodes",
    title: "Get nodes",
    description:
      "Loads full nodes (props, overrides, motion) by node id from a page. Use it after get_page when you need exact values before editing.",
    scope: "read",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        nodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      ["pageId", "nodeIds"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const page = await pageFor(context, requireString(args, "pageId"));
      const ids = requireArray(args, "nodeIds").map((value) => {
        if (typeof value !== "string" || value === "") {
          throw new SenifyError("validation", '"nodeIds" must contain strings', {
            field: "nodeIds",
          });
        }
        return value;
      });
      return selectNodes(page, ids);
    },
  },
  {
    name: "list_sections",
    title: "List sections",
    description:
      "Lists the section catalog (building blocks) with type, title and description. Use get_section for the full prop schema and a golden example.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async () => ({
      sections: registry().list().map((definition) => ({
        type: definition.type,
        title: definition.title,
        description: definition.description,
        category: definition.category,
      })),
    }),
  },
  {
    name: "get_section",
    title: "Get section",
    description:
      "Returns a section definition: props with controls, style props and parts, variants, slots, motion presets and the golden example props. Use it before inserting a section.",
    scope: "read",
    inputSchema: objectSchema({ type: { type: "string" } }, ["type"]),
    entity: (args) => `section:${String(args.type ?? "")}`,
    handler: async (_context, args) => {
      const type = requireString(args, "type");
      const definition = registry().get(type);
      return {
        ...sectionInfo(definition),
        goldenProps: definition.golden.tree.props,
        goldenVariant: definition.golden.tree.variant ?? null,
      };
    },
  },
  {
    name: "get_theme",
    title: "Get theme",
    description:
      "Returns the design tokens of a site (primitives, semantic roles, modes, fonts, motion). Use token roles in style props instead of raw values.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/theme`,
      ),
  },
  {
    name: "list_widgets",
    title: "List widgets",
    description:
      "Lists the widget catalog (the atomic building blocks: frame, heading, image, …) with type, name, category and the style groups each one accepts. Use get_widget for the full control schema.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async () => ({
      widgets: PRIMITIVES.map((definition) => ({
        type: definition.type,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        styleGroups: [...definition.styleGroups],
        // A twin name (divider/embed) is rendered by the running section until
        // the parity gate; its controls in get_widget are the section's.
        ...(isSectionPrimitiveTwin(definition.type) ? { sectionTwin: true } : {}),
      })),
    }),
  },
  {
    name: "get_widget",
    title: "Get widget",
    description:
      "Returns one widget's schema: controls (key, kind, value type, options, units, bounds), style groups, container rules, slots and — for the style groups it accepts — the style properties with their units. Use it before set_styles or create_style_rule.",
    scope: "read",
    inputSchema: objectSchema({ type: { type: "string" } }, ["type"]),
    entity: (args) => `widget:${String(args.type ?? "")}`,
    handler: async (_context, args) => {
      const type = requireString(args, "type");
      const definition = getPrimitive(type);
      if (definition === undefined) {
        throw new SenifyError("not_found", `Unknown widget "${type}"`, {
          field: "type",
          suggestion: `Check the type with list_widgets (${primitiveTypes().join(", ")}).`,
        });
      }
      const groups = new Set<StyleGroup>(definition.styleGroups);
      // A twin name writes the running section's props until the cutover.
      const controls = sectionTwinControls(type) ?? definition.controls;
      return {
        type: definition.type,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        container: definition.container,
        allowedChildren: definition.allowedChildren,
        slots: definition.slots,
        styleGroups: [...definition.styleGroups],
        controls: controls.map(controlInfo),
        ...(isSectionPrimitiveTwin(type) ? { sectionTwin: true } : {}),
        styleProperties: STYLE_PROPERTIES.filter((spec) => groups.has(spec.group)).map(
          (spec) => ({
            property: spec.prop,
            group: spec.group,
            kind: spec.kind,
            units: spec.units === undefined ? null : [...spec.units],
          }),
        ),
      };
    },
  },
  {
    name: "search_docs",
    title: "Search docs",
    description:
      "Searches the Senify documentation (tool reference, section catalog, error codes, guides) and returns ranked snippets with page paths. Fetch a hit with read_docs.",
    scope: "read",
    inputSchema: objectSchema(
      { query: { type: "string" }, limit: { type: "number" } },
      ["query"],
    ),
    handler: async (_context, args) => {
      // Lazy import breaks the package cycle (docs-portal reads the tool
      // catalog from this package).
      const { portalPages, searchDocs } = await import("@senify/docs-portal");
      return {
        results: searchDocs(
          portalPages(),
          requireString(args, "query"),
          optionalNumber(args, "limit") ?? 6,
        ),
      };
    },
  },
  {
    name: "read_docs",
    title: "Read docs",
    description:
      "Returns a documentation page as markdown by its path, e.g. /reference/tools or /guides/site-aus-brief. Paths come from search_docs or /llms.txt.",
    scope: "read",
    inputSchema: objectSchema({ path: { type: "string" } }, ["path"]),
    handler: async (_context, args) => {
      const { pageMarkdown, portalPages, readDoc } = await import(
        "@senify/docs-portal"
      );
      const requested = requireString(args, "path");
      const page = readDoc(portalPages(), requested);
      if (!page) {
        throw new SenifyError("not_found", `Unknown docs page "${requested}"`, {
          field: "path",
          suggestion:
            "Use search_docs to find the right page, or read /llms.txt for the index.",
        });
      }
      return {
        path: page.path,
        title: page.title,
        markdown: pageMarkdown(page),
      };
    },
  },
  {
    name: "apply_mutations",
    title: "Apply mutations",
    description:
      "The single write API: applies a batch of canonical mutations (insertNode, updateNodeProps, moveNode, setMotion, …) atomically. Send baseDraftVersion from get_page; use dry_run to validate without writing. Conflicts return a conflict error — reload the page and retry.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        baseDraftVersion: { type: "number" },
        dry_run: { type: "boolean" },
        mutations: { type: "array", items: { type: "object" }, minItems: 1 },
      },
      ["pageId", "baseDraftVersion", "mutations"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/pages/${pageId}/mutations`, {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
        author: { kind: "agent", id: name, label: name },
        dry_run: optionalBoolean(args, "dry_run") ?? false,
        mutations: requireArray(args, "mutations"),
      });
    },
  },
  {
    name: "set_motion",
    title: "Set motion",
    description:
      "Sets the motion spec of one node: preset + intensity (1-10) + trigger + delay + tokens (ease/durationScale/stagger) + reduced-motion policy (static|fade|off) + enabled. Presets come from the registry (get_section.motionPresets); the site profile caps the intensity and narrows the preset classes. Send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        nodeId: { type: "string" },
        baseDraftVersion: { type: "number" },
        preset: { type: "string" },
        intensity: { type: "number" },
        trigger: { type: "string" },
        delay: { type: "number" },
        tokens: { type: "object" },
        reducedMotion: { type: "string" },
        enabled: { type: "boolean" },
      },
      ["pageId", "nodeId", "baseDraftVersion", "preset"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      const intensity = optionalNumber(args, "intensity");
      const trigger = optionalString(args, "trigger");
      const delay = optionalNumber(args, "delay");
      const reducedMotion = optionalString(args, "reducedMotion");
      const enabled = optionalBoolean(args, "enabled");
      const tokens = args.tokens;
      const spec: Record<string, unknown> = { preset: requireString(args, "preset") };
      if (intensity !== undefined) spec.intensity = intensity;
      if (trigger !== undefined) spec.trigger = trigger;
      if (delay !== undefined) spec.delay = delay;
      if (reducedMotion !== undefined) spec.reducedMotion = reducedMotion;
      if (enabled !== undefined) spec.enabled = enabled;
      if (tokens !== undefined && typeof tokens === "object" && tokens !== null) {
        spec.tokens = tokens;
      }
      return context.client.request("POST", `/api/pages/${pageId}/mutations`, {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
        author: { kind: "agent", id: name, label: name },
        mutations: [{ op: "setMotion", id: requireString(args, "nodeId"), spec }],
      });
    },
  },
  {
    name: "clear_motion",
    title: "Clear motion",
    description:
      "Removes the motion spec of one node (the node stays, only the animation goes). Send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      { pageId: { type: "string" }, nodeId: { type: "string" }, baseDraftVersion: { type: "number" } },
      ["pageId", "nodeId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/pages/${pageId}/mutations`, {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
        author: { kind: "agent", id: name, label: name },
        mutations: [{ op: "clearMotion", id: requireString(args, "nodeId") }],
      });
    },
  },
  {
    name: "list_components",
    title: "List components",
    description:
      "Lists the visual components defined on a page (definitions in the page draft) with name, part count, slot names and instance count. Use get_component for part ids, slot ids and instance ids.",
    scope: "read",
    inputSchema: objectSchema({ pageId: { type: "string" } }, ["pageId"]),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const page = await pageFor(context, pageId);
      const components = Object.values(page.draft.nodes)
        .filter((node) => node.type === COMPONENT_DEFINITION_TYPE)
        .map((node) => {
          const { parts, slots } = walkComponent(page.draft, node.id);
          const instances = componentInstanceList(page.draft, node.id);
          const drift = componentDrift(page.draft).filter(
            (entry) => entry.componentId === node.id,
          );
          return {
            id: node.id,
            name: componentName(page.draft, node.id),
            version: definitionVersion(page.draft, node.id),
            parts: parts.length,
            slots: slots.map((slot) => slot.name),
            variants: Object.keys(definitionVariants(node)),
            instances: instances.length,
            outdated: drift.length,
            instanceIds: instances.map((entry) => entry.id),
          };
        });
      return { pageId: page.id, draftVersion: page.draftVersion, components };
    },
  },
  {
    name: "get_component",
    title: "Get component",
    description:
      "Returns one component definition with its parts (id, type, current props - the override keys), its slot placeholders and its instances with their override bags. Use set_component_override to change one instance without touching the definition.",
    scope: "read",
    inputSchema: objectSchema(
      { pageId: { type: "string" }, componentId: { type: "string" } },
      ["pageId", "componentId"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const componentId = requireString(args, "componentId");
      const page = await pageFor(context, pageId);
      const definition = page.draft.nodes[componentId];
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${componentId}" is not on the page`,
          {
            field: "componentId",
            suggestion: "List the page's components with list_components.",
          },
        );
      }
      const { parts, slots } = walkComponent(page.draft, componentId);
      return {
        pageId: page.id,
        draftVersion: page.draftVersion,
        id: definition.id,
        name: componentName(page.draft, componentId),
        version: definitionVersion(page.draft, componentId),
        parts,
        slots,
        variants: definitionVariants(definition),
        drift: componentDrift(page.draft).filter(
          (entry) => entry.componentId === componentId,
        ),
        instances: componentInstanceList(page.draft, componentId),
      };
    },
  },
  {
    name: "set_component_override",
    title: "Set component override",
    description:
      "Sets or clears one override of a component instance: the value applies only to this instance, the definition stays untouched. `value: null` clears the key; an empty override bag is removed. Read part ids and instance ids with get_component, then send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        instanceId: { type: "string" },
        partId: { type: "string" },
        key: { type: "string" },
        value: { description: "Any JSON value; null clears the key." },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "instanceId", "partId", "key", "value", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const instanceId = requireString(args, "instanceId");
      const partId = requireString(args, "partId");
      const key = requireString(args, "key");
      const page = await pageFor(context, pageId);
      const instance = page.draft.nodes[instanceId];
      if (instance === undefined || instance.type !== COMPONENT_INSTANCE_TYPE) {
        throw new SenifyError(
          "not_found",
          `Instance "${instanceId}" is not on the page`,
          {
            field: "instanceId",
            suggestion: "List the component's instances with get_component.",
          },
        );
      }
      const componentId = instance.props["componentId"];
      const definition =
        typeof componentId === "string" ? page.draft.nodes[componentId] : undefined;
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${String(componentId)}" is not defined`,
          {
            field: "instanceId",
            suggestion: "The instance points at a definition that is not on the page.",
          },
        );
      }
      const { parts } = walkComponent(page.draft, definition.id);
      if (!parts.some((part) => part.id === partId)) {
        throw new SenifyError(
          "not_found",
          `Component "${componentName(page.draft, definition.id)}" has no part "${partId}"`,
          {
            field: "partId",
            suggestion: `Parts: ${parts.map((part) => part.id).join(", ") || "none"}.`,
          },
        );
      }
      const bag = readOverrideBag(instance.props["overrides"]);
      const part = { ...(bag[partId] ?? {}) };
      const value = args.value;
      if (value === undefined) {
        throw new SenifyError("validation", 'Missing "value"', {
          field: "value",
          suggestion: "Pass a JSON value, or null to clear the key.",
        });
      }
      if (value === null) delete part[key];
      else part[key] = value;
      if (Object.keys(part).length === 0) delete bag[partId];
      else bag[partId] = part;
      const next = Object.keys(bag).length === 0 ? null : bag;
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: [
            { op: "updateNodeProps", id: instanceId, patch: { overrides: next } },
          ],
        },
      );
      return { ...response, overrides: next };
    },
  },
  {
    name: "set_component_variant",
    title: "Set component variant",
    description:
      "Activates or deactivates one variant of a component instance: the definition declares the variants (props overlays on its parts), the instance activates them. Several variants can be active at once; the instance's overrides always win and survive a variant swap. Read the variants and instance ids with get_component, then send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        instanceId: { type: "string" },
        variant: { type: "string" },
        active: { type: "boolean", description: "true activates, false deactivates." },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "instanceId", "variant", "active", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const instanceId = requireString(args, "instanceId");
      const variant = requireString(args, "variant");
      const page = await pageFor(context, pageId);
      const instance = page.draft.nodes[instanceId];
      if (instance === undefined || instance.type !== COMPONENT_INSTANCE_TYPE) {
        throw new SenifyError(
          "not_found",
          `Instance "${instanceId}" is not on the page`,
          {
            field: "instanceId",
            suggestion: "List the component's instances with get_component.",
          },
        );
      }
      const componentId = instance.props["componentId"];
      const definition =
        typeof componentId === "string" ? page.draft.nodes[componentId] : undefined;
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${String(componentId)}" is not defined`,
          {
            field: "instanceId",
            suggestion: "The instance points at a definition that is not on the page.",
          },
        );
      }
      const declared = Object.keys(definitionVariants(definition));
      if (!declared.includes(variant)) {
        throw new SenifyError(
          "not_found",
          `Component "${componentName(page.draft, definition.id)}" has no variant "${variant}"`,
          {
            field: "variant",
            suggestion: `Variants: ${declared.join(", ") || "none"}.`,
          },
        );
      }
      const active = args.active;
      if (typeof active !== "boolean") {
        throw new SenifyError("validation", 'Missing "active"', {
          field: "active",
          suggestion: "Pass true to activate the variant, false to deactivate it.",
        });
      }
      const current = instanceVariants(instance);
      const wanted = active
        ? [...current, variant]
        : current.filter((entry) => entry !== variant);
      const next = declared.filter((name) => wanted.includes(name));
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: [
            {
              op: "updateNodeProps",
              id: instanceId,
              patch: { variants: next.length === 0 ? null : next },
            },
          ],
        },
      );
      return { ...response, variants: next };
    },
  },
  {
    name: "bump_component_version",
    title: "Bump component version",
    description:
      "Raises a component definition's version by one (`props.version`). The instances keep their pin, so the difference shows as drift until update_component_instances pulls them up. Send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        componentId: { type: "string" },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "componentId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const componentId = requireString(args, "componentId");
      const page = await pageFor(context, pageId);
      const definition = page.draft.nodes[componentId];
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${componentId}" is not on the page`,
          {
            field: "componentId",
            suggestion: "List the page's components with list_components.",
          },
        );
      }
      const version = definitionVersion(page.draft, componentId) + 1;
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: [{ op: "updateNodeProps", id: componentId, patch: { version } }],
        },
      );
      return { ...response, version };
    },
  },
  {
    name: "update_component_instances",
    title: "Update component instances",
    description:
      "Pulls every instance of a definition up to its current version in one batch (one undo). Instances that are already current stay untouched. Read versions and drift with get_component, then send baseDraftVersion from get_page.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        componentId: { type: "string" },
        baseDraftVersion: { type: "number" },
      },
      ["pageId", "componentId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const componentId = requireString(args, "componentId");
      const page = await pageFor(context, pageId);
      const definition = page.draft.nodes[componentId];
      if (definition === undefined || definition.type !== COMPONENT_DEFINITION_TYPE) {
        throw new SenifyError(
          "not_found",
          `Component "${componentId}" is not on the page`,
          {
            field: "componentId",
            suggestion: "List the page's components with list_components.",
          },
        );
      }
      const version = definitionVersion(page.draft, componentId);
      const stale = componentDrift(page.draft).filter(
        (entry) => entry.componentId === componentId,
      );
      if (stale.length === 0) {
        return {
          pageId: page.id,
          draftVersion: page.draftVersion,
          version,
          updated: 0,
        };
      }
      const name = await context.client.tokenName();
      const response = await context.client.request<Record<string, unknown>>(
        "POST",
        `/api/pages/${pageId}/mutations`,
        {
          baseDraftVersion: requireNumber(args, "baseDraftVersion"),
          author: { kind: "agent", id: name, label: name },
          mutations: stale.map((entry) => ({
            op: "updateNodeProps",
            id: entry.instanceId,
            patch: { componentVersion: version },
          })),
        },
      );
      return { ...response, version, updated: stale.length };
    },
  },
  {
    name: "set_styles",
    title: "Set styles",
    description:
      "Writes style declarations onto one node through its scoped style rule (the same carrier the editor uses for pseudo states). Pass styles as property → value (string, number or { $token }), device \"tablet\"/\"mobile\" for a breakpoint override and state \"hover\"/\"focus\"/\"active\"/\"disabled\" for a pseudo state. Only documented style properties are accepted; raw colour literals that match a theme token are rejected — use the token. Returns the written rule.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        pageId: { type: "string" },
        nodeId: { type: "string" },
        styles: { type: "object" },
        device: { type: "string" },
        state: { type: "string" },
      },
      ["siteId", "pageId", "nodeId", "styles"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const pageId = requireString(args, "pageId");
      const nodeId = requireString(args, "nodeId");
      const styles = requireRecord(args, "styles");
      const device = requireDevice(args);
      const state = requireState(args);
      const name = await context.client.tokenName();
      const author = { kind: "agent", id: name, label: name };
      // The node must exist on the page: a rule for a typo'd id would be dead
      // weight nobody sees.
      const page = await pageFor(context, pageId);
      const { nodes, missing } = selectNodes(page, [nodeId]);
      if (nodes.length === 0) {
        throw new SenifyError("not_found", `Node "${missing[0] ?? nodeId}" is not on the page`, {
          field: "nodeId",
          suggestion: "Read the page outline (get_page) and use a node id from it.",
        });
      }
      const declared = styleDeclarations(styles, device);
      const rules = await context.client.request<{ rules: StyleRuleResponse[] }>(
        "GET",
        `/api/sites/${siteId}/style-rules`,
      );
      const existing = rules.rules.find(
        (rule) => rule.kind === "scoped" && rule.scope?.nodeId === nodeId,
      );
      if (existing === undefined) {
        return context.client.request("POST", `/api/sites/${siteId}/style-rules`, {
          kind: "scoped",
          name: `scoped-${nodeId}`,
          nodeId,
          ...(state === undefined ? { styles: declared } : { states: { [state]: declared } }),
          author,
        });
      }
      const next =
        state === undefined
          ? { ...existing.styles, ...declared }
          : { ...(existing.states ?? {}), [state]: { ...(existing.states?.[state] ?? {}), ...declared } };
      return context.client.request("PATCH", `/api/sites/${siteId}/style-rules/${existing.id}`, {
        ...(state === undefined ? { styles: next } : { states: next }),
        author,
      });
    },
  },
  {
    name: "create_style_rule",
    title: "Create style rule",
    description:
      "Creates a style rule: a class rule (name required) that nodes can be assigned, or a scoped rule for one node (nodeId). Pass styles and optional per-state styles (hover/focus/active/disabled). Ambient selectors and rawCss stay a human capability; raw colour literals that match a theme token are rejected — use { $token }.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        name: { type: "string" },
        nodeId: { type: "string" },
        description: { type: "string" },
        styles: { type: "object" },
        states: { type: "object" },
      },
      ["siteId", "styles"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const nodeId = optionalString(args, "nodeId");
      const name = optionalString(args, "name");
      if (nodeId === undefined && name === undefined) {
        throw new SenifyError("validation", "A style rule needs a name or a nodeId", {
          field: "name",
          suggestion: "Pass `name` for a class rule or `nodeId` for a scoped rule.",
        });
      }
      const description = optionalString(args, "description");
      const states = args.states;
      const scoped = nodeId !== undefined;
      const author = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/style-rules`, {
        kind: scoped ? "scoped" : "class",
        name: scoped ? `scoped-${nodeId}` : (name ?? ""),
        ...(scoped ? { nodeId } : {}),
        ...(description === undefined ? {} : { description }),
        styles: styleDeclarations(requireRecord(args, "styles")),
        ...(states === undefined
          ? {}
          : {
              states: styleStates(requireRecord(args, "states")),
            }),
        author: { kind: "agent", id: author, label: author },
      });
    },
  },
  {
    name: "create_page",
    title: "Create page",
    description:
      "Creates a page on a site and returns it with an empty node tree. The path defaults to a slug of the title; \"/\" is the home page. Pass an idempotencyKey to make a retry return the first result instead of creating a duplicate.",
    scope: "write",
    inputSchema: objectSchema({
      siteId: { type: "string" },
      title: { type: "string" },
      path: { type: "string" },
      idempotencyKey: { type: "string" },
    }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const title = optionalString(args, "title");
      const path = optionalString(args, "path");
      const idempotencyKey = optionalString(args, "idempotencyKey");
      return context.client.request("POST", `/api/sites/${siteId}/pages`, {
        ...(title === undefined ? {} : { title }),
        ...(path === undefined ? {} : { path }),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
    },
  },
  {
    name: "update_theme",
    title: "Update theme",
    description:
      "Patches the theme of a site (scales, semantic roles, fonts, motion) and records the change in the audit log. Send only the branches you change.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        theme: { type: "object" },
      },
      ["siteId", "theme"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const name = await context.client.tokenName();
      return context.client.request("PUT", `/api/sites/${siteId}/theme`, {
        theme: requireRecord(args, "theme"),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "create_preview",
    title: "Create preview",
    description:
      "Builds a real draft build of the site and returns a signed preview URL (30 days). Use it to check your work visually before submitting for review.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/previews`, {
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "submit_for_review",
    title: "Submit for review",
    description:
      "Submits the current drafts for human review: builds a preview, computes the structure diff against the active release and creates a review item. Hard checks must pass — violations come back as a guardrail error instead of a review item.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        note: { type: "string" },
        pageIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const note = optionalString(args, "note");
      const pageIds = args.pageIds;
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/reviews`, {
        author: { kind: "agent", id: name, label: name },
        ...(note === undefined ? {} : { note }),
        ...(Array.isArray(pageIds) ? { pageIds } : {}),
      });
    },
  },
  {
    name: "get_review_feedback",
    title: "Get review feedback",
    description:
      "Reads a review item: status, thread (the operator's notes) and the structure diff. Call it after a submit to see whether changes were requested; newer feedback means new work.",
    scope: "read",
    inputSchema: objectSchema({ reviewId: { type: "string" } }, ["reviewId"]),
    entity: (args) => `review:${String(args.reviewId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/reviews/${requireString(args, "reviewId")}`,
      ),
  },
  {
    name: "publish_release",
    title: "Publish release",
    description:
      "Publishes the drafts as a release: runs the publish checks (hard gate), snapshots every page as a revision, bakes the release and makes it active. Needs the publish scope; unapproved releases stay theory.",
    scope: "publish",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        note: { type: "string" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const note = optionalString(args, "note");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/releases`, {
        author: { kind: "agent", id: name, label: name },
        ...(note === undefined ? {} : { note }),
      });
    },
  },
  {
    name: "rollback_release",
    title: "Roll back release",
    description:
      "Creates a new release from an older release's state (basisReleaseId) and snaps theme plus drafts back to it. Nothing is overwritten — the history stays append-only.",
    scope: "publish",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        releaseId: { type: "string" },
        note: { type: "string" },
      },
      ["siteId", "releaseId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const releaseId = requireString(args, "releaseId");
      const note = optionalString(args, "note");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/releases`, {
        author: { kind: "agent", id: name, label: name },
        basisReleaseId: releaseId,
        ...(note === undefined ? {} : { note }),
      });
    },
  },
  {
    name: "restore_revision",
    title: "Restore revision",
    description:
      "Uses an old page revision as the new draft (append-only: nothing is rewritten, the restore lands in the audit log).",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        revisionId: { type: "string" },
      },
      ["pageId", "revisionId"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/pages/${pageId}/restore`, {
        author: { kind: "agent", id: name, label: name },
        revisionId: requireString(args, "revisionId"),
      });
    },
  },
  {
    name: "delete_page",
    title: "Delete page",
    description:
      "Deletes a page and its draft (destructive, audited). Needs the publish scope.",
    scope: "publish",
    inputSchema: objectSchema({ pageId: { type: "string" } }, ["pageId"]),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      await context.client.request("DELETE", `/api/pages/${pageId}`);
      return { deleted: pageId };
    },
  },
  {
    name: "list_assets",
    title: "List assets",
    description:
      "Lists the media library of a site with filters (folder, tag, alt=missing, minBytes, q) and sorting. Use alt=missing for the no-alt-text smart list and sort=replacedAt for recently replaced files.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        folder: { type: "string" },
        tag: { type: "string" },
        alt: { type: "string", enum: ["missing"] },
        minBytes: { type: "number" },
        q: { type: "string" },
        sort: {
          type: "string",
          enum: ["createdAt", "name", "size", "replacedAt"],
        },
        status: { type: "string", enum: ["ready", "trashed", "all"] },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams();
      for (const key of ["folder", "tag", "alt", "q", "sort", "status"]) {
        const value = optionalString(args, key);
        if (value !== undefined) params.set(key, value);
      }
      const minBytes = optionalNumber(args, "minBytes");
      if (minBytes !== undefined) params.set("minBytes", String(minBytes));
      const query = params.toString();
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/assets${query === "" ? "" : `?${query}`}`,
      );
    },
  },
  {
    name: "upload_asset",
    title: "Upload asset",
    description:
      "Uploads a local file to the media library: asks for a signed upload URL, sends the bytes and returns the asset record. Identical bytes dedupe onto the existing asset instead of creating a second record. Pass an idempotencyKey to make a retry reuse the first upload URL.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        filePath: { type: "string" },
        altText: { type: "string" },
        decorative: { type: "boolean" },
        folderId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        idempotencyKey: { type: "string" },
      },
      ["siteId", "filePath"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const filePath = requireString(args, "filePath");
      const extra: Record<string, unknown> = {};
      const altText = optionalString(args, "altText");
      if (altText !== undefined) extra.altText = altText;
      const decorative = optionalBoolean(args, "decorative");
      if (decorative !== undefined) extra.decorative = decorative;
      const folderId = optionalString(args, "folderId");
      if (folderId !== undefined) extra.folderId = folderId;
      const tags = optionalStringArray(args, "tags");
      if (tags !== undefined) extra.tags = tags;
      const idempotencyKey = optionalString(args, "idempotencyKey");
      if (idempotencyKey !== undefined) extra.idempotencyKey = idempotencyKey;
      return uploadLocalFile(context, { siteId, filePath, extra });
    },
  },
  {
    name: "update_asset",
    title: "Update asset",
    description:
      "Updates asset metadata (alt text, decorative flag, folder, tags). Mark purely decorative images as decorative so the alt-text check exempts them; pass null for altText or folderId to clear it.",
    scope: "write",
    inputSchema: objectSchema(
      {
        assetId: { type: "string" },
        altText: { type: ["string", "null"] },
        decorative: { type: "boolean" },
        folderId: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
      },
      ["assetId"],
    ),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) => {
      const assetId = requireString(args, "assetId");
      const patch: Record<string, unknown> = {};
      const altText = optionalNullableString(args, "altText");
      if (altText !== undefined) patch.altText = altText;
      const decorative = optionalBoolean(args, "decorative");
      if (decorative !== undefined) patch.decorative = decorative;
      const folderId = optionalNullableString(args, "folderId");
      if (folderId !== undefined) patch.folderId = folderId;
      const tags = optionalStringArray(args, "tags");
      if (tags !== undefined) patch.tags = tags;
      if (Object.keys(patch).length === 0) {
        throw new SenifyError("validation", "No asset metadata to update", {
          field: "assetId",
          suggestion: "Pass altText, decorative, folderId or tags.",
        });
      }
      return context.client.request("PATCH", `/api/assets/${assetId}`, patch);
    },
  },
  {
    name: "replace_asset",
    title: "Replace asset file",
    description:
      "Replaces the file of an asset under the same id and URL: every usage stays valid, the previous file lands in the history (restorable) and metadata like alt text and tags is kept.",
    scope: "write",
    inputSchema: objectSchema(
      {
        assetId: { type: "string" },
        filePath: { type: "string" },
        altText: { type: "string" },
      },
      ["assetId", "filePath"],
    ),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) => {
      const assetId = requireString(args, "assetId");
      const filePath = requireString(args, "filePath");
      const asset = await context.client.request<{ siteId: string }>(
        "GET",
        `/api/assets/${assetId}`,
      );
      const result = await uploadLocalFile(context, {
        siteId: asset.siteId,
        filePath,
        extra: { replaceAssetId: assetId },
      });
      const altText = optionalString(args, "altText");
      if (altText === undefined) return result;
      return context.client.request("PATCH", `/api/assets/${assetId}`, {
        altText,
      });
    },
  },
  {
    name: "delete_asset",
    title: "Delete asset",
    description:
      "Moves an asset to the trash (reversible). References to it are marked broken at submit and publish; restore it with restore_asset or delete it for good from the program.",
    scope: "write",
    inputSchema: objectSchema({ assetId: { type: "string" } }, ["assetId"]),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) => {
      const assetId = requireString(args, "assetId");
      await context.client.request("DELETE", `/api/assets/${assetId}`);
      return { trashed: assetId };
    },
  },
  {
    name: "restore_asset",
    title: "Restore asset",
    description:
      "Takes an asset out of the trash so references become valid again. The file was never deleted; only the record status changes.",
    scope: "write",
    inputSchema: objectSchema({ assetId: { type: "string" } }, ["assetId"]),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "POST",
        `/api/assets/${requireString(args, "assetId")}/restore`,
      ),
  },
  {
    name: "generate_image",
    title: "Generate image",
    description:
      "Starts an image generation job and returns its id — poll it with get_image_job. The default provider runs on the ChatGPT subscription (~1 min); the local Qwen fallback takes 9–45 min, so read providerUsed. Pass a prompt or a referenceId with a stored recipe; altText, decorative, folderId and tags carry the asset metadata. Not idempotent: an idempotencyKey makes retries safe.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        prompt: { type: "string" },
        referenceId: { type: "string" },
        provider: { type: "string", enum: ["image-use", "comfyui", "off"] },
        width: { type: "number" },
        height: { type: "number" },
        steps: { type: "number" },
        seed: { type: "number" },
        filename: { type: "string" },
        altText: { type: "string" },
        decorative: { type: "boolean" },
        folderId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        idempotencyKey: { type: "string" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const body: Record<string, unknown> = {};
      const prompt = optionalString(args, "prompt");
      if (prompt !== undefined) body.prompt = prompt;
      const referenceId = optionalString(args, "referenceId");
      if (referenceId !== undefined) body.referenceId = referenceId;
      const provider = optionalString(args, "provider");
      if (provider !== undefined) body.provider = provider;
      for (const key of ["width", "height", "steps", "seed"]) {
        const value = optionalNumber(args, key);
        if (value !== undefined) body[key] = value;
      }
      const filename = optionalString(args, "filename");
      if (filename !== undefined) body.filename = filename;
      const altText = optionalString(args, "altText");
      if (altText !== undefined) body.altText = altText;
      const decorative = optionalBoolean(args, "decorative");
      if (decorative !== undefined) body.decorative = decorative;
      const folderId = optionalString(args, "folderId");
      if (folderId !== undefined) body.folderId = folderId;
      const tags = optionalStringArray(args, "tags");
      if (tags !== undefined) body.tags = tags;
      const idempotencyKey = optionalString(args, "idempotencyKey");
      if (idempotencyKey !== undefined) body.idempotencyKey = idempotencyKey;
      return context.client.request("POST", `/api/sites/${siteId}/images/jobs`, body);
    },
  },
  {
    name: "get_image_job",
    title: "Get image job",
    description:
      "Returns the status of an image job: status, providerUsed, assetId, the provider attempt history and timestamps. Poll it (at least every 60 s); succeeded hands over the assetId for the assetRef.",
    scope: "read",
    inputSchema: objectSchema({ jobId: { type: "string" } }, ["jobId"]),
    entity: (args) => `job:${String(args.jobId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/images/jobs/${requireString(args, "jobId")}`,
      ),
  },
  {
    name: "list_image_jobs",
    title: "List image jobs",
    description:
      "Lists the image jobs of a site (newest first), optionally filtered by status. Use it to coordinate parallel generations.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        status: {
          type: "string",
          enum: ["queued", "running", "succeeded", "failed", "canceled"],
        },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const status = optionalString(args, "status");
      const query =
        status === undefined ? "" : `?status=${encodeURIComponent(status)}`;
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/images/jobs${query}`,
      );
    },
  },
  {
    name: "list_collections",
    title: "List collections",
    description:
      "Lists the content collections of a site with slug, fields and supports flags. Start here to find the collectionId that get_collection and list_entries need.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        includeDeprecated: { type: "boolean" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const includeDeprecated = optionalBoolean(args, "includeDeprecated");
      const query = includeDeprecated === true ? "?includeDeprecated=true" : "";
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/collections${query}`,
      );
    },
  },
  {
    name: "get_collection",
    title: "Get collection",
    description:
      "Loads one collection with its field definitions (id, key, type, required, description). Read it before writing entries: cells are keyed by field id.",
    scope: "read",
    inputSchema: objectSchema({ collectionId: { type: "string" } }, [
      "collectionId",
    ]),
    entity: (args) => `collection:${String(args.collectionId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/collections/${requireString(args, "collectionId")}`,
      ),
  },
  {
    name: "list_entries",
    title: "List entries",
    description:
      "Lists the entries of a site with filters (collectionId, status, q, trashed) and sorting (sort, dir). With q the hits come back ranked by weight (title, then slug, then body), not by the sort field.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "published", "unpublished", "scheduled"],
        },
        trashed: { type: "boolean" },
        q: { type: "string" },
        sort: {
          type: "string",
          enum: ["updatedAt", "createdAt", "publishedAt", "title", "dateField"],
        },
        dir: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "number" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams();
      for (const key of ["collectionId", "status", "q", "sort", "dir"]) {
        const value = optionalString(args, key);
        if (value !== undefined) params.set(key, value);
      }
      const trashed = optionalBoolean(args, "trashed");
      if (trashed !== undefined) params.set("trashed", String(trashed));
      const limit = optionalNumber(args, "limit");
      if (limit !== undefined) params.set("limit", String(limit));
      const query = params.toString();
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/entries${query === "" ? "" : `?${query}`}`,
      );
    },
  },
  {
    name: "get_entry",
    title: "Get entry",
    description:
      "Loads one entry with its cells, slug, status and the baseVersion that update_entry expects. The version number also tells you how often the entry changed.",
    scope: "read",
    inputSchema: objectSchema({ entryId: { type: "string" } }, ["entryId"]),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/entries/${requireString(args, "entryId")}`,
      ),
  },
  {
    name: "create_entry",
    title: "Create entry",
    description:
      "Creates a draft entry in a collection. Cells are keyed by field id (see get_collection) and may stay incomplete; required fields are checked at publish. Without a slug it is derived from the title field. Pass an idempotencyKey to make a retry return the first result instead of creating a duplicate.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        cells: { type: "object" },
        slug: { type: "string" },
        idempotencyKey: { type: "string" },
      },
      ["siteId", "collectionId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const cells =
        args.cells === undefined ? undefined : requireRecord(args, "cells");
      const slug = optionalString(args, "slug");
      const idempotencyKey = optionalString(args, "idempotencyKey");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/entries`, {
        collectionId: requireString(args, "collectionId"),
        ...(cells === undefined ? {} : { cells }),
        ...(slug === undefined ? {} : { slug }),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "update_entry",
    title: "Update entry",
    description:
      "Writes cells, slug or status of an entry. baseVersion from get_entry is mandatory; a conflict error means: reload the entry and retry. Cells are merged per field, null clears a field.",
    scope: "write",
    inputSchema: objectSchema(
      {
        entryId: { type: "string" },
        baseVersion: { type: "number" },
        cells: { type: "object" },
        slug: { type: "string" },
        status: { type: "string", enum: ["draft", "unpublished", "scheduled"] },
        scheduledAt: { type: "string" },
      },
      ["entryId", "baseVersion"],
    ),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const entryId = requireString(args, "entryId");
      const cells =
        args.cells === undefined ? undefined : requireRecord(args, "cells");
      const slug = optionalString(args, "slug");
      const status = optionalString(args, "status");
      const scheduledAt = optionalString(args, "scheduledAt");
      const name = await context.client.tokenName();
      return context.client.request("PUT", `/api/entries/${entryId}`, {
        baseVersion: requireNumber(args, "baseVersion"),
        ...(cells === undefined ? {} : { cells }),
        ...(slug === undefined ? {} : { slug }),
        ...(status === undefined ? {} : { status }),
        ...(scheduledAt === undefined ? {} : { scheduledAt }),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "publish_entry",
    title: "Publish entry",
    description:
      "Publishes an entry: validates required and unique fields, writes an immutable version, records the 301 redirect when the slug changed and triggers the re-bake of the affected routes.",
    scope: "write",
    inputSchema: objectSchema(
      {
        entryId: { type: "string" },
        baseVersion: { type: "number" },
      },
      ["entryId"],
    ),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const entryId = requireString(args, "entryId");
      const baseVersion = optionalNumber(args, "baseVersion");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/entries/${entryId}/publish`, {
        ...(baseVersion === undefined ? {} : { baseVersion }),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "delete_entry",
    title: "Delete entry",
    description:
      "Moves an entry to the trash (reversible) and drops its route from the bake. Nothing is deleted for good — restore it with restore_entry.",
    scope: "write",
    inputSchema: objectSchema({ entryId: { type: "string" } }, ["entryId"]),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const entryId = requireString(args, "entryId");
      const name = await context.client.tokenName();
      await context.client.request("DELETE", `/api/entries/${entryId}`, {
        author: { kind: "agent", id: name, label: name },
      });
      return { trashed: entryId };
    },
  },
  {
    name: "restore_entry",
    title: "Restore entry",
    description:
      "Takes an entry out of the trash. Fails with a conflict if another live entry took over its slug in the meantime.",
    scope: "write",
    inputSchema: objectSchema({ entryId: { type: "string" } }, ["entryId"]),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const name = await context.client.tokenName();
      return context.client.request(
        "POST",
        `/api/entries/${requireString(args, "entryId")}/restore`,
        { author: { kind: "agent", id: name, label: name } },
      );
    },
  },
  {
    name: "restore_entry_version",
    title: "Restore entry version",
    description:
      "Copies a published version into the draft (append-only, publishes nothing). Version ids come from the entry timeline; the next publish writes a new version.",
    scope: "write",
    inputSchema: objectSchema(
      {
        entryId: { type: "string" },
        versionId: { type: "string" },
      },
      ["entryId", "versionId"],
    ),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const name = await context.client.tokenName();
      return context.client.request(
        "POST",
        `/api/entries/${requireString(args, "entryId")}/restore-version/${requireString(args, "versionId")}`,
        { author: { kind: "agent", id: name, label: name } },
      );
    },
  },
  {
    name: "search_entries",
    title: "Search entries",
    description:
      "Full-text search across the entries of a site, ranked by weight (title A, slug B, body C) and date. Returns the hits with their score; narrow with collectionId or status.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        q: { type: "string" },
        collectionId: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "published", "unpublished", "scheduled"],
        },
        limit: { type: "number" },
      },
      ["siteId", "q"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const collectionId = optionalString(args, "collectionId");
      const status = optionalString(args, "status");
      const limit = optionalNumber(args, "limit");
      return context.client.request(
        "POST",
        `/api/sites/${siteId}/entries/search`,
        {
          q: requireString(args, "q"),
          ...(collectionId === undefined ? {} : { collectionId }),
          ...(status === undefined ? {} : { status }),
          ...(limit === undefined ? {} : { limit }),
        },
      );
    },
  },
  {
    name: "list_submissions",
    title: "List submissions",
    description:
      "Lists the submissions of a collection as a flat inbox view (columns + rows mapped to their field labels). Submissions are ordinary entries, so list_entries, get_entry and search_entries work on them too; this view is the labelled inbox for form data.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        limit: { type: "number" },
      },
      ["siteId", "collectionId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams({
        collectionId: requireString(args, "collectionId"),
      });
      const limit = optionalNumber(args, "limit");
      if (limit !== undefined) params.set("limit", String(limit));
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/submissions?${params.toString()}`,
      );
    },
  },
  {
    name: "analyze_reference",
    title: "Analyze reference",
    description:
      "Starts the full design analysis of a reference URL: capture → deterministic extraction (frequency-ranked tokens with Belegstellen) → AI classification → design profile. Blocked sites fail with a clear cause; pass snapshot.html (saved page source, optional computed samples/motion) for the fallback with a reduced profile. Returns the reference with status, progress, families and the profile.",
    scope: "write",
    inputSchema: objectSchema(
      {
        url: { type: "string" },
        name: { type: "string" },
        wait: { type: "boolean" },
        snapshot: { type: "object" },
      },
      ["url"],
    ),
    entity: (args) => `reference:${String(args.url ?? "")}`,
    handler: async (context, args) => {
      const url = requireString(args, "url");
      const name = optionalString(args, "name");
      const wait = optionalBoolean(args, "wait");
      const snapshot = args.snapshot === undefined ? undefined : requireRecord(args, "snapshot");
      const tokenName = await context.client.tokenName();
      return context.client.request("POST", "/api/references", {
        url,
        author: { kind: "agent", id: tokenName, label: tokenName },
        ...(name === undefined ? {} : { name }),
        ...(wait === undefined ? {} : { wait }),
        ...(snapshot === undefined ? {} : { snapshot }),
      });
    },
  },
  {
    name: "list_references",
    title: "List references",
    description:
      "Listet die Referenzen der Bibliothek als Karten (Name, Quell-URL, Status, Familien, Sammlung, Vokabular, Projekt-Nutzung) und dazu die Sammlungen mit Zählern sowie die Fußzeilenzahl der Ansicht. Filter: q (Suche über Titel, Familie, Notiz, Vokabular und Sammlungsnamen), family (Taxonomie), status (analyzing|ready|failed), collection (Sammlungs-id oder none für Referenzen ohne Sammlung); sort ist newest (Standard) oder name. Nutze get_reference für das volle Profil und get_reference_brief für den Brief.",
    scope: "read",
    inputSchema: objectSchema({
      q: { type: "string" },
      family: { type: "string" },
      status: { type: "string", enum: ["analyzing", "ready", "failed"] },
      collection: { type: "string" },
      sort: { type: "string", enum: ["newest", "name"] },
    }),
    handler: async (context, args) => {
      const params = new URLSearchParams();
      for (const key of ["q", "family", "status", "collection", "sort"]) {
        const value = optionalString(args, key);
        if (value !== undefined) params.set(key, value);
      }
      const query = params.toString();
      return context.client.request(
        "GET",
        `/api/references${query === "" ? "" : `?${query}`}`,
      );
    },
  },
  {
    name: "get_reference",
    title: "Get reference",
    description:
      "Loads one reference with its design profile: tokens (with frequency and Belegstellen), type scale, families, vocabulary, components, composition rules (constants/never), motion recipes mapped to the presets, evidence with confidence levels and the machine-readable style brief. Read it before building in the reference's style.",
    scope: "read",
    inputSchema: objectSchema({ referenceId: { type: "string" } }, ["referenceId"]),
    entity: (args) => `reference:${String(args.referenceId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/references/${requireString(args, "referenceId")}`,
      ),
  },
  {
    name: "apply_reference",
    title: "Apply reference",
    description:
      "Assigns a reference to a project per scale (color/type/motion/rest; default: the reference for everything) and returns the derived theme draft (scale inputs, fonts, motion) plus its round-trip verification. Applying never changes the current bake — write the draft with update_theme when it should take effect.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        referenceId: { type: "string" },
        scales: {
          type: "array",
          items: { type: "string", enum: ["color", "type", "motion", "rest"] },
          minItems: 1,
        },
      },
      ["siteId", "referenceId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const referenceId = requireString(args, "referenceId");
      const scales = optionalStringArray(args, "scales");
      const tokenName = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/references`, {
        referenceId,
        author: { kind: "agent", id: tokenName, label: tokenName },
        ...(scales === undefined ? {} : { scales }),
      });
    },
  },
  {
    name: "list_reference_collections",
    title: "List reference collections",
    description:
      "Listet die Sammlungen der Referenz-Bibliothek mit Beschreibung, Farbe, deployFor, Vokabular, risk, Bildrezept und Zähler der zugeordneten Referenzen. kind=collection für die eigenen Sammlungen, kind=style für den Stil-Katalog (18 Familien mit Erkennungsmerkmalen, Beispielseiten, Warnung und Lizenzhinweis). Die collectionId passt in list_references, assign_reference_to_collection und get_reference_brief.",
    scope: "read",
    inputSchema: objectSchema({
      kind: { type: "string", enum: ["collection", "style"] },
    }),
    handler: async (context, args) => {
      const kind = optionalString(args, "kind");
      return context.client.request(
        "GET",
        `/api/reference-collections${kind === undefined ? "" : `?kind=${kind}`}`,
      );
    },
  },
  {
    name: "create_reference_collection",
    title: "Create reference collection",
    description:
      "Legt eine Sammlung der Referenz-Bibliothek an: name ist Pflicht, description, deployFor, vocabulary, risk, accent, imageStyle, recognize, examples (je name und url), warning, kind und position sind optional. kind=style legt einen Eintrag des Stil-Katalogs an. Nutze list_reference_collections für die bestehenden Sammlungen und assign_reference_to_collection, um Referenzen zuzuordnen. idempotencyKey lässt einen Retry die erste Antwort liefern statt eines Duplikats.",
    scope: "write",
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        description: { type: "string" },
        deployFor: { type: "string" },
        vocabulary: { type: "array", items: { type: "string" } },
        risk: { type: "string" },
        accent: { type: "string" },
        imageStyle: { type: "string" },
        recognize: { type: "array", items: { type: "string" } },
        examples: { type: "array", items: { type: "object" } },
        warning: { type: "string" },
        kind: { type: "string", enum: ["collection", "style"] },
        position: { type: "number" },
        idempotencyKey: { type: "string" },
      },
      ["name"],
    ),
    entity: (args) => `collection:${String(args.name ?? "")}`,
    handler: async (context, args) => {
      const name = requireString(args, "name");
      const description = optionalString(args, "description");
      const deployFor = optionalString(args, "deployFor");
      const vocabulary = optionalStringArray(args, "vocabulary");
      const risk = optionalString(args, "risk");
      const accent = optionalString(args, "accent");
      const imageStyle = optionalString(args, "imageStyle");
      const recognize = optionalStringArray(args, "recognize");
      const examples =
        args.examples === undefined ? undefined : requireArray(args, "examples");
      const warning = optionalNullableString(args, "warning");
      const kind = optionalString(args, "kind");
      const position = optionalNumber(args, "position");
      const idempotencyKey = optionalString(args, "idempotencyKey");
      return context.client.request("POST", "/api/reference-collections", {
        name,
        ...(description === undefined ? {} : { description }),
        ...(deployFor === undefined ? {} : { deployFor }),
        ...(vocabulary === undefined ? {} : { vocabulary }),
        ...(risk === undefined ? {} : { risk }),
        ...(accent === undefined ? {} : { accent }),
        ...(imageStyle === undefined ? {} : { imageStyle }),
        ...(recognize === undefined ? {} : { recognize }),
        ...(examples === undefined ? {} : { examples }),
        ...(warning === undefined ? {} : { warning }),
        ...(kind === undefined ? {} : { kind }),
        ...(position === undefined ? {} : { position }),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
    },
  },
  {
    name: "assign_reference_to_collection",
    title: "Assign reference to collection",
    description:
      "Ordnet eine Referenz einer Sammlung zu (collectionId) oder löst die Zuordnung wieder, indem collectionId null ist. Eine Referenz trägt genau eine Sammlung; der alte Stand bleibt in der Referenz erhalten, nur die Zuordnung wechselt. Nutze list_reference_collections für die Sammlungs-ids.",
    scope: "write",
    inputSchema: objectSchema(
      {
        referenceId: { type: "string" },
        collectionId: { type: ["string", "null"] },
      },
      ["referenceId", "collectionId"],
    ),
    entity: (args) => `reference:${String(args.referenceId ?? "")}`,
    handler: async (context, args) => {
      const referenceId = requireString(args, "referenceId");
      const collectionId = optionalNullableString(args, "collectionId");
      if (collectionId === undefined) {
        throw new SenifyError("validation", 'Missing "collectionId"', {
          field: "collectionId",
          suggestion:
            'Pass a collection id from list_reference_collections, or null to remove the assignment.',
        });
      }
      return context.client.request("PATCH", `/api/references/${referenceId}`, {
        collectionId,
      });
    },
  },
  {
    name: "get_reference_brief",
    title: "Get reference brief",
    description:
      "Baut den Design-Brief im Text des Vorbilds. referenceId liefert den Einzelbrief samt Bild-Prompt, referenceIds (bis 12) den Sammelbrief für den Vergleich, collectionId den Sammlungs- oder Stil-Brief samt Vokabular. Haus-DNA und Projekt-Notizen kommen aus den Einstellungen; status sagt, ob sie enthalten sind. Genau eine der drei Eingaben angeben.",
    scope: "read",
    inputSchema: objectSchema({
      referenceId: { type: "string" },
      referenceIds: { type: "array", items: { type: "string" }, minItems: 1 },
      collectionId: { type: "string" },
    }),
    entity: (args) =>
      args.collectionId === undefined
        ? `reference:${String(args.referenceId ?? "")}`
        : `collection:${String(args.collectionId)}`,
    handler: async (context, args) => {
      const referenceId = optionalString(args, "referenceId");
      const collectionId = optionalString(args, "collectionId");
      const referenceIds =
        args.referenceIds === undefined ? undefined : requireArray(args, "referenceIds");
      const given = [referenceId, collectionId, referenceIds].filter(
        (value) => value !== undefined,
      ).length;
      if (given !== 1) {
        throw new SenifyError(
          "validation",
          "Pass exactly one of referenceId, referenceIds or collectionId",
          {
            field: "referenceId",
            suggestion:
              "referenceId for a single brief, referenceIds for a combined brief, collectionId for a collection or style brief.",
          },
        );
      }
      if (collectionId !== undefined) {
        return context.client.request(
          "GET",
          `/api/reference-collections/${collectionId}/brief`,
        );
      }
      if (referenceId !== undefined) {
        return context.client.request("GET", `/api/references/${referenceId}/brief`);
      }
      return context.client.request("POST", "/api/references/brief", {
        referenceIds,
      });
    },
  },
  {
    name: "plan_redesign",
    title: "Plan redesign",
    description:
      "Das Redesign-Paket für eine Seite im Stil von ein bis drei Referenzen: Inhalts-Outline der Seite, je Referenz der abgeleitete Theme-Patch (für update_theme), die Vorschau der Skalenwerte, die Gegenprobe, Design.md/Guidelines/Komponenten, Vokabular, Regeln und die Schrittfolge. Ablauf: plan_redesign → je Referenz duplicate_site → update_theme mit dem themePatch → Seite anpassen (apply_mutations) → create_preview → submit_for_review. Eine Referenz ohne Profil (reiner Bild-Upload) wird mit Hinweis abgelehnt.",
    scope: "read",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        referenceIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
      },
      ["pageId", "referenceIds"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const referenceIds = requireArray(args, "referenceIds").map((value) => {
        if (typeof value !== "string" || value.trim() === "") {
          throw new SenifyError("validation", '"referenceIds" must contain ids', {
            field: "referenceIds",
            suggestion: "Bis zu drei Referenz-ids übergeben.",
          });
        }
        return value;
      });
      return context.client.request(
        "GET",
        `/api/pages/${pageId}/redesign-package?referenceIds=${encodeURIComponent(
          referenceIds.join(","),
        )}`,
      );
    },
  },
];

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}
