# Editor v2 - DnD, Plus-Punkte und Einfügelinie vorziehen (B7)

Status: **erledigt (20.09.)** — DnD, Plus-Punkte und Einfügelinie im Canvas; ein Zug ist ein Undo-Eintrag
Abhaengig von: 01-widget-engine-canvas (insert.ts, Selektion, Frames stehen); parallel zu Ticket 02
Entscheid: aus Ticket 01 Punkt 7 („bewusst noch nicht gebaut") in einen eigenen Prä-Phase-2-Sprint
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B7

## Ziel

Ticket 02 macht den Editor zum Wertesetzen-Werkzeug; ohne DnD bleibt er für Menschen ein
Formular über einem Baum und die Phase-2-Abnahme („Ein Container wird komplett per Inspektor
umgestylt") ist nur mit Agenten erprobbar. Die Planungs-Mechanik existiert vollständig
(`insertPlan`, `insertMutation`, `slotRejection`, `childRejection` mit konkreten Ablehnungsgründen) —
DnD muss sie nur benutzen. Deshalb wird Ticket 01 Punkt 7 hierher gezogen und VOR der
Inspektor-Politur ausgeführt.

## Umfang

1. **DnD im Canvas:** Quelle ist (a) die Ebene im zukünftigen Explorer ist NICHT Teil dieses
   Tickets (Ticket 03) — Quelle hier ist der Widget-Katalog (Klick-Alternative: ziehen) und
   ein vorhandener Knoten (Umsortieren). Ziel-Ermittlung über die bestehende Planung:
   `insertPlan(document, selection, primitive, position)` für Katalog-Quellen;
   für Umsortieren: Ziel-Eltern + Index berechnen, dann `moveNode`-Mutation. Ablehnungen
   zeigen den vorhandenen Grund-Text (Slot fehlt, Typ nicht erlaubt, Slot voll).
   Beim Ziehen: `dragCoalesceKey(nodeId)` (store.ts) — der ganze Zug ist ein Undo-Eintrag.

2. **Plus-Punkte:** an Hover-Kanten eines Containers; Klick öffnet den Katalog am Punkt,
   Einfügen per bestehender `insertPlan`-Logik („hinein" am Punkt des Containers,
   „hinter" an der Kante zwischen zwei Geschwistern).

3. **Einfügelinie:** 2px-Linie (Lime, Token `--ed-snap-line` aus ui-plan Abschnitt 0)
   als unlayered Canvas-Chrome (Portal-Overlay wie Aufgabe 19); ein unzulässiges Ziel
   zeigt die Linie in `--ed-signal-danger` und KEINE Marke — Übernahme der Explorer-Regel
   aus ui-plan Abschnitt 3.

4. **Kein DOM-Basteln im Content-Frame:** Drag-Preview und Linie leben im Overlay
   (pointer-events: none); der Content-Frame bleibt unberührt (Inhaltsneutralität).

5. Warnungs-Artefakt: Während eines Zugs Rasterhilfe ausblenden (ui-plan Abschnitt 10,
   Muster `isDragActiveFromDom`) — hier aufs eigene Overlay angewandt.

## Bewusst NICHT (bleibt Ticket 03)

- Explorer-Drag (Baum-Umsortierung), Zyklus-Schutz im Explorer, Multi-Drag.
- Wrap-to-Container (Kontextmenü, Ticket 03).

## Abnahme

- Widget aus dem Katalog ziehen: erscheint am Drop-Ort, ein Undo-Eintrag; unzulässiges
  Ziel zeigt rote Linie und lässt nicht fallen.
- Bestehenden Knoten ziehen: Umsortierung per moveNode, ein Undo-Eintrag,
  `validateDocument` bleibt gruen.
- Plus-Punkt-Einfügen erzeugt denselben Zustand wie Katalog-Klick (gleiche Mutation,
  gleiche Ablehnungsgründe).
- Kein Konsolenfehler, kein Fremd-Netzwerk; `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Ergebnis 20.09. (umgesetzt)

**Planung pur (`canvas/dnd.ts`):** `dropPositionFor`, `resolveInsertDrop`, `resolveMoveDrop`,
`resolveDrop`, `isContainer` — Ablehnungen tragen den vorhandenen Grund-Text (Slot fehlt,
Typ nicht erlaubt, Slot voll).

**DOM-Schicht (`canvas/dnd-dom.ts`):** `createDropController` mit Katalog-Chips (Klick und
Ziehen), Einfügelinie im Overlay (`--ed-snap-line`, `--ed-signal-danger` bei unzulässigem
Ziel), Plus-Punkten an Hover-Kanten und Knoten-Umsortierung; ein Zug ist per
`dragCoalesceKey` **ein** Undo-Eintrag. `insert.ts` kennt jetzt `before|after|into`;
`canvas.ts`/`styles.ts` verdrahten Overlay und Streifen, `canvas/index.ts` exportiert die
Planung.

**Fund + Fix:** `moveNode` innerhalb derselben Liste indiziert nach dem Entfernen — der
Editor normalisiert den Index (`raw > located.index ? raw - 1 : raw`), Regressionstest in
`operations.test.ts`.

**Paritäts-Nachzug (E16):** Der Katalog-Streifen war 32,78 px hoch und schob den
Canvas-Rahmen auf einen halben Pixel (Screenshot 1 px größer, Glyphen-Rasterisierung
driftet) — Chips jetzt 28 px, Fuß 5 px (ganzzahlig); `widget-slice` wieder 0,57 % Diff.

**Tests:** `packages/editor/test/canvas/dnd.test.ts` (12) + Browser-Test (Plus-Punkt-
Einfügen, Umsortieren `divider, divider, hero`); Gesamtlauf siehe Ledger, Welle 1 Teil 4.
Abnahme erfüllt; Explorer-Drag/Multi-Drag/Wrap bleiben bewusst bei Ticket 03.
