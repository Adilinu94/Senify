// The browser capture (plan.md S2.1/S2.2): load the live page in Chromium,
// let the SSR markup arrive, settle the page once through its scroll height,
// then ask the running page what it animates — with the probes from
// `probes/` (MIT, see probes/README.md) plus a small scroll sensor of our own
// (S0/B8: elements whose bounding box moves against the scroll position =
// scroll-driven transforms the static channels cannot express).
//
// The result feeds the IR: the SSR-HTML runs through the static capture
// (`captureHtml`), the measured samples land in `document.motion`, and every
// non-mappable interaction stays a finding, never a silent drop.
//
// Playwright stays optional (same contract as the visual harness): the entry
// point lazy-imports it and fails with a clear message when chromium is
// missing. The freeze kill-switch "off" (freeze-spec.md) leaves the runtime
// OFF — the capture measures the settled baseline, not a moving target.

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SenifyError } from "@senify/core";
import { isAllowedBrowserUrl } from "@senify/core/net";
import { captureHtml, type CaptureHtmlInput } from "./capture-html.ts";
import type { FramerIrDocument, IrMotionSample } from "./ir.ts";

/* ------------------------------------------------------------------ types */

export type CaptureBrowserInput = {
  // The page to capture: an http(s) URL or a file:// URL (offline mirror).
  url: string;
  // The export folder for a file:// capture, so linked stylesheets resolve
  // (same meaning as `CaptureHtmlInput.rootDir`).
  rootDir?: string;
  pagePath?: string;
  // Extra milliseconds after the scroll settle.
  settleMs?: number;
  // "off" (default) never starts the runtime's own motion — the capture
  // reads the settled baseline. "live" is the diagnostic mode for S3/S5.
  motion?: "off" | "live";
};

export type BrowserCaptureResult = {
  document: FramerIrDocument;
  // Raw probe evidence for the report: IO registrations, listeners, WAAPI
  // shapes with `iterations: null` (the measured loop form).
  probe: {
    url: string;
    instrumented: boolean;
    io: number;
    listeners: number;
    waapi: { total: number; loops: number };
    lenis: boolean;
    gsap: boolean;
    framer: boolean;
  };
};

/* -------------------------------------------------------------- playwright */

async function loadPlaywright(): Promise<{
  chromium: typeof import("playwright").chromium;
}> {
  try {
    const playwright = await import("playwright");
    return { chromium: playwright.chromium };
  } catch {
    throw new SenifyError(
      "not_found",
      "Playwright ist nicht installiert — der Browser-Capture braucht Chromium",
      { field: "playwright", suggestion: "npx playwright install chromium" },
    );
  }
}

const PROBES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "probes");

function probeSource(name: string): string {
  const path = join(PROBES_DIR, name);
  if (!existsSync(path)) {
    throw new SenifyError("not_found", `Probe fehlt: ${name}`, {
      field: "probes",
      suggestion: `Erwartet unter ${PROBES_DIR} (siehe probes/README.md).`,
    });
  }
  return readFileSync(path, "utf8");
}

/* --------------------------------------------------------- browser slice */

// The structural slice the evaluate callbacks touch (same stance as
// visual.ts: no DOM lib on purpose).
type BrowserSlice = {
  document: { body: { scrollHeight: number } };
  window: { innerHeight: number; scrollTo(x: number, y: number): void };
};

// The frozen baseline (freeze-spec.md, same CSS the visual harness uses):
// `animation: none` stops CSS animations AND removes them from
// `document.getAnimations()`, so the frozen capture measures no WAAPI
// entries at all — the probes count the page's runtime forms only in the
// "live" measurement scenario.
const FREEZE_CSS =
  "*, *::before, *::after { animation: none !important; transition: none !important; } html { scroll-behavior: auto !important; }";

/* --------------------------------------------------------- scroll sensor */

// The scroll sensor (S2.2c): sample every element's bounding box at two
// scroll positions; an element whose viewport-relative position moved
// OPPOSITE to the scroll direction more than a small threshold has a
// scroll-driven transform (parallax/sticky tricks beyond sticky). Measured on
// the Framer pages: the Appear/IO forms dominate, scroll transforms are the
// exception — the sensor exists so they are counted, not assumed.
const SCROLL_SENSOR = `
function senifyScrollSample() {
  const results = [];
  const elements = document.querySelectorAll("main *, #main *");
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.children.length > 0 && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < -rect.height || rect.top > window.innerHeight * 2) continue;
    results.push({
      key: el.getAttribute("data-framer-name") ?? (el.className && typeof el.className === "string" ? el.className.split(" ")[0] : el.tagName.toLowerCase()),
      x: Math.round(rect.left),
      y: Math.round(rect.top),
    });
    if (results.length >= 400) break;
  }
  return results;
}
;window.senifyScrollSample = senifyScrollSample;`;

