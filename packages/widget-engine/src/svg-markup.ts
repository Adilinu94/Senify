// The graphic of an `icon` that brings its own markup (a logo, a pictogram
// imported from a page): a small, closed SVG vocabulary that is sanitized at
// render time, whatever the author or an import stored.
//
// The same stance as `inline-html.ts`: an allow-list tokenizer, not a regex
// scrub. The output is rebuilt from scratch - only elements and attributes of
// the lists below, every value checked against the form its attribute may
// take, text between the tags dropped - so nothing in it can start a script
// or load a resource. An element outside the list is dropped together with
// everything inside it (`<use>`, `<image>`, `<foreignObject>`, `<script>`,
// `<style>`, `<a>`, `<text>`, animations).
//
// A paint, clip or mask may point at an element of the same graphic
// (`url(#id)`); any other `url(...)` is dropped. Colours may be a `var(...)`
// of a design token, which is how an import keeps a graphic on the page's theme.

export type SanitizedSvg = {
  // The presentation attributes of the root `<svg>` (`viewBox`, `fill`, ...).
  // Its size, position, style and id stay with the element that carries the
  // graphic, so they are not part of the result.
  attrs: Record<string, string>;
  // The markup inside the root, rebuilt from the allow-list.
  html: string;
};

const ELEMENTS = [
  "svg", "g", "defs", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "clipPath", "mask", "linearGradient", "radialGradient", "stop",
];

type Kind = "plain" | "transform" | "paint" | "id" | "style";

const ATTRIBUTE_KINDS: Record<Kind, readonly string[]> = {
  plain: [
    "viewBox", "preserveAspectRatio", "d", "points", "x", "y", "cx", "cy", "r", "rx", "ry",
    "x1", "y1", "x2", "y2", "fx", "fy", "width", "height", "offset", "opacity", "fill-opacity",
    "stroke-opacity", "stop-opacity", "stroke-width", "stroke-miterlimit", "stroke-dasharray",
    "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule",
    "clipPathUnits", "maskUnits", "maskContentUnits", "gradientUnits", "spreadMethod", "overflow",
  ],
  transform: ["transform", "gradientTransform"],
  paint: ["fill", "stroke", "stop-color", "clip-path", "mask"],
  id: ["id"],
  style: ["style"],
};

// Lower-case name -> the spelling the HTML parser expects (`viewBox`, `clipPath`).
const ELEMENT_BY_NAME = new Map(ELEMENTS.map((name) => [name.toLowerCase(), name]));
const ATTRIBUTE_BY_NAME = new Map<string, { name: string; kind: Kind }>();
for (const [kind, names] of Object.entries(ATTRIBUTE_KINDS) as [Kind, readonly string[]][]) {
  for (const name of names) ATTRIBUTE_BY_NAME.set(name.toLowerCase(), { name, kind });
}

// What the host element decides for the root.
const HOST_ATTRIBUTES: ReadonlySet<string> = new Set(["width", "height", "x", "y", "id", "style"]);

const RAW_TEXT: ReadonlySet<string> = new Set(["script", "style"]);

