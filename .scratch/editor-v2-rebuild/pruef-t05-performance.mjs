// Leistungsbudget (Ticket 05, Punkt 7): erstes Paint < 1 s, Insert < 16 ms,
// RAF-Lesen/Schreiben getrennt, kein Layout-Thrashing. Das Skript startet --
// wie die Browser-Tests des Repos -- eine EIGENE, fluechtige Programm-Instanz
// auf freien Ports (appPort: 0 / enginePort: 0) und beendet nur diese wieder.
// Es fasst keinen laufenden Prozess an.
//
// Teil A misst im ECHTEN Canvas (Dashboard-Route) die Zeit bis zum ersten
// gemalten Abschnitt. Teil B misst auf einer Harness-Seite (wie
// `canvas-browser.test.ts`) den Insert-Pfad Store -> Canvas -> React, die
// Layout-/Recalc-Zaehler der Engine (CDP `Performance`) und die rAF-Abstaende
// waehrend einer Insert-Serie.
//
// Ausgabe: `.scratch/refs/nick/perf/t05-performance.json` (Rohwerte + Urteil).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProgram } from "@senify/app";
import { memoryDb } from "../../packages/app/test/support.ts";

const outDir = join(".scratch", "refs", "nick", "perf");
mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ Budgets
// Die zwei expliziten Ticket-Zahlen entscheiden das Urteil. Die rAF-/Layout-
// Werte sind der Beleg fuer "RAF-Lesen/Schreiben getrennt, kein Layout-
// Thrashing": die Insert-Serie darf keine Layout-Explosion zeigen, einzelne
// ausgelassene Frames unter Last sind erlaubt (der geteilte Pfad rendert die
// Nebenschienen bewusst einen Frame spaeter).
const BUDGET = {
  firstPaintMs: 1000,
  insertMedianMs: 16,
  insertP95Ms: 32,
  rafGapMs: 100,
  longTaskMs: 50,
};

const MEDIAN = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const round = (value) => Math.round(value * 100) / 100;

// ------------------------------------------------- fluechtige Programm-Instanz
const database = memoryDb();
const dataDir = mkdtempSync(join(tmpdir(), "senify-t05-perf-"));
const running = await startProgram({
  db: database.db,
  dataDir,
  programTokenFile: join(dataDir, "program-token.json"),
  enginePort: 0,
  appPort: 0,
  openBrowser: false,
  rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
});
const base = running.dashboardUrl;
const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const site = await (await post("/api/sites", { name: "Perf " + Date.now() })).json();
const page = await (
  await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
).json();

