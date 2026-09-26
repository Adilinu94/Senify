import { gradeContrast, resolveTokenRef, type Theme } from "@senify/tokens";
import type { Node, NodeTree, PropValue } from "@senify/section-sdk";
import type { CheckIssue, Page, Site, SiteProfile } from "./types.ts";
import type { Store } from "./store.ts";

// Design report (E26 slice 1): the measurable side of "no template slop". The
// score is reproducible - same input, same number - and every finding names its
// place (page, node, field) and a suggestion. The report is a read: it never
// blocks, the gate stages stay in the release checks.

export type DesignDimension = {
  key: string;
  label: string;
  max: number;
  score: number;
  detail: string;
};

export type DesignVerdict = "green" | "hint" | "gate";

export type DesignReport = {
  siteId: string;
  siteName: string;
  profile: SiteProfile;
  // Sum of the dimensions minus the finding penalty (soft 4, hard 10 each).
  score: number;
  verdict: DesignVerdict;
  thresholds: { green: number; gate: number };
  dimensions: DesignDimension[];
  findings: CheckIssue[];
  penalty: number;
  metrics: DesignMetrics;
};

export type DesignMetrics = {
  pages: number;
  sections: number;
  distinctSectionTypes: number;
  maxConsecutiveSameType: number;
  cardShare: number;
  sameVariantShare: number;
  centeredHero: boolean;
  hasCta: boolean;
  hasHeadline: boolean;
  literalColors: string[];
  gradients: number;
  emojiProps: number;
  placeholderProps: number;
  images: number;
  imagesWithAlt: number;
  motionEntries: number;
  dominantPresetShare: number;
  typeBase: number | null;
  typeRatio: number | null;
  spacingBase: number | null;
  fontFamilies: number;
  contrastFailures: number;
};

// Thresholds per profile (E26): showcase is the strictest, clean the mildest.
const THRESHOLDS: Readonly<Record<SiteProfile, { green: number; gate: number }>> = {
  clean: { green: 75, gate: 55 },
  standard: { green: 80, gate: 60 },
  showcase: { green: 85, gate: 65 },
};

function thresholdsFor(profile: SiteProfile): { green: number; gate: number } {
  return THRESHOLDS[profile] ?? { green: 80, gate: 60 };
}

const CARD_TYPES: ReadonlySet<string> = new Set([
  "features",
  "pricing",
  "team",
  "testimonials",
  "projects",
  "gallery",
  "logo-cloud",
]);

const CTA_TYPES: ReadonlySet<string> = new Set(["cta", "contact", "newsletter"]);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const PLACEHOLDER =
  /lorem ipsum|ihr unternehmen|beispieltext|platzhalter|your company|insert text/i;
const COLOR_LITERAL = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\()/i;

function sectionsOf(tree: NodeTree): Node[] {
  const root = tree.nodes[tree.rootNodeId];
  return (root?.children ?? [])
    .map((id) => tree.nodes[id])
    .filter((node): node is Node => node !== undefined && node.hidden !== true);
}

function stringProps(value: PropValue | undefined, visit: (text: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) stringProps(entry, visit);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) stringProps(entry as PropValue, visit);
  }
}

type ImageRef = { hasAlt: boolean };

function collectImages(value: PropValue | undefined, images: ImageRef[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectImages(entry, images);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.assetId === "string") {
    const alt = ["alt", "caption", "title", "name", "author", "text"]
      .map((key) => record[key])
      .find((entry) => typeof entry === "string" && entry.trim() !== "");
    images.push({ hasAlt: alt !== undefined });
  }
  for (const entry of Object.values(record)) {
    collectImages(entry as PropValue, images);
  }
}

function nodeProps(node: Node): Record<string, PropValue> {
  return {
    ...node.props,
    ...(node.overrides?.tablet?.props ?? {}),
    ...(node.overrides?.mobile?.props ?? {}),
  };
}

function consecutiveSame(types: readonly string[]): number {
  let max = 0;
  let current = 0;
  let last = "";
  for (const type of types) {
    current = type === last ? current + 1 : 1;
    last = type;
    max = Math.max(max, current);
  }
  return max;
}

function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100) / 100;
}

function themeNumbers(theme: Theme): {
  typeBase: number | null;
  typeRatio: number | null;
  spacingBase: number | null;
  fontFamilies: number;
} {
  const typeBase = Number.isFinite(theme.scales.typeBase) ? theme.scales.typeBase ?? null : null;
  const typeRatio = Number.isFinite(theme.scales.typeRatio) ? theme.scales.typeRatio ?? null : null;
  const spacingBase = Number.isFinite(theme.scales.spacingBase)
    ? theme.scales.spacingBase ?? null
    : null;
  const families = new Set(
    [
      theme.fonts.display.family,
      theme.fonts.body.family,
      theme.fonts.mono?.family ?? "",
    ]
      .map((family) => family.trim().toLowerCase())
      .filter((family) => family !== ""),
  );
  return { typeBase, typeRatio, spacingBase, fontFamilies: families.size };
}

