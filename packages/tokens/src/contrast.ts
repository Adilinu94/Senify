import { parseColor, relativeLuminance } from "./color.ts";

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(parseColor(foreground));
  const bg = relativeLuminance(parseColor(background));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

export type ContrastGrade = {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
};

export function gradeContrast(foreground: string, background: string): ContrastGrade {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}
