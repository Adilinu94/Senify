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
  const root = page.pages[0]?.root;
  if (root !== undefined) {
    walk(root, (node) => {
      const content = textOfNode(node);
      const color = colorOfNode(node, tokens);
      if (content === null || color === null) return;
      const colors = colorsByText.get(content) ?? new Set<string>();
      colors.add(color);
      colorsByText.set(content, colors);
    });
  }

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
        text.inline["color"] = [...found][0] as string;
        colors += 1;
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

  return { colors, ambiguous, fonts: addedFonts, body };
}
