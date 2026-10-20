// F3 capture (plan.md S1.2): SSR-HTML → IR without a browser. Framer's export
// is machine-generated and well-formed, so a scanner over tags suffices — no
// HTML-parser dependency, same stance as `messlauf.mjs` (S0).
//
// What it reads (the evidence of S0):
// - the element tree under `<div id="main" data-framer-hydrate-v2>` with
//   `data-framer-name`, `data-framer-component-type`, class tokens
// - the three static data channels: `__framer__appearAnimationsContent` (B1),
//   `__framer__breakpoints` (B2), `__framer__handoverData` (B9)
// - `<style>` blocks: tokens (`--token-*`), breakpoint hiding rules
//   (`.hidden-<hash>`), the minified SSR stylesheet and font faces
// - the linked stylesheet file (`styles/canvas-sandbox-*.css`) when present
//
// The capture never invents values: what it cannot read becomes a finding.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { SenifyError } from "@senify/core";
import { dirname, join, resolve } from "node:path";
import {
  IR_VERSION,
  type FramerIrDocument,
  type IrAsset,
  type IrBox,
  type IrBreakpoint,
  type IrDevice,
  type IrFinding,
  type IrFontFace,
  type IrInteraction,
  type IrLayout,
  type IrMotionSample,
  type IrNode,
  type IrNodeKind,
  type IrState,
  type IrTextContent,
  type IrVisual,
} from "./ir.ts";
import { expandBox, parseDeclaration, splitCommas, splitDeclarations } from "./css-util.ts";
import { devicesContaining } from "./devices.ts";
import { rewriteLinks } from "./link-paths.ts";

/* ------------------------------------------------------------------ types */

export type CaptureHtmlInput = {
  html: string;
  // The export folder, so a linked stylesheet file can be read. Absent = the
  // capture reads only the inline `<style>` blocks.
  rootDir?: string;
  url?: string | null;
  pagePath?: string;
  // The page inside the SOURCE (its own path in the export or on the site):
  // the base its relative links resolve against. `pagePath` is where the page
  // lands in Senify. Absent: the path of `url`, else `/`.
  sourcePath?: string;
  title?: string | null;
  // Stylesheet text fetched from the live site's `<link rel="stylesheet">`
  // tags. A URL import has no export folder, so without it every class-based
  // style (most of a Framer page) would be missing.
  css?: string;
};

/* ---------------------------------------------------------------- scanner */

type RawAttr = Record<string, string>;

type RawNode = {
  tag: string;
  attrs: RawAttr;
  classes: string[];
  children: RawNode[];
  text: string | null;
  svg: string | null;
  // The inner markup of an element that mixes text and inline elements (the
  // RichText shape `Hallo <strong>x</strong> Welt`): the scan keeps elements
  // only, so without this the plain text nodes between them are lost.
  innerHtml: string | null;
  // The text of a leaf as written, with its spaces. `text` is collapsed; the cascade
  // takes this one back where the element is set in `white-space: pre`.
  spacedText?: string;
};

// Elements whose content is never visible page content.
const NON_VISUAL_TAGS: ReadonlySet<string> = new Set(["style", "script", "noscript", "template"]);

const INLINE_TAGS: ReadonlySet<string> = new Set([
  "a", "span", "strong", "em", "b", "i", "u", "s", "br", "code", "small", "sub", "sup", "mark", "del", "ins",
]);

function isInlineTree(node: RawNode): boolean {
  return INLINE_TAGS.has(node.tag) && node.svg === null && node.children.every(isInlineTree);
}

const MAX_INNER_HTML = 20_000;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Framer's SSR markup contains React fragment markers (`<!--$-->`); they are
// skipped like every other comment.
function scanNodes(html: string, start: number, end: number): RawNode[] {
  const nodes: RawNode[] = [];
  let i = start;
  while (i < end) {
    const lt = html.indexOf("<", i);
    if (lt === -1 || lt >= end) break;
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt);
      i = close === -1 ? end : close + 3;
      continue;
    }
    if (html.startsWith("</", lt)) {
      const close = html.indexOf(">", lt);
      i = close === -1 ? end : close + 1;
      continue;
    }
    if (html.startsWith("<!", lt)) {
      const close = html.indexOf(">", lt);
      i = close === -1 ? end : close + 1;
      continue;
    }
    const parsed = scanTag(html, lt, end);
    if (parsed === undefined) {
      i = lt + 1;
      continue;
    }
    nodes.push(parsed.node);
    i = parsed.next;
  }
  return nodes;
}

function parseAttrs(raw: string): RawAttr {
  const attrs: RawAttr = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

// The end of a tag is the `>` OUTSIDE an attribute value. A value may hold a
// `>` — Framer writes its graphics as `src="data:image/svg+xml,<svg …>"` — and
// a naive search would cut the tag there: the value would lose its closing
// quote, the attribute would read as empty, and the image would arrive
// without a source.
//
// The scan runs over the tag only, with the regex engine and not a character
// loop: a tag of an export can be long, and the loop would walk it byte by
// byte in JavaScript.
const TAG_SPECIAL = /["'>]/g;

function findTagEnd(html: string, start: number, limit: number): number {
  TAG_SPECIAL.lastIndex = start;
  let quote: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = TAG_SPECIAL.exec(html)) !== null) {
    const at = match.index;
    if (at >= limit) return -1;
    const char = match[0];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    return at;
  }
  return -1;
}

function scanTag(
  html: string,
  start: number,
  limit: number,
): { node: RawNode; next: number } | undefined {
  const lt = html.indexOf("<", start);
  const gt = findTagEnd(html, lt + 1, limit);
  if (gt === -1 || gt >= limit) return undefined;
  const openTag = html.slice(lt + 1, gt);
  const selfClosing = openTag.endsWith("/");
  const tag = (openTag.split(/\s/)[0] ?? "").toLowerCase();
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tag)) return undefined;
  const attrs = parseAttrs(openTag.slice(tag.length));
  const classes = (attrs["class"] ?? "").split(/\s+/).filter((entry) => entry !== "");

  if (selfClosing || VOID_TAGS.has(tag)) {
    const text = tag === "input" ? inputText(attrs) : null;
    return { node: { tag, attrs, classes, children: [], text, svg: null, innerHtml: null }, next: gt + 1 };
  }

  // `script`/`style` content is raw text, not markup.
  if (tag === "script" || tag === "style") {
    const close = html.toLowerCase().indexOf(`</${tag}>`, gt + 1);
    const content = close === -1 ? html.slice(gt + 1, limit) : html.slice(gt + 1, close);
    return {
      node: { tag, attrs, classes, children: [], text: content, svg: null, innerHtml: null },
      next: close === -1 ? limit : close + tag.length + 3,
    };
  }

  // SVG stays verbatim: Senify renders icons/embeds from the markup it gets.
  if (tag === "svg") {
    const close = html.toLowerCase().indexOf("</svg>", gt + 1);
    const content = close === -1 ? html.slice(lt, limit) : html.slice(lt, close + 6);
    return {
      node: { tag, attrs, classes, children: [], text: null, svg: content, innerHtml: null },
      next: close === -1 ? limit : close + 6,
    };
  }

  const close = findClosing(html, gt + 1, tag, limit);
  const innerEnd = close === -1 ? limit : close;
  const children = scanNodes(html, gt + 1, innerEnd);
  const inner = html.slice(gt + 1, innerEnd);
  const next = close === -1 ? limit : html.indexOf(">", innerEnd) + 1;
  // A select shows one option, not the list: the options would stack as text.
  if (tag === "select") {
    return { node: { tag, attrs, classes, children: [], text: selectedOptionLabel(children), svg: null, innerHtml: null }, next };
  }
  // A `<span> </span>` between words holds the space the words wrap at; the
  // trimmed text would be empty and the words would run together.
  const spaceOnly = tag === "span" && /^\s+$/.test(decodeEntities(inner.replace(/<[^>]*>/g, "")));
  const ownText = children.length === 0 ? (spaceOnly ? " " : extractText(inner)) : null;
  const text = tag === "textarea" && ownText === "" ? (attrs["placeholder"] ?? "") : ownText;
  const spaced = children.length === 0 && !spaceOnly ? decodeEntities(inner.replace(/<[^>]*>/g, "")) : null;
  // Only elements with their own text between the children carry content the
  // child scan cannot see.
  //
  // The comparison must not invent a separator: the children's texts are
  // joined WITHOUT one, because the child scan does not see the whitespace
  // between two inline elements either. Framer writes its headings as
  // `<span>Everything</span> <span>I</span>` — the space is a bare text node
  // between the spans. Joined with a space, both sides read the same and the
  // raw inner markup was thrown away; the mapper then rebuilt it from the
  // children and the words ran together ("EverythingIknow.").
  const innerHtml =
    children.length > 0 &&
    innerEnd - (gt + 1) <= MAX_INNER_HTML &&
    children.every(isInlineTree) &&
    extractText(html.slice(gt + 1, innerEnd)) !== extractText(children.map((child) => child.text ?? "").join(""))
      ? // React's fragment markers (`<!--$-->`) are no content: the sanitizer would
        // escape them into visible text.
        html.slice(gt + 1, innerEnd).replace(/<!--[\s\S]*?-->/g, "")
      : null;
  const withSpaces = spaced !== null && spaced !== text && spaced.trim() !== "" ? { spacedText: spaced } : {};
  return { node: { tag, attrs, classes, children, text, svg: null, innerHtml, ...withSpaces }, next };
}

