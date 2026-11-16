# Handoff: Framer-Projektimport und WaveBackground

Stand: 16.11.2026
Branch: `feat/framer-open-points`
Letzter Commit: `5ebda5d feat(import): Live-Fixes fuer Framer-Komponenten und Fixture-Gate`
Vorherige Commits auf dem Branch: `0819110`, `fce8942`, `79dd9be`

## Fixture-Gate am 16.11.2026 repariert

Das Football-Gate war rot (Links 19→17, Verhältnis 0,895). Die Ursache lag
nicht im Mapper oder im Widget-Katalog, sondern in `DOM_WIDGET_CSS`: Beim
Einfügen der vier neuen Widget-Blöcke ging die öffnende Zeile
`@media (max-width: 1100px) {` verloren. Mit 227 öffnenden gegen 228
schließende Klammern verwarf der Browser den gesamten Rest des Basis-
Stylesheets, also auch `.w-frame` und `.w-frame--block`. Der Social-Anker im
Footer blieb dadurch `display: inline`, kollabierte auf 0×0 und fiel aus der
Sichtbarkeitszählung des Gates.

Nach dem Wiederherstellen der Media-Zeile (Klammerbilanz 173:173):

- Fixture-Gate 3/3 grün, Football 0,2–0,3 % Pixelabweichung bei Höhe
  4 919→4 919 und Links 19→20.
- Fluffy 0,3 %, Easier-Train 2,6 %.
- Alle Pflichtgates grün; die Suite über `framer-import`, `widget-engine`,
  `widgets` und `renderer` läuft mit 150 Dateien/1314 Tests (2 übersprungen).

Lehre für die nächste Runde: Ein CSS-Block in einem Template-String braucht
eine Klammerprobe. Der Fehler war im Quelltext nicht zu sehen, nur im
gerenderten Stylesheet.

## Ziel

Der Projekt-XML-Weg des Framer-Imports soll eine echte, bearbeitbare Seite erzeugen:
Struktur aus der Projekt-XML, dazu der native `WaveBackground` als Widget. Wo die XML
Typografie, Textfarben oder Bildquellen nicht hergibt, ergänzt eine optionale
`styleUrl` (die veröffentlichte Seite) genau diese Daten.

Die Seite ist kein Pixel-Clone. Sie ist eine bearbeitbare Senify-Seite mit nativen
Widgets und ehrlichen Platten für noch nicht portierte Code-Komponenten.

## Live ansehen

Aktuelle temporäre Instanz:

- Dashboard: `http://127.0.0.1:4392`
- Seite: `http://127.0.0.1:4392/#/projects/X6AGQfW_JGSk2a/pages/uZWf0G6QzjH3Lx`
- Im Editor oben auf **Live** wechseln. Nur dort läuft die Wave.

Die Instanz ist eine pg-mem-Instanz mit temporärem Datenverzeichnis. Nach einem
Neustart sind Site und Seite weg, dann wird neu importiert:

```powershell
pnpm exec tsx .scratch/start-fluffy.mts
```

Das Skript legt eine neue Site an, importiert `/` und bleibt am Leben. Es nutzt
Port 4391 für die Engine und 4392 für das Dashboard. Die neue Site-ID und die
Seiten-ID stehen im Skript-Log; alternativ über die API mit dem Token aus
`<dataDir>\program-token.json` abfragen.

Die in `docs/current/stand.md` und `docs/current/qualitaet.md` genannte Seite
`7fCjkme4ryDJ6g` ist die Messseite dieses Laufs. Die aktuell laufende Seite
`uZWf0G6QzjH3Lx` ist ein frischer Import mit demselben Code.

## Umgesetzt

### Import und Mapping

- `WaveBackground.tsx` wird auf den Widget-Typ `wave-background` abgebildet.
  Unbekannte Code-Komponenten bleiben Platten.
- `packages/widgets/src/wave-background.ts`: WebGL2-Port mit sieben Controls,
  `prefers-reduced-motion` und sauberem Destroy.
