# 13: Visueller Editor (Puck + Frame-Manager)

**What to build:** Die menschliche Werkbank auf Puck-Basis (MIT, Version gepinnt): dünner Adapter NodeTree ⇄ Puck, jede Editor-Aktion emittiert eine kanonische Mutation. **Design-Modus** mit Frame-Manager (größter Eigenbau): je Breakpoint (Desktop/Tablet/Mobile) ein eigenes iframe in echter Breite, nebeneinander, Zoom/Pan (Start 50 %), echte Media-Queries; alle Frames voll editierbar. **Live-Modus**: ein Frame in echter Größe, normal scrollbar. Inline-Text-Editing (Doppelklick → contentEditable plaintext, Commit live in alle Breakpoints, Escape = Revert als ein Undo-Eintrag). Explorer-Tabs (Ebenen · Seiten · Vorlagen · Medien), Cmd+K-Spotlight (Seiten, Sektionen mit Thumbnails, Aktionen), URL-Deep-Links (`?page=&node=&mode=&bp=`), Medien-Fenster (aus 08), registry-generierte Property-Panels (Controls, Gruppen, bedingte Sichtbarkeit) + semantische Token-Picker + Motion-Panel (Preset + Intensity), Override-Badges mit Reset, Undo/Redo über Patch-Stack + History-Panel („Restore as Draft"), Selection-/Hover-Rings, Alt-Klick-Ebenen-Auswahl, Mini-Toolbar. Puck-Bugs #1829/#1794 eingeplant; Upgrade-Tests.

**Blocked by:** 05 (Renderer & Bake — Section-SDK), 08 (Media — Medien-Fenster), 10 (Templates — Vorlagen-Tab), 12 (Programm-Shell — Arbeitsbereich).

**Status:** ready-for-agent

- [ ] Design-Modus: 3 Breakpoint-Frames nebeneinander, alle editierbar; Änderungen in einem Frame wirken in allen (Overrides korrekt); Zoom/Pan funktioniert
- [ ] Live-Modus: ein Frame in echter Größe, scrollbar, voll editierbar; Umschalter Design ⇄ Live erhält den Zustand
- [ ] Inline-Text: Doppelklick → tippen → synchron in allen Frames; Escape revertet als ein Undo-Eintrag; kein Rich-Text im Inline-Modus
- [ ] Kanonische Mutations: jede Aktion (Drag&Drop, Props, Breakpoints, Motion) läuft über `apply_mutations`-Vertrag; Konflikt zeigt „Draft hat sich geändert — neu laden"
- [ ] Explorer-Tabs: Ebenen-Baum, Seiten (inkl. Vorlagen-Abschnitt), Medien-Fenster (Suchen/Hochladen/Einsetzen); Cmd+K findet Seiten/Sektionen/Aktionen
- [ ] Deep-Links runden Reload ab und sind teilbar; Undo/Redo + History-Panel funktionieren
- [ ] Registry-generierte Panels (Controls/Gruppen/hidden) + Token-Picker + Motion-Dial; Override-Badges mit Reset
- [ ] Puck-Upgrade-Test dokumentiert bekannte Bugs als Regression-Fälle: #1829 (0.23: Default-Overlay/`overrides.actionBar` mountet nie — `startTransition`; Workaround: Eigenbau-Overlays/Toolbar, nicht auf Puck-Defaults stützen) und #1794 (Inline-Fields im Root funktionieren nicht — Lücke einplanen, Fix-PR #1793/nächstes Release verfolgen; Inline-Text für Kinder funktioniert)

Quellen: `artifacts/09`, `artifacts/24` (+ Gap-Analyse `research/28-puck-gap.md`), `research/16`, Spec „Visueller Editor".