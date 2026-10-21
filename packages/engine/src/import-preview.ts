import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import { pageFileOf, runImport as runFramerImport, sourceAssetDeliveries, type ImportSource as FramerImportSource } from "@senify/framer-import";
import { bakeSite } from "@senify/renderer";
import type { Breakpoints } from "@senify/widget-engine/breakpoints";
import { editorDocumentToNodeTree } from "./imports.ts";
import { serveCaptureDir } from "./review-visuals.ts";
import { planImportBreakpoints } from "./site-breakpoints.ts";

// The preview of an import: the page as it is, next to the page as the import
// makes it, at the three widths the platform designs for. Nothing is written:
// the page is imported in memory, baked into a throwaway folder and
// photographed. The images are small (the browser scales them down itself) and
// travel as data URLs, so the dialog needs no second request per picture.

export type ImportPreviewShot = {
  breakpoint: string;
  // The viewport width both pages were laid out at.
  width: number;
  beforeHeight: number;
  afterHeight: number;
  before: string;
  after: string;
};

export type ImportPreview = { shots: ImportPreviewShot[] };

export type ImportPreviewRequest = {
  // Where the original page can be seen (a URL the browser can open).
  beforeUrl: string;
  // Where the baked import can be seen.
  afterUrl: string;
  // The servers the product started for this preview: the offline mirror (if
  // the source is a folder) and the baked page. They run on the loopback
  // interface, and the browser has to reach them - they are the only private
  // addresses the capture may open. The URL of the *source* is not on the
  // list: it is the user's, and it has to pass the same check as every other
  // address (ADR-0022).
  allowOrigins: string[];
};

export type ImportPreviewDriver = (request: ImportPreviewRequest) => Promise<ImportPreview>;

// Tablet at 900 px, inside Framer's tablet range (810–1199, or 810–1439) AND
// Senify's default one (640–1023). The import carries the source's breakpoints
// to a site that has none (ADR-0020), so 1024 would show the same layout on
// both sides there too — but a site that keeps its own pair would still show
// desktop at 1024 next to the original's tablet. 900 is inside every pair the
// import can end up with, so the picture never compares two different layouts.
const PREVIEW_WIDTHS = { tablet: 900 } as const;

// The production driver: the thumbnail capture of the analysis worker, loaded
// lazily so an engine without a browser still boots; the preview then fails
// with the clear message instead.
export function createImportPreviewDriver(): ImportPreviewDriver {
  return async ({ beforeUrl, afterUrl, allowOrigins }) => {
    const harness = await import("@senify/analysis-worker").catch(() => {
      throw new SenifyError("not_found", "Die Vorschau braucht @senify/analysis-worker (Playwright)", {
        field: "preview",
        suggestion: "Workspace-Abhängigkeiten installieren (pnpm install).",
      });
    });
    // The original plays its own motion; the import is shown settled, and the
    // baked page keeps its motion targets hidden until its runtime releases
    // them, so it gets the longer wait.
    const before = await harness.captureThumbnails({ url: beforeUrl, widths: PREVIEW_WIDTHS, motion: "live", settleMs: 1200, browser: { allowOrigins } });
    const after = await harness.captureThumbnails({ url: afterUrl, widths: PREVIEW_WIDTHS, motion: "off", settleMs: 2500, browser: { allowOrigins } });
    const shots: ImportPreviewShot[] = [];
    for (const shotBefore of before) {
      const shotAfter = after.find((candidate) => candidate.breakpoint === shotBefore.breakpoint);
      if (shotAfter === undefined) continue;
      shots.push({
        breakpoint: shotBefore.breakpoint,
        width: shotBefore.width,
        beforeHeight: shotBefore.pageHeight,
        afterHeight: shotAfter.pageHeight,
        before: `data:image/png;base64,${shotBefore.png.toString("base64")}`,
        after: `data:image/png;base64,${shotAfter.png.toString("base64")}`,
      });
    }
    return { shots };
  };
}

