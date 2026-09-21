// Zerlegung des Insert-Pfads (Ticket 05, Punkt 7): wo geht die Zeit hin?
// Store ohne Canvas, Store mit Canvas, Canvas-Refresh allein. Reines
// Scratch-Werkzeug fuer die Optimierung, keine Abnahme.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProgram } from "@senify/app";
import { memoryDb } from "../../packages/app/test/support.ts";

const outDir = join(".scratch", "refs", "nick", "perf");
mkdirSync(outDir, { recursive: true });

const database = memoryDb();
const dataDir = mkdtempSync(join(tmpdir(), "senify-t05-breakdown-"));
const running = await startProgram({
  db: database.db,
  dataDir,
  programTokenFile: join(dataDir, "program-token.json"),
  enginePort: 0,
  appPort: 0,
  openBrowser: false,
});
const base = running.dashboardUrl;
await fetch(`${base}/editor.js`);

const NODES = 60;
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const tab = await context.newPage();
tab.setDefaultTimeout(60000);

const harness = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Breakdown</title></head>
<body style="margin:0">
  <div id="hostA" style="width:1500px;height:900px"></div>
  <div id="hostB" style="width:1500px;height:900px"></div>
  <script type="module">
    import { EditorStore, createRegistry, mountCanvas } from "/editor.js";
    const build = () => {
      const nodes = { root000001: { id: "root000001", primitive: "root", props: {}, children: [] } };
      for (let index = 0; index < ${NODES}; index += 1) {
        const id = "div" + String(index).padStart(6, "0");
        nodes[id] = { id, primitive: "divider", props: {} };
        nodes.root000001.children.push(id);
      }
      return { version: 2, rootNodeId: "root000001", nodes, styleRules: [] };
    };
    const storeA = new EditorStore({ document: build() });
    const storeB = new EditorStore({ document: build() });
    const canvasB = mountCanvas(document.getElementById("hostB"), {
      store: storeB,
      registry: createRegistry(),
    });
    const insert = (store) =>
      store.apply({ op: "insertNode", parent: { nodeId: "root000001" }, node: { primitive: "divider" } });
    globalThis.__breakdown = {
      storeOnly(runs) {
        const times = [];
        for (let index = 0; index < runs; index += 1) {
          const before = performance.now();
          insert(storeA);
          times.push(performance.now() - before);
        }
        return times;
      },
      withCanvas(runs) {
        const times = [];
        for (let index = 0; index < runs; index += 1) {
          const before = performance.now();
          insert(storeB);
          times.push(performance.now() - before);
        }
        return times;
      },
      refresh(runs) {
        const times = [];
        for (let index = 0; index < runs; index += 1) {
          const before = performance.now();
          canvasB.refresh();
          times.push(performance.now() - before);
        }
        return times;
      },
    };
    globalThis.__ready = true;
  </script>
</body></html>`;

await tab.route(
  (url) => url.pathname === "/",
  (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: harness }),
);
await tab.goto(`${base}/`, { waitUntil: "load" });
await tab.waitForFunction(() => globalThis.__ready === true, undefined, { timeout: 60000 });

const MEDIAN = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const round = (value) => Math.round(value * 100) / 100;

// Aufwaermen (JIT, erste Layouts).
await tab.evaluate(() => globalThis.__breakdown.storeOnly(5));
await tab.evaluate(() => globalThis.__breakdown.withCanvas(5));
await tab.evaluate(() => globalThis.__breakdown.refresh(3));

const storeOnly = await tab.evaluate(() => globalThis.__breakdown.storeOnly(30));
const withCanvas = await tab.evaluate(() => globalThis.__breakdown.withCanvas(30));
const refreshOnly = await tab.evaluate(() => globalThis.__breakdown.refresh(20));

// CPU-Profil von 12 Inserts: Selbstzeit je Funktion (Top 20), damit sichtbar
// wird, welcher Teil des Refreshs dominiert.
const cdp = await context.newCDPSession(tab);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await tab.evaluate(() => globalThis.__breakdown.withCanvas(12));
const { profile } = await cdp.send("Profiler.stop");
const selfTime = new Map();
const nodeById = new Map(profile.nodes.map((node) => [node.id, node]));
for (const node of profile.nodes) {
  const name =
    (node.callFrame.functionName || "(anonym)") +
    (node.callFrame.url.includes("editor.js") ? "" : " [fremd]");
  selfTime.set(name, (selfTime.get(name) ?? 0) + (node.hitCount ?? 0));
}
const samples = profile.samples ?? [];
const deltas = profile.timeDeltas ?? [];
const totalMs = deltas.reduce((sum, value) => sum + value, 0) / 1000;
const top = [...selfTime.entries()]
  .map(([name, hits]) => ({ name, ms: round((hits * 200) / 1000) }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 20);

const report = {
  nodes: NODES,
  storeOnlyMedianMs: round(MEDIAN(storeOnly)),
  withCanvasMedianMs: round(MEDIAN(withCanvas)),
  refreshMedianMs: round(MEDIAN(refreshOnly)),
  canvasShareMs: round(MEDIAN(withCanvas) - MEDIAN(storeOnly)),
  profileTotalMs: round(totalMs),
  profileTop: top,
};
writeFileSync(join(outDir, "t05-breakdown.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));

await context.close();
await browser.close();
await running.close();
await database.close();
rmSync(dataDir, { recursive: true, force: true });