function scrollDelta(
  before: { key: string; x: number; y: number }[],
  after: { key: string; x: number; y: number }[],
): { key: string; delta: number }[] {
  const afterByKey = new Map(after.map((entry) => [entry.key, entry]));
  const moved: { key: string; delta: number }[] = [];
  for (const entry of before) {
    const next = afterByKey.get(entry.key);
    if (next === undefined) continue;
    // An element without a scroll transform moves WITH the page: its
    // viewport-relative y decreases by exactly the scroll amount. A bigger
    // difference (opposite sign or not matching the scroll distance) is a
    // scroll-driven motion.
    const delta = entry.y - next.y;
    if (Math.abs(delta) > 4) moved.push({ key: entry.key, delta: Math.round(delta) });
  }
  return moved;
}

/* ------------------------------------------------------- motion samples */

// The WAAPI loop form measured in S0 (befund §4): translateX ±4192 px over
// 140 s with `iterations: null` — the ticker marquee. Everything else on the
// Framer pages is Appear/IO.
function samplesOfProbe(probe: Record<string, unknown>): IrMotionSample[] {
  const samples: IrMotionSample[] = [];
  const waapi = Array.isArray(probe.waapi) ? (probe.waapi as Record<string, unknown>[]) : [];
  for (const entry of waapi) {
    const iterations = entry.iterations;
    const isLoop = iterations === Infinity || iterations === "Infinity" || iterations === null;
    samples.push({
      nodeKey: typeof entry.target === "string" ? entry.target : null,
      library: "waapi",
      trigger: isLoop ? "time" : "appear",
      params: {
        duration: typeof entry.duration === "number" ? entry.duration : 0,
        iterations: isLoop ? "endless" : String(iterations ?? "1"),
        ...(typeof entry.name === "string" ? { name: entry.name } : {}),
      },
      raw: JSON.stringify({ name: entry.name, duration: entry.duration, iterations: entry.iterations }),
    });
  }
  const io = Array.isArray(probe.intersectionObservers)
    ? (probe.intersectionObservers as Record<string, unknown>[])
    : [];
  if (io.length > 0) {
    samples.push({
      nodeKey: null,
      library: "framer",
      trigger: "inview",
      params: { registrations: io.length },
      raw: `IntersectionObserver registrations: ${io.length}`,
    });
  }
  if (probe.lenis !== null && probe.lenis !== undefined) {
    samples.push({
      nodeKey: null,
      library: "lenis",
      trigger: "scroll",
      params: {},
      raw: "Lenis smooth-scroll aktiv (Optionen im Probe-Rohdaten-Bericht)",
    });
  }
  return samples;
}

/* ------------------------------------------------------------------ main */

