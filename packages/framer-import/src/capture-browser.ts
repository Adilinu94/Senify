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
import { blockedAddressError, isAllowedBrowserUrl } from "@senify/core/net";
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

// The IR keys every node `n<ordinal>`; the running page has no such attribute,
// so a probe that reports `data-framer-name` or a class name can never address
// an IR node (measured 22.10.2026: 0 of 24 / 29 / 66 scroll samples landed).
//
// This stamp mirrors `toIrNode` exactly and runs in the page: pre-order over
// `#main`'s element tree, an ordinal per VISITED element (the dissolved
// `ssr-variant` wrapper consumes one, its child the next), `style`/`script`/
// `noscript`/`template` never visited. The attributes are removed again before
// `page.content()`, so the static capture reads the page unchanged.
const KEY_STAMP = `
function senifyStampKeys() {
  const SKIP = new Set(["style", "script", "noscript", "template"]);
  let ordinal = 0;
  const visit = (el) => {
    ordinal += 1;
    el.setAttribute("data-senify-ir-key", "n" + ordinal);
    const classes = typeof el.className === "string" ? el.className.split(/\\s+/) : [];
    if (classes.includes("ssr-variant") && el.children.length === 1) {
      visit(el.children[0]);
      return;
    }
    for (const child of el.children) {
      if (SKIP.has(child.tagName.toLowerCase())) continue;
      visit(child);
    }
  };
  const main = document.querySelector("#main");
  if (!main) return 0;
  for (const child of main.children) {
    if (SKIP.has(child.tagName.toLowerCase())) continue;
    visit(child);
  }
  return ordinal;
}
function senifyUnstampKeys() {
  for (const el of document.querySelectorAll("[data-senify-ir-key]")) {
    el.removeAttribute("data-senify-ir-key");
  }
}
// The probe names a target as a CSS selector ("#top", "div.framer-1vcihha").
// This index turns that name back into the IR key, and answers null where the
// name is ambiguous: a sample on the wrong node is worse than one that stays
// unattributed.
function senifyKeyIndex() {
  const index = {};
  for (const el of document.querySelectorAll("#main, #main *")) {
    const key = el.getAttribute("data-senify-ir-key");
    if (key === null) continue;
    const classes = typeof el.className === "string" ? el.className.trim() : "";
    const name = el.id
      ? "#" + el.id
      : el.tagName.toLowerCase() + (classes === "" ? "" : "." + classes.split(/\\s+/).slice(0, 3).join("."));
    if (index[name] === undefined) index[name] = key;
    else if (index[name] !== key) index[name] = null;
  }
  return index;
}
;window.senifyStampKeys = senifyStampKeys;window.senifyUnstampKeys = senifyUnstampKeys;window.senifyKeyIndex = senifyKeyIndex;`;

// The scroll sensor (S2.2c): sample every element's bounding box at two
// scroll positions; an element whose viewport-relative position moved
// DIFFERENTLY than the page itself has a scroll-driven transform
// (parallax/pins beyond `position: sticky`). Measured on the Framer pages: the
// Appear/IO forms dominate, scroll transforms are the exception — the sensor
// exists so they are counted, not assumed.
const SCROLL_SENSOR = `
function senifyScrollSample() {
  const results = [];
  const elements = document.querySelectorAll("#main *");
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    const key = el.getAttribute("data-senify-ir-key");
    if (key === null) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = getComputedStyle(el);
    results.push({
      key: key,
      y: Math.round(rect.top + window.scrollY),
      transform: style.transform === "none" ? null : style.transform,
      offset: style.top === "auto" && style.left === "auto" ? null : style.top + "|" + style.left,
    });
    if (results.length >= 400) break;
  }
  return { scrollY: Math.round(window.scrollY), samples: results };
}
;window.senifyScrollSample = senifyScrollSample;`;

