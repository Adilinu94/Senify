// Befund 8: Interaktionen im Build — Hover (Desktop) und Menue (Mobil) gegen Original.
import { writeFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const BUILD = resolve("C:/Users/adini/.senify/previews/H-OXzxq_XvLirh");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2",
};
function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
      let f = normalize(join(root, p));
      if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
      if (p.endsWith("/") || !extname(f)) f = join(f, "index.html");
      const d = await readFile(f);
      res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
      res.end(d);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => {
    const a = server.address(); if (a === null || typeof a === "string") throw new Error("port");
    ok({ server, url: `http://127.0.0.1:${a.port}` });
  }));
}
const PROPS = ["color", "backgroundColor", "borderColor", "opacity", "transform", "boxShadow", "textDecorationLine"];
const LESEN = `(el)=>{const s=getComputedStyle(el);const o={};for(const p of ${JSON.stringify(PROPS)})o[p]=s[p];return o;}`;

async function hoverTest(page: import("playwright").Page) {
  const out: unknown[] = [];
  const ziele = await page.$$("a[href], button, [role=button]");
  let geprueft = 0;
  for (const el of ziele) {
    const box = await el.boundingBox();
    if (!box || box.width < 4 || box.height < 4 || box.y > 800) continue;
    await page.mouse.move(2, 2); await page.waitForTimeout(300);
    const vorher = await el.evaluate(eval(LESEN));
    await el.hover({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
    const nachher = await el.evaluate(eval(LESEN));
    const diff: Record<string, unknown> = {};
    for (const p of PROPS) if (vorher[p] !== nachher[p]) diff[p] = [vorher[p], nachher[p]];
    const text = ((await el.textContent()) ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
    out.push({ text, diff });
    if (++geprueft >= 12) break;
  }
  return { geprueft, mitDiff: out.filter((o) => Object.keys((o as { diff: object }).diff).length > 0), alle: out };
}

async function menuTest(page: import("playwright").Page) {
  // Mobil: Hamburger suchen und klicken, sichtbare Nav-Links vorher/nachher.
  const linksVorher = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
    .filter((a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; })
    .map((a) => a.textContent?.trim()).filter(Boolean));
  const burger = page.locator('button, [role=button], [data-framer-component-type="Icon"]').filter({ hasNot: page.locator("xpath=.") });
  // Finde das Menue-Icon oben rechts (kleines quadratisches Element in der Kopfzeile).
  const kandidat = await page.evaluateHandle(() => {
    const els = [...document.querySelectorAll("button, [role=button], div, a")];
    return els.find((el) => { const r = el.getBoundingClientRect(); return r.top < 80 && r.right > window.innerWidth - 80 && r.width >= 20 && r.width <= 60 && r.height >= 20 && r.height <= 60 && el.querySelectorAll("a").length === 0; }) ?? null;
  });
  let geklickt = false;
  const el = kandidat.asElement();
  if (el) { await el.click({ timeout: 3000 }).catch(() => {}); geklickt = true; await page.waitForTimeout(800); }
  const linksNachher = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
    .filter((a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; })
    .map((a) => a.textContent?.trim()).filter(Boolean));
  return { geklickt, linksVorher: linksVorher.slice(0, 12), linksNachher: linksNachher.slice(0, 16), neueLinks: linksNachher.filter((l) => !linksVorher.includes(l)) };
}

const { server, url } = await serve(BUILD);
const browser = await chromium.launch({ headless: true });
const ergebnis: Record<string, unknown> = {};
try {
  for (const [label, base] of [["original", ORIGIN], ["build", url]] as const) {
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desk.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await desk.waitForLoadState("networkidle").catch(() => {});
    await desk.waitForTimeout(1500);
    ergebnis[`${label}Hover`] = await hoverTest(desk);
    await desk.close();
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mob.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await mob.waitForLoadState("networkidle").catch(() => {});
    await mob.waitForTimeout(1500);
    ergebnis[`${label}Menu`] = await menuTest(mob);
    await mob.close();
  }
} finally { await browser.close(); server.close(); }
writeFileSync(resolve(".scratch/choc-interaction.json"), JSON.stringify(ergebnis, null, 2));
for (const k of ["originalHover", "buildHover"]) {
  const h = ergebnis[k] as { geprueft: number; mitDiff: unknown[] };
  console.log(`${k}: geprueft ${h.geprueft}, mit Hover-Aenderung ${h.mitDiff.length}`);
  console.log(JSON.stringify(h.mitDiff.slice(0, 4)));
}
for (const k of ["originalMenu", "buildMenu"]) {
  const m = ergebnis[k] as { geklickt: boolean; neueLinks: string[] };
  console.log(`${k}: geklickt ${m.geklickt}, neue Links nach Klick:`, JSON.stringify(m.neueLinks));
}