// What a form field draws inside itself. A field has no children, so without
// this it became an empty frame and lost the line the browser gives it: the
// content below a form moved up by the height of every field.
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set(["text", "tel", "email", "url", "search", "number"]);
// The hint Chromium draws in an empty date or time field (en-US).
const FORMAT_HINTS: Readonly<Record<string, string>> = { date: "mm/dd/yyyy", time: "--:-- --" };

function inputText(attrs: RawAttr): string | null {
  // Spam-trap fields are hidden on purpose.
  if (attrs["aria-hidden"] === "true") return null;
  const type = (attrs["type"] ?? "text").toLowerCase();
  const value = attrs["value"] ?? "";
  if (value !== "" && (TEXT_INPUT_TYPES.has(type) || FORMAT_HINTS[type] !== undefined)) return value;
  // The `placeholder` of a date field is not what Chromium shows there.
  if (FORMAT_HINTS[type] !== undefined) return FORMAT_HINTS[type] ?? null;
  return TEXT_INPUT_TYPES.has(type) ? (attrs["placeholder"] ?? "") : null;
}

function selectedOptionLabel(nodes: RawNode[]): string {
  const options = (list: RawNode[]): RawNode[] =>
    list.flatMap((node) => (node.tag === "option" ? [node] : options(node.children)));
  const all = options(nodes);
  return (all.find((option) => option.attrs["selected"] !== undefined) ?? all[0])?.text ?? "";
}

function findClosing(html: string, from: number, tag: string, limit: number): number {
  const needle = `</${tag}`;
  let depth = 1;
  let i = from;
  while (i < limit) {
    const open = html.indexOf("<", i);
    if (open === -1) return -1;
    if (html.startsWith(needle, open) && html.charAt(open + needle.length).match(/[\s>]/)) {
      depth -= 1;
      if (depth === 0) return open;
      const gt = findTagEnd(html, open + 1, limit);
      i = gt === -1 ? limit : gt + 1;
      continue;
    }
    if (html.startsWith(`<${tag}`, open) && html.charAt(open + tag.length + 1).match(/[\s>]/)) {
      depth += 1;
    }
    const gt = findTagEnd(html, open + 1, limit);
    i = gt === -1 ? limit : gt + 1;
  }
  return -1;
}

function extractText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

