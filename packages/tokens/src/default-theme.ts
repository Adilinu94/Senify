import type { Theme } from "./schema.ts";

// Deep-water brand anchors of the binding design language
// (`.scratch/refs/precious-board/design.md`). The editor chrome
// (`packages/editor/src/ui/tokens.ts`) uses exactly these hexes; the site theme
// derives its brand ramp from the same base, so there is only one brand truth.
//
// The previous default carried indigo `#4f46e5`, which contradicted the design
// language (deep water with lime, no violet). Reverting is a plain value swap:
// set `brand` back to `#4f46e5` and `accent` back to `#4f46e5` (kept below as
// LEGACY_INDIGO for that purpose). Stored sites keep their own theme snapshot,
// so this only moves the default for new pages.
export const LEGACY_INDIGO = "#4f46e5";
// brand-700, "Hauptflaeche der Marke" (design.md, 17 measured uses).
export const DEFAULT_BRAND = "#024364";
// brand-600, "Akzent, Links, Icons" (design.md).
export const DEFAULT_ACCENT = "#006092";
// Deep-water shadow tint, the same value the editor chrome shadows are
// derived from (`rgb(1 18 27)` in `tokens.ts`).
export const DEFAULT_SHADOW_TINT = "#01121b";

export function defaultTheme(): Theme {
  return {
    id: "theme-default",
    name: "Standard",
    scales: {
      brand: DEFAULT_BRAND,
      neutralBase: "#6f6a63",
      typeBase: 16,
      typeRatio: 1.25,
      spacingBase: 4,
      radiusBase: "0.5rem",
      shadowTint: DEFAULT_SHADOW_TINT,
    },
    tokens: {
      primitive: {
        color: {
          accent: DEFAULT_ACCENT,
          success: "#15803d",
          "success-vivid": "#4ade80",
          warning: "#b45309",
          "warning-vivid": "#fbbf24",
          danger: "#dc2626",
          "danger-vivid": "#f87171",
        },
      },
      semantic: {
        "bg.base": { $ref: "color.neutral-50" },
        "bg.muted": { $ref: "color.neutral-100" },
        "bg.inverted": { $ref: "color.neutral-900" },
        "fg.base": { $ref: "color.neutral-900" },
        "fg.muted": { $ref: "color.neutral-600" },
        "fg.faint": { $ref: "color.neutral-500" },
        "fg.inverted": { $ref: "color.neutral-50" },
        accent: { $ref: "color.accent" },
        "accent-ink": { $ref: "color.neutral-50" },
        line: { $ref: "color.neutral-900", alpha: 0.1 },
        success: { $ref: "color.success" },
        warning: { $ref: "color.warning" },
        danger: { $ref: "color.danger" },
      },
      modes: {
        light: {
          "bg.base": { $ref: "color.neutral-50" },
          "bg.muted": { $ref: "color.neutral-100" },
          "bg.inverted": { $ref: "color.neutral-900" },
          "fg.base": { $ref: "color.neutral-900" },
          "fg.muted": { $ref: "color.neutral-600" },
          "fg.faint": { $ref: "color.neutral-500" },
          "fg.inverted": { $ref: "color.neutral-50" },
          accent: { $ref: "color.accent" },
          "accent-ink": { $ref: "color.neutral-50" },
          line: { $ref: "color.neutral-900", alpha: 0.1 },
          success: { $ref: "color.success" },
          warning: { $ref: "color.warning" },
          danger: { $ref: "color.danger" },
        },
        dark: {
          "bg.base": { $ref: "color.neutral-900" },
          "bg.muted": { $ref: "color.neutral-800" },
          "bg.inverted": { $ref: "color.neutral-50" },
          "fg.base": { $ref: "color.neutral-100" },
          "fg.muted": { $ref: "color.neutral-300" },
          "fg.faint": { $ref: "color.neutral-500" },
          "fg.inverted": { $ref: "color.neutral-900" },
          accent: { $ref: "color.brand-300" },
          "accent-ink": { $ref: "color.neutral-900" },
          line: { $ref: "color.neutral-50", alpha: 0.14 },
          success: { $ref: "color.success-vivid" },
          warning: { $ref: "color.warning-vivid" },
          danger: { $ref: "color.danger-vivid" },
        },
      },
    },
    fonts: {
      display: {
        family: "Sora",
        fallback: ["system-ui", "sans-serif"],
        weights: [400, 600, 700],
      },
      body: {
        family: "Inter",
        fallback: ["system-ui", "sans-serif"],
        weights: [400, 500, 600],
      },
    },
    motion: {
      ease: {
        snappy: "cubic-bezier(0.22, 1, 0.36, 1)",
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
        bouncy: { type: "spring", stiffness: 180, damping: 12 },
        "spring-soft": { type: "spring", stiffness: 170, damping: 26 },
      },
      duration: {
        fast: "150ms",
        base: "300ms",
        slow: "600ms",
      },
    },
  };
}
