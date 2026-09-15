import { mdPath, sortPages, type DocsGroup, type DocsPage } from "./model.ts";

const PORTAL_SUMMARY =
  "Senify-Dokumentation: Plattform, Sektions-Katalog, Tool-Referenz und Fehlercodes für das agent-native Website-System.";

const GROUP_ORDER: DocsGroup[] = [
  "Getting Started",
  "Platform",
  "Reference",
  "Guides",
  "Changelog",
];

// One page as agent-readable markdown: title, summary as blockquote, body.
export function pageMarkdown(page: DocsPage): string {
  return `# ${page.title}\n\n> ${page.description}\n\n${page.body.trimEnd()}\n`;
}

// The llms.txt index: headline, summary, one link list per group. Links point
// at the `.md` twin of every page so agents can fetch the raw text.
export function llmsTxt(pages: DocsPage[]): string {
  const sorted = sortPages(pages);
  const lines: string[] = ["# Senify", "", `> ${PORTAL_SUMMARY}`, ""];
  for (const group of GROUP_ORDER) {
    const groupPages = sorted.filter((page) => page.group === group);
    if (groupPages.length === 0) continue;
    lines.push(`## ${group}`, "");
    for (const page of groupPages) {
      lines.push(`- [${page.title}](${mdPath(page)}): ${page.description}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// The full corpus in one file: every page as markdown, separated by rules.
export function llmsFullTxt(pages: DocsPage[]): string {
  return sortPages(pages)
    .map(pageMarkdown)
    .join("\n---\n\n")
    .trimEnd()
    .concat("\n");
}
