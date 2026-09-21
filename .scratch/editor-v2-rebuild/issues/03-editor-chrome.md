# Editor v2 - Editor-Chrome und Verhalten (Phase 3)

Status: **erledigt (20.09.)** — Scheibe 1 (Explorer, Kontextmenü, Spotlight), Punkt 6 (Design/Live-Toggle, Zoom-Footer, Frame-Labels, Dimming), Punkt 4 (Inline-Text), Punkt 5 (Verlauf), Punkt 7 (Keyboard), Punkt 1 Rest (Drag + Site-/Media-Tabs) und Punkt 2 Rest (Copy/Paste, Wrap) sind umgesetzt. Siehe „Ergebnis Runde 2 (20.09.)".
Abhaengig von: 02-style-engine-inspector

## Ziel

Die Arbeitsflaeche um Elementor-Gefuehl komplettieren. Phase 3 des Umbauplans.

## Umfang

1. Explorer: Layer-Tree, Rename, Lock/Hide je Breakpoint, Drag-Umsortierung mit
   Zyklus-Schutz, Site-Tabs (Pages / Templates / Components), Media-Tab.
2. Kontextmenue: Duplicate, Copy/Paste (inkl. Style-Rules der Subtree), Wrap in Container,
   Navigator-Verknuepfung, Delete.
3. Spotlight (Cmd+K): Port der bestehenden spotlight.ts-Logik in den React-Store.
4. Inline-Text-Editing: Doppelklick auf Text-Widgets, contentEditable plaintext-only auf
   dem echten Element, Coalesce-Key -> Tipp-Burst = 1 Undo-Eintrag, Escape revertiert
   den Burst. Port der inline-text.ts-Sanitisierung.
5. Undo/Redo-History im UI: Verlauf mit Zeit (T17-M4-Muster), Redo, Verlauf pro Dokument.
6. Design/Live-Toggle, Zoom-Footer (0.25-2.0, Reset Cmd+0), Frame-Labels,
   Inactive-Frame-Dimming mit Aktivierungs-Tooltip.
7. Keyboard: Delete, Cmd+D, Cmd+Z/Shift+Z, Alt+Hover-Inspect-Ladder (Instatic-Muster),
   Escape-Regeln, Tab-Block im Design-Frame.
8. Editor-Designsystem: Token-Glossar (Surfaces/Text/Canvas-Neons), CSS Modules Pflicht,
   Primitive-Regel (jeder Knopf aus src/ui), dunkler Editor-Chrome damit User-Content dominiert.

## Abnahme

- Alle Aktionen ueber Tastatur erreichbar
- Undo/Redo O(Change), Verlauf zeigt Zeit und Aktion
- Inline-Editing ist byte-identisch zum Publish (kein Overlay, echtes Element)
- Live-Modus zeigt nativen Scroll bei 100%, Design-Modus behält Zoom

## Ergebnis Scheibe 1 (20.09., umgesetzt) — Explorer, Kontextmenü, Spotlight

**Explorer:** `explorer.ts` baut die Layer-Liste (`buildEditorLayerList`,
`EditorLayerItem`, `editorNodeLabel`, `editorNodeSnippet`); `explorer/panel.ts`
(`createExplorer`) rendert den Baum mit Roving-Tabindex und voller Tastatur
(Pfeile/Home/End/Enter, F2-Rename über die Text-Prop, Delete, Shift+F10-Kontextmenü,
Escape), das Kontextmenü bietet Duplizieren/Verschieben/Hide/Lock/Delete, nach dem Menü
geht der Fokus zurück, beim Selektieren `ensureVisible`; `explorer/styles.ts` liefert die
Haut.

**Spotlight:** `spotlight.ts` (`buildEditorSpotlightIndex`, Kommando `insert-primitive`) +
`spotlight/dialog.ts` (`createSpotlightDialog`, role=dialog/listbox,
aria-activedescendant, Fokus-Rückgabe); Ctrl+K in `app.js` (der Shell-Befehl weicht auf
der Editor-Seite).

