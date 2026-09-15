import { gradeContrast, resolveTokenRef, type Theme } from "@senify/tokens";
import type { PropValue, Registry } from "@senify/section-sdk";
import type { Store } from "./store.ts";

export type ThemeReportLiteral = {
  pageId: string;
  pagePath: string;
  nodeId: string;
  nodeType: string;
  prop: string;
  value: string;
};

export type ThemeReportBrokenRef = {
  pageId: string;
  pagePath: string;
  nodeId: string;
  nodeType: string;
  prop: string;
  ref: string;
};

export type ThemeReportContrast = {
  mode: "light" | "dark";
  foreground: string;
  background: string;
  ratio: number | null;
  aa: boolean | null;
  aaa: boolean | null;
};

export type ThemeReport = {
  siteId: string;
  literals: ThemeReportLiteral[];
  brokenRefs: ThemeReportBrokenRef[];
  contrast: ThemeReportContrast[];
};

const CONTRAST_PAIRS: [foreground: string, background: string][] = [
  ["fg.base", "bg.base"],
  ["fg.muted", "bg.base"],
  ["fg.faint", "bg.base"],
  ["accent", "bg.base"],
  ["fg.inverted", "bg.inverted"],
  ["accent-ink", "accent"],
  ["success", "bg.base"],
  ["warning", "bg.base"],
  ["danger", "bg.base"],
];

function tokenOf(value: PropValue): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const ref = (value as Record<string, unknown>).$token;
  return typeof ref === "string" ? ref : undefined;
}

export async function buildThemeReport(args: {
  store: Store;
  registry: Registry;
  siteId: string;
}): Promise<ThemeReport> {
  const siteTheme = await args.store.getTheme(args.siteId);
  const theme: Theme = siteTheme.theme;
  const pages = await args.store.listPageDrafts(args.siteId);

  const literals: ThemeReportLiteral[] = [];
  const brokenRefs: ThemeReportBrokenRef[] = [];
  for (const page of pages) {
    for (const node of Object.values(page.draft.nodes)) {
      let definition;
      try {
        definition = args.registry.get(node.type);
      } catch {
        continue;
      }
      const colorKeys = new Set(
        [...definition.props, ...(definition.styleProps ?? [])]
          .filter((spec) => spec.control === "color")
          .map((spec) => spec.key),
      );
      // The report covers color controls only: $token refs on other
      // controls (spacing, text) are renderer concerns, not theme gates.
      if (colorKeys.size === 0) continue;
      const sources: [prefix: string, props: Record<string, PropValue> | undefined][] = [
        ["", node.props],
        ["overrides.tablet", node.overrides?.tablet?.props],
        ["overrides.mobile", node.overrides?.mobile?.props],
      ];
      for (const [prefix, props] of sources) {
        if (!props) continue;
        for (const key of colorKeys) {
          const value = props[key];
          if (value === undefined) continue;
          const prop = prefix === "" ? key : `${prefix}.${key}`;
          if (typeof value === "string") {
            literals.push({
              pageId: page.id,
              pagePath: page.path,
              nodeId: node.id,
              nodeType: node.type,
              prop,
              value,
            });
            continue;
          }
          const ref = tokenOf(value);
          if (ref && resolveTokenRef(theme, ref) === undefined) {
            brokenRefs.push({
              pageId: page.id,
              pagePath: page.path,
              nodeId: node.id,
              nodeType: node.type,
              prop,
              ref,
            });
          }
        }
      }
    }
  }

  const contrast: ThemeReportContrast[] = [];
  for (const mode of ["light", "dark"] as const) {
    const modeRoles =
      mode === "light"
        ? siteTheme.theme.tokens.modes.light
        : siteTheme.theme.tokens.modes.dark;
    if (!modeRoles) continue;
    const view: Theme = {
      ...theme,
      tokens: {
        ...theme.tokens,
        semantic: { ...theme.tokens.semantic, ...modeRoles },
      },
    };
    for (const [foreground, background] of CONTRAST_PAIRS) {
      const fgValue = resolveTokenRef(view, foreground);
      const bgValue = resolveTokenRef(view, background);
      if (fgValue === undefined || bgValue === undefined) continue;
      try {
        const grade = gradeContrast(fgValue, bgValue);
        contrast.push({
          mode,
          foreground,
          background,
          ratio: grade.ratio,
          aa: grade.aaNormal,
          aaa: grade.aaaNormal,
        });
      } catch {
        contrast.push({
          mode,
          foreground,
          background,
          ratio: null,
          aa: null,
          aaa: null,
        });
      }
    }
  }

  return { siteId: args.siteId, literals, brokenRefs, contrast };
}
