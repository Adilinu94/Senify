// Der Farbwaehler: die reine Rechnung, ohne DOM.
//
// Der Inspektor hatte fuer Farben bisher ein Textfeld und eine Palette aus
// Theme-Tokens. Beides ist fuer einen fertigen Editor zu wenig:
//
//   - das Textfeld verlangt, dass man den Wert KENNT ("#4f8cff" tippt niemand
//     aus dem Kopf),
//   - die Palette kennt nur die Tokens des Themes, nicht "etwas heller als
//     dieser Ton".
//
// Was fehlt, ist der Griff: ein Verlauf (Sattigung x Helligkeit) plus ein
// Farbton-Streifen. Diese Datei enthaelt die Rechnung dahinter, damit sie ohne
// Browser pruefbar ist - die DOM-Anbindung sitzt in `inspector.ts`.
//
// Zwei Entscheidungen, die den Unterschied machen:
//
//   1. **HSB, nicht HSL.** Ein Verlauf von links (grau) nach rechts (voll
//      gesaettigt) ist in HSB eine gerade Linie bei gleicher Helligkeit. In
//      HSL aendert sich die wahrgenommene Helligkeit mit der Saettigung, und
//      der Verlauf bekommt einen sichtbaren Bauch. Framer, Figma und Photoshop
//      arbeiten alle in HSB.
//   2. **Rundung nur am Ende.** Wer im Verlauf zieht, rechnet viele Schritte
//      hintereinander. Wird jeder Zwischenschritt auf 8 Bit gerundet, driftet
//      die Farbe sichtbar. Hier wird erst beim Schreiben in Hex gerundet.
//
// Was diese Datei NICHT tut: Alpha. Der Inspektor schreibt Farben als Hex oder
// Token; eine Deckkraft gehoert an die Eigenschaft (`opacity`), nicht in den
// Farbwert. Ein `#rrggbbaa` waere eine zweite Wahrheit fuer dieselbe Sache.

export type Hsb = { h: number; s: number; b: number };
export type Rgb = { r: number; g: number; b: number };

// Der Farbton laeuft 0..360, Saettigung und Helligkeit 0..1. Das ist die Form,
// in der der Verlauf rechnet; Hex ist die Form, in der er gespeichert wird.
export function rgbToHsb(rgb: Rgb): Hsb {
  const r = clamp01(rgb.r / 255);
  const g = clamp01(rgb.g / 255);
  const b = clamp01(rgb.b / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, b: max };
}

export function hsbToRgb(hsb: Hsb): Rgb {
  const h = ((hsb.h % 360) + 360) % 360;
  const s = clamp01(hsb.s);
  const b = clamp01(hsb.b);
  const chroma = b * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = b - chroma;

  let r = 0;
  let g = 0;
  let blue = 0;
  if (h < 60) [r, g, blue] = [chroma, x, 0];
  else if (h < 120) [r, g, blue] = [x, chroma, 0];
  else if (h < 180) [r, g, blue] = [0, chroma, x];
  else if (h < 240) [r, g, blue] = [0, x, chroma];
  else if (h < 300) [r, g, blue] = [x, 0, chroma];
  else [r, g, blue] = [chroma, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Nur die Formen, die der Inspektor auch schreibt: `#rgb` und `#rrggbb`. Alles
// andere (rgb(), hsl(), benannte Farben, `transparent`) ist KEIN Hex und wird
// hier absichtlich nicht geraten - der Aufrufer entscheidet, was er damit tut.
export function parseHex(value: string): Rgb | null {
  const text = value.trim();
  if (!HEX.test(text)) return null;
  const digits = text.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function toHex(rgb: Rgb): string {
  const part = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

// Der Griff im Verlauf: `x` und `y` sind Anteile (0..1) der Flaeche, `h` der
// aktuell gewaehlte Farbton. Links ist entsaettigt, rechts voll, oben hell.
export function colorFromPad(h: number, x: number, y: number): string {
  return toHex(hsbToRgb({ h, s: clamp01(x), b: 1 - clamp01(y) }));
}

// Der Punkt, an dem die aktuelle Farbe im Verlauf liegt - fuer den Griff.
export function padPosition(color: string): { x: number; y: number } | null {
  const rgb = parseHex(color);
  if (rgb === null) return null;
  const hsb = rgbToHsb(rgb);
  return { x: hsb.s, y: 1 - hsb.b };
}

// Der Farbton einer Farbe in Grad. Gebraucht, wenn der Waehler oeffnet und der
// Streifen zeigen soll, wo der Ton der aktuellen Farbe liegt. Grau hat keinen
// Ton; dann bleibt es bei 0, und der Streifen steht links.
export function hueOf(color: string): number {
  const rgb = parseHex(color);
  if (rgb === null) return 0;
  return rgbToHsb(rgb).h;
}

// Die reine Vollfarbe eines Farbtons - die Grundlage der Verlaufsflaeche.
export function hueColor(degree: number): string {
  return toHex(hsbToRgb({ h: degree, s: 1, b: 1 }));
}

// Der Stil der Verlaufsflaeche. Drei Schichten: die Vollfarbe des Tons, darueber
// von unten nach oben Schwarz (Helligkeit), darueber von links nach rechts Weiss
// (Saettigung). Das ist die uebliche Form und braucht kein Canvas.
export function padBackground(degree: number): string {
  return (
    `background-color:${hueColor(degree)};` +
    "background-image:linear-gradient(to top,#000,rgb(0 0 0 / 0))," +
    "linear-gradient(to right,#fff,rgb(255 255 255 / 0))"
  );
}

// Der Farbton-Streifen: 0..1 der Breite ergibt 0..360 Grad.
export function hueFromStrip(x: number): number {
  return clamp01(x) * 360;
}

// Ein Streifen aus sechs Stuetzfarben - mehr braucht der Verlauf nicht, weil
// der Browser zwischen ihnen interpoliert. Die Stuetzstellen sind die Ecken
// des Sechsecks im Farbkreis.
export function hueStripStops(): string[] {
  return [0, 60, 120, 180, 240, 300, 360].map((degree) =>
    toHex(hsbToRgb({ h: degree, s: 1, b: 1 })),
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
