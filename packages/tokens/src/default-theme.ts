import type { Theme } from "./schema.ts";

export function defaultTheme(): Theme {
  return {
    id: "theme-default",
    name: "Standard",
    scales: {
      brand: "#4f46e5",
      neutralBase: "#6f6a63",
      typeBase: 16,
      typeRatio: 1.25,
      spacingBase: 4,
      radiusBase: "0.5rem",
      shadowTint: "#1a1a1a",
    },
    tokens: {
      primitive: {
        color: {
          accent: "#4f46e5",
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
