import { faqJsonLd } from "@senify/registry/components";
import type { Node, NodeTree, PropValue, SectionDefinition } from "@senify/section-sdk";

export type AeoPageInput = {
  path: string;
  title: string;
  description?: string;
  tree: NodeTree;
};

const SKIP_KEYS = new Set([
  "url",
  "pageId",
  "href",
  "src",
  "assetId",
  "newTab",
  "focal",
  "$token",
  "speed",
  "direction",
  "aspect",
  "dismissible",
  "required",
  "kind",
  "billingToggle",
  "highlighted",
]);

function collectText(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    const text = value.trim();
    if (text !== "" && !/^https?:\/\//.test(text) && text.length < 2000) {
      out.push(text);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectText(entry, out);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$token === "string" || typeof record.assetId === "string") return;
    for (const [key, entry] of Object.entries(record)) {
      if (SKIP_KEYS.has(key)) continue;
      collectText(entry, out);
    }
  }
}

export function nodeTextLines(
  node: Node,
  definitions: Map<string, SectionDefinition>,
): { heading?: string; paragraphs: string[]; bullets: string[] } {
  const definition = definitions.get(node.type);
  const listKeys = new Set(
    (definition?.props ?? [])
      .filter((spec) => spec.control === "list")
      .map((spec) => spec.key),
  );
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  for (const [key, value] of Object.entries(node.props)) {
    if (value === undefined) continue;
    if (listKeys.has(key) && Array.isArray(value)) {
      for (const item of value) {
        const parts: string[] = [];
        collectText(item, parts);
        if (parts.length > 0) bullets.push(parts.join(" — "));
      }
      continue;
    }
    const parts: string[] = [];
    collectText(value as PropValue, parts);
    paragraphs.push(...parts);
  }
  const [heading, ...rest] = paragraphs;
  return { heading, paragraphs: rest, bullets };
}

export function pageToMarkdown(
  page: AeoPageInput,
  definitions: Map<string, SectionDefinition>,
): string {
  const lines: string[] = [`# ${page.title}`, ""];
  if (page.description) {
    lines.push(page.description, "");
  }
  const root = page.tree.nodes[page.tree.rootNodeId];
  for (const id of root?.children ?? []) {
    const node = page.tree.nodes[id];
    if (!node) continue;
    const { heading, paragraphs, bullets } = nodeTextLines(node, definitions);
    if (heading) lines.push(`## ${heading}`, "");
    for (const paragraph of paragraphs) lines.push(paragraph, "");
    for (const bullet of bullets) lines.push(`- ${bullet}`);
    if (bullets.length > 0) lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function mdUrlFor(baseUrl: string, path: string): string {
  return path === "/" ? `${baseUrl}/index.md` : `${baseUrl}${path}.md`;
}

export function buildLlmsTxt(
  siteName: string,
  baseUrl: string,
  pages: { path: string; title: string; description?: string }[],
): string {
  const lines: string[] = [
    `# ${siteName}`,
    "",
    "> Site index for AI agents. Each page has a Markdown twin at the same URL plus `.md`.",
    "",
    "## Pages",
    "",
  ];
  for (const page of pages) {
    const suffix = page.description ? `: ${page.description}` : "";
    lines.push(`- [${page.title}](${mdUrlFor(baseUrl, page.path)})${suffix}`);
  }
  lines.push("");
  return lines.join("\n");
}

// `siteDate` pins the `<lastmod>` date to the build's own date (E2): a
// rollback that restores an earlier release re-bakes with that release's date,
// so the output stays byte-identical instead of carrying "today".
export function buildSitemap(
  baseUrl: string,
  paths: string[],
  siteDate?: string,
): string {
  const today = siteDate ?? new Date().toISOString().slice(0, 10);
  const urls = paths
    .map(
      (path) =>
        `  <url>\n    <loc>${baseUrl}${path}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobots(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

export function collectJsonLd(
  tree: NodeTree,
): { entities: Record<string, unknown>[]; warnings: string[] } {
  const entities: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  for (const node of Object.values(tree.nodes)) {
    if (node.type !== "faq") continue;
    const entity = faqJsonLd({ props: node.props as Record<string, unknown> });
    if (entity) {
      entities.push(entity);
    } else {
      warnings.push(
        `FAQ section "${node.id}" contributes no JSON-LD (empty or invalid items)`,
      );
    }
  }
  return { entities, warnings };
}

export function renderJsonLdScript(entities: Record<string, unknown>[]): string {
  if (entities.length === 0) return "";
  const graph =
    entities.length === 1
      ? entities[0]
      : { "@context": "https://schema.org", "@graph": entities };
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}
