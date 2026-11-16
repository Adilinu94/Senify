// The project XML carries structure and text styles, but not everything a
// page needs to look like the source: the Unframer MCP writes no text colour
// and no font file (measured on fluffy-rectangle, 14.11.2026, 419
// `--framer-text-color` and 46 `@font-face` in the published page, 0 in the
// XML). The published page still has both.
//
// This enrichment reads those two things from the page and leaves the
// structure untouched: text colours are matched by their visible words, font
// files by family and weight. A word that appears with different colours is
// ambiguous and stays as it was; the report says so.

import { captureHtml } from "./capture-html.ts";
import type { FramerIrDocument, IrFontFace, IrNode } from "./ir.ts";
import { widgetPrimitive } from "@senify/widget-engine";
import { widgetTypeForComponent } from "./widget-mapping.ts";

export type ProjectStyleSource = {
  html: string;
  // The linked stylesheet of the page (`fetchLinkedCss`). The live site keeps
  // most of its `@font-face` blocks and preset colours there.
  css?: string;
  url?: string;
};

export type ProjectStyleStats = {
  colors: number;
  ambiguous: number;
  fonts: number;
  body: boolean;
  images: number;
  // Bilder der DOM-Widget-Defaults (Navbar-Logo, Footer-Porträt, Bewertungs-
  // avatare), die aus der veröffentlichten Seite als lokale Assets eingeplant
  // wurden.
  widgetImages: number;
};

type HtmlTextLayout = {
  content: string;
  inline: Record<string, string>;
};

const FONT_STYLE_SUFFIX =
  /[-_ ]?(?:extra[-_ ]?light|ultra[-_ ]?light|extra[-_ ]?bold|ultra[-_ ]?bold|semi[-_ ]?bold|demi[-_ ]?bold|regular|normal|medium|light|thin|bold|black|heavy|\d{3})$/i;

