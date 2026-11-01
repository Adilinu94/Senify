// Die Doku-Werkzeuge (R12-Schnitt): die Senify-Dokumentation durchsuchen und
// eine Seite als Markdown lesen.
//
// Beide Werkzeuge laden `@senify/docs-portal` erst zur Laufzeit - das Portal
// liest den Werkzeugkatalog aus diesem Paket, ein statischer Import waere ein
// Zyklus. Sie standen zusammenhaengend in `tools.ts`; die Reihenfolge in
// `DOCS_TOOLS` ist die Reihenfolge im Manifest.

import { SenifyError } from "@senify/core";
import { objectSchema, optionalNumber, requireString } from "./tools-support.ts";
import type { ToolDefinition } from "./tools.ts";

/** Die Werkzeuge der Dokumentation. */
export const DOCS_TOOLS: ToolDefinition[] = [
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
];
