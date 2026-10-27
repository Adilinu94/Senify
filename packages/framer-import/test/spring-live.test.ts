// Beweis am echten Browser: die gebackene Seite muss den VERLAUF der Quelle
// zeigen ΓÇö nicht nur "es gibt eine Animation".
//
// Gepr├╝ft wird an der laufenden Seite: die Animation wird auf einen Zeitpunkt
// gesetzt (`currentTime`) und die berechnete Opacity gelesen. Das ist
// deterministisch, nicht von der Uhr abh├ñngig. Die Sollwerte kommen aus
// Framers Rechner (`spring.ts`), die Istwerte aus dem gerenderten Dokument.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { runImport, springEasing, springDurationMs } from "../src/index.ts";

const browserAvailable = process.env["SENIFY_REQUIRE_BROWSER"] === "1";

// A word reveal as the source writes it: four spans, one cascade, a spring.
const STAGGER = [0, 0.05, 0.1, 0.15];
const SPRING = { type: "spring", stiffness: 165, damping: 32, mass: 1 };

const appear = Object.fromEntries(
  STAGGER.map((delay, index) => [
    `word${index}`,
    {
      default: {
        initial: { opacity: 0.001, y: 28, x: 0, scale: 1 },
        animate: { opacity: 1, y: 0, x: 0, scale: 1, transition: { ...SPRING, delay } },
      },
    },
  ]),
);

const html =
  `<html lang="de"><head><title>t</title>` +
  `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(appear)}</script>` +
  `</head><body><div id="main" data-framer-hydrate-v2"><h1>` +
  STAGGER.map(
    (_, index) =>
      `<span data-framer-appear-id="word${index}" style="display:inline-block;opacity:0.001;transform:translateY(28px)">Wort${index}</span>`,
  ).join(" ") +
  `</h1></div></body></html>`;

describe.skipIf(!browserAvailable)("die gebackene Feder l├ñuft wie die Quelle", () => {
  let out = "";
  let css = "";
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | undefined;
  let page: Awaited<ReturnType<NonNullable<typeof browser>["newPage"]>> | undefined;

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "senify-spring-live-"));
    const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
    const resolved = resolveTheme(defaultTheme());
    await bakeSite(
      {
        siteName: "spring",
        baseUrl: "https://spring.local",
        pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
        themeCss: emitCss(resolved),
        styleRules: run.mapped.rules,
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir: out, selfContained: true },
    );
    css = [
      join(out, "index.html"),
      ...readdirSync(join(out, "assets"))
        .filter((name) => name.endsWith(".css"))
        .map((name) => join(out, "assets", name)),
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    const { chromium } = await import("playwright");
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "spring.local") return route.abort();
      const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      try {
        const body = readFileSync(join(out, path));
        const type = path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "text/html";
        await route.fulfill({ status: 200, contentType: type, body });
      } catch {
        await route.fulfill({ status: 404, body: "" });
      }
    });
    await page.goto("https://spring.local/", { waitUntil: "load" });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    if (out !== "") rmSync(out, { recursive: true, force: true });
  });

  it("tr├ñgt die gel├╢ste Kurve als linear() und die Staffelung als Verz├╢gerung", () => {
    // The declaration must be the solved curve, not `ease-out`: a spring is not
    // a timing function, and Framer hands the browser sampled values.
    expect(css).toMatch(/animation:\s*senify-appear-word0-default\s+[\d.]+s\s+linear\(/);
    for (const [index, delay] of STAGGER.entries()) {
      expect(css).toMatch(
        new RegExp(`senify-appear-word${index}-default\\s+[\\d.]+s\\s+linear\\([^)]*\\)\\s*${delay}s both`),
      );
    }
  });

  it("zeigt den Verlauf der Quelle, nicht alle W├╢rter gleichzeitig", async () => {
    // The exact curve the compiler must have written: the longest of this
    // effect's property distances decides the duration (opacity 0.999, 28 px).
    const durationMs = Math.max(springDurationMs(SPRING, 0.001, 1), springDurationMs(SPRING, 0, 28));
    const expected = springEasing(SPRING, durationMs, 30);
    // Sample the compiled `linear()` where the browser will: at the same times.
    const stops = 30;
    const sampleAt = (progress: number): number => {
      const position = Math.min(stops - 1, Math.max(0, progress * (stops - 1)));
      const low = Math.floor(position);
      const high = Math.min(stops - 1, low + 1);
      const mix = position - low;
      return (expected[low] ?? 0) * (1 - mix) + (expected[high] ?? 0) * mix;
    };

    const pageErrors: string[] = [];
    page?.on("pageerror", (error) => pageErrors.push(String(error)));

    type Measurements = { count: number; rows: { time: number; values: (number | null)[] }[] };
    const raw = await page!.evaluate(`(() => {
      const durationMs = ${durationMs};
      const targets = [...document.querySelectorAll('[class*="-appear-"]')];
      const read = (time) => targets.map((element) => {
        // Freeze the entry animation at \`time\` and read what the browser
        // would paint then. \`getAnimations()\` is the browser's own list, so
        // this reads the CSS the page actually carries.
        for (const animation of element.getAnimations()) {
          animation.pause();
          animation.currentTime = time;
        }
        const value = Number.parseFloat(getComputedStyle(element).opacity);
        return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
      });
      const grid = [0, 100, 200, 400, 700, durationMs];
      return JSON.stringify({ count: targets.length, rows: grid.map((time) => ({ time, values: read(time) })) });
    })()`);
    const measurements = JSON.parse(String(raw)) as Measurements;

    expect(pageErrors).toEqual([]);
    expect(measurements.count).toBe(4);
    // The words must NOT all carry the same value: that was the defect this
    // whole path exists to remove (measured 26.10.2026: all four at 1.0).
    const at100 = measurements.rows.find((row) => row.time === 100)?.values ?? [];
    const distinct = new Set(at100.filter((value): value is number => value !== null));
    expect(distinct.size).toBeGreaterThan(1);

    // And the values must follow the solved curve. Every word is the same curve
    // shifted by its delay; a word that has not started yet stays at its start
    // state (0.001).
    const deviations: string[] = [];
    for (const entry of measurements.rows) {
      for (const [index, value] of entry.values.entries()) {
        if (value === null) continue;
        const delayMs = (STAGGER[index] ?? 0) * 1000;
        const local = entry.time - delayMs;
        const wanted = local <= 0 ? 0.001 : Math.min(1, 0.001 + 0.999 * sampleAt(Math.min(1, local / durationMs)));
        if (Math.abs(value - wanted) > 0.03) {
          deviations.push(`Wort ${index} @${entry.time} ms: ${value} statt ${wanted.toFixed(3)}`);
        }
      }
    }
    expect(deviations.slice(0, 6)).toEqual([]);
  }, 90_000);
});
