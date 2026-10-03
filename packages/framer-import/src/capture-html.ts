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
import { readFileSync } from "node:fs";
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
  type IrLayout,
  type IrMotionSample,
  type IrNode,
  type IrNodeKind,
  type IrState,
  type IrTextContent,
  type IrVisual,
} from "./ir.ts";
import { expandBox, parseDeclaration, splitDeclarations } from "./css-util.ts";

/* ------------------------------------------------------------------ types */

export type CaptureHtmlInput = {
  html: string;
  // The export folder, so a linked stylesheet file can be read. Absent = the
  // capture reads only the inline `<style>` blocks.
  rootDir?: string;
  url?: string | null;
  pagePath?: string;
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

function scanTag(
  html: string,
  start: number,
  limit: number,
): { node: RawNode; next: number } | undefined {
  const lt = html.indexOf("<", start);
  const gt = html.indexOf(">", lt);
  if (gt === -1 || gt >= limit) return undefined;
  const openTag = html.slice(lt + 1, gt);
  const selfClosing = openTag.endsWith("/");
  const tag = (openTag.split(/\s/)[0] ?? "").toLowerCase();
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tag)) return undefined;
  const attrs = parseAttrs(openTag.slice(tag.length));
  const classes = (attrs["class"] ?? "").split(/\s+/).filter((entry) => entry !== "");

  if (selfClosing || VOID_TAGS.has(tag)) {
    return { node: { tag, attrs, classes, children: [], text: null, svg: null, innerHtml: null }, next: gt + 1 };
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
  const text = children.length === 0 ? extractText(html.slice(gt + 1, innerEnd)) : null;
  // Only elements with their own text between the children carry content the
  // child scan cannot see.
  const innerHtml =
    children.length > 0 &&
    innerEnd - (gt + 1) <= MAX_INNER_HTML &&
    children.every(isInlineTree) &&
    extractText(html.slice(gt + 1, innerEnd)) !== extractText(children.map((child) => child.text ?? "").join(" "))
      ? html.slice(gt + 1, innerEnd)
      : null;
  return {
    node: { tag, attrs, classes, children, text, svg: null, innerHtml },
    next: close === -1 ? limit : html.indexOf(">", innerEnd) + 1,
  };
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
      const gt = html.indexOf(">", open);
      i = gt === -1 ? limit : gt + 1;
      continue;
    }
    if (html.startsWith(`<${tag}`, open) && html.charAt(open + tag.length + 1).match(/[\s>]/)) {
      depth += 1;
    }
    const gt = html.indexOf(">", open);
    i = gt === -1 ? limit : gt + 1;
  }
  return -1;
}

function extractText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
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
    if (pair === null || pair[0].startsWith("--")) continue;
    const [property, value] = pair;
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

