import type { ResolvedTheme } from "./resolve.ts";
import type { FontRef } from "./schema.ts";

const dash = (value: string): string => value.replace(/\./g, "-");

function quoteFamily(family: string): string {
  return /[\s"']/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
}

export function fontStack(font: FontRef): string {
  return [quoteFamily(font.family), ...font.fallback].join(", ");
}

export function themeVariables(resolved: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  const color = (resolved.primitive.color ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(color)) {
    if (typeof value === "string") vars[`--color-${dash(key)}`] = value;
  }
  const spacing = (resolved.primitive.spacing ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(spacing)) {
    if (typeof value === "string") vars[`--space-${dash(key)}`] = value;
  }
  const radius = (resolved.primitive.radius ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(radius)) {
    if (typeof value === "string") vars[`--radius-${dash(key)}`] = value;
  }
  const shadow = (resolved.primitive.shadow ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(shadow)) {
    if (typeof value === "string") vars[`--shadow-${dash(key)}`] = value;
  }
  const typeScale = (resolved.primitive.type ?? {}) as Record<
    string,
    { size?: unknown; lineHeight?: unknown; letterSpacing?: unknown }
  >;
  for (const [role, spec] of Object.entries(typeScale)) {
    if (typeof spec.size === "string") vars[`--type-${dash(role)}-size`] = spec.size;
    if (typeof spec.lineHeight === "number") {
      vars[`--type-${dash(role)}-line-height`] = String(spec.lineHeight);
    }
    if (typeof spec.letterSpacing === "string") {
      vars[`--type-${dash(role)}-letter-spacing`] = spec.letterSpacing;
    }
  }
  vars["--font-display"] = fontStack(resolved.fonts.display);
  vars["--font-body"] = fontStack(resolved.fonts.body);
  if (resolved.fonts.mono) {
    vars["--font-mono"] = fontStack(resolved.fonts.mono);
  }
  for (const [name, value] of Object.entries(resolved.motion.ease)) {
    vars[`--ease-${dash(name)}`] = value;
  }
  for (const [name, value] of Object.entries(resolved.motion.duration)) {
    vars[`--duration-${dash(name)}`] = value;
  }
  for (const [name, value] of Object.entries(resolved.motion.stagger ?? {})) {
    vars[`--stagger-${dash(name)}`] = value;
  }
  return vars;
}

export function semanticVariables(
  roles: Record<string, string>,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [role, value] of Object.entries(roles)) {
    vars[`--${dash(role)}`] = value;
  }
  return vars;
}

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

function allFonts(resolved: ResolvedTheme): FontRef[] {
  return [
    resolved.fonts.display,
    resolved.fonts.body,
    ...(resolved.fonts.mono ? [resolved.fonts.mono] : []),
  ];
}

function fontFormat(file: string): string {
  const extension = file.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "woff") return "woff";
  if (extension === "ttf") return "truetype";
  if (extension === "otf") return "opentype";
  return "woff2";
}

export function fontFaceBlocks(resolved: ResolvedTheme): string[] {
  const blocks: string[] = [];
  for (const font of allFonts(resolved)) {
    for (const weight of font.weights) {
      const file = font.files?.[String(weight)];
      if (!file) continue;
      blocks.push(
        `@font-face {\n  font-family: ${quoteFamily(font.family)};\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("${file}") format("${fontFormat(file)}");\n}`,
      );
    }
  }
  return blocks;
}

export type FontPreload = {
  href: string;
  family: string;
  weight: number;
  // Consumers must emit <link rel="preload" as="font" type="font/woff2"
  // crossorigin="anonymous"> — fonts require CORS-enabled preloads.
  as: "font";
  crossorigin: "anonymous";
};

export function fontPreloads(resolved: ResolvedTheme): FontPreload[] {
  const preloads: FontPreload[] = [];
  const seen = new Set<string>();
  for (const font of allFonts(resolved)) {
    for (const weight of font.weights) {
      const file = font.files?.[String(weight)];
      if (!file || seen.has(file)) continue;
      seen.add(file);
      preloads.push({ href: file, family: font.family, weight, as: "font", crossorigin: "anonymous" });
    }
  }
  return preloads;
}

export function emitCss(
  resolved: ResolvedTheme,
  options: { selector?: string } = {},
): string {
  const selector = options.selector ?? ":root";
  const parts: string[] = [
    block(selector, {
      ...themeVariables(resolved),
      ...semanticVariables(resolved.modes.light),
    }),
  ];
  if (resolved.modes.dark) {
    parts.push(
      block(`${selector}[data-theme="dark"]`, semanticVariables(resolved.modes.dark)),
    );
  }
  parts.push(...fontFaceBlocks(resolved));
  return `${parts.join("\n\n")}\n`;
}

export function emitTailwindTheme(resolved: ResolvedTheme): string {
  // Every emitted variable is mirrored into its Tailwind v4 namespace so
  // sections can use utilities instead of raw var() references.
  // Namespaces follow Tailwind v4 (--color-*, --font-*, --radius-*,
  // --shadow-*, --ease-*, --duration-*, --spacing-*, --text-*).
  const lines: string[] = [];
  const mirror = (variable: string, prefix: string): void => {
    const name = variable.slice(prefix.length);
    lines.push(`  ${prefix}${name}: var(${variable});`);
  };
  for (const variable of Object.keys(themeVariables(resolved))) {
    if (variable.startsWith("--color-")) mirror(variable, "--color-");
    else if (variable.startsWith("--font-")) mirror(variable, "--font-");
    else if (variable.startsWith("--radius-")) mirror(variable, "--radius-");
    else if (variable.startsWith("--shadow-")) mirror(variable, "--shadow-");
    else if (variable.startsWith("--ease-")) mirror(variable, "--ease-");
    else if (variable.startsWith("--duration-")) mirror(variable, "--duration-");
    else if (variable.startsWith("--space-")) {
      mirror(variable, "--spacing-");
    } else if (
      variable.startsWith("--type-") &&
      variable.endsWith("-size")
    ) {
      const role = variable.slice("--type-".length, -"-size".length);
      lines.push(`  --text-${role}: var(${variable});`);
    }
  }
  for (const role of Object.keys(resolved.modes.light)) {
    const variable = `--${dash(role)}`;
    lines.push(`  --color-${dash(role)}: var(${variable});`);
  }
  lines.sort();
  return `@theme {\n${lines.join("\n")}\n}\n`;
}
