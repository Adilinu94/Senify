// Kontrastnachweis fuer die Farbschicht des Designsystems.
//
// Liest `design-system/farben.css`, loest die var()-Ketten auf und rechnet
// jedes geforderte Paar mit der WCAG-Formel (relative Luminanz, sRGB) nach.
// Zwei Dinge, die eine Textdatei nicht leisten kann:
//
//   1. Die Leiter muss in beiden Modi VOLLSTAENDIG sein. Wer eine Flaeche
//      hinzufuegt und den dunklen Modus vergisst, sieht hier eine Rolle, die
//      in beiden Modi denselben Wert hat.
//   2. Jede Behauptung ueber einen Kontrast muss eine Zahl sein. Kein Wert in
//      der CSS-Datei ist geraten; jede Zusage steht unten als Paar.
//
// Aufruf:  node .scratch/editor-v2-rebuild/pruef-kontrast.mjs
// Rueckgabe: 0 = alle geforderten Paare erfuellt, 1 = mindestens eines nicht.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "design-system", "senify.css");
const css = readFileSync(cssPath, "utf8");

// ---------------------------------------------------------------- CSS lesen
// Die Datei ist fuer Menschen geschrieben: Werte tragen Kommentare am
// Zeilenende, Schattenwerte laufen ueber zwei Zeilen. Deshalb erst die
// Kommentare entfernen, dann den Block am Semikolon zerlegen — so ist ein Wert
// genau das, was zwischen `:` und `;` steht, egal wie er umbrochen ist.
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Zieht die `--name: wert;` Paare ALLER Bloecke eines Selektors heraus.
 *  Ein Selektor darf mehrfach vorkommen (Rohwerte und Semantik stehen in
 *  getrennten Bloecken); spaetere Angaben ueberschreiben frueher, wie im CSS. */
function blocksOf(source, selector) {
  const out = new Map();
  let at = source.indexOf(selector);
  if (at < 0) throw new Error(`Block nicht gefunden: ${selector}`);
  while (at >= 0) {
    const open = source.indexOf("{", at);
    const close = source.indexOf("}", open);
    for (const chunk of source.slice(open + 1, close).split(";")) {
      const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/.exec(chunk);
      if (m) out.set(m[1], m[2].replace(/\s+/g, " ").trim());
    }
    at = source.indexOf(selector, close);
  }
  return out;
}

const light = blocksOf(withoutComments, ":root {");
const darkOverrides = blocksOf(withoutComments, '[data-mode="dark"]');

// ------------------------------------------------------------- Farbwerte
/** #rrggbb, #rgb, rgb(r g b) und rgb(r g b / a) zu {r,g,b,a}. */
function parseColor(text) {
  const value = text.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  throw new Error(`Farbe nicht lesbar: ${text}`);
}