// The style values that carry a graphic as a data URL. The report names the
// place, not the picture: the address is cut short.
function dataUrlValuesOf(root: IrNode): string[] {
  const found: string[] = [];
  const visit = (node: IrNode): void => {
    for (const state of node.states) {
      for (const [property, value] of Object.entries(state.visual)) {
        if (typeof value !== "string") continue;
        const at = value.search(/url\(\s*['"]?data:/i);
        if (at === -1) continue;
        const start = value.indexOf("data:", at);
        found.push(`${property}=…${value.slice(start, start + 40)}…`);
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return found;
}

/* -------------------------------------------------------------- css reads */

/* ------------------------------------------------- framer value decoding */

// The `--framer-*` custom properties carry the text style. Only the ones the
// Senify style table knows get carried; the rest stay evidence.
const FRAMER_TEXT_PROPS: Readonly<Record<string, string>> = {
  "--framer-font-family": "fontFamily",
  "--framer-font-size": "fontSize",
  "--framer-font-weight": "fontWeight",
  "--framer-letter-spacing": "letterSpacing",
  "--framer-line-height": "lineHeight",
  "--framer-text-alignment": "textAlign",
  "--framer-text-color": "color",
  "--framer-text-decoration": "textDecoration",
  "--framer-text-transform": "textTransform",
  "--framer-font-style": "fontStyle",
  // The look around the text: the colour that fills it, the stroke around
  // it, the background behind a marked word and the radius of that
  // background. Without them a highlighted word loses its marker.
  "--framer-text-fill-color": "WebkitTextFillColor",
  "--framer-text-stroke-color": "WebkitTextStrokeColor",
  "--framer-text-stroke-width": "WebkitTextStrokeWidth",
  "--framer-text-background-color": "backgroundColor",
  "--framer-text-background-radius": "borderRadius",
  "--framer-text-background-padding": "padding",
};

function framerInlineToStyles(style: RawAttr["style"] | undefined): IrVisual {
  const out: IrVisual = {};
  if (style === undefined) return out;
  for (const declaration of splitDeclarations(style)) {
    const pair = parseDeclaration(declaration);
    if (pair === null) continue;
    const mapped = FRAMER_TEXT_PROPS[pair[0]];
    if (mapped !== undefined) out[mapped] = pair[1];
  }
  return out;
}

// The element `style` attribute: Framer inlines layout/visual values directly.
// CSS custom properties (`--token-*`, `--extracted-*`, `--framer-*`) and
// `corner-shape` are not Senify style properties; they are dropped here and
// the token mapping resolves colors through the theme patch instead.
function elementStyleToParts(
  style: string | undefined,
): { visual: IrVisual; layout: Partial<IrLayout>; box: Partial<IrBox> } {
  const visual: IrVisual = {};
  const layout: Partial<IrLayout> = {};
  const box: Partial<IrBox> = {};
  if (style === undefined) return { visual, layout, box };
  for (const declaration of splitDeclarations(style)) {
    const pair = parseDeclaration(declaration);
    if (pair === null) continue;
    const [property, value] = pair;
    if (property.startsWith("--")) {
      // Custom properties feed the cascade (`applyClassRules` resolves the
      // `var()` calls and removes them); they are never a style of their own.
      visual[property] = value;
      continue;
    }
    switch (property) {
      case "width":
        box.width = value;
        break;
      case "height":
        box.height = value;
        break;
      case "min-width":
        box.minWidth = value;
        break;
      case "max-width":
        box.maxWidth = value;
        break;
      case "min-height":
        box.minHeight = value;
        break;
      case "max-height":
        box.maxHeight = value;
        break;
      case "aspect-ratio":
        box.aspectRatio = value;
        break;
      case "position":
        box.position = value;
        break;
      case "top":
      case "right":
      case "bottom":
      case "left":
        box.inset = { ...box.inset, [property]: value };
        break;
      case "inset": {
        // `inset: 0` pins an overlay to all four edges. Expanded like a box
        // shorthand (1–4 values: top, right, bottom, left).
        const sides = expandBox(value);
        box.inset = { ...box.inset, top: sides.top, right: sides.right, bottom: sides.bottom, left: sides.left };
        break;
      }
      case "z-index":
        box.zIndex = value;
        break;
      case "gap":
        layout.gap = value;
        break;
      case "padding":
      case "padding-top":
      case "padding-right":
      case "padding-bottom":
      case "padding-left": {
        const sides = layout.padding ?? {};
        if (property === "padding") {
          Object.assign(sides, expandBox(value));
        } else {
          const side = property.replace("padding-", "") as keyof typeof sides;
          sides[side] = value;
        }
        layout.padding = sides;
        break;
      }
      default:
        visual[property] = value;
    }
  }
  return { visual, layout, box };
}

/* ------------------------------------------------------------ device maps */

// The breakpoint hash → Senify device mapping (decision 23.09.: 1024 tablet).
// A hash whose media query covers ≥1024 desktop widths maps to desktop, one
// covering 810–1199 to tablet, below to mobile.
/* ---------------------------------------------------------------- capture */

const COMPONENT_TYPE_KINDS: Readonly<Record<string, IrNodeKind>> = {
  RichTextContainer: "rich-text",
  SVG: "svg",
  Code: "placeholder",
  Shader: "placeholder",
};

function kindFor(raw: RawNode): IrNodeKind {
  const tag = raw.tag;
  const attrs = raw.attrs;
  const classes = raw.classes;
  const componentType = attrs["data-framer-component-type"];
  if (componentType !== undefined) {
    const mapped = COMPONENT_TYPE_KINDS[componentType];
    if (mapped !== undefined) return mapped;
    if (/code|shader/i.test(componentType)) return "placeholder";
  }
  if (tag === "svg") return "svg";
  if (tag === "img") return "image";
  if (tag === "video") return "video";
  if (tag === "a") return "link";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    return "text";
  }
  if (tag === "p" || tag === "span" || tag === "strong" || tag === "em") return "text";
  if (rawHasDirectText(raw)) return "text";
  if (classes.some((entry) => entry.endsWith("-container"))) return "component-instance";
  return "frame";
}

function rawHasDirectText(node: RawNode): boolean {
  return node.text !== null && node.text !== "" && node.children.length === 0;
}

// The attributes a stylesheet's selectors ask about (`[data-framer-component-type=Text]`):
// the capture keeps those on the node so the class rules can be matched for real.
function attributeNamesIn(css: string): Set<string> {
  const names = new Set<string>();
  for (const match of css.matchAll(/\[\s*([A-Za-z_][\w:.-]*)\s*(?:[~|^$*]?=|\])/g)) names.add(match[1] ?? "");
  return names;
}

// What Framer's appear script animates from: not the element's look.
const START_STATE_PROPERTIES = ["opacity", "transform", "will-change"] as const;

type Counter = { ordinal: number; attrNames?: ReadonlySet<string> };

// A text in `white-space: pre`, `pre-wrap` or `break-spaces` is drawn with every space the
// author typed: "Hey, ich bin " is 22 px wider than "Hey, ich bin" on fluffy-rectangle, and
// "Meine  Referenzen" has two spaces between the words. The scan collapses spaces, so it
// keeps the text as written next to it; the cascade, which knows the white-space of the
// element (its own rule or the one it inherits), decides which of the two counts.
const SPACED_TEXT = new WeakMap<IrNode, string>();
const KEEPS_SPACES = /^(?:pre|pre-wrap|break-spaces)$/;

function toIrNode(raw: RawNode, counter: Counter, inheritedHidden: string[] = []): IrNode {
  counter.ordinal += 1;
  const attrs = raw.attrs;
  // The `ssr-variant` wrapper (measured in S0) is Framer's per-breakpoint
  // duplicate shell: it carries only the `hidden-<hash>` classes and exactly
  // one child. The capture dissolves it — the hidden hashes ride on the child
  // and the mapper's device merge folds the duplicates into one node.
  if (raw.classes.includes("ssr-variant") && raw.children.length === 1) {
    const hiddenAt = raw.classes
      .filter((entry) => entry.startsWith("hidden-"))
      .map((entry) => entry.slice("hidden-".length));
    return toIrNode(raw.children[0] ?? raw, counter, hiddenAt);
  }
  const classes = raw.classes.filter((entry) => !entry.startsWith("framer-v-"));
  const variantHashes = raw.classes
    .filter((entry) => entry.startsWith("framer-v-"))
    .map((entry) => entry.slice("framer-v-".length));
  const kind = kindFor(raw);
  const named = Object.entries(attrs).filter(([name]) => counter.attrNames?.has(name) === true);
  const selectorAttrs = named.length > 0 ? Object.fromEntries(named) : undefined;

  const states: IrState[] = [];
  const { visual, layout, box } = elementStyleToParts(attrs["style"]);
  // The SSR start state of an appear animation (`opacity:0.001;transform:…`)
  // is not the element's look: Framer's script animates it away on load. Kept
  // as a permanent style it hides the element for good, so it moves out of the
  // visual and into `appearInitial`, where the motion mapping reads it.
  const appearInitial: Record<string, string> = {};
  // Framer writes the same kind of start state for appear effects
  // (`data-framer-appear-id`) and for scroll reveals (`opacity:0` together with
  // a `translate` that moves the element in). Those are never the intended look
  // in a static import. A plain `opacity:0` is: the closed menu of a phone
  // header, a collapsed FAQ answer, a hover overlay stay hidden as designed.
  const startOpacity = Number.parseFloat(visual["opacity"] ?? "");
  const movesIn = visual["transform"] !== undefined && visual["transform"].trim() !== "none";
  const hasStartState =
    attrs["data-framer-appear-id"] !== undefined || (Number.isFinite(startOpacity) && startOpacity <= 0.01 && movesIn);
  if (hasStartState) {
    for (const property of START_STATE_PROPERTIES) {
      const value = visual[property];
      if (value === undefined) continue;
      appearInitial[property] = value;
      delete visual[property];
    }
  }
  // A Ticker (marquee) is written with `opacity:0` and shown by Framer's script once it
  // has measured itself: the opacity is the state before the script, not the look.
  if (raw.tag === "section" && visual["opacity"] === "0" && visual["list-style-type"] === "none" && visual["place-items"] === "center") {
    delete visual["opacity"];
  }
  const textInline: Record<string, string> = {};
  for (const [property, value] of Object.entries(framerInlineToStyles(attrs["style"]))) {
    if (value !== undefined) textInline[property] = value;
  }
  const text: IrTextContent | null =
    raw.text !== null && raw.text !== ""
      ? {
          content: raw.text,
          presetId: attrs["data-styles-preset"] ?? null,
          inline: textInline,
          tag: raw.tag,
        }
      : Object.keys(textInline).length > 0
        ? { content: "", presetId: attrs["data-styles-preset"] ?? null, inline: textInline, tag: raw.tag }
        : null;

  const layoutFull: IrLayout | undefined =
    Object.keys(layout).length > 0 ? { mode: "flow", ...layout } : undefined;

  states.push({
    device: "desktop",
    hiddenAt: inheritedHidden,
    variantHash: variantHashes[0] ?? null,
    visual,
    layout: layoutFull ?? null,
    box: Object.keys(box).length > 0 ? box : null,
    text,
  });

  const node: IrNode = {
    key: `n${counter.ordinal}`,
    kind,
    name: attrs["data-framer-name"] ?? null,
    componentType: attrs["data-framer-component-type"] ?? null,
    ...(attrs["data-framer-module"] !== undefined
      ? {
          codeModule: {
            path: attrs["data-framer-module"],
            kind: attrs["data-framer-module-kind"] === "webgl-scene" ? "webgl-scene" as const : "module" as const,
            license: {
              id: attrs["data-framer-module-license"] ?? "unknown",
              note: attrs["data-framer-module-license-note"] ?? null,
            },
            posterUrl: attrs["data-framer-module-poster"] ?? null,
            adapter: attrs["data-framer-module-adapter"] === "wave-background" ? "wave-background" as const : "mount-export" as const,
          },
        }
      : {}),
    baseClasses: classes,
    ...(variantHashes.length > 0 ? { variantClasses: variantHashes.map((hash) => `framer-v-${hash}`) } : {}),
    ...(selectorAttrs === undefined ? {} : { attrs: selectorAttrs }),
    tag: raw.tag,
    href: attrs["href"] ?? null,
    ...(raw.attrs["src"] !== undefined ? { assetUrl: raw.attrs["src"] } : {}),
    ...(attrs["data-framer-module-poster"] !== undefined
      ? { assetUrl: attrs["data-framer-module-poster"] }
      : {}),
    states,
    children: raw.children
      .filter((child) => !NON_VISUAL_TAGS.has(child.tag))
      .map((child) => toIrNode(child, counter)),
    ...(attrs["id"] !== undefined && attrs["id"] !== "" ? { htmlId: attrs["id"] } : {}),
    ...(attrs["alt"] !== undefined ? { alt: attrs["alt"] } : {}),
    ...(attrs["target"] !== undefined ? { target: attrs["target"] } : {}),
    ...(raw.innerHtml !== null ? { innerHtml: raw.innerHtml } : {}),
    ...(Object.keys(appearInitial).length > 0 ? { appearInitial } : {}),
    appearId: attrs["data-framer-appear-id"] ?? null,
    stylesPresetId: attrs["data-styles-preset"] ?? null,
    svg: raw.svg,
  };
  if (raw.spacedText !== undefined) SPACED_TEXT.set(node, raw.spacedText);
  return node;
}

function collectAssets(raw: RawNode, assets: IrAsset[]): void {
  if (raw.tag === "img") {
    const src = raw.attrs["src"];
    if (src !== undefined && src !== "") {
      const width = Number.parseInt(raw.attrs["width"] ?? "", 10);
      const height = Number.parseInt(raw.attrs["height"] ?? "", 10);
      assets.push({
        url: src,
        kind: "image",
        hash: null,
        alt: raw.attrs["alt"] !== undefined && raw.attrs["alt"] !== "" ? raw.attrs["alt"] : null,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
      });
    }
  }
  if (raw.tag === "video") {
    const src = raw.attrs["src"];
    if (src !== undefined && src !== "") {
      assets.push({ url: src, kind: "video", hash: null, alt: null, width: null, height: null });
    }
  }
  const poster = raw.attrs["data-framer-module-poster"];
  if (poster !== undefined && poster !== "" && !assets.some((asset) => asset.url === poster)) {
    assets.push({ url: poster, kind: "image", hash: null, alt: raw.attrs["data-framer-name"] ?? null, width: null, height: null });
  }
  for (const child of raw.children) collectAssets(child, assets);
}

function countNodes(node: IrNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

export function captureHtml(input: CaptureHtmlInput): FramerIrDocument {
  const html = input.html;
  const findings: IrFinding[] = [];
  const assets: IrAsset[] = [];
  const contentHash = createHash("sha256").update(html).digest("hex").slice(0, 32);

  // --- the three static data channels (B1/B2/B9)
  const appearJson = scriptJson(html, "__framer__appearAnimationsContent");
  const breakpointsJson = scriptJson(html, "__framer__breakpoints");
  const handoverJson = scriptJson(html, "__framer__handoverData");

  const breakpoints: IrBreakpoint[] = [];
  if (breakpointsJson !== null) {
    try {
      const parsed = JSON.parse(breakpointsJson) as { hash?: string; mediaQuery?: string }[];
      for (const entry of parsed) {
        const hash = entry.hash;
        const mediaQuery = entry.mediaQuery;
        if (hash === undefined || mediaQuery === undefined) continue;
        const min = /min-width:\s*([\d.]+)px/.exec(mediaQuery);
        const max = /max-width:\s*([\d.]+)px/.exec(mediaQuery);
        breakpoints.push({
          id: hash,
          minWidth: min !== null ? Number.parseFloat(min[1] ?? "0") : 0,
          maxWidth: max !== null ? Number.parseFloat(max[1] ?? "") : null,
          name: null,
        });
      }
    } catch {
      findings.push({
        kind: "unsupported-declaration",
        nodeKey: null,
        message: "Der Breakpoint-Kanal (__framer__breakpoints) ist kein lesbares JSON.",
        evidence: "__framer__breakpoints",
        severity: "warn",
        suggestion: "Import ohne Breakpoint-Mapping: alle Gerätewerte fallen auf Desktop zurück.",
      });
    }
  }
  // Dedupe: the hydrate attribute repeats the same hashes (measured in S0).
  const seenBreakpoints = new Set<string>();
  const uniqueBreakpoints = breakpoints.filter((entry) => {
    if (seenBreakpoints.has(entry.id)) return false;
    seenBreakpoints.add(entry.id);
    return true;
  });

  if (handoverJson !== null) {
    findings.push({
      kind: "cms",
      nodeKey: null,
      message:
        "Die Seite nutzt Framer-CMS (handoverData vorhanden) — Sammlungsinhalte werden nicht importiert.",
      evidence: "__framer__handoverData",
      severity: "info",
      suggestion: "CMS-Texte als statischen Inhalt übernehmen oder die Sammlung manuell anlegen.",
    });
  }

  const cssText = `${readAllCss(html, input.rootDir)}\n${input.css ?? ""}`;
  const attrNames = attributeNamesIn(cssText);

  // --- the element tree under #main
  const mainStart = html.indexOf('<div id="main"');
  let root: IrNode;
  if (mainStart === -1) {
    root = emptyRoot();
    findings.push({
      kind: "unknown-node",
      nodeKey: null,
      message: 'Kein <div id="main"> gefunden — die Seite ist kein Framer-Export?',
      evidence: "<div id=main>",
      severity: "block",
      suggestion: "Quelle prüfen: der Import liest Framer-SSR-HTML, kein beliebiges HTML.",
    });
  } else {
    const scanned = scanNodes(html, mainStart, html.length);
    const main = scanned[0];
    if (main === undefined) {
      root = emptyRoot();
    } else {
      const counter: Counter = { ordinal: 0, attrNames };
      const children = main.children
        // Inline <style>/<script> inside the tree is read separately and must
        // never become page text.
        .filter((child) => !NON_VISUAL_TAGS.has(child.tag))
        .map((child) => toIrNode(child, counter));
      root = {
        key: "root",
        kind: "frame",
        name: null,
        componentType: null,
        // The classes of `#main` itself (`framer-QDc12 framer-uhV7E …`): the
        // preset rules are written as `.framer-uhV7E .framer-styles-preset-x`,
        // so without them no descendant selector under the page ever matches.
        baseClasses: main.classes.filter((name) => !name.startsWith("framer-v-") && name !== "ssr-variant"),
        tag: "root",
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
      collectAssets(main, assets);
    }
  }

  // --- styles: tokens, font faces, hidden rules
  const colors: { id: string; name: string | null; value: string }[] = [];
  for (const match of html.matchAll(/--token-([a-f0-9-]{36}):\s*([^;}]+)/g)) {
    const id = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    if (id === "" || value === "") continue;
    if (colors.some((entry) => entry.id === id)) continue;
    colors.push({ id, name: null, value });
  }

  const fonts: IrFontFace[] = [];
  const fontCss = styleBlock(html, "data-framer-font-css") ?? "";
  const linkedCss = readLinkedCss(html, input.rootDir);
  const fontSource = `${fontCss}\n${linkedCss}`;
  for (const match of fontSource.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1] ?? "";
    const family = /font-family:\s*"?([^";]+)"?/.exec(body)?.[1];
    if (family === undefined) continue;
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
    const fontStyle = /font-style:\s*([^;]+)/.exec(body)?.[1];
    const srcs = [...body.matchAll(/src:\s*url\(([^)]+)\)/g)].map((entry) =>
      (entry[1] ?? "").replace(/["']/g, ""),
    );
    const unicodeRange = /unicode-range:\s*([^;}]+)/.exec(body)?.[1] ?? null;
    fonts.push({
      family: family.trim(),
      weight: weight !== undefined ? Number.parseInt(weight, 10) : null,
      style: fontStyle !== undefined ? fontStyle.trim() : null,
      src: srcs,
      unicodeRange,
    });
  }
  if (fonts.length > 0) {
    findings.push({
      kind: "font-subset",
      nodeKey: null,
      message: `${fonts.length} @font-face-Subsets gefunden (CDN-URLs) — DSGVO-Umschreibung folgt in S2.3b.`,
      evidence: "data-framer-font-css",
      severity: "info",
      suggestion: "Font-Dateien holen, deduplizieren und self-hosted einbinden (Task 2.3b).",
    });
  }

  // --- Lenis detection (B8): the SmoothScroll chunk in the markup or scripts
  if (/SmoothScroll|lenis/i.test(html)) {
    findings.push({
      kind: "smooth-scroll",
      nodeKey: null,
      message: "Smooth-Scroll (Lenis) ist aktiv — Senify führt das über das Site-Profil.",
      evidence: "SmoothScroll_Prod / lenis im Markup",
      severity: "warn",
      suggestion: "Profil-Zuordnung prüfen: Scroll-Steuerung wird nicht 1:1 übernommen.",
    });
  }

  // --- endless loops from the appear channel (befund §4: ticker marquee)
  if (appearJson !== null) {
    try {
      const parsed = JSON.parse(appearJson) as Record<string, unknown>;
      let loopCount = 0;
      for (const entry of Object.values(parsed)) {
        if (isLoopEntry(entry)) loopCount += 1;
      }
      if (loopCount > 0) {
        findings.push({
          kind: "loop-animation",
          nodeKey: null,
          message: `${loopCount} Endlos-Loops erkannt — der Mapper bildet sie auf Marquee-Presets ab, wo ein Preset passt.`,
          evidence: "__framer__appearAnimationsContent",
          severity: "info",
          suggestion: "Prüfen, ob das marquee-Preset die Loop-Form abbilden kann.",
        });
      }
    } catch {
      findings.push({
        kind: "unsupported-declaration",
        nodeKey: null,
        message: "Der Appear-Kanal ist kein lesbares JSON — Animationen fallen auf die Platte zurück.",
        evidence: "__framer__appearAnimationsContent",
        severity: "warn",
        suggestion: "Browser-Probe (S2) als Rückfallebene nutzen.",
      });
    }
  }

  // --- class rules: Framer carries most layout/visual values in classes,
  // while the existing inline path only sees the style attribute. Read the
  // simple class rules before mapping so the browser gate measures the real
  // import rather than an unstyled document.
  // Internal links become root-relative against THIS page's path, so they keep
  // working when the pages are imported under their own paths.
  rewriteLinks(
    root,
    input.sourcePath ?? (input.url === undefined || input.url === null ? "/" : pathOf(input.url)),
    input.url === undefined || input.url === null ? null : originOf(input.url),
  );
  const applied = applyClassRules(root, cssText);
  if (applied.skippedPseudo > 0) {
    findings.push({
      kind: "unsupported-declaration",
      nodeKey: null,
      message: `${applied.skippedPseudo} Regeln mit Pseudo-Zustand (Hover, Fokus, ::before …) nicht übernommen.`,
      evidence: ":hover / :focus / ::before",
      severity: "info",
      suggestion: "Zustände nach dem Import im Editor ergänzen; sie fließen nicht mehr in den Basisstil ein.",
    });
  }

  // A graphic in a style value, carried as a data URL, cannot become a style
  // value: ADR-0005 keeps `data:image/svg+xml` out of CSS values, because SVG
  // can carry a script. The value is therefore dropped by the compiler — and
  // the report says so, with the place it came from. A picture in a `src` does
  // not come here: it becomes an asset.
  const dataUrlValues = dataUrlValuesOf(root);
  if (dataUrlValues.length > 0) {
    findings.push({
      kind: "unsupported-declaration",
      nodeKey: null,
      message: `${dataUrlValues.length} Grafik(en) als Data-URL in einem Stilausdruck wurden nicht übernommen.`,
      evidence: dataUrlValues.slice(0, 3).join(", "),
      severity: "warn",
      suggestion:
        "Ein Data-URL im Stilausdruck ist aus Sicherheitsgründen nicht zugelassen (ADR-0005). Die Grafik im Editor als Bild einsetzen.",
    });
  }

  const pagePath = input.pagePath ?? "/";
  const pageCount = countNodes(root);  if (pageCount > 1) {
    // The devices arrive as SSR variant duplicates; the mapper merges them.
    findings.push({
      kind: "breakpoint-collapse",
      nodeKey: null,
      message: `${pageCount} Elemente gelesen — die Geräte-Varianten werden im Mapper zu einem Knoten je Element zusammengezogen.`,
      evidence: "ssr-variant / framer-v-*",
      severity: "info",
      suggestion: "Geräte-Merge (S1.5) prüft die Basis-Klassen-Schnitt.",
    });
  }

  return {
    ir: IR_VERSION,
    source: {
      kind: "html",
      url: input.url ?? null,
      projectId: null,
      capturedAt: new Date().toISOString(),
      contentHash,
    },
    breakpoints: uniqueBreakpoints,
    pages: [
      {
        path: pagePath,
        title: input.title ?? htmlTitle(html),
        ...pageMeta(html),
        root,
      },
    ],
    styles: {
      colors,
      textPresets: readTextPresets(html, linkedCss),
      fonts,
    },
    assets,
    motion: readAppearMotion(html, root),
    findings,
  };
}

// Framer's SSR writes every appear/scroll-reveal effect into one JSON block
// (`__framer__appearAnimationsContent`): per `data-framer-appear-id`, the start
// state, the end state and a spring (`stiffness`, `damping`, `mass`, `delay`),
// once as `default` and once per breakpoint hash (null = no effect there). The
// start state is also written inline on the element, which the capture strips
// from the visual (`appearInitial`), so the effect is read from here.
type AppearState = { opacity?: number; x?: number; y?: number; scale?: number };
type AppearTransition = { type?: string; stiffness?: number; damping?: number; mass?: number; delay?: number; duration?: number };

function readAppearMotion(html: string, root: IrNode): IrMotionSample[] {
  const block = /<script[^>]*id="__framer__appearAnimationsContent"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (block === undefined) return [];
  let entries: unknown;
  try {
    entries = JSON.parse(block);
  } catch {
    return [];
  }
  if (typeof entries !== "object" || entries === null) return [];
  const byAppearId = new Map<string, IrNode>();
  const index = (node: IrNode): void => {
    if (node.appearId !== undefined && node.appearId !== null && !byAppearId.has(node.appearId)) {
      byAppearId.set(node.appearId, node);
    }
    node.children.forEach(index);
  };
  index(root);
  const samples: IrMotionSample[] = [];
  for (const [appearId, byDevice] of Object.entries(entries as Record<string, unknown>)) {
    const node = byAppearId.get(appearId);
    const entry = (byDevice as Record<string, unknown> | null)?.["default"] as
      | { initial?: AppearState; animate?: AppearState & { transition?: AppearTransition } }
      | null
      | undefined;
    if (node === undefined || entry === null || entry === undefined) continue;
    const from = entry.initial ?? {};
    const to = entry.animate ?? {};
    const transition = to.transition ?? {};
    const params: IrMotionSample["params"] = {
      fromOpacity: from.opacity ?? 1,
      fromX: from.x ?? 0,
      fromY: from.y ?? 0,
      fromScale: from.scale ?? 1,
      toOpacity: to.opacity ?? 1,
      // Seconds, like GSAP and the MotionSpec: milliseconds here made the baked
      // runtime wait 300 SECONDS and keep the element hidden meanwhile.
      delay: Math.round((transition.delay ?? 0) * 100) / 100,
      duration: Math.round(springSettleSeconds(transition) * 1000) / 1000,
      ...(transition.type === undefined ? {} : { transition: transition.type }),
    };
    samples.push({
      nodeKey: node.key,
      library: "framer",
      trigger: "appear",
      params,
      raw: JSON.stringify({ appearId, from, to }),
    });
  }
  return samples;
}

// The time a spring needs to come to rest (2 % band): `4 / (ζ·ω0)` with
// ω0 = √(stiffness/mass) and ζ = damping / (2·√(stiffness·mass)). A plain
// `duration` transition is taken as it is. Clamped to a range a page can use.
function springSettleSeconds(transition: AppearTransition): number {
  if (transition.type !== "spring") return Math.min(Math.max(transition.duration ?? 0.4, 0.15), 1.6);
  const stiffness = transition.stiffness ?? 100;
  const damping = transition.damping ?? 10;
  const mass = transition.mass ?? 1;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  return Math.min(Math.max(4 / (zeta * omega), 0.15), 1.6);
}

function emptyRoot(): IrNode {
  return {
    key: "root",
    kind: "frame",
    name: null,
    componentType: null,
    baseClasses: [],
    tag: "root",
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
    children: [],
    appearId: null,
    stylesPresetId: null,
    svg: null,
  };
}

function metaContent(html: string, key: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(match[0].slice(5).replace(/\/?>$/, ""));
    if ((attrs["name"] ?? attrs["property"])?.toLowerCase() === key) {
      const content = attrs["content"];
      return content === undefined || content.trim() === "" ? null : content.trim();
    }
  }
  return null;
}

function pageMeta(html: string): {
  lang?: string;
  description?: string;
  meta?: { ogTitle?: string; ogDescription?: string; ogImage?: string };
} {
  const out: ReturnType<typeof pageMeta> = {};
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/i.exec(html)?.[1];
  if (lang !== undefined) out.lang = lang;
  const description = metaContent(html, "description");
  if (description !== null) out.description = description;
  const og: NonNullable<typeof out.meta> = {};
  const ogTitle = metaContent(html, "og:title");
  const ogDescription = metaContent(html, "og:description");
  const ogImage = metaContent(html, "og:image");
  if (ogTitle !== null) og.ogTitle = ogTitle;
  if (ogDescription !== null) og.ogDescription = ogDescription;
  if (ogImage !== null) og.ogImage = ogImage;
  if (Object.keys(og).length > 0) out.meta = og;
  return out;
}

function htmlTitle(html: string): string | null {
  return /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() ?? null;
}

function scriptJson(html: string, id: string): string | null {
  const re = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`);
  const match = re.exec(html);
  if (match === null) return null;
  const content = (match[1] ?? "").trim();
  return content === "" ? null : content;
}

function styleBlock(html: string, marker: string): string | null {
  const re = new RegExp(`<style[^>]*${marker}[^>]*>([\\s\\S]*?)</style>`);
  return re.exec(html)?.[1] ?? null;
}

function readAllCss(html: string, rootDir: string | undefined): string {
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? "")
    .join("\n");
  return `${inline}\n${readLinkedCss(html, rootDir)}`;
}

// `order` is the rule's position in the whole sheet, media blocks included: the
// cascade needs it to tell which of two equally specific rules comes later.
type ParsedCssRule = { selector: string; values: Record<string, string>; order: number };
type ParsedCssMedia = { maxWidth: number | null; minWidth: number | null; rules: ParsedCssRule[] };

// `flex-flow` is the shorthand of `flex-direction` and `flex-wrap`. As a property
// of its own it sits beside the longhand a variant sets (`flex-direction:column`
// over a base `flex-flow:row`) and nothing says which of the two wins, so the
// phone copy of a card kept its row. Read as the two longhands, the later
// declaration replaces the earlier one like in the browser.
const FLOW_DIRECTION = /^(?:row|column)(?:-reverse)?$/;
const FLOW_WRAP = /^(?:nowrap|wrap|wrap-reverse)$/;

function expandFlexFlow(value: string): [string, string][] | null {
  const important = /\s*!important\s*$/i.exec(value)?.[0] ?? "";
  const tokens = value.slice(0, value.length - important.length).trim().split(/\s+/);
  if (tokens.length > 2 || tokens.some((token) => !FLOW_DIRECTION.test(token) && !FLOW_WRAP.test(token))) return null;
  const direction = tokens.find((token) => FLOW_DIRECTION.test(token)) ?? "row";
  const wrap = tokens.find((token) => FLOW_WRAP.test(token)) ?? "nowrap";
  return [["flex-direction", `${direction}${important}`], ["flex-wrap", `${wrap}${important}`]];
}

// `place-content:<align> [<justify>]` has the same problem: Framer's base rule
// writes the shorthand, a variant writes `justify-content` alone, and the
// compiled CSS puts the shorthand after the longhand, so the base value won and
// the phone header's content ran out at the top of its 64 px bar. One value
// stands for both axes.
function expandPlaceContent(value: string): [string, string][] | null {
  const important = /\s*!important\s*$/i.exec(value)?.[0] ?? "";
  const bare = value.slice(0, value.length - important.length).trim();
  if (/[()]|\b(?:safe|unsafe|first|last|baseline)\b/.test(bare)) return null;
  const tokens = bare.split(/\s+/);
  if (tokens.length > 2) return null;
  return [["align-content", `${tokens[0]}${important}`], ["justify-content", `${tokens[1] ?? tokens[0]}${important}`]];
}

function expandShorthand(property: string, value: string): [string, string][] | null {
  if (property === "flex-flow") return expandFlexFlow(value);
  if (property === "place-content") return expandPlaceContent(value);
  return null;
}

function parseDeclarations(body: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const declaration of splitDeclarations(body)) {
    const pair = parseDeclaration(declaration);
    if (pair === null) continue;
    for (const [property, value] of expandShorthand(pair[0], pair[1]) ?? [pair]) {
      values[property] = value;
    }
  }
  return values;
}

type Vars = Record<string, string>;

// Resolve `var()` against the custom properties in force on an element. Framer
// writes ALL typography through them (`--framer-font-size`, `--framer-text-color`
// … set by a preset class or inline), so keeping `var(--framer-font-size, 16px)`
// in a baked page that no longer defines them renders every text at the
// fallback. The token variables (`--token-*`) stay as `var()`: the theme
// mapping owns them.
//
// A real scanner, not a regex: Framer nests fallbacks several levels deep
// (`var(--link-hover-font-family, var(--link-font-family, var(--font-family,
// "Inter", sans-serif)))`), and a pattern that handles one level leaves the
// outer call, and with it the whole value, unresolved.
function resolveVars(value: string, vars: Vars, depth = 0, tokens: Vars = {}): string {
  if (depth > 8 || !value.includes("var(")) return value;
  let out = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("var(", cursor);
    if (start === -1) break;
    // `var(` must start a token, not end another identifier (`invar(`).
    if (start > 0 && /[A-Za-z0-9_-]/.test(value.charAt(start - 1))) {
      out += value.slice(cursor, start + 4);
      cursor = start + 4;
      continue;
    }
    let depthParen = 1;
    let end = start + 4;
    let quote: string | null = null;
    while (end < value.length && depthParen > 0) {
      const char = value.charAt(end);
      if (quote !== null) {
        if (char === "\\") end += 1;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === "(") depthParen += 1;
      else if (char === ")") depthParen -= 1;
      end += 1;
    }
    if (depthParen !== 0) break; // unbalanced: leave the rest untouched
    const inner = value.slice(start + 4, end - 1);
    const comma = splitCommas(inner);
    const name = (comma[0] ?? "").trim();
    // The fallback is everything after the FIRST top-level comma.
    const firstComma = (() => {
      let level = 0;
      let q: string | null = null;
      for (let index = 0; index < inner.length; index += 1) {
        const char = inner.charAt(index);
        if (q !== null) {
          if (char === q) q = null;
          continue;
        }
        if (char === '"' || char === "'") q = char;
        else if (char === "(") level += 1;
        else if (char === ")") level -= 1;
        else if (char === "," && level === 0) return index;
      }
      return -1;
    })();
    const fallback = firstComma === -1 ? undefined : inner.slice(firstComma + 1).trim();
    out += value.slice(cursor, start);
    if (name.startsWith("--token-")) {
      // A theme token stays a variable (the theme can take it over), but its
      // fallback is the value the page gives the token, not the colour the
      // style had when it was saved.
      //
      // The page's own definition of the token is the source. The inherited
      // chain does not carry it: Framer defines the token on `body`, and the
      // element that uses it sits deeper, so the chain alone leaves the stale
      // fallback standing (fluffy-rectangle: a button in the green of an older
      // palette). `tokenDefinitions` reads the definitions from the page's CSS.
      const known = vars[name] ?? tokens[name];
      out += known === undefined
        ? value.slice(start, end)
        : `var(${name},${resolveVars(known.trim(), vars, depth + 1, tokens)})`;
    } else if (!name.startsWith("--")) {
      out += value.slice(start, end);
    } else if (vars[name] !== undefined) {
      out += resolveVars((vars[name] as string).trim(), vars, depth + 1);
    } else if (fallback !== undefined) {
      out += resolveVars(fallback, vars, depth + 1);
    } else {
      out += value.slice(start, end);
    }
    cursor = end;
  }
  return out + value.slice(cursor);
}

// A media prelude that only asks for widths: `(min-width: 810px) and
// (max-width: 1199.98px)`. Anything else (prefers-color-scheme, orientation,
// print …) is not a width range and must not leak into the device model.
//
// The unit is optional: Framer writes its phone range as `(max-width:809px) and
// (min-width:0)`, and a unitless zero is valid CSS. Rejecting it dropped every
// phone rule (all phone text sizes) from the import.
function mediaRange(prelude: string): { min: number | null; max: number | null } | null {
  const query = prelude.replace(/^@media/i, "");
  const rest = query
    .replace(/\(\s*(?:min|max)-width\s*:\s*[0-9.]+(?:px)?\s*\)/gi, "")
    .replace(/\b(?:screen|all|and|only)\b/gi, "")
    .trim();
  if (rest !== "") return null;
  const max = /max-width:\s*([0-9.]+)(?:px)?/i.exec(query)?.[1];
  const min = /min-width:\s*([0-9.]+)(?:px)?/i.exec(query)?.[1];
  return {
    min: min === undefined ? null : Number.parseFloat(min),
    max: max === undefined ? null : Number.parseFloat(max),
  };
}

function parseCssRules(
  source: string,
  counter: { next: number } = { next: 0 },
): { rules: ParsedCssRule[]; media: ParsedCssMedia[] } {
  const rules: ParsedCssRule[] = [];
  const media: ParsedCssMedia[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const brace = source.indexOf("{", cursor);
    if (brace === -1) break;
    const prelude = source.slice(cursor, brace).trim();
    let depth = 1;
    let end = brace + 1;
    while (end < source.length && depth > 0) {
      if (source[end] === "{") depth += 1;
      if (source[end] === "}") depth -= 1;
      end += 1;
    }
    const body = source.slice(brace + 1, end - 1);
    if (prelude.startsWith("@media")) {
      const range = mediaRange(prelude);
      if (range !== null) {
        media.push({ minWidth: range.min, maxWidth: range.max, rules: parseCssRules(body, counter).rules });
      }
    } else if (/^@supports\s*\(\s*aspect-ratio\s*:\s*1\s*\)$/.test(prelude)) {
      // Framer defines `--framer-aspect-ratio-supported:auto` only in here and
      // sizes boxes with `height:var(--framer-aspect-ratio-supported,438px)`.
      // The import targets browsers that know `aspect-ratio`, so the block holds.
      const inner = parseCssRules(body, counter);
      rules.push(...inner.rules);
      media.push(...inner.media);
    } else if (!prelude.startsWith("@")) {
      const values = parseDeclarations(body);
      for (const selector of splitCommas(prelude).map((entry) => entry.trim()).filter(Boolean)) {
        rules.push({ selector, values, order: counter.next });
        counter.next += 1;
      }
    }
    cursor = end;
  }
  return { rules, media };
}

// An attribute condition of a selector: `[data-x]` (op "") or `[data-x=y]` (op "=").
// Other operators (`^=`, `*=` …) are not read: a rule that needs one is left out.
type AttrCondition = { name: string; op: "" | "="; value: string };
// What a compound selector asks of an element besides its tag.
type Simple = { classes: string[]; attrs: AttrCondition[] };
type Compound = Simple & { tag: string; not: Simple[] };

// A selector compiled once, so a 550 KB stylesheet costs one pass per rule
// instead of one pass per rule and node.
type CompiledRule = {
  order: number;
  // CSS specificity in one number (ids, then classes and attributes, then types).
  // The more specific rule wins whatever its place in the sheet; at equal
  // specificity the later one does.
  specificity: number;
  values: Record<string, string>;
  // The interaction this rule styles (`.btn:hover`), absent for a base rule.
  state?: IrInteraction;
  root: boolean;
  target: Compound;
  ancestors: Compound[];
};

type RuleIndex = { byClass: Map<string, CompiledRule[]>; generic: CompiledRule[] };

const NO_COMPOUND: Compound = { tag: "", classes: [], attrs: [], not: [] };
const ATTRIBUTE = /^\[\s*([A-Za-z_][\w:.-]*)\s*(?:(=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?\]$/;

// `.a[data-x=y]#id` → classes and attribute conditions; null for anything else.
function parseSimple(text: string): Simple | null {
  const classes: string[] = [];
  const attrs: AttrCondition[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === ".") {
      const match = /^\.([A-Za-z0-9_-]+)/.exec(text.slice(index));
      if (match === null) return null;
      classes.push(match[1] ?? "");
      index += match[0].length;
    } else if (char === "#") {
      const match = /^#([A-Za-z0-9_-]+)/.exec(text.slice(index));
      if (match === null) return null;
      attrs.push({ name: "id", op: "=", value: match[1] ?? "" });
      index += match[0].length;
    } else if (char === "[") {
      let close = index + 1;
      let quote: string | null = null;
      while (close < text.length && (quote !== null || text.charAt(close) !== "]")) {
        const here = text.charAt(close);
        if (quote !== null) {
          if (here === quote) quote = null;
        } else if (here === '"' || here === "'") quote = here;
        close += 1;
      }
      const match = ATTRIBUTE.exec(text.slice(index, close + 1));
      if (match === null) return null;
      attrs.push({
        name: match[1] ?? "",
        op: match[2] === "=" ? "=" : "",
        value: match[3] ?? match[4] ?? match[5] ?? "",
      });
      index = close + 1;
    } else {
      return null;
    }
  }
  return { classes, attrs };
}

// `a.framer-text[data-x]:not(.y)` → tag, classes, attributes and the simple
// `:not()` groups. A `:not()` with anything else inside (`:not(:disabled)`) is
// dropped, which reads it as true: a static page has no disabled element.
function parseCompound(text: string): Compound | null {
  const tag = /^(?:\*|[A-Za-z][A-Za-z0-9-]*)/.exec(text)?.[0] ?? "";
  const not: Simple[] = [];
  const rest = text.slice(tag.length).replace(/:not\(([^)]*)\)/g, (_all, inner: string) => {
    const simple = parseSimple(inner.trim());
    if (simple !== null) not.push(simple);
    return "";
  });
  const simple = parseSimple(rest);
  return simple === null ? null : { tag, ...simple, not };
}

// Specificity as the CSS cascade counts it: `:not(x)` counts as `x`, pseudo
// elements as types, every other pseudo class like a class.
function specificityOf(selector: string): number {
  let ids = 0;
  let classes = 0;
  let types = 0;
  const rest = selector
    .replace(/:not\(([^)]*)\)/g, "$1")
    .replace(/\[[^\]]*\]/g, () => ((classes += 1), " "))
    .replace(/#[A-Za-z0-9_-]+/g, () => ((ids += 1), " "))
    .replace(/\.[A-Za-z0-9_-]+/g, () => ((classes += 1), " "))
    .replace(/::[A-Za-z-]+(?:\([^)]*\))?/g, () => ((types += 1), " "))
    .replace(/:[A-Za-z-]+(?:\([^)]*\))?/g, () => ((classes += 1), " "));
  for (const part of rest.split(/[\s>+~]+/)) if (/^[A-Za-z]/.test(part)) types += 1;
  return ids * 1_000_000 + classes * 1_000 + types;
}

// Returns null for selectors that are not a plain structural match. State
// selectors (`:hover`, `::before`, `:nth-child` …) set `pseudo`: applying them
// to the base style would make a button permanently look hovered.
const STATE_SUFFIX = /^(.*?):(hover|focus-visible|focus|active|disabled)$/;

function compileSelector(
  selector: string,
  order: number,
  values: Record<string, string>,
): { rule: CompiledRule | null; pseudo: boolean } {
  const withoutNot = selector.replace(/:not\([^)]*\)/g, "");
  // `.btn:hover` and friends: the same element in another state. Only when the
  // state is the last thing on the target (`.card:hover .title` styles another
  // element and stays a pseudo rule that is reported, not applied).
  const state = STATE_SUFFIX.exec(withoutNot);
  if (state !== null && !/:/.test(state[1] ?? "") && selector.endsWith(`:${state[2]}`)) {
    const inner = compileSelector(selector.slice(0, selector.length - (state[2] ?? "").length - 1), order, values);
    if (inner.rule === null) return inner;
    const name = state[2] === "focus-visible" ? "focus" : state[2];
    return { rule: { ...inner.rule, state: name as IrInteraction }, pseudo: false };
  }
  if (/^(?:body|html|#main)$/.test(selector)) {
    return {
      rule: { order, specificity: specificityOf(selector), values, root: true, target: NO_COMPOUND, ancestors: [] },
      pseudo: false,
    };
  }
  if (/:/.test(withoutNot.replace(/\[[^\]]*\]/g, ""))) return { rule: null, pseudo: true };
  const compounds: Compound[] = [];
  for (const part of selector.split(/\s*[>+~]\s*|\s+/).map((entry) => entry.trim()).filter(Boolean)) {
    const compound = parseCompound(part);
    if (compound === null) return { rule: null, pseudo: false };
    compounds.push(compound);
  }
  const target = compounds.pop();
  if (target === undefined) return { rule: null, pseudo: false };
  return {
    rule: { order, specificity: specificityOf(selector), values, root: false, target, ancestors: compounds },
    pseudo: false,
  };
}

function buildIndex(rules: readonly ParsedCssRule[]): { index: RuleIndex; skippedPseudo: number } {
  const index: RuleIndex = { byClass: new Map(), generic: [] };
  let skippedPseudo = 0;
  for (const entry of rules) {
    const { rule, pseudo } = compileSelector(entry.selector, entry.order, entry.values);
    if (pseudo) skippedPseudo += 1;
    if (rule === null) continue;
    const first = rule.target.classes[0];
    if (first === undefined) {
      index.generic.push(rule);
      continue;
    }
    const bucket = index.byClass.get(first);
    if (bucket === undefined) index.byClass.set(first, [rule]);
    else bucket.push(rule);
  }
  return { index, skippedPseudo };
}

// Every class of the element a rule can name: the shared ones and its variant's.
const classesOf = (node: IrNode): string[] => [...node.baseClasses, ...(node.variantClasses ?? [])];

// What an element offers to selectors, as strings: its tag, its classes and its
// attributes (`[name]` and `[name=value]`). The set of an element's ancestors
// is the union of theirs.
function tokensOf(node: IrNode): string[] {
  // The root node stands for the page element, `<div id="main">`.
  const isRoot = node.tag === "root";
  const tokens = [`tag:${isRoot ? "div" : node.tag}`, ...classesOf(node).map((name) => `.${name}`)];
  const attrs: Record<string, string> = {
    ...(node.attrs ?? {}),
    ...(isRoot ? { id: "main" } : node.htmlId ? { id: node.htmlId } : {}),
  };
  for (const [name, value] of Object.entries(attrs)) tokens.push(`[${name}]`, `[${name}=${value}]`);
  return tokens;
}

const conditionToken = (condition: AttrCondition): string =>
  condition.op === "=" ? `[${condition.name}=${condition.value}]` : `[${condition.name}]`;

const simpleHolds = (simple: Simple, tokens: ReadonlySet<string>): boolean =>
  simple.classes.every((name) => tokens.has(`.${name}`)) &&
  simple.attrs.every((condition) => tokens.has(conditionToken(condition)));

const tagHolds = (compound: Compound, tokens: ReadonlySet<string>): boolean =>
  compound.tag === "" || compound.tag === "*" || tokens.has(`tag:${compound.tag.toLowerCase()}`);

function ruleMatches(
  node: IrNode,
  rule: CompiledRule,
  own: ReadonlySet<string>,
  ancestors: ReadonlySet<string>,
): boolean {
  if (node.tag === "root") {
    if (rule.root) return true;
    // A class rule can target the page element itself (`.framer-QDc12{…}`).
    return (
      rule.target.classes.length > 0 &&
      rule.ancestors.length === 0 &&
      rule.target.classes.every((name) => node.baseClasses.includes(name))
    );
  }
  if (rule.root) return false;
  const { target } = rule;
  if (!tagHolds(target, own) || !simpleHolds(target, own)) return false;
  if (target.not.some((excluded) => simpleHolds(excluded, own))) return false;
  // Every class, attribute and tag of an ancestor compound must be on the way
  // down. The rule of a phone variant, `.framer-C.framer-v-phone .framer-part`,
  // reaches the parts of the phone copy only; `[data-x=y] div` the divs below an
  // element with that attribute, not every div of the page.
  return rule.ancestors.every((compound) => tagHolds(compound, ancestors) && simpleHolds(compound, ancestors));
}

// The rules that apply to an element, in no particular order: the caller sorts
// them with the ones of the other sheets it merges (`bySpecificity`).
function matchingRules(
  index: RuleIndex,
  node: IrNode,
  own: ReadonlySet<string>,
  ancestors: ReadonlySet<string>,
): CompiledRule[] {
  const candidates = new Set<CompiledRule>(index.generic);
  for (const name of classesOf(node)) {
    for (const rule of index.byClass.get(name) ?? []) candidates.add(rule);
  }
  return [...candidates].filter((rule) => ruleMatches(node, rule, own, ancestors));
}

const bySpecificity = (a: CompiledRule, b: CompiledRule): number => a.specificity - b.specificity || a.order - b.order;

// The base rules only: a `:hover` rule must never land in the base style.
const baseOnly = (rules: CompiledRule[]): CompiledRule[] => rules.filter((rule) => rule.state === undefined);

// A query applies to the devices whose representative width it contains, so a
// bare `(min-width: 810px)` reaches tablet and desktop, never mobile, and a
// `(min-width: 1440px)` reaches desktop only (see `devices.ts`).
const devicesOf = devicesContaining;

const IMPORTANT = /\s*!important\s*$/i;

// The inline sizes `elementStyleToParts` keeps in `box` (key), under their CSS name.
const INLINE_BOX_PROPERTIES: Readonly<Record<string, string>> = {
  width: "width",
  height: "height",
  minWidth: "min-width",
  maxWidth: "max-width",
  minHeight: "min-height",
  maxHeight: "max-height",
  aspectRatio: "aspect-ratio",
};

// The cascade of one device: class rules in source order, then the element's own
// inline style. A declaration marked `!important` beats every normal one, the
// inline style included, and the marker does not travel on: Framer hides the
// copies of other breakpoints with `.hidden-x{display:none!important}` over an
// inline `display:contents`. Carried as `none!important`, the value could not be
// overridden by the device that shows the element (`display_mobile: flex`), so
// mobile-only layers stayed hidden.
function cascade(classValues: readonly Record<string, string>[], inline: IrVisual): IrVisual {
  const out: IrVisual = {};
  const important = new Set<string>();
  for (const values of classValues) {
    for (const [key, raw] of Object.entries(values)) {
      const marked = IMPORTANT.test(raw);
      if (important.has(key) && !marked) continue;
      out[key] = raw.replace(IMPORTANT, "");
      if (marked) important.add(key);
    }
  }
  for (const [key, value] of Object.entries(inline)) {
    if (!important.has(key)) out[key] = value;
  }
  return out;
}

// The first definition of each `--token-*` in the page's styles: what the
// browser resolves `var(--token-x, fallback)` to. A value that is itself a
// `var()` is left out, it has no colour of its own to write.
function tokenDefinitions(css: string): Vars {
  const tokens: Vars = {};
  for (const match of css.matchAll(/(--token-[a-f0-9-]{36}):\s*([^;}]+)/g)) {
    const name = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    if (name === "" || value === "" || value.includes("var(") || tokens[name] !== undefined) continue;
    tokens[name] = value;
  }
  return tokens;
}

