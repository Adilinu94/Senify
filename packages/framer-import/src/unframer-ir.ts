// Framer-Projekt-XML des Unframer-MCP in das Import-IR (ADR-0028, Schritt 2).
//
// Der MCP liefert Struktur: Seiten, benannte Komponenten, Stapel, Boxen,
// Text- und Farbstile. Was er nicht liefert, ist Zeitsteuerung - im Messabzug
// vom 21.10.2026 kamen `appear`, `transition`, `animation` und `transform`
// 0-mal vor. Die Laufzeitwirkung bleibt beim Browser-Capture (ADR-0027); der
// Bericht traegt das als Fund `motion-absent`, statt es stillschweigend zu
// verlieren. Ein kaputtes XML ist ein Fehler, kein halbes Dokument.

import { createHash } from "node:crypto";
import { SenifyError } from "@senify/core";
import {
  IR_VERSION,
  type FramerIrDocument,
  type IrAsset,
  type IrBox,
  type IrColorToken,
  type IrFinding,
  type IrFontFace,
  type IrLayout,
  type IrNode,
  type IrNodeKind,
  type IrPage,
  type IrState,
  type IrTextContent,
  type IrTextPreset,
  type IrVisual,
} from "./ir.ts";

/* ------------------------------------------------------------------ types */

// One element of the source XML, read tolerantly: unknown attributes survive
// as strings, children keep their order, the text body is trimmed.
export type UnframerElement = {
  name: string;
  attrs: Record<string, string>;
  children: UnframerElement[];
  text: string;
  line: number;
};

// One page as the MCP delivers it (`getNodeXml` on the page node). The path is
// the page path from the project XML, so keys and findings stay readable.
export type UnframerPageXml = {
  path: string;
  xml: string;
};

export type UnframerProjectInput = {
  projectXml: string;
  pages: UnframerPageXml[];
  // Fixed for tests; a real run stamps the moment the MCP answered.
  capturedAt?: string;
};

/* ----------------------------------------------------------------- parser */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

function invalid(field: string, message: string): SenifyError {
  return new SenifyError("validation", message, {
    field,
    suggestion:
      "Den Abzug erneut aus dem Unframer-MCP lesen; ein halb gelesenes Dokument wird nicht importiert (ADR-0028).",
  });
}

function xmlError(quelle: string, xml: string, position: number, message: string): SenifyError {
  const line = xml.slice(0, position).split("\n").length;
  return invalid(quelle, `${message} (Zeile ${line})`);
}

// The closing `>` of a tag, ignoring one inside a quoted attribute value.
function tagEndOf(xml: string, from: number): number {
  let quote: string | null = null;
  for (let at = from; at < xml.length; at += 1) {
    const char = xml[at];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return at;
  }
  return -1;
}

function parseTagBody(
  raw: string,
  fail: (message: string) => SenifyError,
): { name: string; attrs: Record<string, string> } {
  let at = 0;
  while (at < raw.length && !/\s/.test(raw[at] ?? "")) at += 1;
  const name = raw.slice(0, at);
  if (name === "") throw fail("Tag ohne Namen");
  const attrs: Record<string, string> = {};
  while (at < raw.length) {
    while (at < raw.length && /\s/.test(raw[at] ?? "")) at += 1;
    if (at >= raw.length) break;
    const keyStart = at;
    while (at < raw.length && !/[\s=]/.test(raw[at] ?? "")) at += 1;
    const key = raw.slice(keyStart, at);
    if (key === "") throw fail("Attribut ohne Namen");
    while (at < raw.length && /\s/.test(raw[at] ?? "")) at += 1;
    if (raw[at] !== "=") {
      // A bare attribute is a flag (`disabled`); the MCP writes values, so
      // this is only a safety net.
      attrs[key] = "true";
      continue;
    }
    at += 1;
    while (at < raw.length && /\s/.test(raw[at] ?? "")) at += 1;
    const quote = raw[at];
    let value = "";
    if (quote === '"' || quote === "'") {
      at += 1;
      const end = raw.indexOf(quote, at);
      if (end === -1) throw fail(`Attribut ${key} ohne schliessendes Anfuehrungszeichen`);
      value = raw.slice(at, end);
      at = end + 1;
    } else {
      const valueStart = at;
      while (at < raw.length && !/\s/.test(raw[at] ?? "")) at += 1;
      value = raw.slice(valueStart, at);
    }
    attrs[key] = decodeEntities(value);
  }
  return { name, attrs };
}

