import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";

// The families of an imported page (measured on `unifiersofjapan`, 22.10.2026).
//
// A Framer page can name seven families; a theme has three slots (display,
// body, mono). Every family without a `@font-face` falls back to the system
// font — and because a fallback font is wider, the text wraps elsewhere: the
// word "strategy" in Anton took TWO lines instead of one, 260 px per card,
// three cards, +780 px on a 7699 px page (20,45 % pixel difference).
//
// Measured counter-proof (bake with every source `@font-face` added by hand):
// the page height closed exactly (8479 → 7699 px), "strategy" 520 → 260 px.
//
// The fix: the theme patch carries every further family as `fonts.extra`, and
// the theme emits a `@font-face` per family. The page keeps the family names of
// the source (fidelity mode) — the face now exists, so nothing falls back.

const page = (body: string, head = ""): string =>
  `<html lang="de"><head><title>t</title>${head}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

// A Framer font block with the shape measured on the page: one family carries
// the whole weight range (it becomes body AND display), two others a single
// weight each — those are the ones without a theme slot.
const FONT_BLOCK = `<style data-framer-font-css>
@font-face { font-family: "Inter"; src: url(https://cdn.test/inter-400.woff2); font-weight: 400 }
@font-face { font-family: "Inter"; src: url(https://cdn.test/inter-900.woff2); font-weight: 900 }
@font-face { font-family: "Anton"; src: url(https://cdn.test/anton.woff2); font-weight: 400 }
@font-face { font-family: "Blanka"; src: url(https://cdn.test/blanka.woff2); font-weight: 700 }
</style>`;

const RULE_BLOCK = `<style>
.framer-rule-a { font-family: "Anton", sans-serif; font-weight: 400; }
.framer-rule-b { font-family: "Blanka", sans-serif; font-weight: 700; }
</style>`;

function run(body: string, head = "", mode: "dna" | "fidelity" = "fidelity"): ReturnType<typeof mapDocument> {
  const document = captureHtml({ html: page(body, head) });
  const normalized = normalize(document, { mode });
  return mapDocument(document, normalized.rules, { mode });
}

describe("the families of an imported page", () => {
  it("carries every further family as a theme font instead of dropping it", () => {
    const mapped = run(`<h1 class="framer-rule-a">strategy</h1>`, `${FONT_BLOCK}${RULE_BLOCK}`);
    const extra = mapped.themePatch.fonts?.extra;
    expect(extra).toBeDefined();
    // Inter owns the body and the display slot (it has the whole weight range),
    // so Anton and Blanka are the families the theme has no slot for.
    expect(mapped.themePatch.fonts?.body?.family).toBe("Inter");
    expect(extra?.["anton"]).toEqual({ family: "Anton", fallback: ["system-ui", "sans-serif"], weights: [400] });
    expect(extra?.["blanka"]).toEqual({ family: "Blanka", fallback: ["system-ui", "sans-serif"], weights: [700] });
  });

  it("does not put a family into the body slot that is not the body family", () => {
    // The counter-proof: before, every further family was pointed at
    // `var(--font-body)`, so Anton text drew in Inter — a different width and a
    // different line break.
    const mapped = run(`<h1 class="framer-rule-a">strategy</h1>`, `${FONT_BLOCK}${RULE_BLOCK}`);
    const rule = mapped.rules.find((entry) => entry.styles["fontFamily"] !== undefined);
    // Fidelity mode keeps the family of the source: the theme now supplies the
    // face for it, so the name is the right thing to keep.
    expect(rule?.styles["fontFamily"]).toBe('"Anton", sans-serif');
    expect(mapped.themePatch.fonts?.extra?.["anton"]).toBeDefined();
  });

  it("points a DNA-mode page at the variable of the extra family", () => {
    const mapped = run(`<h1 class="framer-rule-a">strategy</h1>`, `${FONT_BLOCK}${RULE_BLOCK}`, "dna");
    const rule = mapped.rules.find((entry) => entry.styles["fontFamily"] !== undefined);
    expect(rule?.styles["fontFamily"]).toBe("var(--font-anton)");
  });

  it("names a family the page uses even when its @font-face is missing", () => {
    // A Google-Fonts family: the rule names it, the font block does not.
    const mapped = run(
      `<p class="framer-rule-c">Text</p>`,
      `${FONT_BLOCK}<style>.framer-rule-c { font-family: "Mochiy Pop One", sans-serif; font-weight: 400; }</style>`,
    );
    expect(mapped.themePatch.fonts?.extra?.["mochiy-pop-one"]).toEqual({
      family: "Mochiy Pop One",
      fallback: ["system-ui", "sans-serif"],
      weights: [400],
    });
  });

  it("reads @font-face from every style block, not only the marked one", () => {
    const document = captureHtml({
      html: page(
        `<p>x</p>`,
        `<style data-framer-font-css>@font-face { font-family: "Inter"; src: url(https://cdn.test/inter.woff2); font-weight: 400 }</style>
         <style>@font-face { font-family: "Mochiy Pop One"; src: url(https://cdn.test/mochiy.woff2); font-weight: 400 }</style>`,
      ),
    });
    const families = document.styles.fonts.map((face) => face.family);
    expect(families).toContain("Inter");
    expect(families).toContain("Mochiy Pop One");
  });

  it("emits a @font-face and a variable for an extra family", () => {
    const theme = defaultTheme();
    theme.fonts.extra = {
      anton: {
        family: "Anton",
        fallback: ["system-ui", "sans-serif"],
        weights: [400],
        files: { "400": "/assets/a1/anton.woff2" },
      },
    };
    const css = emitCss(resolveTheme(theme));
    expect(css).toContain("--font-anton: Anton, system-ui, sans-serif;");
    expect(css).toContain("font-family: Anton;");
    expect(css).toContain("/assets/a1/anton.woff2");
  });

  it("keeps the theme valid after the extra families are merged in", () => {
    const theme = mergeThemePatch(defaultTheme(), {
      fonts: { extra: { anton: { family: "Anton", fallback: ["sans-serif"], weights: [400] } } },
    });
    expect(theme.fonts.extra?.["anton"]?.family).toBe("Anton");
    expect(theme.fonts.body.family).toBe("Inter");
  });
});
