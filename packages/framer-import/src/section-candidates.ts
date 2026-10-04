// Which parts of an imported page are what a Senify registry section is.
//
// The import rebuilds a page from primitives (frames, text, images), so a
// header becomes a frame with links in it. The registry has finished sections
// for exactly these parts (`navbar`, `footer`, `hero`), with their own props,
// variants and mobile behaviour. This module only RECOGNIZES them and reports
// where they are and what their props would be; it never rewrites the tree: a
// section replaces the source's own look with the design system's, and that
// is the person's decision, not the importer's.
import { createHash } from "node:crypto";
import type { EditorDocument, EditorNode } from "@senify/editor/state";
import type { ImportCandidate } from "./library.ts";

// `inline`: a link inside running text (a sentence that happens to link), not
// an entry of a menu.
type Link = { label: string; url: string; inline?: boolean };

const ANCHOR = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
// Text longer than this around a link is a paragraph, not a menu entry.
const RUNNING_TEXT = 80;
const stripTags = (html: string): string => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// The links inside a subtree, in document order: link and button primitives,
// linked frames and the anchors inside rich text.
function linksIn(document: EditorDocument, node: EditorNode): Link[] {
  const found: Link[] = [];
  const textOf = (current: EditorNode): string => {
    const own = current.props?.["text"] ?? current.props?.["label"];
    if (typeof own === "string" && own.trim() !== "") return own.trim();
    return (current.children ?? [])
      .map((id) => document.nodes[id])
      .filter((child): child is EditorNode => child !== undefined)
      .map(textOf)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const visit = (current: EditorNode): void => {
    const link = current.props?.["link"];
    const url = typeof link === "string" ? link : (link as { url?: unknown } | undefined)?.url;
    if (typeof url === "string" && url !== "") found.push({ label: textOf(current), url });
    const html = current.props?.["html"];
    if (typeof html === "string") {
      const running = stripTags(html).length > RUNNING_TEXT;
      for (const match of html.matchAll(ANCHOR)) {
        found.push({ label: stripTags(match[2] ?? ""), url: match[1] ?? "", ...(running ? { inline: true } : {}) });
      }
    }
    // A linked frame already counted its subtree's label: do not count the
    // same link again through the text inside it.
    if (typeof url === "string" && url !== "") return;
    for (const id of current.children ?? []) {
      const child = document.nodes[id];
      if (child !== undefined) visit(child);
    }
  };
  visit(node);
  return found;
}

const menuLinksIn = (document: EditorDocument, node: EditorNode): Link[] =>
  linksIn(document, node).filter((link) => link.inline !== true && isMenuLabel(link.label));

const semanticOf = (node: EditorNode): string => String(node.props?.["semantic"] ?? "");

function candidate(kind: string, node: EditorNode, pagePath: string, reason: string): ImportCandidate {
  return {
    fingerprint: createHash("sha256").update(`section:${kind}:${pagePath}:${node.id}`).digest("hex").slice(0, 16),
    label: `Registry-Baustein „${kind}"`,
    kind: "section",
    occurrences: [{ nodeId: node.id, pagePath }],
    reason,
  };
}

// A short label is a menu entry; a sentence is body copy that happens to link.
function isMenuLabel(label: string): boolean {
  return label !== "" && label.length <= 28;
}

export function sectionCandidatesOf(document: EditorDocument, pagePath: string): ImportCandidate[] {
  const root = document.nodes[document.rootNodeId];
  if (root === undefined) return [];
  const out: ImportCandidate[] = [];
  const all = Object.values(document.nodes);

  // navbar: a header/nav frame holding the site's menu (≥ 3 menu-like links).
  // The header/nav with the most menu links: a page carries one copy per device
  // and the phone copy often holds the menu in a separate overlay.
  const header = all
    .filter((node) => node.primitive === "frame" && (semanticOf(node) === "header" || semanticOf(node) === "nav"))
    .map((node) => ({ node, count: menuLinksIn(document, node).length }))
    .filter((entry) => entry.count >= 3)
    .sort((a, b) => b.count - a.count)[0]?.node;
  if (header !== undefined) {
    const links = menuLinksIn(document, header);
    out.push(
      candidate(
        "navbar",
        header,
        pagePath,
        `Kopfbereich mit ${links.length} Links entspricht der Section „navbar" (Props: logo, links, ctaLabel, ctaLink, sticky). Nicht automatisch ersetzt: die Section bringt das Aussehen des Design-Systems mit, nicht das der Quelle.`,
      ),
    );
  }

  // footer: a footer frame with ≥ 3 links.
  const footer = all.find((node) => node.primitive === "frame" && semanticOf(node) === "footer" && menuLinksIn(document, node).length >= 3);
  if (footer !== undefined) {
    out.push(
      candidate(
        "footer",
        footer,
        pagePath,
        `Fußbereich mit ${menuLinksIn(document, footer).length} Links entspricht der Section „footer". Nicht automatisch ersetzt.`,
      ),
    );
  }

  // hero: the first level-1 heading, with the frame around it that also holds
  // a button or link.
  const h1 = all.find((node) => node.primitive === "heading" && node.props?.["level"] === "h1");
  if (h1 !== undefined) {
    const parentOf = new Map<string, EditorNode>();
    for (const node of all) for (const id of node.children ?? []) parentOf.set(id, node);
    let frame: EditorNode | undefined = parentOf.get(h1.id);
    while (frame !== undefined && linksIn(document, frame).length === 0 && parentOf.has(frame.id)) frame = parentOf.get(frame.id);
    if (frame !== undefined && frame.id !== document.rootNodeId && linksIn(document, frame).length > 0) {
      out.push(
        candidate("hero", frame, pagePath, `Überschrift der Ebene 1 mit Aktion entspricht der Section „hero". Nicht automatisch ersetzt.`),
      );
    }
  }
  return out;
}
