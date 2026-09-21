// Editor-Chrome tokens (Editor v2, Ticket 03 "Editor-Designsystem").
//
// Zweck: die eine Wahrheit fuer die Oberflaeche des Editors selbst (Werkzeug-Haut).
// NICHT die Wahrheit fuer ausgelieferte Seiten. Die steht weiterhin in
// `@senify/tokens` (`defaultTheme`, `themeVariables`), weil sie pro Site gilt.
//
// Warum hier und nicht in `@senify/tokens`:
//   * Ticket 03 fordert ein Editor-Designsystem mit Glossar, CSS-Modules-Pflicht und
//     der Primitive-Regel "jeder Knopf aus `src/ui`". Genau dieser Ordner ist das.
//   * Die Editor-Haut ist fest (dunkler Tiefwasser-Anzug), sie wird je Site nicht
//     getauscht. Gehoerte sie in `@senify/tokens`, muesste die Site-Theme-Ausgabe
//     zwischen Inhalt und Werkzeug unterscheiden. Zwei Ausgaben, eine Datei: nicht
//     noetig. Im Ordner `ui` ist die Grenze sichtbar.
//   * Keine zweite Wahrheit trotzdem, weil jeder Wert entweder ein Anker der
//     Designsprache ist (Tiefwasser 900/800/700/600/300, Lime) oder ein offen
//     dokumentierter `color-mix()` genau zweier Anker. Kein Wert ist neu erfunden.
//     Der Farbraum ist derselbe wie in `.scratch/refs/nick/tools/design-rules.css`
//     (die laufende Redesign-Seite) und in `.scratch/refs/precious-board/design.md`.
//     Die Maße (4px-Takt, Radius-Grundwert 8px, Bewegung) folgen den Theme-Skalen.
//
// Quellen der Palette (nachpruefbar):
//   `.scratch/refs/precious-board/design.md`          Abschnitt Colors / Shape / Elevation / Motion
//   `.scratch/refs/nick/tools/design-rules.css`        laufende Redesign-Seite (gleiche Hex-Werte)
//
// Ableitung der Mischwerte steht als Kommentar am jeweiligen Wert. Sie sind hier
// bewusst als feste Hex-Werte niedergeschrieben und nicht als `color-mix()` im CSS:
// so gibt es genau eine Darstellung, keine zwei, und die Kontrastrechnung bleibt
// stabil. Die Aufgabenliste verlangt einen Paritaetstest gegen die Palette.

export type EditorTokenSet = Readonly<Record<string, string>>;

export const EDITOR_ROOT_ATTRIBUTE = "data-senify-editor";

// ---------------------------------------------------------------------- Palette
// Anker der Designsprache. Nie aendern ohne `.scratch/refs/precious-board/design.md`.
export const EDITOR_PALETTE = {
  "brand-900": "#01283c",
  "brand-800": "#083247",
  "brand-700": "#024364",
  "brand-600": "#006092",
  "brand-300": "#9ac9e2",
  lime: "#cbff97",
} as const;

// --------------------------------------------------------------------- Flaechen
// Vier Stufen. Ebenen entstehen ueber die Lichtkante, nicht ueber Schatten.
export const EDITOR_SURFACE = {
  // Buehne um die Frames, dunkelster Grund (Tiefwasser 900).
  canvas: "#01283c",
  // Panel-Grund: Explorer, Inspektor, Statusleiste (Tiefwasser 800).
  panel: "#083247",
  // Gehobene Flaeche: Kopfleiste, Werkzeugleiste, Menue, Dialog (Tiefwasser 700).
  raised: "#024364",
  // Eingelassene Flaeche: Feld-Innenraum. mix(#01283c 60 %, #083247 40 %) = #042c40
  inset: "#042c40",
} as const;

// ------------------------------------------------------------------------- Text
export const EDITOR_INK = {
  strong: "#ffffff",
  // mix(#ffffff 88 %, #9ac9e2 12 %) = #f3f9fc
  base: "#f3f9fc",
  // Tiefwasser 300. Sekundaertext, Nebentexte, Feld-Label.
  muted: "#9ac9e2",
  // mix(#9ac9e2 55 %, #083247 45 %) = #58859c. NUR Nicht-Text (Symbole, Trenner).
  // Als Text 3,37:1 auf dem Panel und 2,64:1 auf gehobener Flaeche: unter 4,5.
  faint: "#58859c",
  // Text auf Lime (Hauptaktion): 13,35:1.
  onLime: "#01283c",
} as const;