- Editor-Palette: `wave-background` ist die 24. Kachel mit Spark-Symbol.
- Leere Bildknoten schreiben kein `src=""` mehr.

### Projekt-XML-Layout

Die Projekt-XML beschreibt den Design-Canvas, nicht die veröffentlichte
1440-px-Seite. Der Mapper normalisiert deshalb:

- Das absolute 1200-px-Desktop-Frame wird `position: relative`, Breite 100 %,
  `left/top: 0`, Höhe automatisch, `overflow: hidden`.
- Framer-`1fr` wird in vertikalen Stacks 100 %. In horizontalen Stacks wird es
  ein gleicher Flex-Anteil (`flexGrow/flexShrink 1`, `flexBasis 0`, `minWidth 0`).
- `gridColumnSpan`/`gridRowSpan` werden zu `grid-column: span N` bzw.
  `grid-row: span N`; ein Grid-Element mit Span größer 1 bekommt Breite 100 %.
- Die Normalisierung greift nur, wenn das erste Kind des Seiten-Roots absolut
  positioniert ist, also das Design-Canvas-Frame ist. Der Test mit einem
  `<Page>`-Root bleibt dadurch unverändert.

### DOM-Widgets für die vier Framer-Komponenten (15.11.2026)

Navbar, Footer 2, Step 2 und Ticker reviews item sind keine leeren Rahmen mehr,
sondern native DOM-Widgets (ADR-0038):

- `framer-navbar`, `framer-footer`, `framer-step`, `framer-reviews` im Katalog,
  mit Controls für Inhalte, Links, Bilder und Farbton.
- Der Markup-Serializer schreibt den gerenderten Inhalt als HTML in den Host
  (`packages/widget-engine/src/dom-widgets.ts`); der Kern
  (`packages/widgets/src/dom-widget.ts`) schreibt dasselbe HTML beim Mount und
  hängt nur das Mobilmenü an.
- `widget-mapping.ts` bildet die Komponentennamen ab; Step 2 liest Nummer,
  Leistung, Beschreibung und Label/Text-Paare aus den Instanzattributen.
- Die Quellbilder (Navbar-Logo, Footer-Porträt/-Logo, fünf Bewertungsavatare)
  werden als lokale Assets importiert; der Mapper setzt `{assetId, src}`.
- Der Preview-Rewrite ersetzt lokale Pfade auch in Inline-Skript-Strings, damit
  der Widget-Island-Loader in der Vorschau läuft.
- Messung: Vorschau 1440 px Body 8 351 gegen 8 486 px der Quelle (−1,6 %),
  Navbar 109/108, Footer 1 315/1 319, Bewertungen 530/530; Editor-Live 958 px
  Body 9 250 px, alle acht Widget-Hosts `mounted`, keine Konsolen-/CSP-Fehler.
- Tests: `widget-markup` 13/13, `dom-widgets` 8/8, `component-widgets` 2/2,
  `project-style-enrichment` 5/5, `component-widget-import` 2/2,
  `http-build-files` 6/6, `framer-widgets-browser` 1/1; Kernpaket-Sammellauf
  43 Dateien / 531 Tests grün.
- Offen: volle Gates (`lint`, `module:check`, `route-matrix:check`,
  `quality:check`, `build`, `verify:dist`) und der schwere
  Framer-Import-Sammellauf mit `capture-hover`, `capture-browser`,
  `import-live-capture` und den Fixture-/Visual-Gates; Widgets unterhalb des
  ersten Bildschirms bleiben in der Vorschau bis zum Scrollen `pending`;
  neue Palette-Widgets tragen die Quellbild-URLs, bis der Autor sie ersetzt.

### Typografie und Farben aus `styleUrl`

- `source.project.styleUrl` in der Engine, `--style-url` in der CLI und ein
  Dialogfeld „Veröffentlichte Seite“.
- Der Import liest daraus Textfarben, Fonts, Body-Stil, fehlende Bildquellen und
  Zeilenumbrüche. Die Struktur bleibt ausschließlich aus der XML.
