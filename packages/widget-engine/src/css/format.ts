// Value formatting for the CSS compiler (Phase 0, second slice).
//
// The catalog stores bare numbers for sliders and number controls, plain
// strings for text-like values and objects for four-fold (`dimensions`) and
// pair (`gaps`) values. CSS needs one concrete string: `8` plus the unit `px`
// becomes `8px`, a bare `1.5` stays `1.5` (line-height), a color stays a color
// and an enum value translates through a value map. Everything in here is
// pure — no DOM, no globals.

import type { PropValue, Unit } from "../types.ts";

export type PropRecord = { [key: string]: PropValue };

// A colour is a hex value, a named colour, a `rgb()/hsl()/oklch()`-style
// function, a `var(--token)` reference, `transparent`, `currentColor` or
// `color-mix(...)` — nothing else. A colour value may not carry a URL or a
// timeline function: measured 27.10.2026, `background: javascript:alert(1)` and
// `background: scroll(red, blue)` both reached the stylesheet unchanged.
const COLOR_LITERAL =
  /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(.*\))$/i;

function isColorLike(value: string): boolean {
  const text = value.trim();
  if (text === "") return false;
  if (/javascript:|expression\(|<\/|@import/i.test(text)) return false;
  // A quoted or otherwise structured value never is a colour.
  if (!COLOR_LITERAL.test(text)) return false;
  // A bare word must be a known colour keyword, not an arbitrary identifier.
  if (!text.includes("(") && !text.startsWith("#")) {
    return /^(?:transparent|currentcolor|[a-z]+)$/i.test(text) && COLOR_KEYWORDS.has(text.toLowerCase());
  }
  return true;
}

// The CSS named colours. A short, complete list is better than letting any word
// through: `javascript` and `scroll` are words too.
const COLOR_KEYWORDS: ReadonlySet<string> = new Set([
  "transparent", "currentcolor", "inherit", "initial", "unset", "revert",
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
  "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue",
  "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan",
  "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey",
  "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
  "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey",
  "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey",
  "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen",
  "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid",
  "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen",
  "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose",
  "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise",
  "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
  "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown",
  "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue",
  "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan",
  "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke",
  "yellow", "yellowgreen",
]);

// Turns a token reference into its concrete CSS value for a theme. The compiler
// stays independent of `@senify/tokens`: it only knows this function shape.
export type TokenResolver = (ref: string) => string | undefined;

export function isRecord(value: PropValue | undefined): value is PropRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The token reference of a value, e.g. `{ $token: "brand.primary" }` -> "brand.primary".
export function tokenRef(value: PropValue | undefined): string | undefined {
  if (!isRecord(value)) return undefined;
  const ref = value["$token"];
  return typeof ref === "string" && ref !== "" ? ref : undefined;
}

// The fallback when no theme resolves the reference: the same `var(--…)` name
// the registry uses (`tokenCss`), so an unknown token still keeps its colour.
export function tokenFallbackCss(ref: string): string {
  return `var(--${ref.replace(/\./g, "-")})`;
}

export function resolveTokenRef(
  ref: string,
  resolveToken: TokenResolver | undefined,
): string {
  const resolved = resolveToken?.(ref);
  return resolved !== undefined && resolved !== "" ? resolved : tokenFallbackCss(ref);
}

// `borderTopWidth` -> `border-top-width`.
const KEBAB_CACHE = new Map<string, string>();
function camelToKebabUncached(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
export function camelToKebab(value: string): string {
  let cached = KEBAB_CACHE.get(value);
  if (cached === undefined) {
    cached = camelToKebabUncached(value);
    // Open-CSS names are user input: keep the cache bounded.
    if (KEBAB_CACHE.size >= 4096) KEBAB_CACHE.clear();
    KEBAB_CACHE.set(value, cached);
  }
  return cached;
}

// A string that already carries its own unit, function call or keyword
// (`16px`, `100%`, `calc(50% - 4px)`, `var(--x)`, `auto`).
export function hasOwnUnit(value: string): boolean {
  return /[a-z%)]$/i.test(value.trim());
}

// 1.5000000000000002 -> "1.5".
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 10000) / 10000);
}

// Append the unit only when the value does not bring one. Zero stays `0`.
export function withUnit(value: string, unit: Unit | undefined): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (hasOwnUnit(trimmed)) return trimmed;
  if (Number(trimmed) === 0) return "0";
  return `${trimmed}${unit ?? "px"}`;
}

export function formatLength(
  value: PropValue | undefined,
  unit: Unit | undefined,
  resolveToken?: TokenResolver,
): string | undefined {
  const ref = tokenRef(value);
  if (ref !== undefined) return resolveTokenRef(ref, resolveToken);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    if (value === 0) return "0";
    return `${formatNumber(value)}${unit ?? "px"}`;
  }
  if (typeof value === "string") {
    const formatted = withUnit(value, unit);
    return formatted === "" ? undefined : formatted;
  }
  return undefined;
}