// ------------------------------------------------------------- Kanten / Linien
export const EDITOR_LINE = {
  // mix(#ffffff 14 %, #083247 86 %) = #2b4f61. 1,54:1: rein dekorative Trennung
  // ohne Bedeutung. Trifft nie die Anforderung 3:1 aus WCAG 1.4.11 und darf sie
  // auch nicht treffen muessen, weil sie nie die einzige Kennzeichnung ist.
  hairline: "#2b4f61",
  // mix(#9ac9e2 62 %, #083247 38 %) = #6390a7. 3,05:1 bis 4,44:1 je Flaeche:
  // traegt die Kennzeichnung eines Feldes (WCAG 1.4.11, 3:1).
  control: "#6390a7",
  // Tiefwasser 300. Vollton-Kante fuer Zustand (Fokus, Auswahl, Aktiv).
  strong: "#9ac9e2",
} as const;

// --------------------------------------------------------------------- Signale
export const EDITOR_SIGNAL = {
  accent: "#cbff97",
  select: "#9ac9e2",
  // Theme-Wert `danger-vivid` (packages/tokens): Flaeche und Strich, 3,81:1 bis 5,54:1.
  danger: "#f87171",
  // Aufgehelltes Abzeichen desselben Rot fuer Text: 5,56:1 bis 8,08:1.
  dangerInk: "#fca5a5",
  // Theme-Werte `success-vivid` / `warning-vivid` (packages/tokens).
  success: "#4ade80",
  warning: "#fbbf24",
} as const;

// -------------------------------------------------- Fuellungen (Zustandsflaechen)
export const EDITOR_FILL = {
  hover: "rgb(255 255 255 / 0.06)",
  select: "rgb(154 201 226 / 0.14)",
  danger: "rgb(248 113 113 / 0.14)",
  // Lime hebt sich um eine Stufe: mix(#cbff97 92 %, #ffffff 8 %) = #cfff9f
  accentHover: "#cfff9f",
  focusRing: "#cbff97",
  focusRingOnAccent: "#01283c",
} as const;

// ------------------------------------------------------- Lichtkanten und Schatten
export const EDITOR_ELEVATION = {
  edgeHairline: "inset 0 0 0 1px rgb(255 255 255 / 0.14)",
  edgeTop: "inset 0 1px 0 rgb(255 255 255 / 0.1)",
  edgeSelect: "inset 0 0 0 1px rgb(154 201 226 / 0.55)",
  shadowFloat:
    "0 18px 44px -18px rgb(1 18 27 / 0.72), 0 2px 6px -2px rgb(1 18 27 / 0.5)",
  shadowDialog: "0 28px 72px -24px rgb(1 18 27 / 0.8)",
  // Abdunklung hinter Dialogen. Wert aus dem Bestand (`packages/app/public/app.css`,
  // `.refs-dialog::backdrop`): #1720377a. Keine zweite Wahrheit.
  scrim: "rgb(23 32 55 / 0.48)",
  blurGlass: "10px",
  blurScrim: "4px",
} as const;