function applyClassRules(root: IrNode, css: string): { skippedPseudo: number } {
  const parsed = parseCssRules(css);
  const base = buildIndex(parsed.rules);
  const mediaIndexes = parsed.media.map((entry) => {
    const built = buildIndex(entry.rules);
    return { devices: devicesOf(entry), index: built.index, skipped: built.skippedPseudo };
  });
  const skippedPseudo =
    base.skippedPseudo + mediaIndexes.reduce((sum, entry) => sum + entry.skipped, 0);

  const DEVICES: readonly IrDevice[] = ["desktop", "tablet", "mobile"];
  type VarsByDevice = Record<IrDevice, Vars>;
  // The page's own definitions of the `--token-*` variables: what the browser
  // resolves `var(--token-x, fallback)` to. The inherited chain does not carry
  // them (Framer defines the token on `body`, the element that uses it sits
  // deeper), so they are read from the page's CSS directly.
  const tokens = tokenDefinitions(css);

  const visit = (current: IrNode, ancestors: ReadonlySet<string>, inherited: VarsByDevice, inheritedWhiteSpace?: string): void => {
    const baseState = current.states[0];
    if (baseState === undefined) return;
    // The cascade: stylesheet rules first, the element's own inline style wins.
    // An inline `width` or `height` lives in `box`, not in the visual, and beats
    // the sheet's rules all the same (the phone footer: `width:350px` in the sheet,
    // `style="width:100%"` on the element). It joins the cascade here, so the value
    // each device state carries is the one the browser shows. The mapper merges
    // the copies of the breakpoints through these states and never reads the box
    // of any but the first.
    const inlineBox: IrVisual = {};
    for (const [key, name] of Object.entries(INLINE_BOX_PROPERTIES)) {
      const value = (baseState.box as Record<string, string | undefined> | null)?.[key];
      if (value !== undefined && baseState.visual[name] === undefined) inlineBox[name] = value;
    }
    const inline = { ...baseState.visual, ...inlineBox };
    const ownTokens = new Set(tokensOf(current));
    const appears = current.attrs?.["data-framer-appear-id"] !== undefined;
    const matched = matchingRules(base.index, current, ownTokens, ancestors);
    const interactionValues: Partial<Record<IrInteraction, Record<string, string>>> = {};
    for (const rule of matched.filter((entry) => entry.state !== undefined).sort(bySpecificity)) {
      if (rule.state !== undefined) interactionValues[rule.state] = { ...interactionValues[rule.state], ...rule.values };
    }
    const baseRules = baseOnly(matched);
    const mediaRules = mediaIndexes.map((entry) => ({
      devices: entry.devices,
      rules: baseOnly(matchingRules(entry.index, current, ownTokens, ancestors)),
    }));
    // Custom properties inherit, so each device carries its own chain; the
    // values are resolved against the chain at THIS element.
    const varsByDevice = {} as VarsByDevice;
    const valuesByDevice = {} as Record<IrDevice, IrVisual>;
    for (const device of DEVICES) {
      const own: Vars = {};
      const plain: IrVisual = {};
      // One list per device: the base rules and those of the queries that reach
      // it, ordered the way the browser orders them (specificity, then position).
      const rules = [...baseRules, ...mediaRules.filter((entry) => entry.devices.includes(device)).flatMap((entry) => entry.rules)];
      rules.sort(bySpecificity);
      for (const [key, value] of Object.entries(cascade(rules.map((rule) => rule.values), inline))) {
        if (value === undefined) continue;
        if (key.startsWith("--")) own[key] = value;
        else plain[key] = value;
      }
      // `[data-framer-appear-id]{opacity:0.001}`: the same start state the inline
      // style carries, only written in the sheet. It goes to `appearInitial` too.
      if (appears) {
        for (const property of START_STATE_PROPERTIES) {
          const value = plain[property];
          if (value === undefined) continue;
          delete plain[property];
          current.appearInitial = { ...current.appearInitial, [property]: value };
        }
      }
      const vars = { ...inherited[device], ...own };
      varsByDevice[device] = vars;
      // Framer keeps a border as custom properties and draws it with
      // `[data-border=true]:after`, a pseudo rule that is not applied. The
      // element carries the border itself, with the widths of each side.
      const borderStyle = vars["--border-style"];
      if (current.attrs?.["data-border"] === "true" && borderStyle !== undefined && borderStyle !== "none") {
        for (const side of ["top", "right", "bottom", "left"]) {
          const width = vars[`--border-${side}-width`];
          if (width !== undefined) plain[`border-${side}-width`] = width;
        }
        plain["border-style"] = borderStyle;
        const color = vars["--border-color"];
        if (color !== undefined) plain["border-color"] = color;
      }
      valuesByDevice[device] = Object.fromEntries(
        Object.entries(plain).flatMap(([key, value]) => (value === undefined ? [] : [[key, resolveVars(value, vars, 0, tokens)]])),
      );
    }
    baseState.visual = valuesByDevice.desktop;
    const whiteSpace = valuesByDevice.desktop["white-space"] ?? inheritedWhiteSpace;
    const spacedText = SPACED_TEXT.get(current);
    if (spacedText !== undefined && baseState.text !== null && whiteSpace !== undefined && KEEPS_SPACES.test(whiteSpace)) {
      baseState.text = { ...baseState.text, content: spacedText };
    }
    // The element's own states, resolved against the same custom properties.
    const interactions: Partial<Record<IrInteraction, IrVisual>> = {};
    for (const [name, values] of Object.entries(interactionValues) as [IrInteraction, Record<string, string>][]) {
      const resolved: IrVisual = {};
      for (const [key, value] of Object.entries(values)) {
        if (!key.startsWith("--")) resolved[key] = resolveVars(value, varsByDevice.desktop, 0, tokens);
      }
      if (Object.keys(resolved).length > 0) interactions[name] = resolved;
    }
    if (Object.keys(interactions).length > 0) baseState.interactions = interactions;
    // A device keeps its own state only where it differs from desktop. A device
    // the queries do not touch still needs one when desktop changed: it keeps
    // the values from before the query (a `min-width` rule never reaches mobile).
    for (const device of ["tablet", "mobile"] as const) {
      const values = valuesByDevice[device];
      const differs = [...new Set([...Object.keys(values), ...Object.keys(baseState.visual)])].some(
        (key) => values[key] !== baseState.visual[key],
      );
      if (!differs) continue;
      current.states.push({
        ...baseState,
        device,
        hiddenAt: [],
        variantHash: null,
        visual: values,
      });
    }
    const offered = new Set([...ancestors, ...ownTokens]);
    for (const child of current.children) visit(child, offered, varsByDevice, whiteSpace);
  };
  // Above the page element sit `html` and `body`; the page element is `#main`.
  visit(root, new Set(["tag:html", "tag:body"]), { desktop: tokens, tablet: tokens, mobile: tokens });
  return { skippedPseudo };
}