function appendText(stack: UnframerElement[], raw: string): void {
  const top = stack[stack.length - 1];
  if (top === undefined) return;
  const decoded = decodeEntities(raw).trim();
  if (decoded === "") return;
  top.text = top.text === "" ? decoded : `${top.text} ${decoded}`;
}

// The XML the MCP answers with, as a small tree. Comments, the declaration and
// CDATA are handled; a broken document throws instead of dropping half of it.
export function parseUnframerXml(xml: string, quelle = "XML"): UnframerElement {
  const text = xml.replace(/^\uFEFF/, "");
  const roots: UnframerElement[] = [];
  const stack: UnframerElement[] = [];
  let at = 0;
  while (at < text.length) {
    const next = text.indexOf("<", at);
    if (next === -1) {
      appendText(stack, text.slice(at));
      at = text.length;
      break;
    }
    if (next > at) appendText(stack, text.slice(at, next));
    at = next;
    if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at + 4);
      if (end === -1) throw xmlError(quelle, text, at, "Kommentar nicht geschlossen");
      at = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", at)) {
      const end = text.indexOf("]]>", at + 9);
      if (end === -1) throw xmlError(quelle, text, at, "CDATA nicht geschlossen");
      appendText(stack, text.slice(at + 9, end));
      at = end + 3;
      continue;
    }
    if (text.startsWith("<?", at)) {
      const end = text.indexOf("?>", at + 2);
      if (end === -1) throw xmlError(quelle, text, at, "XML-Deklaration nicht geschlossen");
      at = end + 2;
      continue;
    }
    if (text.startsWith("<!", at)) {
      const end = text.indexOf(">", at + 2);
      if (end === -1) throw xmlError(quelle, text, at, "Deklaration nicht geschlossen");
      at = end + 1;
      continue;
    }
    if (text.startsWith("</", at)) {
      const end = text.indexOf(">", at + 2);
      if (end === -1) throw xmlError(quelle, text, at, "Schliessendes Tag nicht beendet");
      const name = text.slice(at + 2, end).trim();
      const open = stack.pop();
      if (open === undefined) {
        throw xmlError(quelle, text, at, `Schliessendes Tag </${name}> ohne oeffnendes Tag`);
      }
      if (open.name.toLowerCase() !== name.toLowerCase()) {
        throw xmlError(quelle, text, at, `Schliessendes Tag </${name}> passt nicht zu <${open.name}>`);
      }
      at = end + 1;
      continue;
    }
    const start = at;
    const end = tagEndOf(text, at + 1);
    if (end === -1) throw xmlError(quelle, text, at, "Tag nicht geschlossen");
    const raw = text.slice(at + 1, end);
    const selfClosing = raw.trimEnd().endsWith("/");
    const body = selfClosing ? raw.trimEnd().slice(0, -1) : raw;
    const { name, attrs } = parseTagBody(body, (message) => xmlError(quelle, text, start, message));
    const element: UnframerElement = {
      name,
      attrs,
      children: [],
      text: "",
      line: text.slice(0, start).split("\n").length,
    };
    const parent = stack[stack.length - 1];
    if (parent === undefined) roots.push(element);
    else parent.children.push(element);
    if (!selfClosing) stack.push(element);
    at = end + 1;
  }
  if (stack.length > 0) {
    const open = stack[stack.length - 1] as UnframerElement;
    throw xmlError(quelle, text, text.length, `Tag <${open.name}> ist nicht geschlossen`);
  }
  if (roots.length === 0) throw invalid(quelle, "Das XML enthaelt kein Element");
  if (roots.length > 1) throw invalid(quelle, `Das XML hat ${roots.length} Wurzelelemente statt einem`);
  return roots[0] as UnframerElement;
}

