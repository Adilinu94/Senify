# ADR-0036: Der Import bildet portierte Code-Komponenten als native Widgets ab

**Status:** Angenommen, 14.11.2026
**Betrifft:** `packages/framer-import`, `packages/widget-engine`, `packages/widgets`
**Ergänzt:** ADR-0028, ADR-0035

## Kontext

ADR-0035 hat die nativen Widget-Klassen eingeführt (Pilot `ribbon-gallery`): Katalog-Primitive,
Vanilla-Kern, Props-Kanal, Bake-Bündelung, Editor-Live-Mount. Der Framer-Import hat Code-Komponenten
aber weiter als `placeholder` → `payload` („Platte") übernommen. Damit war die Infrastruktur da,
aber der Weg von der Quelle ins bearbeitbare Widget nicht verdrahtet: Eine importierte Seite zeigte
die Code-Komponente als Platte, nicht als nativen, editierbaren Kern.

Zwei Quellenformen tragen unterschiedliche Information:

- **Projekt-XML (ADR-0028):** `<CodeComponent codeFileId path="WaveBackground.tsx">` plus Instanzen
  mit `componentId="<codeFileId>"`. Hier ist die Identität der Komponente benannt.
- **SSR-/HTML-Capture (ADR-0027):** Framer rendert Code-Komponenten im Server-HTML nicht; es bleibt
  ein leerer Laufzeit-Platzhalter ohne Namen. Der Name ist hier nicht lesbar.

Außerdem schreibt die Unframer-MCP XML-Kommentare auch **innerhalb** eines Tags
(`<!-- the component id this instance uses -->` vor `componentId`, gemessen an
fluffy-rectangle-418998 am 14.11.2026). Der Parser endet am ersten `>` außerhalb von Anführungen —
das wäre das `>` des Kommentar-Endes, und das Tag verlöre `componentId`.

## Entscheidung

1. **Geschlossene Abbildung im Mapper.** `widgetTypeForCodeComponent(componentType)` normalisiert
   den Namen (klein, ohne Dateiendung, ohne Nicht-Alphanumerics) und bildet ihn über eine feste
   Tabelle auf den Widget-Typ ab: `wavebackground → wave-background`, `ribbongallery → ribbon-gallery`.
   Ein `placeholder`-Knoten mit Treffer wird zum Widget-Primitive statt zum `payload`; die
   Katalog-Defaults füllt der Markup-Serializer. Unbekannte Komponenten bleiben eine ehrliche Platte.
2. **Nur die benannte Quelle.** Die Abbildung greift auf der Projekt-XML, weil nur sie die Identität
   trägt. Der SSR-Pfad kann die Komponente nicht benennen und bleibt beim Laufzeit-Platzhalter; das
   ist eine Grenze der Quelle, kein stiller Verlust.
3. **Kommentare vor dem Parsen entfernen.** `parseUnframerXml` entfernt `<!-- … -->` vor dem
   Tag-Scan. Kommentare tragen keine Strukturdaten; ihre Entfernung macht das MCP-XML lesbar, ohne
   die Attribut-Reihenfolge zu verändern.
4. **Zweiter Port nach demselben Muster.** `wave-background` ist ein vollflächiger WebGL2-
   Fullscreen-Shader, wortgleich zur Quelle portiert (kein Three.js im Release), mit sieben
   Inspector-Controls (Geschwindigkeit, Wellenhöhe, Zoom, Leuchten, Farbphase, Sättigung, Detail).

## Verworfene Alternativen

- **Abbildung über den Knotennamen auch im SSR-Pfad:** Der SSR-Platzhalter trägt den Namen nicht;
  ein Treffer über `node.name` würde gleichnamige, aber fremde Frames falsch als Widget übernehmen.
  Die Abbildung bleibt beim benannten `componentType` der Projekt-XML.
- **Kommentare im Tag-Scan überspringen:** `tagEndOf` müsste Kommentarzustände führen; das entfernt
  keine Struktur und verkompliziert den heißen Pfad. Das Vorab-Entfernen ist einfacher und sicher.

## Folgen

- Eine importierte fluffy-rectangle-Seite trägt `wave-background` als bearbeitbaren Knoten; FormPopup,
  FilloutForm und ReviewsTicker bleiben Platten, bis sie portiert sind.
- Die Tabelle ist die geschlossene Liste der portierten Komponenten; jede weitere folgt nach dem
  Muster aus ADR-0035 und bekommt hier einen Eintrag.
- Der Projekt-Import bleibt Desktop-Struktur (ADR-0028); Responsives und Laufzeitwirkung kommen
  über den Browser-Capture. Das Widget selbst läuft im Release runtime-frei als Island.
- **Lizenz:** Wie ADR-0035 — kein Produktions-Bibliothekseintrag ohne geprüften Nachweis.

## Belege

- Abbildung: `packages/framer-import/src/mapper.ts` (`widgetTypeForCodeComponent`),
  `packages/framer-import/test/widget-mapping.test.ts`
- Kommentar-Normalisierung: `packages/framer-import/src/unframer-ir.ts` (`parseUnframerXml`),
  `packages/framer-import/test/unframer-xml-comments.test.ts`
- Quelle → Widget: `packages/framer-import/test/unframer-code-components.test.ts`
- Projekt an der Engine-Route: `packages/engine/test/widget-import-project.test.ts`
- Kern und Controls: `packages/widgets/src/wave-background.ts`,
  `packages/widgets/test/wave-background.test.ts`, `packages/widget-engine/src/widgets.ts`
- Editor-Live-Mount: `packages/app/test/editor-wave-browser.test.ts`