import {
  oklchToCss,
  oklchToRgb,
  parseColor,
  rgbToHex,
  rgbToOklch,
  type Oklch,
} from "./color.ts";
import type { SpringSpec } from "./schema.ts";

export const SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const SHADE_LIGHTNESS = [0.97, 0.93, 0.86, 0.77, 0.67, 0.57, 0.47, 0.38, 0.29, 0.22];
const SHADE_CHROMA = [0.35, 0.55, 0.75, 0.9, 1, 1, 0.95, 0.85, 0.7, 0.5];

export function buildColorScale(base: string): Record<string, string> {
  const { c, h } = rgbToOklch(parseColor(base));
  const scale: Record<string, string> = {};
  SHADE_STEPS.forEach((step, index) => {
    const light = SHADE_LIGHTNESS[index] ?? 0.5;
    const chroma = c * (SHADE_CHROMA[index] ?? 1);
    const shade: Oklch = { l: light, c: chroma, h };
    scale[String(step)] = oklchToCss(shade);
  });
  return scale;
}

export function shadeToHex(shade: string): string {
  return rgbToHex(oklchToRgb(parseOklch(shade)));
}

function parseOklch(input: string): Oklch {
  const match = input.match(/^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)$/);
  if (!match) throw new Error(`Not an oklch() color: "${input}"`);
  return {
    l: Number.parseFloat(match[1] ?? "0"),
    c: Number.parseFloat(match[2] ?? "0"),
    h: Number.parseFloat(match[3] ?? "0"),
  };
}

const toRem = (px: number): string =>
  `${Math.round((px / 16) * 1000) / 1000}rem`;

export function buildFluidSize(
  minPx: number,
  maxPx: number,
  minVw = 390,
  maxVw = 1280,
): string {
  const slope = ((maxPx - minPx) / (maxVw - minVw)) * 100;
  const intercept = minPx - (slope * minVw) / 100;
  const fixed = (value: number): string => `${Math.round(value * 1000) / 1000}`;
  return `clamp(${toRem(minPx)}, ${fixed(slope)}vw + ${toRem(intercept)}, ${toRem(maxPx)})`;
}

export type TypeRole = {
  size: string;
  lineHeight: number;
  letterSpacing: string;
  tag: string;
};

export type TypeScale = {
  display: TypeRole;
  h1: TypeRole;
  h2: TypeRole;
  h3: TypeRole;
  body: TypeRole;
  small: TypeRole;
};

export function buildTypeScale(
  base = 16,
  ratio = 1.25,
): TypeScale {
  const step = (n: number): number => base * ratio ** n;
  const fluid = (px: number): string => buildFluidSize(px * 0.85, px);
  return {
    display: { size: fluid(step(4)), lineHeight: 1.05, letterSpacing: "-0.02em", tag: "div" },
    h1: { size: fluid(step(3)), lineHeight: 1.1, letterSpacing: "-0.015em", tag: "h1" },
    h2: { size: fluid(step(2)), lineHeight: 1.15, letterSpacing: "-0.01em", tag: "h2" },
    h3: { size: fluid(step(1)), lineHeight: 1.25, letterSpacing: "0", tag: "h3" },
    body: { size: fluid(step(0)), lineHeight: 1.6, letterSpacing: "0", tag: "p" },
    small: { size: fluid(step(-1)), lineHeight: 1.5, letterSpacing: "0", tag: "small" },
  };
}

const SPACING_MULTIPLIERS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50];

export function buildSpacing(base = 4): Record<string, string> {
  const scale: Record<string, string> = {};
  for (const multiplier of SPACING_MULTIPLIERS) {
    scale[String(multiplier)] = multiplier === 0 ? "0" : toRem(base * multiplier);
  }
  return scale;
}

function parseLength(input: string): { value: number; unit: string } {
  const match = input.trim().match(/^([0-9.]+)([a-z%]+)$/);
  if (!match) throw new Error(`Invalid CSS length "${input}"`);
  return { value: Number.parseFloat(match[1] ?? "0"), unit: match[2] ?? "px" };
}

export type RadiusScale = {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
};

export function buildRadius(base = "0.5rem"): RadiusScale {
  const { value, unit } = parseLength(base);
  const scaled = (factor: number): string =>
    `${Math.round(value * factor * 1000) / 1000}${unit}`;
  return { sm: scaled(0.5), md: scaled(1), lg: scaled(2), xl: scaled(3), full: "9999px" };
}

export type ShadowScale = { sm: string; md: string; lg: string; xl: string };

function rgba(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

export function buildShadow(tint = "#1a1a1a"): ShadowScale {
  return {
    sm: `0 1px 2px ${rgba(tint, 0.06)}`,
    md: `0 4px 12px -2px ${rgba(tint, 0.12)}, 0 2px 4px -2px ${rgba(tint, 0.08)}`,
    lg: `0 12px 32px -8px ${rgba(tint, 0.18)}, 0 4px 8px -4px ${rgba(tint, 0.1)}`,
    xl: `0 24px 64px -12px ${rgba(tint, 0.25)}, 0 8px 16px -8px ${rgba(tint, 0.12)}`,
  };
}

export function applyAlpha(color: string, alpha: number): string {
  const percent = Math.round(alpha * 1000) / 10;
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export type SpringParams = {
  stiffness: number;
  damping: number;
  mass: number;
};

export function springDurationMs(spring: SpringSpec): number {
  const mass = spring.mass ?? 1;
  const omega = Math.sqrt(spring.stiffness / mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * mass));
  return Math.min(2000, Math.max(300, 4000 / (zeta * omega)));
}

export function springToLinear(
  spring: SpringSpec,
  options: { steps?: number; durationMs?: number } = {},
): string {
  const mass = spring.mass ?? 1;
  const omega = Math.sqrt(spring.stiffness / mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * mass));
  const steps = options.steps ?? 24;
  const durationMs = options.durationMs ?? springDurationMs(spring);
  if (zeta >= 1) {
    return sampleOverdamped(omega, zeta, steps, durationMs);
  }
  const clampedZeta = Math.min(0.99, Math.max(0.05, zeta));
  const omegaD = omega * Math.sqrt(1 - clampedZeta * clampedZeta);
  const stops: string[] = ["0"];
  for (let index = 1; index <= steps; index += 1) {
    const t = (durationMs / 1000) * (index / steps);
    const envelope = Math.exp(-clampedZeta * omega * t);
    const value =
      1 -
      envelope *
        (Math.cos(omegaD * t) +
          ((clampedZeta * omega) / omegaD) * Math.sin(omegaD * t));
    const percent = Math.round((index / steps) * 1000) / 10;
    if (index === steps) {
      stops.push("1");
    } else {
      stops.push(`${Math.round(value * 10000) / 10000} ${percent}%`);
    }
  }
  return `linear(${stops.join(", ")})`;
}

function sampleOverdamped(
  omega: number,
  zeta: number,
  steps: number,
  durationMs: number,
): string {
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega + omega * root;
  const r2 = -zeta * omega - omega * root;
  const stops: string[] = ["0"];
  for (let index = 1; index <= steps; index += 1) {
    const t = (durationMs / 1000) * (index / steps);
    const value =
      1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
    const percent = Math.round((index / steps) * 1000) / 10;
    if (index === steps) {
      stops.push("1");
    } else {
      stops.push(`${Math.round(value * 10000) / 10000} ${percent}%`);
    }
  }
  return `linear(${stops.join(", ")})`;
}