// Attribute names as the MCP writes them; the lookup tolerates a different
// spelling because the shape is measured, not specified.
function attrOf(element: UnframerElement, name: string): string | null {
  const direct = element.attrs[name];
  if (direct !== undefined) return direct;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(element.attrs)) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

/* --------------------------------------------------------------- project */

type UnframerTextStyle = {
  path: string;
  tag: string | null;
  values: Record<string, string>;
};

type UnframerProject = {
  name: string | null;
  id: string | null;
  pages: { nodeId: string | null; path: string }[];
  components: Map<string, string>;
  colors: Map<string, string>;
  textStyles: Map<string, UnframerTextStyle>;
  fonts: IrFontFace[];
};

// Framer prefixes the provider (`CUSTOMV2;Neue Montreal Medium`); the family
// is the part after the last semicolon.
function fontFamilyOf(value: string): string {
  const family = value.includes(";") ? value.slice(value.lastIndexOf(";") + 1) : value;
  return family.replace(/^["']|["']$/g, "").trim();
}

const FONT_WEIGHTS: readonly [RegExp, number][] = [
  [/\b(?:extra|ultra)[ -]?bold\b/i, 800],
  [/\b(?:semi|demi)[ -]?bold\b/i, 600],
  [/\b(?:extra|ultra)[ -]?light\b/i, 200],
  [/\bthin\b/i, 100],
  [/\blight\b/i, 300],
  [/\b(?:regular|book|normal)\b/i, 400],
  [/\bmedium\b/i, 500],
  [/\b(?:black|heavy)\b/i, 900],
  [/\bbold\b/i, 700],
];

// The weight a family name states (`Neue Montreal Medium`). Null when the
// name says nothing - the style then inherits what the theme sets.
function weightOfFamily(family: string): number | null {
  for (const [pattern, weight] of FONT_WEIGHTS) {
    if (pattern.test(family)) return weight;
  }
  return null;
}

const TEXT_ATTRIBUTES: readonly [string, string][] = [
  ["fontSize", "fontSize"],
  ["lineHeight", "lineHeight"],
  ["letterSpacing", "letterSpacing"],
  ["fontWeight", "fontWeight"],
  ["fontStyle", "fontStyle"],
  ["textTransform", "textTransform"],
  ["textAlign", "textAlign"],
];

// The declarations of a text style in the IR's spelling (`fontSize`, …) with
// literal values; the mapper applies them as typography.
function textValuesOf(element: UnframerElement): Record<string, string> {
  const values: Record<string, string> = {};
  const font = attrOf(element, "font");
  if (font !== null && font.trim() !== "") {
    const family = fontFamilyOf(font);
    if (family !== "") {
      values["fontFamily"] = family;
      const weight = weightOfFamily(family);
      if (weight !== null) values["fontWeight"] = String(weight);
    }
  }
  for (const [attribute, property] of TEXT_ATTRIBUTES) {
    const value = attrOf(element, attribute);
    if (value === null || value.trim() === "") continue;
    values[property] = value.trim();
  }
  return values;
}

function readProject(xml: string): UnframerProject {
  const root = parseUnframerXml(xml, "projectXml");
  if (root.name.toLowerCase() !== "project") {
    throw invalid("projectXml", `projectXml: Wurzel <${root.name}> statt <Project>`);
  }
  const pages: UnframerProject["pages"] = [];
  const components = new Map<string, string>();
  const colors = new Map<string, string>();
  const textStyles = new Map<string, UnframerTextStyle>();
  const fonts = new Map<string, IrFontFace>();
  for (const group of root.children) {
    switch (group.name.toLowerCase()) {
      case "pages":
        for (const page of group.children) {
          const path = attrOf(page, "path")?.trim() ?? "";
          if (path === "") continue;
          pages.push({ nodeId: attrOf(page, "nodeId"), path });
        }
        break;
      case "components":
        for (const component of group.children) {
          const nodeId = attrOf(component, "nodeId");
          const name = attrOf(component, "name") ?? component.name;
          if (nodeId !== null && name !== "") components.set(nodeId, name);
        }
        break;
      case "textstyles":
        for (const style of group.children) {
          const path = attrOf(style, "path")?.trim() ?? "";
          if (path === "") continue;
          const values = textValuesOf(style);
          const family = values["fontFamily"];
          if (family !== undefined) {
            const weight = values["fontWeight"] === undefined ? null : Number(values["fontWeight"]);
            const key = `${family.toLowerCase()}|${weight ?? ""}`;
            if (!fonts.has(key)) {
              fonts.set(key, { family, weight, style: null, src: [], unicodeRange: null });
            }
          }
          textStyles.set(path, { path, tag: attrOf(style, "tag"), values });
        }
        break;
      case "colorstyles":
        for (const color of group.children) {
          const path = attrOf(color, "path")?.trim() ?? "";
          const value = (attrOf(color, "value") ?? attrOf(color, "color") ?? "").trim();
          if (path !== "" && value !== "") colors.set(path, value);
        }
        break;
      default:
        break;
    }
  }
  return {
    name: attrOf(root, "name"),
    id: attrOf(root, "id"),
    pages,
    components,
    colors,
    textStyles,
    fonts: [...fonts.values()],
  };
}

/* --------------------------------------------------------------- mapping */

type MapContext = {
  project: UnframerProject;
  // `path#` - keys stay unique across pages and readable in the report.
  scope: string;
  findings: IrFinding[];
  assets: Map<string, IrAsset>;
  keys: Set<string>;
  counter: { next: number };
};

const COLOR_PROPERTIES: readonly [string, string][] = [
  ["backgroundColor", "background-color"],
  ["color", "color"],
  ["borderColor", "border-color"],
];

const PLAIN_PROPERTIES: readonly [string, string][] = [
  ["borderRadius", "border-radius"],
  ["opacity", "opacity"],
  ["overflow", "overflow"],
  ["border", "border"],
  ["boxShadow", "box-shadow"],
  ["filter", "filter"],
];

const TEXT_OVERRIDES: readonly [string, string][] = [
  ["fontSize", "fontSize"],
  ["lineHeight", "lineHeight"],
  ["letterSpacing", "letterSpacing"],
  ["fontWeight", "fontWeight"],
  ["fontStyle", "fontStyle"],
  ["textTransform", "textTransform"],
  ["textAlign", "textAlign"],
];

// A colour style is referenced by its path (`/BG/White`). The project XML
// carries the definition; an unknown path stays visible as a finding instead
// of silently painting nothing.
function colorOf(raw: string, context: MapContext, nodeKey: string): string {
  const value = raw.trim();
  if (!value.startsWith("/")) return value;
  const resolved = context.project.colors.get(value);
  if (resolved !== undefined) return resolved;
  context.findings.push({
    kind: "unsupported-declaration",
    nodeKey,
    message: `Farbstil ${value} steht nicht im Projekt-XML; die Farbe bleibt unaufgeloest.`,
    evidence: value,
    severity: "warn",
    suggestion: "ColorStyles vollstaendig lesen oder die Farbe im Editor setzen.",
  });
  return value;
}

function imageUrlOf(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  const wrapped = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i.exec(value);
  const url = (wrapped?.[2] ?? value).trim();
  return url === "" ? null : url;
}

function numberOrNull(raw: string | null): number | null {
  if (raw === null) return null;
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(raw.trim());
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function registerAsset(
  url: string,
  element: UnframerElement,
  context: MapContext,
): void {
  if (context.assets.has(url)) return;
  context.assets.set(url, {
    url,
    kind: "image",
    hash: null,
    alt: attrOf(element, "alt"),
    width: numberOrNull(attrOf(element, "width")),
    height: numberOrNull(attrOf(element, "height")),
  });
}

function visualOf(
  element: UnframerElement,
  kind: IrNodeKind,
  nodeKey: string,
  context: MapContext,
): IrVisual {
  const visual: IrVisual = {};
  for (const [attribute, property] of COLOR_PROPERTIES) {
    const raw = attrOf(element, attribute);
    if (raw === null || raw.trim() === "") continue;
    visual[property] = colorOf(raw, context, nodeKey);
  }
  for (const [attribute, property] of PLAIN_PROPERTIES) {
    const raw = attrOf(element, attribute);
    if (raw === null || raw.trim() === "") continue;
    visual[property] = raw.trim();
  }
  const backgroundImage = attrOf(element, "backgroundImage");
  if (backgroundImage !== null) {
    const url = imageUrlOf(backgroundImage);
    if (url !== null) {
      registerAsset(url, element, context);
      // The image primitive carries the picture in `asset`; a background
      // declaration on top would draw it twice.
      if (kind !== "image") visual["background-image"] = `url(${JSON.stringify(url)})`;
    }
  }
  const objectFit = attrOf(element, "objectFit") ?? attrOf(element, "fit");
  if (objectFit !== null && objectFit.trim() !== "") visual["object-fit"] = objectFit.trim();
  return visual;
}

// CSS shorthand (`168px 30px 54px 30px`) to one value per side.
function sidesOf(raw: string | null): IrLayout["padding"] | null {
  if (raw === null) return null;
  const parts = raw.trim().split(/\s+/).filter((part) => part !== "");
  const first = parts[0];
  if (first === undefined) return null;
  const top = first;
  const right = parts[1] ?? top;
  const bottom = parts[2] ?? top;
  const left = parts[3] ?? right;
  return { top, right, bottom, left };
}

function alignmentOf(raw: string | null): string | null {
  switch ((raw ?? "").toLowerCase()) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "stretch":
      return "stretch";
    case "baseline":
      return "baseline";
    default:
      return null;
  }
}

function distributionOf(raw: string | null): string | null {
  switch ((raw ?? "").toLowerCase()) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "space-between":
      return "space-between";
    case "space-around":
      return "space-around";
    case "space-evenly":
      return "space-evenly";
    default:
      return null;
  }
}

function gridColumnsOf(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const value = raw.trim();
  if (value === "") return undefined;
  return /^\d+$/.test(value) ? `repeat(${value}, minmax(0, 1fr))` : value;
}

// The stack of Framer as the IR's flow layout. `mode: "stack"` would reach the
// rule compiler as `display: stack` (it writes `mode` as display), so the
// direction and gap carry the stack - the same shape the browser capture uses.
function layoutOf(element: UnframerElement): IrLayout | null {
  const mode = (attrOf(element, "layout") ?? "").toLowerCase();
  const gridColumns = attrOf(element, "gridColumns");
  const isGrid = mode === "grid" || (mode === "" && gridColumns !== null);
  const isStack =
    mode === "stack" ||
    mode === "flex" ||
    mode === "horizontal" ||
    mode === "vertical" ||
    attrOf(element, "stackDirection") !== null;
  const padding = sidesOf(attrOf(element, "padding"));
  const gapRaw = attrOf(element, "gap");
  const gap = gapRaw === null || gapRaw.trim() === "" ? undefined : gapRaw.trim();
  if (!isGrid && !isStack) {
    if (gap === undefined && padding === null) return null;
    return {
      mode: "flow",
      ...(gap !== undefined ? { gap } : {}),
      ...(padding !== null ? { padding } : {}),
    };
  }
  if (isGrid) {
    const columns = gridColumnsOf(gridColumns);
    return {
      mode: "grid",
      ...(columns !== undefined ? { columns } : {}),
      ...(gap !== undefined ? { gap } : {}),
      ...(padding !== null ? { padding } : {}),
    };
  }
  const directionRaw = (attrOf(element, "stackDirection") ?? "").toLowerCase();
  const direction =
    directionRaw === "horizontal" || directionRaw === "vertical"
      ? directionRaw
      : mode === "horizontal" || mode === "vertical"
        ? mode
        : "vertical";
  const align = alignmentOf(attrOf(element, "stackAlignment"));
  const justify = distributionOf(attrOf(element, "stackDistribution"));
  const wrap = (attrOf(element, "stackWrap") ?? "").toLowerCase() === "true";
  return {
    mode: "flow",
    direction,
    ...(align !== null ? { align } : {}),
    ...(justify !== null ? { justify } : {}),
    ...(wrap ? { wrap } : {}),
    ...(gap !== undefined ? { gap } : {}),
    ...(padding !== null ? { padding } : {}),
  };
}

type ScalarBoxKey =
  | "width"
  | "height"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
  | "aspectRatio"
  | "position"
  | "zIndex";

const BOX_PROPERTIES: readonly [string, ScalarBoxKey][] = [
  ["width", "width"],
  ["height", "height"],
  ["minWidth", "minWidth"],
  ["maxWidth", "maxWidth"],
  ["minHeight", "minHeight"],
  ["maxHeight", "maxHeight"],
  ["aspectRatio", "aspectRatio"],
  ["position", "position"],
  ["zIndex", "zIndex"],
];

const INSET_SIDES = ["top", "right", "bottom", "left"] as const;

function boxOf(element: UnframerElement): IrBox | null {
  const box: IrBox = {};
  for (const [attribute, property] of BOX_PROPERTIES) {
    const raw = attrOf(element, attribute);
    if (raw === null || raw.trim() === "") continue;
    box[property] = raw.trim();
  }
  const inset: NonNullable<IrBox["inset"]> = {};
  for (const side of INSET_SIDES) {
    const raw = attrOf(element, side);
    if (raw === null || raw.trim() === "") continue;
    inset[side] = raw.trim();
  }
  if (Object.keys(inset).length > 0) box.inset = inset;
  return Object.keys(box).length > 0 ? box : null;
}

const HTML_TAGS = new Set([
  "header",
  "footer",
  "nav",
  "section",
  "main",
  "article",
  "aside",
  "div",
  "ul",
  "ol",
  "li",
  "figure",
  "figcaption",
  "span",
  "p",
  "a",
]);

function htmlTagOf(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim().toLowerCase();
  return /^[a-z][a-z0-9]*$/.test(value) ? value : null;
}

// Framer names its sections after their role (`SectionHero`, `HeroSection`).
// The mapper turns `section`/`header`/`footer`/`nav` into the semantic tag;
// every other layer keeps `div`, so nothing is invented that the name does
// not say.
function semanticTagOf(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("footer")) return "footer";
  if (lower.startsWith("header")) return "header";
  if (lower === "nav" || lower === "navbar" || lower === "navigation") return "nav";
  if (lower.startsWith("section") || lower.endsWith("section")) return "section";
  return null;
}