function contrastFailures(theme: Theme): number {
  const pairs: [string, string][] = [
    ["fg.base", "bg.base"],
    ["fg.inverted", "bg.inverted"],
    ["accent-ink", "accent"],
  ];
  const light = theme.tokens.modes.light;
  const view: Theme = light
    ? {
        ...theme,
        tokens: {
          ...theme.tokens,
          semantic: { ...theme.tokens.semantic, ...light },
        },
      }
    : theme;
  let failures = 0;
  for (const [foreground, background] of pairs) {
    const fg = resolveTokenRef(view, foreground);
    const bg = resolveTokenRef(view, background);
    if (fg === undefined || bg === undefined) continue;
    try {
      if (!gradeContrast(fg, bg).aaNormal) failures += 1;
    } catch {
      // Unparseable roles are reported by the theme report.
    }
  }
  return failures;
}

function collectMetrics(pages: readonly Page[], theme: Theme): DesignMetrics {
  const literalColors = new Set<string>();
  let gradients = 0;
  let emojiProps = 0;
  let placeholderProps = 0;
  const images: ImageRef[] = [];
  const motionPresets: string[] = [];
  let sections = 0;
  let consecutive = 0;
  const types: string[] = [];
  const variants: string[] = [];
  let cardSections = 0;
  let centeredHero = false;
  let hasCta = false;
  let hasHeadline = false;

  for (const page of pages) {
    const pageSections = sectionsOf(page.draft);
    const pageTypes = pageSections.map((node) => node.type);
    sections += pageSections.length;
    types.push(...pageTypes);
    consecutive = Math.max(consecutive, consecutiveSame(pageTypes));
    for (const node of pageSections) {
      if (CARD_TYPES.has(node.type)) cardSections += 1;
      if (CTA_TYPES.has(node.type)) hasCta = true;
      if (node.type === "hero") {
        const headline = node.props["headline"];
        if (typeof headline === "string" && headline.trim() !== "") hasHeadline = true;
        if ((node.variant ?? "").includes("centered")) centeredHero = true;
      }
      variants.push(node.variant ?? "");
      for (const value of Object.values(nodeProps(node))) {
        stringProps(value, (text) => {
          if (COLOR_LITERAL.test(text.trim())) literalColors.add(text.trim().toLowerCase());
          if (text.includes("gradient(")) gradients += 1;
          if (EMOJI.test(text)) emojiProps += 1;
          if (PLACEHOLDER.test(text)) placeholderProps += 1;
        });
        collectImages(value, images);
      }
    }
    for (const node of Object.values(page.draft.nodes)) {
      const motion = node.motion;
      if (motion === undefined || motion.enabled === false) continue;
      motionPresets.push(motion.preset);
    }
  }

  const presetCounts = new Map<string, number>();
  for (const preset of motionPresets) {
    presetCounts.set(preset, (presetCounts.get(preset) ?? 0) + 1);
  }
  const dominant = Math.max(0, ...presetCounts.values());
  const variantCounts = new Map<string, number>();
  for (const variant of variants) {
    variantCounts.set(variant, (variantCounts.get(variant) ?? 0) + 1);
  }
  const dominantVariant = Math.max(0, ...variantCounts.values());
  const numbers = themeNumbers(theme);

  return {
    pages: pages.length,
    sections,
    distinctSectionTypes: new Set(types).size,
    maxConsecutiveSameType: consecutive,
    cardShare: share(cardSections, sections),
    sameVariantShare: share(dominantVariant, variants.length),
    centeredHero,
    hasCta,
    hasHeadline,
    literalColors: [...literalColors].sort(),
    gradients,
    emojiProps,
    placeholderProps,
    images: images.length,
    imagesWithAlt: images.filter((image) => image.hasAlt).length,
    motionEntries: motionPresets.length,
    dominantPresetShare: share(dominant, motionPresets.length),
    typeBase: numbers.typeBase,
    typeRatio: numbers.typeRatio,
    spacingBase: numbers.spacingBase,
    fontFamilies: numbers.fontFamilies,
    contrastFailures: contrastFailures(theme),
  };
}

