# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primär:** eine Einzelperson (Studio, Agentur oder Freelancer), die Websites für sich
oder Kundschaft baut. Sie arbeitet am lokalen Rechner, oft abends, will Seiten
schnell aufbauen, korrigieren und veröffentlichen — ohne Cloud-Zwang und ohne
Abo-Miete auf der eigenen Seite.

**Zweitnutzer:** Agenten (Claude Code, Codex, opencode …) über MCP. Sie bauen und
ändern Seiten auf demselben Modell wie der Mensch: kanonische Mutationen, Undo,
Audit, Review.

## Product Purpose

Senify ist ein lokaler Website-Builder. Seiten entstehen auf einem kanonischen
NodeTree, werden über einen offenen CSS-Raum gestaltet, in Preview und Review
geprüft, über Releases veröffentlicht und als statisches HTML/CSS/JS gebacken.
Erfolg heißt: Ein Agent baut eine kleine Site, ein Mensch korrigiert sie im echten
Editor, Review zeigt belastbare Diffs, ein Klick veröffentlicht — und ein Rollback
funktioniert.

## Positioning

Mensch und Agent arbeiten auf **demselben Vertrag**: ein kanonisches Dokument,
dieselben Mutationen, dieselben Guardrails, dasselbe Paritäts-Tor. Der Agent ist
kein separater Modus und keine Chat-Spielwiese — er schreibt in denselben Entwurf,
den der Editor zeigt. Dazu lokale Datenhoheit (Engine, Postgres, Assets lokal) und
offenes Ergebnis (Bake = lesbares HTML/CSS/JS, kein proprietäres Format).

## Operating Context

- Lokale Engine (Node, Postgres) und Programm-Shell im Browser; Editor unter
  `…/pages/<id>?view=editor`, Canvas unter `?view=canvas`.
- Agenten greifen über MCP-Tools zu (Sites, Seiten, Sections, Mutationen, Styles,
  Komponenten, Motion, CMS, Assets, Referenzen, Previews, Reviews, Releases).
- Referenz-Bibliothek (Sammlungen, Dokumente, Profile), Bildgenerierung,
  Formulare/Einsendungen, Aufträge (Bake-Jobs), Releases mit Rollback.
- Sprache der Oberfläche: Deutsch mit englischen Fachbegriffen („Layout",
  „Release", „Preview").

## Capabilities and Constraints

- **Editor v2:** Canvas mit drei Breakpoint-Frames und Live-Modus, Explorer,
  Inspektor (Content/Style/Interactions/Advanced), Komponenten (Overrides,
  Varianten, Versionen/Drift), Motion (Presets inkl. 3D, Scrub, Play),
  Marker-Overlay, Spotlight, Kontextmenü, Inline-Edit, Verlauf, Undo/Redo.
- **Workspaces:** CMS (Collections, Entries, Versionen, Einsendungen), Medien
  (Ordner, Alt-Status, Ersetzen), Referenzen (Import, Dokumente, Redesign-Paket),
  Prüfen (Struktur-Diff), Releases (Rollback), Aufträge, Einstellungen
  (Profil, Theme, Domains, Tokens/MCP).
- **Constraints:** local-first; Postgres-only bis Phase 5 (ADR-0004); kein
  Multiplayer (bewusst); Motion über Presets, keine freie Timeline; ein Akzent
  (Limette) mit genau einer Bedeutung; hell ist Grundzustand, dunkel ist dieselbe
  Leiter invertiert.
- **Terminologie:** Section, Widget, NodeTree, Draft, Release, Review, Referenz,
  Entry, Collection, Submission, Preset, Profil (clean/standard/showcase).

## Brand Commitments

- **Designsystem ist verbindlich:** `.scratch/editor-v2-rebuild/design-system/DESIGN-SYSTEM.md`
  und `senify.css` (eine Farbschicht für Programm-Shell, Editor und Canvas).
- Hell ist der Grundzustand, dunkel die invertierte Leiter; ein Umschalter.
- Limette (`--ui-hue-lime`) trägt genau eine Aussage: „hier zählt es jetzt".
  Nie als Zustand, nie als Fokusring, nie als Reiterkante.
- Höhe entsteht durch Fläche und 1-px-Kante, nicht durch Schatten; Schatten nur
  für schwebende Platten. Keine Verläufe. Ein primärer Knopf pro Ansicht.
- Schrift: Inter / Inter Display; feste px-Grade im Werkzeug; Tabulatorziffern in
  Tabellen und Maßfeldern.
- Radius-Sprache: Werkzeug eckig (0/4/8), Produkt rund (32/48/Pille).

## Evidence on Hand

- `docs/history/HANDOFF.md` (Stand, Entscheidungen, Fallen), `docs/history/verbesserungsplan.md`
  (Epics, Lücken, Roadmap), `.scratch/editor-v2-rebuild/ui-plan.md` (Editor-Bauplan),
  `ui-aufgaben.md` (Aufgabenstand), `ui-design.md` (Werte und Nachweise).
- `design-system/DESIGN-SYSTEM.md` + `senify.css` (Farbschicht, Kontrastnachweise),
  `farben-referenz-2026-09-22.md` (Messprotokoll), `pruef-kontrast.mjs` (Abnahme).
- `ui-preview/index.html` (bisherige Komponenten-Schau; wird `styleguide.html`).
- `docs/research/builder-vergleich.md` (Recherche Revyme, Plasmic, Silex,
  Frappe Builder — übernehmbare Funktionen und UI-Lehren).
- Demo-Inhalte in Prototyp und Vorschau sind synthetisch und als solche erkennbar;
  keine erfundenen Kunden, Preise oder Benchmarks.

## Product Principles

1. **Ein Vertrag für Mensch und Agent.** Jede Funktion existiert für beide; was
   der Agent kann, kann der Editor sichtbar machen — und umgekehrt.
2. **Fläche und Kante statt Schatten.** Höhe, Auswahl und Zustand kommen aus der
   Fläche; ein Akzent mit einer Bedeutung.
3. **Zustände sind Teil des Bausteins.** Hover, Fokus, Auswahl, gesperrt, wartend,
   leer, Fehler sind entworfen, nicht nachgerüstet.
4. **Ehrliche Rückmeldung.** Jede Meldung trägt einen Satz oder eine Zahl; keine
   Attrappen, keine stummen Knöpfe.
5. **Erst der Beweis.** Kontrast, Parität, Integrität werden nachgerechnet
   (Skripte, Tests, Nachweise), nicht behauptet.

## Accessibility & Inclusion

- Kontrast: Text 4,5:1, Nicht-Text 3:1 — nachgerechnet (`pruef-kontrast.mjs`).
- Trefferflächen mindestens 24 × 24 px (WCAG 2.5.8); sichtbarer Fokus überall.
- Vollständige Tastaturbedienung: Spotlight (Ctrl/⌘+K), Kürzel sichtbar in Menüs,
  Escape schließt, Fokus kehrt zurück.
- `role="dialog"`/`aria-modal` für Dialoge, `aria-live` für Toasts,
  `aria-busy` für Ladezustände, `prefers-reduced-motion` ersetzt Bewegung.
