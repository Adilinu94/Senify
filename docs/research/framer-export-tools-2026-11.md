# Recherche: Werkzeuge für den Framer-Import

Stand: 03.11.2026. Einordnung für Senify; die priorisierte Umsetzung bleibt in [Fahrplan](../fahrplan.md) und [Framer-Roadmap](../framer-roadmap.md). Preis- und Produktangaben können sich ändern. Recherche anhand von Anbieter-Dokumentation, Repository-README und gezielt gelesenem Quellcode. **Keines der Fremdwerkzeuge wurde im Rahmen dieser Recherche installiert oder auf der Beispielseite ausgeführt.**

## Ergebnis

Kein recherchiertes Werkzeug belegt bereits für beliebige Framer-Projekte gleichzeitig vollständige Seiten- und CMS-Übernahme, vollständig strukturierte Bearbeitbarkeit in Senify, exakte Animationen und ein Ergebnis ohne Framer-Site-Runtime. Die vielversprechendste Kombination ist: bestehende Export- und Unframer-MCP-Pipeline behalten, `Niranjan266/unframer` gezielt für Appear-Extraktion prüfen, eine unabhängige Animationserfassung ergänzen und das Ergebnis gegen das Original messen. PullPage Ultra und Deframer sind zusätzlich interessante kommerzielle Vergleichskandidaten, aber keine nachgewiesene Senify-Integration.

Ein lokal gespeichertes Original-Skript kann weiterhin Framer-Runtime sein. Keine Verbindung zu Framer-Servern ist deshalb nicht gleichbedeutend mit runtimefrei. Code in Dateien ändern zu können ist außerdem nicht dasselbe wie strukturierte Bearbeitbarkeit im Senify-Editor.

## Die vier angefragten Quellen

### PullPage