export type PreviewInput = {
  source: FramerImportSource;
  pagePath: string;
  mode: "dna" | "fidelity";
  // The site's own theme CSS and motion tokens: the unstyled parts of the page
  // take them.
  themeCss: string;
  motionTokens: { ease: Record<string, string>; baseDurationMs: number; baseStaggerMs: number };
  siteName: string;
  // What the site already has, so the preview bakes with the pair the write
  // would leave in force (`planImportBreakpoints`): its own pair, and whether it
  // holds pages other than the one the import writes. Absent: an empty site.
  site?: { breakpoints?: Breakpoints; otherPages: boolean };
  driver: ImportPreviewDriver;
};

// Import in memory, bake into a throwaway folder, photograph both pages.
export async function previewFramerImport(input: PreviewInput): Promise<ImportPreview> {
  const work = mkdtempSync(join(tmpdir(), "senify-import-preview-"));
  const closers: (() => Promise<void>)[] = [];
  // The servers this preview starts itself. The browser may reach them - they
  // run on the loopback interface - and nothing else private.
  const allowOrigins: string[] = [];
  try {
    let beforeUrl: string;
    if (input.source.kind === "url") {
      beforeUrl = input.source.url;
    } else if (input.source.kind === "mirror") {
      // The export folder, served, so the original renders with its own files.
      const server = await serveCaptureDir(input.source.rootDir);
      closers.push(server.close);
      allowOrigins.push(server.origin);
      const file = pageFileOf(input.source.rootDir, input.source.pagePath ?? "/");
      beforeUrl = `${server.origin}/${file.slice(input.source.rootDir.replace(/[/\\]+$/, "").length + 1).replace(/\\/g, "/")}`;
    } else {
      const folder = join(work, "original");
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "index.html"), input.source.html, "utf8");
      const server = await serveCaptureDir(folder);
      closers.push(server.close);
      allowOrigins.push(server.origin);
      beforeUrl = `${server.origin}/index.html`;
    }

    const run = await runFramerImport({ source: input.source, pagePath: input.pagePath, mode: input.mode });
    const plan = planImportBreakpoints({
      derived: run.breakpoints,
      site: input.site?.breakpoints,
      otherPages: input.site?.otherPages ?? false,
    });
    // The preview shows the page the import makes of the source. Without the
    // assets the pictures would stay empty and the preview would judge a page
    // the product never builds: the written import uploads its assets and the
    // bake delivers them, the preview has no asset store and keeps the
    // addresses of the source.
    const assets = sourceAssetDeliveries(run.document, beforeUrl);
    return await bakeAndShoot(input, run.mapped.document, run.mapped.rules, plan?.effective ?? input.site?.breakpoints, beforeUrl, work, closers, assets, allowOrigins);
  } finally {
    for (const close of closers.reverse()) await close().catch(() => undefined);
    rmSync(work, { recursive: true, force: true });
  }
}

async function bakeAndShoot(
  input: PreviewInput,
  document: Parameters<typeof editorDocumentToNodeTree>[0],
  rules: Parameters<typeof bakeSite>[0]["styleRules"],
  breakpoints: Breakpoints | undefined,
  beforeUrl: string,
  work: string,
  closers: (() => Promise<void>)[],
  assets: Record<string, string>,
  allowOrigins: string[],
): Promise<ImportPreview> {
  const out = join(work, "baked");
  await bakeSite(
    {
      siteName: input.siteName,
      baseUrl: "https://preview.local",
      ...(breakpoints === undefined ? {} : { breakpoints }),
      pages: [{ id: "preview", path: "/", title: input.siteName, tree: editorDocumentToNodeTree(document) }],
      themeCss: input.themeCss,
      ...(rules === undefined ? {} : { styleRules: rules }),
      assets,
      motionTokens: input.motionTokens,
      aeo: false,
    },
    { outDir: out, selfContained: true },
  );
  const server = await serveCaptureDir(out);
  closers.push(server.close);
  allowOrigins.push(server.origin);
  return input.driver({ beforeUrl, afterUrl: `${server.origin}/index.html`, allowOrigins });
}
