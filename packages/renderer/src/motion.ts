import { motionCssEffect, motionPreset, type NodeTree } from "@senify/section-sdk";
import { mediaMaxWidth, type Breakpoints } from "@senify/widget-engine";

export const PAGE_SCRIPT_PRESETS = [
  "fade-up",
  "fade-up-deblur",
  "masked-headline",
  "stagger-cascade",
  "scroll-reveal",
  "scrub-pin",
  "sticky-stack",
  "horizontal-pan",
  "scroll-progress",
  "counter",
  "marquee",
  "char-split",
  "parallax-subtle",
  "magnetic-button",
  "tilt-card",
  "cursor-glow",
] as const;

export const PIN_PRESETS: readonly string[] = [
  "scrub-pin",
  "sticky-stack",
  "horizontal-pan",
];

// The 3D preset's runtime (M6): three.js is self-hosted like the GSAP files,
// but it is an island asset — the bake writes it only for pages that carry a
// `webgl-scene` island, and the island script imports it lazily once the host
// scrolls near the viewport. The URL is the one `bakeSite` copies to; the
// bundle itself is produced at bake time (`webgl-vendor.ts`, esbuild) so the
// shipped file always matches the installed three version.
export const WEBGL_VENDOR_NAME = "three.module.min.js";
export const WEBGL_VENDOR_URL = `/assets/vendor/${WEBGL_VENDOR_NAME}`;

export type MotionConfig = {
  nodeId: string;
  preset: string;
  intensity: number;
  trigger: string;
  delay: number;
  ease?: string;
  duration?: number;
  stagger?: number;
  cssOnly?: boolean;
  // The preset registry flags, carried into the payload: `hides` drives the
  // FOUC pending counter, `needs` the per-page plugin scripts.
  hides?: boolean;
  needs?: string[];
  reducedMotion?: "static" | "fade" | "off";
};

// `motion-data` v2 (`payload-spec.md`): one versioned envelope with the
// breakpoint queries once per page and the entries as a list. The page script
// also accepts the v1 array, so an older release keeps working.
export type MotionData = {
  v: 2;
  breakpoints: { tablet: string; mobile: string };
  entries: MotionConfig[];
};

// A reveal the page plays as a CSS animation (`motionEntryCss`): above the fold
// it must not wait for the page script. It carries what the keyframes need and
// nothing else — no payload entry, no pending marker, no runtime.
export type MotionCssEntry = {
  nodeId: string;
  preset: "fade-up" | "fade-up-deblur" | "scroll-reveal";
  // Travel in px, 0 when the preset does not move.
  travel: number;
  blur: boolean;
  durationMs: number;
  delayMs: number;
  // A CSS timing function; the preset default when the token has none.
  ease: string;
  reducedMotion: "static" | "fade" | "off";
};

export type MotionWarning = {
  code?:
    | "unimplemented-preset"
    | "pin-excess"
    | "char-split-excess"
    | "reveal-too-long"
    | "document-excess";
  nodeId?: string;
  preset?: string;
  message: string;
  suggestion?: string;
};

export type MotionTokens = {
  ease: Record<string, string>;
  baseDurationMs: number;
  baseStaggerMs: number;
};

export function parseDurationMs(input: string): number {
  const match = input.trim().match(/^([0-9.]+)\s*(ms|s)$/);
  if (!match) throw new Error(`Invalid duration "${input}"`);
  const value = Number.parseFloat(match[1] ?? "0");
  return match[2] === "s" ? value * 1000 : value;
}

export type MotionConfigOptions = {
  // The nodes the bake plays through CSS (`cssEntryNodeIds` of the registry —
  // the markup stamps the very same set). Their spec becomes a `MotionCssEntry`
  // instead of a payload entry; the editor's live mode passes nothing and keeps
  // every reveal in the page script.
  cssEntry?: ReadonlySet<string>;
};

