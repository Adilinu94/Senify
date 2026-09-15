import { gradeContrast, resolveTokenRef, type Theme } from "@senify/tokens";
import type { PropValue } from "@senify/section-sdk";
import type { CheckIssue, CheckReport, Page, Site } from "./types.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";

export type CheckStage = "write" | "submit" | "publish";

// Alt-text sources per section: the field the component uses as alt text.
const ALT_SOURCES: Record<
  string,
  { listKey: string; altKeys: string[]; label: string }[]
> = {
  gallery: [{ listKey: "items", altKeys: ["caption", "alt"], label: "gallery image" }],
  projects: [{ listKey: "items", altKeys: ["title"], label: "project cover" }],
  team: [{ listKey: "members", altKeys: ["name"], label: "team photo" }],
  testimonials: [{ listKey: "items", altKeys: ["author"], label: "avatar" }],
  "logo-cloud": [{ listKey: "logos", altKeys: ["alt"], label: "logo" }],
  marquee: [{ listKey: "items", altKeys: ["text", "alt"], label: "marquee image" }],
  media: [{ listKey: "", altKeys: ["caption"], label: "media asset" }],
};

// Primary reading pairs gate a publish; secondary pairs (muted, faint,
// accent on base) are review hints — they often fail AA by design.
const PRIMARY_CONTRAST_PAIRS: [foreground: string, background: string][] = [
  ["fg.base", "bg.base"],
  ["fg.inverted", "bg.inverted"],
  ["accent-ink", "accent"],
];

const SECONDARY_CONTRAST_PAIRS: [foreground: string, background: string][] = [
  ["fg.muted", "bg.base"],
  ["fg.faint", "bg.base"],
  ["accent", "bg.base"],
];

function isAsset(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { assetId?: unknown }).assetId === "string"
  );
}

function walkLinks(
  value: unknown,
  path: string,
  visit: (link: Record<string, unknown>, path: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walkLinks(entry, `${path}[${index}]`, visit),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.pageId === "string" || typeof record.url === "string") {
    visit(record, path);
    return;
  }
  for (const [key, entry] of Object.entries(record)) {
    walkLinks(entry, path === "" ? key : `${path}.${key}`, visit);
  }
}

function tokenRole(value: PropValue | undefined): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const ref = (value as Record<string, unknown>).$token;
  return typeof ref === "string" ? ref : undefined;
}

function checkPageLinks(page: Page, paths: Set<string>, pageIds: Set<string>): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const node of Object.values(page.draft.nodes)) {
    walkLinks(node.props, `${node.type}.${node.id}`, (link, path) => {
      if (typeof link.pageId === "string" && !pageIds.has(link.pageId)) {
        issues.push({
          code: "broken-link",
          severity: "hard",
          message: `Link to page "${link.pageId}" points at a page that does not exist`,
          pageId: page.id,
          nodeId: node.id,
          field: path,
          suggestion: "Point the link at an existing page or use an external URL.",
        });
      }
      if (
        typeof link.url === "string" &&
        link.url.startsWith("/") &&
        !paths.has(link.url)
      ) {
        issues.push({
          code: "broken-link",
          severity: "hard",
          message: `Internal link "${link.url}" does not match a page path`,
          pageId: page.id,
          nodeId: node.id,
          field: path,
          suggestion: "Use the path of an existing page or an external URL.",
        });
      }
    });
  }
  return issues;
}

function checkPageAltTexts(page: Page): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const node of Object.values(page.draft.nodes)) {
    const sources = ALT_SOURCES[node.type];
    if (!sources) continue;
    for (const source of sources) {
      const items =
        source.listKey === ""
          ? [node.props]
          : Array.isArray(node.props[source.listKey])
            ? (node.props[source.listKey] as Record<string, unknown>[])
            : [];
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const record = item as Record<string, unknown>;
        const hasAsset =
          isAsset(record.asset) ||
          isAsset(record.cover) ||
          isAsset(record.photo) ||
          isAsset(record.avatar) ||
          (source.listKey === "" && isAsset(record.asset));
        if (!hasAsset) return;
        const alt = source.altKeys
          .map((key) => record[key])
          .find((value) => typeof value === "string" && value.trim() !== "");
        if (alt === undefined) {
          issues.push({
            code: "missing-alt-text",
            severity: "hard",
            message: `${source.label} without alt text`,
            pageId: page.id,
            nodeId: node.id,
            field:
              source.listKey === ""
                ? `${source.altKeys[0]}`
                : `${source.listKey}[${index}].${source.altKeys[0]}`,
            suggestion: `Fill "${source.altKeys[0]}" with a short description of the image (or mark it decorative when it truly is).`,
          });
        }
      });
    }
  }
  return issues;
}