function tagOf(element: UnframerElement, kind: IrNodeKind, textTag: string): string {
  if (kind === "image") return "img";
  if (kind === "link") return "a";
  const own = htmlTagOf(attrOf(element, "tag"));
  if (kind === "text") return own ?? textTag;
  if (own !== null) return own;
  const name = element.name.toLowerCase();
  if (HTML_TAGS.has(name)) return name;
  return semanticTagOf(element.name) ?? "div";
}

function textOf(
  element: UnframerElement,
  kind: IrNodeKind,
  nodeKey: string,
  context: MapContext,
): IrTextContent | null {
  if (kind !== "text" && kind !== "link") return null;
  const presetId = attrOf(element, "inlineTextStyle");
  const style = presetId === null ? undefined : context.project.textStyles.get(presetId);
  if (presetId !== null && style === undefined) {
    context.findings.push({
      kind: "unsupported-declaration",
      nodeKey,
      message: `Textstil ${presetId} steht nicht im Projekt-XML; die Typografie bleibt ungesetzt.`,
      evidence: presetId,
      severity: "warn",
      suggestion: "TextStyles vollstaendig lesen oder die Typografie im Editor setzen.",
    });
  }
  const inline: Record<string, string> = { ...(style?.values ?? {}) };
  for (const [attribute, property] of TEXT_OVERRIDES) {
    const raw = attrOf(element, attribute);
    if (raw === null || raw.trim() === "") continue;
    inline[property] = raw.trim();
  }
  const color = attrOf(element, "color");
  if (color !== null && color.trim() !== "") inline["color"] = colorOf(color, context, nodeKey);
  const ownTag = htmlTagOf(attrOf(element, "tag"));
  const styleTag = htmlTagOf(style?.tag ?? null);
  const tag = ownTag ?? styleTag ?? "span";
  const content = attrOf(element, "text") ?? attrOf(element, "label") ?? element.text.trim();
  // A linked frame without own text carries nothing here; its children are the
  // content. An empty text state would only add noise to the report.
  if (content === "" && presetId === null && Object.keys(inline).length === 0) return null;
  return { content, presetId, inline, tag };
}

