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
  type IrNode,
  type IrNodeKind,
  type IrState,
  type IrTextContent,
  type IrVisual,
} from "./ir.ts";

/* ------------------------------------------------------------------ types */

export type CaptureHtmlInput = {
  html: string;
  // The export folder, so a linked stylesheet file can be read. Absent = the
  // capture reads only the inline `<style>` blocks.
  rootDir?: string;
  url?: string | null;
  pagePath?: string;
  title?: string | null;
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
};

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
    return { node: { tag, attrs, classes, children: [], text: null, svg: null }, next: gt + 1 };
  }

  // `script`/`style` content is raw text, not markup.
  if (tag === "script" || tag === "style") {
    const close = html.toLowerCase().indexOf(`</${tag}>`, gt + 1);
    const content = close === -1 ? html.slice(gt + 1, limit) : html.slice(gt + 1, close);
    return {
      node: { tag, attrs, classes, children: [], text: content, svg: null },
      next: close === -1 ? limit : close + tag.length + 3,
    };
  }

  // SVG stays verbatim: Senify renders icons/embeds from the markup it gets.
  if (tag === "svg") {
    const close = html.toLowerCase().indexOf("</svg>", gt + 1);
    const content = close === -1 ? html.slice(lt, limit) : html.slice(lt, close + 6);
    return {
      node: { tag, attrs, classes, children: [], text: null, svg: content },
      next: close === -1 ? limit : close + 6,
    };
  }

  const close = findClosing(html, gt + 1, tag, limit);
  const innerEnd = close === -1 ? limit : close;
  const children = scanNodes(html, gt + 1, innerEnd);
  const text = children.length === 0 ? extractText(html.slice(gt + 1, innerEnd)) : null;
  return {
    node: { tag, attrs, classes, children, text, svg: null },
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
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (property === "" || value === "") continue;
    const mapped = FRAMER_TEXT_PROPS[property];
    if (mapped !== undefined) out[mapped] = value;
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
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (property === "" || value === "" || property.startsWith("--")) continue;
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
          const parts = value.split(/\s+/);
          sides.top = parts[0] ?? "0";
          sides.right = parts[1] ?? sides.top ?? "0";
          sides.bottom = parts[2] ?? sides.top ?? "0";
          sides.left = parts[3] ?? sides.right ?? "0";
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
    children: raw.children.map((child) => toIrNode(child, counter)),
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
        // Inline <style> inside the tree is read separately.
        .filter((child) => child.tag !== "style")
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
  const cssText = readAllCss(html, input.rootDir);
  if (cssText.length <= 20_000) applyClassRules(root, cssText);

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
        root,
      },
    ],
    styles: {
      colors,
      textPresets: readTextPresets(html, linkedCss),
      fonts,
    },
    assets,
    motion: [],
    findings,
  };
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
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (property !== "" && value !== "" && !property.startsWith("--")) values[property] = value;
  }
  return values;
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
      const max = /max-width:\s*([0-9.]+)px/i.exec(prelude)?.[1];
      const min = /min-width:\s*([0-9.]+)px/i.exec(prelude)?.[1];
      media.push({
        maxWidth: max === undefined ? null : Number.parseFloat(max),
        minWidth: min === undefined ? null : Number.parseFloat(min),
        rules: parseCssRules(body).rules,
      });
    } else if (!prelude.startsWith("@")) {
      for (const selector of prelude.split(",").map((entry) => entry.trim()).filter(Boolean)) {
        rules.push({ selector, values: parseDeclarations(body) });
      }
    }
    cursor = end;
  }
  return { rules, media };
}

function selectorsFor(
  node: IrNode,
  selector: string,
  ancestorClasses: ReadonlySet<string>,
): boolean {
  if (node.tag === "root" && /^(?:body|html|#main)$/.test(selector)) return true;
  const compounds = selector
    .split(/\s*[>+~]\s*|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const target = compounds.pop();
  if (target === undefined) return false;
  const targetClasses = [...target.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1] ?? "");
  const targetTag = target.replace(/\.[A-Za-z0-9_-]+/g, "").replace(/::?[a-z-]+(?:\([^)]*\))?/g, "");
  if (targetTag !== "" && targetTag !== "*" && targetTag !== node.tag) return false;
  if (!targetClasses.every((name) => node.baseClasses.includes(name))) return false;
  return compounds.every((compound) => {
    const classes = [...compound.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1] ?? "");
    return classes.length === 0 || classes.some((name) => ancestorClasses.has(name));
  });
}

function applyClassRules(node: IrNode, css: string): void {
  const parsed = parseCssRules(css);
  const visit = (current: IrNode, ancestorClasses: ReadonlySet<string>): void => {
    const base = current.states[0];
    if (base === undefined) return;
    for (const rule of parsed.rules) {
      if (!selectorsFor(current, rule.selector, ancestorClasses)) continue;
      Object.assign(base.visual, rule.values);
    }
    const byDevice = new Map<IrDevice, Record<string, string>>();
    for (const media of parsed.media) {
      const device: IrDevice = media.maxWidth === null
        ? (media.minWidth !== null && media.minWidth <= 810 ? "mobile" : "desktop")
        : media.maxWidth <= 809 ? "mobile"
          : media.maxWidth <= 1199 ? "tablet"
            : "desktop";
      const values = byDevice.get(device) ?? {};
      for (const rule of media.rules) {
        if (selectorsFor(current, rule.selector, ancestorClasses)) Object.assign(values, rule.values);
      }
      byDevice.set(device, values);
    }
    for (const [device, values] of byDevice) {
      if (Object.keys(values).length === 0) continue;
      const existing = current.states.find((state) => state.device === device);
      if (existing !== undefined) {
        Object.assign(existing.visual, values);
      } else {
        current.states.push({
          ...base,
          device,
          hiddenAt: [],
          variantHash: null,
          visual: { ...base.visual, ...values },
        });
      }
    }
    const classes = new Set([...ancestorClasses, ...current.baseClasses]);
    for (const child of current.children) visit(child, classes);
  };
  visit(node, new Set());
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
  const source = linkedCss !== "" ? linkedCss : html;
  const out: { id: string; name: string | null; values: Record<string, string>; breakpoints: [] }[] = [];
  for (const match of source.matchAll(/\.framer-styles-preset-([a-z0-9]+)(?::not\(\.rich-text-wrapper\))?\s*\{([^}]*)\}/g)) {
    const id = match[1] ?? "";
    const body = match[2] ?? "";
    if (id === "") continue;
    if (out.some((entry) => entry.id === id)) continue;
    const values: Record<string, string> = {};
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon <= 0) continue;
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      const mapped = FRAMER_TEXT_PROPS[property];
      if (mapped !== undefined && value !== "") values[mapped] = value;
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
