# Artefakt 24: Editor-Alignment — Instatic-Muster auf Puck (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Editor-Alignment: Instatic-Muster".
> Grundlagen: `artifacts/09` (Editor-Basis auf Puck), `22` (Content-Workspace), `23` (Vorlagen/Live-Vorschau), `research/16` (Puck-Basis), `23` + `26` (Instatic-Editor-Muster), `research/28-puck-gap.md` (Gap-Analyse, Puck v0.23.0).

## Entscheidungen (Wizard, 8/8)

1. **Zwei Modi wie Instatic:** **Design-Modus** (je Breakpoint ein eigenes Fenster, nebeneinander, Zoom/Pan, Start ~50 %) + **Live-Modus** (ein Fenster in echter Größe, normal scrollbar); beide voll editierbar.
2. **Inline-Text-Editing in v1:** Doppelklick → direkt tippen (contentEditable, plaintext); Änderung committet live in **alle Breakpoints**; Escape = Revert (ein Undo-Eintrag).
3. **Explorer-Tabs:** Ebenen · Seiten · Vorlagen · Medien (Instatic-`PanelRail`-Muster, auf unsere Bereiche zugeschnitten).
4. **Cmd+K-Spotlight:** Suche über Seiten, Sektionen und Aktionen (Seite wechseln, Sektion einfügen, Publizieren …).
5. **Feinschliff komplett:** Selection-/Hover-Rings, Alt-Klick-Ebenen-Auswahl (Inspect-Ladder), Mini-Toolbar am gewählten Element (Duplizieren/Löschen/Verschieben).
6. **URL-Deep-Links:** `?page=&node=&mode=&bp=` — Zustand teilbar/wiederherstellbar.
7. **Medien-Fenster im Editor:** Suchen, Hochladen, Einsetzen (arbeitet mit Ticket 25 zusammen).
8. **Design-Modus voll in v1:** Mehrfach-Ansicht wird trotz L-Aufwand gebaut (größter Einzelblock des Editors).

## 1. Editor-Modi

- **Design-Modus:** pro Breakpoint (Desktop/Tablet/Mobile) ein **eigenes iframe** in echter Breite; nebeneinander; Zoom + Pan über die Fläche (Start 50 %, Instatic-Parität); echte Media-Queries/`vw`-Einheiten; **alle Fenster voll editierbar**.
- **Live-Modus:** **ein** Frame in echter Größe, normal scrollbar (Testen/Scrollen); Umschalter Design ⇄ Live.
- **Technik (Eigenbau-Schicht auf Puck):** Puck rendert genau **einen** `#preview-frame` (globaler Lookup) und DnD/Overlays sind Single-Canvas ausgelegt → wir bauen einen **Frame-Manager**: ein Daten-Store, mehrere Preview-Instanzen; alle Frame-Lookups (Overlays, DnD, Hover) werden **frame-bewusst**.
- **Bekannte Puck-Risiken einplanen:** Issue #1829 (ActionBar-Overlay mountet teils nie), #1794 (Inline-Editing im Root); Puck-Version **pinnen**, Upgrade-Tests (0.x-Breaking-Changes).

## 2. Inline-Text-Editing

- Puck bringt die Basis **out-of-the-box** (Gap: OOB, Aufwand S) — Anforderungs-Delta von Senify:
  - Doppelklick auf das echte Element → `contentEditable` (plaintext-only);
  - jeder Keystroke committet über die kanonische Mutation `updateNodeProps` (Artefakt 01) → **live in allen Frames/Breakpoints**;
  - **Escape = Revert**; der gesamte Edit zählt als **ein** Undo-Eintrag;
  - kein Rich-Text (keine Fett/Listen im Inline-Modus) — Struktur-Rich-Text bleibt beim `richtext`-Control im Panel.

## 3. Shell-Panels (explorer & tools)

```
Linke Leiste (Tabs)                          Rechte Leiste
├─ Ebenen   Layer-Baum der Seite             ├─ Eigenschaften (registry-generiert, 08/09)
├─ Seiten   Site-Explorer                    ├─ Theme (semantische Tokens, 07)
│           + Abschnitt „Vorlagen"           └─ Motion (Preset + Intensity, 03)
│             (Layouts & Entry-Templates, 23)
└─ Medien   Library (Ordner/Tags, Ticket 25)
```

- **Vorlagen** leben im Seiten-Tab als eigener Abschnitt (Layout/Entry-Template mit Badge, keine eigene Route — Artefakt 23).
- **Cmd+K-Spotlight:** Index aus Seiten + Registry (Sektionen mit Thumbnails) + Aktionen; Tastatur-first.
- **Feinschliff:** Rings + Alt-Inspect + Element-Toolbar über Puck-Overrides (Gap: Override, Aufwand M).

## 4. Deep-Links & Zustand

- URL-Sync: `?page=<id>&node=<id>&mode=design|live&bp=desktop` — Auswahl/Mode/Breakpoint überleben Reload und sind teilbar.
- Undo/Redo über Patch-Stack (09) unverändert; „Restore as Draft" aus dem History-Panel (05).

## 5. Abgrenzungen (bleibt wie entschieden)

- **Content-Workspace (Entries)** ist ein eigener Bereich (22) — die Entry-**Live-Vorschau** (23) lebt dort, nicht im Puck-Editor.
- **Review** bleibt Teil des Projekts (06); kein In-Editor-Agent (09).
- Agenten schreiben weiter ausschließlich via MCP (10) — der Editor ist die menschliche Werkbank.

## 6. Gap-Analyse (Umsetzungsnotiz)

| Muster | Puck-Stand | Aufwand |
|---|---|---|
| Breakpoint-Frames nebeneinander (Zoom/Pan) | Eigenbau (Frame-Manager) | **L** |
| Live-Modus (ein Frame, volle Größe) | Override | M |
| Inline-Text-Editing | OOB (+ Delta: Multi-Frame-Commit, Revert) | S |
| Explorer-Tabs (Ebenen/Seiten/Vorlagen/Medien) | Override | M |
| Cmd+K-Spotlight | Eigenbau | M |
| URL-Deep-Links | Eigenbau | S |
| Medien-Fenster | Eigenbau | M |
| Rings + Alt-Inspect + Toolbar | Override | M |
| iframe-Isolation | OOB | S |
| Slots/Fields ↔ Section-Registry | OOB | S |

**Umsetzungsreihenfolge (Vorschlag für die Spec):** 1) Frame-Manager (Multi-Frame) · 2) Panels/Explorer-Tabs · 3) Inline-Delta · 4) Spotlight + Deep-Links + Medien-Fenster · 5) Feinschliff. Details: `research/28-puck-gap.md`.

## 7. Anschlüsse

| Bereich | Ticket |
|---|---|
| Medien-Fenster (Ordner/Tags/Upload-Pipeline) | 25 |
| Programm-Shell: Editor-Einstieg aus dem Projekt, Review-Ansicht | 27 |
| Vorlagen-Tab zeigt Layouts/Entry-Templates | 23 |
| Spec: Aufwandstreiber Frame-Manager als erstes Build-Ticket schneiden | `/to-spec` |
