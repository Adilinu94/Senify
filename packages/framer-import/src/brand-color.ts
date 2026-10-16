// The brand colour of an imported page.
//
// A Senify theme grows its whole colour ramp from ONE brand colour
// (`scales.brand`). A Framer export has no such field: its colours are
// `--token-<uuid>` variables without names. What the page itself shows is the
// evidence, so the brand colour is the chromatic colour the page uses most:
// text, backgrounds and borders are counted, greys, near-white and near-black
// are not colours of a brand, and a colour with transparency is skipped.
//
// It is a PROPOSAL (the report says so and the theme is only touched when the
// person asked for it), never a claim about what the designer called it.
import { parseColor, rgbToHex, rgbToOklch } from "@senify/tokens";
import type { FramerIrDocument, IrNode } from "./ir.ts";

// How much a use counts: a filled surface carries the brand more than a
// hairline.
export const WEIGHTS: Readonly<Record<string, number>> = {
  "background-color": 3,
  background: 3,
  fill: 2,
  color: 2,
  "border-color": 1,
  "border-top-color": 1,
  stroke: 1,
};

// A literal colour out of a value: a hex, an rgb(), or the first literal in the
// fallback of `var(--token-x, #254139)`. Several colours (a gradient) are not
// one brand colour.
export function literalColor(value: string): string | null {
  const text = value.trim();
  if (/gradient\(/i.test(text)) return null;
  const match = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/.exec(text);
  return match === null ? null : match[0];
}

// Chroma and lightness windows (OKLCH). Below the chroma floor a colour reads
// as grey (a dark teal like #254139 sits at 0.037, a blue-grey at 0.025); the
// lightness window only has to keep out black and white, since the near-white
// creams already fail the chroma floor and a bright lime accent (0.91) is a
// brand colour.
export const MIN_CHROMA = 0.03;
const MIN_LIGHTNESS = 0.25;
const MAX_LIGHTNESS = 0.96;

export function brandColorOf(document: FramerIrDocument): { hex: string; uses: number } | null {
  const tally = new Map<string, number>();
  const visit = (node: IrNode): void => {
    const visual = node.states[0]?.visual ?? {};
    for (const [property, weight] of Object.entries(WEIGHTS)) {
      const value = visual[property];
      if (value === undefined) continue;
      const literal = literalColor(value);
      if (literal === null) continue;
      let hex: string;
      let chroma: number;
      let lightness: number;
      try {
        const rgb = parseColor(literal);
        const lch = rgbToOklch(rgb);
        chroma = lch.c;
        lightness = lch.l;
        hex = rgbToHex(rgb);
      } catch {
        continue; // transparency or a format the parser does not read
      }
      if (chroma < MIN_CHROMA || lightness < MIN_LIGHTNESS || lightness > MAX_LIGHTNESS) continue;
      tally.set(hex, (tally.get(hex) ?? 0) + weight);
    }
    node.children.forEach(visit);
  };
  for (const page of document.pages) visit(page.root);
  let best: { hex: string; uses: number } | null = null;
  for (const [hex, uses] of tally) {
    if (best === null || uses > best.uses) best = { hex, uses };
  }
  return best;
}
