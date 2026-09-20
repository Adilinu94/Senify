import { describe, expect, it } from "vitest";
import {
  buildColorScale,
  contrastRatio,
  defaultTheme,
  emitCss,
  emitTailwindTheme,
  fontPreloads,
  gradeContrast,
  mergeThemePatch,
  resolveTheme,
  resolveTokenRef,
  shadeToHex,
  validateTheme,
} from "@senify/tokens";

describe("contrast", () => {
  it("anchors black on white at 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  });

  it("grades WCAG levels", () => {
    const grade = gradeContrast("#1a1a1a", "#ffffff");
    expect(grade.aaNormal).toBe(true);
    expect(grade.aaaNormal).toBe(true);
    const weak = gradeContrast("#999999", "#ffffff");
    expect(weak.aaNormal).toBe(false);
  });
});

describe("default theme", () => {
  it("resolves without issues", () => {
    const theme = defaultTheme();
    const resolved = resolveTheme(theme);
    expect(resolved.issues).toEqual([]);
    expect(resolved.modes.dark).not.toBeNull();
    expect(resolved.semantic["fg.base"]).toBeDefined();
    expect(resolved.motion.ease.snappy).toContain("cubic-bezier");
    expect(resolved.motion.ease.bouncy).toMatch(/^linear\(/);
    expect(resolved.motion.springs.bouncy).toEqual({
      type: "spring",
      stiffness: 180,
      damping: 12,
    });
  });

  it("passes structural validation", () => {
    expect(validateTheme(defaultTheme())).toEqual([]);
  });

  it("resolves token refs through semantic and primitive paths", () => {
    const theme = defaultTheme();
    // Default brand moved from indigo #4f46e5 to the deep-water palette
    // (brand-600 #006092, `.scratch/refs/precious-board/design.md`).
    expect(resolveTokenRef(theme, "accent")).toBe("#006092");
    expect(resolveTokenRef(theme, "color.accent")).toBe("#006092");
    expect(resolveTokenRef(theme, "bg.base")).toMatch(/^oklch\(/);
    expect(resolveTokenRef(theme, "nope.missing")).toBeUndefined();
  });

  it("applies alpha refs as color-mix()", () => {
    const theme = defaultTheme();
    expect(resolveTokenRef(theme, "line")).toMatch(/^color-mix\(/);
  });

  it("lets overrides win individually", () => {
    const theme = defaultTheme();
    const patched = mergeThemePatch(theme, {
      tokens: { primitive: { color: { accent: "#ff0000" } } },
    });
    expect(resolveTokenRef(patched, "accent")).toBe("#ff0000");
    expect(resolveTokenRef(patched, "bg.base")).toBe(
      resolveTokenRef(theme, "bg.base"),
    );
  });

  it("flags unresolvable refs", () => {
    const theme = defaultTheme();
    theme.tokens.semantic["broken"] = { $ref: "color.nope" };
    const issues = validateTheme(theme);
    expect(issues.some((issue) => issue.path === "tokens.semantic.broken")).toBe(true);
  });

  it("flags invalid scale inputs with field paths", () => {
    const brand = defaultTheme();
    brand.scales.brand = "not-a-color";
    expect(
      validateTheme(brand).some((issue) => issue.path === "scales.brand"),
    ).toBe(true);

    const radius = defaultTheme();
    radius.scales.radiusBase = "huge";
    expect(
      validateTheme(radius).some((issue) => issue.path === "scales.radiusBase"),
    ).toBe(true);
  });

  it("survives reference cycles without hanging", () => {
    const theme = defaultTheme();
    theme.tokens.semantic["loop-a"] = { $ref: "loop-b" };
    theme.tokens.semantic["loop-b"] = { $ref: "loop-a" };
    const issues = validateTheme(theme);
    expect(
      issues.some((issue) => issue.path === "tokens.semantic.loop-a"),
    ).toBe(true);
    expect(resolveTokenRef(theme, "loop-a")).toBeUndefined();
  });

  it("keeps all shade steps distinct after gamut clipping", () => {
    for (const base of ["#4f46e5", "#dc2626", "#16a34a", "#f59e0b"]) {
      const hexes = Object.values(buildColorScale(base)).map((shade) =>
        shadeToHex(shade),
      );
      expect(new Set(hexes).size, `distinct shades for ${base}`).toBe(10);
    }
  });

  it("supports light-only themes without a dark block", () => {
    const theme = defaultTheme();
    delete theme.tokens.modes.dark;
    const resolved = resolveTheme(theme);
    expect(resolved.modes.dark).toBeNull();
    expect(resolved.issues).toEqual([]);
    const css = emitCss(resolved);
    expect(css).not.toContain('[data-theme="dark"]');
  });
});

describe("merge", () => {
  it("merges nested objects, replaces arrays, deletes nulls", () => {
    const base = defaultTheme();
    const merged = mergeThemePatch(base, {
      scales: { brand: "#000000" },
      tokens: {
        semantic: { accent: { $ref: "color.danger" }, line: null },
        modes: { dark: null },
      },
      motion: { duration: { fast: "100ms" } },
    });
    expect(merged.scales.brand).toBe("#000000");
    expect(merged.tokens.semantic.accent).toEqual({ $ref: "color.danger" });
    expect("line" in merged.tokens.semantic).toBe(false);
    expect(merged.tokens.modes.dark).toBeUndefined();
    expect(merged.motion.duration.fast).toBe("100ms");
    expect(merged.motion.duration.base).toBe("300ms");
  });

  it("rejects non-object patches", () => {
    expect(() => mergeThemePatch(defaultTheme(), [])).toThrow();
    expect(() => mergeThemePatch(defaultTheme(), "x")).toThrow();
  });
});

describe("emitters", () => {
  it("emits variables, dark selector and tailwind mapping", () => {
    const css = emitCss(resolveTheme(defaultTheme()));
    expect(css).toContain(":root {");
    expect(css).toContain("--color-brand-500:");
    expect(css).toContain("--fg-base:");
    expect(css).toContain("--font-display:");
    expect(css).toContain("--space-4:");
    expect(css).toContain("--ease-snappy:");
    expect(css).toContain(':root[data-theme="dark"] {');
    // The default theme ships its webfonts (ticket 17): the release must render
    // the same faces the editor previews.
    expect(css).toContain("@font-face");
    expect(css).toContain("/assets/sora-400.woff2");

    const tailwind = emitTailwindTheme(resolveTheme(defaultTheme()));
    expect(tailwind.startsWith("@theme {")).toBe(true);
    expect(tailwind).toContain("--color-brand-500: var(--color-brand-500);");
    expect(tailwind).toContain("--font-display: var(--font-display);");
    expect(tailwind).toContain("--text-h1: var(--type-h1-size);");
  });

  it("emits font faces and preloads once files exist", () => {
    const theme = defaultTheme();
    // Isolate the one file this test names: the default theme ships its own
    // webfonts, which would otherwise show up in the preload list.
    theme.fonts.display.files = undefined;
    theme.fonts.body.files = { "400": "/fonts/inter-400.woff2" };
    const resolved = resolveTheme(theme);
    const css = emitCss(resolved);
    expect(css).toContain("@font-face");
    expect(css).toContain("font-display: swap;");
    expect(fontPreloads(resolved)).toEqual([
      { href: "/fonts/inter-400.woff2", family: "Inter", weight: 400, as: "font", crossorigin: "anonymous" },
    ]);
  });
});
