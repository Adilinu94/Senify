// Ziehen am Zahlenfeld ("scrub"): die reine Rechnung.
//
// Der Store kann eine Burst-Faltung bereits (`typingCoalesceKey`), und die
// Slider im Inspektor nutzen sie. Der Zahlen-Eingabe fehlte die Geste: man
// konnte tippen oder die zwei Pfeile klicken, aber nicht am Feld ziehen, um den
// Wert stufenlos zu aendern. Genau das ist in jedem reifen Editor die
// haeufigste Art, eine Zahl zu setzen.
//
// Diese Datei enthaelt nur die Rechnung, damit sie ohne DOM pruefbar ist:
//
//   - waagerechte Mausbewegung -> Wert, mit einer festen Empfindlichkeit,
//   - Klammerung an min/max (sonst zieht man stumm ins Leere),
//   - Shift = 10x feiner, Alt = 10x groeber (das erwartete Verhalten),
//   - Schrittweite bleibt erhalten (Dezimalstellen eines 0.5er-Schritts).
//
// Der Aufrufer entscheidet, WANN committet wird: waehrend des Ziehens live mit
// einem festen Coalesce-Schluessel (ein Undo-Eintrag fuer den ganzen Zug), am
// Ende ein letzter Commit.

export type ScrubOptions = {
  start: number;
  deltaPx: number;
  step: number;
  min?: number | undefined;
  max?: number | undefined;
  /** Shift gedrueckt: feiner. Alt gedrueckt: groeber. */
  fine?: boolean;
  coarse?: boolean;
};

// Wie viele Pixel fuer einen Schritt. 4 px ist grob genug, dass man 100 px
// ziehen kann, ohne am Rand zu landen, und fein genug fuer einzelne Schritte.
const PIXELS_PER_STEP = 4;

export function scrubValue(options: ScrubOptions): number {
  const step = Number.isFinite(options.step) && options.step > 0 ? options.step : 1;
  const start = Number.isFinite(options.start) ? options.start : 0;
  const deltaPx = Number.isFinite(options.deltaPx) ? options.deltaPx : 0;

  // Shift halbiert die Empfindlichkeit nicht, es achtelt sie - sonst waere der
  // Unterschied bei kleinen Werten nicht spuerbar.
  const factor = options.fine === true ? 0.1 : options.coarse === true ? 10 : 1;
  const steps = (deltaPx / PIXELS_PER_STEP) * factor;
  const raw = start + steps * step;

  // Auf die Schrittweite runden, damit 0.5er-Schritte keine Float-Reste
  // hinterlassen (0.30000000000000004).
  const decimals = decimalsOf(step);
  const snapped = Number(raw.toFixed(Math.min(10, decimals)));

  let value = snapped;
  if (options.min !== undefined) value = Math.max(options.min, value);
  if (options.max !== undefined) value = Math.min(options.max, value);
  return value;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}