function uniqueKey(key: string, seen: Set<string>): string {
  if (!seen.has(key)) {
    seen.add(key);
    return key;
  }
  let suffix = 2;
  while (seen.has(`${key}~${suffix}`)) suffix += 1;
  const unique = `${key}~${suffix}`;
  seen.add(unique);
  return unique;
}

function componentTypeOf(
  componentId: string,
  element: UnframerElement,
  nodeKey: string,
  context: MapContext,
): string {
  const name = context.project.components.get(componentId);
  if (name !== undefined) return name;
  context.findings.push({
    kind: "unknown-node",
    nodeKey,
    message: `Komponente ${componentId} steht nicht im Projekt-XML; der Ebenenname bleibt.`,
    evidence: `componentId=${componentId}`,
    severity: "warn",
    suggestion: "Components vollstaendig lesen oder die Stelle im Editor pruefen.",
  });
  return attrOf(element, "name") ?? componentId;
}

function stateOf(
  element: UnframerElement,
  kind: IrNodeKind,
  nodeKey: string,
  context: MapContext,
): IrState {
  return {
    device: "desktop",
    hiddenAt: [],
    variantHash: null,
    visual: visualOf(element, kind, nodeKey, context),
    layout: layoutOf(element),
    box: boxOf(element),
    text: textOf(element, kind, nodeKey, context),
  };
}

