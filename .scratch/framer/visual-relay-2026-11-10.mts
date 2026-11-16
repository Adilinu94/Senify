import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// Vergleich der strukturierten Ausgabe mit der Originalquelle bei drei Breiten.
// Der Lauf ist eine Messung, keine Freigabe: Bewegung, Hover und echte
// Editoraenderungen sind nicht Teil dieses Belegs.

const ORIGIN = process.env.SENIFY_VISUAL_SOURCE ?? "https://gracious-balance-599544.framer.app";
const BUILD = resolve(
  process.env.SENIFY_VISUAL_BUILD ??
    ".scratch/framer-live-2026-11-09/structure-relay-2026-11-10/relay/before",
);
const OUT = resolve(
  process.env.SENIFY_VISUAL_OUT ?? ".scratch/framer-live-2026-11-09/visual-relay-2026-11-10",
);

if (!existsSync(BUILD)) throw new Error(`Build fehlt: ${BUILD}`);
if (existsSync(OUT)) throw new Error(`Ausgabe existiert schon, nichts ueberschreiben: ${OUT}`);

const SEITEN = ["/", "/contact"] as const;
const BREITEN = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobil", width: 390, height: 844 },
] as const;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".ico": "image/x-icon",
};

function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://local").pathname;
    const withIndex = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = normalize(join(root, decodeURIComponent(withIndex)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403, { "content-type": "text/plain" });
      response.end("forbidden");
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
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

function crop(png: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const from = y * png.width * 4;
    png.data.copy(out.data, y * width * 4, from, from + width * 4);
  }
  return out;
}

function differenz(before: PNG, after: PNG, height?: number): number {
  const width = Math.min(before.width, after.width);
  const heightOf = Math.min(height ?? Number.MAX_SAFE_INTEGER, before.height, after.height);
  const a = crop(before, width, heightOf);
  const b = crop(after, width, heightOf);
  const diff = new PNG({ width, height: heightOf });
  const pixels = pixelmatch(a.data, b.data, diff.data, width, heightOf, {
    threshold: 0.12,
    includeAA: false,
  });
  return Math.round((pixels / (width * heightOf)) * 100000) / 1000;
}

async function mitZeitgrenze<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} nach ${ms}ms`)), ms)),
  ]);
}

async function vorbereiten(page: import("playwright").Page): Promise<void> {
  try {
    await mitZeitgrenze(
      page.evaluate(async () => {
        await document.fonts.ready;
        const step = Math.max(320, window.innerHeight * 0.8);
        const limit = Math.min(document.body.scrollHeight, 14000);
        for (let y = 0; y < limit; y += step) {
          window.scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        window.scrollTo(0, 0);
        await new Promise((done) => setTimeout(done, 700));
        await Promise.all(
          Array.from(document.images)
            .filter((image) => !image.complete)
            .map(
              (image) =>
                new Promise((done) => {
                  image.onload = done;
                  image.onerror = done;
                }),
            ),
        );
      }),
      30_000,
      "Vorbereitung",
    );
  } catch (error) {
    console.warn(`Vorbereitung uebersprungen: ${(error as Error).message}`);
  }
}

const { server, url } = await serve(BUILD);
const browser = await chromium.launch({ headless: true });
const result: Record<string, unknown> = {
  meta: {
    origin: ORIGIN,
    build: BUILD,
    ausgabe: OUT,
    gemessen: new Date().toISOString(),
    grenzen: [
      "Nur Scrollposition 0 und der aufbereitete Seitenanfang.",
      "Bewegung, Hover und echte Editoraenderungen sind nicht Teil dieses Belegs.",
      "Die Originalquelle ist live und kann sich zwischen Laeufen aendern.",
    ],
  },
  paare: {},
};

try {
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  for (const pagePath of SEITEN) {
    for (const breite of BREITEN) {
      const paarDir = join(OUT, pagePath === "/" ? "start" : pagePath.replace(/^\/+|\/+$/g, ""), breite.name);
      await mkdir(paarDir, { recursive: true });
      const buildSeite = await context.newPage();
      const originalSeite = await context.newPage();
      const buildFehler: string[] = [];
      const originalFehler: string[] = [];
      const buildNetz: string[] = [];
      const originalNetz: string[] = [];
      buildSeite.on("console", (message) => {
        if (message.type() === "error" && buildFehler.length < 20) buildFehler.push(message.text());
      });
      originalSeite.on("console", (message) => {
        if (message.type() === "error" && originalFehler.length < 20) originalFehler.push(message.text());
      });
      buildSeite.on("requestfailed", (request) => {
        if (buildNetz.length < 20) buildNetz.push(`${request.url()} ${request.failure()?.errorText ?? ""}`);
      });
      originalSeite.on("requestfailed", (request) => {
        if (originalNetz.length < 20) originalNetz.push(`${request.url()} ${request.failure()?.errorText ?? ""}`);
      });
      buildSeite.setDefaultTimeout(90_000);
      originalSeite.setDefaultTimeout(90_000);
      await buildSeite.setViewportSize({ width: breite.width, height: breite.height });
      await originalSeite.setViewportSize({ width: breite.width, height: breite.height });

      const buildUrl = `${url}${pagePath === "/" ? "/" : `${pagePath}/`}`;
      const originalUrl = `${ORIGIN}${pagePath}`;
      await buildSeite.goto(buildUrl, { waitUntil: "load" });
      await originalSeite.goto(originalUrl, { waitUntil: "load" });
      await vorbereiten(buildSeite);
      await vorbereiten(originalSeite);

      const buildTop = await buildSeite.screenshot({ timeout: 60_000 });
      const originalTop = await originalSeite.screenshot({ timeout: 60_000 });
      const buildFull = await buildSeite.screenshot({ fullPage: true, timeout: 60_000 });
      const originalFull = await originalSeite.screenshot({ fullPage: true, timeout: 60_000 });

      await writeFile(join(paarDir, "build-top.png"), buildTop);
      await writeFile(join(paarDir, "original-top.png"), originalTop);
      await writeFile(join(paarDir, "build-full.png"), buildFull);
      await writeFile(join(paarDir, "original-full.png"), originalFull);

      const buildPng = PNG.sync.read(buildFull);
      const originalPng = PNG.sync.read(originalFull);
      const topBuild = PNG.sync.read(buildTop);
      const topOriginal = PNG.sync.read(originalTop);
      const paare = result.paare as Record<string, unknown>;
      paare[`${pagePath}@${breite.name}`] = {
        build: buildUrl,
        original: originalUrl,
        breite: breite.width,
        buildHoehe: buildPng.height,
        originalHoehe: originalPng.height,
        differenzGanzseiteProzent: differenz(originalPng, buildPng),
        differenzErsterBildschirmProzent: differenz(topOriginal, topBuild),
        buildFehler,
        originalFehler,
        buildNetz,
        originalNetz,
      };
      await buildSeite.close();
      await originalSeite.close();
      console.log(`fertig: ${pagePath} @ ${breite.name}`);
    }
  }
  await writeFile(join(OUT, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
