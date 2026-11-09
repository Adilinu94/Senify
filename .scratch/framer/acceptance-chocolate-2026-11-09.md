# Chocolate: Framer- und Awwwards-Abnahme vom 09.11.2026

## Umfang und Ausgangslage

- Projektstand: Branch `integration/c-auf-g-2026-11-08`, HEAD `90fddba`. Isolierte lokale Engine-Testinstanz mit pg-mem; keine produktive Datenbank oder bestehendes Senify-Projekt verändert.
- Quelle: veröffentlichte Chocolate-Framer-Site und vom Nutzer bereitgestellter Unframer-Zugang. Zugang nicht gespeichert oder hier angegeben.
- Unframer-Snapshot erfolgreich: 9 Seiten, 13 Komponenten, eine CMS-Sammlung. Export mit 9 Unterseiten abgeschlossen. Vorbereitung: 32 Assets, 54 Fonts, keine gemeldeten fehlgeschlagenen Downloads; die vorbereitete Struktur führt nur die Startseite als reguläre Seite, da der Export die Unterseiten flach ablegt. Sie meldet fehlende statische Seiten; das ist kein Nachweis, dass die HTML-Dateien fehlen.
- Zwei Seiten (`/`, `/about`) über die Engine mit Browser-Capture und `fidelity` in ein neues Testprojekt importiert und gemeinsam gebacken. Dies ist keine vollständige CMS-/Mehrseiten-Abnahme; der Unframer-Snapshot wurde vorbereitet, aber in diesem Engine-Test nicht als Projektquelle geschrieben.

## Wesentlicher Befund: Framer-Runtime und Bearbeitbarkeit

Der Import der Startseite meldete `succeeded`, zugleich eine seitenweite `Framer-Runtime`-Payload und `editableShare: { editable: 0, original: 100 }`. Im Build sind für beide untersuchten Seiten je ein solches Runtime-Bundle eingebunden: ca. 2,0 MB für `/` und 1,4 MB für `/about`. Der Renderer verwendet damit die ursprüngliche Runtime als Seitenausgabe; die vorhandene Struktur im Editor ist nicht gleichbedeutend mit einer bearbeitbaren veröffentlichten Seite. Codepfad: `packages/framer-import/src/import.ts`, insbesondere `buildPageRuntimePayload` und `editableShare`.

Der Lauf zeigt damit einen Widerspruch zum Ziel eines vollständig editierbaren, Framer-Runtime-freien Imports. Es ist ausdrücklich nicht belegt, dass das Problem bei jedem anderen Eingabepfad oder jeder anderen Site auftritt. `/about` und Startseite wurden mit der veröffentlichten URL und Browser-Capture getestet, nicht mit dem vorbereiteten Mirror.

## Awwwards MCP: praktischer Test

- Separat installiert und über MCP gestartet: `awwwards-mcp` 1.18.0 mit Playwright. Die Original-Startseite wurde bei 1440 px und mobil bei 390 px mit `analyze_page_structure` untersucht; `analyze_hover_census` und `get_motion_dna` liefen ebenfalls.
- Der Desktop-/Mobil-Vergleich fand Seitenhöhen von 8966 bzw. 12790 px. Für Mobil meldet das Werkzeug keinen globalen horizontalen Overflow, weist aber auf einzelne über den Viewport reichende Elemente hin. Da Inhalte absichtlich beschnitten sein können und die Auswertung gekappt war, sind dies Hinweise, keine bestätigten Fehler.
- `verify_build` verglich die lokale Senify-Ausgabe mit dem Original bei Desktop-Breite. Awwwards bewertete `/` mit 90/100 und `/about` mit 96/100, jeweils `pass`; die erfassten Seitenhöhen waren jeweils identisch. Diese Zahlen sind Werkzeug-Scores für Struktur und Motion-Fingerprints, keine Pixelwerte und kein Nachweis aller Interaktionen. Viele Strukturabschnitte blieben unbenannt; Zuordnungen erfolgten teilweise über die gleiche Hintergrundfarbe. Der Hover-Vergleich prüft laut eigener Ausgabe nur das Vorhandensein von Stichproben.
- **Wichtig:** Die beiden hohen Scores entstanden, obwohl beide Builds Framer-Runtime-Payloads enthalten. Ein Awwwards-`pass` ist daher kein Nachweis für Runtime-Freiheit, native Editierbarkeit oder vollständige funktionale Parität. Als ergänzendes Diagnosewerkzeug für Screenshots, Struktur- und Motion-Hinweise ist es nützlich; als alleiniges Abnahmekriterium ungeeignet.
- Vollständige Werkzeugantworten: `.scratch/framer-live-2026-11-09/awwwards-compare.json`; Snapshot, Mirror und Build liegen daneben. Der Vergleichsserver wurde nach dem Lauf beendet. Diese lokalen Artefakte sind unversioniert und können Projektinhalte enthalten.

## Nächste Schritte

1. Im Importpfad für Browser-URL und vorbereiteten Mirror einen expliziten runtimefreien Modus definieren und reproduzierbar nachweisen, welche Ausgabe tatsächlich aus dem editierbaren Senify-Baum entsteht. Bestehenden Payload-Vertrag nicht still ändern.
2. Für mindestens Startseite und `/about` prüfen: Editieren → Speichern → Build, Darstellung in Desktop/Mobil, lokale Assets, Netzwerk ohne Framer-Abhängigkeiten und Motion-Zustände. Runtime-Freiheit darf nicht allein aus fehlenden CDN-URLs gefolgert werden.
3. Flat-Export-Routen einschließlich CMS gezielt über den Mehrseitenkoordinator abnehmen; vorhandene Nutzeränderungen und fremde Seiten vor Reimport schützen.
4. Awwwards-Vergleiche als Zusatzbeleg verwenden und mit sichtbaren Screenshots, ausgewählten Interaktionen und Senifys eigenen Import-/Runtime-Gates verbinden. Freigabe nur bei expliziten Editierbarkeits- und Runtime-Kriterien.