function checkPageContrast(page: Page, theme: Theme): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const node of Object.values(page.draft.nodes)) {
    const background = tokenRole(node.props.background);
    const foreground = tokenRole(node.props.textColor);
    if (background === undefined || foreground === undefined) continue;
    const bg = resolveTokenRef(theme, background);
    const fg = resolveTokenRef(theme, foreground);
    if (bg === undefined || fg === undefined) continue;
    try {
      const grade = gradeContrast(fg, bg);
      if (!grade.aaNormal) {
        issues.push({
          code: "contrast",
          severity: "hard",
          message: `Contrast ${grade.ratio.toFixed(2)}:1 between "${foreground}" and "${background}" is below WCAG AA`,
          pageId: page.id,
          nodeId: node.id,
          field: "textColor/background",
          suggestion:
            "Pick a darker foreground or lighter background role from get_theme.",
        });
      }
    } catch {
      // Values that are not parseable colours are caught elsewhere.
    }
  }
  return issues;
}

function checkThemeContrast(
  theme: Theme,
  pairs: [foreground: string, background: string][],
  severity: "hard" | "soft",
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const [foreground, background] of pairs) {
    const fg = resolveTokenRef(theme, foreground);
    const bg = resolveTokenRef(theme, background);
    if (fg === undefined || bg === undefined) continue;
    try {
      const grade = gradeContrast(fg, bg);
      if (!grade.aaNormal) {
        issues.push({
          code: "contrast-tokens",
          severity,
          message: `Theme pair "${foreground}" on "${background}" is ${grade.ratio.toFixed(2)}:1 (below WCAG AA)`,
          field: "theme",
          suggestion: "Adjust the semantic roles or the brand colour scale.",
        });
      }
    } catch {
      // Unresolvable pairs are reported by the theme report.
    }
  }
  return issues;
}

function softNotices(pages: Page[]): CheckIssue[] {
  const soft: CheckIssue[] = [];
  for (const page of pages) {
    if (page.meta.description === undefined || page.meta.description.trim() === "") {
      soft.push({
        code: "missing-description",
        severity: "soft",
        message: "Page has no meta description",
        pageId: page.id,
        field: "meta.description",
        suggestion: "Add a one-sentence description for search results and llms.txt.",
      });
    }
    const nodeCount = Object.keys(page.draft.nodes).length - 1;
    if (nodeCount <= 0) {
      soft.push({
        code: "empty-page",
        severity: "soft",
        message: "Page has no sections yet",
        pageId: page.id,
        suggestion: "Add sections (navbar, hero, content, footer).",
      });
    }
    let literals = 0;
    for (const node of Object.values(page.draft.nodes)) {
      for (const [key, value] of Object.entries(node.props)) {
        if (
          typeof value === "string" &&
          /^(#|rgb\(|hsl\(|oklch\()/.test(value) &&
          key.toLowerCase().includes("color")
        ) {
          literals += 1;
        }
      }
    }
    if (literals > 0) {
      soft.push({
        code: "literal-style-values",
        severity: "soft",
        message: `${literals} literal colour value(s) bypass the theme`,
        pageId: page.id,
        suggestion: "Prefer { \"$token\": \"…\" } references from get_theme.",
      });
    }
  }
  return soft;
}

export function runChecks(input: {
  stage: CheckStage;
  pages: Page[];
  site: Site;
  theme: Theme;
}): CheckReport {
  const hard: CheckIssue[] = [];
  const soft: CheckIssue[] = [];
  const paths = new Set(input.pages.map((page) => page.path));
  const pageIds = new Set(input.pages.map((page) => page.id));

  for (const page of input.pages) {
    for (const violation of hardGuardrailsForTree(page.draft)) {
      hard.push({
        code: violation.code,
        severity: "hard",
        message: violation.message,
        pageId: page.id,
        nodeId: violation.nodeId,
        field: violation.field,
        suggestion: violation.suggestion,
      });
    }
    hard.push(...checkPageLinks(page, paths, pageIds));
    hard.push(...checkPageAltTexts(page));
    if (input.stage !== "write") {
      hard.push(...checkPageContrast(page, input.theme));
    }
  }
  if (input.stage !== "write") {
    soft.push(
      ...checkThemeContrast(input.theme, SECONDARY_CONTRAST_PAIRS, "soft"),
    );
  }
  if (input.stage === "publish") {
    hard.push(
      ...checkThemeContrast(input.theme, PRIMARY_CONTRAST_PAIRS, "hard"),
    );
  }
  soft.push(...softNotices(input.pages));
  void input.site;
  return { stage: input.stage, hard, soft };
}
