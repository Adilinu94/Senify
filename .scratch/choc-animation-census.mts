import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

// Befund 11: "55 bis 63 endliche Animationen im Build, 0 im Original".
// Hypothese: Das Original (Framer-Laufzeit, WAAPI) raeumt abgeschlossene
// Animationen ab; der Build haelt CSS-Keyframes mit fill-mode als "finished"
// in document.getAnimations(). Die Zaehlung in choc-visual.mts passiert NACH
// dem Scrollen — daher der Unterschied. Dieser Census zaehlt WAEREND des
// Scrollens (Spitzenwert) und danach (Endzustand), getrennt nach playState
// und Animationsart (CSSAnimation vs WAAPI-Animation).

const ORIGIN = process.env.SENIFY_CENSUS_SOURCE ?? "https://chocolate-attributes-385353.framer.app";
const BUILD = process.env.SENIFY_CENSUS_BUILD ? resolve(process.env.SENIFY_CENSUS_BUILD) : undefined;
if (BUILD !== undefined && !existsSync(BUILD)) throw new Error(`Build fehlt: ${BUILD}`);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".ico": "image/x-icon",
};

function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://local").pathname;
    const withIndex = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = normalize(join(root, decodeURIComponent(withIndex)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403); response.end("forbidden"); return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      response.end(content);
    } catch { response.writeHead(404); response.end("not found"); }
  });
  return new Promise((complete) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("kein Port");
      complete({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

type Census = {
  spitzeGesamt: number;
  spitzeLaufend: number;
  spitzeCss: number;
  spitzeWaapi: number;
  endGesamt: number;
  endNachStatus: Record<string, number>;
  endNachArt: Record<string, number>;
  endBeispiele: { art: string; status: string; name: string; ziel: string }[];
  appearElemente: number;
  samples: { y: number; gesamt: number; laufend: number; css: number; waapi: number }[];
};

async function census(page: import("playwright").Page): Promise<Census> {
  return page.evaluate(async () => {
    const snap = () => {
      const alle = document.getAnimations();
      let css = 0, waapi = 0, laufend = 0;
      const status: Record<string, number> = {};
      const art: Record<string, number> = {};
      for (const a of alle) {
        const istCss = a.constructor.name === "CSSAnimation";
        if (istCss) css += 1; else waapi += 1;
        if (a.playState === "running") laufend += 1;
        status[a.playState] = (status[a.playState] ?? 0) + 1;
        const name = a.constructor.name;
        art[name] = (art[name] ?? 0) + 1;
      }
      return { alle, css, waapi, laufend, status, art };
    };
    const spitze = { gesamt: 0, laufend: 0, css: 0, waapi: 0 };
    const samples: { y: number; gesamt: number; laufend: number; css: number; waapi: number }[] = [];
    await document.fonts.ready;
    const step = Math.max(320, window.innerHeight * 0.8);
    const limit = Math.min(document.body.scrollHeight, 16000);
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 120));
      const s = snap();
      samples.push({ y, gesamt: s.alle.length, laufend: s.laufend, css: s.css, waapi: s.waapi });
      spitze.gesamt = Math.max(spitze.gesamt, s.alle.length);
      spitze.laufend = Math.max(spitze.laufend, s.laufend);
      spitze.css = Math.max(spitze.css, s.css);
      spitze.waapi = Math.max(spitze.waapi, s.waapi);
    }
    window.scrollTo(0, 0);
    await new Promise((done) => setTimeout(done, 800));
    const ende = snap();
    const beispiele = ende.alle.slice(0, 8).map((a) => {
      const ziel = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const cssName = (a as CSSAnimation).animationName ?? "";
      return {
        art: a.constructor.name,
        status: a.playState,
        name: cssName,
        ziel: ziel ? `${ziel.tagName.toLowerCase()}${ziel.getAttribute("data-node-id") ? `[${ziel.getAttribute("data-node-id")}]` : ""}` : "-",
      };
    });
    const appearElemente =
      document.querySelectorAll('[class*="-appear-"]').length +
      document.querySelectorAll("[data-framer-appear-id]").length;
    return {
      spitzeGesamt: spitze.gesamt,
      spitzeLaufend: spitze.laufend,
      spitzeCss: spitze.css,
      spitzeWaapi: spitze.waapi,
      endGesamt: ende.alle.length,
      endNachStatus: ende.status,
      endNachArt: ende.art,
      endBeispiele: beispiele,
      appearElemente,
      samples,
    };
  });
}

const ergebnis: Record<string, unknown> = { meta: { origin: ORIGIN, build: BUILD ?? null, gemessen: new Date().toISOString() } };
const browser = await chromium.launch({ headless: true });
let local: { server: ReturnType<typeof createServer>; url: string } | undefined;
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const seite = await context.newPage();
  await seite.setViewportSize({ width: 1440, height: 900 });
  seite.setDefaultTimeout(90_000);

  await seite.goto(`${ORIGIN}/`, { waitUntil: "load" });
  ergebnis.original = await census(seite);
  console.log("original:", JSON.stringify({ spitze: (ergebnis.original as Census).spitzeGesamt, laufend: (ergebnis.original as Census).spitzeLaufend, waapi: (ergebnis.original as Census).spitzeWaapi, ende: (ergebnis.original as Census).endGesamt }));

  if (BUILD !== undefined) {
    local = await serve(BUILD);
    await seite.goto(`${local.url}/`, { waitUntil: "load" });
    ergebnis.build = await census(seite);
    console.log("build:", JSON.stringify({ spitze: (ergebnis.build as Census).spitzeGesamt, laufend: (ergebnis.build as Census).spitzeLaufend, css: (ergebnis.build as Census).spitzeCss, ende: (ergebnis.build as Census).endGesamt, status: (ergebnis.build as Census).endNachStatus }));
  }
  writeFileSync(".scratch/choc-animation-census.json", JSON.stringify(ergebnis, null, 1));
  console.log("geschrieben: .scratch/choc-animation-census.json");
} finally {
  await browser.close();
  if (local) await new Promise<void>((done) => local!.server.close(() => done()));
}