export function motionConfigsForTree(
  tree: NodeTree,
  tokens: MotionTokens,
  options: MotionConfigOptions = {},
): { configs: MotionConfig[]; warnings: MotionWarning[]; entries: MotionCssEntry[] } {
  const configs: MotionConfig[] = [];
  const entries: MotionCssEntry[] = [];
  const warnings: MotionWarning[] = [];
  let pins = 0;
  let charSplits = 0;
  for (const node of Object.values(tree.nodes)) {
    const motion = node.motion;
    if (!motion) continue;
    // The editor switch keeps the spec without playing it (ticket 19): a
    // disabled spec emits no entry, no pending marker and no runtime work.
    if (motion.enabled === false) continue;
    const preset = motionPreset(motion.preset);
    // Page-level presets (`document`) carry no per-node entry: the bake emits
    // their CSS once per page (`pageEffectsForTree`). Island presets run
    // through their own vanilla island (accordion, modal) — also no entry.
    if (preset?.runtime === "document" || preset?.runtime === "island") continue;
    if (preset === undefined || (preset.runtime !== "page" && preset.runtime !== "css")) {
      warnings.push({
        code: "unimplemented-preset",
        nodeId: node.id,
        preset: motion.preset,
        message: `Motion preset "${motion.preset}" is not implemented in the page script v1`,
        suggestion: "Use a category A–C preset, or ship the effect as an island.",
      });
      continue;
    }
    if (preset.flags.includes("pins")) pins += 1;
    if (motion.preset === "char-split") charSplits += 1;
    const intensity = Math.min(10, Math.max(1, Math.round(motion.intensity ?? 5)));
    if (motion.intensity !== undefined && intensity !== motion.intensity) {
      warnings.push({
        nodeId: node.id,
        preset: motion.preset,
        message: `Motion intensity ${motion.intensity} is outside the 1–10 dial and was clamped`,
        suggestion: "Use an intensity between 1 and 10.",
      });
    }
    const durationSeconds =
      ((motion.tokens?.durationScale ?? 1) * tokens.baseDurationMs) / 1000;
    // Soft review budget (artifacts/03): a reveal that runs longer than ~800 ms
    // feels sluggish — it warns, it never blocks.
    if (preset.flags.includes("hides") && durationSeconds > 0.8) {
      warnings.push({
        code: "reveal-too-long",
        nodeId: node.id,
        preset: motion.preset,
        message: `Reveal "${motion.preset}" runs ${durationSeconds.toFixed(2)}s (soft budget 0.8s)`,
        suggestion: "Keep reveals under ~800 ms.",
      });
    }
    if (
      options.cssEntry?.has(node.id) === true &&
      (motion.preset === "fade-up" ||
        motion.preset === "fade-up-deblur" ||
        motion.preset === "scroll-reveal")
    ) {
      entries.push({
        nodeId: node.id,
        preset: motion.preset,
        // The same travel the script's `gsap.from` uses.
        travel: motion.preset === "scroll-reveal" ? 16 : Math.round((8 + intensity * 3.2) * 10) / 10,
        blur: motion.preset === "fade-up-deblur",
        durationMs: Math.round(durationSeconds * 1000),
        delayMs: Math.round((motion.delay ?? 0) * 1000),
        ease: cssEase(motion.tokens?.ease ? tokens.ease[motion.tokens.ease] : undefined),
        reducedMotion: motion.reducedMotion ?? "static",
      });
      continue;
    }
    configs.push({
      nodeId: node.id,
      preset: motion.preset,
      intensity,
      trigger: motion.trigger ?? "viewport",
      delay: motion.delay ?? 0,
      ease: motion.tokens?.ease ? tokens.ease[motion.tokens.ease] : undefined,
      duration: durationSeconds,
      stagger:
        ((motion.tokens?.stagger ?? 1) * tokens.baseStaggerMs) / 1000,
      cssOnly: preset.runtime === "css" ? true : undefined,
      hides: preset.flags.includes("hides") ? true : undefined,
      needs: preset.gsapPlugins.length > 0 ? [...preset.gsapPlugins] : undefined,
      reducedMotion: motion.reducedMotion ?? "static",
    });
  }
  if (pins > 1) {
    warnings.push({
      code: "pin-excess",
      message: `Page uses ${pins} pin presets (max 1)`,
      suggestion: "Keep a single pin preset per page (scrub-pin, sticky-stack or horizontal-pan).",
    });
  }
  if (charSplits > 1) {
    warnings.push({
      code: "char-split-excess",
      message: `Page uses ${charSplits} char-split presets (max 1 recommended)`,
      suggestion: "Signature splits lose impact when repeated — keep one per page.",
    });
  }
  return { configs, warnings, entries };
}

// gsap's `power2.out` — the script's default — as the CSS curve it is.
const DEFAULT_ENTRY_EASE = "cubic-bezier(0.215, 0.61, 0.355, 1)";

// A theme ease token is written into a stylesheet: only a plain timing function
// goes through, anything else (a stray token value) falls back to the default.
function cssEase(token: string | undefined): string {
  if (token === undefined) return DEFAULT_ENTRY_EASE;
  const value = token.trim();
  if (/^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(value)) return value;
  if (/^(cubic-bezier|linear)\([0-9eE.,+\-%\s]+\)$/.test(value)) return value;
  return DEFAULT_ENTRY_EASE;
}

// The CSS of the reveals that play without the page script. Every rule keys on
// `[data-node-id]`, the keyframes are shared per kind and carry the node's
// travel through a custom property. `backwards` fill: the node waits in its
// hidden state during the delay and is left alone afterwards — no held end
// state that would fight a hover transform. Reduced motion follows the spec's
// policy like the script does: `static` shows the node at rest, `fade` plays the
// 400 ms opacity fade, `off` plays the full effect.
export function motionEntryCss(entries: readonly MotionCssEntry[]): string {
  if (entries.length === 0) return "";
  const lines: string[] = [];
  const kinds = new Set(entries.map((entry) => (entry.blur ? "deblur" : "move")));
  if (kinds.has("move")) {
    lines.push(
      "@keyframes senify-enter{from{opacity:0;transform:translateY(var(--senify-enter-y,0px))}}",
    );
  }
  if (kinds.has("deblur")) {
    lines.push(
      "@keyframes senify-enter-deblur{from{opacity:0;transform:translateY(var(--senify-enter-y,0px));filter:blur(8px)}}",
    );
  }
  if (entries.some((entry) => entry.reducedMotion === "fade")) {
    lines.push("@keyframes senify-enter-fade{from{opacity:0}}");
  }
  for (const entry of entries) {
    const selector = `[data-node-id="${entry.nodeId}"]`;
    const name = entry.blur ? "senify-enter-deblur" : "senify-enter";
    lines.push(
      `${selector}{--senify-enter-y:${entry.travel}px;animation:${name} ${entry.durationMs}ms ${entry.ease} ${entry.delayMs}ms backwards}`,
    );
    if (entry.reducedMotion === "static") {
      lines.push(
        `@media (prefers-reduced-motion:reduce){${selector}{animation:none}}`,
      );
    } else if (entry.reducedMotion === "fade") {
      lines.push(
        `@media (prefers-reduced-motion:reduce){${selector}{animation:senify-enter-fade 400ms ease-out backwards}}`,
      );
    }
  }
  return lines.join("\n");
}

// Page transitions (ticket 19, M6): a `document` preset opts the whole page
// into cross-document View Transitions. The spec sits on a node like any
// other, but the effect is page-wide — one CSS block in the head, no per-node
// script. Both the old and the new document must opt in, so the preset belongs
// on every page (or on the layout that wraps them).
export type PageTransition = {
  preset: string;
  intensity: number;
  reducedMotion: "static" | "fade" | "off";
};

