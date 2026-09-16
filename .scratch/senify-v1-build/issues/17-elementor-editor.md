# 17: Elementor-naher Editor (Canvas, Chrome, Interaktionen)

**What to build:** Der visuelle Editor (T13) bekommt Funktionsweise und Aufbau eines Elementor-Editors: echte Seite im Canvas (statt Stub-Kästen), Top Bar mit Geräte-Umschalter/Struktur/Historie/Vorschau/Veröffentlichen, ein linkes Panel, das zwischen Widget-Katalog und Element-Einstellungen (Content/Style/Advanced) wechselt, Canvas-Handles (Bearbeiten, Ziehen, Duplizieren, Löschen), „+"-Einfügepunkte, Drag & Drop aus dem Panel, Kontextmenüs, Navigator mit Drag, Inline-Text und Responsive-Overrides pro Control. Eigene Umsetzung — Elementor dient als Vorbild für Aufbau, Maße und Interaktionsmuster; Assets/Code werden nicht übernommen.

**Blocked by:** 13 (Editor-Kern, umgesetzt), 12 (Programm-Shell).

**Status:** in Arbeit — M1 (echtes Rendering) und M2 (Elementor-Chrome) umgesetzt; M3–M4 offen

## Recherche (Elementor-Editor, Stand 09/2026)

Quellen: Elementor Help „Explore the Elementor Editor", „Elementor Top Bar", „Access element menus", „Advanced tab", „Navigator"; Editor-CSS als Maß-Referenz.

**Drei Bereiche:** Top Bar · Panel (links) · Canvas.

**Top Bar (links → rechts):** Logo-Menü (Site Settings, Theme Builder, Notes, User Preferences inkl. Light/Dark + Panelbreite, Keyboard Shortcuts, Help Center, Exit), Add Element (+), Page Settings, History (Liste aller Änderungen, gezielt zurück), Seitenname (letzte 5 Seiten), **Responsive views** (PC/Tablet/Mobile), Finder, **Structure** (Navigator), **Preview**, **Publish/Update** + Dropdown („Save as draft", „Save as template").

**Panel:** Widget-/Element-Suche, Kategorien als Akkordeons, Drag auf den Canvas. Klick auf das Handle eines Elements → dasselbe Panel zeigt die Einstellungen: Widget = **Content / Style / Advanced**, Container = **Layout / Style / Advanced**, jeweils Sektionen als Akkordeons. Hide-Panel-Pfeil vergrößert den Canvas.

**Canvas:** echte Seite im iframe; Hover-Hervorhebung; Klick selektiert; Handle mit Bearbeiten-Stift, Ziehen, Duplizieren/Löschen; „+"-Buttons zwischen Elementen; blaue Drop-Indikatoren; Inline-Text; Rechtsklick-Kontextmenü je Elementtyp.

**Kontextmenü (Widget):** Edit [Name], Duplicate, Copy, Paste, Paste style, Paste from other site, Reset style, Save as global, Save as default, Notes, Structure, Delete. Container zusätzlich: Add New Container, Save as Template, Save as default. Leerer Bereich: Paste, Paste from other site, Copy All Content, Delete All Content, Structure.

**Navigator/Structure:** Baum aller Elemente; Klick springt zum Element; Drag sortiert um; Auge blendet aus/ein.

**Advanced-Tab:** Layout (Margin, Padding, Width, Z-Index), Motion Effects, Transform (Rotate/Offset/Scale/Skew/Flip), Background, Border, Mask, **Responsive** (pro Gerät ausblenden), Attributes, CSS ID/Classes, Custom CSS, Display Conditions, Sticky.

