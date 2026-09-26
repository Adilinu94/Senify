/* Kompletter UI-Test am laufenden Portal: misst jede Oberfläche in hell und
   dunkel und sammelt die Axe-Befunde.
   Aufruf: SITE_ID=... PAGE_ID=... node .scratch/ui-audit/audit.mjs */

import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const base = process.env.SENIFY_PORTAL ?? "http://127.0.0.1:4322";
const siteId = process.env.SITE_ID;
const pageId = process.env.PAGE_ID;
if (!siteId || !pageId) throw new Error("SITE_ID und PAGE_ID setzen");

const out = resolve(".scratch/ui-audit");
mkdirSync(out, { recursive: true });

const routes = [
  { slug: "01-projekte", label: "Projekte", hash: "#/", full: true },
  { slug: "02-projekt-seiten", label: "Projekt · Seiten", hash: `#/projects/${siteId}/pages`, full: true },
  { slug: "03-projekt-templates", label: "Projekt · Templates", hash: `#/projects/${siteId}/templates`, full: true },
  { slug: "04-projekt-einsendungen", label: "Projekt · Einsendungen", hash: `#/projects/${siteId}/submissions`, full: true },
  { slug: "05-projekt-review", label: "Projekt · Review", hash: `#/projects/${siteId}/review`, full: true },
  { slug: "06-projekt-aktivitaet", label: "Projekt · Aktivität", hash: `#/projects/${siteId}/activity`, full: true },
  { slug: "07-projekt-einstellungen", label: "Projekt · Einstellungen", hash: `#/projects/${siteId}/settings`, full: true },
  { slug: "08-editor", label: "Editor", hash: `#/projects/${siteId}/pages/${pageId}`, full: false },
  { slug: "09-einstellungen", label: "Einstellungen", hash: "#/settings", full: true },
  { slug: "10-referenzen", label: "Referenzen", hash: "#/references", full: false },
  { slug: "11-bausteine", label: "Bausteine", hash: "#/library", full: false },
  { slug: "12-papierkorb", label: "Papierkorb", hash: "#/trash", full: true },
];

const collect = () => {
  const view = document.querySelector("#view");
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity) > 0.05
    );
  };
  const all = [...document.querySelectorAll("#view *")].filter(visible);
  const leaves = all.filter(
    (element) => element.children.length === 0 && (element.textContent ?? "").trim() !== "",
  );
  const tally = (values) => {
    const map = new Map();
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const style = (element) => getComputedStyle(element);
  const fonts = leaves.map((element) => {
    const s = style(element);
    return `${s.fontSize} ${s.fontWeight} ${s.fontFamily.split(",")[0].replaceAll('"', "")}`;
  });
  const leftEdges = leaves
    .map((element) => Math.round(element.getBoundingClientRect().left))
    .filter((value) => value > 0);
  const buttons = all
    .filter((element) => element.tagName === "BUTTON")
    .map((element) => (element.textContent ?? "").trim().slice(0, 48));
  return {
    elementCount: all.length,
    leafCount: leaves.length,
    textLength: (view?.innerText ?? "").length,
    fontsDistinct: new Set(fonts).size,
    fonts: tally(fonts).slice(0, 16),
    colorsDistinct: new Set(leaves.map((element) => style(element).color)).size,
    colors: tally(leaves.map((element) => style(element).color)).slice(0, 8),
    backgroundsDistinct: new Set(
      all.map((element) => style(element).backgroundColor).filter((value) => value !== "rgba(0, 0, 0, 0)"),
    ).size,
    radii: tally(all.map((element) => style(element).borderTopLeftRadius).filter((v) => v !== "0px")),
    gaps: tally(all.map((element) => style(element).gap).filter((v) => v !== "normal" && v !== "0px")),
    paddings: tally(
      all
        .map((element) => {
          const s = style(element);
          return `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`;
        })
        .filter((value) => value !== "0px 0px 0px 0px"),
    ).slice(0, 14),
    shadows: tally(all.map((element) => style(element).boxShadow).filter((v) => v !== "none")),
    leftEdgesDistinct: [...new Set(leftEdges)].sort((a, b) => a - b).slice(0, 24),
    buttons,
    primaryButtons: all
      .filter((element) => element.tagName === "BUTTON" && element.className.includes("primary"))
      .map((element) => (element.textContent ?? "").trim().slice(0, 48)),
    links: all
      .filter((element) => element.tagName === "A")
      .map((element) => `${(element.textContent ?? "").trim().slice(0, 40)} → ${element.getAttribute("href") ?? ""}`),
    headings: all
      .filter((element) => /^H[1-6]$/.test(element.tagName))
      .map((element) => `${element.tagName} ${(element.textContent ?? "").trim().slice(0, 64)}`),
    tables: all.filter((element) => element.tagName === "TABLE").length,
    cards: all.filter((element) => /card/.test(element.className)).length,
    images: [...document.querySelectorAll("#view img")].map((image) => ({
      alt: image.getAttribute("alt"),
      src: (image.getAttribute("src") ?? "").slice(0, 60),
    })),
    uppercaseCount: leaves.filter((element) => style(element).textTransform === "uppercase").length,
    centeredCount: leaves.filter((element) => style(element).textAlign === "center").length,
    gradientCount: all.filter((element) => /gradient/.test(style(element).backgroundImage)).length,
    glassCount: all.filter((element) => style(element).backdropFilter !== "none").length,
    pillCount: all.filter((element) => Number.parseFloat(style(element).borderTopLeftRadius) >= 999).length,
    transitionCount: all.filter((element) => style(element).transitionDuration !== "0s").length,
    animationCount: all.filter((element) => style(element).animationName !== "none").length,
    emoji: leaves
      .filter((element) => /\p{Extended_Pictographic}/u.test(element.textContent ?? ""))
      .map((element) => (element.textContent ?? "").trim().slice(0, 48)),
    scrollWidth: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    viewBox: document.querySelector("#view")?.getBoundingClientRect().width ?? 0,
  };
};

