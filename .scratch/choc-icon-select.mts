// Befund 7: Sichtabweichungen /price (Check-Icons) und /contact (Select-Defaults).
// Vergleicht Original und Build live im Browser:
//  - /price:  Icon-Mechanismus (mask + background-color vs. SVG-fill/stroke)
//  - /contact: native selects und ihre Vorauswahl
import { writeFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const BUILD = resolve("C:/Users/adini/.senify/previews/H-OXzxq_XvLirh");
if (!existsSync(BUILD)) throw new Error(`Build fehlt: ${BUILD}`);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
      let file = normalize(join(root, pathname));
      if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
      if (pathname.endsWith("/") || !extname(file)) file = join(file, "index.html");
      const data = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      response.end(data);
    } catch {
      response.writeHead(404); response.end("not found");
    }
  });
  return new Promise((complete) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("kein Port");
      complete({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function settle(page: import("playwright").Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const height = document.body.scrollHeight;
    for (let y = 0; y < height; y += 600) { window.scrollTo(0, y); await sleep(60); }
    window.scrollTo(0, 0); await sleep(400);
  });
  await page.waitForTimeout(1200);
}

const ICON_SCRIPT = () => {
  const out: unknown[] = [];
  const svgs = [...document.querySelectorAll('svg[data-name="symbol"]')];
  for (const svg of svgs.slice(0, 60)) {
    // Das maskierte Element kann das svg selbst oder ein Vorfahr sein.
    let masked: Element | null = null;
    let cur: Element | null = svg;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      if ((cs.maskImage && cs.maskImage !== "none") || (cs.webkitMaskImage && cs.webkitMaskImage !== "none")) { masked = cur; break; }
      cur = cur.parentElement;
    }
    const cs = getComputedStyle(svg);
    const path = svg.querySelector("path");
    const pcs = path ? getComputedStyle(path) : null;
    const host = masked ?? svg;
    const hcs = getComputedStyle(host);
    out.push({
      node: svg.getAttribute("data-node-id") ?? svg.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null,
      viewBox: svg.getAttribute("viewBox"),
      maskiert: masked !== null,
      maskElementTag: host.tagName,
      maskImage: (hcs.maskImage || hcs.webkitMaskImage || "").slice(0, 90),
      maskVarAufHost: hcs.getPropertyValue("--framer-icon-mask").slice(0, 90),
      backgroundHost: hcs.backgroundColor,
      svgOpacity: cs.opacity,
      svgDisplay: cs.display,
      pathFill: pcs?.fill ?? null,
      pathFillOpacity: pcs?.fillOpacity ?? null,
      pathStroke: pcs?.stroke ?? null,
      inlineStyle: (svg.getAttribute("style") ?? "").slice(0, 200),
      hostInlineStyle: (host.getAttribute("style") ?? "").slice(0, 200),
    });
  }
  return { anzahl: svgs.length, icons: out };
};

const SELECT_SCRIPT = () => {
  const out: unknown[] = [];
  for (const sel of document.querySelectorAll("select")) {
    out.push({
      name: sel.getAttribute("name"),
      id: sel.id || null,
      node: sel.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null,
      value: sel.value,
      selectedIndex: sel.selectedIndex,
      optionen: [...sel.options].slice(0, 6).map((o) => ({ value: o.value, text: o.textContent?.trim(), selected: o.selected, defaultSelected: o.defaultSelected })),
      anzahlOptionen: sel.options.length,
    });
  }
  // Framer-Formulare sind teils keine nativen selects: auch div-basierte Dropdowns melden.
  const pseudo = [...document.querySelectorAll('[role="combobox"], [role="listbox"]')].map((el) => ({
    tag: el.tagName, role: el.getAttribute("role"), text: el.textContent?.trim().slice(0, 80),
  }));
  return { nativeSelects: out, pseudoDropdowns: pseudo.slice(0, 10) };
};

const { server, url } = await serve(BUILD);
const browser = await chromium.launch({ headless: true });
const ergebnis: Record<string, unknown> = { build: BUILD };
try {
  for (const [label, base] of [["original", ORIGIN], ["build", url]] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${base}/price`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);
    ergebnis[`${label}PriceIcons`] = await page.evaluate(ICON_SCRIPT);
    await page.goto(`${base}/contact`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);
    ergebnis[`${label}ContactSelects`] = await page.evaluate(SELECT_SCRIPT);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(resolve(".scratch/choc-icon-select.json"), JSON.stringify(ergebnis, null, 2));
console.log("geschrieben: .scratch/choc-icon-select.json");
const o = ergebnis.originalPriceIcons as { anzahl: number; icons: Array<Record<string, unknown>> };
const b = ergebnis.buildPriceIcons as { anzahl: number; icons: Array<Record<string, unknown>> };
console.log("Original-Icons:", o.anzahl, "Build-Icons:", b.anzahl);
console.log("Original maskiert:", o.icons.filter((i) => i.maskiert).length, "Build maskiert:", b.icons.filter((i) => i.maskiert).length);
console.log("Beispiel Original:", JSON.stringify(o.icons.find((i) => i.maskiert) ?? o.icons[0], null, 1));
console.log("Beispiel Build:", JSON.stringify(b.icons[0], null, 1));