**Kleinigkeiten:** `dom.ts` um `activeElement`/`scrollIntoView`; `browser-entry.ts`
exportiert `getPrimitive`/`primitiveTypes`; Fixes: NodeList→`Array.from`, Menü-Escape über
einen Document-Listener, Plus-Punkte nur bei sichtbarem Overlay.

**Tests:** `packages/editor/test/explorer.test.ts` (10) + Browser-Test. Gesamtlauf siehe
Ledger, Welle 1 Teil 4.

**Offen (Rest von Ticket 03):** Inline-Text-Editing (Punkt 4), Undo/Redo-History im UI
(Punkt 5), Alt-Hover-Inspect-Ladder (Punkt 7), Explorer-Drag mit Zyklus-Schutz,
Site-/Media-Tabs, Copy/Paste und Wrap-to-Container (Punkte 1/2); das Editor-Designsystem
(Punkt 8) ist als E16-P0-Grundhaut begonnen.

## Ergebnis Punkt 6 (20.09., umgesetzt) — Design/Live, Zoom-Footer, Labels, Dimming

**Design/Live-Toggle:** Mode-Gruppe in der Canvas-Topbar (`data-mode="design|live"`,
aria-pressed); im Live-Modus wird der Frame neu aufgebaut (ein Blatt, aktiver Breakpoint,
echte Größe, nativer Scroll — M4 Stufe 1), die Editor-Haut bleibt draußen (keine Marker,
kein Zeiger-Cursor, kein Forced State), Klicks behalten das Seitenverhalten. Der
Spotlight-Befehl `set-mode` und die Session (`ui.mode`, persistiert) sind verdrahtet.

**Zoom-Footer:** Zoom-Bedienung liegt jetzt im Footer unter der Bühne (Meldung links,
Zoom rechts), das Zoom-Label ist der Reset auf 100 %, Strg/Cmd+0 resettet ebenfalls;
im Live-Modus sind Zoom und Forced-State-Schalter deaktiviert (Live ist 100 %).

