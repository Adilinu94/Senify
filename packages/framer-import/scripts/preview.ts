// Vorschau: importiert eine Framer-Seite, backt sie MIT Payload und liefert sie
// auf einem lokalen Port aus, bis du den Prozess beendest.
//
//   pnpm exec tsx packages/framer-import/scripts/preview.ts <url> [port]
//
// Warum ein Server und nicht eine Datei: der Payload ist ein ES-Modul und die
// Laufzeit baut ihre Bildadressen mit `new URL(...)` gegen `document.baseURI`.
// Über `file://` verbietet der Browser beides. Der Server liefert genau das,
// was der Release im Betrieb liefert.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

const url = process.argv[2];
const port = Number(process.argv[3] ?? 4173);
if (url === undefined || !/^https?:/.test(url)) {
  console.error("Aufruf: pnpm exec tsx packages/framer-import/scripts/preview.ts <url> [port]");
  process.exit(1);
}

const NAME = new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-");
const OUT = resolve("_preview", NAME);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log(`Importiere ${url} …`);
let counter = 0;
const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
  counter += 1;
  const assetId = `up-${counter}`;
  uploads.push({ assetId, filename, data });
  return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
};

const started = Date.now();
const run = await runImport({ source: { kind: "url", url }, mode: "fidelity", uploader });

// Der Release-Pfad: die Payloads bekommen IDs, der Träger zeigt darauf.
const document = structuredClone(run.mapped.document);
const payloads: Record<string, { code: string; integrity: string; bytes: number }> = {};
for (const [index, payload] of run.payloads.entries()) {
  const id = `rel-payload-${index + 1}`;
  payloads[id] = { code: payload.bundle, integrity: payload.integrity, bytes: payload.bytes };
  for (const node of Object.values(document.nodes)) {
    if (node.primitive !== "payload" || node.props?.framerPayloadKey !== payload.integrity) continue;
    node.props.payloadId = id;
    delete node.props.framerPayloadKey;
  }
}

const patch = fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? []);
const assets = Object.fromEntries(
  uploads.map((upload) => [upload.assetId, { src: `/assets/${upload.assetId}/${upload.filename}`, width: null, height: null }]),
);
const theme = mergeThemePatch(defaultTheme(), patch.fonts === undefined ? {} : { fonts: patch.fonts });
const resolved = resolveTheme(theme);

await bakeSite(
  {
    siteName: NAME,
    baseUrl: `http://127.0.0.1:${port}`,
    breakpoints: run.breakpoints ?? undefined,
    pages: [{ id: "p", path: "/", title: run.document.source.title ?? NAME, tree: editorDocumentToNodeTree(document) }],
    themeCss: emitCss(resolved),
    styleRules: run.mapped.rules,
    assets,
    payloads,
    motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
    aeo: false,
  },
  { outDir: OUT, selfContained: false },
);
for (const upload of uploads) {
  const dir = join(OUT, "assets", upload.assetId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, upload.filename), upload.data);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
};

const server = createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(OUT, `.${path}`);
  if (!file.startsWith(OUT + sep) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`nicht gefunden: ${path}`);
    return;
  }
  response
    .writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      // Exactly the release's policy (`PAGE_CSP` in
      // `packages/engine/src/http-build-files.ts`). Without `style-src
      // 'unsafe-inline'` the page's own inline styles do not apply: measured
      // with a stricter guess, the stage grew to 389.296 px instead of 17.508 -
      // every section showed its content instead of its laid-out state.
      "content-security-policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'",
    })
    .end(readFileSync(file));
});

server.listen(port, "127.0.0.1", () => {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const pagePayload = run.payloads.find((entry) => entry.scope === "page");
  console.log("");
  console.log(`  Vorschau:  http://127.0.0.1:${port}/`);
  console.log(`  Quelle:    ${url}`);
  console.log(`  Import in  ${seconds} s · ${run.report.counts.nodes} Knoten · Score ${run.report.score}`);
  console.log(
    `  Payload:   ${pagePayload === undefined ? "keiner (Struktur-Baum)" : `${(pagePayload.bytes / 1024).toFixed(0)} KB, Budget 3072 KB`}`,
  );
  console.log(`  Ordner:    ${OUT}`);
  console.log("");
  console.log("  Beenden mit Ctrl+C.");
});