const PLAIN = /^[A-Za-z0-9\s.,%+-]*$/;
const TRANSFORM = /^[A-Za-z0-9\s.,()+-]*$/;
// No quote, no colon, no backslash: a paint is a name, a number list, a function
// of those, or a `url(#id)` - checked below.
const PAINT = /^[A-Za-z0-9\s.,#%()+_-]+$/;
const LOCAL_URL = /url\(\s*#[A-Za-z0-9_:.-]+\s*\)/gi;
const ID = /^[A-Za-z0-9_:.-]+$/;

// A measurement or an opacity may be a variable, exactly like a paint: Framer
// writes `stroke-width="var(--pgex8v, 1.5)"` and `fill-opacity="var(--1m6trwb, 0)"`.
// The old grammar had no parentheses, so those values were dropped and every
// stroke fell back to the default width — with `fill-opacity` gone, the filled
// circle of an arrow icon that is meant to be invisible became a black dot.
const VARIABLE_USE = /var\(\s*--[A-Za-z0-9_-]+\s*(?:,[^()]*)?\)/g;

function numberOrVariable(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const ohneVar = trimmed.replace(VARIABLE_USE, "0");
  if (ohneVar.includes("var(")) return undefined;
  return PLAIN.test(ohneVar) ? trimmed : undefined;
}

function paintValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!PAINT.test(trimmed)) return undefined;
  return /url\s*\(/i.test(trimmed.replace(LOCAL_URL, "")) ? undefined : trimmed;
}

// Only `mask-type` and custom properties survive: the first decides how a mask
// reads its content, the second carry a graphic's own values, the rest of a
// style attribute is the host page's business.
//
// A custom property is what makes an imported icon look like the source: Framer
// writes the glyph colour and the stroke width as variables on the wrapping
// `<svg>` (`--21h8s6: var(--token-…); --pgex8v: 3.5`) and every shape reads them
// (`fill="var(--21h8s6, rgb(0,0,0))"`). Dropping the definitions left each shape
// on its fallback — measured on `rare-works`: 794 shapes painted `rgb(0,0,0)`
// instead of the source's `#fff`, and every stroke fell back to 1.5 instead of
// 3.5. A definition paints nothing and loads nothing, so it is safe to keep; its
// value is checked by the same grammar as every other paint.
const CUSTOM_PROPERTY = /^--[A-Za-z0-9_-]+$/;

function customPropertyValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > 200) return undefined;
  // A value may be another variable, a number, a colour or a length. What it may
  // not be: something that loads a resource, breaks out of the declaration, or
  // calls a CSS function other than `var()`.
  if (/[;{}"'\\]/.test(trimmed)) return undefined;
  if (/url\s*\(|expression\s*\(|@import/i.test(trimmed)) return undefined;
  if (!/^[A-Za-z0-9\s.,%#()+-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

function styleValue(value: string): string | undefined {
  const kept: string[] = [];
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim();
    const setting = declaration.slice(colon + 1).trim();
    if (CUSTOM_PROPERTY.test(property)) {
      const safe = customPropertyValue(setting);
      if (safe !== undefined) kept.push(`${property}:${safe}`);
      continue;
    }
    if (property.toLowerCase() === "mask-type") {
      const lower = setting.toLowerCase();
      if (lower === "luminance" || lower === "alpha") kept.push(`mask-type:${lower}`);
    }
  }
  return kept.length === 0 ? undefined : kept.join(";");
}

// Which of the plain attributes may also carry a `var()`: the measurements and
// the opacities Framer writes as variables on an icon.
const VARIABLE_PLAIN: ReadonlySet<string> = new Set([
  "fill-opacity", "stroke-opacity", "stop-opacity", "opacity", "stroke-width",
  "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
]);

function attributeValue(kind: Kind, value: string, name = ""): string | undefined {
  switch (kind) {
    case "plain":
      if (VARIABLE_PLAIN.has(name)) {
        const measured = numberOrVariable(value);
        if (measured !== undefined) return measured;
      }
      return PLAIN.test(value) ? value.trim() : undefined;
    case "transform":
      return TRANSFORM.test(value) ? value.trim() : undefined;
    case "paint":
      return paintValue(value);
    case "id":
      return ID.test(value) ? value : undefined;
    case "style":
      return styleValue(value);
  }
}

function attributesOf(raw: string): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attribute.exec(raw)) !== null) {
    const known = ATTRIBUTE_BY_NAME.get((match[1] ?? "").toLowerCase());
    if (known === undefined || seen.has(known.name)) continue;
    seen.add(known.name);
    const value = attributeValue(known.kind, match[2] ?? match[3] ?? match[4] ?? "", known.name);
    if (value !== undefined) out.push([known.name, value]);
  }
  return out;
}

function openTag(name: string, attributes: readonly [string, string][]): string {
  return `<${name}${attributes.map(([key, value]) => ` ${key}="${value}"`).join("")}>`;
}

export function sanitizeSvgMarkup(input: string): SanitizedSvg | undefined {
  const text = input.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/g;
  const open: string[] = [];
  const attrs: Record<string, string> = {};
  let html = "";
  let rooted = false;
  // Inside a dropped element: how many elements are open in it.
  let skipping = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(text)) !== null) {
    const closing = match[1] === "/";
    const lower = (match[2] ?? "").toLowerCase();
    const selfClosing = match[4] === "/";

    if (!rooted) {
      // The first tag must be the root `<svg>`: anything else is not a graphic.
      if (closing || lower !== "svg") return undefined;
      rooted = true;
      for (const [key, value] of attributesOf(match[3] ?? "")) {
        // The size, position and id of the root stay with the element that
        // carries the graphic — but its custom properties do not: they are the
        // graphic's own palette, and the shapes inside read them. Framer writes
        // them exactly here (`--21h8s6: var(--token-…); --pgex8v: 3.5`).
        if (HOST_ATTRIBUTES.has(key)) {
          if (key === "style") {
            const own = styleValue(value);
            if (own !== undefined && own.includes("--")) attrs["style"] = own;
          }
          continue;
        }
        attrs[key] = value;
      }
      if (selfClosing) break;
      open.push("svg");
      continue;
    }

    if (skipping > 0) {
      if (closing) skipping -= 1;
      else if (!selfClosing) skipping += 1;
      continue;
    }

    const name = ELEMENT_BY_NAME.get(lower);
    if (name === undefined) {
      if (closing || selfClosing) continue;
      if (RAW_TEXT.has(lower)) {
        // The content of a script or style is not markup: jump to its end tag.
        const end = new RegExp(`</${lower}\\s*>`, "i").exec(text.slice(tag.lastIndex));
        tag.lastIndex = end === null ? text.length : tag.lastIndex + end.index + end[0].length;
      } else {
        skipping = 1;
      }
      continue;
    }

    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) {
        const closed = open.pop();
        if (open.length > 0) html += `</${closed}>`;
      }
      // The root is closed: whatever follows it is not part of the graphic.
      if (open.length === 0) break;
      continue;
    }
    html += openTag(name, attributesOf(match[3] ?? ""));
    if (selfClosing) html += `</${name}>`;
    else open.push(name);
  }
  if (!rooted) return undefined;
  while (open.length > 1) html += `</${open.pop()}>`;
  return html === "" ? undefined : { attrs, html };
}
