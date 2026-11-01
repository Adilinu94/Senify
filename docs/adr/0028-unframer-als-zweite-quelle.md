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
   (`getProjectXml`, `getNodeXml`, `getCMSCollections`, `readCodeFile`). Die
   schreibenden Werkzeuge des MCP (`updateXmlForNode`, `createPage`,
   `deleteNode`) werden nicht aufgerufen; ein Import verändert das fremde
   Projekt nie.
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
