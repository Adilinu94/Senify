import type {
  ComputedSampleInput,
  CustomPropertyInput,
  CapturedAssetInput,
  CapturedMotionInput,
  CapturedSurfaceInput,
  SampleKind,
} from "./references-contract.ts";
import { tokenClaim } from "./references-evidence.ts";
import type {
  EvidenceLevel,
  ReferenceAsset,
  ReferenceComponent,
  ReferenceCustomProperty,
  ReferenceEvidence,
  ReferenceMethod,
  ReferenceMotionRecipe,
  ReferenceProfile,
  ReferenceSurface,
  ReferenceToken,
  ReferenceTypeStep,
} from "./types.ts";

// Deterministic extraction (research/29 §2): the frequency principle separates
// the design system from the one-offs, and every value keeps its Belegstellen.
// The markup path is the documented snapshot fallback: it observes CSS and
// markup instead of measuring the runtime, so its evidence stays lower.

const MIN_USES = 2;
// Body/heading steps stay in the scale even below MIN_USES: they are the
// anchors the rest of the scale is read against (research/29 §2.3 "Body-/
// Heading-Ankerwerte"). A type step is already role-based, so every heading and
// the body survive a single occurrence; paragraph/small one-offs still have to
// paint twice.
const TYPE_ANCHOR_ROLES = ["display", "h1", "h2", "h3", "h4", "h5", "h6", "body"];
const TOP_VALUES = 40;
const MAX_WHERE = 3;

// Mirror of the v1 preset catalog (artifacts/03, renderer PAGE_SCRIPT_PRESETS).
const MOTION_PRESET_CATALOG: readonly string[] = [
  "fade-up",
  "fade-up-deblur",
  "masked-headline",
  "stagger-cascade",
  "scroll-reveal",
  "scrub-pin",
  "sticky-stack",
  "horizontal-pan",
  "scroll-progress",
  "counter",
  "marquee",
  "char-split",
  "parallax-subtle",
];

// Common-reveals cheat sheet (research/29 §3) → Senify presets.
const REVEAL_PRESETS: Record<string, string | null> = {
  "reveal-on-scroll": "scroll-reveal",
  "intersection-observer-reveal": "scroll-reveal",
  "fade-up": "fade-up",
  "split-text": "char-split",
  "masked-headline": "masked-headline",
  stagger: "stagger-cascade",
  pin: "scrub-pin",
  "pinned-section": "scrub-pin",
  "sticky-stack": "sticky-stack",
  "horizontal-pan": "horizontal-pan",
  parallax: "parallax-subtle",
  marquee: "marquee",
  counter: "counter",
  "scroll-progress": "scroll-progress",
  "image-sequence": null,
  "smooth-scroll": null,
  "magnetic-button": null,
  "custom-cursor": null,
  grain: null,
  "theme-flip": null,
  "page-transition": null,
};

const GPU_PLATFORMS = ["three", "spline", "unicorn", "rive"];

const IDENTITY_PATTERN = /\b(logo|brand|wordmark|mark)\b/i;

const COMPONENT_CUES: { name: string; pattern: RegExp }[] = [
  { name: "navigation", pattern: /<nav[\s>]|role="navigation"/i },
  { name: "hero", pattern: /class="[^"]*\bhero\b/i },
  { name: "button", pattern: /<button[\s>]|class="[^"]*\bbtn\b/i },
  { name: "card", pattern: /class="[^"]*\bcard\b/i },
  { name: "form", pattern: /<form[\s>]/i },
  { name: "accordion", pattern: /class="[^"]*accordion|<details[\s>]/i },
  { name: "gallery", pattern: /gallery|lightbox/i },
  { name: "slider", pattern: /swiper|splide|embla|flickity|carousel/i },
  { name: "tabs", pattern: /role="tab"|class="[^"]*\btabs?\b/i },
  { name: "testimonial", pattern: /testimonial|blockquote/i },
  { name: "pricing", pattern: /pricing|plan-card/i },
  { name: "footer", pattern: /<footer[\s>]/i },
  { name: "marquee", pattern: /marquee/i },
  { name: "modal", pattern: /role="dialog"|<dialog[\s>]/i },
];

