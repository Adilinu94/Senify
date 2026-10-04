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

const BROWSER_REQUIRED = process.env["SENIFY_REQUIRE_BROWSER"] === "1";
const BREAKPOINTS: Breakpoint[] = ["desktop", "tablet", "mobile"];

// The tablet width of THIS gate. Framer's tablet runs 810–1199 px, Senify's
// stops at 1023.98 px, so at the platform's usual 1024 px the original shows
// its tablet layout while the import still shows desktop: two different
// layouts, a difference no importer could close. 900 px lies inside both
// ranges. Importing the site's own breakpoints would lift this restriction.
const WIDTHS: Partial<Record<Breakpoint, number>> = { tablet: 900 };
const widthOf = (breakpoint: Breakpoint): number => WIDTHS[breakpoint] ?? VISUAL_VIEWPORTS[breakpoint].width;
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
  "framer-easier-train-154753": { desktop: 0.17, tablet: 0.26, mobile: 0.37 },
  "framer-fluffy-rectangle-418998": { desktop: 0.7, tablet: 0.4, mobile: 0.42 },
  "framer-stupendous-football-158496": { desktop: 0.35, tablet: 0.33, mobile: 0.52 },
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
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

type PageMetrics = { height: number; textChars: number; links: number; boxes: number };

async function metrics(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string, breakpoint: Breakpoint): Promise<PageMetrics> {
  const page = await browser.newPage({ viewport: { width: widthOf(breakpoint), height: VISUAL_VIEWPORTS[breakpoint].height } });
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
        writeFileSync(join(original, "index.html"), html);

        const run = await runImport({ source: { kind: "mirror", rootDir: join(FIXTURES, fixture) }, mode: "fidelity" });
        const resolved = resolveTheme(defaultTheme());
        await bakeSite(
          {
            siteName: fixture,
            baseUrl: "https://gate.local",
            pages: [{ id: "page", path: "/", title: fixture, tree: editorDocumentToNodeTree(run.mapped.document) }],
            themeCss: emitCss(resolved),
            styleRules: run.mapped.rules,
            motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
            aeo: false,
          },
          { outDir: imported, selfContained: true },
        );

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
        console.log(`\n${fixture}\n${lines.join("\n")}`);
      } finally {
        await browser.close();
        await Promise.all(servers.map((server) => server.close()));
        rmSync(work, { recursive: true, force: true });
      }
    }, 240_000);
  }
});