// An element held back by a scroll transform shows it DIRECTLY: its computed
// `transform` (or `top`/`left` offset) differs between two scroll positions.
// That is the measurement, not a deduction from box travel.
//
// Measured on the real exports (22.10.2026), the box-travel form reports the
// whole page: Framer's reveal turns `opacity:0.001` on, lazy content arrives,
// the document grows DURING the pass, and `position: fixed`/`absolute` children
// move differently for purely static reasons. A difference in the element's OWN
// transform has none of those failure modes: static CSS produces the same value
// at every scroll offset, and only a script (or a CSS scroll timeline) changes
// it while scrolling.
// `1` would count sub-pixel rounding of a settling layout as motion; `2` is the
// smallest change a scroll transform visibly produces. Measured residue on the
// real exports at 1 px: four nodes with a 1-2 px difference and no animation.
const SCROLL_TOLERANCE_PX = 2;

function scrollDelta(
  before: { scrollY: number; samples: { key: string; y: number; transform: string | null; offset: string | null }[] },
  after: { scrollY: number; samples: { key: string; y: number; transform: string | null; offset: string | null }[] },
): { key: string; delta: number }[] {
  const afterByKey = new Map(after.samples.map((entry) => [entry.key, entry]));
  const moved: { key: string; delta: number }[] = [];
  for (const entry of before.samples) {
    const next = afterByKey.get(entry.key);
    if (next === undefined) continue;
    // The scroll offset itself did not move: nothing could have reacted.
    if (entry.y === next.y) continue;
    const transformChanged = entry.transform !== next.transform;
    const offsetChanged = entry.offset !== next.offset;
    if (!transformChanged && !offsetChanged) continue;
    // A pure rounding wobble is not a scroll effect: the element's own values
    // must differ by more than the tolerance to count.
    const magnitude = Math.abs(entry.y - next.y);
    if (magnitude < SCROLL_TOLERANCE_PX && !transformChanged) continue;
    moved.push({ key: entry.key, delta: Math.round(entry.y - next.y) });
  }
  return moved;
}

/* ------------------------------------------------------- motion samples */

