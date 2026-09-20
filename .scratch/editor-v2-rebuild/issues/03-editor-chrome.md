# Editor v2 - Editor-Chrome und Verhalten (Phase 3)

Status: offen — **Scheibe 1 (Explorer, Kontextmenü, Spotlight) erledigt (20.09.)**
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
(Punkt 5), Design/Live-Toggle + Zoom-Footer (Punkt 6), Alt-Hover-Inspect-Ladder (Punkt 7),
Explorer-Drag mit Zyklus-Schutz, Site-/Media-Tabs, Copy/Paste und Wrap-to-Container
(Punkte 1/2); das Editor-Designsystem (Punkt 8) ist als E16-P0-Grundhaut begonnen.
