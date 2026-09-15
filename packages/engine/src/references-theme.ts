import {
  defaultTheme,
  mergeThemePatch,
  ThemeSchema,
  validateTheme,
  type FontRef,
  type ScaleInputs,
  type Theme,
} from "@senify/tokens";
import { SenifyError } from "@senify/core";
import { validateShape } from "./mutations/contract.ts";
import type { ReferenceProfile, ReferenceScale } from "./types.ts";

// Theme derivation (artifacts/07 + 28 §3): the profile feeds the scale engine,
// never raw CSS. The draft stays a proposal until it is written as a theme.

export type ReferenceThemeDraft = {
  // Only the scale inputs that the assigned profiles actually measured.
  scales: Partial<ScaleInputs>;
  fonts: { display?: FontRef; body?: FontRef };
  motion: { ease?: Record<string, string>; duration?: Record<string, string> };
  rationale: { field: string; value: string; source: string; referenceId: string }[];
  sources: Partial<Record<ReferenceScale, string>>;
  families: string[];
  vocabulary: string[];
  styleBrief: string;
};

export type ThemeDraftVerification = {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  issues: string[];
  changes: { field: string; from: string; to: string }[];
};

export type ReferenceAssignmentInput = {
  referenceId: string;
  name: string;
  profile: ReferenceProfile;
  scales: readonly ReferenceScale[];
};

const SIX_DIGIT = /^#[0-9a-f]{6}$/i;

// Default: one reference for everything (artifacts/28 §3). Later scales win
// only if no earlier assignment claims them.
export function deriveThemeDraft(input: {
  assignments: readonly ReferenceAssignmentInput[];
}): ReferenceThemeDraft {
  const scales: Partial<ScaleInputs> = {};
  const fonts: ReferenceThemeDraft["fonts"] = {};
  const motion: { ease: Record<string, string>; duration: Record<string, string> } = {
    ease: {},
    duration: {},
  };
  const rationale: ReferenceThemeDraft["rationale"] = [];
  const sources: Partial<Record<ReferenceScale, string>> = {};
  const families = new Set<string>();
  const vocabulary = new Set<string>();
  const briefs: string[] = [];

  for (const scale of ["color", "type", "motion", "rest"] as const) {
    const assignment = input.assignments.find((candidate) =>
      candidate.scales.includes(scale),
    );
    if (!assignment) continue;
    sources[scale] = assignment.referenceId;
    for (const family of assignment.profile.families) families.add(family);
    for (const term of assignment.profile.vocabulary) vocabulary.add(term);
    briefs.push(assignment.profile.styleBrief);
    if (scale === "color") {
      const brand = pickBrand(assignment.profile);
      scales.brand = brand;
      rationale.push({ field: "scales.brand", value: brand, source: "tokens.color", referenceId: assignment.referenceId });
      const neutral = pickNeutral(assignment.profile);
      if (neutral !== null) {
        scales.neutralBase = neutral;
        rationale.push({ field: "scales.neutralBase", value: neutral, source: "tokens.color", referenceId: assignment.referenceId });
      }
      const tint = pickShadowTint(assignment.profile);
      if (tint !== null) {
        scales.shadowTint = tint;
        rationale.push({ field: "scales.shadowTint", value: tint, source: "tokens.color", referenceId: assignment.referenceId });
      }
    }
    if (scale === "type") {
      const typeBase = pickBodySize(assignment.profile);
      if (typeBase !== null) {
        scales.typeBase = typeBase;
        rationale.push({ field: "scales.typeBase", value: String(typeBase), source: "tokens.type", referenceId: assignment.referenceId });
      }
      const ratio = pickTypeRatio(assignment.profile);
      if (ratio !== null) {
        scales.typeRatio = ratio;
        rationale.push({ field: "scales.typeRatio", value: String(ratio), source: "tokens.type", referenceId: assignment.referenceId });
      }
      const display = fontRef(assignment.profile.tokens.families[0]?.value, "display");
      const body = fontRef(assignment.profile.tokens.families[1]?.value ?? assignment.profile.tokens.families[0]?.value, "body");
      if (display !== null) fonts.display = display;
      if (body !== null) fonts.body = body;
    }
    if (scale === "motion") {
      const ease = pickEasing(assignment.profile);
      if (ease !== null) {
        motion.ease.snappy = ease;
        rationale.push({ field: "motion.ease.snappy", value: ease, source: "motion", referenceId: assignment.referenceId });
      }
      const duration = pickDuration(assignment.profile);
      if (duration !== null) {
        motion.duration.base = duration;
        rationale.push({ field: "motion.duration.base", value: duration, source: "motion", referenceId: assignment.referenceId });
      }
    }
    if (scale === "rest") {
      const spacingBase = pickSpacingBase(assignment.profile);
      if (spacingBase !== null) {
        scales.spacingBase = spacingBase;
        rationale.push({ field: "scales.spacingBase", value: String(spacingBase), source: "tokens.space", referenceId: assignment.referenceId });
      }
      const radiusBase = pickRadiusBase(assignment.profile);
      if (radiusBase !== null) {
        scales.radiusBase = radiusBase;
        rationale.push({ field: "scales.radiusBase", value: radiusBase, source: "tokens.radius", referenceId: assignment.referenceId });
      }
    }
  }

  const draftMotion: ReferenceThemeDraft["motion"] = {};
  if (Object.keys(motion.ease).length > 0) draftMotion.ease = motion.ease;
  if (Object.keys(motion.duration).length > 0) draftMotion.duration = motion.duration;
  return {
    scales,
    fonts,
    motion: draftMotion,
    rationale,
    sources,
    families: [...families],
    vocabulary: [...vocabulary].slice(0, 12),
    styleBrief: briefs.join("\n---\n"),
  };
}

