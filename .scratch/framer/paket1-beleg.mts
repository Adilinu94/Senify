// Paket 1 (.scratch/framer/naechste-schritte-2026-11-09.md): reproduzierbarer
// Vorher-/Nachher-Beleg für Editoränderung → Speichern → Build im Payload-Modus.
//
// Lauf (vom Repo-Root):  pnpm exec tsx .scratch/framer/paket1-beleg.mts [--offline]
// --offline fährt nur die kontrollierte Fixture (ohne Netz zur Chocolate-Site).
// Ausgaben landen lokal im ignorierten Laufverzeichnis
// .scratch/framer-live-2026-11-09/paket1/ (Builds, Netzwerkprotokolle, result.json).
//
// Geprüft wird pro Seite in drei Varianten:
//   before:    Import unverändert gebacken (Payload aktiv = Ausgangsfall)
//   after:     ein Text im Baum per Editor-Mutation geändert, gespeichert, gebacken
//   structure: Träger auf active=false (ADR-0026), gebacken
// Jede Variante wird im echten Chromium geladen: DOM-Text, Skripte, Netzverkehr.

import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { bootEngine, createTestSite, HUMAN_AUTHOR } from "../../packages/engine/test/helpers.ts";
import { bakePages } from "../../packages/engine/src/bake.ts";

const customOut = process.env.SENIFY_PAKET1_OUT;
const OUT = resolve(customOut ?? ".scratch/framer-live-2026-11-09/paket1");
if (customOut !== undefined && existsSync(OUT)) throw new Error("Das gewählte Ausgabeziel existiert bereits; bitte einen neuen Pfad wählen.");
const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const MARKER = `SENIFY-P1-EDIT-${Date.now().toString(36)}`;
const OFFLINE = process.argv.includes("--offline");
const VIEWPORT = { width: 1440, height: 900 };

const result: Record<string, unknown> = {
  meta: {
    startedAt: new Date().toISOString(),
    gitHead: execSync("git rev-parse HEAD").toString().trim(),
    gitBranch: execSync("git branch --show-current").toString().trim(),
    node: process.version,
    datenbank: (process.env.TEST_DATABASE_URL ?? "") !== "" ? "PostgreSQL (isoliertes Testschema)" : "pg-mem (in-memory)",
    importModus: { capture: "browser (1440x900 light; Zusatzlasten 900x1000, 390x844)", mode: "fidelity", write: true, createOnly: true },
    browserPruefung: { viewport: VIEWPORT, colorScheme: "light", scrollPosition: 0, wartezeitNachLoadMs: 5000 },
    marker: MARKER,
    offlineOnly: OFFLINE,
  },
  cases: {},
};

async function persist() {
  await writeFile(join(OUT, "result.json"), JSON.stringify(result, null, 2));
}

/* ------------------------------------------------------- kontrollierte Fixture */