function toIrNode(raw: RawNode, counter: { ordinal: number }, inheritedHidden: string[] = []): IrNode {
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

  const states: IrState[] = [];
  const { visual, layout, box } = elementStyleToParts(attrs["style"]);
  // The SSR start state of an appear animation (`opacity:0.001;transform:…`)
  // is not the element's look: Framer's script animates it away on load. Kept
  // as a permanent style it hides the element for good, so it moves out of the
  // visual and into `appearInitial`, where the motion mapping reads it.
  const appearInitial: Record<string, string> = {};
  // Framer writes the same kind of start state for appear effects
  // (`data-framer-appear-id`), scroll reveals (`opacity:0;transform:translateY`)
  // and tickers (`opacity:0` until measured). An element that stays at
  // opacity ~0 for good is never the intended look in a static import.
  const startOpacity = Number.parseFloat(visual["opacity"] ?? "");
  const hasStartState =
    attrs["data-framer-appear-id"] !== undefined || (Number.isFinite(startOpacity) && startOpacity <= 0.01);
  if (hasStartState) {
    for (const property of ["opacity", "transform", "will-change"]) {
      const value = visual[property];
      if (value === undefined) continue;
      appearInitial[property] = value;
      delete visual[property];
    }
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
      const counter = { ordinal: 0 };
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
  const cssText = `${readAllCss(html, input.rootDir)}\n${input.css ?? ""}`;
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

  const pagePath = input.pagePath ?? "/";
  const pageCount = countNodes(root);
  if (pageCount > 1) {
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
      delay: Math.round((transition.delay ?? 0) * 1000),
      duration: Math.round(springSettleSeconds(transition) * 1000),
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

type ParsedCssRule = { selector: string; values: Record<string, string> };
type ParsedCssMedia = { maxWidth: number | null; minWidth: number | null; rules: ParsedCssRule[] };

function parseDeclarations(body: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const declaration of splitDeclarations(body)) {
    const pair = parseDeclaration(declaration);
    if (pair !== null && !pair[0].startsWith("--")) values[pair[0]] = pair[1];
  }
  return values;
}

// A media prelude that only asks for widths: `(min-width: 810px) and
// (max-width: 1199.98px)`. Anything else (prefers-color-scheme, orientation,
// print …) is not a width range and must not leak into the device model.
function mediaRange(prelude: string): { min: number | null; max: number | null } | null {
  const query = prelude.replace(/^@media/i, "");
  const rest = query
    .replace(/\(\s*(?:min|max)-width\s*:\s*[0-9.]+px\s*\)/gi, "")
    .replace(/\b(?:screen|all|and|only)\b/gi, "")
    .trim();
  if (rest !== "") return null;
  const max = /max-width:\s*([0-9.]+)px/i.exec(query)?.[1];
  const min = /min-width:\s*([0-9.]+)px/i.exec(query)?.[1];
  return {
    min: min === undefined ? null : Number.parseFloat(min),
    max: max === undefined ? null : Number.parseFloat(max),
  };
}

function parseCssRules(source: string): { rules: ParsedCssRule[]; media: ParsedCssMedia[] } {
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
        media.push({ minWidth: range.min, maxWidth: range.max, rules: parseCssRules(body).rules });
      }
    } else if (!prelude.startsWith("@")) {
      for (const selector of prelude.split(",").map((entry) => entry.trim()).filter(Boolean)) {
        rules.push({ selector, values: parseDeclarations(body) });
      }
    }
    cursor = end;
  }
  return { rules, media };
}

// A selector compiled once, so a 550 KB stylesheet costs one pass per rule
// instead of one pass per rule and node.
type CompiledRule = {
  order: number;
  values: Record<string, string>;
  root: boolean;
  tag: string;
  classes: string[];
  ancestors: string[][];
};

type RuleIndex = { byClass: Map<string, CompiledRule[]>; generic: CompiledRule[] };

const classesIn = (compound: string): string[] =>
  [...compound.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1] ?? "");

