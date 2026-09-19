import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
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
      "Uploads a local file to the media library: asks for a signed upload URL, sends the bytes and returns the asset record. Identical bytes dedupe onto the existing asset instead of creating a second record.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        filePath: { type: "string" },
        altText: { type: "string" },
        decorative: { type: "boolean" },
        folderId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
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
      "Creates a draft entry in a collection. Cells are keyed by field id (see get_collection) and may stay incomplete; required fields are checked at publish. Without a slug it is derived from the title field.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        cells: { type: "object" },
        slug: { type: "string" },
      },
      ["siteId", "collectionId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const cells =
        args.cells === undefined ? undefined : requireRecord(args, "cells");
      const slug = optionalString(args, "slug");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/entries`, {
        collectionId: requireString(args, "collectionId"),
        ...(cells === undefined ? {} : { cells }),
        ...(slug === undefined ? {} : { slug }),
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
      "Legt eine Sammlung der Referenz-Bibliothek an: name ist Pflicht, description, deployFor, vocabulary, risk, accent, imageStyle, recognize, examples (je name und url), warning, kind und position sind optional. kind=style legt einen Eintrag des Stil-Katalogs an. Nutze list_reference_collections für die bestehenden Sammlungen und assign_reference_to_collection, um Referenzen zuzuordnen.",
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
];

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}
