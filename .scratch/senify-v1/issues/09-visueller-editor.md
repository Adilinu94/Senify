# Visueller Editor

Type: grilling
Status: resolved
Blocked by: 01, 08

Input: `research/16-editor-basis.md`
Input: `research/20-referenzprojekte.md`
Input: `research/22-framer-analyse.md`
Input: `artifacts/01-datenmodell.md`
Input: `artifacts/02-renderer.md`
Input: `artifacts/05-lifecycle.md`
Input: `artifacts/06-approval.md`
Input: `artifacts/07-tokens.md`
Input: `artifacts/08-section-library.md`

## Question

Auf welcher Basis bauen wir den visuellen Editor (Puck, Eigenbau, anderes), und was kann er in v1: Text/Medien, Props, Sektionen hinzufügen/verschieben/löschen, Token-Wechsel?

Wie greifen Agenten- und Menschen-Edits auf denselben JSON-Baum zu, ohne sich zu überschreiben?

## Answer

Editor entschieden (6/6 Wizard). Artefakt: [artifacts/09-editor.md](../artifacts/09-editor.md).

- **Puck (MIT)** als Basis; Mapping-Layer auf den kanonischen NodeTree; Editor-Aktionen sind **kanonische Mutationen** (01) — identische Schreib-API wie Agenten.
- **Volle Werkbank:** Sektionen CRUD/Reorder, Props (generiert aus Registry), Varianten, Breakpoint-Overrides (Badges + Reset), Theme-Picker, Motion-Intensity, Undo.
- **Optimistisches Locking** (`baseDraftVersion` pro Mutation) — kein stilles Überschreiben; Agenten bekommen denselben Konfliktfehler (Re-Read + Retry).
- **Live-Canvas + „Echte Preview"** (Build-Parität, Artefakt 02).
- **Undo/Redo + History-Panel** (Revisionen, „Restore as Draft").
- Kein In-Editor-Agent — Agenten bleiben extern (MCP); Review (06) ist der Übergabe-Punkt.

Inputs verdrahtet: 10, 15.

## Comments

- **14.09.2026 — Scope-Update:** Nutzer wünscht Editor „ähnlich Instatic" (Deep-Dive: `research/23`). Delta-Ticket **24 Editor-Alignment** übernimmt die Muster (Inline-Text-Editing, Design-/Live-Modi, Breakpoint-Frames nebeneinander, Explorer/Spotlight) auf der Puck-Basis.