function mapElement(element: UnframerElement, context: MapContext): IrNode {
  const index = context.counter.next;
  context.counter.next += 1;
  const nodeId = attrOf(element, "nodeId");
  const key = uniqueKey(`${context.scope}${nodeId ?? `el-${index}`}`, context.keys);
  const componentId = attrOf(element, "componentId");
  const backgroundImage = attrOf(element, "backgroundImage");
  const hasTextAttributes =
    attrOf(element, "text") !== null ||
    attrOf(element, "label") !== null ||
    attrOf(element, "inlineTextStyle") !== null;
  const href = attrOf(element, "link") ?? attrOf(element, "href");
  const isImage = backgroundImage !== null || /image$/i.test(element.name);
  const hasText =
    hasTextAttributes || (element.children.length === 0 && element.text.trim() !== "" && !isImage);
  // A link target on a frame or a component instance is a link: the mapper
  // keeps the target and the children (a card becomes a linked frame), while
  // a frame kind would drop the target silently. The component name travels
  // separately in `componentType`.
  let kind: IrNodeKind = "frame";
  if (isImage && element.children.length === 0) kind = "image";
  else if (href !== null) kind = "link";
  else if (componentId !== null) kind = "component-instance";
  else if (hasText) kind = "text";
  const state = stateOf(element, kind, key, context);
  const node: IrNode = {
    key,
    kind,
    name: attrOf(element, "name") ?? element.name,
    componentType:
      componentId === null ? null : componentTypeOf(componentId, element, key, context),
    baseClasses: [],
    tag: tagOf(element, kind, state.text?.tag ?? "div"),
    href: href ?? null,
    states: [state],
    children: element.children.map((child) => mapElement(child, context)),
    appearId: null,
    stylesPresetId: attrOf(element, "inlineTextStyle"),
    svg: null,
  };
  if (kind === "image") {
    const url = imageUrlOf(backgroundImage ?? attrOf(element, "src") ?? "");
    if (url !== null) {
      node.assetUrl = url;
      registerAsset(url, element, context);
    }
    const alt = attrOf(element, "alt");
    if (alt !== null) node.alt = alt;
  }
  const target = attrOf(element, "target");
  const newTab = (attrOf(element, "linkNewTab") ?? "").toLowerCase() === "true" || target === "_blank";
  if (newTab) node.target = "_blank";
  return node;
}

