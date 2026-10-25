import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

// The gate of step 4b: the appear channel must reach the BAKED stylesheet as
// keyframes, and an effect no preset can express (a sideways slide, a 3D tilt)
// must be replayed there too. Before this step those effects became a finding
// and nothing else — the page was static where the source moved.
const variant = (initial: Record<string, number>, transition: Record<string, unknown>) => ({
  initial: { opacity: 0.001, x: 0, y: 0, scale: 1, ...initial },
  animate: { opacity: 1, x: 0, y: 0, scale: 1, transition },
});

const appear = {
  hero: { default: variant({ y: 40 }, { type: "duration", duration: 1.4 }) },
  side: { default: variant({ x: 150 }, { type: "duration", duration: 0.5 }) },
  tilt: { default: variant({ rotateX: -25 }, { type: "duration", duration: 0.8 }) },
};

const html =
  `<html lang="de"><head><title>t</title>` +
  `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(appear)}</script>` +
  `</head><body><div id="main" data-framer-hydrate-v2>` +
  `<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>` +
  `<div data-framer-appear-id="side" style="opacity:0.001;transform:translateX(150px)">Seite</div>` +
  `<div data-framer-appear-id="tilt" style="opacity:0.001">Kippt</div>` +
  `</div></body></html>`;

describe("the compiled appear channel reaches the baked page", () => {
  it("writes keyframes for effects no preset can express", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-appear-bake-"));
    try {
      const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "appear",
          baseUrl: "https://appear.local",
          pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: out, selfContained: true },
      );
      const files = [
        join(out, "index.html"),
        ...readdirSync(join(out, "assets"))
          .filter((name) => name.endsWith(".css"))
          .map((name) => join(out, "assets", name)),
      ];
      const css = files.map((file) => readFileSync(file, "utf8")).join("\n");

      // The keyframes exist …
      expect(css).toContain("@keyframes senify-appear-hero-default");
      expect(css).toContain("@keyframes senify-appear-side-default");
      expect(css).toContain("@keyframes senify-appear-tilt-default");
      // … they carry the source's motion …
      expect(css).toContain("translateY(40px)");
      expect(css).toContain("translateX(150px)");
      expect(css).toContain("rotateX(-25deg)");
      // … the duration is the source's (1.4 s, not 30 ms) …
      expect(css).toMatch(/senify-appear-hero-default\s+1\.4s/);
      // … and the element holds both ends (`both`).
      expect(css).toMatch(/senify-appear-hero-default\s+1\.4s[^;"]*both/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);

  it("keeps the static start state out of the page (the reveal is not a hidden element)", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-appear-hidden-"));
    try {
      const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "appear",
          baseUrl: "https://appear.local",
          pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: out, selfContained: true },
      );
      const pageHtml = readFileSync(join(out, "index.html"), "utf8");
      // The capture took `opacity:0.001` out of the element's LOOK. The value
      // legitimately lives on in the keyframes (`from{opacity:0.001}`) — what
      // must not happen is an inline `style="…opacity:0.001…"` on the element,
      // which would hide it until the animation runs (and for good, if it never
      // does).
      const styledElements = pageHtml.match(/<[^>]*data-node-id="[^"]*"[^>]*>/g) ?? [];
      const withStartOpacity = styledElements.filter((tag) => /style="[^"]*opacity:\s*0?\.0*1/.test(tag));
      expect(withStartOpacity).toEqual([]);
      // The animation class is on the element.
      expect(pageHtml).toMatch(/class="[^"]*fi-[0-9a-f]{6}-appear-1/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);

  it("writes a reduced-motion rule so a stopped animation cannot hide the text", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-appear-rm-"));
    try {
      const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "appear",
          baseUrl: "https://appear.local",
          pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: out, selfContained: true },
      );
      const files = [
        join(out, "index.html"),
        ...readdirSync(join(out, "assets"))
          .filter((name) => name.endsWith(".css"))
          .map((name) => join(out, "assets", name)),
      ];
      const css = files.map((file) => readFileSync(file, "utf8")).join("\n");
      // The style registry compiles the rule's own states; a motion rule that
      // stops under reduced motion must be visible, not blank.
      expect(css).toContain("prefers-reduced-motion");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);
});