const LIBRARY_CUES: { name: string; pattern: RegExp }[] = [
  { name: "gsap", pattern: /gsap/i },
  { name: "scrolltrigger", pattern: /scrolltrigger/i },
  { name: "lenis", pattern: /lenis/i },
  { name: "locomotive-scroll", pattern: /locomotive/i },
  { name: "three", pattern: /three(\.min)?\.js|three@|\/three\//i },
  { name: "spline", pattern: /spline/i },
  { name: "rive", pattern: /rive/i },
  { name: "lottie", pattern: /lottie/i },
  { name: "swiper", pattern: /swiper/i },
  { name: "splide", pattern: /splide/i },
  { name: "embla", pattern: /embla/i },
  { name: "barba", pattern: /barba/i },
  { name: "swup", pattern: /swup/i },
  { name: "aos", pattern: /aos\.js|data-aos/i },
  { name: "jquery", pattern: /jquery/i },
];

const EXTERNAL_FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "use.typekit.net",
  "fonts.bunny.net",
];

export type CaptureInput = {
  url: string;
  method: ReferenceMethod;
  markup: string;
  computedSamples?: ComputedSampleInput[];
  customProperties?: CustomPropertyInput[];
  breakpoints?: number[];
  motion?: CapturedMotionInput;
  surfaces?: CapturedSurfaceInput[];
  assets?: CapturedAssetInput[];
};

export type MarkupSignals = {
  darkBackground: boolean;
  serifDisplay: boolean;
  monoBody: boolean;
  hasBlur: boolean;
  externalFontHosts: string[];
  fontFamilies: string[];
  images: number;
};

export type ReferenceExtraction = {
  tokens: ReferenceProfile["tokens"];
  breakpoints: number[];
  customProperties: ReferenceCustomProperty[];
  motion: ReferenceMotionRecipe[];
  surfaces: ReferenceSurface[];
  libraries: string[];
  assets: ReferenceAsset[];
  components: ReferenceComponent[];
  gpu: { platforms: string[]; hasLiveCanvas: boolean; lazyWarning: string | null };
  signals: MarkupSignals;
  reduced: boolean;
  evidence: ReferenceEvidence[];
};

type CssDeclaration = { selector: string; property: string; value: string; context: string };