// The page-level effects of one tree (ticket 19, M6): the View Transition
// (`page-fade`), the pure-CSS blocks keyed by `data-motion` (hover-lift,
// ambient-float, grain) and the preloader flag. Everything here is emitted
// once per page; one intensity per preset, the first enabled spec wins.
export type PageEffects = {
  transition: PageTransition | null;
  css: string;
  preloader: boolean;
  warnings: MotionWarning[];
};

export function pageEffectsForTree(tree: NodeTree): PageEffects {
  const warnings: MotionWarning[] = [];
  let transition: PageTransition | null = null;
  let preloader = false;
  const cssEffects = new Map<string, number>();
  for (const node of Object.values(tree.nodes)) {
    const motion = node.motion;
    if (!motion || motion.enabled === false) continue;
    if (motionPreset(motion.preset)?.runtime !== "document") continue;
    const intensity = Math.min(10, Math.max(1, Math.round(motion.intensity ?? 5)));
    if (motion.preset === "preloader-light") {
      preloader = true;
      continue;
    }
    if (motion.preset === "page-fade") {
      if (transition !== null) {
        warnings.push({
          code: "document-excess",
          nodeId: node.id,
          preset: motion.preset,
          message: `Page carries a second "${motion.preset}" spec — one page transition per page`,
          suggestion: "Keep the transition on one node (the page root or its layout).",
        });
        continue;
      }
      transition = {
        preset: motion.preset,
        intensity,
        reducedMotion: motion.reducedMotion ?? "static",
      };
      continue;
    }
    if (motionCssEffect(motion.preset) && !cssEffects.has(motion.preset)) {
      cssEffects.set(motion.preset, intensity);
    }
  }
  const css = [...cssEffects.entries()]
    .map(([preset, intensity]) => motionEffectCss(preset, intensity))
    .join("\n");
  return { transition, css, preloader, warnings };
}

function px(value: number): string {
  return `${Math.round(value * 10) / 10}px`;
}

// The block of one pure-CSS effect. Intensity scales the travel/opacity, the
// reduced-motion media query is part of every block (the `loops` guardrail).
export function motionEffectCss(preset: string, intensity: number): string {
  switch (preset) {
    case "hover-lift": {
      const lift = 2 + ((intensity - 1) / 9) * 6;
      return [
        '[data-motion="hover-lift"] { transition: transform 0.3s ease, box-shadow 0.3s ease; }',
        `[data-motion="hover-lift"]:hover { transform: translateY(-${px(lift)}); box-shadow: 0 12px 32px color-mix(in srgb, currentColor 14%, transparent); }`,
        '@media (hover: none) { [data-motion="hover-lift"]:hover { transform: none; box-shadow: none; } }',
        '@media (prefers-reduced-motion: reduce) { [data-motion="hover-lift"] { transition: none; } [data-motion="hover-lift"]:hover { transform: none; } }',
      ].join("\n");
    }
    case "ambient-float": {
      const travel = 3 + intensity * 0.9;
      const duration = 20 - intensity;
      return [
        `[data-motion="ambient-float"] { animation: senify-float ${duration}s ease-in-out infinite alternate; }`,
        `@keyframes senify-float { from { transform: translateY(-${px(travel)}); } to { transform: translateY(${px(travel)}); } }`,
        '@media (prefers-reduced-motion: reduce) { [data-motion="ambient-float"] { animation: none; } }',
      ].join("\n");
    }
    case "grain": {
      const opacity = 0.03 + intensity * 0.004;
      const duration = 6 + intensity;
      const noise =
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
      return [
        ':where([data-motion="grain"]) { position: relative; }',
        `[data-motion="grain"]::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: ${opacity.toFixed(3)}; background-image: ${noise}; background-size: 180px 180px; animation: senify-grain ${duration}s steps(8) infinite; }`,
        "@keyframes senify-grain { to { background-position: 180px 180px; } }",
        '@media (prefers-reduced-motion: reduce) { [data-motion="grain"]::after { animation: none; } }',
      ].join("\n");
    }
    default:
      return "";
  }
}

// The CSS block the page head carries. `@view-transition { navigation: auto; }`
// is the opt-in (the old <meta> tag is dead); the duration scales with the
// intensity (0.3–0.5 s). The reduced-motion policy decides the gate: `static`
// skips the transition, `fade` keeps a short cross-fade, `off` plays full.
export function pageTransitionCss(transition: PageTransition): string {
  const duration = (0.3 + ((transition.intensity - 1) / 9) * 0.2).toFixed(2);
  const gate =
    transition.reducedMotion === "static"
      ? "@media (prefers-reduced-motion: reduce) { ::view-transition-old(root), ::view-transition-new(root) { animation: none !important; } }"
      : transition.reducedMotion === "fade"
        ? "@media (prefers-reduced-motion: reduce) { ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.2s; } }"
        : "";
  return [
    "@view-transition { navigation: auto; }",
    `::view-transition-old(root), ::view-transition-new(root) { animation-duration: ${duration}s; animation-timing-function: ease; }`,
    ...(gate === "" ? [] : [gate]),
  ].join("\n");
}

// The v2 envelope the bake writes into `<script id="motion-data">`. The
// breakpoint queries come from the widget engine's one definition
// (`mediaMaxWidth`), so the payload and the compiled CSS never drift.
export function motionDataFor(
  configs: readonly MotionConfig[],
  siteBreakpoints?: Breakpoints | null,
): MotionData {
  return {
    v: 2,
    breakpoints: {
      tablet: `(max-width: ${mediaMaxWidth("tablet", siteBreakpoints ?? undefined)}px)`,
      mobile: `(max-width: ${mediaMaxWidth("mobile", siteBreakpoints ?? undefined)}px)`,
    },
    entries: [...configs],
  };
}