// `FS;Manrope-regular`, `GF;Manrope-600` and `Manrope` name the same family.
// A custom family may legitimately end in a weight word ("Neue Montreal
// Medium"); the result is only used for MATCHING, never written back.
export function baseFontFamily(family: string): string {
  const withoutProvider = family.includes(";") ? family.slice(family.lastIndexOf(";") + 1) : family;
  const first = withoutProvider.replace(/^["']+|["']+$/g, "").split(",")[0]?.trim() ?? "";
  return first.replace(FONT_STYLE_SUFFIX, "").trim().toLowerCase();
}

function concreteColor(value: string | undefined, tokens: ReadonlyMap<string, string>): string | null {
  if (value === undefined) return null;
  let current = value.trim().replace(/\s*!important\s*$/i, "");
  for (let depth = 0; depth < 6; depth += 1) {
    const token = /^var\(\s*--token-([a-z0-9_-]+)\s*(?:,\s*([\s\S]+))?\)$/i.exec(current);
    if (token !== null) {
      const known = tokens.get(token[1] ?? "");
      if (known !== undefined) {
        current = known.trim();
        continue;
      }
      if (token[2] !== undefined) {
        current = token[2].trim();
        continue;
      }
      return null;
    }
    const fallback = /^var\(\s*--[^,]+,\s*([\s\S]+)\)$/i.exec(current);
    if (fallback !== null) {
      current = (fallback[1] ?? "").trim();
      continue;
    }
    break;
  }
  if (/var\(/i.test(current)) return null;
  if (/^(?:inherit|initial|unset|revert|currentcolor|transparent|none|auto)$/i.test(current)) return null;
  return current === "" ? null : current;
}

function colorOfNode(node: IrNode, tokens: ReadonlyMap<string, string>): string | null {
  const state = node.states[0];
  if (state === undefined) return null;
  const text = state.text;
  const candidates = [
    text?.inline["color"],
    state.visual["color"],
    state.visual["--framer-text-color"],
    text?.inline["WebkitTextFillColor"],
  ];
  for (const candidate of candidates) {
    const concrete = concreteColor(candidate, tokens);
    if (concrete !== null) return concrete;
  }
  return null;
}

function textOfNode(node: IrNode): string | null {
  const text = node.states[0]?.text;
  if (text === undefined || text === null) return null;
  const content = text.content.replace(/\s+/g, " ").trim();
  return content === "" ? null : content;
}

function walk(node: IrNode, visit: (node: IrNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

// Die Bild-Defaults einer DOM-Widget-Definition. Nur `dom`-Widgets haben
// Inhaltsbilder; die Canvas-Kerne (Ribbon, Wave) bleiben außen vor.
function widgetMediaUrls(type: string): string[] {
  const definition = widgetPrimitive(type);
  if (definition?.dom !== true) return [];
  const urls: string[] = [];
  for (const control of definition.controls) {
    if (control.kind === "media" && typeof control.default === "string" && control.default !== "") {
      urls.push(control.default);
      continue;
    }
    if (control.kind !== "repeater" || !Array.isArray(control.default)) continue;
    const mediaFields = (control.fields ?? []).filter((field) => field.kind === "media");
    for (const entry of control.default) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      for (const field of mediaFields) {
        const value = (entry as Record<string, unknown>)[field.key];
        if (typeof value === "string" && value !== "") urls.push(value);
      }
    }
  }
  return urls;
}

function widgetTypesOf(document: FramerIrDocument): Set<string> {
  const types = new Set<string>();
  for (const page of document.pages) {
    walk(page.root, (node) => {
      if (node.kind !== "placeholder" && node.kind !== "component-instance") return;
      const type = widgetTypeForComponent(node.componentType);
      if (type !== undefined) types.add(type);
    });
  }
  return types;
}

function matchingFaces(project: IrFontFace, available: readonly IrFontFace[]): IrFontFace[] {
  const family = baseFontFamily(project.family);
  if (family === "") return [];
  return available.filter((face) => {
    if (face.src.length === 0) return false;
    if (baseFontFamily(face.family) !== family) return false;
    if (project.weight !== null && face.weight !== null && project.weight !== face.weight) return false;
    if (project.style !== null && face.style !== null && project.style !== face.style) return false;
    return true;
  });
}

export function enrichProjectDocument(
  document: FramerIrDocument,
  source: ProjectStyleSource,
): ProjectStyleStats {
  const page = captureHtml({
    html: source.html,
    ...(source.css === undefined ? {} : { css: source.css }),
    ...(source.url === undefined ? {} : { url: source.url }),
    pagePath: document.pages[0]?.path ?? "/",
  });
  const tokens = new Map(page.styles.colors.map((token) => [token.id, token.value]));
  const colorsByText = new Map<string, Set<string>>();
  const layoutsByText = new Map<string, { color: string; layout: HtmlTextLayout }[]>();
  const root = page.pages[0]?.root;
  // Framer ships one SSR copy per breakpoint. A copy hidden at the desktop
  // breakpoint often carries another colour (the mobile copy of "Meine
  // Leistungen" is white, the desktop copy #ebe4e4). Counting both would make
  // the word ambiguous and leave it black. Only copies visible at the target
  // width contribute.
  const desktopIds = new Set(
    page.breakpoints
      .filter((breakpoint) => breakpoint.minWidth <= 1440 && (breakpoint.maxWidth === null || 1440 <= breakpoint.maxWidth))
      .map((breakpoint) => breakpoint.id),
  );
  // The colour often sits on a container and is inherited by its words. Walk
  // with the last seen colour so a paragraph without its own declaration still
  // keeps the source's colour.
  const collectColors = (node: IrNode, inherited: string | null, hidden: boolean): void => {
    const state = node.states[0];
    const hiddenHere =
      hidden ||
      (desktopIds.size > 0 && (state?.hiddenAt.some((id) => desktopIds.has(id)) ?? false));
    const own = hiddenHere ? null : colorOfNode(node, tokens);
    const color = own ?? inherited;
    if (!hiddenHere && color !== null) {
      const addColor = (content: string): void => {
        const colors = colorsByText.get(content) ?? new Set<string>();
        colors.add(color);
        colorsByText.set(content, colors);
      };
      const addLayout = (key: string, layout: HtmlTextLayout): void => {
        const entries = layoutsByText.get(key) ?? [];
        entries.push({ color, layout });
        layoutsByText.set(key, entries);
      };
      const inline = htmlTextLayoutOf(node);
      const content = textOfNode(node);
      if (content !== null) {
        addColor(content);
        const ownLayout = textWithBreaks(node);
        if (ownLayout !== null) addLayout(content, { content: ownLayout, inline });
      }
      // A rich-text heading may split its words over spans; the project node
      // carries the joined words. The wrapper's joined text is the key that
      // meets it.
      const joined = subtreeText(node);
      if (joined.length >= 20 && joined.length <= 2000) {
        addColor(joined);
        const joinedLayout = subtreeTextWithBreaks(node);
        if (joinedLayout !== "") addLayout(joined, { content: joinedLayout, inline });
      }
    }
    for (const child of node.children) collectColors(child, color, hiddenHere);
  };
  if (root !== undefined) collectColors(root, null, false);

  let colors = 0;
  let ambiguous = 0;
  for (const projectPage of document.pages) {
    walk(projectPage.root, (node) => {
      const text = node.states[0]?.text;
      if (text === undefined || text === null) return;
      if ((text.inline["color"] ?? "").trim() !== "") return;
      const content = textOfNode(node);
      if (content === null) return;
      const found = colorsByText.get(content);
      if (found === undefined) return;
      if (found.size === 1) {
        const color = [...found][0] as string;
        text.inline["color"] = color;
        colors += 1;
        // Framer puts explicit line breaks into a heading's inline markup
        // ("Echte Meinungen<br>statt Werbetexte"). The project text is one
        // string and carries non-breaking spaces; without regular spaces the
        // line runs past its 806px box. `text-wrap: balance` then picks the
        // source's break.
        const layout = (layoutsByText.get(content) ?? []).find((entry) => entry.color === color)?.layout;
        if (layout !== undefined) {
          if (layout.content.trim() !== "") {
            text.content = layout.content.replace(/\u00a0/g, " ");
          }
          for (const [property, value] of Object.entries(layout.inline)) {
            if (text.inline[property] === undefined) text.inline[property] = value;
          }
          if (
            (layout.content.includes("\n") || layout.inline["textWrap"] === "balance") &&
            text.inline["whiteSpace"] === undefined
          ) {
            text.inline["whiteSpace"] = "pre-wrap";
          }
        }
      } else {
        ambiguous += 1;
      }
    });
  }

  // The project names the real family and weight; the page names the file.
  // Keep the project family, so the emitted CSS and the font face agree.
  const htmlFonts = page.styles.fonts;
  const fonts: IrFontFace[] = [];
  const seen = new Set<string>();
  let addedFonts = 0;
  for (const project of document.styles.fonts) {
    const matches = project.src.length === 0 ? matchingFaces(project, htmlFonts) : [];
    if (matches.length === 0) {
      fonts.push(project);
      continue;
    }
    for (const face of matches) {
      const key = `${project.family}|${face.weight ?? ""}|${face.style ?? ""}|${face.unicodeRange ?? ""}|${face.src.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fonts.push({
        family: project.family,
        weight: face.weight ?? project.weight,
        style: face.style ?? project.style,
        src: [...face.src],
        unicodeRange: face.unicodeRange,
      });
      addedFonts += 1;
    }
  }
  document.styles.fonts = fonts;

  let body = false;
  if (page.styles.body !== undefined) {
    const merged = { ...page.styles.body, ...document.styles.body };
    if (JSON.stringify(merged) !== JSON.stringify(document.styles.body ?? {})) body = true;
    document.styles.body = merged;
  }

  // The project XML names an image frame but not its file. The published page
  // carries the file next to the same card text. Match by the card's words, not
  // by list position: the page has four project cards, the XML only the two
  // expanded ones, so "second image" would paint the wrong card.
  const images = imageSourcesFromHtml(root);
  let addedImages = 0;
  const knownAssets = new Set(document.assets.map((asset) => asset.url));
  for (const projectPage of document.pages) {
    const parents = parentMap(projectPage.root);
    walk(projectPage.root, (node) => {
      if (node.kind !== "image" || node.assetUrl !== undefined || node.assetId !== undefined) return;
      const key = ancestorText(node, parents);
      if (key === null) return;
      const matches = new Map<string, { url: string; alt: string | null }>();
      for (const domain of domainsOf(key)) {
        for (const [url, entry] of images.get(domain) ?? []) matches.set(url, entry);
      }
      if (matches.size !== 1) return;
      const match = [...matches.values()][0] as { url: string; alt: string | null };
      node.assetUrl = match.url;
      if ((node.alt ?? "") === "") node.alt = match.alt;
      if (!knownAssets.has(match.url)) {
        knownAssets.add(match.url);
        document.assets.push({
          url: match.url,
          kind: "image",
          hash: null,
          alt: match.alt,
          width: null,
          height: null,
        });
      }
      addedImages += 1;
    });
  }

  // DOM-Widgets tragen ihre Inhaltsbilder als Katalog-Defaults (Logo, Porträt,
  // Bewertungsavatare). Die veröffentlichte Seite bestätigt, dass es diese
  // Bilder gibt; der Lauf lädt sie als lokale Assets, damit Vorschau und
  // Release nicht gegen die CSP auf framerusercontent zeigen.
  let widgetImages = 0;
  const liveBases = new Set(page.assets.map((asset) => asset.url.split(/[?#]/)[0] ?? asset.url));
  for (const type of widgetTypesOf(document)) {
    for (const url of widgetMediaUrls(type)) {
      if (knownAssets.has(url)) continue;
      const base = url.split(/[?#]/)[0] ?? url;
      if (!liveBases.has(base)) continue;
      knownAssets.add(url);
      document.assets.push({
        url,
        kind: "image",
        hash: null,
        alt: null,
        width: null,
        height: null,
      });
      widgetImages += 1;
    }
  }

  return { colors, ambiguous, fonts: addedFonts, body, images: addedImages, widgetImages };
}

function parentMap(root: IrNode): Map<IrNode, IrNode> {
  const parents = new Map<IrNode, IrNode>();
  const visit = (node: IrNode): void => {
    for (const child of node.children) {
      parents.set(child, node);
      visit(child);
    }
  };
  visit(root);
  return parents;
}

// A rich-text heading can carry its words in `innerHtml` instead of a text
// node ("Direkter Kontakt. Faire Preise. Modernestes Webdesign." on
// fluffy-rectangle). Without the stripped markup the subtree key is empty and
// the project heading stays black.
function plainTextOf(node: IrNode): string {
  const content = node.states[0]?.text?.content;
  if (content !== undefined && content.trim() !== "") return content;
  const html = node.innerHtml;
  if (html === undefined || html === null || html === "") return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// The same words, but with the source's explicit line breaks and non-breaking
// spaces. The widget renderer turns the string into a text node; with
// `white-space: pre-wrap` the breaks survive.
function textWithBreaks(node: IrNode): string | null {
  const html = node.innerHtml;
  if (html === undefined || html === null || html === "") return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, "\u00a0")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
  return text === "" ? null : text;
}

function subtreeTextWithBreaks(node: IrNode): string {
  const parts: string[] = [];
  const visit = (entry: IrNode): void => {
    const content = textWithBreaks(entry) ?? plainTextOf(entry);
    if (content !== "") parts.push(content);
    for (const child of entry.children) visit(child);
  };
  visit(node);
  return parts.join(" ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function htmlTextLayoutOf(node: IrNode): Record<string, string> {
  const visual = node.states[0]?.visual ?? {};
  const out: Record<string, string> = {};
  const properties: readonly [string, string][] = [
    ["white-space", "whiteSpace"],
    ["text-wrap", "textWrap"],
    ["word-break", "wordBreak"],
    ["overflow-wrap", "overflowWrap"],
  ];
  for (const [css, property] of properties) {
    const value = visual[css];
    if (
      value !== undefined &&
      value !== "" &&
      value !== "normal" &&
      value !== "initial" &&
      value !== "inherit" &&
      value !== "unset"
    ) {
      out[property] = value;
    }
  }
  return out;
}

function subtreeText(node: IrNode): string {
  const parts: string[] = [];
  const visit = (entry: IrNode): void => {
    const content = plainTextOf(entry);
    if (content !== "") parts.push(content);
    for (const child of entry.children) visit(child);
  };
  visit(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function ancestorText(node: IrNode, parents: ReadonlyMap<IrNode, IrNode>): string | null {
  let parent = parents.get(node);
  while (parent !== undefined) {
    const text = subtreeText(parent);
    if (text.length >= 20 && text.length <= 2000) return text;
    parent = parents.get(parent);
  }
  return null;
}

// The project card writes `5/31/26`, the published card `31.05.26`; the card
// title (the domain) is the part both share. Matching by the whole card text
// would paint nothing, matching by position would paint the wrong card
// (the page has four, the XML two expanded).
function domainsOf(text: string): string[] {
  return [
    ...new Set(
      (text.match(/[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+/g) ?? []).filter(
        (entry) => !entry.includes("@"),
      ),
    ),
  ];
}

function imageSourcesFromHtml(
  root: IrNode | undefined,
): Map<string, Map<string, { url: string; alt: string | null }>> {
  const images = new Map<string, Map<string, { url: string; alt: string | null }>>();
  if (root === undefined) return images;
  const parents = parentMap(root);
  walk(root, (node) => {
    if (node.kind !== "image" || (node.assetUrl ?? "") === "") return;
    const key = ancestorText(node, parents);
    if (key === null) return;
    const url = node.assetUrl as string;
    for (const domain of domainsOf(key)) {
      const entries = images.get(domain) ?? new Map<string, { url: string; alt: string | null }>();
      // The SSR copies repeat the same URL; key by URL so two copies of one
      // picture do not look like an ambiguity.
      entries.set(url, { url, alt: node.alt ?? null });
      images.set(domain, entries);
    }
  });
  return images;
}
