import { SenifyError } from "@senify/core";
import { createRegistry } from "@senify/registry";
import type { PropSpec, Registry, SectionDefinition } from "@senify/section-sdk";
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
    name: "create_page",
    title: "Create page",
    description:
      "Creates a page on a site and returns it with an empty node tree. The path defaults to a slug of the title; \"/\" is the home page.",
    scope: "write",
    inputSchema: objectSchema({
      siteId: { type: "string" },
      title: { type: "string" },
      path: { type: "string" },
    }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const title = optionalString(args, "title");
      const path = optionalString(args, "path");
      return context.client.request("POST", `/api/sites/${siteId}/pages`, {
        ...(title === undefined ? {} : { title }),
        ...(path === undefined ? {} : { path }),
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
];

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}
