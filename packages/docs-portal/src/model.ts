// The portal page model: plain markdown pages with one navigation slot.
// Reference pages are generated from the single sources (registry, tool
// catalog, error categories); guides and the changelog stay curated.

export type DocsGroup =
  | "Getting Started"
  | "Platform"
  | "Reference"
  | "Guides"
  | "Changelog";

export type DocsPage = {
  path: string;
  title: string;
  description: string;
  group: DocsGroup;
  order: number;
  body: string;
};

const GROUP_ORDER: Record<DocsGroup, number> = {
  "Getting Started": 0,
  Platform: 1,
  Reference: 2,
  Guides: 3,
  Changelog: 4,
};

// The markdown twin of a page: `<pfad>.md` next to the rendered route.
export function mdPath(page: DocsPage): string {
  return `${page.path}.md`;
}

export function sortPages(pages: DocsPage[]): DocsPage[] {
  return [...pages].sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      a.order - b.order ||
      a.path.localeCompare(b.path),
  );
}