export function renderPageScript(options: { lenis: boolean }): string {
  const lenisBlock = options.lenis
    ? `
    if (!rm && typeof window.Lenis !== "undefined" && !window.matchMedia("(pointer: coarse)").matches) {
      var lenis = new window.Lenis({ autoRaf: false });
      if (hasGsap && window.ScrollTrigger) {
        lenis.on("scroll", window.ScrollTrigger.update);
        window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        window.gsap.ticker.lagSmoothing(0);
      } else {
        var rafLoop = function (time) { lenis.raf(time); requestAnimationFrame(rafLoop); };
        requestAnimationFrame(rafLoop);
      }
    }`
    : "";
  return `(function () {
  "use strict";
  function releasePending() {
    var pending = document.querySelectorAll("[data-motion-pending]");
    for (var index = 0; index < pending.length; index += 1) {
      pending[index].removeAttribute("data-motion-pending");
    }
  }
  // Freeze kill-switch (freeze-spec.md): a capture sets it before load; the
  // runtime never starts and the baseline markup stands.
  if (window.__SENIFY_MOTION__ === "off") { releasePending(); return; }
  var rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hoverable = window.matchMedia("(hover: hover)").matches;
  var has = {
    scrolltrigger: typeof window.ScrollTrigger !== "undefined",
    splittext: typeof window.SplitText !== "undefined"
  };
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    var data = document.getElementById("motion-data");
    var payload = [];
    try {
      payload = data ? JSON.parse(data.textContent || "[]") : [];
    } catch {
      releasePending();
      return;
    }
    var configs = Array.isArray(payload) ? payload : (payload.entries || []);
    var hasGsap = typeof window.gsap !== "undefined";${lenisBlock}
    if (hasGsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
    if (hasGsap && window.SplitText) window.gsap.registerPlugin(window.SplitText);
    var pendingLeft = document.querySelectorAll("[data-motion-pending]").length;
    configs.forEach(function (config) {
      if (!config) return;
      if (config.hides) pendingLeft -= 1;
      if (config.cssOnly) return;
      var el = document.querySelector('[data-node-id="' + config.nodeId + '"]');
      if (!el) return;
      if (rm) {
        var policy = config.reducedMotion || "static";
        if (policy === "fade" && config.hides) fadeIn(el);
        if (policy !== "off") return;
      }
      try {
        runPreset(el, config);
      } catch (error) {
        if (window.console) window.console.error("[senify] motion preset failed:", config.preset, error);
      }
    });
    if (pendingLeft <= 0) releasePending();
    // Positionen aus der Zeit vor den Webfonts neu berechnen.
    if (hasGsap && window.ScrollTrigger && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { window.ScrollTrigger.refresh(); });
    }
  });
  function fadeIn(el) {
    if (typeof el.animate !== "function") return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
  }
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function countFormat(raw) {
    var s = "";
    for (var i = 0; i < raw.length; i += 1) {
      var c = raw.charAt(i);
      if ("0123456789.,".indexOf(c) !== -1 || (c === "-" && s === "")) s += c;
    }
    var dots = s.split(".").length - 1;
    var commas = s.split(",").length - 1;
    var group = "";
    var decimal = "";
    if (dots > 0 && commas > 0) {
      decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
      group = decimal === "." ? "," : ".";
    } else if (dots + commas > 0) {
      var sep = dots > 0 ? "." : ",";
      var tail = s.length - s.lastIndexOf(sep) - 1;
      if (dots + commas > 1) {
        group = sep;
      } else if (tail !== 3 || s.replace("-", "").indexOf(sep) === 1 && s.replace("-", "").charAt(0) === "0") {
        decimal = sep;
      } else {
        // A lone separator with three digits behind it: the page language decides.
        var localeGroup = ",";
        try {
          var parts = new Intl.NumberFormat(document.documentElement.lang || undefined).formatToParts(1000.5);
          for (var p = 0; p < parts.length; p += 1) if (parts[p].type === "group") localeGroup = parts[p].value;
        } catch (error) { /* keep the default */ }
        if (sep === localeGroup) group = sep; else decimal = sep;
      }
    }
    var normalized = s;
    if (group) normalized = normalized.split(group).join("");
    if (decimal) normalized = normalized.replace(decimal, ".");
    return {
      goal: Number.parseFloat(normalized) || 0,
      decimals: decimal ? s.length - s.lastIndexOf(decimal) - 1 : 0,
      group: group,
      decimal: decimal
    };
  }
  function countText(value, format) {
    var text = value.toFixed(format.decimals);
    var negative = text.charAt(0) === "-";
    if (negative) text = text.slice(1);
    var dot = text.indexOf(".");
    var whole = dot === -1 ? text : text.slice(0, dot);
    var fraction = dot === -1 ? "" : text.slice(dot + 1);
    if (format.group) {
      var grouped = "";
      for (var i = 0; i < whole.length; i += 1) {
        if (i > 0 && (whole.length - i) % 3 === 0) grouped += format.group;
        grouped += whole.charAt(i);
      }
      whole = grouped;
    }
    return (negative ? "-" : "") + whole + (fraction ? format.decimal + fraction : "");
  }
  function triggerProps(config) {
    if (config.trigger === "load") return {};
    return { scrollTrigger: { trigger: "[data-node-id='" + config.nodeId + "']", start: "top 85%", once: true } };
  }
  function runPreset(el, config) {
    if (typeof window.gsap === "undefined") return;
    // A missing plugin degrades to the block state instead of half-running
    // (payload-spec.md §4): the needs come from the preset registry.
    if (config.needs) {
      for (var index = 0; index < config.needs.length; index += 1) {
        if (!has[config.needs[index]]) return;
      }
    }
    var gsap = window.gsap;
    var ease = config.ease || "power2.out";
    var duration = config.duration || 0.6;
    var delay = config.delay || 0;
    var intensity = config.intensity || 5;
    switch (config.preset) {
      case "fade-up":
        gsap.from(el, Object.assign({ y: 8 + intensity * 3.2, opacity: 0, duration: duration, ease: ease, delay: delay }, triggerProps(config)));
        break;
      case "fade-up-deblur":
        gsap.from(el, Object.assign({ y: 8 + intensity * 3.2, opacity: 0, filter: "blur(8px)", duration: duration, ease: ease, delay: delay }, triggerProps(config)));
        break;
      case "masked-headline": {
        var head = el.querySelector("h1, h2, h3") || el;
        if (has.splittext) {
          window.SplitText.create(head, {
            type: "words",
            mask: "words",
            aria: "auto",
            autoSplit: true,
            onSplit: function (self) {
              return gsap.from(self.words, Object.assign({ yPercent: 110, duration: duration, ease: ease, delay: delay, stagger: config.stagger || 0.06 }, triggerProps(config)));
            }
          });
          break;
        }
        var words = head.textContent.split(/\\s+/).filter(Boolean);
        head.innerHTML = words.map(function (w) {
          var safe = escapeHtml(w);
          return '<span style="display:inline-block;overflow:hidden;vertical-align:top"><span style="display:inline-block">' + safe + "</span></span>";
        }).join(" ");
        gsap.from(head.querySelectorAll("span > span"), Object.assign({ yPercent: 110, duration: duration, ease: ease, delay: delay, stagger: config.stagger || 0.06 }, triggerProps(config)));
        break;
      }
      case "stagger-cascade":
        gsap.from(el.children, Object.assign({ y: 24, opacity: 0, duration: duration, ease: ease, delay: delay, stagger: config.stagger || 0.08 }, triggerProps(config)));
        break;
      case "scroll-reveal":
        gsap.from(el, Object.assign({ y: 16, opacity: 0, duration: duration, ease: ease, delay: delay }, triggerProps(config)));
        break;
      case "parallax-subtle": {
        var factor = 0.1 + ((intensity - 1) / 9) * 0.2;
        gsap.to(el, { y: function () { return -(el.offsetHeight * factor); }, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
        break;
      }
      case "scrub-pin":
        gsap.to(el, { scrollTrigger: { trigger: el, start: "top top", end: "+=100%", scrub: 1, pin: true } });
        break;
      case "sticky-stack":
        gsap.to(el, { scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 1, pin: true } });
        break;
      case "horizontal-pan": {
        var track = el.querySelector(".pan-track") || el;
        gsap.to(track, { x: function () { return -(track.scrollWidth - window.innerWidth); }, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "+=150%", scrub: 1, pin: true, invalidateOnRefresh: true } });
        break;
      }
      case "scroll-progress": {
        if (document.querySelector("[data-scroll-progress]")) break;
        var bar = document.createElement("div");
        bar.setAttribute("data-scroll-progress", "");
        bar.style.cssText = "position:fixed;top:0;left:0;height:3px;width:100%;transform-origin:0 50%;transform:scaleX(0);z-index:9999;background:var(--accent);";
        document.body.appendChild(bar);
        gsap.to(bar, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
        break;
      }
      case "counter": {
        var targets = el.hasAttribute("data-count") ? [el] : Array.prototype.slice.call(el.querySelectorAll("[data-count]"));
        targets.forEach(function (target) {
          var raw = target.getAttribute("data-count") || "0";
          var format = countFormat(raw);
          var goal = format.goal;
          var prefix = target.getAttribute("data-prefix") || "";
          var suffix = target.getAttribute("data-suffix") || "";
          var state = { value: 0 };
          var render = function () {
            target.textContent = prefix + countText(state.value, format) + suffix;
          };
          gsap.to(state, Object.assign({ value: goal, duration: Math.max(0.8, duration * 2), ease: ease, delay: delay, onUpdate: render }, triggerProps(config)));
          render();
        });
        break;
      }
      case "char-split": {
        var source = el.querySelector("h1, h2, h3, p") || el;
        if (has.splittext) {
          window.SplitText.create(source, {
            type: "chars,words",
            aria: "auto",
            autoSplit: true,
            onSplit: function (self) {
              // A word that is wider than its box overflows like plain text instead of breaking inside.
              self.words.forEach(function (word) { word.style.whiteSpace = "nowrap"; });
              return gsap.from(self.chars, Object.assign({ opacity: 0, y: 8, duration: 0.4, ease: ease, delay: delay, stagger: 0.02 }, triggerProps(config)));
            }
          });
          break;
        }
        var text = source.textContent;
        source.innerHTML = text.split("").map(function (ch) {
          return '<span style="display:inline-block">' + (ch === " " ? "&nbsp;" : escapeHtml(ch)) + "</span>";
        }).join("");
        gsap.from(source.querySelectorAll("span"), Object.assign({ opacity: 0, y: 8, duration: 0.4, ease: ease, delay: delay, stagger: 0.02 }, triggerProps(config)));
        break;
      }
      case "magnetic-button": {
        if (!hoverable || typeof gsap.quickTo !== "function") break;
        var magnet = el.matches("a, button") ? el : el.querySelector("a, button");
        if (!magnet) break;
        var strength = 4 + intensity * 1.2;
        var magnetX = gsap.quickTo(magnet, "x", { duration: 0.3, ease: "power2.out" });
        var magnetY = gsap.quickTo(magnet, "y", { duration: 0.3, ease: "power2.out" });
        magnet.addEventListener("pointermove", function (event) {
          var rect = magnet.getBoundingClientRect();
          magnetX(((event.clientX - rect.left) / rect.width - 0.5) * strength);
          magnetY(((event.clientY - rect.top) / rect.height - 0.5) * strength);
        });
        magnet.addEventListener("pointerleave", function () { magnetX(0); magnetY(0); });
        break;
      }
      case "tilt-card": {
        if (!hoverable || typeof gsap.quickTo !== "function") break;
        var tiltMax = 3 + intensity * 0.5;
        var tiltX = gsap.quickTo(el, "rotationX", { duration: 0.4, ease: "power2.out", transformPerspective: 900 });
        var tiltY = gsap.quickTo(el, "rotationY", { duration: 0.4, ease: "power2.out", transformPerspective: 900 });
        el.addEventListener("pointermove", function (event) {
          if (event.pointerType === "touch") return;
          var rect = el.getBoundingClientRect();
          tiltX(-((event.clientY - rect.top) / rect.height - 0.5) * tiltMax);
          tiltY(((event.clientX - rect.left) / rect.width - 0.5) * tiltMax);
        });
        el.addEventListener("pointerleave", function () { tiltX(0); tiltY(0); });
        break;
      }
      case "cursor-glow": {
        if (!hoverable || typeof gsap.quickTo !== "function") break;
        if (document.querySelector("[data-motion-glow]")) break;
        var size = 180 + intensity * 40;
        var glow = document.createElement("div");
        glow.setAttribute("data-motion-glow", "");
        glow.style.cssText = "position:fixed;left:0;top:0;width:" + size + "px;height:" + size + "px;margin:" + (-size / 2) + "px 0 0 " + (-size / 2) + "px;border-radius:50%;pointer-events:none;z-index:2;opacity:0;transition:opacity 0.3s ease;background:radial-gradient(circle,color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%);";
        document.body.appendChild(glow);
        var glowX = gsap.quickTo(glow, "x", { duration: 0.6, ease: "power3.out" });
        var glowY = gsap.quickTo(glow, "y", { duration: 0.6, ease: "power3.out" });
        el.addEventListener("pointerenter", function () { glow.style.opacity = "1"; });
        el.addEventListener("pointermove", function (event) {
          glowX(event.clientX);
          glowY(event.clientY);
        });
        el.addEventListener("pointerleave", function () { glow.style.opacity = "0"; });
        break;
      }
      default:
        break;
    }
  }
})();
`;
}

