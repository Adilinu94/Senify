// Belegpflicht: Editor-Oberflaeche im echten Browser oeffnen (Aufgabe 31).
// Prueft: keine Konsolenfehler, keine fehlgeschlagenen Anfragen, die eingebettete
// Schrift wird geladen, Screenshot nach .scratch/refs/nick/ui/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.SENIFY_URL ?? "http://localhost:4322";
const out = join(".scratch", "refs", "nick", "ui");
mkdirSync(out, { recursive: true });

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const site = await (await post("/api/sites", { name: "UI-Beleg " + Date.now() })).json();
const page = await (
  await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
).json();
await post(`/api/pages/${page.id}/mutations`, {
  baseDraftVersion: page.draftVersion,
  author: { kind: "human", id: "beleg", label: "Beleg" },
  mutations: [
    {
      op: "insertNode",
      parent: { nodeId: page.draft.rootNodeId },
      node: { type: "hero", props: { headline: "UI-Beleg" } },
    },
  ],
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const konsole = [];
const anfragen = [];
tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
tab.on("requestfailed", (r) => anfragen.push("FAIL " + r.url() + " " + (r.failure()?.errorText ?? "")));
tab.on("response", (r) => { if (r.status() >= 400) anfragen.push(`HTTP ${r.status()} ${r.url()}`); });

const url = `${base}/#/projects/${site.id}/pages/${page.id}`;
let mounted = false;
for (let attempt = 0; attempt < 3 && !mounted; attempt += 1) {
  await tab.goto(url, { waitUntil: "domcontentloaded" });
  mounted = await tab
    .waitForSelector(".senify-editor", { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
}

let mess = { mounted: false };
if (mounted) {
  await tab.waitForTimeout(1500);
  mess = await tab.evaluate(async () => {
    await document.fonts.ready;
    const root = document.querySelector(".senify-editor");
    const chrome = root ? getComputedStyle(root).fontFamily : "";
    const faces = [...document.fonts].filter((f) => f.family.includes("Inter"));
    return {
      mounted: true,
      iframes: document.querySelectorAll(".senify-editor__iframe").length,
      chromeFontFamily: chrome,
      interFaceKnown: faces.length,
      interLoaded: document.fonts.check('400 13px "Inter"'),
      editorFontFaces: document.querySelectorAll("style[data-senify-editor-styles]").length,
      overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

await tab.screenshot({ path: join(out, "editor-1440.png") });
await tab.screenshot({ path: join(out, "editor-1440-voll.png"), fullPage: true });
await browser.close();

const bericht = { url: base, mess, konsole, anfragen, fehler: konsole.length + anfragen.length };
writeFileSync(join(out, "pruefung-editor.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