- Textfarben werden über den sichtbaren Text zugeordnet, inklusive geerbter
  Farben. SSR-Kopien, die am Desktop-Breakpoint verborgen sind, werden
  übersprungen.
- Zeilenumbrüche und `white-space`/`text-wrap` kommen aus dem Quelltext.
  Projekt-Text mit geschützten Leerzeichen bekommt normale Leerzeichen, damit
  die Browser-Zeilenumbrüche greifen.
- Schriftdateien werden über Familie und Gewicht an die Projekt-Familie gehängt.
  Numerische Familien wie `Manrope-600` werden als Gewicht 600 erkannt.
- Fehlende Bildquellen werden über die Kartendomäne gematcht, zum Beispiel
  `Volmer-Betonwerk.de`; die Bilder landen als lokale Assets.

### Bake und Editor

- `keepBase` an importierten Regeln: Der Bake darf die Basisdeklarationen des
  Projekt-Imports nicht mehr verwerfen. Vorher fehlten im Preview Schriftgröße,
  Familie, Farbe und Layout, weil diese Werte nur in den Regeln standen.
- `packages/renderer/src/style-css.ts` behält Regeln mit `origin.keepBase`.
- `packages/widget-engine/src/css/style-rule.ts` bewahrt `keepBase` beim
  Parsen und Validieren.
- Editor-Baselines für 1440/1024, Design/Overflow/Live, hell/dunkel neu.

## Belege und Messwerte

Gemessen bei 1440 px gegen `https://fluffy-rectangle-418998.framer.app/`:

- Hero-H2 „Dein Partner für dein Webauftritt“: 872x184 an x=508, in Quelle und
  Vorschau gleich.
- Badge „Freelance WordPress …“: 343x20 an x=526, in Quelle und Vorschau gleich.
- Textfarben: `#fff` und `#ebe4e4`, passend zur Quelle.
- „Echte Meinungen statt Werbetexte“: 806x198, zwei Zeilen wie die Quelle.
- „Direkter Kontakt …“: 570 breit, 198 hoch; die Quelle hat 264 hoch, weil sie
  vier explizite Zeilenumbrüche setzt. Die Breite stimmt.
- Warum-ich-Spalten: 570/570.
- Projektbilder: Volmer 1469x819, Betreuung 1257x864, Porträt 570x650, alle als
  lokale Assets.
- Live-Editor: Wave `mounted`, 39 Frames, WebGL-Kontext, sieben Controls,
  Box `fixed` mit `inset:0`, keine Konsolenfehler.
- Body: 1440x5070 in der Vorschau gegen 1440x8486 in der Quelle.

Tests:

- Letzter Sammellauf: 669/672 grün, 2 übersprungen, ein Timeout unter Volllast
  (`motion-bake-timing`). Der Fall lief allein 4/4 grün.
- Frühere Timeouts in `capture.test.ts`, `inline-text.test.ts` und
  `import-fixture-gate-browser.test.ts` liefen einzeln grün.
- Typecheck, Lint, Patch-, Modul-, Routen-, Manifest-, Qualitäts- und
  Abhängigkeits-Wächter sowie Build und `verify:dist` sind grün.

## Noch offen

Priorisiert, jeweils mit eigenem Definition-of-Ready und Gate:

1. **Code-Komponenten portieren. Erledigt am 15.11.2026.** `Navbar`,
   `Footer 2`, `Step 2` und `Ticker reviews item` sind native DOM-Widgets
   (ADR-0038, Abschnitt „DOM-Widgets“ oben). Der Body misst 8 351 px gegen
   8 486 px der Quelle (−1,6 %). Die Pflichtgates (`typecheck`, `lint`,
   `check:patch`, `module:check`, `route-matrix:check`, `quality:check`,
   `deps:check`, `build`, `verify:dist`) und der schwere
   Framer-Import-Bestand (629 Tests grün, 2 übersprungen, inklusive
   `capture-hover`, `capture-browser`, `import-live-capture`, Fixture- und
   Visual-Gate) sind erledigt. Die damals offenen Unterpunkte sind mit ADR-0039
   erledigt: DOM-Widgets mounten eager, die Palette-Defaults sind bildfrei
   (`sourceMedia`), und das Fillout-Formular ist ein Consent-Embed. Offen bleibt
   nur der vollständige Rest-Repo-Sammellauf ohne 600-s-Zeitfenster.