export function extractReference(input: CaptureInput): ReferenceExtraction {
  const reduced = input.method === "snapshot";
  const declarations = parseMarkupStyles(input.markup);
  const samples: ComputedSampleInput[] = [
    ...(input.computedSamples ?? []),
    ...samplesFromDeclarations(declarations),
  ];
  const levelFor = (sample: ComputedSampleInput): EvidenceLevel =>
    sample.source === "markup" ? "observed" : "confirmed";

  const anchors = anchorsFromDeclarations(declarations);
  const colorTokens = rankTokens("color", samples, anchors, levelFor);
  const typeTokens = rankTypeScale(samples);
  const familyTokens = rankTokens("font", samples, anchors, levelFor);
  const spaceTokens = rankTokens("spacing", samples, anchors, levelFor);
  const radiusTokens = rankTokens("radius", samples, anchors, levelFor);
  const shadowTokens = rankTokens("shadow", samples, anchors, levelFor);

  const customProperties = [
    ...(input.customProperties ?? []).map((entry) => ({
      name: entry.name,
      value: entry.value,
      role: entry.role ?? mapCustomPropertyRole(entry.name),
    })),
    ...customPropertiesFromDeclarations(declarations),
  ];
  const dedupedProperties = [
    ...new Map(customProperties.map((entry) => [entry.name, entry])).values(),
  ];

  const libraries = detectLibraries(input.markup, input.motion);
  const surfaces = surfacesFromInput(input.markup, input.surfaces, reduced);
  const gpu = detectGpu(markupHasCanvas(input.markup), surfaces, libraries);
  const motion = motionToRecipes(input.motion, reduced);
  const breakpoints = breakpointsFromInput(input.markup, input.breakpoints);

  const claims: ReferenceEvidence[] = [];
  const tokenGroups: [string, ReferenceToken[]][] = [
    ["color", colorTokens],
    ["font", familyTokens],
    ["space", spaceTokens],
    ["radius", radiusTokens],
    ["shadow", shadowTokens],
  ];
  for (const [kind, tokens] of tokenGroups) {
    for (const token of tokens.slice(0, 5)) {
      claims.push({
        claim: tokenClaim(`${kind}.${token.role ?? "value"}`, token.value),
        level: token.level,
        source: `markup: ${token.where[0] ?? "-"}`,
      });
    }
  }
  for (const step of typeTokens.slice(0, 5)) {
    claims.push({
      claim: tokenClaim(`type.${step.role}`, step.size),
      level: step.level,
      source: `markup: ${step.where[0] ?? "-"}`,
    });
  }
  for (const recipe of motion) {
    claims.push({
      claim: tokenClaim(`motion.${recipe.name}`, recipe.preset ?? "none"),
      level: recipe.level,
      source: `probe: ${recipe.where[0] ?? "-"}`,
    });
  }
  const explicitBreakpoints = input.breakpoints ?? [];
  for (const width of breakpoints) {
    claims.push({
      claim: tokenClaim("breakpoint", `${width}px`),
      level: explicitBreakpoints.includes(width) ? "confirmed" : "observed",
      source: `markup: @media (min-width: ${width}px)`,
    });
  }
  if (gpu.lazyWarning !== null) {
    claims.push({
      claim: tokenClaim("gpu.lazy-platform", gpu.platforms.join("+")),
      level: "observed",
      source: `probe: ${gpu.platforms.join(", ")}`,
    });
  }
  claims.push({
    claim: tokenClaim("reference.reduced", reduced ? "true" : "false"),
    level: "observed",
    source: input.method === "snapshot" ? "snapshot fallback" : "playwright capture",
  });

  return {
    tokens: {
      color: colorTokens,
      type: typeTokens,
      families: familyTokens,
      space: spaceTokens,
      radius: radiusTokens,
      shadow: shadowTokens,
    },
    breakpoints,
    customProperties: dedupedProperties,
    motion,
    surfaces,
    libraries,
    assets: assetsFromInput(input.markup, input.assets),
    components: componentsFromMarkup(input.markup, reduced),
    gpu,
    signals: signalsFromMarkup(input.markup, declarations, samples),
    reduced,
    evidence: claims,
  };
}

// --------------------------------------------------------------- token ranking

function rankTokens(
  kind: SampleKind,
  samples: ComputedSampleInput[],
  anchors: string[],
  levelFor: (sample: ComputedSampleInput) => EvidenceLevel,
): ReferenceToken[] {
  const byValue = new Map<string, ReferenceToken>();
  for (const sample of samples) {
    if (sample.kind !== kind) continue;
    const value = normalizeValue(kind, sample.value);
    if (value === "") continue;
    const where = labelWhere(sample);
    const existing = byValue.get(value);
    if (!existing) {
      byValue.set(value, {
        value,
        uses: 1,
        where: [where],
        role: sample.role ?? null,
        level: levelFor(sample),
      });
      continue;
    }
    existing.uses += 1;
    if (existing.where.length < MAX_WHERE && !existing.where.includes(where)) {
      existing.where.push(where);
    }
    if (existing.role === null && sample.role !== undefined) existing.role = sample.role;
  }
  const kept = [...byValue.values()].filter(
    (token) =>
      token.uses >= MIN_USES ||
      anchors.includes(token.value) ||
      (token.role !== null && anchors.includes(token.role)),
  );
  kept.sort((a, b) => b.uses - a.uses || a.value.localeCompare(b.value));
  return kept.slice(0, TOP_VALUES);
}

function rankTypeScale(samples: ComputedSampleInput[]): ReferenceTypeStep[] {
  const byValue = new Map<string, ReferenceTypeStep>();
  for (const sample of samples) {
    if (sample.kind !== "typeScale") continue;
    const [size = "", lineHeight = "", weight = ""] = sample.value
      .split("/")
      .map((part) => part.trim());
    if (size === "") continue;
    const where = labelWhere(sample);
    const parsedWeight = Number.parseInt(weight, 10);
    const existing = byValue.get(sample.value);
    if (!existing) {
      byValue.set(sample.value, {
        role: sample.role ?? "body",
        size,
        lineHeight: lineHeight === "" ? null : lineHeight,
        weight: Number.isFinite(parsedWeight) ? parsedWeight : null,
        uses: 1,
        where: [where],
        level: sample.source === "markup" ? "observed" : "confirmed",
      });
      continue;
    }
    existing.uses += 1;
    if (existing.where.length < MAX_WHERE && !existing.where.includes(where)) {
      existing.where.push(where);
    }
    if (existing.role === "body" && sample.role !== undefined) existing.role = sample.role;
  }
  const kept = [...byValue.values()].filter(
    (step) => step.uses >= MIN_USES || TYPE_ANCHOR_ROLES.includes(step.role),
  );
  kept.sort((a, b) => parseSize(a.size) - parseSize(b.size));
  return kept.slice(0, 24);
}

