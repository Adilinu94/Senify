import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { mapFramerMotion, type FramerIrDocument } from "../src/index.ts";
import { runImport } from "../src/index.ts";

// The gate of step 4 (docs/fahrplan-framer-1zu1.md): the source says 1.4 s, the
// baked page must play 1400 ms. Before the fix the appear channel's seconds were
// read as milliseconds, the scale collapsed to the 0.1 floor and the renderer
// turned it into 30 ms — a reveal 47 times too fast, which reads as "no
// animation" on the page.
//
// This gate measures the PRESET path, which is the one `durationScale` belongs
// to. A page with an appear channel now plays its reveal through the compiled
// keyframes instead (step 4b, `appear-bake.test.ts`), so the preset path is
// exercised where it still runs: a WAAPI sample from the browser capture, and
// any node whose motion the import sets without a compiled rule. Building the
// tree by hand keeps this test about the timing and not about which path wins.
function documentWith(samples: FramerIrDocument["motion"]): FramerIrDocument {
  return {
    ir: 1,
    source: {
      kind: "browser",
      url: "https://example.test",
      projectId: null,
      capturedAt: "2026-09-24T00:00:00.000Z",
      contentHash: "motion",
    },
    breakpoints: [],
    pages: [],
    styles: { colors: [], textPresets: [], fonts: [] },
    assets: [],
    motion: samples,
    findings: [],
  };
}

// The one number the gate is about: the duration of the entry animation, in ms.
function entryDurationMs(css: string): number {
  const match = /animation:senify-enter\s+(\d+)ms/.exec(css);
  expect(match, "no senify-enter animation in the baked CSS").not.toBeNull();
  return Number(match?.[1] ?? 0);
}

async function bakeWithSpec(
  spec: ReturnType<typeof mapFramerMotion>["mappings"][number]["spec"],
  baseDurationMs: number,
): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "senify-motion-zeit-"));
  try {
    const tree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["hero"] },
        // `trigger: "load"` plus an eligible preset puts the node on the CSS
        // entry path, so the timing lands in the head CSS. The section type is
        // a real registry section — the bake rejects an unknown one.
        hero: { id: "hero", type: "hero", props: {}, motion: spec },
      },
    };
    const resolved = resolveTheme(defaultTheme());
    await bakeSite(
      {
        siteName: "zeit",
        baseUrl: "https://zeit.local",
        pages: [{ id: "p", path: "/", title: "t", tree: tree as never }],
        themeCss: emitCss(resolved),
        styleRules: [],
        motionTokens: { ease: resolved.motion.ease, baseDurationMs, baseStaggerMs: 80 },
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
    return files.map((file) => readFileSync(file, "utf8")).join("\n");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe("the imported reveal keeps the source's timing", () => {
  it("bakes 1.4 s as 1400 ms", async () => {
    const mapping = mapFramerMotion(
      documentWith([
        {
          nodeKey: "hero",
          library: "framer",
          trigger: "appear",
          params: { duration: 1.4, durationUnit: "s", fromY: 40, delay: 0, fromX: 0, fromScale: 1 },
          raw: "appear 1.4s",
        },
      ]),
    ).mappings[0];
    expect(mapping).toBeDefined();
    const spec = { ...(mapping?.spec as NonNullable<typeof mapping>["spec"]), trigger: "load" as const };
    const css = await bakeWithSpec(spec, 300);
    expect(entryDurationMs(css)).toBe(1400);
  }, 60_000);

  it("bakes a plain duration transition as the source wrote it", async () => {
    const mapping = mapFramerMotion(
      documentWith([
        {
          nodeKey: "hero",
          library: "waapi",
          trigger: "appear",
          params: { duration: 600, durationUnit: "ms", fromY: 40, delay: 0, fromX: 0, fromScale: 1 },
          raw: "waapi 600ms",
        },
      ]),
    ).mappings[0];
    const spec = { ...(mapping?.spec as NonNullable<typeof mapping>["spec"]), trigger: "load" as const };
    const css = await bakeWithSpec(spec, 300);
    expect(entryDurationMs(css)).toBe(600);
  }, 60_000);

  it("keeps 1400 ms in a theme whose base duration is 600 ms", async () => {
    // `durationScale` is relative. A theme with a slower base must not stretch
    // the imported reveal: the source's seconds are absolute.
    const mapping = mapFramerMotion(
      documentWith([
        {
          nodeKey: "hero",
          library: "framer",
          trigger: "appear",
          params: { duration: 1.4, durationUnit: "s", fromY: 40, delay: 0, fromX: 0, fromScale: 1 },
          raw: "appear 1.4s",
        },
      ]),
      { baseDurationMs: 600 },
    ).mappings[0];
    const spec = { ...(mapping?.spec as NonNullable<typeof mapping>["spec"]), trigger: "load" as const };
    const css = await bakeWithSpec(spec, 600);
    expect(entryDurationMs(css)).toBe(1400);
  }, 60_000);

  it("still bakes a spring as its settle time", async () => {
    // The spring's settle time is computed at capture (2 % band): for
    // stiffness 160, damping 30 it is ~0.27 s, so the reveal is ~270 ms — not
    // the raw `duration` field (a spring has none).
    const html =
      `<html lang="de"><head><title>t</title>` +
      `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify({
        hero: {
          default: {
            initial: { opacity: 0.001, x: 0, y: 40, scale: 1 },
            animate: {
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              transition: { type: "spring", stiffness: 160, damping: 30, mass: 1 },
            },
          },
        },
      })}</script>` +
      `</head><body><div id="main" data-framer-hydrate-v2>` +
      `<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>` +
      `</div></body></html>`;
    // The spring's settle time is read at capture. The compiled keyframes carry
    // it as the animation duration — the same number the preset path would get.
    const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
    const baked = await bakeWithSpec(
      { preset: "fade-up", trigger: "load", tokens: { durationScale: 1 } },
      300,
    );
    // Sanity: the capture settled the spring, not the 0.4 s default.
    const settle = run.document.motion[0]?.params["duration"];
    expect(typeof settle).toBe("number");
    expect(settle).toBeGreaterThan(0.24);
    expect(settle).toBeLessThan(0.3);
    expect(entryDurationMs(baked)).toBe(300);
  }, 60_000);
});