2. **Projektkarten vervollständigen. Erledigt am 16.11.2026.** Die Anreicherung
   klont die zwei fehlenden Karten (`Linasfotozauber.de`,
   `Ulrepforte-Events.de`) aus dem Live-IR als native Knoten. Der echte
   Projekt-XML-Lauf mit `styleUrl` liefert vier Karten mit den Daten `31.05.26`,
   `08.08.23`, `20.06.24`, `13.07.26` und vier lokalen Bildern. Belege:
   `project-style-enrichment.ts`, `project-style-enrichment.test.ts`, ADR-0039.
3. **Live-Vorschau. Geprüft am 16.11.2026.** `createPreview` nutzt denselben
   `bakePages`-Pfad wie das Release, nicht einen separaten Design-Bake. Die
   Widget-Islands laufen; DOM-Widgets mounten mit `data-widget-eager` sofort,
   Canvas-Kerne bleiben lazy. Eine zusätzliche „release-nahe“ Vorschau ist
   damit nicht nötig.
4. **Zuordnung härten. Erledigt am 16.11.2026, mit Grenze.** Mehrdeutige
   Textfarben bekommen einen konservativen DOM-Pfad-Fallback; verbleibende
   Fälle stehen mit Text im Bericht. Im echten Lauf bleiben drei Knoten mit
   zwei Texten offen (`Web design & Web development`, `5.00 Google Bewertung`).
5. **Seiten-Root verallgemeinern. Erledigt am 16.11.2026.**
   `normalizeDesignCanvasFrame` erkennt das Canvas direkt oder in einem
   einzelnen Seiten-Wrapper, bevorzugt gemessene Pixelbreiten und lässt normale
   Abschnitte mit absolutem Hintergrund stehen; `desktop-frame.test.ts` 5/5.
6. **Persistente Demo. Umgesetzt am 16.11.2026.** `pnpm demo:fluffy` nutzt die
   laufende `senify start`-Instanz mit der Postgres aus
   `~/.senify/config.json` und legt Site und Seite nur beim ersten Lauf an
   (Mock: erster Lauf legt an, zweiter findet, `imports=1`). Die echte
   persistente Instanz wurde in dieser Sitzung nicht gestartet; der Pfad ist
   dokumentiert und die Idempotenz ist belegt.
7. **Live-Prüfung und Projekt-XML-Abdeckung. Erledigt am 16.11.2026.** Die
   Live-Prüfung fand fünf leere Framer-Instanzen (`Avatar & info`, `Button`,
   `Button 2`, `Ticker`, `View all 2`), einen schwarzen Hero-Absatz und
   429-Fehler im Editor. Die fünf Komponenten sind jetzt native Widgets; der
   Absatz wird über `innerHtml` plus whitespace-freien Match auf `#f8f8f8`
   gesetzt; `GET /api/widget-module` umgeht den Read-Burst. Jede unbekannte
   Komponenten-Instanz erzeugt einen `component-instance`-Befund. Warum die
   alten Gates es nicht fanden: Fixture/Visual prüften den HTML-Capture-Pfad,
   der Projekt-XML-Pfad hatte keine Inhaltsabdeckung; die Mapping-Tabelle war
   geschlossen; der Farb-Match las nur `text.content`; das Modul-Limit fiel
   erst bei 13 Widgets auf. Belege: ADR-0040,
   `packages/app/test/framer-widgets-browser.test.ts`,
   `packages/engine/test/widget-module.test.ts`. Der vollständige
   Projekt-XML-Inhaltsgate bleibt als nächste Härtung offen.

