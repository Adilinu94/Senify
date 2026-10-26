import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

// A node can have TWO sources of motion: the closed preset registry (what the
// editor shows, played by the page script) and the compiled appear rule (what
// the source actually did, played as CSS). They must never both run: the preset
// starts its own `gsap.from` with its own offset, so the element would play two
// animations at once and the later one wins.
//
// The rule: the compiled appear rule owns the reveal. A preset is only set where
// there is no appear rule for that node.
const appear = {
  hero: {
    default: {
      initial: { opacity: 0.001, y: 40, scale: 1, x: 0 },
      animate: { opacity: 1, y: 0, scale: 1, x: 0, transition: { type: "duration", duration: 1.4 } },
    },
  },
};

const html =
  `<html lang="de"><head><title>t</title>` +
  `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(appear)}</script>` +
  `</head><body><div id="main" data-framer-hydrate-v2>` +
  `<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>` +
  `</div></body></html>`;

describe("one motion, one owner", () => {
  it("does not set a preset on a node that carries a compiled appear rule", async () => {
    const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
    const withAppear = Object.values(run.mapped.document.nodes).filter((node) =>
      (node.classes ?? []).some((name) => name.includes("-appear-")),
    );
    expect(withAppear).toHaveLength(1);
    // The reveal is the source's, not a preset's.
    expect(withAppear[0]?.motion).toBeUndefined();
  }, 60_000);

  it("still sets a preset where no appear rule exists", async () => {
    // A page without an appear channel and without a start state has nothing to
    // compile — the preset path stays in charge there.
    const { captureHtml } = await import("../src/index.ts");
    const document = captureHtml({
      html: `<html lang="de"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2><div>Text</div></div></body></html>`,
    });
    // Sanity: nothing to compile, so no rule would claim the reveal.
    expect(document.appear ?? []).toEqual([]);
    const run = await runImport({
      source: {
        kind: "html",
        html:
          `<html lang="de"><head><title>t</title>` +
          `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify({
            other: appear.hero,
          })}</script>` +
          `</head><body><div id="main" data-framer-hydrate-v2>` +
          `<div data-framer-appear-id="other" style="opacity:0.001">Andere</div>` +
          `<div data-framer-appear-id="plain" style="opacity:0.001;transform:translateY(40px)">Ohne Kanal</div>` +
          `</div></body></html>`,
      },
      mode: "fidelity",
    });
    // The channel describes `other`, and `plain` has a start state the channel
    // never names — since the derivation runs on every page (measured on
    // `rare-works`: 328 such elements), that element owns its reveal too. Two
    // effects, and each of them is a compiled rule: no preset may double them.
    const withAppear = Object.values(run.mapped.document.nodes).filter((node) =>
      (node.classes ?? []).some((name) => name.includes("-appear-")),
    );
    expect(withAppear).toHaveLength(2);
    // Every moving node is owned by exactly one compiled rule: nothing runs a
    // preset next to an appear rule.
    const ohneRegel = Object.values(run.mapped.document.nodes).filter(
      (node) => node.motion !== undefined && !(node.classes ?? []).some((name) => name.includes("-appear-")),
    );
    expect(ohneRegel).toHaveLength(0);
  }, 60_000);

  it("plays exactly one reveal in the baked page", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-owner-"));
    try {
      const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "owner",
          baseUrl: "https://owner.local",
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
      // The CSS reveal is there …
      expect(css).toMatch(/senify-appear-hero-default\s+1\.4s/);
      // … and no preset animation was stamped onto the same node. The page
      // script reads its entries from `motion-data`; an entry for this node
      // would start a second reveal.
      const pageHtml = readFileSync(join(out, "index.html"), "utf8");
      const motionData = /<script[^>]*id="motion-data"[^>]*>([\s\S]*?)<\/script>/.exec(pageHtml)?.[1];
      const entries = motionData === undefined ? [] : (JSON.parse(motionData) as { entries?: unknown[] }).entries ?? [];
      expect(entries).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);
});