// ----------------------------------------------------------------- Abstand (4px)
export const EDITOR_SPACE = {
  0: "0",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

// --------------------------------------------------------------------- Radien
// Radius 0 ist die Regel (hartes Raster der Designsprache). 4px fuer Koernung
// (Chip, kbd, Farbfeld, Abzeichen), 8px nur fuer schwebende Platten (Menue,
// Dialog, Toast, Popover), 9999px nur fuer Segmentumschalter und Spotlight-Zeile.
// Die Theme-Werte lg (16px) und xl (24px) gehoeren dem Inhalt, nicht dem Werkzeug.
export const EDITOR_RADIUS = {
  0: "0",
  sm: "4px",
  md: "8px",
  full: "9999px",
} as const;

// --------------------------------------------------------------------- Masse
export const EDITOR_METRIC = {
  topbar: "48px",
  toolbar: "40px",
  tabRow: "36px",
  panelHead: "36px",
  statusBar: "28px",
  row: "28px",
  rowMenu: "32px",
  propRow: "32px",
  field: "28px",
  buttonSm: "28px",
  buttonMd: "32px",
  buttonLg: "40px",
  iconButton: "28px",
  ruler: "24px",
  rail: "48px",
  explorer: "264px",
  inspector: "320px",
  spotlight: "640px",
  menuMin: "200px",
  menuMax: "320px",
  toastMax: "360px",
  dialog: "560px",
  // Zeile der Geraetestationen unter dem Rahmen (`ui-plan.md` Abschnitt 0).
  deviceBar: "28px",
  // Kuerselspalte in Menue und Spotlight (`ui-plan.md` Abschnitt 0).
  keys: "56px",
  // WCAG 2.5.8 (Target Size, Minimum): 24 x 24 CSS-px. Griffe sind 8px sichtbar,
  // ihre Trefferflaeche ist auf 24px aufgefuellt.
  hitMin: "24px",
  handle: "8px",
  indent: "16px",
} as const;

// ------------------------------------------------- Canvas-Hilfen (Raster etc.)
// Acht zusaetzliche Tokens aus `ui-plan.md` Abschnitt 0 (Aufgabe 32). Raster,
// Einrasten, Auswahlrechteck und die beiden Abstandsbaender am Rahmen.
export const EDITOR_CANVAS = {
  // Rasterschritt und Einrastschritt (4px-Takt).
  gridStep: "4px",
  // Rasterhilfe, abgeleitet aus `--ed-signal-select` (Tiefwasser 300 bei 35%).
  gridHelp: "rgb(154 201 226 / 0.35)",
  // Einrastlinie, gleich `--ed-signal-accent` (Lime).
  snapLine: "#cbff97",
  // Auswahlrechteck beim Aufziehen.
  marquee: "rgb(154 201 226 / 0.16)",
  // Aussenlinie der Doppelkante am Auswahlrahmen (`ui-design.md` § Auswahl und
  // Griffe): feste Tiefwasser-Kante, damit eine der beiden Linien auf hellem
  // und dunklem Inhalt 3:1 erreicht.
  selectionEdge: "rgb(1 40 60 / 0.55)",
  // Aussenband am Rahmen (Fehlerrot bei 12%).
  bandMargin: "rgb(248 113 113 / 0.12)",
  // Innenband am Rahmen (Erfolgsgruen bei 12%).
  bandPadding: "rgb(74 222 128 / 0.12)",
} as const;

// ------------------------------------------------------------------- Typografie
// Feste px-Werte. Der Editor ist ein Werkzeug: seine eigenen Beschriftungen duerfen
// nicht mit der Fensterbreite fliessen. Die Fliessskala (clamp) gilt fuer den Inhalt.
export const EDITOR_TYPE = {
  fontDisplay: '"Inter Display", "Inter", system-ui, sans-serif',
  fontBody: '"Inter", system-ui, sans-serif',
  fontMono: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
  size10: "10px",
  size11: "11px",
  size12: "12px",
  size13: "13px",
  size15: "15px",
  size17: "17px",
  lh10: "14px",
  lh11: "15px",
  lh12: "16px",
  lh13: "18px",
  lh15: "20px",
  lh17: "22px",
  trackMicro: "0.06em",
  trackDisplay: "-0.01em",
  weightRegular: "400",
  weightMedium: "500",
  weightSemibold: "600",
} as const;

// --------------------------------------------------------------------- Bewegung
// Werkzeugbewegung bleibt unter 300ms. Die 1200ms der Designsprache gelten fuer das
// Erscheinen der Seite im Canvas und fuer den Wechsel Design/Live, nicht fuer Klicks.
export const EDITOR_MOTION = {
  t0: "0ms",
  t1: "120ms",
  t2: "160ms",
  t3: "200ms",
  t4: "240ms",
  tBrand: "1200ms",
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  easeDrawer: "cubic-bezier(0.32, 0.72, 0, 1)",
  easeStandard: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeLinear: "linear",
} as const;

// ------------------------------------------------------------ Aufgeloeste Werte
// Die Herleitung der Mischwerte, damit Test und Rechnung dieselbe Zahl sehen.
export const EDITOR_RESOLVED = {
  "ink-base": "mix(#ffffff 88%, #9ac9e2 12%)",
  "ink-faint": "mix(#9ac9e2 55%, #083247 45%)",
  "line-hairline": "mix(#ffffff 14%, #083247 86%)",
  "line-control": "mix(#9ac9e2 62%, #083247 38%)",
  "surface-inset": "mix(#01283c 60%, #083247 40%)",
  selectOverPanel: "mix(#9ac9e2 14% over #083247)",
  selectOverRaised: "mix(#9ac9e2 14% over #024364)",
  hoverOverPanel: "mix(#ffffff 6% over #083247)",
  hoverOverRaised: "mix(#ffffff 6% over #024364)",
} as const;

// ------------------------------------------------------------ Kontrast-Nachweise
// Gemessen mit der WCAG-Formel (relative Luminanz, sRGB). `min` ist die Grenze:
// 4.5 fuer Text (WCAG 2.2, 1.4.3), 3.0 fuer Nicht-Text (1.4.11), 3.0 fuer Gross.
// `value` ist der ungerundete Rechenwert, auf zwei Stellen angegeben.
//
// Auszug: hier stehen die tragenden Faelle. Die vollstaendige Tabelle (41 Paare,
// jede Textfarbe gegen jede Flaeche) steht in `.scratch/editor-v2-rebuild/ui-design.md`,
// Abschnitte 8.1 bis 8.3, und wird in der Vorschau
// (`.scratch/editor-v2-rebuild/ui-preview/index.html`) im Browser nachgerechnet.
export type ContrastProof = {
  readonly foreground: string;
  readonly background: string;
  readonly value: number;
  readonly min: number;
  readonly note: string;
};

export const EDITOR_CONTRAST_PROOF: readonly ContrastProof[] = [
  { foreground: EDITOR_INK.strong, background: EDITOR_SURFACE.panel, value: 13.48, min: 4.5, note: "Wert auf Panel" },
  { foreground: EDITOR_INK.strong, background: EDITOR_SURFACE.raised, value: 10.56, min: 4.5, note: "Wert auf gehobener Flaeche" },
  { foreground: EDITOR_INK.strong, background: EDITOR_SURFACE.inset, value: 14.59, min: 4.5, note: "Feldwert im Feld" },
  { foreground: EDITOR_INK.strong, background: EDITOR_SURFACE.canvas, value: 15.33, min: 4.5, note: "Statusleiste" },
  { foreground: EDITOR_INK.base, background: EDITOR_SURFACE.panel, value: 12.69, min: 4.5, note: "Grundtext" },
  { foreground: EDITOR_INK.base, background: EDITOR_SURFACE.raised, value: 9.94, min: 4.5, note: "Menue-Text" },
  { foreground: EDITOR_INK.muted, background: EDITOR_SURFACE.panel, value: 7.59, min: 4.5, note: "Sekundaertext" },
  { foreground: EDITOR_INK.muted, background: EDITOR_SURFACE.raised, value: 5.94, min: 4.5, note: "Kuersel im Menue" },
  { foreground: EDITOR_INK.muted, background: EDITOR_SURFACE.canvas, value: 8.63, min: 4.5, note: "Nebentext auf Buehne" },
  { foreground: EDITOR_INK.onLime, background: EDITOR_SIGNAL.accent, value: 13.35, min: 4.5, note: "Text auf Lime" },
  { foreground: EDITOR_SIGNAL.dangerInk, background: EDITOR_SURFACE.raised, value: 5.56, min: 4.5, note: "Loeschen im Menue" },
  { foreground: EDITOR_SIGNAL.dangerInk, background: EDITOR_SURFACE.panel, value: 7.1, min: 4.5, note: "Fehlertext" },
  { foreground: EDITOR_SIGNAL.success, background: EDITOR_SURFACE.panel, value: 7.74, min: 4.5, note: "Erfolgstext" },
  { foreground: EDITOR_SIGNAL.warning, background: EDITOR_SURFACE.panel, value: 8.08, min: 4.5, note: "Hinweistext" },
  { foreground: EDITOR_SIGNAL.accent, background: EDITOR_SURFACE.panel, value: 11.74, min: 3, note: "Fokusring auf Panel" },
  { foreground: EDITOR_SIGNAL.accent, background: EDITOR_SURFACE.raised, value: 9.19, min: 3, note: "Fokusring auf Platte" },
  { foreground: EDITOR_LINE.control, background: EDITOR_SURFACE.raised, value: 3.06, min: 3, note: "Feldkante, schwaechster Fall" },
  { foreground: EDITOR_LINE.control, background: EDITOR_SURFACE.panel, value: 3.9, min: 3, note: "Feldkante" },
  { foreground: EDITOR_LINE.strong, background: EDITOR_SURFACE.raised, value: 5.94, min: 3, note: "Auswahlrahmen" },
  { foreground: EDITOR_SIGNAL.danger, background: EDITOR_SURFACE.raised, value: 3.82, min: 3, note: "Loeschstrich" },
  { foreground: EDITOR_INK.faint, background: EDITOR_SURFACE.raised, value: 2.64, min: 0, note: "Nicht-Text, unter 3: nie alleinige Kennzeichnung" },
  { foreground: EDITOR_LINE.hairline, background: EDITOR_SURFACE.panel, value: 1.54, min: 0, note: "Nur dekorative Trennung" },
];

// ------------------------------------------------------------------ CSS-Ausgabe
function block(selector: string, vars: EditorTokenSet): string {
  const lines = Object.entries(vars)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

export const EDITOR_TOKENS: EditorTokenSet = {
  // Palette
  "--ed-brand-900": EDITOR_PALETTE["brand-900"],
  "--ed-brand-800": EDITOR_PALETTE["brand-800"],
  "--ed-brand-700": EDITOR_PALETTE["brand-700"],
  "--ed-brand-600": EDITOR_PALETTE["brand-600"],
  "--ed-brand-300": EDITOR_PALETTE["brand-300"],
  "--ed-lime": EDITOR_PALETTE.lime,
  // Flaechen
  "--ed-surface-canvas": EDITOR_SURFACE.canvas,
  "--ed-surface-panel": EDITOR_SURFACE.panel,
  "--ed-surface-raised": EDITOR_SURFACE.raised,
  "--ed-surface-inset": EDITOR_SURFACE.inset,
  // Text
  "--ed-ink-strong": EDITOR_INK.strong,
  "--ed-ink-base": EDITOR_INK.base,
  "--ed-ink-muted": EDITOR_INK.muted,
  "--ed-ink-faint": EDITOR_INK.faint,
  "--ed-ink-on-lime": EDITOR_INK.onLime,
  // Kanten
  "--ed-line-hairline": EDITOR_LINE.hairline,
  "--ed-line-control": EDITOR_LINE.control,
  "--ed-line-strong": EDITOR_LINE.strong,
  // Signale
  "--ed-signal-accent": EDITOR_SIGNAL.accent,
  "--ed-signal-select": EDITOR_SIGNAL.select,
  "--ed-signal-danger": EDITOR_SIGNAL.danger,
  "--ed-signal-danger-ink": EDITOR_SIGNAL.dangerInk,
  "--ed-signal-success": EDITOR_SIGNAL.success,
  "--ed-signal-warning": EDITOR_SIGNAL.warning,
  // Fuellungen
  "--ed-fill-hover": EDITOR_FILL.hover,
  "--ed-fill-select": EDITOR_FILL.select,
  "--ed-fill-danger": EDITOR_FILL.danger,
  "--ed-fill-accent-hover": EDITOR_FILL.accentHover,
  "--ed-focus": EDITOR_FILL.focusRing,
  "--ed-focus-on-accent": EDITOR_FILL.focusRingOnAccent,
  // Lichtkanten und Schatten
  "--ed-edge-hairline": EDITOR_ELEVATION.edgeHairline,
  "--ed-edge-top": EDITOR_ELEVATION.edgeTop,
  "--ed-edge-select": EDITOR_ELEVATION.edgeSelect,
  "--ed-shadow-float": EDITOR_ELEVATION.shadowFloat,
  "--ed-shadow-dialog": EDITOR_ELEVATION.shadowDialog,
  "--ed-scrim": EDITOR_ELEVATION.scrim,
  "--ed-blur-glass": EDITOR_ELEVATION.blurGlass,
  "--ed-blur-scrim": EDITOR_ELEVATION.blurScrim,
  // Abstand
  "--ed-space-0": EDITOR_SPACE[0],
  "--ed-space-1": EDITOR_SPACE[1],
  "--ed-space-2": EDITOR_SPACE[2],
  "--ed-space-3": EDITOR_SPACE[3],
  "--ed-space-4": EDITOR_SPACE[4],
  "--ed-space-5": EDITOR_SPACE[5],
  "--ed-space-6": EDITOR_SPACE[6],
  "--ed-space-8": EDITOR_SPACE[8],
  "--ed-space-10": EDITOR_SPACE[10],
  "--ed-space-12": EDITOR_SPACE[12],
  // Radien
  "--ed-radius-0": EDITOR_RADIUS[0],
  "--ed-radius-sm": EDITOR_RADIUS.sm,
  "--ed-radius-md": EDITOR_RADIUS.md,
  "--ed-radius-full": EDITOR_RADIUS.full,
  // Masse
  "--ed-h-topbar": EDITOR_METRIC.topbar,
  "--ed-h-toolbar": EDITOR_METRIC.toolbar,
  "--ed-h-tabrow": EDITOR_METRIC.tabRow,
  "--ed-h-panelhead": EDITOR_METRIC.panelHead,
  "--ed-h-statusbar": EDITOR_METRIC.statusBar,
  "--ed-h-row": EDITOR_METRIC.row,
  "--ed-h-row-menu": EDITOR_METRIC.rowMenu,
  "--ed-h-prop": EDITOR_METRIC.propRow,
  "--ed-h-field": EDITOR_METRIC.field,
  "--ed-h-btn-sm": EDITOR_METRIC.buttonSm,
  "--ed-h-btn-md": EDITOR_METRIC.buttonMd,
  "--ed-h-btn-lg": EDITOR_METRIC.buttonLg,
  "--ed-h-iconbtn": EDITOR_METRIC.iconButton,
  "--ed-h-ruler": EDITOR_METRIC.ruler,
  "--ed-w-rail": EDITOR_METRIC.rail,
  "--ed-w-explorer": EDITOR_METRIC.explorer,
  "--ed-w-inspector": EDITOR_METRIC.inspector,
  "--ed-w-spotlight": EDITOR_METRIC.spotlight,
  "--ed-w-menu-min": EDITOR_METRIC.menuMin,
  "--ed-w-menu-max": EDITOR_METRIC.menuMax,
  "--ed-w-toast-max": EDITOR_METRIC.toastMax,
  "--ed-w-dialog": EDITOR_METRIC.dialog,
  "--ed-h-devicebar": EDITOR_METRIC.deviceBar,
  "--ed-w-keys": EDITOR_METRIC.keys,
  "--ed-hit-min": EDITOR_METRIC.hitMin,
  "--ed-handle": EDITOR_METRIC.handle,
  "--ed-indent": EDITOR_METRIC.indent,
  // Canvas-Hilfen
  "--ed-grid-step": EDITOR_CANVAS.gridStep,
  "--ed-grid-help": EDITOR_CANVAS.gridHelp,
  "--ed-snap-line": EDITOR_CANVAS.snapLine,
  "--ed-marquee": EDITOR_CANVAS.marquee,
  "--ed-selection-edge": EDITOR_CANVAS.selectionEdge,
  "--ed-band-margin": EDITOR_CANVAS.bandMargin,
  "--ed-band-padding": EDITOR_CANVAS.bandPadding,
  // Typografie
  "--ed-font-display": EDITOR_TYPE.fontDisplay,
  "--ed-font-body": EDITOR_TYPE.fontBody,
  "--ed-font-mono": EDITOR_TYPE.fontMono,
  "--ed-text-10": EDITOR_TYPE.size10,
  "--ed-text-11": EDITOR_TYPE.size11,
  "--ed-text-12": EDITOR_TYPE.size12,
  "--ed-text-13": EDITOR_TYPE.size13,
  "--ed-text-15": EDITOR_TYPE.size15,
  "--ed-text-17": EDITOR_TYPE.size17,
  "--ed-lh-10": EDITOR_TYPE.lh10,
  "--ed-lh-11": EDITOR_TYPE.lh11,
  "--ed-lh-12": EDITOR_TYPE.lh12,
  "--ed-lh-13": EDITOR_TYPE.lh13,
  "--ed-lh-15": EDITOR_TYPE.lh15,
  "--ed-lh-17": EDITOR_TYPE.lh17,
  "--ed-track-micro": EDITOR_TYPE.trackMicro,
  "--ed-track-display": EDITOR_TYPE.trackDisplay,
  "--ed-weight-regular": EDITOR_TYPE.weightRegular,
  "--ed-weight-medium": EDITOR_TYPE.weightMedium,
  "--ed-weight-semibold": EDITOR_TYPE.weightSemibold,
  // Bewegung
  "--ed-t-0": EDITOR_MOTION.t0,
  "--ed-t-1": EDITOR_MOTION.t1,
  "--ed-t-2": EDITOR_MOTION.t2,
  "--ed-t-3": EDITOR_MOTION.t3,
  "--ed-t-4": EDITOR_MOTION.t4,
  "--ed-t-brand": EDITOR_MOTION.tBrand,
  "--ed-ease-out": EDITOR_MOTION.easeOut,
  "--ed-ease-in-out": EDITOR_MOTION.easeInOut,
  "--ed-ease-drawer": EDITOR_MOTION.easeDrawer,
  "--ed-ease-standard": EDITOR_MOTION.easeStandard,
  "--ed-ease-linear": EDITOR_MOTION.easeLinear,
};

export function editorTokensCss(selector = ":root"): string {
  return `${block(selector, EDITOR_TOKENS)}\n`;
}

export const EDITOR_TOKENS_CSS = editorTokensCss();
