// Generalisierungstest an einer zweiten Framer-Seite (Relay): Import →
// Textänderung → Speichern → Build → HTML- und Browser-Beleg.
//
// Lauf (vom Repo-Root): pnpm exec tsx .scratch/framer/structure-relay-2026-11-10.mts
// Ausgabe: .scratch/framer-live-2026-11-09/structure-relay-2026-11-10/ (ignoriert),
// oder SENIFY_STRUCTURE_OUT auf ein neues Verzeichnis.
//
// Der Text wird über die Editor-Mutationsroute geändert, nicht über den
// Browser-Editor. Der echte Editorweg ist in
// packages/app/test/framer-import-browser.test.ts belegt.

import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { bootEngine, createTestSite, HUMAN_AUTHOR } from "../../packages/engine/test/helpers.ts";
import { bakePages } from "../../packages/engine/src/bake.ts";
import { auditFramerRuntime } from "../../packages/engine/src/runtime-audit.ts";

const customOut = process.env.SENIFY_STRUCTURE_OUT;
const OUT = resolve(customOut ?? ".scratch/framer-live-2026-11-09/structure-relay-2026-11-10");
if (existsSync(OUT)) {
  throw new Error("Das Ausgabeziel existiert bereits; bitte mit SENIFY_STRUCTURE_OUT einen neuen Pfad wählen.");
}
const ORIGIN = "https://gracious-balance-599544.framer.app";
const MARKER = `SENIFY-RELAY-${Date.now().toString(36)}`;
const VIEWPORT = { width: 1440, height: 900 };
const SOURCES = [
  { pagePath: "/", url: `${ORIGIN}/` },
  { pagePath: "/contact", url: `${ORIGIN}/contact` },
];

type NodeLike = { type?: string; props?: Record<string, unknown>; children?: string[] };
type Draft = { rootNodeId: string; nodes: Record<string, NodeLike> };

const result: Record<string, unknown> = {
  meta: {
    startedAt: new Date().toISOString(),
    gitHead: execSync("git rev-parse HEAD").toString().trim(),
    gitBranch: execSync("git branch --show-current").toString().trim(),
    node: process.version,
    datenbank: (process.env.TEST_DATABASE_URL ?? "") !== "" ? "PostgreSQL (isoliertes Testschema)" : "pg-mem (in-memory)",
    importModus: { capture: "browser", mode: "fidelity", output: "structure", write: true, createOnly: true },
    browserPruefung: { viewport: VIEWPORT, colorScheme: "light", wartezeitNachLoadMs: 3000 },
    marker: MARKER,
  },
  cases: {},
};

async function persist() {
  await writeFile(join(OUT, "result.json"), JSON.stringify(result, null, 2));
}

function findTextNode(draft: Draft): { id: string; text: string } | null {
  for (const type of ["heading", "text"]) {
    for (const [id, node] of Object.entries(draft.nodes)) {
      const text = node.props?.["text"];
      if (node.type === type && typeof text === "string" && text.trim().length > 0) {
        return { id, text };
      }
    }
  }
  return null;
}

function activePageCarriers(draft: Draft): string[] {
  return Object.entries(draft.nodes)
    .filter(([, node]) => node.type === "payload" && node.props?.["coversPage"] === true && node.props?.["active"] !== false)
    .map(([id]) => id);
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".json": "application/json" };

