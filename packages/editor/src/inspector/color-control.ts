// Der Farbwaehler als eigenes Modul: Verlauf, Farbton-Streifen, Zeiger-Geste.
//
// WARUM AUSGELAGERT: `inspector.ts` ist mit 1 836 Zeilen schon eine der
// groessten Dateien des Repos (R12). Der Waehler haette sie um 189 Zeilen
// wachsen lassen - gegen den Abbau, der gerade laeuft. Diese Datei haelt den
// DOM-Teil; die Rechnung steht in `color-picker.ts` und ist ohne Browser
// geprueft.
//
// Die Naht: der Aufrufer reicht herein, was er hat - das Dokument, ein
// Element-Werkzeug, den Startwert und einen Rueckruf, der den Wert schreibt.
// Hier gibt es keinen Zugriff auf den Store, keine Kenntnis vom Inspektor und
// keine Modulvariable. Genau das macht die Datei pruefbar und den Inspektor
// kleiner.
//
// Zwei Entscheidungen, die den Unterschied machen:
//
//   1. **Das Rechteck wird EINMAL beim Druecken gemessen.** Jeder Commit
//      rendert den Inspektor neu; das gedrueckte Element ist danach abgeloest
//      und misst 0 x 0. Eine Messung je Bewegung wuerde den Zug nach dem
//      ersten Schritt stumm beenden - der Bezugspunkt steht beim Druecken fest.
//   2. **Der Zug haengt am Dokument, nicht an der Flaeche.** Verlaesst der
//      Zeiger den Verlauf, laeuft die Geste weiter, bis er loslaesst. Eine
//      flaechen-lokale Loesung verliert den Faden bei jeder schnellen
//      Bewegung.

import type { DomDocument, DomElement, DomEvent } from "../dom.ts";
import {
  colorFromPad,
  hueFromStrip,
  hueOf,
  hueStripStops,
  padBackground,
  padPosition,
} from "./color-picker.ts";

export type ColorPickerOptions = {
  doc: DomDocument;
  /** Das Element-Werkzeug des Inspektors (`h`). */
  create: (doc: DomDocument, tag: string, spec: ElementSpec) => DomElement;
  /** Der Wert, mit dem der Waehler startet (Hex, rgb(), `transparent`, ...). */
  value: string;
  /** Ein Zug oder Klick schreibt einen Wert. Der Aufrufer entscheidet, wohin. */
  onPick: (value: string) => void;
};

type ElementSpec = {
  className?: string;
  data?: Record<string, string>;
  attributes?: Record<string, string>;
  text?: string;
};

type Rect = { left: number; top: number; width: number; height: number };

export function renderColorPicker(options: ColorPickerOptions): DomElement {
  const { doc, create: h, onPick } = options;
  const panel = h(doc, "div", {
    className: "ed-color__panel ed-picker",
    data: { role: "color-picker" },
  });

  // Der Startwert. Ist er kein Hex (rgb(), `transparent`, ein Token ohne
  // Aufloesung), bleibt der Griff aus - der Waehler behauptet dann keine
  // Position, die er nicht kennt.
  const startPoint = padPosition(options.value);
  // Der Farbton ist Zustand des Waehlers, nicht des Feldes: Schwarz und Weiss
  // haben keinen eigenen Ton, und der Streifen soll trotzdem dort stehen
  // bleiben, wo der Nutzer ihn hingezogen hat.
  let hue = hueOf(options.value);
  let point = startPoint;

  const pad = h(doc, "div", {
    className: "ed-picker__pad",
    data: { role: "picker-pad" },
    attributes: { style: padBackground(hue) },
  });
  const marker = h(doc, "span", { className: "ed-picker__marker" });
  const placeMarker = (): void => {
    if (point === null) {
      marker.setAttribute("style", "display:none");
      return;
    }
    marker.setAttribute("style", `left:${point.x * 100}%;top:${point.y * 100}%`);
  };
  placeMarker();
  pad.appendChild(marker);

  const strip = h(doc, "div", {
    className: "ed-picker__strip",
    data: { role: "picker-hue" },
    attributes: { style: `background:linear-gradient(to right,${hueStripStops().join(",")})` },
  });
  const stripMarker = h(doc, "span", { className: "ed-picker__strip-marker" });
  stripMarker.setAttribute("style", `left:${(hue / 360) * 100}%`);
  strip.appendChild(stripMarker);

  const applyPadPoint = (clientX: number, clientY: number, rect: Rect): void => {
    point = {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
    placeMarker();
    onPick(colorFromPad(hue, point.x, point.y));
  };

  const applyHue = (clientX: number, rect: Rect): void => {
    hue = hueFromStrip((clientX - rect.left) / rect.width);
    stripMarker.setAttribute("style", `left:${(hue / 360) * 100}%`);
    // Die Flaeche zeigt den neuen Ton; der Griff behaelt Saettigung und
    // Helligkeit, aber die Farbe unter ihm ist jetzt eine andere.
    pad.setAttribute("style", padBackground(hue));
    const position = point ?? { x: 1, y: 0 };
    point = position;
    placeMarker();
    onPick(colorFromPad(hue, position.x, position.y));
  };

  bindDrag(doc, pad, applyPadPoint);
  bindDrag(doc, strip, (clientX, _clientY, rect) => {
    applyHue(clientX, rect);
  });

  const meta = h(doc, "div", { className: "ed-color__meta" });
  meta.appendChild(
    h(doc, "span", {
      className: "ed-color__token-name",
      text: "Feld: Sättigung × Helligkeit · Streifen: Farbton",
    }),
  );

  panel.appendChild(pad);
  panel.appendChild(strip);
  panel.appendChild(meta);
  return panel;
}

// Die Geste: druecken, ziehen (am Dokument), loslassen.
function bindDrag(
  doc: DomDocument,
  surface: DomElement,
  apply: (clientX: number, clientY: number, rect: Rect) => void,
): void {
  // `clientX`/`clientY` und `preventDefault` sind im schlanken DOM-Vertrag
  // optional - ein Ereignis ohne Koordinaten (Tastatur, synthetisch) darf
  // nicht in eine Rechnung mit `undefined` laufen.
  const pointOf = (event: DomEvent): { x: number; y: number } | null =>
    event.clientX === undefined || event.clientY === undefined
      ? null
      : { x: event.clientX, y: event.clientY };

  surface.addEventListener("pointerdown", (event: DomEvent) => {
    event.preventDefault?.();
    const first = pointOf(event);
    if (first === null) return;
    // EINMAL messen, nicht je Bewegung: siehe Kopf dieser Datei.
    const rect = surface.getBoundingClientRect?.();
    if (rect === undefined || rect.width <= 0 || rect.height <= 0) return;
    apply(first.x, first.y, rect);
    const move = (moveEvent: DomEvent): void => {
      const next = pointOf(moveEvent);
      if (next !== null) apply(next.x, next.y, rect);
    };
    const end = (): void => {
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("pointerup", end);
    };
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", end);
  });
}
