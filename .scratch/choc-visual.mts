import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// Messung der Bewegung nach echtem Scrollen: endliche Animationen werden vor
// jedem Bild abgeschlossen, unendliche pausiert. Zusaetzlich: reduzierte
// Bewegung im Browser und ein Scroll-Sample auf einem Link mit Appear-Klasse.
// Der Lauf ist eine Messung, keine Freigabe.

const ORIGIN = process.env.SENIFY_VISUAL_SOURCE ?? "https://chocolate-attributes-385353.framer.app";
const BUILD = resolve(
  process.env.SENIFY_VISUAL_BUILD ??
    ".scratch/framer-live-2026-11-09/structure-relay6-2026-11-10/relay/before",
);
const OUT = resolve(
  process.env.SENIFY_VISUAL_OUT ?? ".scratch/framer-live-2026-11-09/visual-settle-2026-11-10",
);

if (!existsSync(BUILD)) throw new Error(`Build fehlt: ${BUILD}`);
if (existsSync(OUT)) throw new Error(`Ausgabe existiert schon, nichts ueberschreiben: ${OUT}`);

const SEITEN = ["/", "/about", "/price", "/contact"] as const;
const BREITEN = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobil", width: 390, height: 844 },
] as const;
const LINK_SAMPLE = { seite: "/__keine__", nodeId: "kein-sample" } as const;

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

type Settle = { endlich: number; unendlich: number; fehlgeschlagen: number };

async function scrollDurch(page: import("playwright").Page): Promise<void> {
  try {
    await mitZeitgrenze(
      page.evaluate(async () => {
        await document.fonts.ready;
        const step = Math.max(320, window.innerHeight * 0.8);
        const limit = Math.min(document.body.scrollHeight, 16000);
        for (let y = 0; y < limit; y += step) {
          window.scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        window.scrollTo(0, 0);
        await new Promise((done) => setTimeout(done, 800));
      }),
      45_000,
      "Scrollen",
    );
  } catch (error) {
    console.warn(`Scrollen uebersprungen: ${(error as Error).message}`);
  }
}

async function animationenAbschliessen(page: import("playwright").Page): Promise<Settle> {
  return page.evaluate(() => {
    let endlich = 0;
    let unendlich = 0;
    let fehlgeschlagen = 0;
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getTiming?.();
      try {
        if (timing && timing.iterations === Infinity) {
          animation.pause();
          unendlich += 1;
        } else {
          animation.finish();
          endlich += 1;
        }
      } catch {
        fehlgeschlagen += 1;
      }
    }
    return { endlich, unendlich, fehlgeschlagen };
  });
}

async function bilderFertig(page: import("playwright").Page): Promise<void> {
  try {
    await mitZeitgrenze(
      page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images)
            .filter((image) => !image.complete)
            .map(
              (image) =>
                new Promise((done) => {
                  image.onload = () => done(undefined);
                  image.onerror = () => done(undefined);
                  setTimeout(() => done(undefined), 4000);
                }),
            ),
        );
      }),
      10_000,
      "Bilder",
    );
  } catch (error) {
    console.warn(`Bilder uebersprungen: ${(error as Error).message}`);
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
      "Endliche Animationen werden vor jedem Bild abgeschlossen, unendliche pausiert; der Animationszustand steht je Paar im Bericht.",
      "Abschnitte werden nach echtem Scrollen als Viewport-Bilder verglichen, nicht als ein Ganzseitenbild.",
      "Die Originalquelle ist live und kann sich zwischen Laeufen aendern.",
    ],
  },
  paare: {},
  abschnitte: {},
  reduzierteBewegung: {},
  linkSample: {},
};

