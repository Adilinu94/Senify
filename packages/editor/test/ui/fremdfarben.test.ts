import { describe, expect, it } from "vitest";
import { EDITOR_BASE_STYLES } from "../../src/ui/base.ts";
import { CANVAS_STYLES } from "../../src/canvas/styles.ts";
import { EXPLORER_STYLES } from "../../src/explorer/styles.ts";
import { INSPECTOR_STYLES } from "../../src/inspector/styles.ts";
import { SPOTLIGHT_STYLES } from "../../src/spotlight/styles.ts";
import { EDITOR_CANVAS_SKIN_STYLES, EDITOR_SKIN_STYLES } from "../../src/ui/skin.ts";
import { EDITOR_TOKENS } from "../../src/ui/tokens.ts";

// E16 P0: the running editor has no foreign palette. Every colour in the new
// chrome is either a `var(--ed-*)` token reference or one of the documented
// derived values below; the legacy magenta/violet/sky palette is gone.
//
// The two exceptions are structural, not palette:
// - `#ffffff` is the content paper (and the colour-knob highlight) — the sheet
//   the page is drawn on, never a control colour.
// - the `rgb(... / alpha)` values are alpha variants of token colours
//   (Tiefwasser 300 for the signal tracks, a dark blue-black for scrims and
//   knob edges), taken 1:1 from the design preview (`ui-preview/index.html`).

const NEW_CHROME: Record<string, string> = {
  "canvas": CANVAS_STYLES,
  "explorer": EXPLORER_STYLES,
  "inspector": INSPECTOR_STYLES,
  "spotlight": SPOTLIGHT_STYLES,
  "skin": EDITOR_SKIN_STYLES,
  "canvas-skin": EDITOR_CANVAS_SKIN_STYLES,
  "base": EDITOR_BASE_STYLES,
};

const HEX_ALLOWLIST = new Set(["#ffffff"]);
const RGB_PREFIXES = ["rgb(154 201 226 /", "rgb(1 20 32 /", "rgb(1 40 60 /"];
const LEGACY_PALETTE = [
  "#d004d4",
  "#e879f9",
  "#f0abfc",
  "#a21caf",
  "#86198f",
  "#b000b0",
  "#7c3aed",
  "#ede9fe",
  "#4f46e5",
  "#0ea5e9",
  "#e0f2fe",
];

describe("new chrome has no foreign palette (E16 P0)", () => {
  it("uses only the white paper as a literal hex colour", () => {
    for (const [name, css] of Object.entries(NEW_CHROME)) {
      const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) =>
        match[0].toLowerCase(),
      );
      for (const hex of hexes) {
        expect(HEX_ALLOWLIST.has(hex), `${name}: foreign hex ${hex}`).toBe(true);
      }
    }
  });

  it("keeps rgb() values to the documented token alpha variants", () => {
    for (const [name, css] of Object.entries(NEW_CHROME)) {
      const values = [...css.matchAll(/rgba?\([^)]*\)/gi)].map((match) => match[0]);
      for (const value of values) {
        const allowed = RGB_PREFIXES.some((prefix) => value.startsWith(prefix));
        expect(allowed, `${name}: foreign colour ${value}`).toBe(true);
      }
    }
  });

  it("never carries the legacy magenta/violet/sky palette", () => {
    for (const [name, css] of Object.entries(NEW_CHROME)) {
      const lower = css.toLowerCase();
      for (const legacy of LEGACY_PALETTE) {
        expect(lower.includes(legacy), `${name}: legacy colour ${legacy}`).toBe(false);
      }
    }
  });

  it("references only existing tokens", () => {
    for (const [name, css] of Object.entries(NEW_CHROME)) {
      const referenced = new Set(
        [...css.matchAll(/var\((--ed-[a-z0-9-]+)/g)]
          .map((match) => match[1])
          .filter((token): token is string => token !== undefined),
      );
      for (const token of referenced) {
        expect(token in EDITOR_TOKENS, `${name}: unknown token ${token}`).toBe(true);
      }
    }
  });

  it("carries the shared base: selection, scrollbars, states, reduced motion", () => {
    expect(EDITOR_BASE_STYLES).toContain("::selection");
    expect(EDITOR_BASE_STYLES).toContain("scrollbar-width: thin;");
    expect(EDITOR_BASE_STYLES).toContain("button:active { transform: scale(0.97); }");
    expect(EDITOR_BASE_STYLES).toContain('button[aria-disabled="true"] { opacity: 0.38;');
    expect(EDITOR_BASE_STYLES).toContain("@media (prefers-reduced-motion: reduce)");
    expect(EDITOR_BASE_STYLES).toContain("transition-duration: 0.001ms !important;");
    expect(EDITOR_BASE_STYLES).toContain("color-scheme: dark;");
  });
});
