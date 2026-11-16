# Der Unframer-MCP wird die zweite Import-Quelle für Projektstruktur

Status: angenommen · 01.11.2026
Bezug: ADR-0010 (Island-Payload), ADR-0025 (CMS als Handover-Skript),
ADR-0026 (Struktur-Baum), ADR-0027 (Browser-Capture als Standard),
`docs/fahrplan-framer-1zu1.md` §4.1 (Messung 21.10.2026) und E3/E5,
`docs/current/roadmap.md` Block 3 und Block 4

**Problem.** Block 3 war keine Implementierungsfrage, sondern eine
Produktentscheidung: S3b (Island-Payloads) und S4 (Fremdcode) hängen an einer
Quelle, die es in echten Exporten nicht gibt. `data-framer-module` kommt in
keinem realen Export vor; die generische Extraktion bräuchte Projektwissen,
das weder das SSR-HTML noch der Browser-Capture preisgeben. Dasselbe gilt für
das CMS-Mapping in Block 4: Framer-Collections stehen weder im gerenderten DOM
noch in der `.framercms`-Datei, die die Quelle nie lädt (ADR-0025).

**Gemessen (21.10.2026, Projekt `sustained-shares-680007`).** Der Unframer-MCP
(`Framer MCP 1.8.0`, 23 Werkzeuge) liefert genau diese Schicht:

- `getProjectXml` (23 KB): `<Pages>` mit `nodeId` und `path`, `<Components>`
  mit Namen (`Primary Button`, `Services Card`, …), Text-Stile
  (`/Body/Body-16Px-Medium`, `font`, `fontSize`, `lineHeight`) und Farbstile
  als Pfade (`/White/White`, `/Blue/Dark Blue`).
- `getNodeXml` (92 KB je Seite): die echte Layout-Struktur mit lesbaren Namen
  und Layout-Attributen (`layout="stack"`, `stackDirection`,
  `stackDistribution`, `padding`, `maxWidth`), Bilder als
  `backgroundImage`-Adressen.
- `getCMSCollections` liefert die Format-Doku; im getesteten Projekt gab es
  keine Sammlungen, die Collection-Daten selbst sind damit **nicht** belegt.

**Grenzen, ebenso gemessen.**

- Die Zeitsteuerung steht nicht im XML: `appear`, `transition`, `animation`,
  `transform` kommen **0-mal** vor. Die Wirkung ist beschrieben, der Ablauf
  nicht. Unframer ersetzt deshalb **nicht** den Browser-Capture (ADR-0027) und
  nicht die Original-Runtime.
- `exportReactComponents` antwortet *„No active React Export subscription
  found"* — der React-Export ist kostenpflichtig und mit dem vorhandenen
  Zugang nicht nutzbar (E4: nein).
- Das MCP ist ein **Editor-Plugin**: Es antwortet nur, während Framer offen ist
  und der Projektzugang besteht (E5: eigene Projekte, Zugang bejaht).
- Das XML ist eine **schreibende** Projekt-Schnittstelle (`updateXmlForNode`,
  `createPage`, `deleteNode`), keine Export-Schnittstelle. Der Import darf nur
  lesen.
- **Lizenz:** Im npm-Manifest fehlt ein `license`-Feld. Belegt ist nur private
  Nutzung (E3). Für Kundenarbeit ist die Lizenz vorher schriftlich zu klären.

**Entscheidung.** Auf die Frage vom 01.11.2026 — „Unframer jetzt bauen" — wird
der Unframer-MCP die zweite Import-Quelle:

1. **Struktur-Lieferant, kein Runtime-Ersatz.** Der Projekt-Weg liefert
   benannte Komponenten, Stapel-Layout, Token-Pfade, Code-Dateien und — wenn
   vorhanden — CMS-Sammlungen. Er tritt **neben** den URL-Weg, nicht an seine
   Stelle: Der Browser-Capture bleibt der Standard für veröffentlichte Seiten
   (ADR-0027), weil nur er den gerenderten Inhalt und die Gerätevarianten
   liefert.
