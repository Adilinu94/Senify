/* Prüflauf für den Prototyp: alle Routen, Kernflüsse, Zustände.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-prototyp.mjs
   Ausgabe: JSON auf stdout (kompakt), Screenshots daneben. */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const out = resolve(".scratch/editor-v2-rebuild");

const report = { errors: [], routes: {}, flows: {}, lime: [], shots: [] };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") report.errors.push("console: " + m.text()); });
page.on("pageerror", (e) => report.errors.push("pageerror: " + e.message + " | " + String(e.stack || "").split("\n")[1]));

const ROUTES = ["#/", "#/pages", "#/editor", "#/cms", "#/cms/blog", "#/cms/blog/e1", "#/media", "#/references", "#/references/ref1", "#/redesign", "#/review", "#/releases", "#/jobs", "#/settings", "#/design"];

await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(300);

for (const r of ROUTES) {
  await page.evaluate((h) => { location.hash = h; }, r);
  await page.waitForTimeout(150);
  report.routes[r] = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const unnamed = [...document.querySelectorAll("button")].filter((b) => !b.textContent.trim() && !b.getAttribute("aria-label")).map((b) => b.className || b.outerHTML.slice(0, 50));
    const lime = "rgb(201, 242, 76)";
    let limeCount = 0;
    document.querySelectorAll("#app *").forEach((el) => {
      if (el.getClientRects().length === 0) return; /* unsichtbar zählt nicht */
      const cs = getComputedStyle(el);
      if (cs.backgroundColor === lime || cs.color === lime || cs.borderTopColor === lime) limeCount += 1;
    });
    return {
      h1: h1 ? h1.textContent.trim() : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      nodes: document.querySelectorAll("#app *").length,
      unnamedButtons: unnamed.length,
      unnamed,
      lime: limeCount,
    };
  });
}

/* Limette: wo steht sie? (nur als Aussage erlaubt) */
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForTimeout(150);
report.lime = await page.evaluate(() => {
  const lime = "rgb(201, 242, 76)";
  const hits = [];
  document.querySelectorAll("#app *").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.backgroundColor === lime || cs.color === lime || cs.borderTopColor === lime) {
      hits.push({ cls: el.className && String(el.className).slice(0, 60), tag: el.tagName, text: (el.textContent || "").trim().slice(0, 40) });
    }
  });
  return hits.slice(0, 12);
});

/* Kernflüsse */
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(250);

report.flows.editor = await page.evaluate(() => ({
  frames: document.querySelectorAll("[data-frame]").length,
  treeRows: document.querySelectorAll(".tree-row").length,
  selection: !!document.querySelector("[data-sel]"),
  inspectorSections: document.querySelectorAll(".panel-section").length,
  statusSelector: document.querySelector(".ed-status .sel")?.textContent,
}));

/* Baumklick -> Inspektor + Status */
await page.click('.tree-row[data-id="n9"] .label');
await page.waitForTimeout(120);
report.flows.treeSelect = await page.evaluate(() => ({
  statusSelector: document.querySelector(".ed-status .sel")?.textContent,
  head: document.querySelector(".insp-head .crumb")?.textContent,
}));

/* Wert ändern (Schriftgröße) */
const sizeInput = page.locator('[data-field="size"] input').first();
await sizeInput.fill("64");
await sizeInput.dispatchEvent("input");
await page.waitForTimeout(120);
report.flows.valueChange = await page.evaluate(() => ({
  dirty: document.querySelector(".save-state")?.textContent.trim(),
  resetVisible: getComputedStyle(document.querySelector('[data-field="size"] .p-reset')).display,
}));

/* Zustand Hover */
await page.click('[data-eact="state"][data-state="hover"]');
await page.waitForTimeout(120);
report.flows.state = await page.evaluate(() => ({
  pressed: document.querySelector('[data-eact="state"][data-state="hover"]')?.getAttribute("aria-pressed"),
  stateRow: document.querySelectorAll(".insp-state button").length,
}));

/* Solo + Gerät */
await page.click('[data-eact="solo"]');
await page.waitForTimeout(150);
report.flows.solo = await page.evaluate(() => ({ frames: document.querySelectorAll("[data-frame]").length }));
await page.click('[data-eact="solo"]');
await page.waitForTimeout(150);

/* Agent */
await page.click('[data-eact="agent"]');
await page.waitForTimeout(150);
report.flows.agent = await page.evaluate(() => ({ messages: document.querySelectorAll(".agent .msg").length, approval: !!document.querySelector(".approval") }));
await page.click(".approval .btn--primary");
await page.waitForTimeout(120);
report.flows.approval = await page.evaluate(() => ({ text: document.querySelector(".approval")?.textContent.trim().slice(0, 60) }));
await page.click('[data-eact="agent-close"]');
await page.waitForTimeout(100);

/* Verlauf */
await page.click('[data-eact="history"]');
await page.waitForTimeout(150);
report.flows.history = await page.evaluate(() => ({ items: document.querySelectorAll(".history-item").length }));
await page.click('[data-eact="history-close"]');
await page.waitForTimeout(100);

/* Veröffentlichen */
await page.click('[data-eact="publish"]');
await page.waitForTimeout(200);
report.flows.publish = await page.evaluate(() => ({
  dialog: !!document.querySelector(".dialog"),
  steps: document.querySelectorAll(".publish-step").length,
  checks: document.querySelectorAll(".dialog .check-row").length,
}));
await page.screenshot({ path: join(out, "proto-publish.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(100);

/* Spotlight + Theme + Toast */
await page.keyboard.press("Control+k");
await page.waitForTimeout(150);
report.flows.spotlight = await page.evaluate(() => ({ rows: document.querySelectorAll(".spotlight__row").length }));
await page.fill("#spot-input", "xyz");
await page.waitForTimeout(200);
report.flows.spotlightEmpty = await page.evaluate(() => ({ state: !!document.querySelector(".spotlight__list .state"), text: document.querySelector(".spotlight__list .state h3")?.textContent || null }));
await page.keyboard.press("Escape");
await page.waitForTimeout(100);

await page.evaluate(() => { location.hash = "#/design"; });
await page.waitForTimeout(150);
await page.click('[data-act="mode"][data-mode="dark"]');
await page.waitForTimeout(150);
report.flows.dark = await page.evaluate(() => document.documentElement.getAttribute("data-mode"));
await page.screenshot({ path: join(out, "proto-dark.png") });
await page.click('[data-act="mode"][data-mode="light"]');
await page.waitForTimeout(150);

/* Screenshots hell */
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForTimeout(150);
await page.screenshot({ path: join(out, "proto-start.png") });
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(250);
await page.screenshot({ path: join(out, "proto-editor.png") });

/* Mobil */
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
mob.on("pageerror", (e) => report.errors.push("mobile pageerror: " + e.message));
await mob.goto(target);
await mob.waitForTimeout(300);
report.flows.mobile = await mob.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  navWidth: document.querySelector(".nav")?.getBoundingClientRect().width,
}));
await mob.screenshot({ path: join(out, "proto-mobile.png") });

/* Alte Schau unverändert erreichbar */
const sg = await browser.newPage();
await sg.goto(pathToFileURL(join(dir, "styleguide.html")).href);
await sg.waitForTimeout(300);
report.flows.styleguide = await sg.evaluate(() => ({ h1: document.querySelector("h1")?.textContent.trim().slice(0, 40) }));

await browser.close();
console.log(JSON.stringify(report, null, 2));
