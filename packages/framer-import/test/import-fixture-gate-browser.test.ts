import { listenReachable } from "@senify/core/net";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { captureScreenshots, diffScreenshots, VISUAL_VIEWPORTS, type Breakpoint } from "@senify/analysis-worker";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { chromium } from "playwright";
import { runImport } from "../src/index.ts";

// The import gate on the REAL Framer exports (the three fixtures in
// `fixtures/`), not on a hand-made page. Each export is imported in fidelity
// mode, baked, and compared with the original at the three Senify viewports:
//
//   - content that must survive: text, links, background boxes,
//   - proportions that catch the failure modes seen in S0/S5b: per-breakpoint
//     copies stacking up (page 2–5× too tall, text doubled) and styles that
//     never arrive (page collapsed, links gone),
//   - a pixel-difference ceiling per fixture and breakpoint.
//
// The ceilings are a RATCHET. They sit a few points above what the importer
// reaches today; lower them whenever the importer gets better, never raise
// them to make a regression pass.
//
// Both sides are compared in their settled state: scripts are removed from the
// original and the appear start states neutralised, because the import maps
// motion separately and a static screenshot must not depend on a script.
//
// Both sides also draw the same glyphs. The original declares `Inter` as a web
// font from Framer's CDN; where the file cannot be loaded (sandbox, offline) the
// page falls back to a system font, where it can (CI) it shows Inter. The bake
// carries its own Inter files and always shows Inter. Compared like that, a
// heading wraps in one page and not in the other and the numbers follow the
// machine (Football on mobile: 30.7 % in the CI, 17.4 % with the same font).
// So the original loses its CDN faces and gets the very Inter files of the
// bake, and the import gets Framer's `local()` placeholder faces the original
// keeps for `Inter Tight`.

const BROWSER_REQUIRED = process.env["SENIFY_REQUIRE_BROWSER"] === "1";
const BREAKPOINTS: Breakpoint[] = ["desktop", "tablet", "mobile"];

// The tablet width of the main measurement. 900 px lies inside Framer's tablet
// range (810–1199 or 810–1439) AND inside Senify's default one (640–1023), so
// both sides showed the same layout even while the import broke at the
// platform's 1024 / 640. The ceilings below were set at this width and keep
// their meaning.
const WIDTHS: Partial<Record<Breakpoint, number>> = { tablet: 900 };
const widthOf = (breakpoint: Breakpoint): number => WIDTHS[breakpoint] ?? VISUAL_VIEWPORTS[breakpoint].width;

// The second tablet measurement: the platform's own tablet width. Since the
// import carries the source's breakpoints over to the site (ADR-0020) and the
// bake uses them, the import switches to its tablet layout where the original
// does, so 1024 px shows Framer's tablet layout on both sides. Before, the
// import still showed desktop there (it broke at 1023.98) and no importer could
// close a difference between two different layouts. This width has its own
// ratchet, `DIFF_CEILING_PLATFORM_TABLET`.
const PLATFORM_TABLET_WIDTH = VISUAL_VIEWPORTS.tablet.width;
const FIXTURES = resolve(import.meta.dirname, "fixtures");

const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

// Pixel-difference ceilings (share of differing pixels) per breakpoint.
const DIFF_CEILING: Record<string, Record<Breakpoint, number>> = {
  // 17.10.2026: both sides draw the same Inter file, so the numbers no longer follow
  // the machine (identical with and without a system Inter). 18.10.2026: measured
  // 7.7 / 8.9 / 11.7 %, 2.0 / 2.3 / 4.3 % and 6.9 / 7.5 / 17.4 %; the ceilings sit
  // 3 to 4 points above.
  "framer-easier-train-154753": { desktop: 0.11, tablet: 0.12, mobile: 0.15 },
  "framer-fluffy-rectangle-418998": { desktop: 0.06, tablet: 0.06, mobile: 0.08 },
  "framer-stupendous-football-158496": { desktop: 0.1, tablet: 0.11, mobile: 0.21 },
};

// The same ratchet at the platform's tablet width (1024 px), per fixture. Lower
// it whenever the importer gets better, never raise it. Measured 8.3 / 1.9 / 7.6 %.
const DIFF_CEILING_PLATFORM_TABLET: Record<string, number> = {
  "framer-easier-train-154753": 0.12,
  "framer-fluffy-rectangle-418998": 0.06,
  "framer-stupendous-football-158496": 0.11,
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// The original, settled: Framer writes the start state of every reveal inline
// (`opacity:0.001`, `opacity:0`, `transform:translateY(40px)`) and its script
// plays it away. Without the script those elements stay invisible, which would
// make the ORIGINAL look emptier than the page really is. Same rule as the
// importer applies to the import.
function settled(html: string): string {
  return html.replace(/style="([^"]*)"/g, (whole: string, style: string) => {
    const opacity = /(?:^|;)\s*opacity\s*:\s*([0-9.]+)/.exec(style)?.[1];
    if (opacity === undefined || Number(opacity) > 0.01) return whole;
    const next = style
      .replace(/(^|;)\s*opacity\s*:\s*[0-9.]+/, "$1opacity:1")
      .replace(/(^|;)\s*transform\s*:[^;]*/, "$1");
    return `style="${next}"`;
  });
}

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
const hasFontFile = (face: string): boolean => /url\(/.test(face);
const withoutFontFiles = (css: string): string => css.replace(FONT_FACE, (face) => (hasFontFile(face) ? "" : face));
const localFontFaces = (css: string): string => (css.match(FONT_FACE) ?? []).filter((face) => !hasFontFile(face)).join("\n");

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) =>
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

