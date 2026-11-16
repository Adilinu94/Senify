# ADR-0038: DOM-Widgets für Framer-Komponenten ohne XML-Innenleben

**Status:** Angenommen, 15.11.2026
**Betrifft:** `packages/widget-engine`, `packages/widgets`, `packages/framer-import`, `packages/renderer`, `packages/editor`, `packages/engine`
**Ergänzt:** ADR-0035, ADR-0036, ADR-0028

## Kontext

Die Projekt-XML nennt Framer-Komponenten und ihre Instanzen, aber nicht deren Ebenen:
`<Components><Component nodeId="vHzR1NgIW" name="Navbar" />` und
`<Navbar componentId="vHzR1NgIW" />`. Die Inhalte, Bilder und die Typografie liegen
nur in der veröffentlichten Seite. Für Navbar, Footer 2, Step 2 und
Ticker reviews item blieb im Import deshalb ein leerer Rahmen beziehungsweise
eine Platte; der Body der Seite blieb rund 3 400 px kürzer als die Quelle.

ADR-0035/0036 haben den Widget-Weg für portierte Code-Komponenten eingeführt.
Der Markup-Serializer schrieb dort aber einen Host mit Poster und Canvas; der
Inhalt erschien erst, wenn der Kern im Browser montiert war. Für
Inhaltskomponenten wie eine Navigation oder einen Footer ist das zu spät.

## Entscheidung

1. **Ein DOM-Kennzeichen im Katalog.** `PrimitiveDefinition.dom === true` markiert
   ein Widget, dessen Inhalt aus DOM besteht. `renderDomWidget(type, props)`
   erzeugt dafür reines, escaped HTML; `describeOne` schreibt es als
   `spec.html` in den Host. Es gibt keinen Canvas und keinen Poster. Bake,
   Design-Canvas und Vorschau zeigen den Inhalt ohne JavaScript.
2. **Der Kern rendert dasselbe HTML.** `packages/widgets/src/dom-widget.ts`
   schreibt das Renderergebnis beim Mount erneut in den Host und hängt nur die
   Interaktion an (Mobilmenü). `setProps` rendert neu, `destroy` entfernt eigene
   Listener. Der Inhalt bleibt beim Entfernen des Hosts stehen; der Host wird
   ohnehin aus dem Dokument genommen.
3. **Geschlossene Abbildung.** `widget-mapping.ts` bildet die gemessenen Namen ab:
   `Navbar → framer-navbar`, `Footer`/`Footer 2 → framer-footer`,
   `Step`/`Step 2 → framer-step`, `Ticker reviews item`/`ReviewsTicker →
   framer-reviews`. Unbekannte Komponenten bleiben ein Rahmen (benannte
   Framer-Komponente) oder eine Platte (Code-Komponente ohne Port).
4. **Step-Instanzwerte aus der XML.** Die ersten drei nicht-strukturellen
   Attributwerte einer Step-2-Instanz sind Nummer, Leistung und Beschreibung;
   danach folgen Label/Text-Paare. Die Reihenfolge ist an der gemessenen Quelle
   belegt. Fehlt sie, gelten die Katalog-Defaults.
5. **Bilder werden lokale Assets.** Die Katalog-Defaults nennen die Quellbilder
   (Navbar-Logo, Footer-Porträt und -Logo, fünf Bewertungsavatare). Die
   `styleUrl`-Anreicherung prüft, dass die veröffentlichte Seite diese Bilder
   kennt, und plant sie als Assets ein. Der Mapper setzt
   `{ assetId, src: localUrl }`: Der statische Inhalt rendert `src`, der Kern
   erhält die aufgelöste Adresse. Ohne lokalen Beleg bleibt das Feld leer
   (Fallback statt CSP-blockiertem CDN-Bild).
6. **Vorschau-Pfade auch in Inline-Skripten.** Der Preview-Rewrite ersetzt
   lokale Buildpfade zusätzlich in String-Literalen. Der Widget-Island-Loader
   (`"/assets/widgets/<typ>.<hash>.js"`) läuft damit auch unter
   `/api/previews/<id>/files/`.

## Verworfene Alternativen

- **Nativer Teilbaum aus dem Live-HTML:** Die Projekt-XML hat die Ebenen nicht;
  ein Abgleich über Layout oder Text wäre fragil, und die Widget-Controls gingen
  verloren.
- **Zweiter MCP-Aufruf je Komponente:** Der Importpfad hat keine MCP-Sitzung,
  und die Quelle kann sich zwischen zwei Aufrufen ändern.
- **Neue generische Sektionstypen:** Sie passen nicht zu den spezifischen
  Inhalten der Quelle und würden den Katalog doppelt pflegen.

## Folgen

- Die vier Komponenten sind im Inspector über ihre Controls bearbeitbar, liegen
  als Server-HTML im Build und brauchen keine Fremd-Laufzeit.
- Die inneren Ebenen sind keine einzelnen Editor-Knoten; das ist das
  Widget-Modell. Die Controls decken die Inhalte ab.
- Der Preview-Mount ist lazy (IntersectionObserver): Widgets unterhalb des
  ersten Bildschirms bleiben `pending`, bis sie sichtbar werden. Der statische
  Inhalt ist bereits da; im Editor-Live-Modus mounten alle sichtbaren Hosts.
- Ein neu aus der Palette eingefügtes Widget trägt die Quellbild-URLs, bis der
  Autor sie ersetzt; importierte Seiten bekommen lokale Assets.
- Die Lizenzprüfung aus ADR-0035 gilt weiter: kein Produktions-
  Bibliothekseintrag ohne Nachweis.

## Belege

- Katalog und Controls: `packages/widget-engine/src/widgets.ts`,
  `packages/widget-engine/test/widget-markup.test.ts`
- Renderer und CSS: `packages/widget-engine/src/dom-widgets.ts`
- Kerne: `packages/widgets/src/dom-widget.ts`, `framer-navbar.ts`,
  `framer-footer.ts`, `framer-step.ts`, `framer-reviews.ts`,
  `packages/widgets/test/dom-widgets.test.ts`
- Abbildung: `packages/framer-import/src/widget-mapping.ts`, `mapper.ts`,
  `packages/framer-import/test/component-widgets.test.ts`
- Bilder: `packages/framer-import/src/project-style-enrichment.ts`,
  `packages/framer-import/test/project-style-enrichment.test.ts`
- Import-Route: `packages/engine/test/component-widget-import.test.ts`
- Browser: `packages/app/test/framer-widgets-browser.test.ts`
- Vorschau-Rewrite: `packages/engine/src/http-build-files.ts`,
  `packages/engine/test/http-build-files.test.ts`
- Messung: `.scratch/widgets-preview-1440.json` (1 440 px: Body 8 351 px gegen
  8 486 px der Quelle, −1,6 %, 0 CSP-Fehler), `.scratch/widgets-live-editor.json`
  (Editor-Live 958 px: Body 9 250 px, alle acht Widgets `mounted`,
  0 Konsolenfehler)
