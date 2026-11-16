# ADR-0039: Offene Import-Punkte nach den DOM-Widgets

**Status:** angenommen, 16.11.2026

**Betrifft:** `packages/framer-import`, `packages/widget-engine`, `packages/widgets`, `packages/renderer`, `scripts`

**Ergänzt:** ADR-0038, ADR-0037, ADR-0028

## Kontext

Nach dem Port der vier DOM-Widgets (ADR-0038) blieben sechs Punkte offen:
zwei Projektkarten, die nur die veröffentlichte Seite zeigt; der
Fillout-Platzhalter; Quellbild-URLs in den Palette-Defaults; DOM-Widgets, die
in der Vorschau erst beim Scrollen mounten; mehrdeutige Textfarben; die
Design-Canvas-Erkennung, die nur ein absolut positioniertes erstes Kind kannte;
und die temporäre Demo-Instanz.

## Entscheidung

1. **Fehlende Projektkarten kommen als native Klone aus der Live-Seite.** Die
   Anreicherung liest die Projektkarten aus dem Live-IR, vergleicht sie über
   Titel/Domain mit den Karten der Projekt-XML und klont die fehlenden Einträge
   mit neuen Keys. Texte (Datum, Titel, Leistungen) werden ersetzt, `appearId`
   und `appearInitial` geleert; die Bilder laufen durch denselben
   Kartentext-Match wie die vorhandenen zwei. Ohne `styleUrl` bleibt es bei den
   zwei XML-Karten.
2. **Das Fillout-Formular ist ein einwilligungsgesteuertes Embed.** Der
   Footer-Kern rendert zunächst eine limefarbene Platzhalterkarte mit
   Consent-Text und Knopf. Erst der Klick erzeugt das iframe auf
   `embed.fillout.com`; vorher gibt es keine Fremdanfrage. Die Adresse wird auf
   `https:` geprüft.
3. **Quellbilder sind Importdaten, keine Palette-Defaults.** Die
   Medien-Controls der DOM-Widgets starten leer. `PrimitiveDefinition.sourceMedia`
   trägt die belegten Quelladressen; die `styleUrl`-Anreicherung lädt sie als
   lokale Assets, der Mapper setzt `{ assetId, src }`. Ein neu eingefügtes
   Widget fragt damit keine Fremd-URL an.
4. **DOM-Widgets mounten eager.** Der Markup-Serializer setzt
   `data-widget-eager="true"`; der gebackene Inline-Loader mountet diese Hosts
   sofort und lässt nur die Canvas-/Effekt-Widgets am IntersectionObserver.
5. **Mehrdeutige Farben bekommen einen DOM-Pfad-Fallback.** Der Fallback
   vergleicht die letzten zwei/drei benannten Pfadstationen; nur ein
   eindeutiger Treffer wird gesetzt. Verbleibende Mehrdeutigkeiten stehen mit
   Text im Bericht.
6. **Design-Canvas-Erkennung wird verallgemeinert.** Ein absolutes/fixes Frame
   mit gemessener Pixelbreite wird direkt oder in einem einzelnen Seiten-Wrapper
   erkannt; ein normaler Abschnitt mit absolutem Hintergrund bleibt unberührt.
7. **Die persistente Demo nutzt die laufende `senify start`-Instanz.** Die
   Datenbank kommt aus `~/.senify/config.json` bzw. `SENIFY_DATABASE_URL`;
   `pnpm demo:fluffy` legt Site und Seite nur beim ersten Lauf an und ist
   idempotent. Die XML-Dateien bleiben Arbeitsmaterial aus `.scratch`.

## Verworfene Alternativen

- **Projektkarten als neues Widget:** hätte alle vier Karten aus dem nativen
  Baum gelöst und die bestehende Bearbeitbarkeit verschlechtert. Der Klon
  bleibt ein normaler Knoten.
- **Fillout sofort laden:** würde ohne Einwilligung Daten an einen Dritten
  senden und die CSP-Ausnahme erzwingen. Der Consent-Knopf ist die ehrliche
  Variante.
- **Quell-URLs in den Defaults lassen:** neue Palette-Widgets würden gegen
  `framerusercontent` zeigen und in der Vorschau an der CSP scheitern.
- **Alle Widgets eager mounten:** die Canvas-Kerne würden ohne Sichtbarkeit
  WebGL-Kontexte und Rechenzeit belegen.
- **Mehrdeutige Farben raten:** ein falscher Treffer wäre schlechter als die
  geerbte Farbe. Der Pfad-Fallback ist konservativ.

## Folgen und Grenzen

- Die zwei fehlenden Karten und ihre Bilder sind nur mit öffentlicher
  `styleUrl` verfügbar; ohne sie bleibt die Projekt-XML die Quelle.
- Der DOM-Pfad-Fallback löst nicht jede Mehrdeutigkeit. Im echten Fluffy-Lauf
  bleiben drei Knoten mit zwei Texten offen (`Web design & Web development`,
  `5.00 Google Bewertung`); der Bericht nennt sie.
- Die Vorschau nutzt weiterhin denselben Bake-Pfad wie das Release; die
  Widget-Islands laufen, die DOM-Widgets mounten jetzt ohne Scrollen. Eine
  separate „release-nahe“ Vorschau ist nicht nötig.
- Die Demo setzt eine laufende persistente Instanz und die Projekt-/Seiten-XML
  im Arbeitsverzeichnis voraus. Sie ist kein Ersatz für die Produktionsablage.
- Ein neues Palette-Widget startet ohne Bilder; der Autor wählt sie bewusst.

## Belege

- Karten: `packages/framer-import/src/project-style-enrichment.ts`,
  `packages/framer-import/test/project-style-enrichment.test.ts`
- Formular: `packages/widget-engine/src/dom-widgets.ts`,
  `packages/widgets/src/framer-footer.ts`,
  `packages/app/test/framer-widgets-browser.test.ts`
- Quellbilder: `packages/widget-engine/src/types.ts`,
  `packages/widget-engine/src/widgets.ts`,
  `packages/framer-import/src/mapper.ts`
- Eager: `packages/widget-engine/src/markup.ts`,
  `packages/renderer/src/motion.ts`,
  `packages/renderer/test/widget-island.test.ts`
- Farbpfad: `packages/framer-import/src/project-style-enrichment.ts`,
  `packages/framer-import/test/project-style-enrichment.test.ts`
- Canvas: `packages/framer-import/src/mapper.ts`,
  `packages/framer-import/test/desktop-frame.test.ts`
- Demo: `scripts/demo-fluffy.mts`, `package.json` (`demo:fluffy`)
- Messung: echter Projekt-XML-Lauf mit `styleUrl` ergänzt zwei Karten und vier
  lokale Bilder; die Karten tragen `31.05.26`, `08.08.23`, `20.06.24`,
  `13.07.26`. Der Fixture-Gate bleibt bei 0,3 % Desktop-Differenz.