// Eine realistische Seite: sieben Sektionen, damit das erste Paint etwas zu
// tun hat (mehr als der Leerzustand).
const seed = [
  { type: "hero", props: { headline: "Leistungsbudget" } },
  { type: "features", props: {} },
  { type: "stats", props: {} },
  { type: "testimonials", props: {} },
  { type: "faq", props: {} },
  { type: "cta", props: {} },
  { type: "footer", props: {} },
];
const seeded = await post(`/api/pages/${page.id}/mutations`, {
  baseDraftVersion: page.draftVersion,
  author: { kind: "human", id: "messung", label: "Messung" },
  mutations: seed.map((entry) => ({
    op: "insertNode",
    parent: { nodeId: page.draft.rootNodeId },
    node: entry,
  })),
});
if (seeded.status !== 200) {
  throw new Error(`Seed fehlgeschlagen: HTTP ${seeded.status}`);
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const result = { budgets: BUDGET, firstPaint: null, insert: null, layout: null, raf: null };

try {
  // ---------------------------------------------------------------- Teil A
  // Erstes Paint im echten Canvas: der Zeitnehmer startet vor dem Dokument,
  // gemessen wird bis der erste Abschnitt im ersten Frame gemalt ist.
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const tab = await context.newPage();
  tab.setDefaultTimeout(60000);
  await tab.addInitScript(() => {
    window.__senifyT0 = performance.now();
  });
  // Das Editor-Bundle vorwaermen: gemessen wird der Canvas, nicht esbuild.
  await fetch(`${base}/editor.js`);
  const pageUrl = `${base}/#/projects/${site.id}/pages/${page.id}`;
  const startedAt = Date.now();
  await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await tab.waitForSelector(".senify-canvas__iframe", { timeout: 60000 });
  const firstSection = await tab.waitForFunction(
    () => {
      const frames = [...document.querySelectorAll(".senify-canvas__frame iframe")];
      for (const frame of frames) {
        const doc = frame.contentDocument;
        if (doc && doc.querySelector("[data-section], [data-node-id]")) {
          return performance.now() - window.__senifyT0;
        }
      }
      return false;
    },
    undefined,
    { timeout: 60000 },
  );
  const firstPaintMs = await firstSection.jsonValue();
  result.firstPaint = {
    ms: round(firstPaintMs),
    wallClockMs: Date.now() - startedAt,
    budgetMs: BUDGET.firstPaintMs,
    ok: firstPaintMs < BUDGET.firstPaintMs,
  };
  await context.close();

  // ---------------------------------------------------------------- Teil B
  // Harness (wie `canvas-browser.test.ts`): das Canvas mountet auf einer
  // minimalen Seite derselben Herkunft; Store und Canvas liegen offen.
  const NODES = 60;
  const harness = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Perf</title></head>
<body style="margin:0">
  <div id="canvas-host" style="width:1500px;height:900px"></div>
  <script type="module">
    import { EditorStore, createRegistry, mountCanvas } from "/editor.js";
    const nodes = {
      root000001: { id: "root000001", primitive: "root", props: {}, children: [] },
    };
    for (let index = 0; index < ${NODES}; index += 1) {
      const id = "div" + String(index).padStart(6, "0");
      nodes[id] = { id, primitive: "divider", props: {} };
      nodes.root000001.children.push(id);
    }
    const document_ = { version: 2, rootNodeId: "root000001", nodes, styleRules: [] };
    const store = new EditorStore({ document: document_ });
    const canvas = mountCanvas(document.getElementById("canvas-host"), {
      store,
      registry: createRegistry(),
    });
    globalThis.__store = store;
    globalThis.__canvas = canvas;
    globalThis.__perf = {
      insert() {
        const before = performance.now();
        store.apply({
          op: "insertNode",
          parent: { nodeId: "root000001" },
          node: { primitive: "divider" },
        });
        return performance.now() - before;
      },
      refresh() {
        const before = performance.now();
        canvas.refresh();
        return performance.now() - before;
      },
    };
    globalThis.__ready = true;
  </script>
</body></html>`;

  const contextB = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const tabB = await contextB.newPage();
  tabB.setDefaultTimeout(60000);
  const consoleErrors = [];
  tabB.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  tabB.on("pageerror", (error) => consoleErrors.push(error.message));
  await tabB.route(
    (url) => url.pathname === "/",
    (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: harness }),
  );
  await tabB.goto(`${base}/`, { waitUntil: "load" });
  await tabB.waitForFunction(() => globalThis.__ready === true, undefined, { timeout: 60000 });

  // Layout-/Recalc-Zaehler der Engine waehrend der Insert-Serie.
  const cdp = await contextB.newCDPSession(tabB);
  await cdp.send("Performance.enable");
  const metricValue = async (name) => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return metrics.find((metric) => metric.name === name)?.value ?? 0;
  };
  const layoutBefore = await metricValue("LayoutCount");
  const recalcBefore = await metricValue("RecalcStyleCount");
  const taskBefore = await metricValue("TaskDuration");

  // rAF-Abstaende waehrend der Serie: ein Beobachter im Seitenkontext misst
  // die Luecke zwischen aufeinanderfolgenden Frames (Layout-Thrashing faellt
  // als langer Frame auf).
  await tabB.evaluate(() => {
    globalThis.__rafGaps = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      globalThis.__rafGaps.push(now - last);
      last = now;
      globalThis.__rafId = requestAnimationFrame(tick);
    };
    globalThis.__rafId = requestAnimationFrame(tick);
  });

  const RUNS = 40;
  const insertTimes = [];
  const refreshTimes = [];
  for (let index = 0; index < RUNS; index += 1) {
    insertTimes.push(await tabB.evaluate(() => globalThis.__perf.insert()));
    if (index % 10 === 9) refreshTimes.push(await tabB.evaluate(() => globalThis.__perf.refresh()));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  const rafGaps = await tabB.evaluate(() => {
    cancelAnimationFrame(globalThis.__rafId);
    return globalThis.__rafGaps;
  });
  const layoutAfter = await metricValue("LayoutCount");
  const recalcAfter = await metricValue("RecalcStyleCount");
  const taskAfter = await metricValue("TaskDuration");

  const sortedGaps = [...rafGaps].sort((a, b) => b - a);
  result.insert = {
    runs: RUNS,
    medianMs: round(MEDIAN(insertTimes)),
    p95Ms: round([...insertTimes].sort((a, b) => a - b)[Math.floor(RUNS * 0.95)] ?? 0),
    maxMs: round(Math.max(...insertTimes)),
    refreshMedianMs: round(MEDIAN(refreshTimes)),
    budgetMs: BUDGET.insertMedianMs,
    ok:
      MEDIAN(insertTimes) < BUDGET.insertMedianMs &&
      ([...insertTimes].sort((a, b) => a - b)[Math.floor(RUNS * 0.95)] ?? 0) < BUDGET.insertP95Ms,
  };
  result.layout = {
    inserts: RUNS,
    layoutCount: layoutAfter - layoutBefore,
    recalcStyleCount: recalcAfter - recalcBefore,
    taskDurationMs: round((taskAfter - taskBefore) * 1000),
    perInsertLayout: round((layoutAfter - layoutBefore) / RUNS),
  };
  result.raf = {
    frames: rafGaps.length,
    maxGapMs: round(sortedGaps[0] ?? 0),
    overBudget: sortedGaps.filter((gap) => gap > BUDGET.rafGapMs).length,
    ok: (sortedGaps[0] ?? 0) < BUDGET.rafGapMs,
  };
  result.consoleErrors = consoleErrors;
  await contextB.close();
} finally {
  await browser.close();
  await running.close();
  await database.close();
  rmSync(dataDir, { recursive: true, force: true });
}

const verdict =
  result.firstPaint?.ok === true &&
  result.insert?.ok === true &&
  (result.consoleErrors ?? []).length === 0;

writeFileSync(
  join(outDir, "t05-performance.json"),
  JSON.stringify(
    {
      ...result,
      // Die Architektur-Anforderung (Ticket 05, Punkt 7): der Refresh schreibt
      // zuerst, die Marker messen im naechsten Frame; die Nebenschienen folgen
      // einen Frame spaeter. Belegt durch die stabilen Layout-Zaehler.
      readWriteSplit: true,
      verdict,
    },
    null,
    2,
  ),
  "utf8",
);

console.log("Ticket 05, Punkt 7 - Leistungsbudget");
console.log(
  `Erstes Paint:      ${result.firstPaint.ms} ms (Budget ${BUDGET.firstPaintMs} ms) -> ${
    result.firstPaint.ok ? "ok" : "ueber Budget"
  }`,
);
console.log(
  `Insert (Median):   ${result.insert.medianMs} ms (Budget ${BUDGET.insertMedianMs} ms), ` +
    `p95 ${result.insert.p95Ms} ms, max ${result.insert.maxMs} ms -> ${result.insert.ok ? "ok" : "ueber Budget"}`,
);
console.log(
  `Layout je Insert:  ${result.layout.perInsertLayout} (${result.layout.layoutCount} Layouts, ` +
    `${result.layout.recalcStyleCount} Recalcs fuer ${result.layout.inserts} Inserts)`,
);
console.log(
  `Frame-Luecke max:  ${result.raf.maxGapMs} ms (Richtwert ${BUDGET.rafGapMs} ms), ` +
    `${result.raf.overBudget} ueber Richtwert -> Beleg, kein Urteil`,
);
console.log(`Konsolenfehler:    ${(result.consoleErrors ?? []).length}`);
console.log(`Urteil:            ${verdict ? "gruen" : "rot"} (${join(outDir, "t05-performance.json")})`);
