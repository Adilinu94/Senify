import type { DocsPage } from "./model.ts";

export type DocHit = {
  path: string;
  title: string;
  description: string;
  snippet: string;
  score: number;
};

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9äöüß]+/)
        .filter((term) => term.length >= 2),
    ),
  ];
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function snippetFor(body: string, query: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const needle = query.trim().toLowerCase();
  const index = flat.toLowerCase().indexOf(needle);
  if (index === -1) return flat.slice(0, 160);
  const start = Math.max(0, index - 60);
  const end = Math.min(flat.length, index + needle.length + 100);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

// Weighted keyword search over the portal corpus: title beats description
// beats body. Snippets come from the page body around the first query match.
export function searchDocs(pages: DocsPage[], query: string, limit = 8): DocHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits: DocHit[] = [];
  for (const page of pages) {
    const title = page.title.toLowerCase();
    const description = page.description.toLowerCase();
    const body = page.body.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 6;
      if (description.includes(term)) score += 3;
      score += Math.min(countOccurrences(body, term), 5);
    }
    if (score === 0) continue;
    hits.push({
      path: page.path,
      title: page.title,
      description: page.description,
      snippet: snippetFor(page.body, query),
      score,
    });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

// Path lookup for read_docs: tolerant about leading slash and `.md` suffix.
export function readDoc(pages: DocsPage[], path: string): DocsPage | undefined {
  const trimmed = path.trim().replace(/\.md$/i, "").replace(/\/+$/, "");
  const normalized = trimmed === "" ? "/" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return (
    pages.find((page) => page.path === normalized) ??
    pages.find((page) => page.path.toLowerCase() === normalized.toLowerCase())
  );
}
