import type { SemanticRef, SpringSpec, Theme } from "./schema.ts";
import { parseColor } from "./color.ts";
import {
  applyAlpha,
  buildColorScale,
  buildRadius,
  buildShadow,
  buildSpacing,
  buildTypeScale,
  springToLinear,
  type TypeScale,
} from "./scales.ts";

export type ThemeIssue = {
  path: string;
  message: string;
  suggestion?: string;
};

export type GeneratedPrimitives = {
  color: Record<string, string>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  type: TypeScale;
};

export function buildGeneratedPrimitives(theme: Theme): GeneratedPrimitives {
  const brand = theme.scales.brand;
  const brandScale = buildColorScale(brand);
  const neutralScale = buildColorScale(theme.scales.neutralBase ?? "#6f6a63");
  const color: Record<string, string> = { brand };
  for (const [step, value] of Object.entries(brandScale)) {
    color[`brand-${step}`] = value;
  }
  for (const [step, value] of Object.entries(neutralScale)) {
    color[`neutral-${step}`] = value;
  }
  return {
    color,
    spacing: buildSpacing(theme.scales.spacingBase ?? 4),
    radius: { ...buildRadius(theme.scales.radiusBase ?? "0.5rem") },
    shadow: {
      ...buildShadow(theme.scales.shadowTint ?? "#1a1a1a"),
    },
    type: buildTypeScale(theme.scales.typeBase ?? 16, theme.scales.typeRatio ?? 1.25),
  };
}

function lookupPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveRefValue(
  theme: Theme,
  primitives: Record<string, unknown>,
  ref: string,
  seen: string[],
): string | undefined {
  if (seen.includes(ref)) return undefined;
  const next = [...seen, ref];
  // The default view is the light mode: emitCss writes `--<role>` from
  // `tokens.modes.light`, so resolving a role name must prefer that concrete
  // mode over the abstract `tokens.semantic` base. Otherwise a role the site
  // overrode for light (e.g. `accent-ink`) would resolve to the neutral
  // default and disagree with the delivered CSS.
  const light = theme.tokens.modes.light[ref];
  if (light) return applySemanticRef(theme, primitives, light, next);
  const semantic = theme.tokens.semantic[ref];
  if (semantic) return applySemanticRef(theme, primitives, semantic, next);
  const dark = theme.tokens.modes.dark?.[ref];
  if (dark) return applySemanticRef(theme, primitives, dark, next);
  const primitive = lookupPath(primitives, ref);
  return typeof primitive === "string" ? primitive : undefined;
}

function applySemanticRef(
  theme: Theme,
  primitives: Record<string, unknown>,
  ref: SemanticRef,
  seen: string[],
): string | undefined {
  const value = resolveRefValue(theme, primitives, ref.$ref, seen);
  if (value === undefined) return undefined;
  if (ref.alpha === undefined) return value;
  try {
    parseColor(value);
  } catch {
    return undefined;
  }
  return applyAlpha(value, ref.alpha);
}

export type ResolvedTheme = {
  primitive: Record<string, unknown>;
  semantic: Record<string, string>;
  modes: {
    light: Record<string, string>;
    dark: Record<string, string> | null;
  };
  fonts: Theme["fonts"];
  motion: {
    ease: Record<string, string>;
    springs: Record<string, SpringSpec>;
    duration: Record<string, string>;
    stagger: Record<string, string>;
  };
  issues: ThemeIssue[];
};

