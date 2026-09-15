import { marked } from "marked";
import type { DocsPage } from "./model.ts";

export type TocEntry = { id: string; text: string; depth: number };
export type RenderedPage = { html: string; toc: TocEntry[] };

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeEntities(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Markdown to HTML with stable heading ids, plus the "on this page" list.
// Ids are derived from the heading text and de-duplicated per page.
export function renderPage(page: DocsPage): RenderedPage {
  const html = marked.parse(page.body, { async: false });
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();
  const withIds = html.replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (_match, depth: string, inner: string) => {
      const text = stripTags(inner);
      const base = slugifyHeading(text) || "abschnitt";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      toc.push({ id, text, depth: Number.parseInt(depth, 10) });
      return `<h${depth} id="${id}">${inner}</h${depth}>`;
    },
  );
  return { html: withIds, toc };
}