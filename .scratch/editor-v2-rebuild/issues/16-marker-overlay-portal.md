# Editor v2 - Marker-Overlay im Portal (B9)

Status: offen
Abhaengig von: nichts (Aufgabe 19 aus ui-aufgaben.md, bislang „hängt an nichts")
Muss liegen: ERSTER SCHRITT von Phase 3 bzw. Ende Phase 2 — vor dem Inspektor-Feinschliff
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B9

## Ziel

Die In-Frame-Marker (`CANVAS_CHROME_CSS` in editor/src/canvas/rules.ts) tragen hardgecodete
Alt-Palette: Auswahl `#d004d4` (Alt-Magenta), Hover `#0ea5e9` (Sky), Label-Badge Magenta.
Sie sind der einzige sichtbare Rest der alten Palette — und er läuft genau IM Content-Frame,
wo Tokens laut eigener Regel verboten sind (Inhaltsneutralität: 0 `--ed-*` im iframe).
Der ui-plan Abschnitt 8 löst das bereits richtig: Overlay in einem Portal ÜBER dem Canvas,
Doppelkante aus zwei festen Farben. Damit wird die Inkonsistenz (magenta Auswahl im
Tiefwasser-Editor) behoben und die Palette-Regel bleibt intakt.

## Umfang (entspricht ui-aufgaben Aufgabe 19, verbindlich nach ui-plan Abschnitt 8)

1. **Portal statt In-Frame:** Selektions-/Hover-Ringe, Plaetzchen, Griffe und
   Groessenanzeige rendern in einem Overlay-Element ÜBER dem Canvas
   (`pointer-events: none`, `role="presentation"`, kein Tab-Ziel — Regeln aus dem Plan).
   `CANVAS_CHROME_CSS` verliert die Marker-Regeln; im Frame bleibt nur
   `[data-node-id] { cursor: pointer; }`.
2. **Doppelkante:** aussen 1px `rgb(1 40 60 / 0.55)`, innen 1px `--ed-signal-select`;
   Auswahl 2px, Hover 1px. Begründung (Plan §8): eine der beiden Linien erreicht immer 3:1,
   auf hellem und dunklem Inhalt. Kein Magenta, kein Sky mehr.
3. **Geometrie-Brücke:** die Overlay-Positionen aus den Frame-Rects rechnen (getBoundingClientRect
   des Knotens im Frame + Frame-Offset in der Bühne), gedrosselt 20ms (Muster
   `use-element-rect` aus ui-elementor §20) und bei Zoom-Wechsel sofort neu.
4. **Verdeckung:** liegt das Ziel hinter einem anderen Element, keinen Ring zeichnen, die
   Auswahl im zukünftigen Explorer zeigen (Plan-Regel; die Explorer-Anzeige selbst ist
   Ticket 03 — hier genügt das Unterdrücken des Rings).
5. Griffe 8x8px mit 24x24px Trefferfläche (Plan §8) — die Interaktion (Ziehen) ist B7/
   Ticket 12; dieses Ticket liefert die visuellen Ziele.
6. Nachweis im Browser-Test: kein `#d004d4` und kein `#0ea5e9` im gerenderten Editor-DOM;
   die Marke „0 `--ed-*` im iframe" bleibt bestehen (Marker sind jetzt außerhalb).

## Abnahme

- Auswahl/Hover-Visuals aus Tokens (Tiefwasser 300), messbar gegen `tokens.ts`.
- Rahmen auf hellem Inhalt und auf dunklem Bild sichtbar (zwei Aufnahmen, je eine Linie
  erreicht 3:1) — Plan-Prüfkriterium.
- Zoom-Änderung verschiebt Overlay ohne Flackern (drosselte Messung, kein Layout-Thrashing).
- `packages/app/test/canvas-browser.test.ts` erweitert: Overlay im Portal, keine
  Alt-Farben; `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.
