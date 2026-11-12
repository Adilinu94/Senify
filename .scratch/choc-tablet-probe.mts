import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { chromium } from "playwright";

const BUILD = process.argv[2]!;
const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const Y = Number(process.argv[3] ?? 2457);
const WIDTH = Number(process.argv[4] ?? 768);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".gif": "image/gif",
};
const server = createServer(async (rq, rs) => {
  let p = decodeURIComponent(new URL(rq.url ?? "/", "http://l").pathname);
  if (p.endsWith("/")) p += "index.html";
  try {
    const b = await readFile(normalize(join(BUILD, p)));
    rs.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    rs.end(b);
  } catch { rs.writeHead(404); rs.end(); }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const buildUrl = `http://127.0.0.1:${(server.address() as any).port}/`;

const browser = await chromium.launch();

async function messen(page: import("playwright").Page, label: string) {
  return page.evaluate(({ y, label }) => {
    const sy = window.scrollY;
    const oben = y; const unten = y + window.innerHeight;
    const beschreibe = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        node: el.getAttribute("data-node-id") ?? "",
        cls: (el.getAttribute("class") ?? "").slice(0, 110),
        box: [Math.round(r.left), Math.round(r.top + sy), Math.round(r.width), Math.round(r.height)],
        op: cs.opacity, vis: cs.visibility, disp: cs.display,
      };
    };
    const verstecker = (el: Element) => {
      let cur: Element | null = el;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) {
          return { ...beschreibe(cur), selbst: cur === el };
        }
        cur = cur.parentElement;
      }
      return null;
    };
    const alle = Array.from(document.body.querySelectorAll("*"));
    const imBereich = alle.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 4 && r.width > 4 && r.top + sy < unten && r.bottom + sy > oben;
    });
    const blaetter = imBereich.filter((el) => {
      const r = el.getBoundingClientRect();
      const hatText = el.children.length === 0 && (el.textContent ?? "").trim().length > 0;
      return el.tagName === "IMG" || el.tagName === "SVG" || hatText || r.width > 300;
    });
    const animationen = document.getAnimations().map((a) => {
      const ziel = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const r = ziel?.getBoundingClientRect();
      return {
        name: (a as any).animationName ?? a.constructor.name,
        state: a.playState,
        ziel: ziel ? beschreibe(ziel) : null,
        imBereich: !!r && r.top + sy < unten && r.bottom + sy > oben,
      };
    });
    return {
      label,
      scrollY: sy,
      hoehe: document.body.scrollHeight,
      elemente: blaetter.slice(0, 60).map((el) => ({ ...beschreibe(el), verstecktDurch: verstecker(el) })),
      animationenImBereich: animationen.filter((a) => a.imBereich).slice(0, 30),
      animationenGesamt: animationen.length,
    };
  }, { y: Y, label });
}

for (const [name, url] of [["build", buildUrl], ["original", ORIGIN]] as const) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 1024 } });
  page.setDefaultTimeout(90_000);
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const step = Math.max(320, window.innerHeight * 0.8);
    const limit = Math.min(document.body.scrollHeight, 16000);
    for (let y = 0; y < limit; y += step) { window.scrollTo(0, y); await new Promise((d) => setTimeout(d, 120)); }
  });
  await page.evaluate((y) => window.scrollTo(0, y), Y);
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await messen(page, `${name}-vor-finish`)));
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const t = a.effect?.getTiming?.();
      try { if (t && t.iterations === Infinity) a.pause(); else a.finish(); } catch {}
    }
  });
  await page.waitForTimeout(200);
  console.log(JSON.stringify(await messen(page, `${name}-nach-finish`)));
  await page.close();
}
await browser.close();
server.close();