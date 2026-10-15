// Two more inputs of an imported page's theme: the tint of its greys and the
// size of its body text.
//
// A Senify theme grows from a few inputs (`scales`): `brandColorOf` finds the
// brand colour, this file finds `neutralBase` and `typeBase`. Like the brand
// colour they are PROPOSALS read off what the page shows, only applied when
// the person asked for the theme, never a claim about what the designer chose.
// `scales.radiusBase` is left out on purpose: the DNA mode zeroes every radius
// of the source, so a radius read off the page would contradict the import.
import { oklchToRgb, parseColor, rgbToHex, rgbToOklch } from "@senify/tokens";
import { literalColor, MIN_CHROMA, WEIGHTS } from "./brand-color.ts";
import type { FramerIrDocument, IrNode } from "./ir.ts";

// `buildColorScale` keeps only the hue and the chroma of its seed (the
// lightness of every shade is fixed), so the seed is a tint, and any lightness
// does. Below this chroma a grey is untinted.
const TINT_FLOOR = 0.004;
// Black and white carry no tint (every page has them, and a dark page has little
// else), so an untinted colour this dark or this light is not counted at all:
// the greys in between are what a neutral ramp stands for.
const BLACK_BELOW = 0.1;
const WHITE_ABOVE = 0.985;
// The tinted greys have to carry at least this share of all grey weight, else
// the page's neutrals count as plain grey.
const TINT_SHARE = 0.25;
const SEED_LIGHTNESS = 0.55;

// The tint of the page's neutral colours, weighted the way the brand colour
// weights its uses (a filled surface counts more than a hairline). Hue and
// chroma are averaged in the a/b plane, so a hue near 0° and one near 360° do
// not cancel. A page with no grey at all offers nothing.
export function neutralBaseOf(document: FramerIrDocument): { hex: string; uses: number } | null {
  let greyWeight = 0;
  let tintedWeight = 0;
  let a = 0;
  let b = 0;
  const visit = (node: IrNode): void => {
    const visual = node.states[0]?.visual ?? {};
    for (const [property, weight] of Object.entries(WEIGHTS)) {
      const value = visual[property];
      if (value === undefined) continue;
      const literal = literalColor(value);
      if (literal === null) continue;
      let lch: { l: number; c: number; h: number };
      try {
        lch = rgbToOklch(parseColor(literal));
      } catch {
        continue; // transparency or a format the parser does not read
      }
      if (lch.c >= MIN_CHROMA) continue; // a brand colour, not a neutral
      if (lch.c < TINT_FLOOR && (lch.l < BLACK_BELOW || lch.l > WHITE_ABOVE)) continue; // black or white
      greyWeight += weight;
      if (lch.c < TINT_FLOOR) continue;
      tintedWeight += weight;
      const radians = (lch.h * Math.PI) / 180;
      a += weight * lch.c * Math.cos(radians);
      b += weight * lch.c * Math.sin(radians);
    }
    node.children.forEach(visit);
  };
  for (const page of document.pages) visit(page.root);
  if (greyWeight === 0) return null;
  if (tintedWeight / greyWeight < TINT_SHARE) {
    return { hex: rgbToHex(oklchToRgb({ l: SEED_LIGHTNESS, c: 0, h: 0 })), uses: greyWeight };
  }
  const chroma = Math.hypot(a, b) / tintedWeight;
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { hex: rgbToHex(oklchToRgb({ l: SEED_LIGHTNESS, c: chroma, h: hue })), uses: greyWeight };
}

// A px size out of a value: `16px`, `1rem`, `1.1em`, or the first literal in
// the fallback of `var(--framer-font-size, 17px)`. Anything else (a clamp, a
// percentage) is not one size.
function pixelSize(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /(\d+(?:\.\d+)?)(px|rem|em)\b/.exec(value);
  if (match === null) return null;
  const size = Number(match[1]) * (match[2] === "px" ? 1 : 16);
  return Number.isFinite(size) && size > 0 ? size : null;
}

// What a body text size is: the headings sit above it and the captions below.
const MIN_BODY_PX = 12;
const MAX_BODY_PX = 24;

// The body text size: the size most characters of the page are set in. Headings
// are short and a page is mostly running text, so the size with the most
// characters is the body; the size comes from the text's own declaration, then
// from its text preset (Framer writes typography there), then from the plain
// `font-size`. A size outside the body window is not offered.
export function typeBaseOf(document: FramerIrDocument): { px: number; characters: number } | null {
  const presets = new Map(document.styles.textPresets.map((preset) => [preset.id, preset]));
  const tally = new Map<number, number>();
  const visit = (node: IrNode): void => {
    const text = node.states[0]?.text ?? null;
    if (text !== null && text.content.trim() !== "") {
      const size =
        pixelSize(text.inline["fontSize"]) ??
        pixelSize(text.presetId === null ? undefined : presets.get(text.presetId)?.values["fontSize"]) ??
        pixelSize(node.states[0]?.visual["font-size"]);
      if (size !== null) tally.set(size, (tally.get(size) ?? 0) + text.content.trim().length);
    }
    node.children.forEach(visit);
  };
  for (const page of document.pages) visit(page.root);
  let best: { px: number; characters: number } | null = null;
  for (const [px, characters] of tally) {
    if (best === null || characters > best.characters) best = { px, characters };
  }
  if (best === null || best.px < MIN_BODY_PX || best.px > MAX_BODY_PX) return null;
  return { px: Math.round(best.px * 100) / 100, characters: best.characters };
}
