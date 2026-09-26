# 13: Visueller Editor (Puck + Frame-Manager)

**What to build:** Die menschliche Werkbank auf Puck-Basis (MIT, Version gepinnt): dünner Adapter NodeTree ⇄ Puck, jede Editor-Aktion emittiert eine kanonische Mutation. **Design-Modus** mit Frame-Manager (größter Eigenbau): je Breakpoint (Desktop/Tablet/Mobile) ein eigenes iframe in echter Breite, nebeneinander, Zoom/Pan (Start 50 %), echte Media-Queries; alle Frames voll editierbar. **Live-Modus**: ein Frame in echter Größe, normal scrollbar. Inline-Text-Editing (Doppelklick → contentEditable plaintext, Commit live in alle Breakpoints, Escape = Revert als ein Undo-Eintrag). Explorer-Tabs (Ebenen · Seiten · Vorlagen · Medien), Cmd+K-Spotlight (Seiten, Sektionen mit Thumbnails, Aktionen), URL-Deep-Links (`?page=&node=&mode=&bp=`), Medien-Fenster (aus 08), registry-generierte Property-Panels (Controls, Gruppen, bedingte Sichtbarkeit) + semantische Token-Picker + Motion-Panel (Preset + Intensity), Override-Badges mit Reset, Undo/Redo über Patch-Stack + History-Panel („Restore as Draft"), Selection-/Hover-Rings, Alt-Klick-Ebenen-Auswahl, Mini-Toolbar. Puck-Bugs #1829/#1794 eingeplant; Upgrade-Tests.

**Blocked by:** 05 (Renderer & Bake — Section-SDK), 08 (Media — Medien-Fenster), 10 (Templates — Vorlagen-Tab), 12 (Programm-Shell — Arbeitsbereich).

**Status:** umgesetzt (`pnpm verify` grün; Editor-Kern als eigenes Paket mit Puck-kompatiblem Adapter, Panels, Frames, Inline-Text, Explorer/Spotlight/Deep-Links, Undo/Redo, von der Programm-Shell über `@senify/editor/browser` eingebunden; im echten Browser geprüft: Frame-Layout, Klick-Auswahl in den Frames, Panels, Mutation, Inline-Text, Live-Modus, Deep-Link-Reload) — offen: echte Sektions-Komponenten in den Frames (Puck-/Renderer-Einbindung), Mini-Toolbar, Sektions-Einfügen aus dem Spotlight, Vorlagen-Daten im Explorer (die Puck-basierten Punkte sind mit ADR-0007/editor-v2 überholt; „Vorlagen-Daten im Explorer" bleibt als Restpunkt, vgl. O14)

- [ ] Design-Modus: 3 Breakpoint-Frames nebeneinander, alle editierbar; Änderungen in einem Frame wirken in allen (Overrides korrekt); Zoom/Pan funktioniert
- [ ] Live-Modus: ein Frame in echter Größe, scrollbar, voll editierbar; Umschalter Design ⇄ Live erhält den Zustand
- [ ] Inline-Text: Doppelklick → tippen → synchron in allen Frames; Escape revertet als ein Undo-Eintrag; kein Rich-Text im Inline-Modus
- [ ] Kanonische Mutations: jede Aktion (Drag&Drop, Props, Breakpoints, Motion) läuft über `apply_mutations`-Vertrag; Konflikt zeigt „Draft hat sich geändert — neu laden"
- [ ] Explorer-Tabs: Ebenen-Baum, Seiten (inkl. Vorlagen-Abschnitt), Medien-Fenster (Suchen/Hochladen/Einsetzen); Cmd+K findet Seiten/Sektionen/Aktionen
- [ ] Deep-Links runden Reload ab und sind teilbar; Undo/Redo + History-Panel funktionieren
- [ ] Registry-generierte Panels (Controls/Gruppen/hidden) + Token-Picker + Motion-Dial; Override-Badges mit Reset
- [ ] Puck-Upgrade-Test dokumentiert bekannte Bugs als Regression-Fälle: #1829 (0.23: Default-Overlay/`overrides.actionBar` mountet nie — `startTransition`; Workaround: Eigenbau-Overlays/Toolbar, nicht auf Puck-Defaults stützen) und #1794 (Inline-Fields im Root funktionieren nicht — Lücke einplanen, Fix-PR #1793/nächstes Release verfolgen; Inline-Text für Kinder funktioniert)

Quellen: `artifacts/09`, `artifacts/24` (+ Gap-Analyse `research/28-puck-gap.md`), `research/16`, Spec „Visueller Editor".

## Handoff (Stand 15.09.2026)

**Auftrag:** T13 umsetzen. Der Editor entsteht als **eigenes Paket `packages/editor`** mit klarer Einsteigsfunktion (`mountEditor(container, options)`), das die Programm-Shell (T12, parallele Session) später nur noch einhängt — die Shell selbst NICHT anfassen. Am Ende, nur bei grünem `pnpm verify`, selbst committen.

**Zusammenarbeit:** Parallel arbeitet eine andere Session an `packages/app`, `packages/mcp` (cli/config/package.json), `eslint.config.mjs`, `pnpm-lock.yaml` — NICHT anfassen, kein `git add -A`. Stagen nur: `packages/editor packages/registry packages/renderer packages/section-sdk .scratch` (und `pnpm-lock.yaml` nur, wenn du wirklich eine neue Abhängigkeit wie Puck installieren musst — dann ausdrücklich im Bericht nennen). Commit: Zeile 1 `T13: Visueller Editor - <kurz>`, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`.

**Anlaufpunkte:** `artifacts/09`, `artifacts/24`, `research/28-puck-gap.md` (bekannte Puck-Bugs #1829/#1794 samt Workarounds), `research/16`, Spec „Visueller Editor". Code: `packages/section-sdk/src/index.ts` (NodeTree, PropSpec, Registry-Verträge), `packages/registry/src/index.ts` (createRegistry: Props, Style-Props, Parts, Varianten, Thumbnails), `packages/engine/src/templates-contract.ts` + `packages/mcp/src/tools.ts` (`apply_mutations`-Vertrag), `packages/renderer/src/style.ts` (Breakpoint-Overrides).

**Priorität (halb Fertiges melden):**
1. **Adapter + Mutations:** NodeTree ⇄ Puck dünn abbilden; **jede** Editor-Aktion emittiert eine kanonische Mutation (`apply_mutations`-Vertrag, inklusive `baseVersion`); Konflikt (409) führt zur Meldung „Draft hat sich geändert — neu laden" und lädt neu; Adapter-Roundtrip (NodeTree → Puck → NodeTree) verlustfrei, unbekannte Knoten bleiben erhalten.
2. **Registry-generierte Panels:** Property-Panels aus den PropSpecs der Sektion (Controls, Gruppen, bedingte Sichtbarkeit), semantischer Token-Picker (Token-Referenz oder freier Wert mit Warnung), Motion-Panel (Preset + Intensity), Override-Badges je Breakpoint mit Reset.
3. **Frame-Manager:** Design-Modus mit drei iframes (Desktop/Tablet/Mobile) in echter Breite nebeneinander, Zoom/Pan (Start 50 %), echte Media-Queries, alle Frames voll editierbar (Änderung in einem Frame wirkt in allen, Overrides bleiben korrekt); Live-Modus mit einem Frame in echter Größe, normal scrollbar; Umschalten erhält den Zustand.
4. **Inline-Text:** Doppelklick → `contentEditable` plaintext, Commit live in alle Breakpoints, Escape revertiert als **ein** Undo-Eintrag, kein Rich-Text.
5. **Explorer + Spotlight + Deep-Links:** Tabs Ebenen · Seiten (inklusive Vorlagen-Abschnitt) · Vorlagen · Medien (aus 08, Suche/Hochladen/Einsetzen); Cmd+K-Spotlight (Seiten, Sektionen mit Thumbnails, Aktionen); Deep-Links `?page=&node=&mode=&bp=`, Reload-fest und teilbar.
6. **Undo/Redo + History:** Patch-Stack mit Tastenkürzeln, History-Panel, „Restore as Draft"; Selection-/Hover-Rings, Alt-Klick-Ebenen-Auswahl, Mini-Toolbar.
7. **Puck-Bugs eingeplant:** Workaround für #1829 (eigene Overlays/Toolbar statt Puck-Defaults), Lücke für #1794 (Inline-Felder im Root) dokumentieren; Upgrade-Test, der die Regression-Fälle als Testfälle festhält.
8. **Tests (ohne Browser):** Adapter-Roundtrip, Mutations-Emission je Aktion (Drag&Drop, Props, Breakpoint-Override, Motion, Inline-Text), Konflikt-Pfad, Panel-Generierung aus dem Katalog, Deep-Link-Parsing, Undo/Redo-Stack (Escape = ein Eintrag), Frame-Breakpoint-Zuordnung.

**Randbedingungen:** Deutsch mit englischen Fachbegriffen; TypeScript strict/ESM; keine ungenutzten Exporte; Kommentare sparsam; Puck als MIT-Abhängigkeit mit gepinnter Version; `pnpm verify` muss grün sein.

## Umsetzungs-Notiz (Teil 1: Editor-Kern)

- **Paket:** `packages/editor` mit `mountEditor(container, options)` als einziger Einstieg; `@puckeditor/core` 0.23.0 ist als **optionales Peer-Dependency** deklariert, der Adapter erzeugt Puck-kompatible Strukturen (`puck.ts`, `types.ts`) und bleibt dadurch ohne Browser/Puck-Runtime testbar. Die Programm-Shell (T12) hängt später den echten Puck-Renderer und die Sektionen ein.
- **Adapter + Mutations:** `adapter.ts` (NodeTree ⇄ Puck verlustfrei, unbekannte Knoten bleiben erhalten, Kollisionen zwischen Prop- und Slot-Namen werden abgewiesen), `mutations.ts` (jede Aktion als kanonische Mutation mit `baseVersion`: move, insert, props, slots, breakpoint-Override, Motion, Inline-Text, Reset), `client.ts` (Transport, 409 → „Draft hat sich geändert — neu laden" und Neuladen).
- **Registry → Puck/Panels:** `puck.ts` (Felder aus Props/StyleProps, Slots als Puck-Slot-Felder mit Allow-Liste, Metadaten für die MCP-Seite, eigene Feldtypen `senify-token-picker`/`senify-media-picker`/`senify-link-picker`), `panels.ts` (Gruppen aus der Registry-Taxonomie inklusive Part-Gruppen, Controls mit min/max/step/Options, bedingte Sichtbarkeit, Token-Optionen mit aufgelösten Werten, Override-Badges samt Basiswert und Reset).
- **Arbeitsfläche:** `frames.ts` (Design-Modus mit drei Breakpoint-Frames, Live-Modus mit einem Frame, Zoom/Pan ab 50 %), `inline-text.ts` (Doppelklick → `contentEditable` plaintext, Commit in alle Breakpoints, Escape = ein Undo-Eintrag), `explorer.ts` (Ebenen · Seiten inklusive Vorlagen · Vorlagen · Medien), `spotlight.ts` (Cmd+K), `deep-links.ts` (`?page=&node=&mode=&bp=` reload-fest), `history.ts` (Patch-Stack, Undo/Redo, History-Panel, „Restore as Draft"), `dom.ts` (Selection-/Hover-Rings, Alt-Klick, Mini-Toolbar).
- **Puck-Regressionen:** `puck-regression.test.ts` hält #1829 (eigene Overlays/Toolbar statt Puck-Defaults) und #1794 (`INLINE_ROOT_UNSUPPORTED`, Inline-Text nur für Kinder) als Testfälle fest.
- **Tests:** 12 Dateien/88 Tests (Adapter-Roundtrip, jede Mutations-Aktion gegen den Engine-Vertrag, Konfliktpfad, Panel-Generierung, Token-Picker, Frames, Inline-Text, Explorer/Spotlight, Deep-Links, Undo/Redo). Alle grün.
- **Review-Korrekturen:** vier veraltete Erwartungen angepasst (leerer Batch wird nie gesendet, „Actions"-Gruppe aus der Registry-Taxonomie, Token-Werte sind `oklch(...)`, der `collection-list`-Slot heißt `item` und wird als Puck-`slot` mit Allow-Liste abgebildet).

**Offen (Teil 2):**
- Einbindung in die Programm-Shell (T12) inklusive echtem Puck-Renderer und Sektions-Renderfunktionen; der Editor liefert nur die Einsteigsfunktion.
- Sichtprüfung im echten Browser (Frames mit echten Media-Queries, Zoom/Pan-Gefühl) und Puck-Upgrade-Test gegen die reale Bibliothek.

## Umsetzungs-Notiz (Teil 3: Browser-Prüfung)

**Playwright:** als Root-Dev-Dependency (`playwright`, Chromium unter `%LOCALAPPDATA%\ms-playwright`). Der bisher übersprungene Live-Capture-Test (`references-capture.test.ts`) läuft damit und ist grün.

**Befund 1 — kein Editor-CSS:** Die Editor-Oberfläche wurde ohne jeden Stylesheet ausgeliefert; die absolut positionierten Frames hingen dadurch am Dokument und überlagerten Rail und Panels (ein Klick im Ebenen-Baum traf das iframe). Fix: `packages/editor/src/styles.ts` mit `EDITOR_STYLES` + `ensureEditorStyles(doc)`; `mountEditor` injiziert das Stylesheet einmal pro Dokument (Farben über die Plattform-Tokens mit Fallbacks). Die App gibt `.editor-host` zusätzlich eine Höhe (`clamp(24rem, 100vh - 12rem, 64rem)`).

**Befund 2 — Auswahl nur über die Rail:** Klicks in den Frames hatten keine Wirkung, der Selection-Ring war nie gesetzt. Fix in `mount.ts`: Klick auf einen Knoten selektiert ihn (Alt-Klick geht eine Ebene hoch, `parentIdOf`), Hover- und Selection-Ring (`data-selected`) werden ohne Neuaufbau der iframes in alle Frame-Dokumente geschrieben (`frameBodies` + `syncSelectionRing`).

**Befund 3 — Deep-Links zerbrachen die Hash-Route:** Der Editor schrieb per `replaceState` einen Query-Anhang an die Hash-URL; `renderRoute` verstand die Route danach nicht mehr, ein Reload landete nicht wieder im Editor. Fix: Vertrag umgedreht — sobald die Shell `onDeepLink` übergibt, schreibt der Editor die URL nicht mehr selbst; die Shell schreibt `#/projects/:siteId/pages/:pageId?page=…&node=…`, `renderRoute` trennt Route und Deep-Link, `initialSearch` stellt Auswahl/Modus/Breakpoint nach dem Reload wieder her.

**Shell-Verdrahtung:** `pages` (Seiten-Tab + Spotlight), `media` (aus `GET /api/sites/:id/assets`), `onCommand` (Seite öffnen, Modus, Medien-Tab, Publizieren → Review-Ansicht) und `openTab` (neu im `EditorInstance`) ergänzt; nach Mutationen aktualisiert `onVersion` den Baum und ruft `refresh()`.

**Test:** `packages/app/test/editor-browser.test.ts` fährt die Suite mit Chromium: drei Breakpoint-Frames, Geometrie (Stage rechts der Rail), Klick-Auswahl im Frame, Panel-Änderung (Version + alle drei Frames), Deep-Link-Reload, Live-Modus, Seiten-Tab; überspringt sich ohne installierten Browser (gleicher Vertrag wie der Capture-Test). Keine Konsolenfehler.

**Weiterhin offen:** echte Sektions-Komponenten in den Frames (der Stub-Renderer zeichnet Knoten-Kästen; dafür braucht es den Frame-Renderer mit React + kompiliertem Tailwind/`components.css` und eine Lösung für Inline-Text auf echten Komponenten-DOM), Mini-Toolbar, Sektions-Einfügen aus dem Spotlight, Vorlagen-Daten im Explorer, Zoom/Pan-Gefühl als Sichtprüfung von Hand.