export function resolveTheme(theme: Theme): ResolvedTheme {
  const issues: ThemeIssue[] = [];
  const primitive = deepMergeUnknown(
    buildGeneratedPrimitives(theme) as unknown as Record<string, unknown>,
    (theme.tokens.primitive ?? {}) as Record<string, unknown>,
  ) as Record<string, unknown>;

  const resolveRole = (
    role: string,
    ref: SemanticRef,
    path: string,
  ): string | undefined => {
    const value = applySemanticRef(theme, primitive, ref, []);
    if (value === undefined) {
      issues.push({
        path,
        message: `Token ref "${ref.$ref}" for role "${role}" does not resolve`,
        suggestion: "Point the role at an existing primitive or semantic token.",
      });
    }
    return value;
  };

  const semantic: Record<string, string> = {};
  for (const [role, ref] of Object.entries(theme.tokens.semantic)) {
    const value = resolveRole(role, ref, `tokens.semantic.${role}`);
    if (value !== undefined) semantic[role] = value;
  }
  const light: Record<string, string> = {};
  for (const [role, ref] of Object.entries(theme.tokens.modes.light)) {
    const value = resolveRole(role, ref, `tokens.modes.light.${role}`);
    if (value !== undefined) light[role] = value;
  }
  let dark: Record<string, string> | null = null;
  if (theme.tokens.modes.dark) {
    dark = {};
    for (const [role, ref] of Object.entries(theme.tokens.modes.dark)) {
      const value = resolveRole(role, ref, `tokens.modes.dark.${role}`);
      if (value !== undefined) dark[role] = value;
    }
  }

  const ease: Record<string, string> = {};
  const springs: Record<string, SpringSpec> = {};
  for (const [name, value] of Object.entries(theme.motion.ease)) {
    if (typeof value === "string") {
      ease[name] = value;
    } else {
      ease[name] = springToLinear(value);
      springs[name] = value;
    }
  }

  return {
    primitive,
    semantic,
    modes: { light, dark },
    fonts: theme.fonts,
    motion: {
      ease,
      springs,
      duration: { ...theme.motion.duration },
      stagger: { ...(theme.motion.stagger ?? {}) },
    },
    issues,
  };
}

export function validateTheme(theme: Theme): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  try {
    buildColorScale(theme.scales.brand);
  } catch {
    issues.push({
      path: "scales.brand",
      message: `Scale brand "${theme.scales.brand}" is not a parseable color`,
      suggestion: "Use hex, rgb() or oklch() notation.",
    });
  }
  if (theme.scales.neutralBase !== undefined) {
    try {
      buildColorScale(theme.scales.neutralBase);
    } catch {
      issues.push({
        path: "scales.neutralBase",
        message: `Neutral base "${theme.scales.neutralBase}" is not a parseable color`,
        suggestion: "Use hex, rgb() or oklch() notation.",
      });
    }
  }
  if (theme.scales.shadowTint !== undefined) {
    try {
      buildShadow(theme.scales.shadowTint);
    } catch {
      issues.push({
        path: "scales.shadowTint",
        message: `Shadow tint "${theme.scales.shadowTint}" is not a parseable color`,
        suggestion: "Use hex, rgb() or oklch() notation.",
      });
    }
  }
  if (theme.scales.radiusBase !== undefined) {
    try {
      buildRadius(theme.scales.radiusBase);
    } catch {
      issues.push({
        path: "scales.radiusBase",
        message: `Radius base "${theme.scales.radiusBase}" is not a CSS length`,
        suggestion: 'Use a length like "0.5rem" or "8px".',
      });
    }
  }
  if (issues.length > 0) return issues;
  const resolved = resolveTheme(theme);
  issues.push(...resolved.issues);
  const colors = (resolved.primitive.color ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value !== "string") continue;
    try {
      parseColor(value);
    } catch {
      issues.push({
        path: `tokens.primitive.color.${key}`,
        message: `Primitive color "${key}" is not a parseable color: "${value}"`,
        suggestion: "Use hex, rgb() or oklch() notation.",
      });
    }
  }
  if (Object.keys(theme.motion.ease).length === 0) {
    issues.push({ path: "motion.ease", message: "No easing tokens defined" });
  }
  if (Object.keys(theme.motion.duration).length === 0) {
    issues.push({ path: "motion.duration", message: "No duration tokens defined" });
  }
  const fontSlots: [slot: string, font: Theme["fonts"]["display"]][] = [
    ["display", theme.fonts.display],
    ["body", theme.fonts.body],
  ];
  if (theme.fonts.mono) fontSlots.push(["mono", theme.fonts.mono]);
  for (const [slot, font] of fontSlots) {
    if (font.weights.length === 0) {
      issues.push({
        path: `fonts.${slot}.weights`,
        message: `Font "${font.family}" declares no weights`,
      });
    }
  }
  return issues;
}

export function deepMergeUnknown(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
      continue;
    }
    const current = result[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      result[key] = deepMergeUnknown(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function resolveTokenRef(theme: Theme, ref: string): string | undefined {
  const resolved = resolveTheme(theme);
  const primitive = resolved.primitive as Record<string, unknown>;
  return resolveRefValue(theme, primitive, ref, []);
}
