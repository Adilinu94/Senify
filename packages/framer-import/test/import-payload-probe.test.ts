// Der wichtigste Gegenprobe-Lauf: WAS misst die Pixel-Differenz eigentlich?
//
// Fund beim Zerlegen des Scores: der Import bündelt eine Framer-Runtime als
// Payload (2.139 KB) und `editableShare` steht dann auf 0 % - der Release
// zeigt die ORIGINALSEITE, nicht den gemappten Baum. Meine 1,50 % von vorher
// messen also zum Teil Framer selbst. Das ist keine Faehigkeitsprobe.
//
// Dieser Lauf backt dieselbe Seite ZWEIMAL:
//   mit Payload   - was der Release wirklich zeigt (Wiedergabe-Treue)
//   ohne Payload  - der gemappte Baum allein (Mapping-Treue)
//
// Nur die zweite Zahl sagt, wie gut Senify eine Framer-Seite in seine eigenen
// Bausteine uebersetzt. Die erste sagt, wie gut die Uebernahme funktioniert.
import { listenReachable } from "@senify/core/net";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { captureScreenshots, diffScreenshots, VISUAL_VIEWPORTS, type Breakpoint } from "@senify/analysis-worker";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { runImport } from "@senify/framer-import";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";

const TARGET = process.env["SENIFY_IMPORT_LIVE_TARGET"];
const ORIGINAL_DIR = process.env["SENIFY_PROBE_ORIGINALS"];
const KEEP = process.env["SENIFY_IMPORT_KEEP_ARTIFACTS"] === "1";
const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm", ".ico": "image/x-icon",
};

function serveDir(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      response.writeHead(200, {
        "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(readFileSync(file));
    } catch { response.writeHead(404).end("not found"); }
  });
  return new Promise((ok) => {
    void listenReachable(server, 0, "127.0.0.1").then(() => {
      const a = server.address();
      const port = typeof a === "object" && a !== null ? a.port : 0;
      ok({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((d) => server.close(() => d())) });
    });
  });
}

/** Backt den Import mit oder ohne Payload. */
async function bake(
  run: Awaited<ReturnType<typeof runImport>>,
  uploads: { assetId: string; filename: string; data: Buffer }[],
  outDir: string,
  withPayload: boolean,
): Promise<void> {
  const document = structuredClone(run.mapped.document);
  const payloads: Record<string, { code: string; integrity: string; bytes: number }> = {};
  if (withPayload) {
    for (const [index, payload] of run.payloads.entries()) {
      const id = `rel-payload-${index + 1}`;
      payloads[id] = { code: payload.bundle, integrity: payload.integrity, bytes: payload.bytes };
      for (const node of Object.values(document.nodes)) {
        if (node.primitive !== "payload" || node.props?.["framerPayloadKey"] !== payload.integrity) continue;
        node.props["payloadId"] = id;
        delete node.props["framerPayloadKey"];
      }
    }
  }
  // Der Weg OHNE Payload braucht KEINEN Eingriff in den Baum: `renderTreeOf`
  // (packages/renderer/src/bake.ts) prueft `delivers(payloadId)` und laesst bei
  // einem nicht gelieferten Seitentraeger den Strukturbaum allein stehen.
  // Mein erster Versuch setzte `props.suppressed` - ein Feld, das der Renderer
  // nirgends liest. Die Zahl waere also die des MIT-Payload-Wegs gewesen und
  // haette den Gegensatz nur vorgetaeuscht.
  const resolved = resolveTheme(mergeThemePatch(defaultTheme(), fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? [])));
  const assets = Object.fromEntries(uploads.map((u) => [u.assetId, { src: `/assets/${u.assetId}/${u.filename}`, width: null, height: null }]));
  mkdirSync(outDir, { recursive: true });
  await bakeSite(
    {
      siteName: "probe",
      baseUrl: "http://127.0.0.1",
      ...(run.breakpoints === null ? {} : { breakpoints: run.breakpoints }),
      pages: [{ id: "p", path: "/", title: "Probe", tree: editorDocumentToNodeTree(document) }],
      themeCss: emitCss(resolved),
      styleRules: run.mapped.rules,
      assets,
      payloads,
      motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
      aeo: false,
    },
    { outDir, selfContained: false },
  );
  for (const upload of uploads) {
    const dir = join(outDir, "assets", upload.assetId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, upload.filename), upload.data);
  }
}

describe.skipIf(TARGET === undefined || TARGET === "" || ORIGINAL_DIR === undefined)("payload vs tree", () => {
  it("measures the release path and the mapped tree separately", async () => {
    const temp = mkdtempSync(join(tmpdir(), "senify-payload-probe-"));
    let counter = 0;
    const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
    const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
      counter += 1;
      const assetId = `up-${counter}`;
      uploads.push({ assetId, filename, data });
      return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
    };

    const run = await runImport({ source: { kind: "url", url: TARGET as string }, mode: "fidelity", uploader });

    const withOut = join(temp, "with-payload");
    const withoutOut = join(temp, "without-payload");
    await bake(run, uploads, withOut, true);
    await bake(run, uploads, withoutOut, false);

    const servers = { withPayload: await serveDir(withOut), tree: await serveDir(withoutOut) };
    const rows: { path: string; breakpoint: string; viewport: number; original: number; senify: number; ratio: number; changed: number }[] = [];
    try {
      for (const [name, server] of Object.entries(servers)) {
        // Aufwaermen: der erste Schuss zahlt den Kaltstart (Fund vom 25.10.).
        await captureScreenshots({ url: `${server.url}/`, outDir: join(temp, `warm-${name}`), breakpoints: ["desktop"], motion: "off", settleMs: 500 });
        const shots = await captureScreenshots({ url: `${server.url}/`, outDir: join(temp, `shot-${name}`), breakpoints: BREAKPOINTS, motion: "off", settleMs: 500 });
        for (const shot of shots) {
          const diff = await diffScreenshots({
            before: join(ORIGINAL_DIR as string, `${shot.breakpoint}.png`),
            after: shot.path,
            outDir: join(temp, "diffs"),
            name: `${name}-${shot.breakpoint}`,
            threshold: 24,
          });
          rows.push({ path: name, breakpoint: shot.breakpoint, viewport: VISUAL_VIEWPORTS[shot.breakpoint].width, original: 0, senify: shot.height, ratio: diff.ratio, changed: diff.changedPixels });
          console.log(`${name.padEnd(14)} ${shot.breakpoint.padEnd(8)} ${VISUAL_VIEWPORTS[shot.breakpoint].width}px  Hoehe ${shot.height}  ${(diff.ratio * 100).toFixed(2)} %`);
        }
      }
    } finally {
      await servers.withPayload.close();
      await servers.tree.close();
    }

    const report = {
      target: TARGET,
      editableShare: run.report.editableShare,
      payloads: run.payloads.length,
      payloadBytes: run.payloads.reduce((sum, p) => sum + p.bytes, 0),
      nodes: run.report.counts.nodes,
      mapped: run.report.counts.mapped,
      score: run.report.score,
      rows,
      artifacts: temp,
    };
    writeFileSync(join(temp, "payload-report.json"), JSON.stringify(report, null, 2), "utf8");
    console.log("\n=== PAYLOAD vs BAUM ===");
    console.log(JSON.stringify(report, null, 2));
    if (!KEEP) console.log("Artifakte:", temp);
    expect(rows.length).toBe(6);
  }, 1_800_000);
});
