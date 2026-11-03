import type { IrMotionSample } from "./ir.ts";

export type AppearTweenState = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  rotateX: number;
  rotateY: number;
  skewX: number;
  skewY: number;
};

export type AppearTween = {
  from: AppearTweenState;
  to: AppearTweenState;
  durationMs: number;
  delayMs: number;
  easing: [number, number, number, number];
};

export type AppearTweenResult = { ok: true; tween: AppearTween } | { ok: false; reason: string };

const defaults: AppearTweenState = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0 };
const stateKeys = Object.keys(defaults) as (keyof AppearTweenState)[];

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stateOf(value: unknown, allowTransition: boolean): AppearTweenState | null {
  const source = objectOf(value);
  if (source === null) return null;
  if (Object.keys(source).some((key) => !Object.hasOwn(defaults, key) && !(allowTransition && key === "transition"))) return null;
  const result = { ...defaults };
  for (const key of stateKeys) {
    const item = source[key];
    if (item === undefined) continue;
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    if (key === "opacity" && (item < 0 || item > 1)) return null;
    if (key === "scale" && (item < 0 || item > 10)) return null;
    if ((key === "x" || key === "y") && Math.abs(item) > 10000) return null;
    if ((key.startsWith("rotate") || key.startsWith("skew")) && Math.abs(item) > 3600) return null;
    result[key] = item;
  }
  return result;
}

function variantOf(value: unknown): AppearTween | null {
  const variant = objectOf(value);
  const initial = stateOf(variant?.initial, false);
  const animate = objectOf(variant?.animate);
  const to = stateOf(animate, true);
  const transition = objectOf(animate?.transition);
  if (initial === null || to === null || transition === null || transition.type !== "tween") return null;
  if (Object.keys(transition).some((key) => !["type", "duration", "delay", "ease"].includes(key))) return null;
  const { duration, delay, ease } = transition;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 30) return null;
  if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0 || delay > 30) return null;
  if (!Array.isArray(ease) || ease.length !== 4 || !ease.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x1, y1, x2, y2] = ease as [number, number, number, number];
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1 || Math.abs(y1) > 10 || Math.abs(y2) > 10) return null;
  return { from: initial, to, durationMs: duration * 1000, delayMs: delay * 1000, easing: [x1, y1, x2, y2] };
}

// Only accept explicit, identical breakpoint variants. Unknown declarations,
// spring physics and unavailable variant/trigger information remain findings.
export function readAppearTween(sample: IrMotionSample): AppearTweenResult {
  if (sample.library !== "framer" || sample.trigger !== "appear") return { ok: false, reason: "Kein Framer-Appear-Effekt" };
  let raw: unknown;
  try { raw = JSON.parse(sample.raw); } catch { return { ok: false, reason: "Animationsdaten sind kein lesbares JSON" }; }
  const variants = objectOf(objectOf(raw)?.variants);
  if (variants === null || !Object.hasOwn(variants, "default")) return { ok: false, reason: "Standardvariante fehlt" };
  const tween = variantOf(variants.default);
  if (tween === null) return { ok: false, reason: "Transition oder Werte werden nicht unterstützt" };
  for (const [name, value] of Object.entries(variants)) {
    if (name === "default") continue;
    const candidate = variantOf(value);
    if (candidate === null || JSON.stringify(candidate) !== JSON.stringify(tween)) return { ok: false, reason: "Breakpoint-Variante unterscheidet sich oder ist nicht lesbar" };
  }
  return { ok: true, tween };
}