**Frame-Labels + Dimming:** Jedes Blatt trägt ein Label („Desktop · 1440 px", im
skalierten Blatt gegenskaliert lesbar); der aktive Breakpoint ist hell, inaktive Blätter
dimmen (`data-active`, Tooltip „Zum Bearbeiten aktivieren"), ein Klick in ein Blatt
aktiviert seinen Breakpoint — die Session spiegelt ihn für den Inspektor.

**Tests:** `canvas/device.test.ts` (+2), `canvas/rules.test.ts` (+1),
`state/session.test.ts` (+1, 2 angepasst), Browser-Test (`canvas-view-browser.test.ts`)
um Labels/Dimming/Aktivierung, Zoom-Reset und den Live-Modus erweitert (ein Frame,
`window.gsap` + `motion-data` + Runtime im Frame, Rückkehr zu drei Blättern). Zahlen im
Ledger (M4 Stufe 1 + Punkt 6, 20.09.).

## Ergebnis Runde 2 (20.09., umgesetzt) — Punkte 1 Rest, 2 Rest, 4, 5, 7

**Punkt 4 — Inline-Text:** Doppelklick auf ein Text-Blatt startet die Session
(`contenteditable="plaintext-only"` auf dem echten Element, `[data-inline]`-Cursor);
Schreiben läuft als `setNodeProp` mit `typingCoalesceKey(nodeId, key, device)` (Tipp-Burst
= 1 Undo-Eintrag), Escape revertiert und **entfernt** den gefalteten Eintrag
(`store.history.remove`, wenn der Coalesce-Key passt), Enter/Blur/Tab beenden; `refresh()`
rendert während der Session nicht (Caret-Schutz). `react-renderer.tsx` annotiert jetzt auch
Katalog-Primitives (`getPrimitive().controls`, kinds `text`/`textarea`, Root erlaubt).
**Fund:** die Plus-Punkte kurzer Knoten (Höhe < 36) lagen über dem Text und schluckten den
Doppelklick — sie werden jetzt außerhalb platziert und beim Verlassen des Knotens versteckt
(`dnd-dom.ts showPluses`).

**Punkt 5 — Verlauf:** `store.restoreTo(entryId)` springt über den normalen Undo/Redo-Gate;
Blatt `history/dialog.ts` (+ `styles.ts`) zeigt die Einträge neueste zuerst (Zeit
`HH:MM:SS`, Label, „jetzt"-Markierung, `data-current`/`data-future`), Klick springt, Escape
schließt (dokumentweiter Listener, Fokus-Rückgabe). „Verlauf"-Knopf in der History-Gruppe
der Canvas-Topbar. **Semantik:** ein neuer Apply nach Undo verwirft den Redo-Future
(HistoryStack) — der Browser-Test insertet dafür zweimal hintereinander.

**Punkt 7 — Keyboard:** eine `shortcut()`-Schicht für Dokument und Frames: Cmd/Ctrl+0
Zoom-Reset, Cmd/Ctrl+Z, Shift+Cmd+Z / Cmd+Y, Cmd+D (Duplicate), Cmd+C/V (Clipboard),
Delete/Backspace (nur außerhalb von Textfeldern, `isTextEntry`), Escape → Elternknoten,
Enter → erster Kindknoten; im Design-Frame blockt Tab den Fokuswechsel, Inline-Keys gewinnen
vor den Shortcuts (`DomEvent.defaultPrevented` als Schichten-Vertrag). Alt+Klick wählt den
Elternknoten, Alt+Hover hebt ihn (Overlay-Option `parent`).

**Punkt 2 Rest — Copy/Paste/Wrap:** `store.applyBatch(inputs, options)` = mehrere Ops
atomar, **ein** History-Eintrag (Forward-Patches konkateniert, Inverse umgekehrt);
`state/clipboard.ts` (`copyNode`/`pasteNode` via `duplicateNode` inkl. Scoped-Rules,
`wrapNode` via applyBatch, `copiedNode`, `clearClipboard`); Kontextmenü um Kopieren,
Einfügen, In Wickeln, Im Navigator zeigen erweitert; Cmd+C/V auch im Explorer-Baum und in
der Canvas-Schicht. Bewusst kein neues Contract-Op: Wrap läuft als Batch aus
`insertNode`+`moveNode` und erreicht die Engine nie als eigenes Op.

**Punkt 1 Rest — Drag + Site-Tabs:** Explorer-Zeilen sind `draggable`; `dragover`/`drop`
nutzen `dropPositionFor`/`isContainer`/`resolveMoveDrop` aus `canvas/dnd.ts` (Zyklus-Schutz
sichtbar, `data-drop` = before/after/into/rejected, rot = rejected, kein Re-Render während
dragover). Site-Tabs: `ExplorerTabSource`/`ExplorerTabItem`, `options.tabs`, `setTab`/
`activeTab`; `app.js` verdrahtet „Seiten" (Hash-Navigation) und „Medien"
(`canvas.insert("image", "after", { asset: id })`, neuer `props`-Parameter an
`insertAt`/`insert`). Vorlagen/Komponenten bleiben bei O14 (keine Datenquelle; Templates
haben nur die PUT-Route).

**Tests:** `test/state/clipboard.test.ts` (neu, 4), `test/state/store.test.ts` (+1
restoreTo), `test/canvas/overlay.test.ts` (+parent), `test/state/persist.test.ts` (+1
Scoped-Transport), Browser-Test (`canvas-browser.test.ts`) um Inline-Block, Verlauf-Blatt
und Keyboard-Block erweitert; `canvas-view-browser.test.ts` prüft die Tabs.
Zahlen im Ledger (Runde 2, 20.09.).
