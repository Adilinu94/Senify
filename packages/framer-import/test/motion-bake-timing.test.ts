import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

// The gate of step 4 (docs/fahrplan-framer-1zu1.md): the source says 1.4 s, the
// baked page must play 1400 ms. Before the fix the appear channel's seconds were
// read as milliseconds, the scale collapsed to the 0.1 floor and the renderer
// turned it into 30 ms — a reveal 47 times too fast, which reads as "no
// animation" on the page.
//
// The sample sits on a node the CSS-entry path picks up (`trigger: "load"` plus
// an eligible preset), so the timing lands in the head CSS — the same number the
// page script would use.
const appear = (duration: number) => ({
  hero: {
    default: {
      initial: { opacity: 0.001, x: 0, y: 40, scale: 1 },
      animate: { opacity: 1, x: 0, y: 0, scale: 1, transition: { type: "duration", duration } },
    },
  },
});

function page(duration: number): string {
  return (
    `<html lang="de"><head><title>t</title>` +
    `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(appear(duration))}</script>` +
    `</head><body><div id="main" data-framer-hydrate-v2>` +
    `<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>` +
    `</div></body></html>`
  );
}

async function bakeImported(html: string, baseDurationMs: number): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "senify-motion-zeit-"));
  try {
    const run = await runImport({ source: { kind: "html", html }, mode: "fidelity", baseDurationMs });
    const resolved = resolveTheme(defaultTheme());
    await bakeSite(
      {
        siteName: "zeit",
        baseUrl: "https://zeit.local",
        pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
        themeCss: emitCss(resolved),
        styleRules: run.mapped.rules,
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

// The one number the gate is about: the duration of the entry animation on the
// imported node, in milliseconds.
function entryDurationMs(css: string): number {
  const match = /animation:senify-enter\s+(\d+)ms/.exec(css);
  expect(match, "no senify-enter animation in the baked CSS").not.toBeNull();
  return Number(match?.[1] ?? 0);
}

describe("the imported reveal keeps the source's timing", () => {
  it("bakes 1.4 s as 1400 ms", async () => {
    const css = await bakeImported(page(1.4), 300);
    expect(entryDurationMs(css)).toBe(1400);
  }, 60_000);

  it("bakes a plain duration transition as the source wrote it", async () => {
    const css = await bakeImported(page(0.6), 300);
    expect(entryDurationMs(css)).toBe(600);
  }, 60_000);

  it("keeps 1400 ms in a theme whose base duration is 600 ms", async () => {
    // `durationScale` is relative. A theme with a slower base must not stretch
    // the imported reveal: the source's seconds are absolute.
    const css = await bakeImported(page(1.4), 600);
    expect(entryDurationMs(css)).toBe(1400);
  }, 60_000);

  it("still bakes a spring as its settle time", async () => {
    // The spring's settle time is computed at capture (2 % band): for
    // stiffness 160, damping 30 it is ~0.27 s, so the reveal is ~270 ms — not
    // the raw `duration` field (a spring has none).
    const spring = {
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
    };
    const html =
      `<html lang="de"><head><title>t</title>` +
      `<script type="application/json" id="__framer__appearAnimationsContent">${JSON.stringify(spring)}</script>` +
      `</head><body><div id="main" data-framer-hydrate-v2>` +
      `<div data-framer-appear-id="hero" style="opacity:0.001;transform:translateY(40px)">Held</div>` +
      `</div></body></html>`;
    const css = await bakeImported(html, 300);
    const baked = entryDurationMs(css);
    expect(baked).toBeGreaterThanOrEqual(240);
    expect(baked).toBeLessThanOrEqual(300);
  }, 60_000);
});
