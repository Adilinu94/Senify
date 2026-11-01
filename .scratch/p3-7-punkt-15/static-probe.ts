// Belegt: der statische Capture (Server-HTML) trägt die Handy-Kopien des
// Hero-Namens („nobu" / „naga"), der gesetzte Browser-DOM nicht.
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/static-probe.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";
import { runImport } from "../../packages/framer-import/src/index.ts";

const SOURCE = "https://unifiersofjapan.framer.website/";
const out = ".scratch/p3-7-punkt-15/static-bake";
let counter = 0;
const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
  counter += 1;
  const assetId = `up-${counter}`;
  uploads.push({ assetId, filename, data });
  return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
};

const run = await runImport({ source: { kind: "url", url: SOURCE }, mode: "fidelity", capture: "static", uploader });
const patch = fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? []);
const assets = Object.fromEntries(
  uploads.map((upload) => [upload.assetId, { src: `/assets/${upload.assetId}/${upload.filename}`, width: null, height: null }]),
);
const theme = mergeThemePatch(defaultTheme(), patch.fonts === undefined ? {} : { fonts: patch.fonts });
const resolved = resolveTheme(theme);
mkdirSync(out, { recursive: true });
await bakeSite(
  {
    siteName: "unifiersofjapan",
    baseUrl: "https://preview.local",
    breakpoints: run.breakpoints ?? undefined,
    pages: [{ id: "p", path: "/", title: "unifiersofjapan", tree: editorDocumentToNodeTree(run.mapped.document) }],
    themeCss: emitCss(resolved),
    styleRules: run.mapped.rules,
    assets,
    motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
    aeo: false,
  },
  { outDir: out, selfContained: true },
);
for (const upload of uploads) {
  const assetDir = join(out, "assets", upload.assetId);
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, upload.filename), upload.data);
}
console.log(`gebaut: ${out}, ${uploads.length} Assets`);
