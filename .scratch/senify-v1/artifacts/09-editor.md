# Artefakt 09: Visueller Editor (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Visueller Editor".
> Grundlagen: `research/16` (Puck), `research/20` (OpenPage-/Instatic-Editor-Muster), `research/22` (Framer-Control-Modell), `artifacts/01` (Mutationen), `02` (Renderer/SDK), `05` (Draft/Revision/Undo), `06` (Preview/Diff), `07` (Theme), `08` (Registry → UI).

## Entscheidungen (Wizard, 6/6)

1. **Basis:** Puck (MIT) eingebettet; dünner Mapping-Layer auf den kanonischen NodeTree; Puck AI/Cloud außen vor.
2. **Scope:** volle Werkbank in v1.
3. **Concurrency:** optimistisches Locking (`baseDraftVersion` pro Mutation).
4. **Preview:** Live-Canvas + „Echte Preview"-Build.
5. **Breakpoints:** Toolbar-Umschalter + Override-Badges + Reset je Property.
6. **Undo/History:** Undo/Redo über Mutations-Patches + History-Panel („Restore as Draft").

## Architektur

```
Puck Editor (React, separate App — Artefakt 02)
  ├─ Canvas: rendert Section-Komponenten aus dem Section-SDK (markup-first)
  ├─ Struktur-Panel: NodeTree (flach, 01)
  ├─ Property-Panels: GENERIERT aus der Registry (08: Control + Metadaten)
  ├─ Theme-Panel: semantische Token-Picker (07)
  ├─ Motion-Panel: Preset + Intensity-Dial (03)
  └─ Toolbar: Undo/Redo · Breakpoint · Varianten · „Echte Preview" · Publish-Handoff
```

- **Mapping:** NodeTree ⇄ Puck-Daten über einen dünnen Adapter; **jede Editor-Aktion emittiert eine kanonische Mutation** (Artefakt 01) — Editor und Agent nutzen exakt dieselbe Schreib-API.
- **Konflikte:** Mutationen tragen `baseDraftVersion`; bei Mismatch klarer Fehler („Draft hat sich geändert — neu laden"); Agenten bekommen denselben Fehler (Re-Read + Retry). Kein stilles Überschreiben.
- **Override-Badges:** Props mit Breakpoint-Override zeigen Badge + Reset (Framer-Stil).
- **History:** Cmd+Z/Z über Patch-Stack; Panel listet Revisionen (05) + „Restore as Draft".
- **Kein In-Editor-Agent:** Agenten arbeiten extern über MCP; der Editor ist die Werkbank, das Review (06) der Übergabe-Punkt.

## Registry → UI (Generierung)

| Control | UI |
|---|---|
| `text` | Input/Textarea |
| `richtext` | Inline-Editor (Runs) |
| `number` | Number-Input (min/max/step) |
| `boolean` | Switch |
| `enum` | Select |
| `color` | Token-Picker (semantische Rollen zuerst; Literal erlaubt) |
| `asset` | AssetPicker (Media-Library, Ticket 15) |
| `link` | Page-/URL-Picker |
| `list` | List-Editor (Add/Remove/Reorder nach Item-Schema) |
| `slot` | Slot-Picker (Sektionen aus `allowedTypes`) |

Gruppen (Content/Aktionen/Styling) als Panel-Sections; `hidden`-Bedingungen steuern Sichtbarkeit — **alles aus dem Registry-Schema**, keine handgebauten Panels.

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Editor und Tools teilen Mutations; `baseDraftVersion` in Tool-Contracts | 10 |
| AssetPicker braucht Media-Library-API | 15 |
| Diff-/Preview-Komponenten optional mit Approval geteilt | 06 |