function labelWhere(sample: ComputedSampleInput): string {
  return `${sample.breakpoint}:${sample.where}`;
}

function normalizeValue(kind: SampleKind, value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (kind === "color") {
    const literal = collapsed
      .toLowerCase()
      .match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)|oklch\([^)]*\)|hsla?\([^)]*\)/);
    return literal ? literal[0].replace(/\s+/g, " ") : "";
  }
  // Font family names are case-sensitive ("Inter" is not "inter") and are shown
  // in the profile as measured; every other value folds to lowercase so hex/rgb
  // spellings dedupe reliably.
  return kind === "font" ? collapsed : collapsed.toLowerCase();
}

function parseSize(size: string): number {
  const match = size.match(/([0-9.]+)/);
  return match ? Number.parseFloat(match[1] ?? "0") : 0;
}

// ------------------------------------------------------------- markup parsing

function parseMarkupStyles(markup: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];
  for (const block of markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    declarations.push(...parseCssRules(block[1] ?? "", ""));
  }
  for (const match of markup.matchAll(
    /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)style\s*=\s*"([^"]*)"/gi,
  )) {
    const tag = (match[1] ?? "").toLowerCase();
    const attributes = match[2] ?? "";
    const classMatch = attributes.match(/class\s*=\s*"([^"]*)"/i);
    const classes = (classMatch?.[1] ?? "")
      .trim()
      .split(/\s+/)
      .filter((name) => name !== "");
    const selector = classes.length > 0 ? `${tag}.${classes.join(".")}` : tag;
    declarations.push(...splitDeclarations(match[3] ?? "", selector, "inline"));
  }
  return declarations;
}

