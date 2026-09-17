import { describe, expect, it } from "vitest";
import { contrastRatio } from "@senify/tokens";
import {
  EDITOR_CONTRAST_PROOF,
  EDITOR_FILL,
  EDITOR_INK,
  EDITOR_LINE,
  EDITOR_SIGNAL,
  EDITOR_SURFACE,
  EDITOR_TOKENS,
} from "../../src/ui/tokens.ts";

// Recomputes every contrast pair named in `ui-design.md` section 8 with the WCAG
// 2.2 formula (relative luminance in sRGB, ratio without rounding), including the
// rule that follows from a borderline value: on a selection surface no
// `--ed-ink-muted` is allowed.

type Rgba = { r: number; g: number; b: number; a: number };

function parse(value: string): Rgba {
  const hex = value.trim();
  if (hex.startsWith("#")) {
    const clean = hex.slice(1);
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const match = hex.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/,
  );
  if (!match) throw new Error(`Unsupported colour "${value}"`);
  return {
    r: Number.parseFloat(match[1] ?? "0"),
    g: Number.parseFloat(match[2] ?? "0"),
    b: Number.parseFloat(match[3] ?? "0"),
    a: match[4] === undefined ? 1 : Number.parseFloat(match[4]),
  };
}

function toHex({ r, g, b }: Rgba): string {
  const part = (n: number): string =>
    Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

// Source over destination, alpha-composited on 8-bit channels (the same maths
// `ui-design.md` section 8.3 used for the selection and hover surfaces).
function over(source: string, destination: string): string {
  const s = parse(source);
  const d = parse(destination);
  return toHex({
    r: s.r * s.a + d.r * (1 - s.a),
    g: s.g * s.a + d.g * (1 - s.a),
    b: s.b * s.a + d.b * (1 - s.a),
    a: 1,
  });
}

const S = EDITOR_SURFACE;

const selectOverPanel = over(EDITOR_FILL.select, S.panel);
const selectOverRaised = over(EDITOR_FILL.select, S.raised);
const hoverOverRaised = over(EDITOR_FILL.hover, S.raised);

function expectRatio(fg: string, bg: string, expected: number, min: number, note: string): void {
  const value = contrastRatio(fg, bg);
  expect(Math.abs(value - expected) <= 0.02, `${note}: computed ${value}, document says ${expected}`).toBe(
    true,
  );
  if (min > 0) {
    expect(value >= min, `${note}: ${value} is below the limit ${min}`).toBe(true);
  }
}

describe("ui-design.md 8.1 — text against surfaces", () => {
  const rows: [string, string, number, number, string][] = [
    [EDITOR_INK.strong, S.canvas, 15.33, 4.5, "weiss auf Buehne"],
    [EDITOR_INK.strong, S.panel, 13.48, 4.5, "weiss auf Panel"],
    [EDITOR_INK.strong, S.raised, 10.56, 4.5, "weiss auf gehoben"],
    [EDITOR_INK.strong, S.inset, 14.59, 4.5, "weiss im Feld"],
    [EDITOR_INK.base, S.canvas, 14.43, 4.5, "Grundtext auf Buehne"],
    [EDITOR_INK.base, S.panel, 12.69, 4.5, "Grundtext auf Panel"],
    [EDITOR_INK.base, S.raised, 9.94, 4.5, "Grundtext auf gehoben"],
    [EDITOR_INK.base, S.inset, 13.73, 4.5, "Feldtext"],
    [EDITOR_INK.muted, S.canvas, 8.63, 4.5, "Nebentext auf Buehne"],
    [EDITOR_INK.muted, S.panel, 7.59, 4.5, "Nebentext auf Panel"],
    [EDITOR_INK.muted, S.raised, 5.94, 4.5, "Nebentext auf gehoben"],
    [EDITOR_INK.muted, S.inset, 8.22, 4.5, "Nebentext im Feld"],
    [EDITOR_INK.onLime, EDITOR_SIGNAL.accent, 13.35, 4.5, "Text auf Lime"],
    [EDITOR_SIGNAL.dangerInk, S.canvas, 8.08, 4.5, "Fehlertext auf Buehne"],
    [EDITOR_SIGNAL.dangerInk, S.panel, 7.1, 4.5, "Fehlertext auf Panel"],
    [EDITOR_SIGNAL.dangerInk, S.raised, 5.56, 4.5, "Loeschen im Menue"],
    [EDITOR_SIGNAL.success, S.canvas, 8.8, 4.5, "Erfolg auf Buehne"],
    [EDITOR_SIGNAL.success, S.panel, 7.74, 4.5, "Erfolg auf Panel"],
    [EDITOR_SIGNAL.success, S.raised, 6.06, 4.5, "Erfolg auf gehoben"],
    [EDITOR_SIGNAL.warning, S.canvas, 9.18, 4.5, "Hinweis auf Buehne"],
    [EDITOR_SIGNAL.warning, S.panel, 8.08, 4.5, "Hinweis auf Panel"],
    [EDITOR_SIGNAL.warning, S.raised, 6.32, 4.5, "Hinweis auf gehoben"],
  ];
  for (const [fg, bg, expected, min, note] of rows) {
    it(`${note} (${expected}:1)`, () => expectRatio(fg, bg, expected, min, note));
  }
});

describe("ui-design.md 8.2 — non-text against surfaces", () => {
  const rows: [string, string, number, number, string][] = [
    [EDITOR_LINE.control, S.canvas, 4.44, 3, "Feldkante auf Buehne"],
    [EDITOR_LINE.control, S.panel, 3.9, 3, "Feldkante auf Panel"],
    [EDITOR_LINE.control, S.raised, 3.06, 3, "Feldkante auf gehoben"],
    [EDITOR_LINE.control, S.inset, 4.22, 3, "Feldkante im Feld"],
    [EDITOR_LINE.strong, S.canvas, 8.63, 3, "Auswahlkante auf Buehne"],
    [EDITOR_LINE.strong, S.panel, 7.59, 3, "Auswahlkante auf Panel"],
    [EDITOR_LINE.strong, S.raised, 5.94, 3, "Auswahlkante auf gehoben"],
    [EDITOR_LINE.strong, S.inset, 8.22, 3, "Auswahlkante im Feld"],
    [EDITOR_SIGNAL.accent, S.canvas, 13.35, 3, "Fokusring auf Buehne"],
    [EDITOR_SIGNAL.accent, S.panel, 11.74, 3, "Fokusring auf Panel"],
    [EDITOR_SIGNAL.accent, S.raised, 9.19, 3, "Fokusring auf gehoben"],
    [EDITOR_SIGNAL.accent, S.inset, 12.71, 3, "Fokusring im Feld"],
    [EDITOR_SIGNAL.danger, S.canvas, 5.54, 3, "Loeschstrich auf Buehne"],
    [EDITOR_SIGNAL.danger, S.panel, 4.87, 3, "Loeschstrich auf Panel"],
    [EDITOR_SIGNAL.danger, S.raised, 3.82, 3, "Loeschstrich auf gehoben"],
  ];
  for (const [fg, bg, expected, min, note] of rows) {
    it(`${note} (${expected}:1)`, () => expectRatio(fg, bg, expected, min, note));
  }
});

describe("the exception: --ed-ink-faint is non-text only", () => {
  const faintRows = EDITOR_CONTRAST_PROOF.filter((p) => p.foreground === EDITOR_INK.faint);
  it("is documented below every text limit", () => {
    expect(faintRows.length).toBeGreaterThan(0);
    for (const row of faintRows) {
      expect(row.min).toBe(0);
      const value = contrastRatio(row.foreground, row.background);
      expect(Math.abs(value - row.value) <= 0.02).toBe(true);
      // Below 4.5:1 it is provably not allowed as text (WCAG 1.4.3).
      expect(value).toBeLessThan(4.5);
    }
  });

  it("is declared nowhere as a text token", () => {
    // Text tokens reach 4.5:1 against the panel; faint does not.
    expect(contrastRatio(EDITOR_INK.faint, S.panel)).toBeLessThan(4.5);
    expect(contrastRatio(EDITOR_INK.muted, S.panel)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("ui-design.md 8.3 — surfaces and the selection rule", () => {
  const rows: [string, string, number, string][] = [
    [S.panel, S.canvas, 1.14, "Panel gegen Buehne"],
    [S.raised, S.panel, 1.28, "Gehoben gegen Panel"],
    [selectOverPanel, S.panel, 1.35, "Auswahlflaeche gegen Panel"],
    [selectOverRaised, S.raised, 1.32, "Auswahlflaeche gegen Gehoben"],
    [EDITOR_INK.strong, selectOverPanel, 9.96, "Weiss gegen Auswahlflaeche"],
    [EDITOR_INK.muted, selectOverPanel, 5.61, "Nebentext gegen Auswahlflaeche (Panel)"],
    [EDITOR_INK.muted, selectOverRaised, 4.5, "Nebentext gegen Auswahlflaeche (Gehoben, Grenzfall)"],
    [EDITOR_INK.muted, hoverOverRaised, 5.07, "Nebentext gegen Ueberfahrflaeche"],
  ];
  for (const [fg, bg, expected, note] of rows) {
    it(`${note} (${expected}:1)`, () => {
      const value = contrastRatio(fg, bg);
      expect(Math.abs(value - expected) <= 0.02, `${note}: ${value} vs ${expected}`).toBe(true);
    });
  }

  it("forbids --ed-ink-muted on a selection surface", () => {
    // The rule follows from the borderline 4.50:1 above: muted is not enough,
    // base and strong are.
    expect(contrastRatio(EDITOR_INK.muted, selectOverRaised)).toBeLessThanOrEqual(4.5);
    expect(contrastRatio(EDITOR_INK.base, selectOverRaised)).toBeGreaterThan(4.5);
    expect(contrastRatio(EDITOR_INK.strong, selectOverRaised)).toBeGreaterThan(4.5);
  });
});

describe("EDITOR_CONTRAST_PROOF matches its own numbers", () => {
  for (const row of EDITOR_CONTRAST_PROOF) {
    it(`${row.foreground} on ${row.background} (${row.note})`, () => {
      const value = contrastRatio(row.foreground, row.background);
      expect(Math.abs(value - row.value) <= 0.02, `computed ${value}, proof says ${row.value}`).toBe(true);
      if (row.min > 0) {
        expect(value >= row.min).toBe(true);
      }
    });
  }
});

// A guard against silent token drift: the colours used in this file are read
// from the tokens, so a changed token changes the computed ratio above.
describe("contrast inputs come from the tokens", () => {
  it("names the token variables, not loose hexes", () => {
    expect(EDITOR_TOKENS["--ed-ink-faint"]).toBe(EDITOR_INK.faint);
    expect(EDITOR_TOKENS["--ed-line-control"]).toBe(EDITOR_LINE.control);
    expect(EDITOR_TOKENS["--ed-signal-accent"]).toBe(EDITOR_SIGNAL.accent);
  });
});
