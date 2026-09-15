// sRGB <-> OKLCH conversion (matrices by Björn Ottosson, MIT).
// Needed for perceptually uniform shade scales and contrast checks.

export type Rgb = { r: number; g: number; b: number };
export type Oklch = { l: number; c: number; h: number };

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const clamped = Math.min(1, Math.max(0, c));
  const s =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace(/^#/, "");
  if (/^[0-9a-fA-F]{8}$/.test(clean)) {
    throw new Error(
      `Hex color "${hex}" carries an alpha channel, which Rgb cannot hold — use applyAlpha() or color-mix() for transparency`,
    );
  }
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex color "${hex}"`);
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex(color: Rgb): string {
  const part = (value: number): string =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

export function rgbToOklch(color: Rgb): Oklch {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const L = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b_ = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const C = Math.sqrt(a * a + b_ * b_);
  let H = (Math.atan2(b_, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < 0.0001 ? 0 : H };
}

export function oklchToRgb(color: Oklch): Rgb {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);
  const lRoot = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

export function oklchToCss(color: Oklch): string {
  const round = (value: number, digits: number): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  };
  return `oklch(${round(color.l, 4)} ${round(color.c, 4)} ${round(color.h, 2)})`;
}

export function relativeLuminance(color: Rgb): number {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function parseColor(input: string): Rgb {
  const value = input.trim().toLowerCase();
  if (value.startsWith("#")) return hexToRgb(value);
  const rgbMatch = value.match(
    /^rgba?\(\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)((?:\s*[,/]\s*)([0-9.]+%?)\s*)?\)$/,
  );
  if (rgbMatch) {
    assertOpaque(rgbMatch[5], input);
    const channel = (part: string | undefined): number => {
      const raw = part ?? "0";
      if (raw.endsWith("%")) {
        return Math.round((Number.parseFloat(raw) / 100) * 255);
      }
      return Number.parseFloat(raw);
    };
    return { r: channel(rgbMatch[1]), g: channel(rgbMatch[2]), b: channel(rgbMatch[3]) };
  }
  const oklchMatch = value.match(
    /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)((?:\s*\/\s*)([0-9.]+%?)\s*)?\)$/,
  );
  if (oklchMatch) {
    assertOpaque(oklchMatch[5], input);
    const lRaw = oklchMatch[1] ?? "0";
    const l = lRaw.endsWith("%") ? Number.parseFloat(lRaw) / 100 : Number.parseFloat(lRaw);
    return oklchToRgb({
      l,
      c: Number.parseFloat(oklchMatch[2] ?? "0"),
      h: Number.parseFloat(oklchMatch[3] ?? "0"),
    });
  }
  throw new Error(`Unsupported color format "${input}"`);
}

function assertOpaque(alpha: string | undefined, input: string): void {
  if (alpha !== undefined) {
    throw new Error(
      `Color "${input}" carries an alpha channel, which Rgb cannot hold — use applyAlpha() or color-mix() for transparency`,
    );
  }
}
