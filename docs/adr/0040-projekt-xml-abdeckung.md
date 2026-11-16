# ADR-0040: Projekt-XML-Abdeckung, Textfarben und Modul-Limit

**Status:** angenommen, 16.11.2026

**Betrifft:** `packages/framer-import`, `packages/widget-engine`, `packages/widgets`, `packages/engine`, `packages/app`

**Ergänzt:** ADR-0036, ADR-0038, ADR-0039

## Kontext

Die Live-Prüfung der importierten fluffy-Seite zeigte fünf leere Komponenten
(`Avatar & info`, `Button`, `Button 2`, `Ticker`, `View all 2`), einen schwarzen
Hero-Absatz und nach dem Einbau der neuen Widgets 429-Fehler im Editor. Die
bestehenden Fixture- und Visual-Gates waren grün, weil sie den **HTML-Capture-
Pfad** prüfen; der **Projekt-XML-Pfad** hatte keine Inhaltsabdeckung.

## Entscheidung

1. **Die geschlossene Komponentenabbildung wird erweitert.**
   `Avatar & info`/`Avatar & info 2` werden `framer-avatar-info`,
   `Button`/`Button 2`/`Button 3` werden `framer-button`, `Ticker`/`Ticker 2`
   werden `framer-stats`, `View all`/`View all 2` werden `framer-view-all`.
   Die Instanzattribute liefern Name/Rolle, Labels/Links und die vier
   Statistik-Paare; das Avatar-Bild kommt aus `sourceMedia`.
2. **Keine stillen leeren Fassaden mehr.** Jede Komponenten-Instanz ohne
   Widget-Abbildung erzeugt einen `component-instance`-Befund (warn) mit
   Komponentenname und Instanzwerten. Der Importbericht zeigt damit genau die
   Stellen, die noch portiert werden müssen.
3. **Textfarben lesen auch gemischtes Inline-Markup.** `textOfNode` fällt auf
   `innerHtml` zurück (Absätze mit `<br>` und Wort-Spans); der Farb- und
   Layout-Lookup nutzt zusätzlich einen whitespace-freien Schlüssel. Der
   Projekt-Text `andere.Ich` trifft damit die Quelle `andere.\nIch`.
4. **Widget-Module verbrauchen kein gemeinsames Read-Budget.**
   `GET /api/widget-module` ist statisches ESM und wird mit `rateLimit: false`
   ausgeliefert. Die 13 Module einer Seite hatten den Burst von 20 zusammen mit
   den Seiten-APIs aufgebraucht; die späteren Widgets blieben `failed`.
5. **Die Regressionen bekommen Tests.** Acht Widgets im Browser
   (`framer-widgets-browser`), ein unbekannter Komponenten-Befund
   (`component-widgets`), ein `innerHtml`-/Whitespace-Farbfall
   (`project-style-enrichment`) und ein Modul-Test mit Burst 1
   (`widget-module`) halten die Pfade offen.

## Warum die alten Gates das nicht fanden

- Der Fixture-Gate und der Visual-Gate importieren den **HTML-Capture**; dort
  sind die Komponenten bereits expandiert. Der Projekt-XML-Pfad wurde nur auf
  ausgewählte Widgets und Bilder geprüft, nicht auf vollständige
  Komponentenabdeckung.
- Die Mapping-Tabelle war absichtlich geschlossen. Unbekannte Instanzen wurden
  zu normalen Rahmen ohne Kinder; es gab keinen Befund und keine sichtbare
  Platte.
- Der Farb-Match las nur `states[0].text.content`. Der Hero-Absatz liegt im
  Capture aber als gemischter `innerHtml`-Knoten vor.
- Das Modul-Limit fiel erst auf, als die Widget-Anzahl von 4 auf 13 stieg.

## Folgen und Grenzen

- Die fünf Komponenten sind jetzt als native Widgets bearbeitbar; die
  Avatar-Marke, der Statistik-Ticker und die Buttons sind optische Nachbauten,
  keine Pixelkopien.
- Unbekannte Komponenten bleiben technisch Rahmen, sind aber im Bericht
  sichtbar. Ein vollständiger Projekt-XML-Inhaltsgate (Quelle gegen Import)
  bleibt als nächste Härtung sinnvoll.
- Der Hero-Absatz ist mit `#f8f8f8` belegt; drei Textknoten bleiben bewusst
  mehrdeutig und stehen im Bericht.
- Die Live-Instanz ist weiterhin temporär (pg-mem); die persistente Demo nutzt
  die laufende `senify start`-Instanz.

## Belege

- Widgets: `packages/widget-engine/src/widgets.ts`,
  `packages/widget-engine/src/dom-widgets.ts`,
  `packages/widgets/src/framer-{avatar-info,button,stats,view-all}.ts`
- Abbildung/Props: `packages/framer-import/src/widget-mapping.ts`,
  `packages/framer-import/src/mapper.ts`,
  `packages/framer-import/test/component-widgets.test.ts`
- Farben: `packages/framer-import/src/project-style-enrichment.ts`,
  `packages/framer-import/test/project-style-enrichment.test.ts`
- Bericht: `packages/framer-import/src/ir.ts` (`component-instance`)
- Limit: `packages/engine/src/http-routes-media.ts`,
  `packages/engine/test/widget-module.test.ts`
- Browser: `packages/app/test/framer-widgets-browser.test.ts`
- Live: Site `64ZYiIHvR-gVK9`, Seite `Jnzud_d8X8L-84`, 13 Widgets `mounted`,
  keine Konsolenfehler, Hero-Absatz `rgb(248, 248, 248)`.
