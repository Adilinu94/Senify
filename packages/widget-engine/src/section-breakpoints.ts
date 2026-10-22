// Die Raster-Schwellen der Registry-Sektionen an das Paar der Site binden.
//
// ADR-0020 hat die Luecke benannt: "Registry-Sektionen folgen dem Paar nicht.
// Ihre Raster brechen bei festen Breiten (zum Beispiel `GRID_IMAGE_SECTIONS`
// bei 640 und 768 px), und `PRIMITIVE_BASE_CSS` ist geraeteunabhaengig."
//
// Die Sektionen benutzen Tailwind-Utilities (`md:grid-cols-3`,
// `sm:grid-cols-2`). Tailwind v4 uebersetzt sie ueber die Theme-Variablen
// `--breakpoint-sm` (40rem = 640 px), `--breakpoint-md` (48rem = 768 px) und
// `--breakpoint-lg` (64rem = 1024 px). Ueberschreibt man diese Variablen im
// `@theme`-Block, brechen die Sektionen an den Schwellen der Site.
//
// **Die Zuordnung.** Die Registry hat drei Stufen und das Paar hat zwei
// Zahlen. Die Abbildung ist deshalb eine Rechnung, keine Uebersetzung:
//
// - `sm:` (640 px) ist die Mobil-Stufe. Das Paar nennt sie `mobile`.
// - `lg:` (1024 px) ist die Tablet-Stufe im Sinne des Paares: die
//   Desktop-Schwelle, ab der die Seite das volle Desktop-Layout zeigt. Das
//   Paar nennt sie `tablet`.
// - `md:` (768 px) ist die Zwischenstufe zwischen beiden. Sie liegt heute
//   genau in der Mitte zwischen Mobil (640) und Tablet (1024).
//
// **Die Rechnung, die daraus folgt.** Die beiden bekannten Punkte des Paars
// (Mobil und Tablet) setzen `sm:` und `lg:`. Die Zwischenstufe `md:` wandert
// mit: sie liegt bei zwei Dritteln zwischen den beiden, also beim
// Standardpaar (1024 / 640) bei 640 + 2/3 * 384 = 896. Das waere NICHT der
// Tailwind-Standard (768) - und damit waere die Zusage aus ADR-0020 ("bestehende
// Projekte bauen byte-gleich wie vorher") gebrochen.
//
// Die ehrliche Rechnung ist deshalb eine andere: die Zwischenstufe BEHALT
// ihren Anteil an der Spanne zwischen den beiden Schwellen. Heute teilt sie
// die Spanne zwischen 640 und 1024 im Verhaeltnis 128 : 256 = 1 : 2 - also
// ein Drittel von unten. Diese Proportion bleibt, wenn sich das Paar
// verschiebt: `md = mobile + (tablet - mobile) / 3`. Beim Standardpaar ergibt
// das 640 + 384/3 = 768 - genau der Tailwind-Standard, und bestehende
// Projekte bauen byte-gleich wie vorher. Bei einem Framer-Paar (1200 / 810)
// ergibt es 810 + 390/3 = 940, und die Stufen liegen 130 px auseinander.
//
// Die Grenzen des Paars (Tablet 641-1600, Mobil 320-900, Abstand >= 120 px)
// tragen die Rechnung: der Abstand zwischen den Schwellen ist gesichert, und
// die Zwischenstufe liegt immer zwischen beiden.
import { resolveBreakpoints, type Breakpoints } from "@senify/widget-engine/breakpoints";

// Der Anteil der Zwischenstufe an der Spanne zwischen den beiden Schwellen.
// Heute teilt `md:` die Spanne zwischen 640 und 1024 im Verhaeltnis 1 : 2
// (128 px zu 256 px) - also ein Drittel von unten.
const ZWISCHENSTUFE_ANTEIL = 1 / 3;

// Die Tailwind-Schwellen, aus dem Paar der Site abgeleitet.
export type SectionBreakpoints = {
  // Tailwinds `sm:` - die Mobil-Stufe.
  sm: number;
  // Tailwinds `md:` - die Zwischenstufe zwischen Mobil und Tablet.
  md: number;
  // Tailwinds `lg:` - die Tablet-Schwelle (die Desktop-Grenze des Paares).
  lg: number;
};

// Die Ableitung: `sm:` ist die Mobil-Schwelle, `lg:` die Tablet-Schwelle,
// und `md:` wandert im gleichen Verhaeltnis mit wie heute. Beim Standardpaar
// (1024 / 640) ergibt das genau die Tailwind-Standards (640 / 768 / 1024).
export function sectionBreakpoints(site?: Breakpoints | null): SectionBreakpoints {
  const pair = resolveBreakpoints(site);
  const spanne = pair.tablet - pair.mobile;
  return {
    sm: pair.mobile,
    md: Math.round(pair.mobile + spanne * ZWISCHENSTUFE_ANTEIL),
    lg: pair.tablet,
  };
}

// Der `@theme`-Block fuer Tailwind. Er ueberschreibt die drei
// Breakpoint-Variablen; alles andere bleibt, wie Tailwind es mitbringt.
//
// Die Werte stehen in `rem`, weil Tailwind die Variablen in `rem` erwartet
// (die Vorgaben sind `40rem`, `48rem`, `64rem`). 1 rem = 16 px entspricht der
// Standard-`html`-Schriftgroesse; die Browser-Standardbreite von Media
// Queries in `rem` bezieht sich auf die Schriftgroesse des Browsers (16 px),
// nicht auf die der Seite - deshalb sind die Zahlen hier exakt die
// Pixelzahlen des Paars, in `rem` umgerechnet.
export function sectionBreakpointTheme(site?: Breakpoints | null): string {
  return sectionBreakpointThemeOf(sectionBreakpoints(site));
}

// Derselbe Block, aber aus den bereits abgeleiteten Schwellen. Der Editor
// kennt die Site-Schwellen (aus dem Paar) und leitet daraus dieselben Werte
// ab - der Weg existiert, damit beide Seiten (Bake und Canvas) aus EINER
// Quelle lesen.
export function sectionBreakpointThemeOf(bp: SectionBreakpoints): string {
  const rem = (px: number): string => `${px / 16}rem`;
  return [
    "@theme {",
    `  --breakpoint-sm: ${rem(bp.sm)};`,
    `  --breakpoint-md: ${rem(bp.md)};`,
    `  --breakpoint-lg: ${rem(bp.lg)};`,
    "}",
    "",
  ].join("\n");
}