function mapPage(
  page: UnframerPageXml,
  project: UnframerProject,
  findings: IrFinding[],
  assets: Map<string, IrAsset>,
): IrPage {
  const root = parseUnframerXml(page.xml, `pageXml (${page.path})`);
  const isPageRoot = root.name.toLowerCase() === "page";
  const declaredPath = isPageRoot ? attrOf(root, "path") : null;
  if (declaredPath !== null && declaredPath !== page.path) {
    throw invalid(
      "pages",
      `Seiten-XML traegt den Pfad ${declaredPath}, uebergeben war ${page.path}`,
    );
  }
  const path = declaredPath ?? page.path;
  const context: MapContext = {
    project,
    scope: `${path}#`,
    findings,
    assets,
    keys: new Set(),
    counter: { next: 0 },
  };
  const topLevel = isPageRoot ? root.children : [root];
  const children = topLevel.map((child) => mapElement(child, context));
  const rootNode: IrNode = {
    key: `${path}#$root`,
    kind: "frame",
    name: "Page",
    componentType: null,
    baseClasses: [],
    tag: "body",
    href: null,
    states: [
      {
        device: "desktop",
        hiddenAt: [],
        variantHash: null,
        visual: {},
        layout: null,
        box: null,
        text: null,
      },
    ],
    children,
    appearId: null,
    stylesPresetId: null,
    svg: null,
  };
  return { path, title: isPageRoot ? attrOf(root, "name") : null, root: rootNode };
}

