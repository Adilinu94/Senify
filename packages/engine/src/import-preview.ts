import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import { pageFileOf, runImport as runFramerImport, type ImportSource as FramerImportSource } from "@senify/framer-import";
import { bakeSite } from "@senify/renderer";
import { editorDocumentToNodeTree } from "./imports.ts";
import { serveCaptureDir } from "./review-visuals.ts";

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
};

export type ImportPreviewDriver = (request: ImportPreviewRequest) => Promise<ImportPreview>;

// Tablet at 900 px, inside Framer's tablet range (810–1199) AND Senify's
// (below 1024); at 1024 the original shows its tablet layout while Senify still
// shows desktop, and the picture would compare two different layouts.
const PREVIEW_WIDTHS = { tablet: 900 } as const;

// The production driver: the thumbnail capture of the analysis worker, loaded
// lazily so an engine without a browser still boots; the preview then fails
// with the clear message instead.
export function createImportPreviewDriver(): ImportPreviewDriver {
  return async ({ beforeUrl, afterUrl }) => {
    const harness = await import("@senify/analysis-worker").catch(() => {
      throw new SenifyError("not_found", "Die Vorschau braucht @senify/analysis-worker (Playwright)", {
        field: "preview",
        suggestion: "Workspace-Abhängigkeiten installieren (pnpm install).",
      });
    });
    // The original plays its own motion; the import is shown settled, and the
    // baked page keeps its motion targets hidden until its runtime releases
    // them, so it gets the longer wait.
    const before = await harness.captureThumbnails({ url: beforeUrl, widths: PREVIEW_WIDTHS, motion: "live", settleMs: 1200 });
    const after = await harness.captureThumbnails({ url: afterUrl, widths: PREVIEW_WIDTHS, motion: "off", settleMs: 2500 });
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
  driver: ImportPreviewDriver;
};

// Import in memory, bake into a throwaway folder, photograph both pages.
export async function previewFramerImport(input: PreviewInput): Promise<ImportPreview> {
  const work = mkdtempSync(join(tmpdir(), "senify-import-preview-"));
  const closers: (() => Promise<void>)[] = [];
  try {
    let beforeUrl: string;
    if (input.source.kind === "url") {
      beforeUrl = input.source.url;
    } else if (input.source.kind === "mirror") {
      // The export folder, served, so the original renders with its own files.
      const server = await serveCaptureDir(input.source.rootDir);
      closers.push(server.close);
      const file = pageFileOf(input.source.rootDir, input.source.pagePath ?? "/");
      beforeUrl = `${server.origin}/${file.slice(input.source.rootDir.replace(/[/\\]+$/, "").length + 1).replace(/\\/g, "/")}`;
    } else {
      const folder = join(work, "original");
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "index.html"), input.source.html, "utf8");
      const server = await serveCaptureDir(folder);
      closers.push(server.close);
      beforeUrl = `${server.origin}/index.html`;
    }

    const run = await runFramerImport({ source: input.source, pagePath: input.pagePath, mode: input.mode });
    return await bakeAndShoot(input, run.mapped.document, run.mapped.rules, beforeUrl, work, closers);
  } finally {
    for (const close of closers.reverse()) await close().catch(() => undefined);
    rmSync(work, { recursive: true, force: true });
  }
}

async function bakeAndShoot(
  input: PreviewInput,
  document: Parameters<typeof editorDocumentToNodeTree>[0],
  rules: Parameters<typeof bakeSite>[0]["styleRules"],
  beforeUrl: string,
  work: string,
  closers: (() => Promise<void>)[],
): Promise<ImportPreview> {
  const out = join(work, "baked");
  await bakeSite(
    {
      siteName: input.siteName,
      baseUrl: "https://preview.local",
      pages: [{ id: "preview", path: "/", title: input.siteName, tree: editorDocumentToNodeTree(document) }],
      themeCss: input.themeCss,
      ...(rules === undefined ? {} : { styleRules: rules }),
      motionTokens: input.motionTokens,
      aeo: false,
    },
    { outDir: out, selfContained: true },
  );
  const server = await serveCaptureDir(out);
  closers.push(server.close);
  return input.driver({ beforeUrl, afterUrl: `${server.origin}/index.html` });
}