function readLinkedCss(html: string, rootDir: string | undefined): string {
  if (rootDir === undefined) return "";
  const match = /<link[^>]*href="(styles\/[^"]+\.css)"/.exec(html);
  if (match === null) return "";
  try {
    return readFileSync(resolve(join(rootDir, match[1] ?? "")), "utf8");
  } catch {
    return "";
  }
}

// Text presets (B3): the `.framer-styles-preset-<id>` rules of the stylesheet.
// Only the rule without the `.rich-text-wrapper` qualifier carries the style.
function readTextPresets(
  html: string,
  linkedCss: string,
): { id: string; name: string | null; values: Record<string, string>; breakpoints: [] }[] {
  // Framer writes the presets either into the linked sheet or into inline
  // style blocks; reading only one of them leaves the other half empty.
  const source = `${html}\n${linkedCss}`;
  const out: { id: string; name: string | null; values: Record<string, string>; breakpoints: [] }[] = [];
  for (const match of source.matchAll(/\.framer-styles-preset-([a-z0-9]+)(?::not\(\.rich-text-wrapper\))?\s*\{([^}]*)\}/g)) {
    const id = match[1] ?? "";
    const body = match[2] ?? "";
    if (id === "") continue;
    if (out.some((entry) => entry.id === id)) continue;
    const values: Record<string, string> = {};
    for (const declaration of splitDeclarations(body)) {
      const pair = parseDeclaration(declaration);
      if (pair === null) continue;
      const mapped = FRAMER_TEXT_PROPS[pair[0]];
      if (mapped !== undefined) values[mapped] = pair[1];
    }
    if (Object.keys(values).length > 0) out.push({ id, name: null, values, breakpoints: [] });
  }
  return out;
}