export function mapUnframerProject(input: UnframerProjectInput): FramerIrDocument {
  const project = readProject(input.projectXml);
  if (input.pages.length === 0) {
    throw invalid("pages", "Der Framer-Projekt-Import braucht mindestens eine Seite");
  }
  const findings: IrFinding[] = [];
  const assets = new Map<string, IrAsset>();
  const pages: IrPage[] = [];
  for (const page of input.pages) {
    pages.push(mapPage(page, project, findings, assets));
  }
  findings.push({
    kind: "motion-absent",
    nodeKey: null,
    message:
      "Das Projekt-XML traegt keine Zeitsteuerung; die Laufzeitwirkung bleibt beim Browser-Capture.",
    evidence:
      "appear/transition/animation/transform kamen im Messabzug vom 21.10.2026 0-mal vor",
    severity: "info",
    suggestion:
      "Fuer Animationen die Seite zusaetzlich per URL importieren (ADR-0027); die Struktur kommt aus dem Projekt.",
  });
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify({
        projectXml: input.projectXml,
        pages: input.pages.map((page) => ({ path: page.path, xml: page.xml })),
      }),
    )
    .digest("hex");
  return {
    ir: IR_VERSION,
    source: {
      kind: "plugin",
      url: null,
      projectId: project.id ?? project.name,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      contentHash,
    },
    breakpoints: [],
    pages,
    styles: {
      colors: [...project.colors].map(([id, value]): IrColorToken => ({ id, name: id, value })),
      textPresets: [...project.textStyles.values()].map(
        (style): IrTextPreset => ({
          id: style.path,
          name: style.path,
          values: style.values,
          breakpoints: [],
        }),
      ),
      fonts: project.fonts,
    },
    assets: [...assets.values()],
    motion: [],
    findings,
  };
}
