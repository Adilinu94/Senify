# Editor v2 - Editor-Chrome und Verhalten (Phase 3)

Status: offen
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