export function materializeThemeDraft(draft: ReferenceThemeDraft, base: Theme): Theme {
  const patch: Record<string, unknown> = {};
  if (Object.keys(draft.scales).length > 0) patch.scales = draft.scales;
  if (Object.keys(draft.fonts).length > 0) patch.fonts = draft.fonts;
  if (Object.keys(draft.motion).length > 0) patch.motion = draft.motion;
  const merged = mergeThemePatch(base, patch);
  merged.id = base.id;
  validateShape(ThemeSchema, merged, "theme draft");
  const issues = validateTheme(merged);
  if (issues.length > 0) {
    const first = issues[0];
    throw new SenifyError(
      "validation",
      `Derived theme is invalid: ${first?.message ?? "value does not resolve"}`,
      {
        field: first?.path ?? "theme",
        suggestion: first?.suggestion ?? "Fix the flagged scale input of the reference.",
      },
    );
  }
  return merged;
}

// Round-trip verification: materialising the draft twice changes nothing, the
// scale inputs survive the merge unchanged, and the theme stays valid.
export function verifyThemeRoundTrip(
  draft: ReferenceThemeDraft,
  base: Theme,
): ThemeDraftVerification {
  const checks: ThemeDraftVerification["checks"] = [];
  const issues: string[] = [];
  const first = materializeThemeDraft(draft, base);
  const second = materializeThemeDraft(draft, first);
  checks.push({
    name: "idempotent",
    ok: JSON.stringify(first) === JSON.stringify(second),
    detail: "Anwenden des Drafts auf das Ergebnis aendert nichts mehr",
  });
  const drift = Object.entries(draft.scales).filter(
    ([key, value]) => first.scales[key as keyof ScaleInputs] !== value,
  );
  checks.push({
    name: "scales-stable",
    ok: drift.length === 0,
    detail:
      drift.length === 0
        ? "Alle Skalen-Eingaben bleiben nach dem Merge unveraendert (kein Round-Trip-Drift)"
        : `Abweichung nach der Skalen-Engine: ${drift.map(([key]) => key).join(", ")}`,
  });
  const themeIssues = validateTheme(first);
  checks.push({
    name: "theme-valid",
    ok: themeIssues.length === 0,
    detail:
      themeIssues.length === 0
        ? "Theme loest vollstaendig auf (Token-Refs, Farben, Fonts, Motion)"
        : themeIssues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
  });
  const changes: ThemeDraftVerification["changes"] = [];
  for (const key of Object.keys(draft.scales) as (keyof ScaleInputs)[]) {
    const from = String(base.scales[key]);
    const to = String(first.scales[key]);
    if (from !== to) changes.push({ field: `scales.${key}`, from, to });
  }
  issues.push(...themeIssues.map((issue) => `${issue.path}: ${issue.message}`));
  return { ok: checks.every((check) => check.ok), checks, issues, changes };
}

// ------------------------------------------------------------- pickers

function pickBrand(profile: ReferenceProfile): string {
  const saturated = profile.tokens.color.find(
    (token) => SIX_DIGIT.test(token.value) && token.role !== "bg" && token.role !== "text",
  );
  const anyHex = profile.tokens.color.find((token) => SIX_DIGIT.test(token.value));
  return saturated?.value ?? anyHex?.value ?? defaultTheme().scales.brand;
}

