import { gradeContrast, resolveTokenRef, type Theme } from "@senify/tokens";
import type { PropValue } from "@senify/section-sdk";
import type { AssetUsage, CheckIssue, CheckReport, Page, Site } from "./types.ts";
import { checkForms } from "./forms.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import { walkAssetIds } from "./media.ts";

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

function checkPageAltTexts(
  page: Page,
  assets: ReadonlyMap<string, AssetUsage> | undefined,
): CheckIssue[] {
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
        const assetIds = ["asset", "cover", "photo", "avatar"]
          .map((key) => record[key])
          .filter((value) => isAsset(value))
          .map((value) => (value as { assetId: string }).assetId);
        if (assetIds.length === 0) return;
        // Dekorativ-Ausnahme: assets explicitly marked as decorative do not
        // need alt text (the library flag is the single source for this).
        if (
          assets !== undefined &&
          assetIds.every((assetId) => assets.get(assetId)?.decorative === true)
        ) {
          return;
        }
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
            suggestion: `Fill "${source.altKeys[0]}" with a short description of the image (or mark the asset decorative in the library when it truly is).`,
          });
        }
      });
    }
  }
  return issues;
}

// A reference to a deleted asset is marked "broken", never removed: submit and
// publish stop, the author fixes or restores the asset.
function checkPageAssetRefs(
  page: Page,
  assets: ReadonlyMap<string, AssetUsage> | undefined,
): CheckIssue[] {
  if (assets === undefined) return [];
  const issues: CheckIssue[] = [];
  for (const node of Object.values(page.draft.nodes)) {
    walkAssetIds(node.props, "", (assetId, path) => {
      const usage = assets.get(assetId);
      if (usage?.status === "ready") return;
      const trashed = usage?.status === "trashed";
      issues.push({
        code: "broken-asset",
        severity: "hard",
        message: trashed
          ? `Reference to asset "${assetId}" which sits in the trash`
          : `Reference to asset "${assetId}" which does not exist`,
        pageId: page.id,
        nodeId: node.id,
        field: path === "" ? "asset" : path,
        suggestion: trashed
          ? "Restore the asset from the trash or point the reference at another asset."
          : "Upload the asset in the library (upload_asset) or pick an existing one.",
      });
    });
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
  // Assets of the site; absent ids count as missing. Without the map the
  // asset-related checks stay off (callers that do not load assets).
  assets?: ReadonlyMap<string, AssetUsage>;
  // Existing collection ids of the site: form targets are checked against
  // them (artifacts/26 §7). Without the set the form checks stay off.
  collectionIds?: ReadonlySet<string>;
  // Soft style-adherence hints of the assigned references (T14, artifacts/28
  // §3: "weich" — they never block, they only inform the review).
  referenceAdherence?: CheckIssue[];
}): CheckReport {
  const hard: CheckIssue[] = [];
  const soft: CheckIssue[] = [...(input.referenceAdherence ?? [])];
  const paths = new Set(input.pages.map((page) => page.path));
  const pageIds = new Set(input.pages.map((page) => page.id));

  for (const page of input.pages) {
    for (const violation of hardGuardrailsForTree(page.draft, input.site.profile)) {
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
    hard.push(...checkPageAltTexts(page, input.assets));
    if (input.stage !== "write") {
      hard.push(...checkPageAssetRefs(page, input.assets));
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
    if (input.collectionIds !== undefined) {
      const formIssues = checkForms({
        pages: input.pages,
        pageIds,
        collectionIds: input.collectionIds,
      });
      for (const issue of formIssues) {
        if (issue.severity === "hard") hard.push(issue);
        else soft.push(issue);
      }
    }
  }
  soft.push(...softNotices(input.pages));
  void input.site;
  return { stage: input.stage, hard, soft };
}