// Values without a unit: line-height, opacity, order, font-weight, z-index.
export function formatUnitless(value: PropValue | undefined): string | undefined {
  if (typeof value === "number") {
    const formatted = formatNumber(value);
    return formatted === "" ? undefined : formatted;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return undefined;
}

// Enums translate through a value map (e.g. `cover` -> `cover`, `16/9` ->
// `16 / 9`). A value that the map does not know is dropped.
export function formatKeyword(
  value: PropValue | undefined,
  values?: Readonly<Record<string, string>>,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (values) return values[trimmed];
  return trimmed;
}

export function formatText(value: PropValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function expandHex(value: string): string {
  const body = [...value.slice(1).toLowerCase()];
  if (body.length === 3 || body.length === 4) {
    return `#${body.map((digit) => `${digit}${digit}`).join("")}`;
  }
  return `#${body.join("")}`;
}

// `#ff0000` plus alpha 0.5 -> `rgba(255, 0, 0, 0.5)`.
function applyAlpha(color: string, alpha: number | undefined): string {
  if (alpha === undefined || alpha >= 1) return color;
  const body = color.slice(1);
  if (body.length !== 6) return color;
  const red = parseInt(body.slice(0, 2), 16);
  const green = parseInt(body.slice(2, 4), 16);
  const blue = parseInt(body.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${formatNumber(alpha < 0 ? 0 : alpha)})`;
}

// Colors arrive as a literal (`#fff`, `rgb(…)`, `currentColor`), as a token
// reference (`{ $token: "brand.primary" }` -> the theme colour or
// `var(--brand-primary)`) or as a literal plus opacity
// (`{ color: "#ff0000", alpha: 0.5 }`).
export function formatColor(
  value: PropValue | undefined,
  resolveToken?: TokenResolver,
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    // A colour is a colour. Everything else — `scroll(red, blue)`,
    // `javascript:alert(1)`, `url(...)` — used to pass through untouched: the
    // color path never ran the value grammar (measured 27.10.2026). A colour
    // value cannot name a timeline function and must not carry a URL.
    if (!isColorLike(trimmed)) return undefined;
    return HEX.test(trimmed) ? expandHex(trimmed) : trimmed;
  }
  if (!isRecord(value)) return undefined;

  const ref = tokenRef(value);
  if (ref !== undefined) {
    return resolveTokenRef(ref, resolveToken);
  }

  const color = value["color"];
  if (typeof color !== "string" || color.trim() === "") return undefined;
  const literal = color.trim();
  const normalized = HEX.test(literal) ? expandHex(literal) : literal;
  const alpha = typeof value["alpha"] === "number" ? value["alpha"] : undefined;
  return applyAlpha(normalized, alpha);
}

// CSS shorthand: four equal sides collapse to one value, right == left to two.
export function collapseSides(parts: readonly string[]): string {
  const [top = "", right = "", bottom = "", left = ""] = parts;
  if (top === right && right === bottom && bottom === left) return top;
  if (right === left) {
    if (top === bottom) return `${top} ${right}`;
    return `${top} ${right} ${bottom}`;
  }
  return `${top} ${right} ${bottom} ${left}`;
}

// Four-fold value (`dimensions`): top / right / bottom / left plus one unit.
// A whole-value token reference (`{ $token: "space.4" }`) resolves to one
// concrete length for all four sides.
export function formatSpacing(
  value: PropValue | undefined,
  resolveToken?: TokenResolver,
): string | undefined {
  const ref = tokenRef(value);
  if (ref !== undefined) return resolveTokenRef(ref, resolveToken);
  if (!isRecord(value)) return undefined;
  const unit = typeof value["unit"] === "string" ? (value["unit"] as Unit) : undefined;
  const parts: string[] = [];
  for (const side of ["top", "right", "bottom", "left"]) {
    const raw = value[side];
    if (typeof raw === "number") {
      const formatted = formatLength(raw, unit);
      if (formatted === undefined) return undefined;
      parts.push(formatted);
    } else if (typeof raw === "string") {
      const formatted = withUnit(raw, unit);
      if (formatted === "") return undefined;
      parts.push(formatted);
    } else {
      return undefined;
    }
  }
  return collapseSides(parts);
}

// Pair value (`gaps`): row / column plus one unit.
export function formatGaps(
  value: PropValue | undefined,
  resolveToken?: TokenResolver,
): string | undefined {
  const ref = tokenRef(value);
  if (ref !== undefined) return resolveTokenRef(ref, resolveToken);
  if (!isRecord(value)) return undefined;
  const unit = typeof value["unit"] === "string" ? (value["unit"] as Unit) : undefined;
  const parts: string[] = [];
  for (const key of ["row", "column"]) {
    const raw = value[key];
    if (typeof raw === "number") {
      const formatted = formatLength(raw, unit);
      if (formatted === undefined) return undefined;
      parts.push(formatted);
    } else if (typeof raw === "string") {
      const formatted = withUnit(raw, unit);
      if (formatted === "") return undefined;
      parts.push(formatted);
    } else {
      return undefined;
    }
  }
  const [row = "", column = ""] = parts;
  return row === column ? row : `${row} ${column}`;
}

export function deepEqualProp(a: PropValue | undefined, b: PropValue | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqualProp(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    return aKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqualProp(a[key], b[key]),
    );
  }
  return false;
}