const browser = await chromium.launch();
const report = { base, viewport: { width: 1440, height: 1000 }, routes: [] };
const failedRequests = [];

// Die Engine drosselt je Minute: nach jedem Aufruf kurz warten und eine Ansicht,
// die im Fehlerzustand landet, ein zweites Mal laden — sonst misst der Audit das
// eigene Hammering statt der Oberflaeche.
async function loadRoute(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    const failed = await page.evaluate(
      () => (document.querySelector("#view h1")?.textContent ?? "").includes("Ansicht konnte nicht geladen werden"),
    );
    if (!failed) return true;
    await page.waitForTimeout(12_000);
  }
  return false;
}

for (const mode of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url().slice(0, 120)}`);
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate((next) => {
    document.documentElement.dataset.mode = next;
    try {
      localStorage.setItem("senify-mode", next);
    } catch {
      // egal
    }
  }, mode);

  for (const route of routes) {
    const settled = await loadRoute(page, `${base}/${route.hash}`);
    if (route.slug === "10-referenzen") await page.waitForTimeout(1200);
    const data = await page.evaluate(collect);
    if (!settled) errors.push(`route ${route.slug}: Fehlerzustand nach drei Versuchen`);
    let axe = [];
    try {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      axe = result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
        targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
        help: violation.help,
        detail: violation.nodes.slice(0, 2).map((node) => (node.failureSummary ?? "").slice(0, 300)),
        html: violation.nodes.slice(0, 2).map((node) => (node.html ?? "").slice(0, 200)),
      }));
    } catch (error) {
      axe = [{ id: "axe-fehler", help: String(error).slice(0, 160) }];
    }
    report.routes.push({ mode, slug: route.slug, label: route.label, data, axe });
    await page.screenshot({
      path: join(out, `${route.slug}-${mode}.png`),
      fullPage: route.full && mode === "light",
    });
    const flag = axe.length > 0 ? ` · axe: ${axe.map((entry) => entry.id).join(", ")}` : "";
    console.log(
      `${mode.padEnd(5)} ${route.slug.padEnd(24)} Elemente ${String(data.elementCount).padStart(5)} · Typo ${String(data.fontsDistinct).padStart(2)} · Farben ${String(data.colorsDistinct).padStart(2)} · Radien ${data.radii.length} · Schatten ${data.shadows.length} · Buttons ${data.buttons.length}${flag}`,
    );
  }
  report[`errors_${mode}`] = errors;
  await context.close();
}
report.failedRequests = [...new Set(failedRequests)];

await browser.close();
writeFileSync(join(out, "audit.json"), JSON.stringify(report, null, 1));
console.log(`\nRohdaten: .scratch/ui-audit/audit.json`);