// A loop entry in the appear JSON: the measured shape is `initial`/`animate`
// pairs that repeat (iterations) or a transform that returns to its start.
function isLoopEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const record = entry as Record<string, unknown>;
  for (const variant of Object.values(record)) {
    if (typeof variant !== "object" || variant === null) continue;
    const animate = (variant as Record<string, unknown>)["animate"];
    if (typeof animate !== "object" || animate === null) continue;
    const transition = (animate as Record<string, unknown>)["transition"];
    if (typeof transition === "object" && transition !== null) {
      const repeat = (transition as Record<string, unknown>)["repeat"];
      if (repeat === Infinity || repeat === "infinity") return true;
    }
  }
  return false;
}

// The capture entry for a fixture folder (index.html + styles/).
// The HTML file of a page inside an export folder: `index.html` for the home
// page, else `<path>/index.html` or `<path>.html` (the two shapes static
// exports use).
export function pageFileOf(fixtureDir: string, pagePath: string): string {
  const trimmed = pagePath.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return join(fixtureDir, "index.html");
  for (const candidate of [join(fixtureDir, trimmed, "index.html"), join(fixtureDir, `${trimmed}.html`)]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new SenifyError("validation", `Für den Pfad ${pagePath} gibt es im Export keine HTML-Datei (${trimmed}/index.html oder ${trimmed}.html)`, {
    field: "source.page",
    suggestion: "Prüfe, ob die Seite im Export-Ordner als <pfad>/index.html oder <pfad>.html liegt.",
  });
}

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
};

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