function pickNeutral(profile: ReferenceProfile): string | null {
  const neutral = profile.tokens.color.find((token) => {
    if (!SIX_DIGIT.test(token.value)) return false;
    const parsed = Number.parseInt(token.value.slice(1), 16);
    const r = (parsed >> 16) & 0xff;
    const g = (parsed >> 8) & 0xff;
    const b = parsed & 0xff;
    return Math.max(r, g, b) - Math.min(r, g, b) < 30;
  });
  return neutral?.value ?? null;
}

function pickShadowTint(profile: ReferenceProfile): string | null {
  const hex = profile.tokens.color
    .filter((token) => SIX_DIGIT.test(token.value))
    .map((token) => ({ value: token.value, luminance: luminance(token.value) }))
    .sort((a, b) => a.luminance - b.luminance);
  return hex[0]?.value ?? null;
}

function luminance(value: string): number {
  const parsed = Number.parseInt(value.slice(1), 16);
  const r = (parsed >> 16) & 0xff;
  const g = (parsed >> 8) & 0xff;
  const b = parsed & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function pickBodySize(profile: ReferenceProfile): number | null {
  const body = profile.tokens.type.find((step) => step.role === "body");
  const chosen = body ?? profile.tokens.type[0];
  if (!chosen) return null;
  const px = Number.parseFloat(chosen.size);
  if (!Number.isFinite(px) || px <= 0) return null;
  return /rem|em$/.test(chosen.size) ? Math.round(px * 16) : Math.round(px);
}

function pickTypeRatio(profile: ReferenceProfile): number | null {
  const sizes = profile.tokens.type
    .map((step) => ({ px: Number.parseFloat(step.size), raw: step.size }))
    .filter((entry) => Number.isFinite(entry.px) && entry.px > 0)
    .map((entry) => (/(rem|em)$/.test(entry.raw) ? entry.px * 16 : entry.px))
    .sort((a, b) => a - b);
  if (sizes.length < 2) return null;
  const smallest = sizes[0] ?? 0;
  const largest = sizes[sizes.length - 1] ?? 0;
  if (smallest <= 0 || largest <= smallest) return null;
  const ratio = (largest / smallest) ** (1 / (sizes.length - 1));
  const clamped = Math.min(1.6, Math.max(1.1, Math.round(ratio * 100) / 100));
  return clamped;
}

function pickSpacingBase(profile: ReferenceProfile): number | null {
  const values = profile.tokens.space
    .map((token) => {
      const match = token.value.match(/^([0-9.]+)(px|rem|em)$/);
      if (!match) return null;
      const raw = Number.parseFloat(match[1] ?? "0");
      const unit = match[2] ?? "px";
      return unit === "px" ? raw : raw * 16;
    })
    .filter((value): value is number => value !== null && value >= 2 && value <= 16);
  if (values.length === 0) return null;
  return Math.round(Math.min(...values));
}

function pickRadiusBase(profile: ReferenceProfile): string | null {
  const token = profile.tokens.radius.find((candidate) => /^[0-9.]+(px|rem|em)$/.test(candidate.value));
  return token?.value ?? null;
}

function fontRef(value: string | undefined, slot: "display" | "body"): FontRef | null {
  if (value === undefined || value.trim() === "") return null;
  const family = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (family === "" || /^(inherit|initial|unset|var\()/.test(family)) return null;
  return {
    family,
    fallback: /serif|georgia|times/i.test(value)
      ? ["Georgia", "serif"]
      : ["system-ui", "sans-serif"],
    weights: slot === "display" ? [400, 600, 700] : [400, 500, 600],
  };
}

function pickEasing(profile: ReferenceProfile): string | null {
  const timings = profile.motion
    .map((recipe) => recipe.params.timing ?? "")
    .filter((timing) => /cubic-bezier\(|^ease|^linear/.test(timing));
  const cubic = timings.find((timing) => timing.startsWith("cubic-bezier("));
  return cubic ?? timings[0] ?? null;
}

function pickDuration(profile: ReferenceProfile): string | null {
  // Frequency principle again: the base duration is the one the site actually
  // uses most often, so a transition that paints 4x outranks a single reveal.
  const weights = new Map<string, number>();
  for (const recipe of profile.motion) {
    const duration = recipe.params.duration ?? "";
    if (!/^[0-9.]+m?s$/.test(duration)) continue;
    weights.set(duration, (weights.get(duration) ?? 0) + Math.max(1, recipe.uses));
  }
  if (weights.size === 0) return null;
  return (
    [...weights.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
  );
}