2. **Eigener, ausdrücklich gewählter Pfad.** Ein Projekt-Import braucht
   Projektzugang und ein laufendes Framer mit dem Plugin. Er ist opt-in und
   scheitert sichtbar, wenn der Zugang fehlt — kein stiller Rückfall auf den
   URL-Weg und kein halbes Dokument. Ein fehlgeschlagener Lesevorgang wird als
   solcher berichtet.
3. **Nur lesen.** Der Import nutzt ausschließlich die lesenden Werkzeuge
   (`getProjectXml`, `getNodeXml`, `getCMSCollections`, `getCMSItems`,
   `readCodeFile`). Die schreibenden Werkzeuge des MCP (`updateXmlForNode`,
   `createPage`, `deleteNode`) werden nicht aufgerufen; ein Import verändert
   das fremde Projekt nie.
4. **Die Lizenz ist eine Betriebsbedingung, keine Fußnote.** Der Anschluss
   bleibt auf private Nutzung beschränkt, bis eine schriftliche Klärung
   vorliegt. Für Kundenarbeit ist der Pfad gesperrt, solange das Manifest kein
   `license`-Feld trägt.
5. **Block 4 wird damit offen.** CMS-Mapping, Lokalisierung und Code-Sections
   bekommen ihre Quelle; sie bleiben eigene Arbeitsschritte, kein Nebenprodukt
   dieses Anschlusses.

**Verworfene Alternativen.**

- *Benannte Grenze ohne zweite Quelle.* Am 01.11.2026 verworfen: Sie hätte
  Block 3 und den CMS-Teil von Block 4 dauerhaft geschlossen, obwohl die
  Strukturquelle gemessen verfügbar ist.
- *CMS nur über einen Export mit CMS-Daten.* Verworfen, weil ein solcher
  Export nicht existiert; das Handover-Skript (ADR-0025) trägt Laufzeitdaten,
  keine Collections.
- *React-Export abonnieren.* Verworfen (E4): kostenpflichtig, und der
  erzeugte React-Code wäre eine zweite Brücke neben dem IR — nicht dieselbe
  Entscheidung.

**Folgen.**

- Neue Implementierungsstrecke „Unframer als zweite Quelle": Client zum MCP,
  Projekt-XML in das IR abbilden, ein eigener Dialog-/CLI-Pfad, eine eigene
  Anleitung. Der URL-Weg und seine Tests bleiben unverändert.
- Der Projekt-Weg kann den Capture ergänzen (Struktur aus dem Projekt,
  Wirkung aus dem Browser), aber die beiden Läufe bleiben getrennt und
  idempotent je Quelle.
- Die Lizenzfrage steht als Betriebsbedingung im Anschluss und in der
  Anleitung; ohne Klärung wird der Pfad nicht für Kundenarbeit freigegeben.
- Block 3 ist entschieden, Block 4 (CMS, Lokalisierung, Code-Sections) ist
  geöffnet. Die Reihenfolge steht in `docs/current/roadmap.md`.

