// One extra load per breakpoint width, read for the device variants only.
//
// Framer does not only write different VALUES per width — it renders a different
// VARIANT of the element: the product card carries `framer-v-kmiuhn`
// (`padding: 48px`, `gap: 14px`) at 1440 px and `framer-v-1f9jezn`
// (`padding: 30px`, `gap: 10px`) at 390 px. One load can therefore never describe
// a second width: the variant class is resolved before the values are read, and
// the ones the other width needs are simply not in the document.
//
// Measured on `rare-works` (27.10.2026): 1198 nodes share a signature across the
// two builds, and 3 of them carry a DIFFERENT variant class — exactly the ones
// where the baked page disagreed (the product cards: 347 px instead of 233, the
// section 713 instead of 522; the navigation: 778 instead of 292).
//
// The widths are the site's own breakpoints: 390 (phone), 900 (tablet), 1440
// (the capture width itself, so no extra load). A width that will not load
// leaves the other builds standing: the import is then as complete as the loads
// that did succeed.
const DEVICE_WIDTHS: readonly { device: "tablet" | "mobile"; width: number; height: number }[] = [
  { device: "tablet", width: 900, height: 1000 },
  { device: "mobile", width: 390, height: 844 },
];

async function readDeviceMarkup(
  context: import("playwright").BrowserContext,
  url: string,
  loaderTimeoutMs: number,
): Promise<Partial<Record<"tablet" | "mobile", string>>> {
  const out: Partial<Record<"tablet" | "mobile", string>> = {};
  for (const entry of DEVICE_WIDTHS) {
    const page = await context.newPage();
    try {
      // The capture viewport is fixed at 1440; a page of its own carries the
      // narrow width without touching the one that is being measured.
      await page.setViewportSize({ width: entry.width, height: entry.height });
      await page.goto(url, { waitUntil: "load", timeout: 90_000 });
      await page.waitForTimeout(SETTLE_READ_MS);
      // The main page has already waited for the loader; the context may carry
      // its show-once flag, so this page often skips it. If not, remove it
      // before the device markup is read.
      await removePageLoader(page, loaderTimeoutMs);
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
      // Light settle: the device pages only supply the variant classes and
      // values. One scroll pass triggers the IO; the image wait and the extra
      // passes belong to the main page.
      await settlePage(page, 0, true);
      out[entry.device] = await page.content();
    } catch {
      // Nothing to merge for this width.
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  return out;
}

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
import { measureHover, mergeHoverMeasurements, type HoverMeasurement } from "./capture-hover.ts";
import type {
  FramerIrDocument,
  IrAppearSpec,
  IrAppearState,
  IrAppearTransition,
  IrAppearVariant,
  IrMotionSample,
} from "./ir.ts";

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
  // "measure" (default) hovers links and buttons of the live page and files
  // what the runtime changes as `interactions.hover` (capture-hover.ts).
  // "off" skips the pass, which costs about 0.7 s per candidate.
  hover?: "measure" | "off";
  // How long to wait for a site loader to leave before forcing it away.
  // Default 8 s: enough for the measured Origin preloader, short enough that
  // an import never hangs on a broken overlay. Tests set this low.
  loaderTimeoutMs?: number;
};

// The capture's completeness evidence: the page height before and after the
// scroll passes, the number of passes, and whether lazy images/fonts settled.
// A growing page or pending images is a warn, never a silent drop.
export type CaptureCompleteness = {
  heightStart: number;
  heightSettled: number;
  passes: number;
  images: number;
  imagesPending: number;
  fontsReady: boolean;
};

export type BrowserCaptureResult = {
  document: FramerIrDocument;
  completeness?: CaptureCompleteness;
  // The markup as it stood 350 ms after `load`: the page is built, and the
  // runtime has not yet animated the start states away or thrown the phone and
  // tablet copies out. Only the device variants are read from it.
  earlyMarkup?: string;
  // The same page as the PHONE and TABLET build it. Framer renders one variant
  // per load, so a section that exists only on a phone lives only here — and so
  // does the variant class the narrow width resolves. The device variants are
  // read from it; nothing else.
  deviceMarkup?: Partial<Record<"tablet" | "mobile", string>>;
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

// How long the capture waits after `load` before it reads the markup.
//
// Framer's page is a shell at `load` and complete a moment later; the runtime's
// reveals then wipe the start states out of the HTML. Measured on `rare-works`:
// 0 ms → 5 KB / 0 spans, 300 ms → 1 MB / 93 spans / 98 start states, 3 s → the
// same spans at `opacity:1`. 350 ms sits safely inside the window (it was still
// complete and still carrying 98 start states in every run).
const SETTLE_READ_MS = 350;

/* --------------------------------------------------------- scroll sensor */
// The IR keys every node `n<ordinal>`; the running page has no such attribute,
// so a probe that reports `data-framer-name` or a class name can never address
// an IR node (measured 22.10.2026: 0 of 24 / 29 / 66 scroll samples landed).
//
// This stamp mirrors `toIrNode` exactly and runs in the page: pre-order over
// `#main`'s element tree, an ordinal per VISITED element (the dissolved
// `ssr-variant` wrapper consumes one, its child the next), `style`/`script`/
// `noscript`/`template` never visited. An `<svg>` and a `<select>` are ONE node
// in the IR — `toIrNode` reads their content as markup and never descends — so
// they are stamped but not walked. Descending here shifted every key behind the
// first inline SVG by its children; measured on Relay `/`: 1959 live elements
// against 1922 IR nodes, and a measured reveal landed on a key that no longer
// existed. The attributes are removed again before `page.content()`, so the
// static capture reads the page unchanged.
const KEY_STAMP = `
function senifyStampKeys() {
  const SKIP = new Set(["style", "script", "noscript", "template"]);
  const LEAF = new Set(["svg", "select"]);
  let ordinal = 0;
  const visit = (el) => {
    ordinal += 1;
    el.setAttribute("data-senify-ir-key", "n" + ordinal);
    const tag = el.tagName.toLowerCase();
    if (LEAF.has(tag)) return;
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

// The site loader (Origin: `Preloader (Show Once content)`, 1440 x 900,
// `position: fixed`, z-index 10). The capture must not bake it as content and
// must not wait forever: it polls until the overlay is invisible twice in a
// row, then removes the seen elements from the DOM. A loader that never leaves
// is removed at the timeout and reported as `loader-dismissed`; one that leaves
// naturally is reported as `loader-skipped`. Both are findings, never silence.
const LOADER_SENSOR = `
function senifyLoaderProbe() {
  const NAME = /page[\\s_-]*loader|preloader|loader|splash|intro|curtain/i;
  const full = (rect) => rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
  const positioned = (el) => {
    const style = getComputedStyle(el);
    return style.position === "fixed" || style.position === "absolute";
  };
  // The named element is often a static wrapper; the full-screen overlay is a
  // fixed child. Collect the wrapper for removal, but judge visibility on the
  // positioned full-screen elements inside it.
  const overlays = (el) => {
    const out = [];
    if (full(el.getBoundingClientRect()) && positioned(el)) out.push(el);
    for (const child of el.querySelectorAll("*")) {
      if (full(child.getBoundingClientRect()) && positioned(child)) out.push(child);
    }
    return out;
  };
  const visible = (el) => {
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0.01;
  };
  const found = [];
  const seen = window.__senifyLoaderSeen || (window.__senifyLoaderSeen = []);
  for (const el of document.querySelectorAll("body *")) {
    const name = [el.getAttribute("data-framer-name"), typeof el.className === "string" ? el.className : "", el.id].filter(Boolean).join(" ");
    if (!NAME.test(name)) continue;
    if (!full(el.getBoundingClientRect())) continue;
    if (overlays(el).length === 0) continue;
    if (found.some((other) => other !== el && other.contains(el))) continue;
    found.push(el);
    if (!seen.includes(el)) seen.push(el);
  }
  window.__senifyLoaderEls = found;
  let anyVisible = false;
  for (const el of found) {
    if (overlays(el).some(visible)) {
      anyVisible = true;
      break;
    }
  }
  return {
    detected: found.length > 0 || seen.length > 0,
    visible: anyVisible,
    count: found.length,
    names: found.map((el) => el.getAttribute("data-framer-name") || String(el.className) || el.id).slice(0, 5),
    evidence: found.map((el) => el.getAttribute("data-framer-name") || el.tagName).slice(0, 5).join(" · "),
  };
}
function senifyRemoveLoader() {
  const seen = window.__senifyLoaderSeen || [];
  let removed = 0;
  for (const el of seen) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
      removed += 1;
    }
  }
  window.__senifyLoaderSeen = [];
  window.__senifyLoaderEls = [];
  return removed;
}
;window.senifyLoaderProbe = senifyLoaderProbe;window.senifyRemoveLoader = senifyRemoveLoader;`;

// The start states are collected TWICE: once at the 350 ms "built" read (the
// loader is still on screen) and once after the loader is gone and the freeze
// is in place. A loader can delay the reveals below it, so the first read
// catches the content that is already built; the second catches the elements
// that hydration replaced in the meantime. The restore writes both onto the
// same element references; later entries win and detached elements are skipped.
const COLLECT_START_STATES = `(() => {
  const collect = () => {
    const out = [];
    for (const el of document.querySelectorAll("#main *")) {
      const style = el.getAttribute("style");
      if (style === null) continue;
      if (!/(?:^|;)\\s*(opacity\\s*:\\s*0(?:\\.\\d+)?|filter\\s*:\\s*blur|transform\\s*:\\s*translate)/i.test(style)) continue;
      out.push({ el, style });
    }
    return out;
  };
  const states = window.__senifyStartStates || (window.__senifyStartStates = []);
  const seen = window.__senifyStartStateEls || (window.__senifyStartStateEls = new Set());
  let added = 0;
  for (const entry of collect()) {
    if (seen.has(entry.el)) continue;
    seen.add(entry.el);
    states.push(entry);
    added += 1;
  }
  return { total: states.length, added };
})()`;

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
    // The channel the static appear JSON cannot see: Framer's runtime reveals
    // its words one by one (`element.animate`), and those calls only exist while
    // the page runs. They used to be thrown away here — the two filters below
    // only keep loops and scroll timelines, and a reveal is neither. Measured on
    // `rare-works`: 91 words and 5 blocks revealed by the runtime, none of them
    // reaching the mapper, which is why the baked page showed every headline at
    // once instead of word by word.
    const runtimeReveal =
      entry.source === "element.animate" || entry.source === "framer-animator";
    // A recorded call names its target by the IR key the stamp wrote; that is
    // the exact node, not a selector that three breakpoint copies share.
    const nodeKey =
      typeof entry.key === "string" ? entry.key : keyOf(entry.target);
    if (!isLoop && !scrollDriven && !runtimeReveal) continue;
    // A reveal without a target is not mappable: reporting it would put an
    // effect on no element. It stays in the raw probe instead.
    if (nodeKey === null && runtimeReveal) continue;
    const duration = typeof entry.duration === "number" ? entry.duration : 0;
    const keyframes = entry.keyframes;
    const first = Array.isArray(keyframes) ? keyframes[0] : undefined;
    const params: IrMotionSample["params"] = {
      duration,
      // `getTiming().duration` is milliseconds (the platform unit). The field
      // exists so the mapper never has to infer the unit from the library.
      durationUnit: "ms",
      iterations: isLoop ? "endless" : String(iterations ?? "1"),
      ...(typeof entry.name === "string" ? { name: entry.name } : {}),
      ...(typeof entry.delay === "number" && entry.delay !== 0 ? { delay: entry.delay } : {}),
      ...(typeof entry.easing === "string" ? { easing: entry.easing } : {}),
      ...(Array.isArray(entry.properties) ? { properties: entry.properties.join(",") } : {}),
    };
    // The start values the reveal moves away from, in the shape the appear
    // channel uses — that is what lets the mapper build a keyframes block from
    // a measured call instead of only from the source's JSON.
    if (first !== undefined && typeof first === "object") {
      const frame = first as Record<string, unknown>;
      const opacity = Number(frame["opacity"]);
      if (Number.isFinite(opacity)) params["fromOpacity"] = opacity;
      const transform = frame["transform"];
      if (typeof transform === "string") params["fromTransform"] = transform;
      const filter = frame["filter"];
      if (typeof filter === "string") params["fromFilter"] = filter;
    }
    samples.push({
      nodeKey,
      library: "waapi",
      trigger: isLoop ? "time" : scrollDriven ? "scroll" : "appear",
      params,
      raw: JSON.stringify({
        source: entry.source ?? "getAnimations",
        name: entry.name,
        duration: entry.duration,
        iterations: entry.iterations,
        properties: entry.properties,
        sampledFrames: entry.sampledFrames,
      }),
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

// A CSS transform as the appear channel's numbers: `translateY(28px)` → `y: 28`.
// A transform with a part this reader does not know (`matrix(…)`) returns null —
// a wrong start state is worse than none.
const TRANSFORM_PART = /(translateX|translateY|translateZ|scale|rotate|rotateX|rotateY|skewX|skewY)\(([-\d.]+)(?:px|deg)?\)/g;

function appearStateOf(value: string | undefined): IrAppearState | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (text === "" || text === "none") return {};
  const state: IrAppearState = {};
  for (const match of text.matchAll(TRANSFORM_PART)) {
    const name = match[1] ?? "";
    const amount = Number.parseFloat(match[2] ?? "");
    if (!Number.isFinite(amount)) return null;
    if (name === "translateX") state.x = amount;
    else if (name === "translateY") state.y = amount;
    else if (name === "translateZ") state.z = amount;
    else if (name === "scale") state.scale = amount;
    else if (name === "rotate") state.rotate = amount;
    else if (name === "rotateX") state.rotateX = amount;
    else if (name === "rotateY") state.rotateY = amount;
    else if (name === "skewX") state.skewX = amount;
    else if (name === "skewY") state.skewY = amount;
  }
  if (Object.keys(state).length === 0 && !/^(?:translate|scale|rotate|skew|matrix|perspective|none)/.test(text)) {
    return null;
  }
  return state;
}

function blurOf(value: string | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /blur\(([\d.]+)px\)/.exec(value);
  return match === null ? undefined : Number.parseFloat(match[1] ?? "");
}

function appearSpecsOfProbe(probe: Record<string, unknown>): IrAppearSpec[] {
  // The measured reveals as appear specs: what the browser actually animated,
  // element by element. Framer's runtime hands `element.animate()` two keyframes
  // per property (`opacity: [0.001, 1]`, `filter: ["blur(12px)", "blur(0px)"]`)
  // together with duration, delay and a ready-made CSS `linear(…)` easing — that
  // is not an approximation of the source's animation, it IS the animation.
  const waapi = Array.isArray(probe.waapi) ? (probe.waapi as Record<string, unknown>[]) : [];
  const byKey = new Map<string, IrAppearSpec>();
  for (const entry of waapi) {
    const key = entry.key;
    if (typeof key !== "string" || key === "") continue;
    // Only a reveal: a loop is the ticker channel, a scroll timeline the sensor.
    if (entry.source !== "element.animate" && entry.source !== "framer-animator") continue;
    const frames = entry.keyframes;
    if (frames === null || typeof frames !== "object") continue;
    const record = frames as Record<string, unknown[] | undefined>;
    const at = (name: string, index: number): unknown => {
      const list = record[name];
      if (!Array.isArray(list) || list.length === 0) return undefined;
      // Framer gives two values for a `from`/`to` effect and N sampled ones for
      // a spring; both ends are what the spec carries.
      return index === 0 ? list[0] : list[list.length - 1];
    };
    const initial: IrAppearState = {};
    const animate: IrAppearState & { transition?: IrAppearTransition } = {};
    const opacityFrom = at("opacity", 0);
    const opacityTo = at("opacity", 1);
    if (typeof opacityFrom === "number" && Number.isFinite(opacityFrom)) initial.opacity = opacityFrom;
    if (typeof opacityTo === "number" && Number.isFinite(opacityTo)) animate.opacity = opacityTo;
    const transformFrom = appearStateOf(at("transform", 0) as string | undefined);
    const transformTo = appearStateOf(at("transform", 1) as string | undefined);
    if (transformFrom !== null) Object.assign(initial, transformFrom);
    if (transformTo !== null) Object.assign(animate, transformTo);
    const blurFrom = blurOf(at("filter", 0) as string | undefined);
    const blurTo = blurOf(at("filter", 1) as string | undefined);
    if (blurFrom !== undefined) initial.blur = blurFrom;
    if (blurTo !== undefined) animate.blur = blurTo;
    // Nothing to play: a call that only carries an unknown property.
    if (Object.keys(initial).length === 0 && Object.keys(animate).length === 0) continue;
    const duration = typeof entry.duration === "number" ? entry.duration : undefined;
    const delay = typeof entry.delay === "number" ? entry.delay : undefined;
    const easing = typeof entry.easing === "string" ? entry.easing : undefined;
    // The runtime hands a ready-made CSS curve. It travels verbatim: `linear(…)`
    // and `cubic-bezier(…)` are both valid CSS timing functions, and the sampled
    // one reproduces Framer's solved spring exactly.
    animate.transition = {
      type: easing !== undefined && /^linear\(/.test(easing) ? "sampled" : "tween",
      ...(duration === undefined ? {} : { duration: duration / 1000 }),
      ...(delay === undefined ? {} : { delay: delay / 1000 }),
      ...(easing === undefined ? {} : { easing }),
    };
    const existing = byKey.get(key);
    const spec: IrAppearVariant = { initial, animate };
    if (existing === undefined) {
      byKey.set(key, { appearId: key, variants: { default: spec } });
      continue;
    }
    // Two properties of the same element arrive as two calls; they belong in
    // one spec, not in two blocks that would overwrite each other.
    const merged = existing.variants["default"];
    if (merged === null || merged === undefined) {
      existing.variants["default"] = spec;
      continue;
    }
    existing.variants["default"] = {
      initial: { ...merged.initial, ...initial },
      animate: { ...merged.animate, ...animate, transition: animate.transition ?? merged.animate?.transition },
    };
  }
  return [...byKey.values()];
}

/* ------------------------------------------------------ loader and settle */

type BrowserPage = import("playwright").Page;
type LoaderProbeResult = {
  detected: boolean;
  visible: boolean;
  count: number;
  names: string[];
  evidence: string;
};
type LoaderOutcome = {
  detected: boolean;
  forced: boolean;
  waitedMs: number;
  evidence: string;
  removed: number;
};
type SettleProbe = {
  height: number;
  images: number;
  pendingImages: number;
  fontsReady: boolean;
};

// Wait for a site loader to leave, then remove the seen elements. Two
// consecutive invisible reads are the "gone" condition; a loader that only
// fades halfway is not gone yet. A timeout removes it by force and reports it.
async function removePageLoader(page: BrowserPage, timeoutMs: number): Promise<LoaderOutcome> {
  let probe = (await page.evaluate("window.senifyLoaderProbe()")) as LoaderProbeResult;
  if (!probe.detected) {
    return { detected: false, forced: false, waitedMs: 0, evidence: "", removed: 0 };
  }
  const start = Date.now();
  let stableGone = 0;
  while (Date.now() - start < timeoutMs) {
    stableGone = probe.visible ? 0 : stableGone + 1;
    if (stableGone >= 2) break;
    await page.waitForTimeout(100);
    probe = (await page.evaluate("window.senifyLoaderProbe()")) as LoaderProbeResult;
  }
  const waitedMs = Date.now() - start;
  const forced = probe.visible;
  const removed = (await page.evaluate("window.senifyRemoveLoader()")) as number;
  return { detected: true, forced, waitedMs, evidence: probe.evidence, removed };
}

async function readSettleProbe(page: BrowserPage): Promise<SettleProbe> {
  return (await page.evaluate(() => {
    const doc = (globalThis as unknown as {
      document: {
        body: { scrollHeight: number };
        documentElement: { scrollHeight: number };
        images: ArrayLike<{ complete: boolean }>;
        fonts?: { status?: string };
      };
    }).document;
    const images = Array.from(doc.images);
    return {
      height: Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight),
      images: images.length,
      pendingImages: images.filter((image) => !image.complete).length,
      fontsReady: doc.fonts === undefined || doc.fonts.status === "loaded",
    };
  })) as SettleProbe;
}

async function scrollPass(page: BrowserPage, dwellMs: number): Promise<void> {
  await page.evaluate(async (dwell) => {
    const slice = globalThis as unknown as {
      document: {
        body: { scrollHeight: number };
        documentElement: { scrollHeight: number };
        querySelectorAll(selector: string): ArrayLike<{
          scrollIntoView(options: { block: string; behavior: string }): void;
        }>;
      };
      window: { innerHeight: number; scrollTo(x: number, y: number): void };
    };
    const doc = slice.document;
    const win = slice.window;
    const step = Math.max(320, Math.round(win.innerHeight * 0.8));
    // Section-by-section first: the IO reveals are registered on the sections,
    // and a coarse pixel sweep alone misses the short ones between steps.
    for (const section of Array.from(doc.querySelectorAll("#main > *"))) {
      section.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, dwell));
    }
    for (let y = 0; y < Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight); y += step) {
      win.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, dwell));
    }
    win.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }, dwellMs);
}

async function waitForImages(page: BrowserPage): Promise<void> {
  await page.evaluate(async () => {
    const doc = (globalThis as unknown as {
      document: {
        images: ArrayLike<{
          complete: boolean;
          addEventListener(type: string, listener: () => void, options: { once: boolean }): void;
        }>;
      };
    }).document;
    const deadline = Date.now() + 10_000;
    for (const image of Array.from(doc.images)) {
      if (image.complete) continue;
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
        setTimeout(done, 4000);
      });
      if (Date.now() > deadline) break;
    }
  });
}

// Bring the page to its settled, scroll-revealed state. The loader is already
// gone and the freeze is already in place when this runs, so the passes only
// trigger lazy content and IO reveals. The page may grow while images arrive;
// a second and third pass follow until the height is stable (ADR-0026: lazy
// posters without intrinsic height grew the page by 1080 px during the pass).
async function settlePage(page: BrowserPage, extraMs: number, light = false): Promise<CaptureCompleteness> {
  await page.evaluate(async () => {
    const doc = (globalThis as unknown as { document: { fonts?: { ready: Promise<unknown> } } }).document;
    if (doc.fonts !== undefined) {
      await Promise.race([doc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  });
  const start = await readSettleProbe(page);
  let settled = start;
  let passes = 0;
  const maxPasses = light ? 1 : 3;
  const dwellMs = light ? 80 : 150;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    passes = pass + 1;
    await scrollPass(page, dwellMs);
    // The image wait belongs to the main page: the device pages only need the
    // IO to set the src attributes for the variant markup.
    if (!light) await waitForImages(page);
    await page.waitForTimeout(light ? 100 : 200);
    settled = await readSettleProbe(page);
    if (light || settled.height <= Math.max(start.height, 1) * 1.02) break;
  }
  await page.waitForTimeout(extraMs);
  return {
    heightStart: start.height,
    heightSettled: settled.height,
    passes,
    images: settled.images,
    imagesPending: settled.pendingImages,
    fontsReady: settled.fontsReady,
  };
}

/* ------------------------------------------------------------------ main */
export async function captureBrowser(input: CaptureBrowserInput): Promise<BrowserCaptureResult> {
  const { chromium } = await loadPlaywright();
  const motionSource = probeSource("motion-probe.mjs");
  const tokensSource = probeSource("tokens-probe.mjs");

  const browser = await chromium.launch({ headless: true });
  try {
    // The capture is the deterministic reference for the comparison. Pin the
    // light scheme: Framer sites often swap their palette under
    // `prefers-color-scheme`, and an inherited OS dark mode would bake the
    // other variant into the IR.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    });
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
        `${motionSource}\n${tokensSource}\n${KEY_STAMP}\n${SCROLL_SENSOR}\n${LOADER_SENSOR}\n;` +
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
    }
    try {
      await page.goto(input.url, { waitUntil: "load", timeout: 90_000 });
    } catch (error) {
      if (blockedAddress !== undefined) throw blockedAddressError(blockedAddress);
      throw error;
    }

    // The START STATES, read once the page is built but before the runtime has
    // animated them away.
    //
    // Two measurements shape this wait (rare-works, 26.10.2026):
    //   - right at `load` the page is 5 KB of shell: 0 spans, nothing to read;
    //   - 300 ms later it is complete (93 spans) and still carries 98 start
    //     states (`opacity:0.001`, `blur(12px)`, `translateY(28px)`);
    //   - after the reveal has run (3 s) the same spans read `opacity:1`.
    //
    // The identity is the DOM PATH (the nth-child chain), not the IR key: Framer
    // replaces nodes while it hydrates, so the same span carried `n100` at
    // 350 ms and `n62` after the scroll pass — measured. The path is stable
    // through that, because no element moves.
    await page.waitForTimeout(SETTLE_READ_MS);
    // First collection: the loader may still cover the page, so the content
    // below it is still at its start state. A later collection after the
    // loader is gone catches elements that hydration replaced in between.
    await page.evaluate(COLLECT_START_STATES);
    // The site loader is page UX, not content. Wait for it to leave (two
    // stable invisible reads), then remove the seen elements from the DOM so
    // the static capture cannot bake the overlay. A loader that never leaves
    // is forced away at the timeout and reported.
    const loader = await removePageLoader(page, input.loaderTimeoutMs ?? 8_000);
    if (input.motion !== "live") {
      // The freeze goes in AFTER the loader: `animation: none` would pin a
      // CSS-animated loader open and the page would never be read. The first
      // start-state collection above already preserved the content's start
      // values.
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
    }
    const secondStates = (await page.evaluate(COLLECT_START_STATES)) as { total: number; added: number };
    const startStateCount = secondStates.total;
    // The markup of the built page, after the loader is gone and the freeze is
    // in place. It carries the reveal start states of THIS viewport; the phone
    // copy of a section is not in it — Framer builds only the variant that
    // matches the width.
    const earlyMarkup = await page.content();
    // The phone and tablet copies: Framer renders ONE variant per width, so a
    // 1440 px load never contains the phone build of a section. Measured on
    // `rare-works`: four `ssr-variant` wrappers point at `hidden-1xrkzay` (the
    // phone) at 1440 px, and the phone copy of the products section and the
    // footer does not exist there at all — the baked page hid them on a phone and
    // came out 2680 px too short (20648 → 17968).
    //
    // A load per width is the only way to see the other variant. It is a page of
    // its own in the same context (the runtime has to build that tree), and only
    // its device variants are read.
    const deviceMarkup = await readDeviceMarkup(context, input.url, input.loaderTimeoutMs ?? 8_000);
    // The scroll settle: sections first, then a coarse sweep, images and fonts,
    // and a second/third pass when lazy content grew the page. The loader is
    // already gone; the freeze keeps the baseline deterministic.
    const completeness = await settlePage(page, input.settleMs ?? 1_500);
    // The IR keys are stamped onto the LIVE tree TWICE, and both stamps are the
    // same walk over the same tree in the same order — so the same element gets
    // the same key both times (measured: 327 of 327 collected keys were found
    // again in the late markup, at their own positions). The early stamp names
    // the element whose start state was collected; the late one names the tree
    // the probe measures after the scroll pass.
    //
    // "After it settled", not "after `load`": at `load` Framer has not built the
    // page yet. Measured on the rare-works payload — stamping right after `load`
    // found 3 elements, 0.5 s later 3072. The stamped keys then name nothing,
    // and every measured reveal loses its target (376 recorded animations, 0
    // mapped). The settle pass below is exactly that wait, so the stamp runs
    // AFTER it.
    //
    // A page without `#main` stamps nothing; the sensor then simply finds no
    // key and reports nothing.

    // The stamp, before the reveals are read: a stamped key is the only exact
    // name a recorded animation can carry (Framer's word spans have no id and
    // no class, so 91 of them read `span`).
    await page.evaluate("window.senifyStampKeys()");

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
    // Temporary diagnostic: what does the probe hand over, entry by entry?
    if (process.env["SENIFY_DEBUG_PROBE"] === "1") {
      const waapi = Array.isArray(probe.waapi) ? (probe.waapi as Record<string, unknown>[]) : [];
      console.log(`[probe] waapi=${waapi.length}`);
      for (const entry of waapi.slice(0, 3)) {
        console.log(`[probe] ${JSON.stringify(entry).slice(0, 260)}`);
      }
    }
    // The selector index belongs to the very tree the probe just read, so it is
    // taken BEFORE the stamp comes off and the HTML is serialised.
    const keyIndex = (await page.evaluate(
      "JSON.parse(JSON.stringify(window.senifyKeyIndex()))",
    )) as Record<string, string | null>;
    // The states are written back onto the SAME element objects now, right
    // before the markup is serialised. The reveal compiler derives a word's
    // animation from that attribute; without it every word plays on the
    // container instead of on itself.
    const restored = (await page.evaluate(`(() => {
      const states = window.__senifyStartStates || [];
      let applied = 0;
      for (const { el, style } of states) {
        if (!el || !el.tagName || !document.contains(el)) continue;
        const current = el.getAttribute('style') || '';
        const keep = new Map();
        for (const part of current.split(';')) {
          const colon = part.indexOf(':');
          if (colon <= 0) continue;
          keep.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
        }
        for (const part of style.split(';')) {
          const colon = part.indexOf(':');
          if (colon <= 0) continue;
          const name = part.slice(0, colon).trim();
          if (!/^(opacity|transform|filter)$/i.test(name)) continue;
          keep.set(name, part.slice(colon + 1).trim());
        }
        el.setAttribute('style', [...keep.entries()].map(([n, v]) => n + ': ' + v).join('; '));
        applied += 1;
      }
      window.__senifyStartStates = null;
      return applied;
    })()`)) as number;
    if (process.env["SENIFY_DEBUG_PROBE"] === "1") {
      console.log(`[start-states] gesammelt=${startStateCount} zurückgeschrieben=${restored}`);
    }
    // The markup now carries the start states again, on the elements that own
    // them. The stamp comes off first: it is not part of the document.
    await page.evaluate("window.senifyUnstampKeys()");
    const ssrHtml = await page.content();
    // The DOM snapshot contains link elements but not the stylesheets they
    // loaded. CSSOM access is restricted by the browser for cross-origin
    // sheets; skip inaccessible sheets rather than weakening that boundary.
    const linkedCss = await page.evaluate(() => {
      const result: string[] = [];
      const browserDocument = (globalThis as unknown as {
        document: { styleSheets: ArrayLike<{ ownerNode: { nodeName: string } | null; cssRules: ArrayLike<{ cssText: string }> }> };
      }).document;
      for (const sheet of Array.from(browserDocument.styleSheets)) {
        if (sheet.ownerNode?.nodeName !== "LINK") continue;
        try {
          result.push(Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n"));
        } catch {
          // Cross-origin CSSOM may be unreadable even if the browser renders it.
        }
      }
      return result.join("\n");
    });
    // The hover pass comes LAST among the reads of the live page: hovering lets
    // the runtime switch variants, so no markup is taken after it. The markup is
    // already in `ssrHtml`; the stamp goes back on (same walk, same tree, same
    // keys) so a hovered element can be named by its IR key.
    let hoverMeasurements: HoverMeasurement[] = [];
    if (input.hover !== "off") {
      await page.evaluate("window.senifyStampKeys()");
      hoverMeasurements = await measureHover(page);
      await page.evaluate("window.senifyUnstampKeys()");
    }
    // A probe names its target three ways: by the IR key the stamp wrote (the
    // exact node), by a CSS selector (`keyIndex`), or — for an element outside
    // the stamped tree — by its nth-child path, which addresses no node and
    // stays a finding.
    const keyOf = (target: unknown): string | null => {
      if (typeof target !== "string") return null;
      return keyIndex[target] ?? null;
    };

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
    // The measured reveals become the SAME channel the static JSON feeds: an
    // appear spec with start and end state. That is what lets the mapper build
    // one `@keyframes` block per measured element, with the values the browser
    // actually animated — not a paraphrased preset.
    //
    // Without this the whole runtime channel ended in a finding: the source
    // fades 91 words one by one and the baked page fades the headline as one
    // block, because the words' spans are folded into inline markup and the
    // static JSON never names them.
    const measured = appearSpecsOfProbe(probe);
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
      css: linkedCss,
      ...(input.rootDir !== undefined ? { rootDir: input.rootDir } : {}),
      url: input.url,
      pagePath: input.pagePath ?? new URL(input.url).pathname,
    };
    const document = captureHtml(capture);
    document.source.kind = "browser";
    if (loader.detected) {
      document.findings.push({
        kind: loader.forced ? "loader-dismissed" : "loader-skipped",
        nodeKey: null,
        message: loader.forced
          ? `Seiten-Loader nach ${loader.waitedMs} ms noch sichtbar; für den Import entfernt.`
          : `Seiten-Loader erkannt und vor dem Import entfernt (${loader.waitedMs} ms).`,
        evidence: `${loader.evidence || "Loader"} · ${loader.removed} Element(e) entfernt`,
        severity: loader.forced ? "warn" : "info",
        suggestion: "Der Loader ist Seiten-UX; er wird nativ neu gebaut, nicht als Inhalt importiert.",
      });
    }
    mergeHoverMeasurements(document, hoverMeasurements);
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
    // The measured start states join the appear channel, so the keyframes
    // compiler sees them beside the static specs. A measured spec whose target
    // the static channel already named is left out: one animation, one block.
    if (measured.length > 0) {
      const known = new Set((document.appear ?? []).map((spec) => spec.appearId));
      const added = measured.filter((spec) => !known.has(spec.appearId));
      document.appear = [...(document.appear ?? []), ...added];
      if (added.length > 0) {
        document.findings.push({
          kind: "unsupported-declaration",
          nodeKey: null,
          message: `${added.length} Einblendung(en) aus der laufenden Seite gemessen und als CSS-Keyframes übernommen.`,
          evidence: added.slice(0, 8).map((spec) => spec.appearId).join(", "),
          severity: "info",
          suggestion: "Diese Effekte laufen ohne Framer-Runtime; Bewegung und Dauer stammen aus der Messung.",
        });
      }
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
      completeness,
      earlyMarkup,
      ...(Object.keys(deviceMarkup).length === 0 ? {} : { deviceMarkup }),
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