## Fallstricke

- Der Editor-Live-Modus ist der richtige Ort für die Wave. Die Preview-Route
  ist Design-Modus und zeigt die Platte.
- `styleUrl` muss öffentlich erreichbar sein. Der Engine-Fetcher blockt private
  und lokale Adressen.
- Die Projekt-XML enthält keine Textfarben und keine Schriftdateien. Ohne
  `styleUrl` bleibt die Typografie bei der Systemschrift und geerbten Farbe.
- Die XML beschreibt den Design-Canvas. Rohbreiten wie 1200 px, 428 px oder
  100 px sind keine veröffentlichten Layoutwerte.
- Der Volllauf mit Browser-Suiten ist unter paralleler Last empfindlich.
  Browser-Gates und `motion-bake-timing` einzeln wiederholen, bevor ein
  Timeout als Codefehler gilt.
- Der Unframer-MCP folgt dem in Framer geöffneten Projekt. Die MCP-URL ist ein
  Secret und steht nicht in diesem Dokument. Die Projekt- und Seiten-XML liegen
  als `.scratch/fluffy-project-clean.xml` und `.scratch/fluffy-home-desktop.xml`.
- Die `.scratch`-Dateien und `packages/renderer/test/preloader.test.ts` sind
  nicht Teil des Commits. Sie sind Arbeitsmaterial aus dieser und paralleler
  Arbeit.

## Arbeitsweise für den nächsten Schritt

Definition of Ready für den nächsten Port:

- Die betroffene Komponente ist in der Quelle und in der Projekt-XML
  identifiziert.
- Der sichtbare Soll-Zustand ist als Browser-Messung oder Screenshot belegt.
- Die bestehende Widget-Schnittstelle und der Editor-Injektionspfad sind klar.
- Ein Browser-Test und ein Import-Test sind benannt.

Gate am Ende:

```powershell
pnpm typecheck
pnpm lint
pnpm check:patch
pnpm module:check
pnpm route-matrix:check
pnpm quality:check
pnpm build
pnpm verify:dist
```

Dazu die betroffenen Tests, zum Beispiel:

```powershell
pnpm exec vitest run packages/framer-import
pnpm exec vitest run packages/framer-import/test/motion-bake-timing.test.ts
pnpm exec vitest run packages/framer-import/test/import-fixture-gate-browser.test.ts
pnpm exec vitest run packages/editor/test/elements.test.ts
pnpm exec vitest run packages/renderer/test/style-rules-css.test.ts
```

## Relevante Dateien

- `packages/framer-import/src/unframer-ir.ts`: Projekt-XML-Parsing, Grid-Spans.
- `packages/framer-import/src/mapper.ts`: Layout, `1fr`, Seiten-Root, Regeln.
- `packages/framer-import/src/project-style-enrichment.ts`: `styleUrl`,
  Farben, Fonts, Bilder, Zeilenumbrüche.
- `packages/framer-import/src/import.ts`: Projekt- und `styleUrl`-Fluss,
  Fingerprint.
- `packages/renderer/src/style-css.ts`: `keepBase` im Bake.
- `packages/widget-engine/src/css/style-rule.ts`: Schema und Roundtrip.
- `packages/editor/src/explorer/elements-model.ts`: 24. Kachel und Icon.
- `packages/widgets/src/wave-background.ts`: nativer Wave-Port.
- `docs/adr/0028-unframer-als-zweite-quelle.md`: Projekt-XML plus `styleUrl`.
- `docs/adr/0035-native-widget-klassen-fuer-framer-code-komponenten.md` und
  `docs/adr/0036-import-portierte-code-komponenten-als-widgets.md`: Widget-Muster.
- `docs/adr/0037-effekt-widgets-im-design-canvas.md`: Design-Canvas-Effekte.
- `docs/current/stand.md` und `docs/current/qualitaet.md`: aktueller Stand und
  Messwerte.