function matchBrace(input: string, open: number): number {
  let depth = 0;
  for (let index = open; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function mediaWidth(prelude: string): number | null {
  const match = prelude.match(/(?:min|max)-width\s*:\s*([0-9.]+)(px|em|rem)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "px").toLowerCase();
  return Math.round(unit === "px" ? value : value * 16);
}

function parseCssRules(css: string, context: string): CssDeclaration[] {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations: CssDeclaration[] = [];
  let index = 0;
  while (index < cleaned.length) {
    const open = cleaned.indexOf("{", index);
    if (open === -1) break;
    const prelude = cleaned.slice(index, open).trim();
    const close = matchBrace(cleaned, open);
    if (close === -1) break;
    const body = cleaned.slice(open + 1, close);
    if (prelude.startsWith("@")) {
      const name = prelude.slice(1).split(/[\s(]/)[0] ?? "";
      if (name === "media") {
        const width = mediaWidth(prelude);
        declarations.push(...parseCssRules(body, width === null ? context : String(width)));
      } else if (name === "supports" || name === "layer" || name === "scope") {
        declarations.push(...parseCssRules(body, context));
      }
    } else {
      for (const selector of prelude.split(",")) {
        declarations.push(...splitDeclarations(body, selector.trim(), context));
      }
    }
    index = close + 1;
  }
  return declarations;
}

function splitDeclarations(body: string, selector: string, context: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];
  for (const raw of body.split(";")) {
    const separator = raw.indexOf(":");
    if (separator === -1) continue;
    const property = raw.slice(0, separator).trim().toLowerCase();
    const value = raw.slice(separator + 1).trim();
    if (property === "" || value === "" || value.includes("{")) continue;
    declarations.push({ selector, property, value, context });
  }
  return declarations;
}

function samplesFromDeclarations(declarations: CssDeclaration[]): ComputedSampleInput[] {
  const samples: ComputedSampleInput[] = [];
  // Keyed by context+selector: the same selector paints different type values
  // per media query (body 17px vs body 18px @1024) and both are real steps.
  const typeBySelector = new Map<
    string,
    {
      size?: string;
      lineHeight?: string;
      weight?: string;
      selector: string;
      context: string;
    }
  >();
  for (const declaration of declarations) {
    const where =
      declaration.context === ""
        ? declaration.selector
        : `${declaration.selector}@${declaration.context}`;
    const color = declaration.value.match(
      /#[0-9a-f]{3,8}|rgba?\([^)]*\)|oklch\([^)]*\)|hsla?\([^)]*\)/i,
    );
    const push = (kind: SampleKind, role: string, value: string): void => {
      samples.push({
        breakpoint: breakpointName(declaration.context),
        kind,
        role,
        value,
        where,
        source: "markup",
      });
    };
    if (declaration.property === "color" && color) push("color", "text", color[0]);
    else if (
      (declaration.property === "background" ||
        declaration.property === "background-color") &&
      color
    ) {
      push("color", "bg", color[0]);
    } else if (declaration.property === "border-color" && color) push("color", "border", color[0]);
    else if (declaration.property === "fill" && color) push("color", "icon", color[0]);
    else if (declaration.property === "font-family") {
      push("font", fontRole(declaration.selector), declaration.value);
    } else if (
      declaration.property === "padding" ||
      declaration.property.startsWith("padding-") ||
      declaration.property === "margin" ||
      declaration.property.startsWith("margin-") ||
      declaration.property === "gap" ||
      declaration.property === "row-gap" ||
      declaration.property === "column-gap"
    ) {
      push("spacing", declaration.property, declaration.value);
    } else if (declaration.property === "border-radius") push("radius", "default", declaration.value);
    else if (declaration.property === "box-shadow") push("shadow", "default", declaration.value);
    else if (
      declaration.property === "backdrop-filter" ||
      declaration.property === "filter"
    ) {
      push("shadow", "blur", declaration.value);
    }
    if (
      declaration.property === "font-size" ||
      declaration.property === "line-height" ||
      declaration.property === "font-weight"
    ) {
      const key = `${declaration.context}|${declaration.selector}`;
      const entry = typeBySelector.get(key) ?? {
        selector: declaration.selector,
        context: declaration.context,
      };
      if (declaration.property === "font-size") entry.size = declaration.value;
      if (declaration.property === "line-height") entry.lineHeight = declaration.value;
      if (declaration.property === "font-weight") entry.weight = declaration.value;
      typeBySelector.set(key, entry);
    }
  }
  for (const entry of typeBySelector.values()) {
    if (entry.size === undefined) continue;
    samples.push({
      breakpoint: breakpointName(entry.context),
      kind: "typeScale",
      role: typeRole(entry.selector),
      value: `${entry.size}/${entry.lineHeight ?? ""}/${entry.weight ?? ""}`,
      where:
        entry.context === ""
          ? entry.selector
          : `${entry.selector}@${entry.context}`,
      source: "markup",
    });
  }
  return samples;
}

function breakpointName(context: string): "desktop" | "tablet" | "mobile" {
  if (context === "") return "desktop";
  const width = Number.parseInt(context, 10);
  if (!Number.isFinite(width)) return "desktop";
  if (width >= 1024) return "desktop";
  if (width >= 700) return "tablet";
  return "mobile";
}

function fontRole(selector: string): string {
  return /\b(h1|h2|h3|h4|h5|h6|display|heading)\b/i.test(selector) ? "display" : "body";
}

function typeRole(selector: string): string {
  const match = selector.match(/\b(h1|h2|h3|h4|h5|h6|small|p|body)\b/i);
  return match ? (match[1] ?? "body").toLowerCase() : "body";
}

// Body/html declarations are anchor values: they stay in the profile even when
// they paint only once (research/29 §2.3 "Body-/Heading-Ankerwerte").
function anchorsFromDeclarations(declarations: CssDeclaration[]): string[] {
  const anchors = new Set<string>();
  for (const declaration of declarations) {
    if (!/\b(html|body)\b/i.test(declaration.selector)) continue;
    const kind: SampleKind = declaration.property === "font-family"
      ? "font"
      : declaration.property.includes("color")
        ? "color"
        : "spacing";
    const value = normalizeValue(kind, declaration.value);
    if (value !== "") anchors.add(value);
  }
  return [...anchors];
}

function mapCustomPropertyRole(name: string): string | null {
  const key = name.toLowerCase();
  if (/(color|colour|bg|background|foreground|fg|text|ink|accent|brand)/.test(key)) return "color";
  if (/(font|type|line-height|leading|tracking)/.test(key)) return "type";
  if (/(space|spacing|gap|pad|margin|gutter)/.test(key)) return "space";
  if (/(radius|round)/.test(key)) return "radius";
  if (/(shadow|elevation)/.test(key)) return "shadow";
  if (/(ease|duration|motion|transition)/.test(key)) return "motion";
  if (/(width|container|breakpoint|screen)/.test(key)) return "container";
  return null;
}

function customPropertiesFromDeclarations(
  declarations: CssDeclaration[],
): ReferenceCustomProperty[] {
  const properties: ReferenceCustomProperty[] = [];
  for (const declaration of declarations) {
    if (!declaration.property.startsWith("--")) continue;
    properties.push({
      name: declaration.property,
      value: declaration.value,
      role: mapCustomPropertyRole(declaration.property),
    });
  }
  return properties;
}

function breakpointsFromInput(markup: string, explicit: number[] | undefined): number[] {
  const widths = new Set<number>(explicit ?? []);
  for (const match of markup.matchAll(
    /@media[^{]*?\((?:min|max)-width\s*:\s*([0-9.]+)(px|em|rem)/gi,
  )) {
    const value = Number.parseFloat(match[1] ?? "0");
    const unit = (match[2] ?? "px").toLowerCase();
    widths.add(Math.round(unit === "px" ? value : value * 16));
  }
  return [...widths].filter((width) => width >= 320 && width <= 3840).sort((a, b) => a - b);
}

// --------------------------------------------------------------------- motion

export function motionToRecipes(
  motion: CapturedMotionInput | undefined,
  reduced: boolean,
): ReferenceMotionRecipe[] {
  const level: EvidenceLevel = reduced ? "observed" : "confirmed";
  const recipes: ReferenceMotionRecipe[] = [];
  for (const reveal of motion?.reveals ?? []) {
    const mapped = REVEAL_PRESETS[reveal.name.toLowerCase()];
    let preset = mapped ?? null;
    let mechanism = reveal.mechanism;
    if (preset !== null && !MOTION_PRESET_CATALOG.includes(preset)) {
      mechanism = `${mechanism} (Preset "${preset}" ausserhalb des v1-Katalogs (03))`;
      preset = null;
    } else if (preset === null) {
      // Recognised reveal without a catalog equivalent (grain, custom cursor,
      // page transitions …) or an unknown one: documented, never forced onto a
      // preset it does not match.
      mechanism = `${mechanism} (Preset ausserhalb des v1-Katalogs (03))`;
    }
    recipes.push({
      name: reveal.name,
      preset,
      trigger: "scroll",
      params: reveal.params ?? {},
      mechanism,
      uses: reveal.uses ?? 1,
      where: reveal.where === undefined ? [] : [reveal.where],
      level,
    });
  }
  for (const trigger of motion?.scrollTriggers ?? []) {
    const params: Record<string, string> = {};
    if (trigger.start !== undefined) params.start = trigger.start;
    if (trigger.end !== undefined) params.end = trigger.end;
    if (trigger.scrub !== undefined) params.scrub = String(trigger.scrub);
    if (trigger.pin === true) params.pin = "true";
    const pinned = trigger.pin === true;
    recipes.push({
      name: pinned ? "pinned-section" : "scrub-reveal",
      preset: pinned ? "scrub-pin" : "scroll-reveal",
      trigger: "scroll",
      params,
      mechanism: `ScrollTrigger(${trigger.trigger})`,
      uses: (trigger.animationTargets ?? []).length || 1,
      where: [trigger.trigger],
      level,
    });
  }
  for (const animation of motion?.animations ?? []) {
    recipes.push({
      name: `keyframes:${animation.name}`,
      preset: null,
      trigger: "load",
      params: { duration: animation.duration, timing: animation.timing },
      mechanism: `CSS @keyframes ${animation.name}`,
      uses: 1,
      where: [animation.where],
      level,
    });
  }
  for (const transition of motion?.transitions ?? []) {
    if ((transition.uses ?? 1) < MIN_USES) continue;
    recipes.push({
      name: `transition:${transition.property}`,
      preset: null,
      trigger: "hover",
      params: { duration: transition.duration, timing: transition.timing },
      mechanism: `CSS transition on ${transition.property}`,
      uses: transition.uses ?? 1,
      where: [transition.where],
      level,
    });
  }
  if (motion?.smoothScroll !== undefined) {
    recipes.push({
      name: `smooth-scroll:${motion.smoothScroll.library}`,
      preset: null,
      trigger: "scroll",
      params: motion.smoothScroll.params ?? {},
      mechanism: `${motion.smoothScroll.library} (Smooth Scroll)`,
      uses: 1,
      where: [],
      level,
    });
  }
  recipes.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  return recipes.slice(0, 40);
}

function detectLibraries(markup: string, motion: CapturedMotionInput | undefined): string[] {
  const libraries = new Set<string>(
    (motion?.libraries ?? []).map((name) => name.toLowerCase()),
  );
  for (const cue of LIBRARY_CUES) {
    if (cue.pattern.test(markup)) libraries.add(cue.name);
  }
  return [...libraries].sort();
}

function markupHasCanvas(markup: string): boolean {
  return /<canvas[\s>]/i.test(markup);
}

function surfacesFromInput(
  markup: string,
  surfaces: CapturedSurfaceInput[] | undefined,
  reduced: boolean,
): ReferenceSurface[] {
  const result: ReferenceSurface[] = (surfaces ?? []).map((surface) => ({
    kind: surface.kind,
    detail: surface.detail,
    level: reduced ? "observed" : "confirmed",
    note: surface.live === true ? "live" : null,
  }));
  if (result.length === 0) {
    if (/<canvas[\s>]/i.test(markup)) {
      result.push({
        kind: "canvas",
        detail: "inline <canvas>",
        level: "inferred",
        note: "Markup-Beleg ohne Runtime-Probe",
      });
    }
    if (/<video[\s>]/i.test(markup)) {
      result.push({
        kind: "video",
        detail: "inline <video>",
        level: "inferred",
        note: "Looping Video kann generativ wirken - re-embed statt nachbauen",
      });
    }
    if (/<svg[^>]*>[\s\S]*?<(animate|animateTransform|animateMotion)/i.test(markup)) {
      result.push({
        kind: "svg",
        detail: "animiertes SVG (SMIL)",
        level: "observed",
        note: "Nicht als Standbild einfrieren",
      });
    }
  }
  return result.slice(0, 40);
}

export function detectGpu(
  markupCanvas: boolean,
  surfaces: ReferenceSurface[],
  libraries: string[],
): { platforms: string[]; hasLiveCanvas: boolean; lazyWarning: string | null } {
  const platforms = libraries.filter((name) => GPU_PLATFORMS.includes(name));
  const hasLiveCanvas =
    markupCanvas ||
    surfaces.some(
      (surface) =>
        (surface.kind === "canvas" ||
          surface.kind === "webgl" ||
          surface.kind === "webgpu") &&
        surface.note === "live",
    );
  if (platforms.length > 0 && !hasLiveCanvas) {
    return {
      platforms,
      hasLiveCanvas: false,
      lazyWarning: `GPU-Plattform (${platforms.join(", ")}) ohne lebende Canvas - likely lazy/interaction-gated: scrollen/interagieren und neu scannen, nicht als reines DOM lesen.`,
    };
  }
  return { platforms, hasLiveCanvas, lazyWarning: null };
}

// --------------------------------------------------------------------- assets

function assetsFromInput(
  markup: string,
  assets: CapturedAssetInput[] | undefined,
): ReferenceAsset[] {
  const result: ReferenceAsset[] = [];
  for (const asset of assets ?? []) {
    result.push({
      kind: asset.kind,
      ref: asset.ref,
      where: asset.where === undefined ? [] : [asset.where],
      identityRisk:
        asset.kind === "logo" || IDENTITY_PATTERN.test(`${asset.ref} ${asset.where ?? ""}`),
    });
  }
  for (const match of markup.matchAll(/<img[^>]*src\s*=\s*"([^"]+)"/gi)) {
    const ref = match[1] ?? "";
    result.push({ kind: "image", ref, where: ["img"], identityRisk: IDENTITY_PATTERN.test(ref) });
  }
  for (const match of markup.matchAll(/url\((['"]?)([^'")]+)\1\)/gi)) {
    const ref = match[2] ?? "";
    if (!/\.(png|jpe?g|webp|avif|svg|gif)/i.test(ref)) continue;
    result.push({ kind: "image", ref, where: ["css"], identityRisk: IDENTITY_PATTERN.test(ref) });
  }
  for (const match of markup.matchAll(
    /<link[^>]*rel\s*=\s*"?(icon|apple-touch-icon)"?[^>]*href\s*=\s*"([^"]+)"/gi,
  )) {
    result.push({
      kind: "icon",
      ref: match[2] ?? "",
      where: ["link[rel=icon]"],
      identityRisk: true,
    });
  }
  for (const match of markup.matchAll(/<video[^>]*src\s*=\s*"([^"]+)"/gi)) {
    result.push({ kind: "video", ref: match[1] ?? "", where: ["video"], identityRisk: false });
  }
  for (const match of markup.matchAll(/@font-face[\s\S]{0,400}?font-family\s*:\s*([^;}]+)/gi)) {
    result.push({
      kind: "font",
      ref: (match[1] ?? "").trim(),
      where: ["@font-face"],
      identityRisk: false,
    });
  }
  return [...new Map(result.map((asset) => [`${asset.kind}:${asset.ref}`, asset])).values()].slice(
    0,
    200,
  );
}

function componentsFromMarkup(markup: string, reduced: boolean): ReferenceComponent[] {
  const evidence: EvidenceLevel = reduced ? "observed" : "inferred";
  const components: ReferenceComponent[] = [];
  for (const cue of COMPONENT_CUES) {
    if (!cue.pattern.test(markup)) continue;
    components.push({ name: cue.name, variants: [], evidence });
  }
  return components;
}

function signalsFromMarkup(
  markup: string,
  declarations: CssDeclaration[],
  samples: ComputedSampleInput[],
): MarkupSignals {
  const bodyBackground = declarations.find(
    (declaration) =>
      /\b(html|body)\b/i.test(declaration.selector) &&
      (declaration.property === "background" || declaration.property === "background-color"),
  );
  const displayFont = declarations.find(
    (declaration) =>
      declaration.property === "font-family" &&
      /h1|h2|display|heading/i.test(declaration.selector),
  );
  const bodyFont = declarations.find(
    (declaration) =>
      declaration.property === "font-family" &&
      !/h1|h2|display|heading/i.test(declaration.selector),
  );
  const fontFamilies = [
    ...new Set(
      declarations
        .filter((declaration) => declaration.property === "font-family")
        .map((declaration) => declaration.value),
    ),
  ];
  return {
    darkBackground: bodyBackground
      ? isDarkColor(bodyBackground.value)
      : bodyBackgroundOf(samples),
    serifDisplay:
      displayFont !== undefined &&
      /serif|georgia|times|garamond|playfair|canela|lora/i.test(displayFont.value),
    monoBody:
      bodyFont !== undefined && /mono|consolas|menlo|courier/i.test(bodyFont.value),
    hasBlur: declarations.some((declaration) => /blur\(/.test(declaration.value)),
    externalFontHosts: EXTERNAL_FONT_HOSTS.filter((host) => markup.includes(host)),
    fontFamilies: fontFamilies.slice(0, 10),
    images: (markup.match(/<img[\s>]/gi) ?? []).length,
  };
}

function bodyBackgroundOf(samples: ComputedSampleInput[]): boolean {
  const token = samples.find((sample) => sample.kind === "color" && sample.role === "bg");
  return token === undefined ? false : isDarkColor(token.value);
}

function isDarkColor(input: string): boolean {
  const match = input.match(/#([0-9a-f]{3}|[0-9a-f]{6})/i);
  if (!match) return false;
  const hex = match[1] ?? "";
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
