import { SenifyError } from "@senify/core";
import {
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
import type { EngineClient } from "./client.ts";
import { pageOutline, selectNodes } from "./outline.ts";
import {
  listSchema,
  objectSchema,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  pageFor,
  pagingQuery,
  registry,
  requireArray,
  requireNumber,
  requireRecord,
  requireString,
  sectionInfo,
} from "./tools-support.ts";
import { BIBLIOTHEK_TOOLS } from "./tools-bibliothek.ts";
import { COMPONENT_TOOLS } from "./tools-komponenten.ts";
import { MEDIEN_TOOLS } from "./tools-medien.ts";
import { REFERENZ_TOOLS } from "./tools-referenzen.ts";
import { SITE_SCHEMA, PAGE_SCHEMA, OUTLINE_SCHEMA } from "./tools-schemas.ts";
import { RELEASE_TOOLS } from "./tools-release.ts";

export type ToolScope = "read" | "write" | "publish";

// Elicitation (E4 slice 2): ask the client for a missing or ambiguous
// parameter. The server wires this only when the client declared the
// elicitation capability; declined or unsupported resolves to undefined and
// the tool's own validation error stands.
export type ElicitRequest = {
  message: string;
  fields: { name: string; description: string; required?: boolean }[];
};

export type ToolContext = {
  client: EngineClient;
  elicit?: (request: ElicitRequest) => Promise<Record<string, unknown> | undefined>;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  inputSchema: Record<string, unknown>;
  // The JSON Schema of what the handler returns (P3-3, R8). The reading tools
  // carry one, and so do the writes whose result has a fixed shape a client
  // needs (the new id of a site, page, preview, review or release). A write
  // whose result is only a confirmation that depends on which write it was has
  // none: a wrong schema there would be a lie the client believes. The
  // handler's return value must validate against it, otherwise
  // `structuredContent` would disagree with the text the client already parses.
  outputSchema?: Record<string, unknown>;
  entity?: (args: Record<string, unknown>, result: unknown) => string | undefined;
  handler: (
    context: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
};


// The list schemas. Each engine route names its own list field — `sites`,
// `pages`, `assets` — so the key is a parameter rather than a guess. A generic
// `items` would have been a schema the code does not keep, and the server would
// (correctly) refuse to send the structure for every list tool.

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

const STATE_NAMES: readonly StyleState[] = [
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "disabled",
];

// The pseudo states of O11 (plus the two focus refinements), as the style
// routes spell them.
type StyleState = "hover" | "focus" | "focus-visible" | "focus-within" | "active" | "disabled";

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
      "Lists all website projects with id, name, slug and profile. Start here to discover the siteId other tools need. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema({ limit: { type: "number" }, offset: { type: "number" } }),
    outputSchema: listSchema("sites", SITE_SCHEMA),
    handler: async (context, args) =>
      context.client.request("GET", `/api/sites${pagingQuery(args)}`),
  },
  {
    name: "get_site",
    title: "Get site",
    description:
      "Loads one site with its profile and timestamps. Use it to confirm a siteId before writing.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    outputSchema: SITE_SCHEMA,
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
    outputSchema: SITE_SCHEMA,
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
      "Lists the pages of a site with path, title and draftVersion. Use it to find the pageId for get_page and apply_mutations. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema(
      { siteId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } },
      ["siteId"],
    ),
    outputSchema: listSchema("pages", PAGE_SCHEMA),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/pages${pagingQuery(args)}`,
      ),
  },
  {
    name: "get_page",
    title: "Get page outline",
    description:
      "Returns the outline of a page: top-level sections with id, type, variant and a short content summary plus the draftVersion needed for apply_mutations. Use get_nodes for full props.",
    scope: "read",
    inputSchema: objectSchema({ pageId: { type: "string" } }, ["pageId"]),
    outputSchema: OUTLINE_SCHEMA,
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
    name: "undo_batch",
    title: "Undo batches",
    description:
      "Agent undo: reverts the newest mutation batches of a page server-side. Every apply_mutations call is one batch in the page's audit log (list it with the audit route or get_page); send baseDraftVersion from get_page plus either steps (default 1) or the exact batchIds of the newest remaining batches. Only the newest remaining batches can be undone — an older one would replay against a state that no longer exists. A stale baseDraftVersion is a conflict: reload the page and retry. Each undo is itself audited (undoBatch); to redo, re-apply the original mutations.",
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        baseDraftVersion: { type: "number" },
        steps: { type: "number" },
        batchIds: { type: "array", items: { type: "string" } },
      },
      ["pageId", "baseDraftVersion"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const steps = optionalNumber(args, "steps");
      const batchIds = optionalStringArray(args, "batchIds");
      const body: Record<string, unknown> = {
        baseDraftVersion: requireNumber(args, "baseDraftVersion"),
      };
      if (steps !== undefined) body.steps = steps;
      if (batchIds !== undefined) body.batchIds = batchIds;
      return context.client.request("POST", `/api/pages/${pageId}/undo-batch`, body);
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
  ...COMPONENT_TOOLS,
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
      const rules = await context.client.request<{ rules: StyleRuleResponse[]; version: number }>(
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
          baseVersion: rules.version,
          author,
        });
      }
      const next =
        state === undefined
          ? { ...existing.styles, ...declared }
          : { ...(existing.states ?? {}), [state]: { ...(existing.states?.[state] ?? {}), ...declared } };
      return context.client.request("PATCH", `/api/sites/${siteId}/style-rules/${existing.id}`, {
        ...(state === undefined ? { styles: next } : { states: next }),
        baseVersion: rules.version,
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
        baseVersion: { type: "number" },
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
      const baseVersion = optionalNumber(args, "baseVersion");
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
        ...(baseVersion === undefined ? {} : { baseVersion }),
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
    outputSchema: PAGE_SCHEMA,
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
    name: "set_page_template",
    title: "Set page template",
    description:
      'Marks a page as a layout or collection (entry) template, assigns a page\'s layout, or removes the mark. kind "layout" wraps pages that pick it via layoutId (the label shown in lists is the page title); kind "collection" renders the detail routes of collectionIds (priority decides among several templates); kind "none" removes the mark. layoutId alone only changes the layout choice.',
    scope: "write",
    inputSchema: objectSchema(
      {
        pageId: { type: "string" },
        kind: { type: "string", enum: ["layout", "collection", "none"] },
        collectionIds: { type: "array", items: { type: "string" } },
        priority: { type: "number" },
        layoutId: { type: "string" },
      },
      ["pageId"],
    ),
    entity: (args) => `page:${String(args.pageId ?? "")}`,
    handler: async (context, args) => {
      const pageId = requireString(args, "pageId");
      const kind = optionalString(args, "kind");
      const layoutId = optionalString(args, "layoutId");
      const priority = optionalNumber(args, "priority");
      const collectionIds = optionalStringArray(args, "collectionIds");
      if (kind === undefined && layoutId === undefined) {
        throw new SenifyError("validation", "Nothing to change", {
          field: "kind",
          suggestion:
            'Pass kind ("layout" | "collection" | "none") and/or layoutId.',
        });
      }
      if (kind === "collection" && (collectionIds?.length ?? 0) === 0) {
        throw new SenifyError(
          "validation",
          "A collection template needs collectionIds",
          {
            field: "collectionIds",
            suggestion: "List the collections the entry template renders.",
          },
        );
      }
      const template =
        kind === undefined
          ? undefined
          : kind === "layout"
            ? { kind: "layout" }
            : kind === "collection"
              ? {
                  kind: "collection",
                  collectionIds: collectionIds ?? [],
                  ...(priority === undefined ? {} : { priority }),
                }
              : null;
      const name = await context.client.tokenName();
      return context.client.request("PUT", `/api/pages/${pageId}/template`, {
        ...(template === undefined ? {} : { template }),
        ...(layoutId === undefined ? {} : { layoutId }),
        author: { kind: "agent", id: name, label: name },
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
  ...RELEASE_TOOLS,
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
  ...MEDIEN_TOOLS,
  ...REFERENZ_TOOLS,
  {
    name: "set_design_contract",
    title: "Set design contract",
    description:
      "Setzt eine manuelle Design-DNA für das Projekt (constants/never/vocabulary); ein leerer Body löscht die DNA. Die never-Regeln gelten im Schreibpfad: Agenten-Schreibvorgänge, die sie verletzen, werden blockiert. Eine aus Referenzen abgeleitete DNA wird erst überschrieben, wenn du sie manuell setzt.",
    scope: "write",
    inputSchema: objectSchema({
      siteId: { type: "string" },
      constants: { type: "array", items: { type: "string" } },
      never: { type: "array", items: { type: "string" } },
      vocabulary: { type: "array", items: { type: "string" } },
    }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const constants = optionalStringArray(args, "constants");
      const never = optionalStringArray(args, "never");
      const vocabulary = optionalStringArray(args, "vocabulary");
      const body =
        constants === undefined && never === undefined && vocabulary === undefined
          ? {}
          : {
              ...(constants === undefined ? {} : { constants }),
              ...(never === undefined ? {} : { never }),
              ...(vocabulary === undefined ? {} : { vocabulary }),
            };
      return context.client.request(
        "PUT",
        `/api/sites/${siteId}/design-contract`,
        body,
      );
    },
  },
  ...BIBLIOTHEK_TOOLS,
  {
    name: "import_framer_page",
    title: "Import Framer page",
    description:
      "Imports a Framer page (published URL, local mirror folder or raw SSR-HTML) into a site: capture → normalize → map → report. Default is a dry run (report only); write: true creates the page (or writes into pageId) as ONE revision, appends the style rules with their framer-import origin and optionally applies the theme patch (applyTheme): the fonts plus the brand colour, the neutral tint and the body text size the page shows. A URL is read in Chromium first (runtime-built content and the other device builds included); without a working browser the run falls back to the SSR-HTML and reports that as a `capture-fallback` finding. `capture: \"static\"` skips Chromium, `capture: \"browser\"` is strict (an error instead of a fallback). Fonts are fetched and self-hosted (DSGVO); unreachable files surface as findings, never as silent drops.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        url: { type: "string" },
        rootDir: { type: "string" },
        html: { type: "string" },
        baseUrl: { type: "string" },
        pagePath: { type: "string" },
        pageId: { type: "string" },
        baseDraftVersion: { type: "number" },
        write: { type: "boolean" },
        applyTheme: { type: "boolean" },
        assets: { type: "string", enum: ["upload", "skip"] },
        fonts: { type: "string", enum: ["rewrite", "skip"] },
        capture: { type: "string", enum: ["static", "browser"] },
        idempotencyKey: { type: "string" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const url = optionalString(args, "url");
      const rootDir = optionalString(args, "rootDir");
      const html = optionalString(args, "html");
      const baseUrl = optionalString(args, "baseUrl");
      if (url === undefined && rootDir === undefined && html === undefined) {
        throw new SenifyError("validation", "Die Import-Quelle ist leer", {
          field: "source",
          suggestion: "url (live), rootDir (Mirror-Ordner) oder html (Markup) angeben.",
        });
      }
      const pagePath = optionalString(args, "pagePath");
      const pageId = optionalString(args, "pageId");
      const baseDraftVersion = optionalNumber(args, "baseDraftVersion");
      const write = optionalBoolean(args, "write");
      const applyTheme = optionalBoolean(args, "applyTheme");
      const assets = optionalString(args, "assets");
      const fonts = optionalString(args, "fonts");
      const capture = optionalString(args, "capture");
      const idempotencyKey = optionalString(args, "idempotencyKey");
      return context.client.request(
        "POST",
        `/api/sites/${siteId}/imports/framer`,
        {
          source: {
            ...(url === undefined ? {} : { url }),
            ...(rootDir === undefined ? {} : { rootDir }),
            ...(html === undefined ? {} : { html }),
            ...(baseUrl === undefined ? {} : { baseUrl }),
          },
          ...(pagePath === undefined ? {} : { pagePath }),
          ...(pageId === undefined ? {} : { pageId }),
          ...(baseDraftVersion === undefined ? {} : { baseDraftVersion }),
          ...(write === undefined ? {} : { write }),
          ...(applyTheme === undefined ? {} : { applyTheme }),
          ...(assets === undefined ? {} : { assets }),
          ...(fonts === undefined ? {} : { fonts }),
          ...(capture === undefined ? {} : { capture }),
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        },
      );
    },
  },
  {
    name: "get_import_report",
    title: "Get import report",
    description:
      "Reads one import job: status (queued/running/succeeded/failed) plus the full report when the run finished — score, node and declaration counts, assets (downloaded/deduped/failed, fonts), findings with evidence and the marquee candidates. The report is stored on the job, so polling does not re-run the import.",
    scope: "read",
    inputSchema: objectSchema({ jobId: { type: "string" } }, ["jobId"]),
    entity: (args) => `import:${String(args.jobId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/imports/${requireString(args, "jobId")}`,
      ),
  },
];

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}
