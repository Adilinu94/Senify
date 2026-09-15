import type { MotionSpec, NodeTree } from "@senify/section-sdk";

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
] as const;

export const PIN_PRESETS: readonly string[] = [
  "scrub-pin",
  "sticky-stack",
  "horizontal-pan",
];

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
};

export type MotionWarning = {
  code?: "unimplemented-preset" | "pin-excess" | "char-split-excess";
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

export function motionConfigsForTree(
  tree: NodeTree,
  tokens: MotionTokens,
): { configs: MotionConfig[]; warnings: MotionWarning[] } {
  const configs: MotionConfig[] = [];
  const warnings: MotionWarning[] = [];
  let pins = 0;
  let charSplits = 0;
  for (const node of Object.values(tree.nodes)) {
    const motion: MotionSpec | undefined = node.motion;
    if (!motion) continue;
    if (!(PAGE_SCRIPT_PRESETS as readonly string[]).includes(motion.preset)) {
      warnings.push({
        code: "unimplemented-preset",
        nodeId: node.id,
        preset: motion.preset,
        message: `Motion preset "${motion.preset}" is not implemented in the page script v1`,
        suggestion: "Use a category A–C preset, or ship the effect as an island.",
      });
      continue;
    }
    if (PIN_PRESETS.includes(motion.preset)) pins += 1;
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
    configs.push({
      nodeId: node.id,
      preset: motion.preset,
      intensity,
      trigger: motion.trigger ?? "viewport",
      delay: motion.delay ?? 0,
      ease: motion.tokens?.ease ? tokens.ease[motion.tokens.ease] : undefined,
      duration:
        ((motion.tokens?.durationScale ?? 1) * tokens.baseDurationMs) / 1000,
      stagger:
        ((motion.tokens?.stagger ?? 1) * tokens.baseStaggerMs) / 1000,
      cssOnly: motion.preset === "marquee" ? true : undefined,
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
  return { configs, warnings };
}

export const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js";
export const SCROLL_TRIGGER_CDN =
  "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js";
export const SPLIT_TEXT_CDN =
  "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js";
export const LENIS_CDN =
  "https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js";

export function renderPageScript(options: { lenis: boolean }): string {
  const lenisBlock = options.lenis
    ? `
    if (typeof window.Lenis !== "undefined" && !window.matchMedia("(pointer: coarse)").matches) {
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
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    var data = document.getElementById("motion-data");
    var configs = [];
    try {
      configs = data ? JSON.parse(data.textContent || "[]") : [];
    } catch {
      return;
    }
    var hasGsap = typeof window.gsap !== "undefined";${lenisBlock}
    if (hasGsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
    configs.forEach(function (config) {
      if (!config || config.cssOnly) return;
      var el = document.querySelector('[data-node-id="' + config.nodeId + '"]');
      if (!el) return;
      runPreset(el, config);
    });
  });
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function triggerProps(config) {
    if (config.trigger === "load") return {};
    return { scrollTrigger: { trigger: "[data-node-id='" + config.nodeId + "']", start: "top 85%", once: true } };
  }
  function runPreset(el, config) {
    if (typeof window.gsap === "undefined") return;
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
        gsap.to(el, { y: function () { return -(el.offsetHeight * factor); }, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
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
        gsap.to(track, { x: function () { return -(track.scrollWidth - window.innerWidth); }, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "+=150%", scrub: 1, pin: true } });
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
          var goal = Number.parseFloat(raw.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
          var decimals = (raw.split(".")[1] || "").replace(/[^0-9]/g, "").length;
          var prefix = target.getAttribute("data-prefix") || "";
          var suffix = target.getAttribute("data-suffix") || "";
          var state = { value: 0 };
          var render = function () {
            target.textContent = prefix + state.value.toFixed(decimals) + suffix;
          };
          gsap.to(state, Object.assign({ value: goal, duration: Math.max(0.8, duration * 2), ease: ease, delay: delay, onUpdate: render }, triggerProps(config)));
          render();
        });
        break;
      }
      case "char-split": {
        var source = el.querySelector("h1, h2, h3, p") || el;
        var text = source.textContent;
        source.innerHTML = text.split("").map(function (ch) {
          return '<span style="display:inline-block">' + (ch === " " ? "&nbsp;" : escapeHtml(ch)) + "</span>";
        }).join("");
        gsap.from(source.querySelectorAll("span"), Object.assign({ opacity: 0, y: 8, duration: 0.4, ease: ease, delay: delay, stagger: 0.02 }, triggerProps(config)));
        break;
      }
      default:
        break;
    }
  }
})();
`;
}

export function renderIslandsScript(kinds: Set<string>): string {
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
  if (kinds.has("consent")) {
    blocks.push(`
  document.querySelectorAll('[data-island="consent"]').forEach(function (dialog) {
    try {
      if (window.localStorage.getItem("senify-consent")) { dialog.style.display = "none"; return; }
    } catch { /* private mode: keep showing */ }
    dialog.querySelectorAll("[data-consent]").forEach(function (button) {
      button.addEventListener("click", function () {
        try { window.localStorage.setItem("senify-consent", button.getAttribute("data-consent") || "dismissed"); } catch { /* ignore */ }
        dialog.style.display = "none";
      });
    });
  });`);
  }
  if (kinds.has("webgl-scene")) {
    blocks.push(`
  // 3D islands render through the R3F island (lands with the 3D follow-up).
  // Until then the server-rendered canvas poster stays put — no JS needed.
  void 0;`);
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