// The twelve named slop heuristics (S1-S12, verbesserungsplan §11.3). Every
// finding carries the place and a suggestion; the measurements stay visible in
// the metrics block.
function slopFindings(
  metrics: DesignMetrics,
  pages: readonly Page[],
): CheckIssue[] {
  const findings: CheckIssue[] = [];
  const firstPage = pages[0];
  if (metrics.maxConsecutiveSameType > 2) {
    findings.push({
      code: "S1-section-monotony",
      severity: "soft",
      message: `${metrics.maxConsecutiveSameType} sections of the same type in a row`,
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion:
        "Break the run: alternate the archetype (e.g. hero, statement, cards, split, cta).",
    });
  }
  if (metrics.cardShare > 0.6) {
    findings.push({
      code: "S2-card-only",
      severity: "soft",
      message: `${Math.round(metrics.cardShare * 100)}% of the sections are card grids`,
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion:
        "Give at least one section a different container (list, split, editorial, full-bleed media).",
    });
  }
  if (metrics.literalColors.length > 6 || metrics.gradients > 1) {
    findings.push({
      code: "S3-colour-inflation",
      severity: "soft",
      message:
        metrics.literalColors.length > 6
          ? `${metrics.literalColors.length} literal colour values outside the theme`
          : `${metrics.gradients} gradients without a function`,
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      field: "props",
      suggestion:
        "Move colours into theme roles ({ \"$token\": \"…\" }) and keep one gradient at most.",
    });
  }
  if (metrics.fontFamilies > 2) {
    findings.push({
      code: "S4-font-inflation",
      severity: "soft",
      message: `${metrics.fontFamilies} font families in the theme`,
      field: "theme.fonts",
      suggestion: "Two faces (display + body) carry a page; a third needs a system reason.",
    });
  }
  if (metrics.spacingBase !== null && metrics.spacingBase % 4 !== 0) {
    findings.push({
      code: "S5-grid-drift",
      severity: "soft",
      message: `Spacing base ${metrics.spacingBase}px is off the 4/8 grid`,
      field: "theme.scales.spacingBase",
      suggestion: "Use 4 or 8 as the spacing base.",
    });
  }
  if (metrics.typeRatio !== null && metrics.typeRatio < 1.2) {
    findings.push({
      code: "S6-typo-hierarchy",
      severity: "soft",
      message: `Type ratio ${metrics.typeRatio} is too flat for a clear hierarchy`,
      field: "theme.scales.typeRatio",
      suggestion: "Raise the ratio to 1.2-1.5 so headlines read as headlines.",
    });
  }
  if (metrics.sections >= 4 && metrics.sameVariantShare > 0.8) {
    findings.push({
      code: "S7-spacing-uniformity",
      severity: "soft",
      message: "Almost every section uses the same variant",
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion:
        "Vary density and alignment between sections instead of repeating one rhythm.",
    });
  }
  if (metrics.motionEntries >= 4 && metrics.dominantPresetShare > 0.7) {
    findings.push({
      code: "S8-motion-monotony",
      severity: "soft",
      message: `${Math.round(metrics.dominantPresetShare * 100)}% of the motion entries share one preset`,
      suggestion:
        "Give the sections a motion hierarchy (hero leads, content follows) instead of one effect for all.",
    });
  }
  if (metrics.centeredHero && metrics.cardShare > 0.5 && metrics.hasCta && metrics.sections >= 5) {
    findings.push({
      code: "S9-centred-slop",
      severity: "soft",
      message: "Centred hero + card grid + CTA band: the generic landing-page combination",
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion:
        "Break one of the three: an asymmetric hero, a non-card section or a quieter close.",
    });
  }
  if (metrics.emojiProps > 0) {
    findings.push({
      code: "S10-emoji-icons",
      severity: "soft",
      message: `${metrics.emojiProps} prop(s) use emoji as icons`,
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion: "Use the icon set of the registry instead of emoji.",
    });
  }
  if (metrics.placeholderProps > 0) {
    findings.push({
      code: "S11-placeholder-copy",
      severity: "soft",
      message: `${metrics.placeholderProps} prop(s) carry placeholder copy`,
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion: "Write the real sentence or delete the section.",
    });
  }
  const missingAlt = metrics.images - metrics.imagesWithAlt;
  if (missingAlt > 0) {
    findings.push({
      code: "S12-missing-alt",
      severity: "hard",
      message: `${missingAlt} of ${metrics.images} image(s) have no alt text`,
      ...(firstPage === undefined ? {} : { pageId: firstPage.id }),
      suggestion: "Fill alt/caption (or mark the asset decorative in the library).",
    });
  }
  if (metrics.contrastFailures > 0) {
    findings.push({
      code: "S12-contrast",
      severity: "hard",
      message: `${metrics.contrastFailures} primary theme pair(s) fail WCAG AA`,
      field: "theme",
      suggestion: "Adjust the semantic roles or the brand scale.",
    });
  }
  return findings;
}

function clamp(value: number): number {
  return Math.max(0, value);
}

