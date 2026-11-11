import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const BUILD = resolve(".scratch/framer-live-2026-11-09/structure-relay6-2026-11-10/relay/before");
const ORIGIN = "https://gracious-balance-599544.framer.app";

if (!existsSync(BUILD)) throw new Error(`Build fehlt: ${BUILD}`);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://local").pathname;
    const withIndex = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = normalize(join(root, decodeURIComponent(withIndex)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("not found");
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

const { server, url } = await serve(BUILD);
const browser = await chromium.launch({ headless: true });

async function sammeln(page: import("playwright").Page): Promise<Map<string, object>> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of Array.from(document.images)) image.loading = "eager";
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
    const step = Math.max(320, window.innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.body.scrollHeight, 16000); y += step) {
      window.scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 100));
    }
    window.scrollTo(0, 0);
    await new Promise((done) => setTimeout(done, 1200));
  });
  const liste = await page.evaluate(() => {
    return Array.from(document.images).map((image) => {
      const rect = image.getBoundingClientRect();
      const src = image.getAttribute("src") ?? "";
      const schluessel = src.split("/").pop()?.split("?")[0] ?? "";
      return {
        schluessel,
        box: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        natural: [image.naturalWidth, image.naturalHeight],
        nodeId: image.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null,
      };
    });
  });
  const map = new Map<string, object>();
  for (const eintrag of liste) {
    if (!eintrag.schluessel) continue;
    const vorhanden = map.get(eintrag.schluessel) as { box: number[]; anzahl: number } | undefined;
    if (vorhanden === undefined) {
      map.set(eintrag.schluessel, { ...eintrag, anzahl: 1 });
      continue;
    }
    vorhanden.anzahl += 1;
    const flaeche = eintrag.box[2] * eintrag.box[3];
    const alteFlaeche = vorhanden.box[2] * vorhanden.box[3];
    if (flaeche > alteFlaeche) map.set(eintrag.schluessel, { ...eintrag, anzahl: vorhanden.anzahl });
  }
  return map;
}

try {
  for (const breite of [768, 390]) {
    const context = await browser.newContext({ viewport: { width: breite, height: 1024 } });
    const buildSeite = await context.newPage();
    const originalSeite = await context.newPage();
    await buildSeite.goto(`${url}/`, { waitUntil: "load" });
    await originalSeite.goto(`${ORIGIN}/`, { waitUntil: "load" });
    const build = await sammeln(buildSeite);
    const original = await sammeln(originalSeite);
    console.log(`== ${breite}px ==`);
    console.log(`Bilder build=${build.size} original=${original.size}`);
    let abweichend = 0;
    for (const [schluessel, wert] of build) {
      const gegen = original.get(schluessel);
      if (!gegen) {
        console.log(`nur im Build: ${schluessel}`);
        continue;
      }
      const a = wert as { box: number[]; nodeId: string | null; anzahl: number };
      const b = gegen as { box: number[]; anzahl: number };
      const delta = a.box.map((zahl, index) => Math.round(zahl - b.box[index]));
      if (delta.some((zahl) => Math.abs(zahl) > 5)) {
        abweichend += 1;
        console.log(`abweichend ${schluessel}: build=${a.box.join("x")} (${a.anzahl}x) original=${b.box.join("x")} (${b.anzahl}x) delta=${delta.join(",")} node=${a.nodeId}`);
      }
    }
    console.log(`Abweichende Bilder: ${abweichend}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