**Responsive:** ein Icon schaltet PC ↔ Tablet ↔ Mobile; pro Control ein Geräte-Umschalter, gesetzte Overrides sind hervorgehoben („Responsive indicator").

**History / Publish:** Änderungsliste zum gezielten Zurückspringen; Publish/Update; „Save as draft"; Preview-Modus für Besucheransicht.

**Maße/Farben (Referenz):** Panelbreite 280px (<1440px Viewport) bzw. 300px (≥1440px); Akzent `#d004d4` (primary-bold), hell `#f0abfc`, Hover `#e879f9`; Text `#515962`; Border `#d5d8dc`; Panel-Header 48px hoch; Undo/Redo per Strg+Z/Y, Duplizieren Strg+D, Copy/Paste Strg+C/V, Löschen Entf, Esc hebt Auswahl auf, Strg+S speichert.

## Meilensteine

- **M1 — Echtes Rendering (erledigt):** React-Renderer mit `SectionTree` (dieselben Komponenten wie der Bake) rendert die Seite in die Frames; der App-Server liefert das kompilierte Stylesheet (Tailwind + `components.css`) unter `/editor-frame.css`, die Frames laden zusätzlich `/theme.css`; Auswahl läuft über das vorhandene `data-node-id` der Section-Shells, Inline-Text wird nach dem Rendern annotiert (`data-inline` + `data-inline-node` + `data-prop-key`).
- **M2 — Elementor-Chrome:** Top Bar (Geräte-Umschalter, Struktur, Historie, Vorschau, Publish/Update mit Draft), ein linkes Panel mit zwei Modi (Widget-Katalog ↔ Element-Einstellungen mit Content/Style/Advanced), Canvas als weißes Blatt auf grauem Grund, Auswahl-Handle (Stift, Ziehen, Duplizieren, Löschen), „+"-Einfügepunkte, Hover-Ringe.
- **M3 — Interaktionen:** Drag & Drop aus dem Panel mit Drop-Indikator, Kontextmenü je Elementtyp, Inline-Text-Toolbar, Navigator mit Drag + Auge, Responsive-Override-Anzeige pro Control, Tastenkürzel.
- **M4 — Feinschliff:** History-Panel, Vorschau-Modus, Publish-Flow (Review/Release), leere Zustände.

## Umsetzungs-Notiz (M1)

- **Renderer:** `packages/editor/src/react-renderer.tsx` (`createReactRenderer`) rendert `SectionTree` aus `@senify/registry/components` per `createRoot`/`flushSync` in den Frame; `destroy()` unmountet alle Roots. Der Editor-Kern bleibt renderer-agnostisch (FrameRenderer-Schnittstelle unverändert).
- **Inline-Anker:** nach dem Rendern werden Text-Props (Registry-`PropSpec.control` `text`/`richtext`) auf das kleinste passende Blattelement im Knoten annotiert (`data-inline`, `data-inline-node`, `data-prop-key`); kein `data-node-id` auf dem Text, damit der Selection-Ring nur am Abschnitt hängt. `mount.ts` liest beim Doppelklick `data-inline-node` mit Fallback auf `data-node-id`.
- **Stylesheet:** `packages/app/editor/frame.css` (`@import "tailwindcss" source(none)`, `@import` der `components.css` aus dem Renderer-Template, `@source` auf `packages/registry/src`); `packages/app/src/frame-css.ts` kompiliert einmalig lazy über `@tailwindcss/node` + `@tailwindcss/oxide`-Scanner und cached das Ergebnis; Server-Route `/editor-frame.css`.
- **Frames:** `EditorOptions.frameStyles?: string[]` — `mount.ts` hängt die URLs als `<link>` in das Frame-Dokument (App übergibt `/theme.css`, `/editor-frame.css`). `app.js` erzeugt den Renderer mit `context` (Seitenpfade; Assets löst der Renderer über `/assets/...`-Fallback auf).
- **Tests:** `editor-browser.test.ts` prüft jetzt echtes Markup im Frame (`section[data-section="hero"]`, `h1`-Text in allen drei Frames), Klick-Auswahl über den Frame, Inline-Annotation (`contenteditable` nach Doppelklick) und dass keine Stub-Kästen mehr erscheinen; `/editor-frame.css` wird auf ausgelieferte Utilities geprüft.

## Umsetzungs-Notiz (M2)

- **Aufbau:** Panel (17,5 rem, ab 1440 px 18,75 rem) | Struktur-Spalte | Canvas — das Panel ist die linke Spalte wie bei Elementor; die Struktur lässt sich per Top-Bar-Knopf ausblenden (`main--norail`).
- **Top Bar (48 px):** Marken-Menü (Seiten-Einstellungen, Tastenkürzel, Spotlight), `+` (Widget-Katalog), `Seite`, `↺` Verlauf (Undo/Redo + Liste zum gezielten Zurückspringen ueber `restoreTo`), Seitenname mit Pfad, Geraete-Umschalter PC/Tablet/Mobile (setzt den aktiven Breakpoint, ohne Frames neu zu bauen, und scrollt den Rahmen in den Blick), `Struktur`, `Suchen` (Finder/Strg+K), `Design | Vorschau`, `Veroeffentlichen` + Dropdown (Review, Vorschau).
- **Widget-Katalog:** Suche + Kategorien (Struktur/Inhalte/Commerce/Medien/Werkzeuge) als Kartenraster; Klick fuegt ueber die Golden-Vorlage ein (`goldenTreeToMutations`) — an der gewaehlten Position oder am Seitenende — und oeffnet danach die Einstellungen des neuen Elements.
- **Einstellungen:** Kopf mit Zurueck-Pfeil, Tabs Content/Style/Advanced (Gruppen-Taxonomie der Registry wird aufgeteilt: Styling+Layout = Style, Motion+Sichtbarkeit = Advanced), Akkordeons mit Klapp-Zustand, Felder wie bisher inkl. Override-Badge/Reset.
- **Canvas:** grauer Grund (#e0e0e0), weisse Sheets mit Schatten, Handle am Element (Griff, Bearbeiten-Stift, Duplizieren, Loeschen; gesperrte/root-Knoten eingeschraenkt) und `+`-Einfuegepunkte oben/unten; Rechtsklick-Kontextmenue (Einstellungen, Text bearbeiten, Duplizieren, Nach oben/unten, Ein-/Ausblenden, Loeschen) mit nur funktionierenden Aktionen; Tastenkürzel Strg+S/Strg+D/Entf/Esc.
- **Architektur-Notiz:** `packages/editor/src/golden.ts` ist ein browser-sicherer Zwilling von `@senify/engine`s `goldenTreeToMutations` (der Engine-Index zieht pg/sharp/node:crypto und darf nicht ins Editor-Bundle); Signatur um einen Ziel-Index erweitert.
- **Bugfix unterwegs:** Der erste Frame-Mount landet im about:blank-Dokument; der zweite (Load) ersetzt ihn. `mountedFrames` fuehrt jetzt genau einen Lebend-Eintrag je Frame, sonst rechnen Overlay/Handle mit Null-Rects des verworfenen Dokuments.
- **Tests:** `editor-browser.test.ts` prueft die neue Chrome im echten Browser: Panel|Struktur|Canvas-Reihenfolge, Geraete-Umschalter, Struktur-Toggle, Panel-Tabs, Handle-Duplizieren/-Loeschen, `+`-Einfuegen mit Hinweis, Kontextmenue oeffnen/schliessen, Zoom-Footer.

## Umsetzungs-Notiz (M3)

- **Drag & Drop:** Widget-Karten sind ziehbar; die Drop-Events liegen im Frame-Dokument (ein iframe schluckt sie aus dem Eltern-Dokument). Ueber dem Element unter dem Zeiger entscheidet die vertikale Mitte ueber davor/danach, eine blaue Linie zeigt die Position, der Drop fuegt die Golden-Vorlage an genau dieser Stelle ein. Playwright kann HTML5-Drag-Daten nicht ueber die Frame-Grenze tragen; der Browser-Test treibt die echten Handler mit synthetischen DragEvents.
- **Navigator:** Zeilen sind ziehbar und ordnen ueber dieselbe Positionslogik um (Zyklus-Schutz: nicht in eigene Nachfahren); das Auge blendet pro Breakpoint aus (sichtbar in Struktur und Frame).
- **Inline-Toolbar:** Waehrend der Textbearbeitung erscheint am Element eine Leiste mit "Fertig" (Enter) und "Verwerfen" (Esc).
- **Inline-Tippen entlastet:** Statt einer Mutation pro Tastendruck schreibt der Editor nach 350 ms Ruhe (Flush bei Enter/Fokusverlust, Verwerfen bricht den Timer ab); die Historie coalesced den Schreibvorgang weiterhin zu einem Undo-Eintrag.
- **Override-Anzeige:** Panels zeigen pro Control einen Geraetepunkt (Tablet/Mobil), wenn dort ein Override liegt; Klick wechselt die Ansicht.
- **Resilienz:** Der Transport wartet kurze 429-Fenster ab (Retry-After) statt Aenderungen zu verwerfen; die Shell holt den Baum nach jeder Mutation nach, mit Reihenfolge-Schutz (nur die neueste Antwort schreibt) und Backoff. Der Browser-Test hebt die Rate-Limits des Programms an (ateLimits-Passthrough in startProgram), weil er in Sekunden mehr Requests erzeugt als ein Mensch.