**Beleg.** Der Frage-Dialog vom 01.11.2026 (Antwort: „Unframer jetzt bauen")
und die Messung vom 21.10.2026 in `docs/fahrplan-framer-1zu1.md` §4.1
(Projekt-XML, Seiten-XML, Grenzen) sowie E3/E4/E5 daselbst. Kein Code in
diesem Schritt — der Fahrplan verlangt die Entscheidung **vor** dem Bau
(`docs/fahrplan-framer-import.md`, Schritt 6).

**Nachtrag 14.11.2026: Typografie aus der Projekt-XML.** `ColorStyle` trägt den Wert als
`light`/`dark` (nicht `value`/`color`); der Import liest beides. `TextStyle` trägt Familie, Größe,
Zeilenhöhe und Gewicht, aber **keine Farbe und keine Schriftdatei** (`getProjectXml` an
fluffy-rectangle-418998, 14.11.2026). Der Import übernimmt das Gewicht des Stils (ein festes 700
überschrieb bisher `Manrope-regular` = 400) und ergänzt bei einer Familie ohne Komma einen
Sans-Fallback (`system-ui, sans-serif`), damit der Browser nicht auf Serif zurückfällt.

Weil die XML die fehlenden Stücke nicht hergibt, nimmt die Projekt-Quelle zusätzlich eine
optionale `styleUrl` (die veröffentlichte Seite, in der CLI `--style-url`). Der Import liest daraus
Typografie und fehlende Bildquellen: Textfarben werden über den sichtbaren Text inklusive geerbter
Farben und der sichtbaren Desktop-SSR-Kopie zugeordnet, Schriftdateien über Familie und Gewicht an
die Projekt-Familie gehängt, Bildquellen über die Kartendomäne. Explizite Zeilenumbrüche sowie
`white-space`/`text-wrap` kommen aus dem Quelltext mit. Die Struktur bleibt ausschließlich aus der
XML. Mehrdeutige Worte (gleicher Text, mehrere Farben) bleiben ungesetzt statt geraten; ohne
`styleUrl` oder bei nicht ladbarer Seite bleibt der bisherige Stand und der Bericht nennt die Lücke.

Der Projekt-Weg normalisiert außerdem das Design-Canvas-Layout: Das absolute 1200px-Desktop-Frame
wird relative/100%, Framer-`1fr` wird in vertikalen Stacks 100% und in horizontalen Stacks ein
gleicher Flex-Anteil (`flex: 1 1 0`, `min-width: 0`), `gridColumnSpan`/`gridRowSpan` werden zu
`grid-column`/`grid-row`, und die Breite eines Grid-Elements mit Span größer 1 kommt aus dem Span,
nicht aus der Design-Zeit-Breite. Die XML beschreibt den Entwurfsstand (Hero 428px,
Heading-Gruppe 100px), nicht die veröffentlichte 1440px-Seite. Belege:
`packages/framer-import/test/unframer-mcp-format.test.ts` (DNA und Fidelity),
`packages/framer-import/test/project-style-enrichment.test.ts`,
`packages/framer-import/test/unframer-ir.test.ts`, `packages/engine/test/imports-project.test.ts`
und der Live-Import von fluffy-rectangle (Seite `7fCjkme4ryDJ6g`): Hero-H2 872x184 an x=508,
Badge 343x20 an x=526, Farben `#fff`/`#ebe4e4`, zwei Projektbilder als lokale Assets
(1469x819, 1257x864), Warum-ich-Spalten 570/570, Body 1440x5070 gegen 1440x8486 der Quelle.
Die Restdifferenz sitzt in den noch nicht portierten Code-Komponenten (Navbar, Process,
ReviewsTicker, Footer) und einer Kartenvariante; der Live-Editor zeigt die Wave, die Vorschau
bleibt im Design-Modus schwarz.

**Nachtrag 02.11.2026 — die CMS-Antworten sind gemessen.** Gegen das laufende
MCP (1.8.0) wurden `getCMSCollections` und `getCMSItems` an einem Projekt mit
Sammlungen und Einträgen gelesen. `getCMSCollections` antwortet mit einer
Markdown-Einleitung plus JSON `{ message, collections }`; `getCMSItems` mit
reinem JSON `{ message, pagination, items }`, jeder Eintrag
`{ id, slug, draft, fieldData: { <feldId>: { type, value } } }` und **ohne
Sammlungsangabe** — eine Antwort gilt einer Sammlung. Der Import liest deshalb
mehrere Antworten je Lauf und ordnet die Einträge über die Feld-Ids, die
Sammlungsangabe oder den Namen in `message` zu. Die Aussage oben („die
Collection-Daten selbst sind damit nicht belegt") gilt für die Messung vom
21.10.2026 und ist damit überholt.