async function writeFixtureMirror(): Promise<string> {
  const dir = join(OUT, "fixture-mirror");
  await mkdir(dir, { recursive: true });
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Paket-1 Fixture</title>
<meta property="og:image" content="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZuoAAAAASUVORK5CYII=" />
<style>body{margin:0;font-family:sans-serif}h1{font-size:48px}</style></head>
<body>
<div id="main" data-framer-hydrate-v2='{"routeId":"fixture-home"}'><div class="framer-fixture"><h1>Fixture Original Headline</h1><p>Fixture paragraph text.</p><img alt="Poster" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZuoAAAAASUVORK5CYII=" /></div></div>
<div id="svg-templates" style="display:none"></div>
<div id="__framer-badge-container"></div>
<script data-framer-bundle type="module" src="./runtime.mjs"></script>
</body></html>`;
  // Die Fixture-Runtime markiert sich und überschreibt die Überschrift: So ist
  // im Browser sichtbar, dass die Runtime (nicht der Baum) die Seite liefert.
  const runtime = `const main = document.getElementById("main");
if (main) {
  main.setAttribute("data-fixture-runtime", "mounted");
  const heading = main.querySelector("h1");
  if (heading) heading.textContent = "FIXTURE RUNTIME OUTPUT";
}
`;
  await writeFile(join(dir, "index.html"), html);
  await writeFile(join(dir, "runtime.mjs"), runtime);
  return dir;
}

/* ------------------------------------------------------------- Engine-Schleife */

type NodeLike = { type?: string; props?: Record<string, unknown>; children?: string[] };
type Draft = { rootNodeId: string; nodes: Record<string, NodeLike> };

function findTextNode(draft: Draft): { id: string; text: string } | null {
  const entries = Object.entries(draft.nodes);
  for (const type of ["heading", "text"]) {
    for (const [id, node] of entries) {
      const text = node.props?.["text"];
      if (node.type === type && typeof text === "string" && text.trim().length > 0) {
        return { id, text };
      }
    }
  }
  return null;
}

function findCarrier(draft: Draft): string | null {
  for (const [id, node] of Object.entries(draft.nodes)) {
    if (node.type === "payload" && node.props?.["coversPage"] === true) return id;
  }
  return null;
}

async function runCase(name: string, sources: { pagePath: string; source: Record<string, unknown> }[]) {
  const env = await bootEngine();
  const record: Record<string, unknown> = { status: "lief", seiten: [] };
  (result.cases as Record<string, unknown>)[name] = record;
  try {
    const site = await createTestSite(env.api, `Paket 1 ${name}`);
    const pageIds: string[] = [];
    const edits: { pageId: string; nodeId: string; originalText: string }[] = [];
    const carriers: { pageId: string; nodeId: string }[] = [];
    for (const { pagePath, source } of sources) {
      const res = await env.api.request<any>({
        method: "POST",
        path: `/api/sites/${site.id}/imports/framer`,
        body: { source, pagePath, mode: "fidelity", write: true, createOnly: true, applyTheme: pagePath === "/", ...(source["url"] !== undefined ? { capture: "browser" } : {}) },
      });
      if (res.status !== 201 || !res.body?.report?.pageId) {
        throw new Error(`Import ${pagePath} fehlgeschlagen: ${res.status} ${JSON.stringify(res.body?.error ?? res.body?.job?.lastError ?? "")}`);
      }
      const pageId = res.body.report.pageId as string;
      pageIds.push(pageId);
      const report = res.body.report;
      (record.seiten as unknown[]).push({
        pagePath,
        pageId,
        jobStatus: res.body.job?.status,
        editableShare: report.editableShare ?? null,
        score: report.score ?? null,
        steps: report.steps ?? [],
        findingKinds: (report.findings ?? []).map((f: { kind: string }) => f.kind),
      });
      const pageRes = await env.api.request<any>({ method: "GET", path: `/api/pages/${pageId}` });
      const draft = pageRes.body.draft as Draft;
      const textNode = findTextNode(draft);
      const carrier = findCarrier(draft);
      if (textNode === null) throw new Error(`Kein Textknoten mit props.text in ${pagePath} gefunden`);
      edits.push({ pageId, nodeId: textNode.id, originalText: textNode.text });
      if (carrier === null) throw new Error(`Kein Seiten-Payload in ${pagePath}`);
      const poster = draft.nodes[carrier]?.props?.["poster"];
      if (typeof poster !== "object" || poster === null || typeof (poster as { assetId?: unknown }).assetId !== "string") throw new Error(`Kein Poster-Asset am Seiten-Payload in ${pagePath}`);
      carriers.push({ pageId, nodeId: carrier });
      console.log(JSON.stringify({ case: name, pagePath, editableShare: report.editableShare, textNode: textNode.id, carrier }));
    }

    const bake = async (variant: string) => {
      const storedSite = await env.engine.store.getSite(site.id);
      const pages = await Promise.all(pageIds.map((id) => env.engine.store.getPage(id)));
      const outDir = join(OUT, name, variant);
      await mkdir(outDir, { recursive: true });
      const built = await bakePages(env.engine.store, { site: storedSite, pages, outDir, dataDir: env.engine.dataDir });
      return { outDir, warnings: (built as { warnings?: unknown }).warnings ?? null };
    };

    const mutate = async (pageId: string, nodeId: string, patch: Record<string, unknown>) => {
      const pageRes = await env.api.request<any>({ method: "GET", path: `/api/pages/${pageId}` });
      const res = await env.humanApi.request<any>({
        method: "POST",
        path: `/api/pages/${pageId}/mutations`,
        body: { baseDraftVersion: pageRes.body.draftVersion, author: HUMAN_AUTHOR, mutations: [{ op: "updateNodeProps", id: nodeId, patch }] },
      });
      if (res.status >= 300) throw new Error(`Mutation fehlgeschlagen: ${res.status} ${JSON.stringify(res.body)}`);
      return { status: res.status, newDraftVersion: res.body.newDraftVersion, warnings: res.body.warnings };
    };

    const before = await bake("before");
    record.variants = { before: { build: before } };
    record.textAenderungen = [];
    for (const edit of edits) {
      const mutation = await mutate(edit.pageId, edit.nodeId, { text: MARKER });
      (record.textAenderungen as unknown[]).push({ pageId: edit.pageId, nodeId: edit.nodeId, ...mutation });
    }
    const after = await bake("after");
    (record.variants as Record<string, unknown>)["after"] = { build: after };
    for (const carrier of carriers) {
      await mutate(carrier.pageId, carrier.nodeId, { active: false });
    }
    record.carrierDeactivated = carriers.length;
    const structure = await bake("structure");
    (record.variants as Record<string, unknown>)["structure"] = { build: structure };

    // Browser- und HTML-Belege pro Variante.
    for (const [variant, dir] of [["before", before.outDir], ["after", after.outDir], ["structure", structure.outDir]] as const) {
      const checks = [];
      for (const { pagePath } of sources) {
        checks.push(await inspectBuild(dir, pagePath));
      }
      (record.variants as Record<string, any>)[variant].belege = checks;
      await persist();
    }
    for (const item of (record.variants as Record<string, any>)["after"].belege) {
      if (item.html.markerInHtml || item.dom.markerInDom || !item.html.payloadTraegerImHtml) throw new Error(`Payload-Ausgangsfall nicht bestätigt: ${item.route}`);
    }
    for (const item of (record.variants as Record<string, any>)["structure"].belege) {
      if (!item.html.markerInHtml || !item.dom.markerInDom || item.html.payloadTraegerImHtml) throw new Error(`Strukturausgabe nicht bestätigt: ${item.route}`);
    }
    if (name === "fixture") {
      const original = (record.variants as Record<string, any>)["after"].belege[0];
      const structure = (record.variants as Record<string, any>)["structure"].belege[0];
      if (original.dom.fixtureRuntimeMounted !== "mounted" || structure.dom.fixtureRuntimeMounted !== null) {
        throw new Error("Fixture-Runtime lief nicht ausschließlich im Payload-Zustand");
      }
    }
    record.status = "abgeschlossen";
  } catch (error) {
    record.status = name === "fixture" ? "fehlgeschlagen" : "blockiert";
    process.exitCode = 1;
    record.fehler = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ case: name, status: record.status, fehler: record.fehler }));
  } finally {
    await env.close();
    await persist();
  }
}

/* ------------------------------------------------- HTML- und Browser-Belege */

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".json": "application/json" };

function serve(dir: string) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      if (!pathname.split("/").pop()!.includes(".")) pathname += "/index.html";
      const file = resolve(root, "." + pathname);
      if (!file.startsWith(root + "\\" ) && !file.startsWith(root + "/")) { res.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      res.writeHead(200, { "content-type": MIME[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream" }).end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  return server;
}

function isFramerHost(hostname: string): boolean {
  return /(^|\.)(framerusercontent\.com|framer\.website|framer\.app|framer\.ai|framer\.media|framercms\.com)$/i.test(hostname);
}

async function inspectBuild(dir: string, pagePath: string) {
  const route = pagePath === "/" ? "/" : `/${pagePath.replace(/^\/+|\/+$/g, "")}/`;
  const htmlFile = join(dir, route === "/" ? "index.html" : join(route.slice(1, -1), "index.html"));
  const html = await readFile(htmlFile, "utf8");
  const payloadDir = join(dir, "assets", "payloads");
  const payloadFiles: { name: string; bytes: number }[] = [];
  try {
    for (const name of await readdir(payloadDir)) {
      payloadFiles.push({ name, bytes: (await readFile(join(payloadDir, name))).length });
    }
  } catch { /* kein Payload-Verzeichnis: Struktur-Bake ohne Payloads */ }
  const htmlBeleg = {
    markerInHtml: html.includes(MARKER),
    payloadTraegerImHtml: /data-payload-id="/.test(html),
    payloadDateien: payloadFiles,
    htmlBytes: Buffer.byteLength(html),
  };
  const server = serve(dir);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light" });
    const page = await context.newPage();
    const requests: string[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (req) => { if (requests.length < 500) requests.push(req.url()); });
    page.on("console", (msg) => { if (msg.type() === "error" && consoleErrors.length < 20) consoleErrors.push(msg.text().slice(0, 300)); });
    page.on("pageerror", (err) => { if (consoleErrors.length < 20) consoleErrors.push(String(err).slice(0, 300)); });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(5000);
    const dom = await page.evaluate((marker) => {
      const text = document.body.innerText;
      return {
        markerInDom: text.includes(marker),
        fixtureRuntimeMounted: document.querySelector("#main")?.getAttribute("data-fixture-runtime") ?? null,
        fixtureRuntimeText: text.includes("FIXTURE RUNTIME OUTPUT"),
        payloadState: document.querySelector("[data-payload-state]")?.getAttribute("data-payload-state") ?? null,
        h1Texte: [...document.querySelectorAll("h1")].slice(0, 5).map((h) => h.textContent?.trim().slice(0, 120) ?? ""),
        skriptSrcs: [...document.scripts].map((s) => s.src).filter(Boolean),
        inlineSkripte: [...document.scripts].filter((s) => !s.src).length,
        bodyTextBytes: text.length,
      };
    }, MARKER);
    const framerRequests = requests.filter((url) => { try { return isFramerHost(new URL(url).hostname); } catch { return false; } });
    return {
      route,
      html: htmlBeleg,
      dom,
      netzwerk: {
        anfragenGesamt: requests.length,
        framerAnfragen: framerRequests.length,
        framerBeispiele: framerRequests.slice(0, 10),
        protokollGekapptBei: 500,
      },
      consoleErrors,
    };
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/* ---------------------------------------------------------------------- main */

await mkdir(OUT, { recursive: true });
const playwrightVersion = JSON.parse(await readFile(resolve("node_modules/playwright/package.json"), "utf8")).version;
(result.meta as Record<string, unknown>)["playwright"] = playwrightVersion;

await runCase("fixture", [{ pagePath: "/", source: { rootDir: await writeFixtureMirror(), page: "/" } }]);

if (!OFFLINE) {
  await runCase("chocolate", [
    { pagePath: "/", source: { url: `${ORIGIN}/` } },
    { pagePath: "/about", source: { url: `${ORIGIN}/about` } },
  ]);
}

(result.meta as Record<string, unknown>)["finishedAt"] = new Date().toISOString();
await persist();
console.log(JSON.stringify({ fertig: true, out: OUT, marker: MARKER, cases: Object.fromEntries(Object.entries(result.cases as Record<string, { status: string }>).map(([k, v]) => [k, v.status])) }));