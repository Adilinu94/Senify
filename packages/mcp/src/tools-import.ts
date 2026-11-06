// Die Import-Werkzeuge (R12-Schnitt): eine Framer-Seite importieren und den
// Bericht eines Import-Jobs lesen.
//
// Beide Werkzeuge standen zusammenhaengend am Ende von `tools.ts`. Sie teilen
// den Import-Job: der eine legt ihn an, der andere liest ihn - und die
// Reihenfolge in `IMPORT_TOOLS` ist die Reihenfolge im Manifest.

import { SenifyError } from "@senify/core";
import { prepareMirrorSite } from "@senify/framer-import";
import { exportFramerSite } from "./framer-export.ts";
import { importFramerSite } from "./framer-site-import.ts";
import {
  objectSchema,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireString,
} from "./tools-support.ts";
import { snapshotUnframer } from "./unframer.ts";
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
        sourcePagePath: { type: "string" },
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
        mode: { type: "string", enum: ["dna", "fidelity"] },
        idempotencyKey: { type: "string" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const url = optionalString(args, "url");
      const rootDir = optionalString(args, "rootDir");
      const sourcePagePath = optionalString(args, "sourcePagePath");
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
      const mode = optionalString(args, "mode");
      const idempotencyKey = optionalString(args, "idempotencyKey");
      return context.client.request(
        "POST",
        `/api/sites/${siteId}/imports/framer`,
        {
          source: {
            ...(url === undefined ? {} : { url }),
            ...(rootDir === undefined ? {} : { rootDir }),
            ...(sourcePagePath === undefined ? {} : { page: sourcePagePath }),
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
          ...(mode === undefined ? {} : { mode }),
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
  {
    name: "snapshot_unframer_project",
    title: "Save Unframer project locally",
    description:
      "Reads Framer page and component structure and all CMS items through the Unframer MCP connection, verifies the published source URL, and saves a local snapshot without the secret URL. The snapshot is an input for a future editable conversion, not a runtime-free website.",
    scope: "write",
    inputSchema: objectSchema(
      {
        secretUrl: { type: "string" },
        sourceUrl: { type: "string" },
        outputDir: { type: "string" },
      },
      ["secretUrl", "sourceUrl", "outputDir"],
    ),
    entity: () => "unframer-snapshot",
    handler: async (_context, args) =>
      snapshotUnframer({
        secretUrl: requireString(args, "secretUrl"),
        sourceUrl: requireString(args, "sourceUrl"),
        outputDir: requireString(args, "outputDir"),
      }),
  },
  {
    name: "prepare_framer_export",
    title: "Prepare a multi-page Framer export",
    description:
      "Captures structured HTML export pages and downloads supported assets to a new local folder, including a site-ir.json and failure report. This is an import input, not a complete editable site or a verified runtime-free build. Flattened FramerExport subpages are flagged as unprocessed.",
    scope: "write",
    inputSchema: objectSchema(
      {
        rootDir: { type: "string" },
        outputDir: { type: "string" },
        unframerSnapshot: { type: "string" },
      },
      ["rootDir", "outputDir"],
    ),
    entity: () => "framer-site-preparation",
    handler: async (_context, args) => {
      const unframerSnapshot = optionalString(args, "unframerSnapshot");
      const result = await prepareMirrorSite({
        rootDir: requireString(args, "rootDir"),
        outputDir: requireString(args, "outputDir"),
        ...(unframerSnapshot === undefined ? {} : { unframerSnapshot }),
      });
      return {
        outputDir: result.outputDir,
        pages: result.pages,
        blockedPages: result.blockedPages,
        ignoredFlattenedPages: result.ignoredFlattenedPages,
        snapshot: result.snapshot,
        downloadedAssets: result.assets.downloads.length,
        fonts: result.assets.fonts.length,
        failedAssets: result.assets.failed,
        runtimeFreeVerified: false,
      };
    },
  },
  {
    name: "export_framer_site",
    title: "Export Framer site locally",
    description:
      "Runs FramerExport on a published URL and saves a local mirror in a new output folder. The mirror can contain Framer runtime code; use import_framer_page with rootDir to begin conversion into editable Senify content.",
    scope: "write",
    inputSchema: objectSchema(
      {
        url: { type: "string" },
        outputDir: { type: "string" },
        subpages: { type: "boolean" },
      },
      ["url", "outputDir"],
    ),
    entity: () => "framer-export",
    handler: async (_context, args) => {
      const outputDir = await exportFramerSite({
        url: requireString(args, "url"),
        outputDir: requireString(args, "outputDir"),
        subpages: optionalBoolean(args, "subpages") ?? true,
      });
      return { outputDir, runtimeFreeVerified: false };
    },
  },
  {
    name: "import_framer_site",
    title: "Import a multi-page Framer export",
    description:
      "Analyze all pages in a structured local export, or create them one at a time when write is true. Flattened FramerExport subpages are expanded from the published sitemap through the live browser capture when sourceUrl is set. Existing pages are never overwritten. A partial run is reported explicitly; CMS bindings, animation fidelity and runtime freedom remain unverified.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        rootDir: { type: "string" },
        write: { type: "boolean" },
        sourceUrl: { type: "string" },
      },
      ["siteId", "rootDir"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}:framer-import`,
    handler: async (context, args) => {
      const sourceUrl = optionalString(args, "sourceUrl");
      return importFramerSite(context.client, {
        siteId: requireString(args, "siteId"),
        rootDir: requireString(args, "rootDir"),
        write: optionalBoolean(args, "write") ?? false,
        ...(sourceUrl === undefined ? {} : { sourceUrl }),
      });
    },
  },
];
