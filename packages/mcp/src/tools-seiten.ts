// Die Seiten-Werkzeuge (R12-Schnitt): Seiten lesen, anlegen und ihr
// Lebenszyklus (Vorlage, Revision, Loeschen).
//
// Die sieben Werkzeuge standen nicht zusammenhaengend in `tools.ts` - zwischen
// Lesen und Anlegen lagen Theme, Release und Medien. Sie werden deshalb in drei
// Listen exportiert, deren Spreizungen an den alten Stellen stehen; die
// Reihenfolge im Manifest bleibt damit unveraendert. Der Gegenstand ist einer:
// das Dokument, an dem ein Agent arbeitet.

import { SenifyError } from "@senify/core";
import { pageOutline, selectNodes } from "./outline.ts";
import {
  listSchema,
  objectSchema,
  optionalNumber,
  optionalString,
  optionalStringArray,
  pageFor,
  pagingQuery,
  requireArray,
  requireString,
} from "./tools-support.ts";
import { PAGE_SCHEMA, OUTLINE_SCHEMA } from "./tools-schemas.ts";
import type { ToolDefinition } from "./tools.ts";

/** Seiten lesen: Liste, Gliederung, Knoten. */
export const PAGE_READ_TOOLS: ToolDefinition[] = [
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
];

/** Seiten anlegen und als Vorlage markieren. */
export const PAGE_CREATE_TOOLS: ToolDefinition[] = [
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
];

/** Der Lebenszyklus einer Seite: Revision zurueckholen, Seite loeschen. */
export const PAGE_LIFECYCLE_TOOLS: ToolDefinition[] = [
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