export async function captureBrowser(input: CaptureBrowserInput): Promise<BrowserCaptureResult> {
  const { chromium } = await loadPlaywright();
  const motionSource = probeSource("motion-probe.mjs");
  const tokensSource = probeSource("tokens-probe.mjs");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Every request the page makes - the navigation, its redirects, every
    // sub-resource - passes the address check of ADR-0016. Without it a
    // public page could point the browser at a metadata service or at a
    // service in the LAN (ADR-0022). `file:` stays allowed: the offline
    // mirror reads it on purpose.
    await context.route("**/*", async (route) => {
      const target = route.request().url();
      if (await isAllowedBrowserUrl(target, { allowFile: true })) {
        await route.continue();
        return;
      }
      await route.abort("blockedbyclient");
    });
    await context.addInitScript({
      content:
        `${motionSource}\n${tokensSource}\n${SCROLL_SENSOR}\n;` +
        "window.instrumentMotion = instrumentMotion;" +
        "window.motionProbe = motionProbe;" +
        "window.motionSummary = motionSummary;" +
        "window.tokensProbe = tokensProbe;" +
        "window.__probeReady = true;instrumentMotion();",
    });
    const page = await context.newPage();
    if (input.motion !== "live") {
      await context.addInitScript(() => {
        (globalThis as unknown as { __SENIFY_MOTION__?: string }).__SENIFY_MOTION__ = "off";
      });
      // The CSS freeze (freeze-spec.md): without it the frozen baseline still
      // counts the page's CSS animations in `document.getAnimations()`.
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
    }
    await page.goto(input.url, { waitUntil: "load", timeout: 90_000 });
    if (input.motion !== "live") {
      // The style tag must exist inside the document; inject once more after
      // load in case the first attempt ran before navigation finished.
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
    }

    // Settle once through the scroll height (lazy media, IO triggers), then
    // back to the top — the same pass the motion-lauf measured with.
    const scrollBefore = await page.evaluate("window.senifyScrollSample()") as {
      key: string;
      x: number;
      y: number;
    }[];
    await page.evaluate(async () => {
      const slice = globalThis as unknown as BrowserSlice;
      const step = slice.window.innerHeight;
      for (let y = 0; y < slice.document.body.scrollHeight; y += step) {
        slice.window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      slice.window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await page.waitForTimeout(input.settleMs ?? 1500);
    const scrollAfter = await page.evaluate("window.senifyScrollSample()") as {
      key: string;
      x: number;
      y: number;
    }[];

    const probe = (await page.evaluate(
      "JSON.parse(JSON.stringify(motionProbe()))",
    )) as Record<string, unknown>;
    const ssrHtml = await page.content();

    const io = Array.isArray(probe.intersectionObservers)
      ? (probe.intersectionObservers as unknown[]).length
      : 0;
    const listeners = Array.isArray(probe.listeners)
      ? (probe.listeners as unknown[]).length
      : 0;
    const waapi = Array.isArray(probe.waapi) ? (probe.waapi as Record<string, unknown>[]) : [];
    const lenis = probe.lenis !== null && probe.lenis !== undefined;
    const libraries = (probe.libraries ?? {}) as Record<string, unknown>;

    const moved = scrollDelta(scrollBefore, scrollAfter);
    const samples = samplesOfProbe(probe);
    for (const entry of moved.slice(0, 20)) {
      samples.push({
        nodeKey: entry.key,
        library: "framer",
        trigger: "scroll",
        params: { delta: entry.delta },
        raw: `Bounding-Box-Delta bei Scroll: ${entry.delta}px (Sensor)`,
      });
    }
    // The measured loop form (S0/befund §4) must surface as its finding kind
    // — the static channel fires it for the appear JSON, the probe path
    // fires it here, so the report says it whichever way the loop was seen.
    const endless = waapi.filter(
      (entry) =>
        entry.iterations === Infinity ||
        entry.iterations === "Infinity" ||
        entry.iterations === null,
    );
    if (endless.length > 0) {
      samples.push({
        nodeKey: null,
        library: "framer",
        trigger: "time",
        params: { loops: endless.length },
        raw: `${endless.length} Endlos-Loop(s) im WAAPI-Inventar (iterations endless)`,
      });
    }

    await context.close();

    const capture: CaptureHtmlInput = {
      html: ssrHtml,
      ...(input.rootDir !== undefined ? { rootDir: input.rootDir } : {}),
      url: input.url,
      pagePath: input.pagePath ?? new URL(input.url).pathname,
    };
    const document = captureHtml(capture);
    document.source.kind = "browser";
    document.motion = samples;
    if (endless.length > 0) {
      document.findings.push({
        kind: "loop-animation",
        nodeKey: null,
        message: `${endless.length} Endlos-Loop(s) im WAAPI-Inventar gemessen — der Mapper bildet sie auf Marquee-Presets ab, wo ein Preset passt.`,
        evidence: endless
          .map((entry) => `${entry.name ?? "loop"} (${String(entry.duration ?? "?")}ms)`)
          .join(", "),
        severity: "info",
        suggestion: "Prüfen, ob das marquee-Preset die Loop-Form abbilden kann.",
      });
    }
    return {
      document,
      probe: {
        url: input.url,
        instrumented: probe.instrumented === true,
        io,
        listeners,
        waapi: {
          total: waapi.length,
          loops: waapi.filter(
            (entry) =>
              entry.iterations === Infinity ||
              entry.iterations === "Infinity" ||
              entry.iterations === null,
          ).length,
        },
        lenis,
        gsap: libraries.gsap !== undefined,
        framer: libraries.framer !== undefined,
      },
    };
  } finally {
    await browser.close();
  }
}