Die [Vergleichsseite](https://pull.page/compare/framer-export-tools) ist eine Marktübersicht des Anbieters selbst, keine unabhängige Prüfung. Seine gewöhnlichen Website-Exporte sind Snapshots zur Selbsthostung. Davon getrennt bietet [Ultra](https://pull.page/framer-to-astro) laut Anbieter ein Astro-Projekt mit Dateien für Seiten, Komponenten und CMS sowie ohne Framer-Runtime. Der Anbieter benötigt dafür einen Framer-Projektlink und einen Framer-API-Key; der vorhandene Unframer-MCP-Link allein ist nicht als Ersatz belegt. Das Projekt wird laut Anbieter vor Auslieferung gebaut und enthält einen Bericht zu bekannten Unterschieden.

Am 03.11.2026 nennt die [Preisseite](https://pull.page/pricing) für Ultra einmalig 99 USD bis 10 gestaltete Seiten, 199 USD bis 30 und 399 USD bis 75; bis 1.000 CMS-Einträge sind enthalten. Ein neuer Export ist erneut kostenpflichtig. Eine optionale manuelle Qualitätssicherung beginnt bei 390 USD. Die Garantie bezieht sich auf den funktionierenden Build, nicht auf nachgewiesene identische Animationen oder Senify-Bearbeitbarkeit. Formulare und weitere servergebundene Funktionen müssen laut Anbieter neu angebunden werden. Die Dokumentation der normalen Exporte wirbt mit erhaltenen Animationen; daraus folgt keine identische Abdeckung jeder Animation in Ultra.

**Empfehlung:** Interessanter externer Benchmark und gegebenenfalls Alternative für einen Einzelfall. Kostenlosen Vorabcheck nur mit geeignetem Projekt-API-Key erwägen; kein Kauf, API-Key-Transfer oder Integration aus der Recherche abgeleitet. Astro-Ausgabe muss erst auf Laufzeit, Animationen, lokale Assets und Überführung in Senifys Modell untersucht werden.

### danbenba/FramerExport

[FramerExport](https://github.com/danbenba/FramerExport) ist bereits eingebunden: `packages/mcp/package.json` fixiert `framer-export` auf `5.0.2`, die Aufrufe liegen in `packages/mcp/src/framer-export.ts`. Es liefert einen lokalen Mirror der veröffentlichten Site und ist ein guter Rohdaten- und Referenzlieferant. Der vorhandene Beispiel-Export meldet `html-with-runtime`. Exportierte Assets und Skripte ersetzen weder das editierbare Projektmodell noch die Motion-Konvertierung. Bei späterem Update auf abweichende Versionen und Ausgabeformate prüfen.

### randy-ajaib/framer-clone

Das [Repository](https://github.com/randy-ajaib/framer-clone) beschreibt einen eigenen Website-Builder-MVP im Framer-Stil mit Canvas, Stack-Layout und HTML/CSS-Export. Es beschreibt keinen Konverter für bestehende Framer-Websites. Die GitHub-API meldete bei der Recherche keine erkannte Lizenz. **Empfehlung:** Für das Importproblem derzeit keine Priorität; Code nicht ohne geklärte Lizenz übernehmen.

### Niranjan266/unframer

[Niranjan266/unframer](https://github.com/Niranjan266/unframer) ist ein eigenständiger MIT-lizenzierter Konverter und **nicht** der bereits genutzte Dienst [unframer.co](https://unframer.co/), dessen [React-Export-Projekt](https://github.com/remorses/unframer) ebenfalls `unframer` heißt. Geprüfter Repository-Stand: `c2bdb17ecdc22310bf23e3acdb5065e86e3dcb00`; GitHub meldete zuletzt einen Push am 22.08.2026.

Der Standardpfad des Projekts kann Framer-Appear-Daten analysieren und in CSS überführen. [Öffentliche Funktionen](https://github.com/Niranjan266/unframer/blob/main/src/index.ts) umfassen Parser, CSS-Kompilierung, Breakpoints und Spring-Konvertierung. [Spring-Kurven](https://github.com/Niranjan266/unframer/blob/main/src/easing.ts) werden zu einer gesampelten CSS-`linear()`-Kurve: Das ist eine Annäherung und für sich kein Nachweis identischer Bewegung. Im lokalen Mirror der Nutzersite sind `data-framer-appear-id` und Appear-Daten vorhanden. Das macht einen Pilot sinnvoll; erfolgreiche Verarbeitung ist noch nicht belegt.

Wichtig: Der im [CLI-Code](https://github.com/Niranjan266/unframer/blob/main/src/cli.ts) untersuchte `exportsite`-Pfad setzt `keepRuntime: true` und `compileAnimations: false`. Für diesen Pfad gilt daher nicht automatisch das Ziel „ohne Framer-Runtime“. Die README beschreibt bei [Interaktionen](https://github.com/Niranjan266/unframer#interactions) weitere Grenzen: Reveal-Effekte werden teilweise aus versteckten Ausgangszuständen rekonstruiert; Ticker-Geschwindigkeit und -Richtung sind Defaults. Hover-Varianten, Akkordeons, Karussells und Scroll-Parallax werden laut Projekt nicht vollständig nachgebildet. `--offline` ist im Code vorhanden, trotz widersprüchlicher älterer Roadmap-Aussage; seine Vollständigkeit ist nicht praktisch geprüft.

**Empfehlung:** Höchste Priorität für einen kleinen, isolierten Motion-Pilot: Appear-Daten der Beispielseite mit Senifys bestehender Extraktion vergleichen und die daraus erzeugten Kurven messen. Besser erst Parser-Ergebnis als Evidenz prüfen, bevor die ganze Ausgabe oder eine Dependency übernommen wird. MIT-Lizenz und Notices bei Codeübernahme beachten. Kein Ersatz für Motion-IR, Interaktionen oder vollständigen Import.

## Weitere relevante Werkzeuge

| Werkzeug | Nutzen für Senify | Grenze und nächster Schritt |
|---|---|---|
| [PicassoWeb](https://github.com/blackridder22/PicassoWeb) | MIT-MCP; `capture_motion` erfasst laut Dokumentation Browseranimationen, Bildfolgen und numerische Transform-/Opacity-Verläufe; `compare_replica` unterstützt Bildvergleich. | Laut README Echtzeit-Sampling mit Mindestintervall 100 ms; schnelle Effekte können unterabgetastet sein. Als diagnostisches Vergleichswerkzeug gegen bestehendes Playwright messen, nicht als Konverter ansehen. |
| [reanimate](https://github.com/NiazMorshed2007/reanimate) | MIT-Skill zur Aufnahme, Bewegungsanalyse und frameweisen Gegenüberstellung; beschreibt auch Canvas-/WebGL-Tracing. | Agenten-Workflow, kein fertiger automatischer Senify-Konverter; laut Projekt Windows nicht getestet und bisher mit Claude Code getestet. Virtuelle Zeit und Genauigkeit müssen für die eigenen Effekte empirisch validiert werden. |
| [ui-clone-skills](https://github.com/voidmatcha/ui-clone-skills) | Apache-2.0-Workflow für Quellcode-/Bundle-Analyse, Bewegungsparameter und Vergleich über Zustände. | Herstellerangaben ohne eigenen Praxistest; Agenten-Workflow und React/Tailwind-Ausgabe sind kein Senify-IR. Insbesondere robuste Extraktion aus minimierten Bundles nachweisen. |
| [Replica](https://github.com/maisjandesign/replica) | MIT-Chrome-Erweiterung erfasst laut Projekt WAAPI und gemessene Bewegungsverläufe für Seitenausschnitte. | Ausschnittsorientiert und als Agent-Prompt gedacht; keine komplette Site-Konvertierung. |
| [framer-to-code](https://github.com/iamshubhransh/framer-to-code) | MIT-Projekt mit Mirror- und Hard-Modus, Sichtbarkeitsinventar und Reparaturbericht. | Mirror behält Framer-Runtime. Hard-Modus entfernt Bundles, behält laut README aber einen Framer-Inline-Appear-Animator und rekonstruiert Interaktionen durch Agentenarbeit; Laufzeitfreiheit nach Senify-Definition separat prüfen. Keine Garantie für strukturierte Bearbeitung oder null Nacharbeit. |
| [SiteForge](https://github.com/Yashkapure06/framerclone) | MIT-Projekt mit Analyse, Vorschau und HTML-/React-/Next-Ausgabe sowie KI-gestützter Bereinigung laut README. | Unbekannt, wie gut Framer-Motion, Laufzeitfreiheit und CMS wirklich sind; eher Vergleichskandidat als Abhängigkeit. |
| [Deframer](https://deframer.co/) | Anbieter verspricht generierte TypeScript-Projekte für mehrere Frameworks ohne Framer-Runtime; Assets optional lokal. | Geschlossenes kommerzielles Produkt; Animationsabdeckung und strukturierter Senify-Import unbewiesen. Laut [Anbieter](https://deframer.co/blog/can-you-export-framer-website-to-html) sind Konvertierung und Vorschau kostenlos, Download benötigt Credits; Preise und Verfügbarkeit vor Nutzung prüfen. |
| [SiteFreeze](https://www.sitefreeze.com/) | Anbieter verspricht Offline-Export mit Animationen. | Anbieter erklärt ausdrücklich, dass die vollständige Framer-Runtime erhalten bleibt. Als Referenz/Mirror interessant, nicht für das runtimefreie Ziel. |
| [Unframe](https://github.com/Fato07/unframe) | Framer-Komponenten in React verwenden. | README erklärt ausdrücklich, dass Framer-Runtime in den Bundles enthalten ist; erfüllt das Ziel nicht. |

## Animationen: praktische Konsequenz

1. **Originaldaten vor Schätzung:** Appear-JSON und Breakpoints aus dem Mirror, anschließend Unframer-MCP-Daten auf tatsächlich verfügbare Motion-Felder untersuchen. Herkunft, fehlende Parameter und Zuordnung pro Knoten erfassen.
2. **Parser-Pilot:** Niranjans Appear-/Spring-Funktionen auf wenige reale Effekte anwenden und mit `packages/framer-import/src/motion-mapping.ts` vergleichen. Originalkurve, Zeitpunkt und Trigger im Browser messen; Approximation nicht als Originalparameter ausgeben.
3. **Bewegung aufnehmen:** CSS-/WAAPI-Parameter und Zustände erfassen; JS-Bewegung zusätzlich über wiederholte Positions-/Style-Messung und Frames beobachten. Chrome weist darauf hin, dass sein [Animationsinspektor](https://developer.chrome.com/docs/devtools/css/animations) `requestAnimationFrame` nicht erfasst. Scroll, Hover, Klick und Unterbrechung getrennt prüfen.
4. **Motion-IR implementieren:** Konkrete Timelines und Trigger in einem editierbaren Senify-Modell speichern; ADR-0006 muss vor Abkehr von der bestehenden Preset-Bindung entschieden werden. CSS/WAAPI oder bereits vorhandenes GSAP als Wiedergabe je Effekt prüfen, nicht als automatische Datenquelle missverstehen.
5. **Gegenprobe:** Original und Senify mit gleichen Viewports, Zuständen und Zeitpunkten vergleichen. Überprüfen, ob geglättete Kurven zwischen Messpunkten und bei Unterbrechung passen. Unbekannte oder nicht unterstützte Effekte ausdrücklich im Ergebnis ausweisen.

## Priorisierte nächste Erprobung

Alle folgenden Punkte sind Vorschläge und noch nicht umgesetzt. DoR und gezielte, risikobasierte Gates aus dem [Fahrplan](../fahrplan.md) gelten weiterhin.

1. **F0/F4: Appear-Pilot.** Bereits vorhandene Beispielseite und wenige bewusst gewählte Effekte verwenden. Relevanten MIT-Code und Abhängigkeiten vor Ausführung prüfen; in isoliertem temporärem Verzeichnis ausführen. Messpunkte: verfügbare Rohparameter, korrekte Knoten- und Breakpoint-Zuordnung, Kurvenabweichung, Runtime-Abhängigkeit, Laufzeit und Fehlerbericht. Eine zusätzliche echte Site oder Fixture mit anderer Spring-Kurve verhindert eine Schlussfolgerung aus nur einem Beispiel.
2. **F0/F7: Motion-Vergleich.** PicassoWeb und reanimate anhand desselben Effekts und derselben Zeitpunkte mit bestehendem Playwright-Ansatz vergleichen. Windows-Kompatibilität und den realen Erfassungsbereich prüfen; keine zusätzliche Suite bei jeder kleinen Änderung erzwingen.
3. **F2/F3: Vollständigkeit.** Mirror und MCP-Snapshot gegen Sitemap, Routen, CMS-Referenzen und lokale Assetliste abgleichen; diese Informationen in das Projekt-IR übernehmen.
4. **F4/F5: Compiler und Interaktionen.** Nach ADR-Entscheidung vollständige Motion-Werte und die tatsächlich benötigten Trigger übernehmen; nicht unterstützte Fälle sichtbar melden.
5. **Externe Benchmarks optional.** PullPage Ultra und Deframer nur nach Prüfung der aktuellen Bedingungen und Freigaben mit derselben Site vergleichen; Bearbeitbarkeit, Netzwerk und Runtime anhand der tatsächlichen Ausgabe prüfen. Für die Recherche wurden keine Schlüssel an Drittanbieter übertragen und keine Kosten ausgelöst.

Ein Testkandidat wird erst zur Abhängigkeit, wenn Nutzen, Kompatibilität, Lizenz, Sicherheitsprüfung, Wartbarkeit und reproduzierbares Ergebnis für die konkreten Sites belegt sind.
