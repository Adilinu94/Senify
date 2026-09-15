import type { PropValue } from "@senify/section-sdk";

// Style prop → CSS mapping (T16, artifacts/29). Components apply these
// declarations inline at render time; the renderer emits the same
// declarations for breakpoint overrides.

export function tokenCss(ref: string): string {
  return `var(--${ref.replace(/\./g, "-")})`;
}

export function styleValue(value: PropValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const ref = (value as Record<string, unknown>).$token;
    if (typeof ref === "string") return tokenCss(ref);
  }
  return undefined;
}

export type StyleVarSpec = {
  prop: string;
  css: string;
};

export const SECTION_STYLE_VARS: StyleVarSpec[] = [
  { prop: "background", css: "background" },
  { prop: "textColor", css: "color" },
  { prop: "paddingY", css: "--section-pad-y" },
];

export const PART_STYLE_VARS: Record<string, StyleVarSpec[]> = {
  card: [
    { prop: "cardBackground", css: "--card-bg" },
    { prop: "cardBorderColor", css: "--card-border" },
    { prop: "cardRadius", css: "--card-radius" },
    { prop: "cardShadow", css: "--card-shadow" },
    { prop: "cardPadding", css: "--card-pad" },
  ],
  button: [
    { prop: "buttonBackground", css: "--button-bg" },
    { prop: "buttonTextColor", css: "--button-fg" },
    { prop: "buttonBorderColor", css: "--button-border" },
    { prop: "buttonRadius", css: "--button-radius" },
  ],
  heading: [
    { prop: "headingTextColor", css: "--heading-fg" },
    { prop: "headingSize", css: "--heading-size" },
  ],
  media: [
    { prop: "mediaRadius", css: "--media-radius" },
    { prop: "mediaShadow", css: "--media-shadow" },
  ],
  link: [{ prop: "linkTextColor", css: "--link-fg" }],
};

function varsFor(
  props: Record<string, PropValue>,
  specs: StyleVarSpec[],
  into: Record<string, string>,
): void {
  for (const spec of specs) {
    const value = styleValue(props[spec.prop]);
    if (value !== undefined) into[spec.css] = value;
  }
}

export function sectionVarsFor(
  props: Record<string, PropValue>,
): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  varsFor(props, SECTION_STYLE_VARS, vars);
  return Object.keys(vars).length > 0 ? vars : undefined;
}

export function partVarsFor(
  props: Record<string, PropValue>,
  part: string,
): Record<string, string> | undefined {
  const specs = PART_STYLE_VARS[part];
  if (!specs) return undefined;
  const vars: Record<string, string> = {};
  varsFor(props, specs, vars);
  return Object.keys(vars).length > 0 ? vars : undefined;
}

export function styleVarsFor(
  props: Record<string, PropValue>,
): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  varsFor(props, SECTION_STYLE_VARS, vars);
  for (const specs of Object.values(PART_STYLE_VARS)) {
    varsFor(props, specs, vars);
  }
  return Object.keys(vars).length > 0 ? vars : undefined;
}
