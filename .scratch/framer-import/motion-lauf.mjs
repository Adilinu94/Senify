// S0-Lauf 2 (Framer-Import): Interaktions-Inventar an einer **gespiegelten**
// Framer-Seite. Kein Netz nötig: die Ausgabe liegt lokal, wird über einen
// eigenen Mini-Server ausgeliefert und in Chromium geladen. Die Probe ist
// `motion-probe.js` aus `Repos/site-clone/...` (vor der Seiten-Runtime injiziert).
//
// Aufruf:
//   node .scratch/framer-import/motion-lauf.mjs <ordner-mit-index.html> [<noch-einer>]

import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const PROBE_FILE = "Repos/site-clone/skills/clone-site/scripts/motion-probe.js";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const folders = process.argv.slice(2);
if (folders.length === 0) {
  console.error("Aufruf: node .scratch/framer-import/motion-lauf.mjs <ordner> [...]");
  process.exit(1);
}

const probeSource = readFileSync(PROBE_FILE, "utf8");

function serve(root) {
  const rootPath = resolve(root);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let filePath = join(rootPath, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(rootPath)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    if (url.pathname === "/" || url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
    try {
      const body = readFileSync(filePath);
      response.writeHead(200, {
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "access-control-allow-origin": "*",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      done({ server, port: typeof address === "object" && address !== null ? address.port : 0 });
    });
  });
}

const browser = await chromium.launch({ headless: true });
const results = [];

for (const folder of folders) {
  const name = folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const { server, port } = await serve(folder);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Playwright kapselt Init-Skripte in eine Closure: die Funktionen müssen
  // deshalb ausdrücklich am Fenster verankert werden, sonst sind sie in
  // page.evaluate() nicht sichtbar.
  await context.addInitScript({
    content:
      `${probeSource}\n;` +
      "window.instrumentMotion = instrumentMotion;" +
      "window.motionProbe = motionProbe;" +
      "window.motionSummary = motionSummary;" +
      "window.__probeReady = true;instrumentMotion();",
  });
  const page = await context.newPage();
  const errors = [];
  const requests = { total: 0, failed: 0, external: 0 };
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 160).replace(/\s+/g, " ")));
  page.on("request", (request) => {
    requests.total += 1;
    if (!request.url().startsWith(`http://127.0.0.1:${port}`)) requests.external += 1;
  });
  page.on("requestfailed", () => {
    requests.failed += 1;
  });

  const entry = { name, folder: resolve(folder), errors, requests };
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60_000 });
    // Settle: einmal durchscrollen (löst lazy Scripts/Trigger aus), dann zurück.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
    });
    await page.waitForTimeout(1500);
    entry.summary = await page.evaluate("motionSummary()");
    entry.full = await page.evaluate("JSON.parse(JSON.stringify(motionProbe()))");
    // Framer animiert mit seiner **eigenen** Runtime (nicht mit GSAP). Deshalb
    // fragen wir sie direkt ab – dasselbe Prinzip wie bei GSAP/ScrollTrigger in
    // `motion-probe.js`: der laufenden Bibliothek die Fragen stellen.
    entry.framer = await page.evaluate(() => {
      const out = {
        globals: Object.keys(window)
          .filter((key) => /framer|motion|animator|scroll|lenis/i.test(key))
          .slice(0, 60),
        animatorKeys: [],
        animatorTypes: {},
        appearScripts: [],
        stylesheetRules: document.styleSheets.length,
      };
      const animator = window.animator;
      if (animator && typeof animator === "object") {
        out.animatorKeys = Object.keys(animator).slice(0, 120);
        for (const key of out.animatorKeys) {
          out.animatorTypes[key] = typeof animator[key];
        }
      }
      for (const script of document.querySelectorAll("script")) {
        const id = script.id || script.getAttribute("data-framer-appear-animation") || "";
        if (/appear|framer/i.test(id)) {
          out.appearScripts.push({ id, type: script.type, bytes: (script.textContent ?? "").length });
        }
      }
      return out;
    });
  } catch (error) {
    entry.fatal = error instanceof Error ? error.message : String(error);
  }

  await context.close();
  await new Promise((done) => server.close(done));
  results.push(entry);

  const s = entry.summary ?? {};
  console.log(`\n=== ${name}`);
  if (entry.fatal) console.log(`  !! ${entry.fatal}`);
  for (const message of entry.errors.slice(0, 3)) console.log(`  Page-Error: ${message}`);
  console.log(`  Requests: ${entry.requests.total} (extern ${entry.requests.external}, fehlgeschlagen ${entry.requests.failed}) · Page-Errors: ${entry.errors.length}`);
  console.log(`  Stack: ${JSON.stringify(s.summary ?? {})}`);
  console.log(`  ScrollTrigger: ${s.scrollTriggers ?? "?"} (gepinnt: ${(s.pinned ?? []).length}) · Tweens: ${s.tweens ?? "?"}`);
  console.log(`  WAAPI: ${JSON.stringify(s.waapi ?? {})} · Keyframes: ${(s.keyframes ?? []).length}`);
  console.log(`  Lenis: ${s.lenis ? JSON.stringify(s.lenis) : "nein"} · SplitText: ${s.splitText ?? 0} · Slider: ${JSON.stringify(s.sliders ?? [])}`);
  if ((s.topTransitions ?? []).length > 0) console.log(`  Übergänge: ${JSON.stringify(s.topTransitions)}`);
  if ((s.notes ?? []).length > 0) console.log(`  Notizen: ${JSON.stringify(s.notes)}`);
  const framer = entry.framer;
  if (framer) {
    console.log(`  Framer-Globals: ${framer.globals.join(", ") || "keine"}`);
    console.log(
      `  window.animator: ${framer.animatorKeys.length} Mitglieder — ${framer.animatorKeys.slice(0, 24).join(", ")}`,
    );
    console.log(`  appear-Skripte: ${JSON.stringify(framer.appearScripts)}`);
  }
}

await browser.close();
const out = resolve(".scratch/framer-import/motion-lauf.json");
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`\nJSON: ${out}`);