type PageMetrics = { height: number; textChars: number; links: number; boxes: number };

async function metrics(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string,
  breakpoint: Breakpoint,
  width: number = widthOf(breakpoint),
): Promise<PageMetrics> {
  const page = await browser.newPage({ viewport: { width, height: VISUAL_VIEWPORTS[breakpoint].height } });
  try {
    await page.goto(url);
    await page.waitForTimeout(2500);
    // A string: this package's TypeScript has no DOM library, and the code runs
    // in the page anyway.
    return (await page.evaluate(`(() => {
      const visible = (element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const leaves = [...document.querySelectorAll("body *")].filter(
        (element) => element.children.length === 0 && visible(element) && (element.textContent || "").trim() !== "",
      );
      return {
        height: document.documentElement.scrollHeight,
        textChars: leaves.reduce((sum, element) => sum + (element.textContent || "").trim().length, 0),
        links: [...document.querySelectorAll("a[href]")].filter(visible).length,
        boxes: [...document.querySelectorAll("*")].filter(
          (element) => visible(element) && getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)",
        ).length,
      };
    })()`)) as PageMetrics;
  } finally {
    await page.close();
  }
}

describe.skipIf(!browserAvailable && !BROWSER_REQUIRED)("S5 import gate on the real Framer exports", () => {
  for (const fixture of readdirSync(FIXTURES).filter((name) => name.startsWith("framer-"))) {
    it(`${fixture}: content, proportions and pixels stay within the ratchet`, async () => {
      const work = mkdtempSync(join(tmpdir(), "senify-fixture-gate-"));
      const original = join(work, "original");
      const imported = join(work, "imported");
      const servers: { close(): Promise<void> }[] = [];
      const browser = await chromium.launch();
      try {
        cpSync(join(FIXTURES, fixture), original, { recursive: true });
        const html = settled(readFileSync(join(original, "index.html"), "utf8"))
          .replace(/<script[\s\S]*?<\/script>/g, "")
          .replace(
            "</head>",
            "<style>[data-framer-appear-id],[style*='opacity:0.001'],[style*='opacity: 0.001']{opacity:1!important;transform:none!important}</style></head>",
          );
        writeFileSync(join(original, "index.html"), withoutFontFiles(html));
        const stylesDir = join(original, "styles");
        if (existsSync(stylesDir)) {
          for (const sheet of readdirSync(stylesDir).filter((name) => name.endsWith(".css"))) {
            const path = join(stylesDir, sheet);
            writeFileSync(path, withoutFontFiles(readFileSync(path, "utf8")));
          }
        }

        const run = await runImport({ source: { kind: "mirror", rootDir: join(FIXTURES, fixture) }, mode: "fidelity" });
        const resolved = resolveTheme(defaultTheme());
        await bakeSite(
          {
            siteName: fixture,
            baseUrl: "https://gate.local",
            ...(run.breakpoints === null ? {} : { breakpoints: run.breakpoints }),
            pages: [{ id: "page", path: "/", title: fixture, tree: editorDocumentToNodeTree(run.mapped.document) }],
            themeCss: emitCss(resolved),
            styleRules: run.mapped.rules,
            motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
            aeo: false,
          },
          { outDir: imported, selfContained: true },
        );
        const importedHtml = join(imported, "index.html");
        writeFileSync(
          importedHtml,
          readFileSync(importedHtml, "utf8").replace("</head>", `<style>${localFontFaces(html)}</style></head>`),
        );

        const fontDir = join(original, "gate-fonts");
        mkdirSync(fontDir, { recursive: true });
        const interFaces = [400, 500, 600].map((weight) => {
          cpSync(join(imported, "assets", `inter-${weight}.woff2`), join(fontDir, `inter-${weight}.woff2`));
          return `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};src:url(gate-fonts/inter-${weight}.woff2) format("woff2")}`;
        });
        const originalHtml = join(original, "index.html");
        writeFileSync(originalHtml, readFileSync(originalHtml, "utf8").replace("</head>", `<style>${interFaces.join("")}</style></head>`));

        const [originalServer, importedServer] = await Promise.all([serve(original), serve(imported)]);
        servers.push(originalServer, importedServer);
        const shots = join(work, "shots");
        mkdirSync(shots, { recursive: true });
        const before = await captureScreenshots({ url: `${originalServer.url}/index.html`, outDir: join(shots, "original"), breakpoints: BREAKPOINTS, widths: WIDTHS, motion: "live", settleMs: 300 });
        // The baked page keeps its motion targets hidden until the runtime has
        // released them (after fonts and images, or a timer when they never
        // settle); a screenshot taken earlier misses headlines the page has.
        const after = await captureScreenshots({ url: `${importedServer.url}/index.html`, outDir: join(shots, "imported"), breakpoints: BREAKPOINTS, widths: WIDTHS, motion: "off", settleMs: 2500 });

        const ceilings = DIFF_CEILING[fixture];
        expect(ceilings, `${fixture} needs an entry in DIFF_CEILING`).toBeDefined();
        const lines: string[] = [];
        for (const breakpoint of BREAKPOINTS) {
          const a = before.find((shot) => shot.breakpoint === breakpoint);
          const b = after.find((shot) => shot.breakpoint === breakpoint);
          expect(a !== undefined && b !== undefined).toBe(true);
          const diff = await diffScreenshots({ before: (a as { path: string }).path, after: (b as { path: string }).path, outDir: join(shots, "diff"), name: breakpoint, threshold: 24 });
          const was = await metrics(browser, `${originalServer.url}/index.html`, breakpoint);
          const now = await metrics(browser, `${importedServer.url}/index.html`, breakpoint);
          lines.push(`${breakpoint}: diff ${(diff.ratio * 100).toFixed(1)}% height ${was.height}->${now.height} text ${was.textChars}->${now.textChars} links ${was.links}->${now.links} boxes ${was.boxes}->${now.boxes}`);
          const context = `${fixture} @${breakpoint}\n${lines.join("\n")}`;
          // Copies stacking up show as a page far too tall and doubled text.
          expect(now.height / was.height, context).toBeLessThan(1.6);
          expect(now.textChars / was.textChars, context).toBeLessThan(1.6);
          // Content that must not disappear.
          expect(now.textChars / was.textChars, context).toBeGreaterThan(0.6);
          // Every link survives (measured 0.98–1.0 on all three exports).
          expect(now.links / Math.max(was.links, 1), context).toBeGreaterThan(0.9);
          expect(now.boxes / Math.max(was.boxes, 1), context).toBeGreaterThan(0.6);
          expect(diff.ratio, context).toBeLessThanOrEqual((ceilings as Record<Breakpoint, number>)[breakpoint]);
        }

        // The platform's own tablet width: only meaningful because the bake
        // used the source's breakpoints.
        const wideWidths = { tablet: PLATFORM_TABLET_WIDTH };
        const wideBefore = await captureScreenshots({ url: `${originalServer.url}/index.html`, outDir: join(shots, "original-wide"), breakpoints: ["tablet"], widths: wideWidths, motion: "live", settleMs: 300 });
        const wideAfter = await captureScreenshots({ url: `${importedServer.url}/index.html`, outDir: join(shots, "imported-wide"), breakpoints: ["tablet"], widths: wideWidths, motion: "off", settleMs: 2500 });
        const wa = wideBefore.find((shot) => shot.breakpoint === "tablet");
        const wb = wideAfter.find((shot) => shot.breakpoint === "tablet");
        expect(wa !== undefined && wb !== undefined).toBe(true);
        const wideDiff = await diffScreenshots({ before: (wa as { path: string }).path, after: (wb as { path: string }).path, outDir: join(shots, "diff"), name: "tablet-platform", threshold: 24 });
        const wideWas = await metrics(browser, `${originalServer.url}/index.html`, "tablet", PLATFORM_TABLET_WIDTH);
        const wideNow = await metrics(browser, `${importedServer.url}/index.html`, "tablet", PLATFORM_TABLET_WIDTH);
        lines.push(`tablet@${PLATFORM_TABLET_WIDTH}: diff ${(wideDiff.ratio * 100).toFixed(1)}% height ${wideWas.height}->${wideNow.height} text ${wideWas.textChars}->${wideNow.textChars} links ${wideWas.links}->${wideNow.links} boxes ${wideWas.boxes}->${wideNow.boxes}`);
        const wideContext = `${fixture} @tablet ${PLATFORM_TABLET_WIDTH}px\n${lines.join("\n")}`;
        expect(wideNow.height / wideWas.height, wideContext).toBeLessThan(1.6);
        expect(wideNow.textChars / wideWas.textChars, wideContext).toBeLessThan(1.6);
        expect(wideNow.textChars / wideWas.textChars, wideContext).toBeGreaterThan(0.6);
        expect(wideNow.links / Math.max(wideWas.links, 1), wideContext).toBeGreaterThan(0.9);
        expect(wideNow.boxes / Math.max(wideWas.boxes, 1), wideContext).toBeGreaterThan(0.6);
        expect(wideDiff.ratio, wideContext).toBeLessThanOrEqual(DIFF_CEILING_PLATFORM_TABLET[fixture] ?? 0);
        console.log(`\n${fixture}\n${lines.join("\n")}`);
      } finally {
        await browser.close();
        await Promise.all(servers.map((server) => server.close()));
        rmSync(work, { recursive: true, force: true });
      }
    }, 240_000);
  }
});
