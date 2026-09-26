/* Zweiter Audit-Durchgang, rate-limit-schonend: ein Load pro Ansicht, beide
   Themes im selben Load gemessen, 20 s Abstand zwischen den Ansichten.
   Aufruf: SITE_ID=... PAGE_ID=... node .scratch/ui-audit/verify2.mjs */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const base = "http://127.0.0.1:4322";
const siteId = process.env.SITE_ID;
const pageId = process.env.PAGE_ID;
const out = { verify: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const PAUSE = 20_000;
const pause = () => page.waitForTimeout(PAUSE);

async function settle(hash) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${base}/${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    const broken = await page.evaluate(
      () => Boolean(document.querySelector("#view .error, #view button.refs-button.primary, [data-action='retry']")) &&
        /konnte nicht geladen|Erneut versuchen|Fehler/.test(document.querySelector("#view")?.innerText ?? ""),
    );
    if (!broken) return true;
    await pause();
  }
  return false;
}

async function beideModes(hash, script) {
  const ergebnis = {};
  for (const mode of ["light", "dark"]) {
    if (mode === "dark") await pause();
    const ok = await settle(hash);
    await page.evaluate((m) => {
      document.documentElement.dataset.mode = m;
      try {
        localStorage.setItem("senify-mode", m);
      } catch {
        // egal
      }
    }, mode);
    await page.waitForTimeout(500);
    ergebnis[mode] = ok ? await page.evaluate(script) : { fehlerzustand: true };
  }
  return ergebnis;
}

// ---------- 1) Referenzen: Kontraste, Schrift, Rail ----------
out.verify.referenzen = await beideModes("#/references", () => {
  const pick = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    let bg = s.backgroundColor;
    let node = el;
    while ((bg === "rgba(0, 0, 0, 0)" || bg === "transparent") && node.parentElement) {
      node = node.parentElement;
      bg = getComputedStyle(node).backgroundColor;
    }
    return { text: (el.textContent ?? "").trim().slice(0, 30), color: s.color, bg, size: s.fontSize, family: s.fontFamily.split(",")[0].replaceAll('"', "") };
  };
  const nav = document.querySelector('.refs-nav-item[aria-current="page"]') ?? document.querySelector(".refs-nav-item.active");
  const karte = document.querySelector("article[data-reference]") ?? document.querySelector(".refs-card");
  const families = new Map();
  for (const el of document.querySelectorAll(".refs-shell *, .refs-dialog *")) {
    const fam = getComputedStyle(el).fontFamily.split(",")[0].replaceAll('"', "");
    families.set(fam, (families.get(fam) ?? 0) + 1);
  }
  return {
    navAktiv: pick(nav),
    navLabel: pick(nav?.querySelector(".refs-nav-label, span")),
    navCount: pick(nav?.querySelector(".refs-nav-count")),
    navHintergrund: nav ? getComputedStyle(nav).backgroundColor : null,
    karte: pick(karte),
    karteTitel: pick(karte?.querySelector("h2, h3")),
    karteMeta: pick(karte?.querySelector(".refs-card-meta p, .refs-card-meta")),
    h1: pick(document.querySelector(".refs-heading h1")),
    anzahlH2: document.querySelectorAll("article[data-reference] h2, .refs-card h2").length,
    anzahlButtons: document.querySelectorAll(".refs-shell button").length,
    familien: [...families.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
});
await pause();

// ---------- 2) Einstellungen: Knöpfe, Primäraktionen ----------
out.verify.einstellungen = await beideModes("#/settings", () => {
  const knopf = (el) => {
    const s = getComputedStyle(el);
    return { text: (el.textContent ?? "").trim().slice(0, 34), cls: el.className, color: s.color, bg: s.backgroundColor, border: s.borderColor };
  };
  const buttons = [...document.querySelectorAll("#view button")].map(knopf);
  return {
    refsButtons: buttons.filter((b) => b.cls.includes("refs-button")),
    primaries: buttons.filter((b) => b.cls.includes("primary")).map((b) => b.text),
    speichern: buttons.filter((b) => b.text.startsWith("Speichern")).map((b) => b.text),
    abschnitte: [...document.querySelectorAll("#view h2")].map((h) => h.textContent.trim()),
    tabellen: document.querySelectorAll("#view table").length,
    uppercase: [...document.querySelectorAll("#view *")].filter((el) => getComputedStyle(el).textTransform === "uppercase" && el.children.length === 0 && (el.textContent ?? "").trim()).length,
  };
});
await pause();

// ---------- 3) Tastatur auf der Referenzfläche ----------
out.verify.tastatur = await beideModes("#/references", () => {
  const karten = [...document.querySelectorAll("article[data-reference], .refs-card")];
  const tippbar = (el) => el.matches("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
  const stops = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")];
  const ersteKarte = stops.findIndex((el) => el.closest("article[data-reference], .refs-card") !== null);
  return {
    kartenGesamt: karten.length,
    kartenTippbar: karten.filter(tippbar).length,
    tabStops: stops.length,
    tabStopsBisErsteKarte: ersteKarte + 1,
    skipLink: Boolean(document.querySelector(".refs-skip-link")),
    dialogRolle: document.querySelectorAll("[role='dialog']").length,
    liveRegionen: document.querySelectorAll("[aria-live]").length,
  };
});
await pause();

// ---------- 4) 1024 px: Überlauf je Ansicht ----------
{
  const ctx1024 = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const p1024 = await ctx1024.newPage();
  out.verify.viewport1024 = {};
  const routes = [
    ["projekte", "#/"],
    ["projekt-seiten", `#/projects/${siteId}/pages`],
    ["projekt-aktivitaet", `#/projects/${siteId}/activity`],
    ["einstellungen", "#/settings"],
    ["referenzen", "#/references"],
    ["editor", `#/projects/${siteId}/pages/${pageId}`],
  ];
  for (const [name, hash] of routes) {
    await p1024.goto(`${base}/${hash}`, { waitUntil: "domcontentloaded" });
    await p1024.waitForTimeout(2200);
    out.verify.viewport1024[name] = await p1024.evaluate(() => {
      const doc = document.documentElement;
      const view = document.querySelector("#view");
      const clip = [...document.querySelectorAll("#view *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 26)} @${Math.round(el.getBoundingClientRect().right)}`);
      return {
        scrollWidth: doc.scrollWidth,
        ueberlauf: doc.scrollWidth > window.innerWidth + 1,
        viewBox: view ? Math.round(view.getBoundingClientRect().width) : 0,
        clip,
      };
    });
    await p1024.waitForTimeout(PAUSE);
  }
  await ctx1024.close();
}

// ---------- 5) 404er: welche Ansicht fragt tote Assets ab? ----------
out.verify.assets = {};
for (const [name, hash] of [["projekte", "#/"], ["referenzen", "#/references"], ["editor", `#/projects/${siteId}/pages/${pageId}`]]) {
  const bad = [];
  const handler = (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(base, "")}`);
  };
  page.on("response", handler);
  await page.goto(`${base}/${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  page.off("response", handler);
  out.verify.assets[name] = bad;
  await pause();
}

await browser.close();
writeFileSync(".scratch/ui-audit/verify2.json", JSON.stringify(out.verify, null, 1));
console.log("geschrieben: .scratch/ui-audit/verify2.json");