function serve(dir: string) {
  const root = resolve(dir);
  return createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      if (!pathname.split("/").pop()!.includes(".")) pathname += "/index.html";
      const file = resolve(root, "." + pathname);
      if (!file.startsWith(root + "\\") && !file.startsWith(root + "/")) { res.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      res.writeHead(200, { "content-type": MIME[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream" }).end(bytes);
    } catch { res.writeHead(404).end(); }
  });
}

function isFramerHost(hostname: string): boolean {
  return /(^|\.)(framerusercontent\.com|framer\.website|framer\.app|framer\.ai|framer\.media|framercms\.com)$/i.test(hostname);
}

function buildHtmlFile(dir: string, pagePath: string): string {
  const route = pagePath === "/" ? "/" : `/${pagePath.replace(/^\/+|\/+$/g, "")}/`;
  return join(dir, route === "/" ? "index.html" : join(route.slice(1, -1), "index.html"));
}

async function localScripts(dir: string, html: string): Promise<{ url: string; content?: string }[]> {
  const scripts: { url: string; content?: string }[] = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const src = match[1] ?? match[2];
    if (src === undefined) continue;
    const file = join(dir, src.replace(/^\//, ""));
    try {
      scripts.push({ url: src, content: await readFile(file, "utf8") });
    } catch {
      scripts.push({ url: src });
    }
  }
  return scripts;
}

async function inspectBuild(dir: string, pagePath: string) {
  const route = pagePath === "/" ? "/" : `/${pagePath.replace(/^\/+|\/+$/g, "")}/`;
  const html = await readFile(buildHtmlFile(dir, pagePath), "utf8");
  const payloadDir = join(dir, "assets", "payloads");
  const payloadFiles: { name: string; bytes: number }[] = [];
  try {
    for (const name of await readdir(payloadDir)) {
      payloadFiles.push({ name, bytes: (await readFile(join(payloadDir, name))).length });
    }
  } catch { /* kein Payload-Verzeichnis */ }
  const server = serve(dir);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light" });
    const page = await context.newPage();
    const requests: { url: string; resourceType: string }[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (req) => {
      if (requests.length < 500) requests.push({ url: req.url(), resourceType: req.resourceType() });
    });
    page.on("console", (msg) => { if (msg.type() === "error" && consoleErrors.length < 20) consoleErrors.push(msg.text().slice(0, 300)); });
    page.on("pageerror", (err) => { if (consoleErrors.length < 20) consoleErrors.push(String(err).slice(0, 300)); });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(3000);
    const dom = await page.evaluate((marker) => {
      const text = document.body.innerText;
      return {
        markerInDom: text.toUpperCase().includes(marker.toUpperCase()),
        payloadState: document.querySelector("[data-payload-state]")?.getAttribute("data-payload-state") ?? null,
        bodyTextBytes: text.length,
        skriptSrcs: [...document.scripts].map((s) => s.src).filter(Boolean),
        inlineSkripte: [...document.scripts].filter((s) => !s.src).length,
        framerGlobals: Object.keys(window).filter((key) => /^(__framer|framer)/i.test(key)).slice(0, 20),
      };
    }, MARKER);
    const framerRequests = requests.filter((entry) => {
      try { return isFramerHost(new URL(entry.url).hostname); } catch { return false; }
    });
    return {
      route,
      html: {
        markerInHtml: html.includes(MARKER),
        payloadTraegerImHtml: /data-payload-id="/.test(html),
        framerImportImHtml: html.includes("framerImport"),
        payloadDateien: payloadFiles,
        htmlBytes: Buffer.byteLength(html),
      },
      dom,
      netzwerk: {
        anfragenGesamt: requests.length,
        framerAnfragen: framerRequests.length,
        framerBeispiele: framerRequests.slice(0, 10),
        eintraege: requests,
        protokollGekapptBei: 500,
      },
      consoleErrors,
    };
  } finally {
    await browser.close();
    await new Promise<void>((ready) => server.close(() => ready()));
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const env = await bootEngine();
  const record: Record<string, unknown> = { status: "lief", seiten: [], varianten: {} };
  (result.cases as Record<string, unknown>)["relay-structure"] = record;
  try {
    const site = await createTestSite(env.api, "Struktur-Beleg");
    const pageIds: string[] = [];
    const pageIdsByPath = new Map<string, string>();
    const edits: { pageId: string; nodeId: string; originalText: string }[] = [];
    for (const source of SOURCES) {
      const started = Date.now();
      const res = await env.api.request<any>({
        method: "POST",
        path: `/api/sites/${site.id}/imports/framer`,
        body: {
          source: { url: source.url },
          pagePath: source.pagePath,
          mode: "fidelity",
          capture: "browser",
          write: true,
          createOnly: true,
          applyTheme: source.pagePath === "/",
          output: "structure",
        },
      });
      if (res.status !== 201 || !res.body?.report?.pageId) {
        throw new Error(`Import ${source.pagePath} fehlgeschlagen: ${res.status} ${JSON.stringify(res.body?.error ?? res.body?.job?.lastError ?? "")}`);
      }
      const report = res.body.report;
      const pageId = report.pageId as string;
      pageIds.push(pageId);
      pageIdsByPath.set(source.pagePath, pageId);
      const pageRes = await env.api.request<any>({ method: "GET", path: `/api/pages/${pageId}` });
      const draft = pageRes.body.draft as Draft;
      const textNode = findTextNode(draft);
      if (textNode === null) throw new Error(`Kein Textknoten in ${source.pagePath}`);
      edits.push({ pageId, nodeId: textNode.id, originalText: textNode.text });
      const carriers = activePageCarriers(draft);
      const findings = (report.findings ?? []) as { kind: string; severity: string; message: string; suggestion: string }[];
      const findingKinds: Record<string, number> = {};
      for (const finding of findings) {
        const key = `${finding.severity}:${finding.kind}`;
        findingKinds[key] = (findingKinds[key] ?? 0) + 1;
      }
      (record.seiten as unknown[]).push({
        pagePath: source.pagePath,
        pageId,
        seconds: Math.round((Date.now() - started) / 1000),
        nodes: Object.keys(draft.nodes).length,
        storedOutput: report.storedOutput ?? null,
        runtimeCarrier: report.runtimeCarrier ?? null,
        payloads: (report.payloads ?? []).length,
        activePageCarriers: carriers,
        textNode: textNode.id,
        findings: findings.length,
        nonInfoFindings: findings.filter((finding) => finding.severity !== "info").length,
        findingKinds,
        findingSamples: findings
          .filter((finding) => finding.severity !== "info")
          .slice(0, 12)
          .map((finding) => ({ kind: finding.kind, severity: finding.severity, message: finding.message, suggestion: finding.suggestion })),
        stepOutput: (report.steps ?? []).find((step: string) => step.includes("Seitenwurzelknoten")) ?? null,
        outputOk: report.storedOutput === "structure" && report.runtimeCarrier === "structure",
      });
      await persist();
    }

    const bake = async (variant: string) => {
      const storedSite = await env.engine.store.getSite(site.id);
      const pages = await Promise.all(pageIds.map((id) => env.engine.store.getPage(id)));
      const outDir = join(OUT, "relay", variant);
      await mkdir(outDir, { recursive: true });
      const built = await bakePages(env.engine.store, { site: storedSite, pages, outDir, dataDir: env.engine.dataDir });
      return { outDir, warnings: (built as { warnings?: unknown }).warnings ?? null };
    };

    const warningKinds = (warnings: unknown): Record<string, number> => {
      const list = Array.isArray(warnings) ? warnings : [];
      const counts: Record<string, number> = {};
      for (const warning of list) {
        const code = typeof warning === "object" && warning !== null && "code" in warning
          ? String((warning as { code: unknown }).code)
          : "unknown";
        counts[code] = (counts[code] ?? 0) + 1;
      }
      return counts;
    };

    const before = await bake("before");
    (record.varianten as Record<string, unknown>).before = { build: before, buildWarningKinds: warningKinds(before.warnings) };
    record.beforeBelege = [];
    for (const source of SOURCES) (record.beforeBelege as unknown[]).push(await inspectBuild(before.outDir, source.pagePath));

    record.textAenderungen = [];
    for (const edit of edits) {
      const pageRes = await env.api.request<any>({ method: "GET", path: `/api/pages/${edit.pageId}` });
      const res = await env.humanApi.request<any>({
        method: "POST",
        path: `/api/pages/${edit.pageId}/mutations`,
        body: { baseDraftVersion: pageRes.body.draftVersion, author: HUMAN_AUTHOR, mutations: [{ op: "updateNodeProps", id: edit.nodeId, patch: { text: MARKER } }] },
      });
      if (res.status >= 300) throw new Error(`Mutation fehlgeschlagen: ${res.status} ${JSON.stringify(res.body)}`);
      (record.textAenderungen as unknown[]).push({ pageId: edit.pageId, nodeId: edit.nodeId, originalText: edit.originalText, status: res.status, newDraftVersion: res.body.newDraftVersion });
    }

    const after = await bake("after");
    (record.varianten as Record<string, unknown>).after = { build: after, buildWarningKinds: warningKinds(after.warnings) };
    record.afterBelege = [];
    record.runtimeAudit = {};
    for (const source of SOURCES) {
      const beleg = await inspectBuild(after.outDir, source.pagePath);
      (record.afterBelege as unknown[]).push(beleg);
      const checks: Record<string, unknown> = {
        markerInHtml: beleg.html.markerInHtml,
        markerInDom: beleg.dom.markerInDom,
        noPayloadCarrier: !beleg.html.payloadTraegerImHtml,
        noFramerImport: !beleg.html.framerImportImHtml,
      };
      (beleg as Record<string, unknown>).checks = checks;
      const pageId = pageIdsByPath.get(source.pagePath);
      if (pageId === undefined) throw new Error(`Keine Seite für ${source.pagePath}`);
      const page = await env.engine.store.getPage(pageId);
      const html = await readFile(buildHtmlFile(after.outDir, source.pagePath), "utf8");
      const audit = auditFramerRuntime({
        tree: page.draft,
        html,
        scripts: await localScripts(after.outDir, html),
        network: beleg.netzwerk.eintraege,
        globals: beleg.dom.framerGlobals,
      });
      checks.runtimeVerdict = audit.verdict;
      (beleg as Record<string, unknown>).runtimeAudit = audit;
      (record.runtimeAudit as Record<string, unknown>)[source.pagePath] = audit;
    }
    record.status = "abgeschlossen";
  } catch (error) {
    record.status = "blockiert";
    record.fehler = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    console.error(JSON.stringify({ status: record.status, fehler: record.fehler }));
  } finally {
    await env.close();
    (result.meta as Record<string, unknown>).finishedAt = new Date().toISOString();
    await persist();
  }
}

await main();
console.log(JSON.stringify({ fertig: true, out: OUT, marker: MARKER, case: (result.cases as Record<string, { status: string }>)["relay-structure"]?.status }));