// `pagePath` is where the page lands in Senify, `sourcePath` which page of the
// export is read (the home page unless said otherwise). `origin` is the site the
// export came from: a scraped export writes its own links as absolute URLs, and
// only with the origin can they be told from links to other sites.
export function captureFixture(fixtureDir: string, pagePath = "/", sourcePath = "/", origin?: string): FramerIrDocument {
  const file = pageFileOf(fixtureDir, sourcePath);
  const html = readFileSync(file, "utf8");
  const document = captureHtml({
    html,
    // Relative stylesheet links resolve against the page file's own folder.
    rootDir: dirname(resolve(file)),
    pagePath,
    sourcePath,
    ...(origin !== undefined ? { url: origin } : {}),
  });
  try {
    const manifest = JSON.parse(readFileSync(resolve(fixtureDir, "senify-modules.json"), "utf8")) as {
      modules?: Record<string, NonNullable<IrNode["codeModule"]>>;
    };
    const visit = (node: IrNode): void => {
      const module = node.name === null ? undefined : manifest.modules?.[node.name];
      if (module !== undefined) node.codeModule = module;
      for (const child of node.children) visit(child);
    };
    visit(document.pages[0]?.root ?? emptyRoot());
    for (const [name, module] of Object.entries(manifest.modules ?? {})) {
      if (![...flattenNodes(document.pages[0]?.root)].some((node) => node.name === name)) {
        document.findings.push({
          kind: "code-component",
          nodeKey: null,
          message: "Ein Framer-Island-Manifest verweist auf einen nicht gefundenen Knoten.",
          evidence: `${module.path} → ${name}`,
          severity: "warn",
          suggestion: "data-framer-name im Export und Manifest prüfen.",
        });
      }
    }
  } catch {
    return document;
  }
  return document;
}

function* flattenNodes(node: IrNode | undefined): Generator<IrNode> {
  if (node === undefined) return;
  yield node;
  for (const child of node.children) yield* flattenNodes(child);
}