/** Loest var()-Ketten auf. Sucht erst im Modus, dann im hellen Ausgangssatz. */
function resolve(name, mode, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Kreisverweis bei ${name}`);
  seen.add(name);
  const raw = (mode === "dark" ? darkOverrides.get(name) : undefined) ?? light.get(name);
  if (raw === undefined) throw new Error(`Token fehlt: ${name}`);
  const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(raw);
  if (ref) return resolve(ref[1], mode, seen);
  return parseColor(raw);
}

/** Eine halbdurchsichtige Fuellung ueber ihren Grund legen. */
function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

// ------------------------------------------------------------------ Formel
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (c) =>
  0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (c) =>
  "#" +
  [c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("");
const fix = (n) => n.toFixed(2).replace(".", ",");

// ------------------------------------------------------- Geforderte Paare
// min 4.5 = Text (WCAG 2.2, 1.4.3)   min 3 = Nicht-Text (1.4.11)
// Text steht nur dort, wo die Flaeche ihn traegt. Die Liste ist bewusst
// ungleich: auf Weiss traegt die Leiter fuenf Stufen, auf einer getoenten
// Fuellung weniger. Das ist der Grund, warum im Vorbild fast aller Text auf
// weissen Karten liegt und die Chips dunkle Schrift haben.
const required = [];
for (const [bg, inks] of [
  ["--ui-surface-panel", ["ink-strong", "ink", "ink-muted", "ink-soft", "ink-faint"]],
  ["--ui-surface-inset", ["ink-strong", "ink", "ink-muted", "ink-soft"]],
  ["--ui-surface-track", ["ink-strong", "ink", "ink-muted", "ink-soft"]],
  ["--ui-surface-canvas", ["ink-strong", "ink", "ink-muted"]],
]) {
  const label = bg.replace("--ui-surface-", "");
  for (const ink of inks) {
    required.push([`--ui-${ink}`, bg, 4.5, `${ink} auf ${label}`]);
  }
}

required.push(
  ["--ui-ink-on-emphasis", "--ui-surface-emphasis", 4.5, "Schrift auf der zweiten Flaeche"],
  ["--ui-ink-on-accent", "--ui-signal-accent", 4.5, "Schrift auf Limette"],
  ["--ui-signal-warning-ink", "--ui-signal-warning-surface", 4.5, "Hinweistext auf Hinweisflaeche"],
  ["--ui-signal-danger-ink", "--ui-signal-danger-surface", 4.5, "Alarmtext auf Alarmflaeche"],
  ["--ui-signal-success", "--ui-signal-success-surface", 4.5, "Erfolgstext auf Erfolgsflaeche"],
  ["--ui-signal-danger", "--ui-surface-panel", 4.5, "Alarm als Text und Strich"],
  ["--ui-signal-success", "--ui-surface-panel", 4.5, "Erfolg als Text und Zeichen"],
  ["--ui-signal-warning-ink", "--ui-surface-panel", 4.5, "Hinweis als Text"],

  ["--ui-line-control", "--ui-surface-panel", 3, "Feldkante auf Panel"],
  ["--ui-line-control", "--ui-surface-inset", 3, "Feldkante im Feld"],
  ["--ui-line-control", "--ui-surface-canvas", 3, "Feldkante auf Grund"],
  ["--ui-line-control", "--ui-surface-track", 3, "Feldkante in der Spur"],
  ["--ui-signal-select", "--ui-surface-panel", 3, "Auswahlfuellung"],
  ["--ui-signal-select", "--ui-surface-canvas", 3, "Auswahlfuellung auf Grund"],
  ["--ui-focus", "--ui-surface-panel", 3, "Fokusring"],
  ["--ui-focus", "--ui-surface-canvas", 3, "Fokusring auf Grund"],
  ["--ui-focus", "--ui-surface-inset", 3, "Fokusring im Feld"],
  ["--ui-focus-on-emphasis", "--ui-surface-emphasis", 3, "Fokusring auf zweiter Flaeche"],
  ["--ui-focus-on-accent", "--ui-signal-accent", 3, "Fokusring auf Limette"],
);

// Vermerkte Paare: entweder bewusst unterschritten oder als Grenze nicht
// gesetzt. Sie werden gedruckt, damit jede Begruendung nachpruefbar bleibt
// statt nur behauptet zu sein.
const accepted = [
  ["--ui-signal-accent", "--ui-surface-panel", "Lime als duenne Marke auf Weiss: 1,29:1. Deshalb ist Lime bei uns nur gefuellte Flaeche mit dunkler Schrift — nie Unterstreichung, Ring oder Punkt auf hellem Grund."],
  ["--ui-signal-accent", "--ui-surface-emphasis", "Im hellen Modus traegt die zweite Flaeche Lime (14,6:1), im dunklen ist sie fast weiss (1,18:1). Lime auf der zweiten Flaeche ist darum immer ein gefuellter Chip, nie eine Marke."],
  ["--ui-signal-warning", "--ui-surface-panel", "Amber als Text auf Weiss: 2,17:1. Hinweistext traegt immer signal-warning-ink."],
  ["--ui-ink-ghost", "--ui-surface-panel", "Die Originalstufe des Vorbilds: 3,44:1, unter AA. Nur Symbole und Trenner, nie Text."],
  ["--ui-line-hairline", "--ui-surface-panel", "Rein dekorative Trennung ohne Bedeutung; trifft nie die Anforderung 3:1 und muss es nicht."],
  ["--ui-ink-soft", "--ui-surface-canvas", "Nebentext auf dem Grund ist nicht vorgesehen; auf dem Grund nur bis ink-muted."],
  ["--ui-ink-faint", "--ui-surface-canvas", "Meta auf dem Grund ist nicht vorgesehen."],
  ["--ui-ink-faint", "--ui-surface-inset", "Die helle Leiter hat auf getoenter Fuellung keinen Spielraum mehr; dort traegt hoechstens ink-soft. Im dunklen Modus faellt dieser Fall weg."],
  ["--ui-ink-faint", "--ui-surface-track", "Chips tragen in beiden Modi dunkle Schrift, wie das Vorbild es zeigt — nicht die blasseste Stufe."],
  ["--ui-fill-hover", "--ui-surface-panel", "Hover ist eine Zustandsflaeche, kein Traeger von Bedeutung."],
];

// ---------------------------------------------------------------- Ausgabe
function row(label, fgName, bgName, mode, min) {
  const bgBase = resolve(bgName, mode);
  const fg = over(resolve(fgName, mode), bgBase);
  const value = contrast(fg, bgBase);
  const ok = min === 0 || value >= min;
  const mark = min === 0 ? "·" : ok ? "OK" : "FEHLT";
  return {
    line: [
      mark.padEnd(6),
      `${hex(fg)} auf ${hex(bgBase)}`,
      `${fix(value)}:1`.padStart(9),
      min ? `min ${fix(min)}`.padEnd(9) : "".padEnd(9),
      label,
    ].join("  "),
    ok,
  };
}

let failures = 0;

for (const mode of ["light", "dark"]) {
  console.log("");
  console.log("=".repeat(96));
  console.log(`  MODUS ${mode === "light" ? "HELL" : "DUNKEL"}  —  geforderte Paare`);
  console.log("=".repeat(96));
  console.log(
    "      Farbe auf Flaeche".padEnd(32) + "Verhaeltnis".padStart(11) + "  Grenze     Rolle",
  );

  for (const [fg, bg, min, note] of required) {
    const r = row(note, fg, bg, mode, min);
    console.log("  " + r.line);
    if (!r.ok) failures++;
  }

  console.log("");
  console.log("  --- vermerkt: nicht als Grenze gesetzt, mit Begruendung ---");
  for (const [fg, bg, why] of accepted) {
    console.log("  " + row(why, fg, bg, mode, 0).line);
  }
}

// ----------------------------------------- Vollstaendigkeit der Leiter
console.log("");
console.log("=".repeat(96));
console.log("  VOLLSTAENDIGKEIT — Rollen, deren Wert in beiden Modi gleich bleibt");
console.log("=".repeat(96));

// Nicht jede Familie kennt zwei Modi. Rohwerte duerfen in beiden Modi gleich
// bleiben (die Bunttöne) oder verschieden sein (die Leiter); Maß, Form,
// Schrift, Bewegung und Ebenen sind in beiden Modi gleich und sollen es sein.
// Geprueft wird deshalb nur die Farbschicht.
const FAMILIEN_OHNE_MODUS = [
  "--ui-neutral-",
  "--ui-dark-",
  "--ui-hue-",
  "--ui-space-",
  "--ui-radius-",
  "--ui-h-",
  "--ui-w-",
  "--ui-font-",
  "--ui-text-",
  "--ui-lh-",
  "--ui-weight-",
  "--ui-track-",
  "--ui-t-",
  "--ui-ease-",
  "--ui-z-",
  "--ui-grid-",
  "--ui-hit-",
];
const isRaw = (k) => FAMILIEN_OHNE_MODUS.some((p) => k.startsWith(p));
const semantic = [...light.keys()].filter((k) => !isRaw(k));
const same = [];
const notColour = [];
for (const key of semantic) {
  let l;
  let d;
  try {
    l = resolve(key, "light");
    d = resolve(key, "dark");
  } catch {
    notColour.push(key); // Schatten sind keine Farbe
    continue;
  }
  if (hex(l) === hex(d)) same.push([key, hex(l)]);
}
for (const key of notColour) console.log(`  (nicht farbig)  ${key}`);
for (const [key, value] of same) console.log(`  ${value.padEnd(9)}  ${key}`);
console.log("");
console.log(
  `  ${same.length} von ${semantic.length} Rollen sind in beiden Modi gleich.`,
);
console.log("  Erwartet sind genau die Bunttöne, die in beiden Modi dieselbe Aussage");
console.log("  treffen (Limette und Amber samt ihrer Gegentöne), alles was auf ihnen");
console.log("  zeigt, und die Einrastlinie der Bühne. Die Auswahl steht bewusst");
console.log("  nicht hier: sie zeigt auf --ui-surface-emphasis und folgt dem Modus von");
console.log("  selbst. Jede weitere Zeile oben bedeutet: diese Rolle wurde im dunklen");
console.log("  Modus vergessen.");

console.log("");
console.log("=".repeat(96));
if (failures === 0) {
  console.log("  ERGEBNIS: alle geforderten Paare erfuellt, in beiden Modi.");
} else {
  console.log(`  ERGEBNIS: ${failures} Paar(e) verfehlen die Grenze.`);
}
console.log("=".repeat(96));
console.log("");

process.exit(failures === 0 ? 0 : 1);
