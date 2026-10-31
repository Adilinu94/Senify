// Die Werkzeuge der Veroeffentlichung und des Betriebs (R12-Schnitt): Vorschau
// bauen, zur Pruefung einreichen, Rueckmeldung lesen, Release veroeffentlichen,
// zurueckrollen und lesen, Bake-Jobs und Auslieferungen samt Ziel-Einstellungen.
//
// Die 12 Werkzeuge standen zusammenhaengend in `tools.ts`. Sie teilen den Begriff
// des Release: eine Vorschau ist ein echter Bau, eine Pruefung haengt daran, und
// eine Auslieferung ohne veroeffentlichtes Release gibt es nicht. Die Reihenfolge
// in `RELEASE_TOOLS` ist die Reihenfolge im Manifest.

import {
  objectSchema,
  optionalNullableString,
  optionalString,
  pagingQuery,
  requireString,
} from "./tools-support.ts";
import { CHECKS_SCHEMA, PREVIEW_SCHEMA, RELEASE_RESULT_SCHEMA, REVIEW_SCHEMA } from "./tools-schemas.ts";
import type { ToolDefinition } from "./tools.ts";

/** Die Werkzeuge der Veroeffentlichung und des Betriebs. */
export const RELEASE_TOOLS: ToolDefinition[] = [
  {
    name: "create_preview",
    title: "Create preview",
    description:
      "Builds a real draft build of the site and returns a signed preview URL (30 days). Use it to check your work visually before submitting for review.",
    scope: "write",
    outputSchema: {
      type: "object",
      properties: { preview: PREVIEW_SCHEMA, url: { type: "string" } },
      required: ["preview", "url"],
      additionalProperties: true,
    },
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
    outputSchema: {
      type: "object",
      properties: {
        review: REVIEW_SCHEMA,
        preview: PREVIEW_SCHEMA,
        checks: CHECKS_SCHEMA,
      },
      required: ["review", "checks"],
      additionalProperties: true,
    },
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
      "Reads a review item: status, thread (the operator's notes), structure diff and immutable import reports. Call it after a submit to see whether changes were requested; newer feedback means new work.",
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
    outputSchema: RELEASE_RESULT_SCHEMA,
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
    outputSchema: RELEASE_RESULT_SCHEMA,
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
    name: "list_releases",
    title: "List releases",
    description:
      "Lists a site's releases (newest first) with the active release id. Each release carries its manifest: renderer version, build hash and the style registry snapshot it was baked with (rollback restores it). Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/releases${pagingQuery(args)}`,
      ),
  },
  {
    name: "get_release",
    title: "Get release",
    description:
      "Loads one release with its page revisions, theme snapshot and manifest (renderer version, build hash, restored-from).",
    scope: "read",
    inputSchema: objectSchema({ releaseId: { type: "string" } }, ["releaseId"]),
    entity: (args) => `release:${String(args.releaseId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/releases/${requireString(args, "releaseId")}`,
      ),
  },
  {
    name: "list_bake_jobs",
    title: "List re-bake jobs",
    description:
      "Lists the durable re-bake jobs of a site (newest first): content changes enqueue them, a worker re-bakes the active release and records done/failed with attempts, next attempt time and the last error. Use it to check why a published content change is not live yet. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/bake-jobs${pagingQuery(args)}`,
      ),
  },
  {
    name: "deploy_site",
    title: "Deploy site",
    description:
      'Delivers the active release\'s build. Provider "static" copies into a target directory (staging + swap, a failed deploy leaves the previous site untouched); provider "netlify" ships the build through the Netlify API and provider "vercel" through the Vercel deployments API (file list with SHA1, upload of missing files, poll until ready) — the target (site id / project id + token) sits in the deploy settings (set_deploy_settings). Returns the deployment record with file count and size; for netlify and vercel the target carries the live deploy URL. Needs the publish scope.',
    scope: "publish",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        provider: { type: "string", enum: ["static", "netlify", "vercel"] },
        targetDir: { type: "string" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const provider = optionalString(args, "provider") ?? "static";
      if (provider === "static") {
        return context.client.request(
          "POST",
          `/api/sites/${siteId}/deployments`,
          {
            provider,
            targetDir: requireString(args, "targetDir"),
          },
        );
      }
      return context.client.request(
        "POST",
        `/api/sites/${siteId}/deployments`,
        {
          provider,
        },
      );
    },
  },
  {
    name: "get_deploy_settings",
    title: "Get deploy settings",
    description:
      "Reads the deploy settings of a site: the provider (static, netlify or vercel), the Netlify site id, the Vercel project id and whether tokens are stored (the tokens themselves never leave the engine).",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/deploy-settings`,
      ),
  },
  {
    name: "set_deploy_settings",
    title: "Set deploy settings",
    description:
      "Writes the deploy settings of a site: provider (static|netlify|vercel), netlifySiteId + netlifyToken or vercelProjectId + vercelToken (a new token is encrypted engine-side and never returned; null clears it; omitting keeps it). The chosen provider needs both its id and its token before deploy_site can deliver. Read the settings with get_deploy_settings.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        provider: { type: "string", enum: ["static", "netlify", "vercel"] },
        netlifySiteId: { type: ["string", "null"] },
        netlifyToken: { type: ["string", "null"] },
        vercelProjectId: { type: ["string", "null"] },
        vercelToken: { type: ["string", "null"] },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const provider = optionalString(args, "provider");
      const netlifySiteId = optionalNullableString(args, "netlifySiteId");
      const netlifyToken = optionalNullableString(args, "netlifyToken");
      const vercelProjectId = optionalNullableString(args, "vercelProjectId");
      const vercelToken = optionalNullableString(args, "vercelToken");
      return context.client.request(
        "PUT",
        `/api/sites/${siteId}/deploy-settings`,
        {
          ...(provider === undefined ? {} : { provider }),
          ...(netlifySiteId === undefined ? {} : { netlifySiteId }),
          ...(netlifyToken === undefined ? {} : { netlifyToken }),
          ...(vercelProjectId === undefined ? {} : { vercelProjectId }),
          ...(vercelToken === undefined ? {} : { vercelToken }),
        },
      );
    },
  },
  {
    name: "list_deployments",
    title: "List deployments",
    description:
      "Lists a site's deployments (newest first) with status, target, file count and size. Use it to see where the site was delivered and whether the last deploy succeeded.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/deployments`,
      ),
  },
];
