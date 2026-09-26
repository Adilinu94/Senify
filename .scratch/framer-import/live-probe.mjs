// S0 offener Punkt 4 (befund.md): Größe und Verhalten des **Live**-Renderings
// messen — der Spiegel ist offline, die Live-Seite lädt Runtime und Assets vom
// Framer-CDN. Ein Lauf mit `motion-probe` + `tokens-probe` an
// https://yeuxtest.framer.website/hero, 1440 × 900, Freeze aus.
//
// Aufruf: npx tsx .scratch/framer-import/live-probe.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const URL = process.argv[2] ?? "https://yeuxtest.framer.website/hero";
const PROBE_DIR = "Repos/site-clone/skills/clone-site/scripts";
const motionSource = readFileSync(`${PROBE_DIR}/motion-probe.js`, "utf8");
const tokensSource = readFileSync(`${PROBE_DIR}/tokens-probe.js`, "utf8");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript({
  content:
    `${motionSource}\n${tokensSource}\n;` +
    "window.instrumentMotion = instrumentMotion;" +
    "window.motionProbe = motionProbe;" +
    "window.motionSummary = motionSummary;" +
    "window.tokensProbe = tokensProbe;" +
    "window.__probeReady = true;instrumentMotion();",
});
const page = await context.newPage();
const errors = [];
const requests = { total: 0, failed: 0, external: 0, cdnBytes: 0 };
page.on("pageerror", (error) => errors.push(String(error).slice(0, 160).replace(/\s+/g, " ")));
page.on("request", (request) => {
  requests.total += 1;
  if (!request.url().includes("framer.website")) requests.external += 1;
});
page.on("requestfailed", () => {
  requests.failed += 1;
});
page.on("response", async (response) => {
  try {
    const headers = response.headers();
    const length = Number(headers["content-length"] ?? 0);
    if (length > 0) requests.cdnBytes += length;
  } catch {}
});

const entry = { url: URL, errors, requests };
try {
  await page.goto(URL, { waitUntil: "load", timeout: 90_000 });
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
  entry.tokens = await page.evaluate(() => tokensProbe({ maxNodes: 400 }));
  entry.framer = await page.evaluate(() => {
    const out = {
      globals: Object.keys(window)
        .filter((key) => /framer|motion|animator|scroll|lenis/i.test(key))
        .slice(0, 60),
      appearScripts: [],
      stylesheetRules: document.styleSheets.length,
      fontFaces: 0,
    };
    for (const script of document.querySelectorAll("script")) {
      const id = script.id || script.getAttribute("data-framer-appear-animation") || "";
      if (/appear|framer/i.test(id)) {
        out.appearScripts.push({ id, type: script.type, bytes: (script.textContent ?? "").length });
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSFontFaceRule) out.fontFaces += 1;
        }
      } catch {}
    }
    return out;
  });
  // Node-Zahl und DOM-Gewicht im Live-Zustand (Vergleichswert für den Spiegel).
  entry.dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll("*").length,
    styleRules: Array.from(document.styleSheets).reduce((sum, sheet) => {
      try {
        return sum + sheet.cssRules.length;
      } catch {
        return sum;
      }
    }, 0),
  }));
} catch (error) {
  entry.fatal = error instanceof Error ? error.message : String(error);
}
await browser.close();

const out = resolve(".scratch/framer-import/live-probe.json");
writeFileSync(out, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
console.log(`URL: ${URL}`);
if (entry.fatal) console.log(`!! ${entry.fatal}`);
console.log(`Requests: ${entry.requests.total} (extern ${entry.requests.external}, fehlgeschlagen ${entry.requests.failed}), CDN-Bytes: ${(entry.requests.cdnBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Page-Errors: ${entry.errors.length}${entry.errors.length > 0 ? ` — ${entry.errors[0]}` : ""}`);
console.log(`DOM: ${entry.dom?.nodes ?? "?"} Knoten, ${entry.dom?.styleRules ?? "?"} CSS-Regeln, ${entry.framer?.fontFaces ?? "?"} @font-face`);
console.log(`Stack: ${JSON.stringify(entry.summary?.summary ?? {})}`);
console.log(`ScrollTrigger: ${entry.summary?.scrollTriggers ?? "?"} · Tweens: ${entry.summary?.tweens ?? "?"} · WAAPI: ${JSON.stringify(entry.summary?.waapi ?? {})}`);
console.log(`Lenis: ${entry.summary?.lenis ? JSON.stringify(entry.summary.lenis) : "nein"}`);
console.log(`Framer-Globals: ${(entry.framer?.globals ?? []).join(", ") || "keine"}`);
console.log(`appear-Skripte: ${JSON.stringify(entry.framer?.appearScripts ?? [])}`);
console.log(`\nJSON: ${out}`);