// Returns null for selectors that are not a plain structural match. State
// selectors (`:hover`, `::before`, `:nth-child` …) set `pseudo`: applying them
// to the base style would make a button permanently look hovered.
function compileSelector(
  selector: string,
  order: number,
  values: Record<string, string>,
): { rule: CompiledRule | null; pseudo: boolean } {
  if (/^(?:body|html|#main)$/.test(selector)) {
    return { rule: { order, values, root: true, tag: "", classes: [], ancestors: [] }, pseudo: false };
  }
  const withoutNot = selector.replace(/:not\([^)]*\)/g, "");
  if (/:/.test(withoutNot.replace(/\[[^\]]*\]/g, ""))) return { rule: null, pseudo: true };
  const compounds = withoutNot
    .split(/\s*[>+~]\s*|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const target = compounds.pop();
  if (target === undefined) return { rule: null, pseudo: false };
  const tag = target.replace(/\.[A-Za-z0-9_-]+/g, "");
  if (/[[#]/.test(tag)) return { rule: null, pseudo: false };
  return {
    rule: {
      order,
      values,
      root: false,
      tag,
      classes: classesIn(target),
      ancestors: compounds.map(classesIn),
    },
    pseudo: false,
  };
}

function buildIndex(rules: readonly ParsedCssRule[]): { index: RuleIndex; skippedPseudo: number } {
  const index: RuleIndex = { byClass: new Map(), generic: [] };
  let skippedPseudo = 0;
  rules.forEach((entry, order) => {
    const { rule, pseudo } = compileSelector(entry.selector, order, entry.values);
    if (pseudo) skippedPseudo += 1;
    if (rule === null) return;
    const first = rule.classes[0];
    if (first === undefined) {
      index.generic.push(rule);
      return;
    }
    const bucket = index.byClass.get(first);
    if (bucket === undefined) index.byClass.set(first, [rule]);
    else bucket.push(rule);
  });
  return { index, skippedPseudo };
}

function ruleMatches(node: IrNode, rule: CompiledRule, ancestorClasses: ReadonlySet<string>): boolean {
  if (node.tag === "root") return rule.root;
  if (rule.root) return false;
  if (rule.tag !== "" && rule.tag !== "*" && rule.tag !== node.tag) return false;
  if (!rule.classes.every((name) => node.baseClasses.includes(name))) return false;
  return rule.ancestors.every(
    (classes) => classes.length === 0 || classes.some((name) => ancestorClasses.has(name)),
  );
}

// Matching rules in source order, which is the cascade order.
function matchingRules(index: RuleIndex, node: IrNode, ancestorClasses: ReadonlySet<string>): CompiledRule[] {
  const candidates = new Set<CompiledRule>(index.generic);
  for (const name of node.baseClasses) {
    for (const rule of index.byClass.get(name) ?? []) candidates.add(rule);
  }
  return [...candidates]
    .filter((rule) => ruleMatches(node, rule, ancestorClasses))
    .sort((a, b) => a.order - b.order);
}

// The Framer ranges: mobile below 810, tablet 810–1199.98, desktop from 1200.
// A query applies to every device whose range it overlaps, so a bare
// `(min-width: 810px)` reaches tablet and desktop, never mobile.
const DEVICE_SPANS: readonly (readonly [IrDevice, number, number])[] = [
  ["mobile", 0, 810],
  ["tablet", 810, 1200],
  ["desktop", 1200, Number.POSITIVE_INFINITY],
];

function devicesOf(range: { minWidth: number | null; maxWidth: number | null }): IrDevice[] {
  const low = range.minWidth ?? 0;
  const high = range.maxWidth ?? Number.POSITIVE_INFINITY;
  return DEVICE_SPANS.filter(([, from, to]) => low < to && high >= from).map(([device]) => device);
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

  const visit = (current: IrNode, ancestorClasses: ReadonlySet<string>): void => {
    const baseState = current.states[0];
    if (baseState === undefined) return;
    // The cascade: stylesheet rules first, the element's own inline style wins.
    const inline = { ...baseState.visual };
    const baseline: Record<string, string> = {};
    for (const rule of matchingRules(base.index, current, ancestorClasses)) Object.assign(baseline, rule.values);
    const byDevice = new Map<IrDevice, Record<string, string>>();
    for (const entry of mediaIndexes) {
      const rules = matchingRules(entry.index, current, ancestorClasses);
      if (rules.length === 0) continue;
      for (const device of entry.devices) {
        const values = byDevice.get(device) ?? {};
        for (const rule of rules) Object.assign(values, rule.values);
        byDevice.set(device, values);
      }
    }
    const effective = (device: IrDevice): IrVisual => ({
      ...baseline,
      ...(byDevice.get(device) ?? {}),
      ...inline,
    });
    baseState.visual = effective("desktop");
    // A device keeps its own state only where it differs from desktop. A device
    // the queries do not touch still needs one when desktop changed: it keeps
    // the values from before the query (a `min-width` rule never reaches mobile).
    for (const device of ["tablet", "mobile"] as const) {
      const values = effective(device);
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
    const classes = new Set([...ancestorClasses, ...current.baseClasses]);
    for (const child of current.children) visit(child, classes);
  };
  visit(root, new Set());
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
export function captureFixture(fixtureDir: string, pagePath = "/"): FramerIrDocument {
  const html = readFileSync(join(fixtureDir, "index.html"), "utf8");
  const document = captureHtml({
    html,
    rootDir: dirname(resolve(join(fixtureDir, "index.html"))),
    pagePath,
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