// JSON for a script body: a literal `<` would end the tag early.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export type IslandsScriptOptions = {
  // payload id -> URL inside this build (`/assets/payloads/<id>.<hash>.js`).
  // The bake writes the file and passes the map; a preview without a file
  // server leaves the map empty and the poster stands (ADR-0010 §8).
  payloads?: Readonly<Record<string, string>>;
};

export function renderIslandsScript(
  kinds: Set<string>,
  options: IslandsScriptOptions = {},
): string {
  const blocks: string[] = [];
  if (kinds.has("menu")) {
    blocks.push(`
  document.querySelectorAll('[data-island="menu"]').forEach(function (button) {
    var panel = button.closest("section")?.querySelector("[data-menu-panel]");
    if (!panel) return;
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", function () {
      var open = panel.hasAttribute("hidden");
      if (open) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", String(open));
    });
  });`);
  }
  if (kinds.has("accordion")) {
    blocks.push(`
  document.querySelectorAll('[data-island="accordion"] details').forEach(function (details) {
    details.addEventListener("toggle", function () {
      if (!details.open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var body = details.querySelector("p");
      if (!body || typeof body.animate !== "function") return;
      body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    });
  });`);
  }
  if (kinds.has("slider")) {
    blocks.push(`
  document.querySelectorAll('[data-island="slider"]').forEach(function (slider) {
    var items = Array.prototype.slice.call(slider.querySelectorAll(":scope ul > li"));
    if (items.length < 2) return;
    var index = 0;
    var show = function (next) {
      index = (next + items.length) % items.length;
      items.forEach(function (item, position) {
        if (position === index) item.removeAttribute("hidden");
        else item.setAttribute("hidden", "");
      });
    };
    var prev = slider.querySelector("[data-slider-prev]");
    var next = slider.querySelector("[data-slider-next]");
    if (prev) prev.addEventListener("click", function () { show(index - 1); });
    if (next) next.addEventListener("click", function () { show(index + 1); });
    show(0);
  });`);
  }
  if (kinds.has("billing")) {
    blocks.push(`
  document.querySelectorAll('[data-island="billing"]').forEach(function (toggle) {
    var section = toggle.closest("section");
    if (!section) return;
    var setPeriod = function (period) {
      toggle.querySelectorAll("[data-billing]").forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-billing") === period));
      });
      section.querySelectorAll("[data-price-monthly]").forEach(function (price) {
        var value = period === "yearly" ? price.getAttribute("data-price-yearly") : price.getAttribute("data-price-monthly");
        if (value) price.textContent = value;
      });
    };
    toggle.querySelectorAll("[data-billing]").forEach(function (button) {
      button.addEventListener("click", function () {
        var period = button.getAttribute("data-billing");
        if (period) setPeriod(period);
      });
    });
  });`);
  }
  if (kinds.has("dismiss")) {
    blocks.push(`
  document.querySelectorAll('[data-island="dismiss"] [data-dismiss]').forEach(function (button) {
    button.addEventListener("click", function () {
      var host = button.closest("section") || button.parentElement;
      if (host) host.style.display = "none";
    });
  });`);
  }
  if (kinds.has("consent") || kinds.has("embed-gate")) {
    // One consent state for the whole site: the cookie notice writes it, gated
    // embeds read it, "Cookie-Einstellungen" links (`[data-consent-reset]`)
    // withdraw it. The choice is "accept" or "decline"; a dismissed notice
    // without a choice counts as no consent.
    blocks.push(`
  var consentApi = window.senifyConsent = window.senifyConsent || {
    get: function () { try { return window.localStorage.getItem("senify-consent"); } catch { return null; } },
    set: function (choice) {
      try { window.localStorage.setItem("senify-consent", choice); } catch { /* private mode: lasts for this page */ }
      document.dispatchEvent(new CustomEvent("senify:consent", { detail: choice }));
    },
    clear: function () {
      try { window.localStorage.removeItem("senify-consent"); } catch { /* ignore */ }
      document.dispatchEvent(new CustomEvent("senify:consent", { detail: null }));
    }
  };
  document.querySelectorAll("[data-consent-reset]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      consentApi.clear();
      window.location.reload();
    });
  });`);
  }
  if (kinds.has("consent")) {
    blocks.push(`
  document.querySelectorAll('[data-island="consent"]').forEach(function (dialog) {
    if (consentApi.get()) { dialog.style.display = "none"; return; }
    dialog.querySelectorAll("[data-consent]").forEach(function (button) {
      button.addEventListener("click", function () {
        consentApi.set(button.getAttribute("data-consent") === "accept" ? "accept" : "decline");
        dialog.style.display = "none";
      });
    });
  });`);
  }
  if (kinds.has("embed-gate")) {
    blocks.push(`
  function loadGatedFrame(frame) {
    var src = frame.getAttribute("data-consent-src");
    if (!src) return;
    frame.removeAttribute("data-consent-src");
    frame.setAttribute("src", src);
    frame.style.removeProperty("display");
    frame.hidden = false;
    var placeholder = frame.nextElementSibling;
    if (placeholder && placeholder.hasAttribute("data-consent-placeholder")) placeholder.remove();
  }
  function loadAllGatedFrames() {
    document.querySelectorAll("iframe[data-consent-src]").forEach(loadGatedFrame);
  }
  document.querySelectorAll("iframe[data-consent-src]").forEach(function (frame) {
    var placeholder = frame.nextElementSibling;
    var button = placeholder && placeholder.querySelector("[data-consent-load]");
    if (button) button.addEventListener("click", function () { loadGatedFrame(frame); });
  });
  if (consentApi.get() === "accept") loadAllGatedFrames();
  document.addEventListener("senify:consent", function (event) {
    if (event.detail === "accept") loadAllGatedFrames();
  });`);
  }
  if (kinds.has("modal")) {
    blocks.push(`
  document.querySelectorAll('[data-island="modal"]').forEach(function (host) {
    host.querySelectorAll("img, video, iframe").forEach(function (media) {
      media.style.cursor = "zoom-in";
      media.addEventListener("click", function () {
        var dialog = document.createElement("dialog");
        dialog.setAttribute("data-motion-modal", "");
        dialog.style.cssText = "border:none;padding:0;background:transparent;max-width:92vw;max-height:92vh;";
        var clone = media.cloneNode(true);
        clone.removeAttribute("style");
        clone.style.cssText = "display:block;max-width:92vw;max-height:92vh;width:auto;height:auto;";
        dialog.appendChild(clone);
        dialog.addEventListener("click", function (event) {
          if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener("close", function () { dialog.remove(); });
        document.body.appendChild(dialog);
        dialog.showModal();
      });
    });
  });`);
  }
  if (kinds.has("webgl-scene")) {
    blocks.push(`
  // 3D scene (M6): three.js is self-hosted and lazy. The module loads only
  // when the first host scrolls near the viewport; until then — and without
  // WebGL, JS or with reduced motion — the CSS poster stands. One canvas per
  // page is a hard guardrail: the script drives the hosts the markup provides,
  // it never creates one.
  (function () {
    var hosts = document.querySelectorAll('[data-island="webgl-scene"]');
    if (hosts.length === 0 || typeof IntersectionObserver !== "function") return;
    var started = false;
    var start = function () {
      if (started) return;
      started = true;
      import("${WEBGL_VENDOR_URL}").then(function (THREE) {
        for (var index = 0; index < hosts.length; index += 1) {
          try { buildScene(THREE, hosts[index]); } catch (error) { /* poster stands */ }
        }
      }).catch(function () { /* poster stands */ });
    };
    var observer = new IntersectionObserver(function (entries) {
      for (var index = 0; index < entries.length; index += 1) {
        if (entries[index].isIntersecting) { observer.disconnect(); start(); return; }
      }
    }, { rootMargin: "200px" });
    for (var index = 0; index < hosts.length; index += 1) observer.observe(hosts[index]);
  })();
  function readColor(value, fallback) {
    var text = String(value || "").trim();
    return text === "" ? fallback : text;
  }
  function buildScene(THREE, host) {
    var canvas = host.querySelector("canvas");
    if (!canvas) return;
    var computed = window.getComputedStyle(host);
    var accent = readColor(computed.getPropertyValue("--accent"), "#4f46e5");
    var muted = readColor(computed.getPropertyValue("--fg-muted"), "#94a3b8");
    var intensity = Number(host.getAttribute("data-intensity"));
    if (!isFinite(intensity) || intensity < 1 || intensity > 10) intensity = 5;
    var variant = host.getAttribute("data-scene") || "orb";
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    var root = new THREE.Group();
    var spin = new THREE.Group();
    root.add(spin);
    scene.add(root);
    var update = null;
    if (variant === "wave") {
      camera.position.set(0, 1.05, 4.4);
      camera.lookAt(0, 0, 0);
      var columns = 64;
      var rows = 32;
      var spacing = 0.14;
      var count = columns * rows;
      var positions = new Float32Array(count * 3);
      var base = new Float32Array(count * 2);
      var cursor = 0;
      for (var row = 0; row < rows; row += 1) {
        for (var column = 0; column < columns; column += 1) {
          var x = (column - (columns - 1) / 2) * spacing;
          var z = (row - (rows - 1) / 2) * spacing;
          positions[cursor * 3] = x;
          positions[cursor * 3 + 1] = 0;
          positions[cursor * 3 + 2] = z;
          base[cursor * 2] = x;
          base[cursor * 2 + 1] = z;
          cursor += 1;
        }
      }
      var geometry = new THREE.BufferGeometry();
      var attribute = new THREE.BufferAttribute(positions, 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      var points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: accent, size: 0.045, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false }));
      points.rotation.x = -0.55;
      spin.add(points);
      var amplitude = 0.12 + intensity * 0.02;
      update = function (time) {
        for (var index = 0; index < count; index += 1) {
          var px = base[index * 2];
          var pz = base[index * 2 + 1];
          positions[index * 3 + 1] = Math.sin(px * 1.3 + time * 0.0011) * Math.cos(pz * 1.1 - time * 0.0009) * amplitude;
        }
        attribute.needsUpdate = true;
      };
    } else {
      camera.position.set(0, 0, 4.6);
      var wire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.2, 1),
        new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.5 })
      );
      spin.add(wire);
      var cloudCount = 380;
      var cloudPositions = new Float32Array(cloudCount * 3);
      var golden = Math.PI * (1 + Math.sqrt(5));
      for (var point = 0; point < cloudCount; point += 1) {
        var t = point / cloudCount;
        var phi = Math.acos(1 - 2 * t);
        var theta = golden * point;
        var radius = 1.55 + (point % 9) * 0.02;
        cloudPositions[point * 3] = Math.sin(phi) * Math.cos(theta) * radius;
        cloudPositions[point * 3 + 1] = Math.cos(phi) * radius;
        cloudPositions[point * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      }
      var cloudGeometry = new THREE.BufferGeometry();
      cloudGeometry.setAttribute("position", new THREE.BufferAttribute(cloudPositions, 3));
      var cloud = new THREE.Points(cloudGeometry, new THREE.PointsMaterial({ color: muted, size: 0.03, transparent: true, opacity: 0.7, sizeAttenuation: true, depthWrite: false }));
      spin.add(cloud);
    }
    var resize = function () {
      var rect = host.getBoundingClientRect();
      var width = Math.max(1, Math.round(rect.width));
      var height = Math.max(1, Math.round(rect.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(host);
    else window.addEventListener("resize", resize);
    // Reduced motion: one static frame, no loop, no pointer coupling.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      renderer.render(scene, camera);
      return;
    }
    var pointer = { x: 0, y: 0 };
    var target = { x: 0, y: 0 };
    if (window.matchMedia("(hover: hover)").matches) {
      host.addEventListener("pointermove", function (event) {
        var rect = host.getBoundingClientRect();
        target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      });
      host.addEventListener("pointerleave", function () { target.x = 0; target.y = 0; });
    }
    var visible = true;
    new IntersectionObserver(function (entries) {
      if (entries[0]) visible = entries[0].isIntersecting;
    }).observe(host);
    var time = 0;
    var previous = 0;
    var tick = function (now) {
      var delta = previous === 0 ? 16 : Math.min(48, now - previous);
      previous = now;
      if (visible && !document.hidden) {
        time += delta;
        var speed = 0.00005 + intensity * 0.00002;
        spin.rotation.y += delta * speed;
        spin.position.y = Math.sin(time * 0.0006) * (0.03 + intensity * 0.012);
        pointer.x += (target.x - pointer.x) * 0.06;
        pointer.y += (target.y - pointer.y) * 0.06;
        root.rotation.y = pointer.x * 0.35;
        root.rotation.x = pointer.y * 0.22;
        if (update) update(time);
        renderer.render(scene, camera);
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }`);
  }
  if (kinds.has("payload")) {
    const urls = options.payloads ?? {};
    blocks.push(`
  // Imported foreign code (ADR-0010): the payload is a self-contained module
  // written by this bake. It loads only when its host scrolls near the
  // viewport, never from a foreign URL, and every failure stays visible — the
  // host keeps its poster, or its plate when there is no poster at all.
  (function () {
    var urls = ${jsonForScript(urls)};
    // A carrier whose switch "covers the page" is OFF is the way BACK to the
    // structure tree (ADR-0026): the author wants the editable page, and the
    // payload would paint over it. Measured on rare-works: the carrier started
    // at 0 px, the page was 17.508 px, and at scrollY 16.800 the module mounted
    // and the carrier grew to 17.508 px, so the whole page stood twice
    // (35.016 px). The switch has to stop the module, not only its plate.
    var carriers = document.querySelectorAll('[data-island="payload"]');
    for (var off = 0; off < carriers.length; off += 1) {
      if (carriers[off].getAttribute("data-payload-covers-page") === null) {
        carriers[off].setAttribute("data-payload-state", "off");
      }
    }
    var hosts = document.querySelectorAll('[data-island="payload"][data-payload-covers-page]');
    if (hosts.length === 0) return;
    var mount = function (host) {
      if (host.getAttribute("data-payload-state") === "mounted") return;
      var id = host.getAttribute("data-payload-id") || "";
      var url = Object.prototype.hasOwnProperty.call(urls, id) ? urls[id] : "";
      if (url === "") {
        // No payload in this build: the poster (or the plate) is the answer.
        host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
        return;
      }
      import(url).then(function (module) {
        var fn = module && (typeof module.mount === "function" ? module.mount : (module.default && typeof module.default.mount === "function" ? module.default.mount : null));
        var stage = host.querySelector("[data-payload-stage]") || host;
        if (typeof fn !== "function") {
          host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
          return;
        }
        try {
          fn(stage, { id: id, host: host });
          host.setAttribute("data-payload-state", "mounted");
        } catch (error) {
          host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
        }
      }).catch(function () {
        host.setAttribute("data-payload-state", host.getAttribute("data-payload-poster") === "1" ? "failed" : "plate");
      });
    };
    if (typeof IntersectionObserver !== "function") {
      for (var index = 0; index < hosts.length; index += 1) mount(hosts[index]);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      for (var index = 0; index < entries.length; index += 1) {
        if (!entries[index].isIntersecting) continue;
        observer.unobserve(entries[index].target);
        mount(entries[index].target);
      }
    }, { rootMargin: "300px" });
    for (var index = 0; index < hosts.length; index += 1) observer.observe(hosts[index]);
  })();`);
  }
  if (blocks.length === 0) return "";
  return `(function () {
  "use strict";
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {${blocks.join("\n")}
  });
})();
`;
}