function dimensionsFor(
  metrics: DesignMetrics,
  findings: readonly CheckIssue[],
): DesignDimension[] {
  const has = (code: string): boolean => findings.some((entry) => entry.code === code);
  const typo = clamp(
    15 -
      (metrics.typeBase === null ? 5 : 0) -
      (metrics.typeBase !== null && (metrics.typeBase < 14 || metrics.typeBase > 20) ? 5 : 0) -
      (metrics.typeRatio === null ? 5 : 0) -
      (metrics.typeRatio !== null && (metrics.typeRatio < 1.15 || metrics.typeRatio > 1.5)
        ? 5
        : 0),
  );
  const spacing = clamp(
    15 -
      (metrics.spacingBase === null ? 5 : 0) -
      (metrics.spacingBase !== null && metrics.spacingBase % 4 !== 0 ? 5 : 0) -
      (metrics.sections < 3 ? 5 : 0) -
      (has("S7-spacing-uniformity") ? 5 : 0),
  );
  const colorPenalty =
    metrics.literalColors.length === 0
      ? 0
      : metrics.literalColors.length <= 2
        ? 3
        : metrics.literalColors.length <= 6
          ? 7
          : 12;
  const color = clamp(15 - colorPenalty - (metrics.gradients > 1 ? 3 : 0));
  const hierarchy = clamp(
    15 -
      (metrics.hasHeadline ? 0 : 5) -
      (metrics.hasCta ? 0 : 5) -
      (metrics.sections === 0 ? 5 : 0),
  );
  const variance = clamp(
    15 -
      (has("S1-section-monotony") ? 6 : 0) -
      (has("S2-card-only") ? 6 : 0) -
      (has("S9-centred-slop") ? 3 : 0),
  );
  const assetScore =
    metrics.images === 0
      ? 5
      : Math.round(10 * (metrics.imagesWithAlt / metrics.images));
  const motion = clamp(10 - (has("S8-motion-monotony") ? 5 : 0));
  const a11y = clamp(5 - (metrics.contrastFailures > 0 ? 5 : 0));
  return [
    { key: "typo", label: "Typo-Skala", max: 15, score: typo, detail: `typeBase ${metrics.typeBase ?? "–"}, ratio ${metrics.typeRatio ?? "–"}` },
    { key: "spacing", label: "Spacing-Rhythmus", max: 15, score: spacing, detail: `spacingBase ${metrics.spacingBase ?? "–"}, ${metrics.sections} Sektionen` },
    { key: "color", label: "Farb-Disziplin", max: 15, score: color, detail: `${metrics.literalColors.length} Literale, ${metrics.gradients} Verläufe` },
    { key: "hierarchy", label: "Hierarchie", max: 15, score: hierarchy, detail: `Headline ${metrics.hasHeadline ? "ja" : "nein"}, CTA ${metrics.hasCta ? "ja" : "nein"}` },
    { key: "variance", label: "Sektions-Varianz", max: 15, score: variance, detail: `${metrics.distinctSectionTypes} Typen, Kartenanteil ${Math.round(metrics.cardShare * 100)}%` },
    { key: "assets", label: "Asset-Behandlung", max: 10, score: assetScore, detail: `${metrics.imagesWithAlt}/${metrics.images} Bilder mit Alt` },
    { key: "motion", label: "Motion-Kohärenz", max: 10, score: motion, detail: `${metrics.motionEntries} Einträge, dominant ${Math.round(metrics.dominantPresetShare * 100)}%` },
    { key: "a11y", label: "A11y-Basis", max: 5, score: a11y, detail: `${metrics.contrastFailures} Kontrastfehler` },
  ];
}

export async function buildDesignReport(input: {
  store: Store;
  siteId: string;
}): Promise<DesignReport> {
  const site: Site = await input.store.getSite(input.siteId);
  const siteTheme = await input.store.getTheme(input.siteId);
  const pages = await input.store.listPageDrafts(input.siteId);
  const metrics = collectMetrics(pages, siteTheme.theme);
  const findings = slopFindings(metrics, pages);
  const dimensions = dimensionsFor(metrics, findings);
  // Named findings also cost points directly: a dimension cannot go below zero,
  // so without this the stack (S1 + S2 + S9) would stop at the variance weight.
  const penalty = findings.reduce(
    (sum, finding) => sum + (finding.severity === "hard" ? 10 : 4),
    0,
  );
  const score = clamp(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) - penalty,
  );
  const thresholds = thresholdsFor(site.profile);
  const verdict: DesignVerdict =
    score >= thresholds.green ? "green" : score >= thresholds.gate ? "hint" : "gate";
  return {
    siteId: site.id,
    siteName: site.name,
    profile: site.profile,
    score,
    verdict,
    thresholds,
    dimensions,
    findings,
    penalty,
    metrics,
  };
}