// The WAAPI inventory of a settled page, read as SUPPLEMENT to the appear JSON
// (`captureHtml` already turns `__framer__appearAnimationsContent` into
// `trigger: "appear"` samples with their start values). Measuring the live page
// showed that both channels describe the SAME effects: 2/5/23 appear entries in
// the JSON, 2/5/23 distinct `data-framer-appear-id` targets in the browser, and
// no target the JSON does not name (22.10.2026, all three export fixtures).
//
// A WAAPI entry therefore only becomes a sample when it is a LOOP (the ticker
// form: `iterations: null`, measured in S0/befund §4) or a scroll-driven
// timeline - the two forms the static channels cannot see. Everything else is
// the appearance the JSON already carries in comparable form; reporting it a
// second time, as a bare opacity/transform pair without start values, made the
// mapper drop effects it had just mapped.
function samplesOfProbe(probe: Record<string, unknown>, keyOf: (target: unknown) => string | null): IrMotionSample[] {
  const samples: IrMotionSample[] = [];
  const waapi = Array.isArray(probe.waapi) ? (probe.waapi as Record<string, unknown>[]) : [];
  for (const entry of waapi) {
    const iterations = entry.iterations;
    const isLoop = iterations === Infinity || iterations === "Infinity" || iterations === null;
    const scrollDriven =
      typeof entry.timeline === "string" && /ScrollTimeline|ViewTimeline/.test(entry.timeline);
    if (!isLoop && !scrollDriven) continue;
    samples.push({
      nodeKey: keyOf(entry.target),
      library: "waapi",
      trigger: isLoop ? "time" : "scroll",
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
    //
    // The guard remembers the first address it refused: if the navigation
    // itself was blocked, the failure says so and does not read as a raw
    // `ERR_BLOCKED_BY_CLIENT` (Fachanalyse 2, 3.4).
    let blockedAddress: string | undefined;
    await context.route("**/*", async (route) => {
      const target = route.request().url();
      if (await isAllowedBrowserUrl(target, { allowFile: true })) {
        await route.continue();
        return;
      }
      blockedAddress = target;
      await route.abort("blockedbyclient");
    });
    await context.addInitScript({
      content:
        `${motionSource}\n${tokensSource}\n${KEY_STAMP}\n${SCROLL_SENSOR}\n;` +
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
    try {
      await page.goto(input.url, { waitUntil: "load", timeout: 90_000 });
    } catch (error) {
      if (blockedAddress !== undefined) throw blockedAddressError(blockedAddress);
      throw error;
    }
    if (input.motion !== "live") {
      // The style tag must exist inside the document; inject once more after
      // load in case the first attempt ran before navigation finished.
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
    }

    // The IR keys are stamped onto the LIVE tree first: the ordinals only match
    // when the tree is the one `captureHtml` will read moments later, so the
    // stamp happens after the page settled (JS-built content included) and is
    // taken off again before `page.content()`. A page without `#main` stamps
    // nothing; the sensor then simply finds no key and reports nothing.
    await page.evaluate("window.senifyStampKeys()");

    // Settle once through the scroll height (lazy media, IO triggers). This
    // pass makes the page GROW - it must be finished before the scroll sensor
    // measures, or every element reports the height change as a movement.
    await page.evaluate(async () => {
      const slice = globalThis as unknown as BrowserSlice;
      const step = slice.window.innerHeight;
      for (let y = 0; y < slice.document.body.scrollHeight; y += step) {
        slice.window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    });
    await page.waitForTimeout(input.settleMs ?? 1500);

    // The sensor compares two REAL scroll positions on the settled page: one
    // viewport down. Sampling at the same offset twice measures nothing.
    const scrollBefore = (await page.evaluate("window.senifyScrollSample()")) as {
      scrollY: number;
      samples: { key: string; y: number; transform: string | null; offset: string | null }[];
    };
    await page.evaluate(async () => {
      const slice = globalThis as unknown as BrowserSlice;
      slice.window.scrollTo(0, slice.window.innerHeight);
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    const scrollAfter = (await page.evaluate("window.senifyScrollSample()")) as {
      scrollY: number;
      samples: { key: string; y: number; transform: string | null; offset: string | null }[];
    };

    const probe = (await page.evaluate(
      "JSON.parse(JSON.stringify(motionProbe()))",
    )) as Record<string, unknown>;
    // The selector index belongs to the very tree the probe just read, so it is
    // taken BEFORE the stamp comes off and the HTML is serialised.
    const keyIndex = (await page.evaluate(
      "JSON.parse(JSON.stringify(window.senifyKeyIndex()))",
    )) as Record<string, string | null>;
    await page.evaluate("window.senifyUnstampKeys()");
    const ssrHtml = await page.content();
    const keyOf = (target: unknown): string | null =>
      typeof target === "string" ? (keyIndex[target] ?? null) : null;

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
    const samples = samplesOfProbe(probe, keyOf);
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
    // MERGE, never replace: `captureHtml` has already turned the page's appear
    // JSON into samples with their start values, and those are the ones the
    // motion mapper can translate. The browser adds what the static channels
    // cannot see (loops, scroll-driven timelines, the scroll sensor). Two
    // samples for the same node and trigger would map the effect twice on one
    // element, so the static sample wins and only unseen pairs are added. The
    // animation's own name stays part of the identity: one element can carry a
    // CSS ticker AND a script-driven loop, and those are two animations.
    const sampleId = (sample: IrMotionSample): string =>
      `${sample.nodeKey ?? ""}|${sample.trigger}|${sample.library}|${String(sample.params["name"] ?? "")}`;
    const seen = new Set(document.motion.map(sampleId));
    for (const sample of samples) {
      const id = sampleId(sample);
      if (seen.has(id)) continue;
      seen.add(id);
      document.motion.push(sample);
    }
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