try {
  await mkdir(OUT, { recursive: true });
  const normal = await browser.newContext({ deviceScaleFactor: 1 });
  for (const pagePath of SEITEN) {
    for (const breite of BREITEN) {
      const paarDir = join(OUT, pagePath === "/" ? "start" : pagePath.replace(/^\/+|\/+$/g, ""), breite.name);
      await mkdir(paarDir, { recursive: true });
      const buildSeite = await normal.newPage();
      const originalSeite = await normal.newPage();
      buildSeite.setDefaultTimeout(90_000);
      originalSeite.setDefaultTimeout(90_000);
      await buildSeite.setViewportSize({ width: breite.width, height: breite.height });
      await originalSeite.setViewportSize({ width: breite.width, height: breite.height });

      const buildUrl = `${url}${pagePath === "/" ? "/" : `${pagePath}/`}`;
      const originalUrl = `${ORIGIN}${pagePath}`;
      await buildSeite.goto(buildUrl, { waitUntil: "load" });
      await originalSeite.goto(originalUrl, { waitUntil: "load" });
      await scrollDurch(buildSeite);
      await scrollDurch(originalSeite);
      await bilderFertig(buildSeite);
      await bilderFertig(originalSeite);

      const buildSettle = await animationenAbschliessen(buildSeite);
      const originalSettle = await animationenAbschliessen(originalSeite);

      const buildTop = await buildSeite.screenshot({ timeout: 60_000 });
      const originalTop = await originalSeite.screenshot({ timeout: 60_000 });
      await writeFile(join(paarDir, "build-top.png"), buildTop);
      await writeFile(join(paarDir, "original-top.png"), originalTop);

      const buildPng = PNG.sync.read(buildTop);
      const originalPng = PNG.sync.read(originalTop);
      const paare = result.paare as Record<string, unknown>;
      paare[`${pagePath}@${breite.name}`] = {
        build: buildUrl,
        original: originalUrl,
        breite: breite.width,
        buildSettle,
        originalSettle,
        differenzErsterBildschirmProzent: differenz(originalPng, buildPng),
        buildHoehe: await buildSeite.evaluate(() => document.body.scrollHeight),
        originalHoehe: await originalSeite.evaluate(() => document.body.scrollHeight),
      };

      const hoehe = Math.min(
        await buildSeite.evaluate(() => document.body.scrollHeight),
        await originalSeite.evaluate(() => document.body.scrollHeight),
      );
      const abschnitte = result.abschnitte as Record<string, unknown>;
      const schritte: Record<string, unknown>[] = [];
      const step = Math.max(320, Math.round(breite.height * 0.8));
      let index = 0;
      for (let y = 0; y < hoehe; y += step) {
        await buildSeite.evaluate((wert) => window.scrollTo(0, wert), y);
        await originalSeite.evaluate((wert) => window.scrollTo(0, wert), y);
        await buildSeite.waitForTimeout(350);
        await originalSeite.waitForTimeout(350);
        // Lazy-Bilder laden erst beim Scrollen; ohne Warten fehlen sie im Bild.
        await bilderFertig(buildSeite);
        await bilderFertig(originalSeite);
        await animationenAbschliessen(buildSeite);
        await animationenAbschliessen(originalSeite);
        const buildShot = await buildSeite.screenshot({ timeout: 60_000 });
        const originalShot = await originalSeite.screenshot({ timeout: 60_000 });
        await writeFile(join(paarDir, `build-abschnitt-${index}.png`), buildShot);
        await writeFile(join(paarDir, `original-abschnitt-${index}.png`), originalShot);
        const sichtbar = await buildSeite.evaluate(() => {
          const appear = Array.from(document.querySelectorAll('[class*="-appear-"]')).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < window.innerHeight;
          });
          return {
            appearImBild: appear.length,
            sichtbar: appear.filter((el) => Number(getComputedStyle(el).opacity) > 0.5).length,
            namen: Array.from(new Set(appear.map((el) => getComputedStyle(el).animationName))).slice(0, 6),
          };
        });
        schritte.push({
          y,
          differenzProzent: differenz(PNG.sync.read(originalShot), PNG.sync.read(buildShot)),
          ...sichtbar,
        });
        index += 1;
      }
      abschnitte[`${pagePath}@${breite.name}`] = { hoehe, schritte };

      if (pagePath === LINK_SAMPLE.seite && breite.name === "desktop") {
        const linkSample = result.linkSample as Record<string, unknown>;
        const linkSeite = await normal.newPage();
        await linkSeite.setViewportSize({ width: breite.width, height: breite.height });
        await linkSeite.goto(buildUrl, { waitUntil: "load" });
        const messen = async () =>
          linkSeite.evaluate((nodeId) => {
            const link = document.querySelector(`[data-node-id="${nodeId}"]`);
            if (!link) return { gefunden: false };
            const style = getComputedStyle(link);
            const rect = link.getBoundingClientRect();
            return {
              gefunden: true,
              text: link.textContent?.trim().replace(/\s+/g, " ").slice(0, 60),
              opacity: Number(style.opacity),
              animationName: style.animationName,
              animationPlayState: style.animationPlayState,
              imBild: rect.bottom > 0 && rect.top < window.innerHeight,
              laufende: link.getAnimations().map((animation) => ({
                currentTime: animation.currentTime,
                playState: animation.playState,
                timing: animation.effect?.getTiming?.(),
              })),
            };
          }, LINK_SAMPLE.nodeId);
        const verlauf: Record<string, unknown>[] = [];
        let vorherMs = 0;
        for (const ms of [50, 250, 600, 1000, 1600]) {
          await linkSeite.waitForTimeout(ms - vorherMs);
          vorherMs = ms;
          verlauf.push({ nachMs: ms, ...(await messen()) });
        }
        await linkSeite.evaluate((nodeId) => {
          const link = document.querySelector(`[data-node-id="${nodeId}"]`);
          link?.scrollIntoView({ block: "center", behavior: "instant" });
        }, LINK_SAMPLE.nodeId);
        await linkSeite.waitForTimeout(1200);
        const nachScroll = await messen();
        await writeFile(join(paarDir, "link-sample.png"), await linkSeite.screenshot({ timeout: 60_000 }));
        linkSample.desktop = { nodeId: LINK_SAMPLE.nodeId, verlauf, nachScroll };
        await linkSeite.close();
      }

      await buildSeite.close();
      await originalSeite.close();
      console.log(`fertig: ${pagePath} @ ${breite.name}`);
    }
  }

  const reduce = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: "reduce" });
  const buildSeite = await reduce.newPage();
  await buildSeite.setViewportSize({ width: 1440, height: 900 });
  await buildSeite.goto(`${url}/`, { waitUntil: "load" });
  await buildSeite.waitForTimeout(1500);
  const reduziert = await buildSeite.evaluate(() => {
    const appear = Array.from(document.querySelectorAll('[class*="-appear-"]'));
    const gemessen = appear.map((el) => {
      const style = getComputedStyle(el);
      return { animationName: style.animationName, opacity: Number(style.opacity) };
    });
    return {
      elemente: gemessen.length,
      animationAus: gemessen.filter((wert) => wert.animationName === "none").length,
      volleDeckkraft: gemessen.filter((wert) => wert.opacity >= 0.99).length,
      abweichend: gemessen.filter((wert) => wert.animationName !== "none" || wert.opacity < 0.99).slice(0, 5),
    };
  });
  await writeFile(join(OUT, "reduziert-top.png"), await buildSeite.screenshot({ timeout: 60_000 }));
  const reduzierteBewegung = result.reduzierteBewegung as Record<string, unknown>;
  reduzierteBewegung["/@desktop"] = reduziert;
  await buildSeite.close();
  await reduce.close();

  await writeFile(join(OUT, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}

