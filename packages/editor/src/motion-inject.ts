// Shared motion injection (M4): one source for the runtime contract both
// editor paths inject into a frame document.
//
// The v1 editor (`mount.ts`) injects on demand in design mode and automatically
// in live mode; the rebuild canvas (`canvas.ts`) injects when it switches to
// live (M4 Stufe 1). Both must build the very same contract the bake writes —
// `motion-data` v2, the self-hosted vendor files, the runtime script, Lenis
// following the site profile (F6/F7). Keeping that in one module is the same
// "one source, two paths" rule the frame rules follow.

import type { MotionProfile, NodeTree } from "@senify/section-sdk";
import { resolveTheme, type Theme } from "@senify/tokens";
import {
  motionConfigsForTree,
  motionDataFor,
  parseDurationMs,
  renderPageScript,
  type MotionTokens,
} from "@senify/renderer/motion";
import type { DomDocument, DomElement } from "./dom.ts";

// The engine route that serves the self-hosted runtime files; the local
// program proxies `/api/` with the operator token.
export const MOTION_VENDOR_BASE = "/api/motion-vendor";

export function motionTokensFor(theme: Theme | undefined): MotionTokens {
  const resolved = theme === undefined ? undefined : resolveTheme(theme);
  const baseDuration = resolved?.motion.duration.base;
  return {
    ease: resolved?.motion.ease ?? {},
    baseDurationMs: baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
    baseStaggerMs: 80,
  };
}

// Lenis is part of the site profile (F6/F7, MOTION_PROFILE_RULES): live mode
// mirrors the release, so it honours the same switch the bake reads.
export function profileLenis(profile: MotionProfile): boolean {
  return profile !== "clean";
}

// True once this frame document carries the injected contract; the guard keeps
// a refresh from stacking a second runtime next to the first.
export function motionInjected(doc: DomDocument): boolean {
  return doc.querySelector("script[data-senify-motion], #motion-data") !== null;
}

export type InjectMotionOptions = {
  doc: DomDocument;
  body: DomElement;
  tree: NodeTree;
  theme?: Theme;
  // The site profile decides the Lenis switch; the caller passes the resolved
  // `lenis` flag (design play stays off, live follows the profile).
  profile: MotionProfile;
  lenis: boolean;
  vendorBase?: string;
  onMessage?: (message: string | null) => void;
};

export function injectMotionRuntime(options: InjectMotionOptions): void {
  const { doc, body } = options;
  if (motionInjected(doc)) return;
  const { configs, warnings } = motionConfigsForTree(
    options.tree,
    motionTokensFor(options.theme),
  );
  const firstWarning = warnings[0];
  if (firstWarning !== undefined) options.onMessage?.(firstWarning.message);

  const payload = doc.createElement("script");
  payload.setAttribute("type", "application/json");
  payload.setAttribute("id", "motion-data");
  payload.textContent = JSON.stringify(motionDataFor(configs));
  body.appendChild(payload);

  const needs = new Set(configs.flatMap((config) => config.needs ?? []));
  const names = [
    "gsap.min.js",
    ...(needs.has("scrolltrigger") ? ["ScrollTrigger.min.js"] : []),
    ...(needs.has("splittext") ? ["SplitText.min.js"] : []),
    ...(options.lenis ? ["lenis.min.js"] : []),
  ];
  const base = options.vendorBase ?? MOTION_VENDOR_BASE;
  let remaining = names.length;
  const runRuntime = (): void => {
    const script = doc.createElement("script");
    script.setAttribute("data-senify-motion", "runtime");
    script.textContent = renderPageScript({ lenis: options.lenis });
    body.appendChild(script);
  };
  if (remaining === 0) {
    runRuntime();
    return;
  }
  for (const name of names) {
    const script = doc.createElement("script");
    script.setAttribute("src", `${base}/${name}`);
    script.setAttribute("data-senify-motion", "vendor");
    const async = script as unknown as {
      async?: boolean;
      onload?: (() => void) | null;
      onerror?: (() => void) | null;
    };
    // `async = false` keeps the execution order: an inline runtime appended
    // before the plugins would see an empty `window.gsap`.
    async.async = false;
    const done = (): void => {
      remaining -= 1;
      if (remaining === 0) runRuntime();
    };
    async.onload = done;
    async.onerror = done;
    body.appendChild(script);
  }
}
