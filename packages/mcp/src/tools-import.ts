// Die Import-Werkzeuge (R12-Schnitt): eine Framer-Seite importieren und den
// Bericht eines Import-Jobs lesen.
//
// Beide Werkzeuge standen zusammenhaengend am Ende von `tools.ts`. Sie teilen
// den Import-Job: der eine legt ihn an, der andere liest ihn - und die
// Reihenfolge in `IMPORT_TOOLS` ist die Reihenfolge im Manifest.

import { SenifyError } from "@senify/core";
import {
  objectSchema,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireString,
} from "./tools-support.ts";
import type { ToolDefinition } from "./tools.ts";

/** Die Werkzeuge des Imports. */
export const IMPORT_TOOLS: ToolDefinition[] = [
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
