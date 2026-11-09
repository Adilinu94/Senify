# CSS-Masken beim Framer-Build: Korrektur und Nachweis

**Stand:** 09.11.2026 · Ausgang `0d81172` plus Korrektur · Test-Engine mit pg-mem, isolierte Testdaten. Die Browserläufe verwenden die veröffentlichte Chocolate-Website; es wurde kein Projektzugang benötigt.

## Fehler und Ursache

Der Chocolate-Nachlauf nach dem Posterfix meldete in der strukturierten Startseite fehlende lokale SVG-Dateien. Browserdiagnose: Die ausgelieferten StyleRules verwiesen über `mask` und `-webkit-mask` auf `/assets/<id>/import-image.svg`; diese Dateien fehlten im Build. Der bisherige Asset-Sammler in `packages/engine/src/bake.ts` sammelte Objektreferenzen in Seitenbäumen und Theme-Schriftdateien, nicht die lokalen URLs in StyleRules. Die ursprüngliche Untersuchung steht in `paket1-nachlauf-2026-11-09.md`.

## Korrektur und Tests

Der Build sammelt zusätzlich lokale `/assets/<id>/…`-URLs in CSS-`url(...)` aus Knoten-Props sowie StyleRules (Basis, Zustände, Kontexte und `rawCss`). Anschließend löst der bestehende Auslieferungspfad die IDs ausschließlich gegen bereite Assets der aktuellen Site auf; ungültige und fremde IDs führen nicht zum Kopieren fremder Dateien.

`packages/engine/test/bake-style-assets.test.ts` belegt einen realen Upload, gespeicherte StyleRules und Build: Ein ausschließlich durch Basis-/Hover-CSS referenziertes SVG fehlte vor der Korrektur und wird danach ausgeliefert. Ergänzende Prüfungen decken Geräte- und Kontextwerte sowie die Nichtauslieferung eines ungenutzten Assets und eines Assets einer anderen Site ab. Die konkrete Datei wird geprüft, nicht nur das erzeugte CSS.

## Echtseiten-Nachlauf

`.scratch/framer-live-2026-11-09/css-mask-nachlauf/` enthält den isolierten Vorher-/Nachher-Lauf der Fixture und von Chocolate `/` und `/about`. Nach Abschalten des Seiten-Payloads steht der bearbeitete Text auf beiden Seiten in HTML und Browser-DOM; der Seiten-Payload-Träger steht nicht mehr im HTML. Im strukturierten Zustand meldete der Browser auf diesen beiden Seiten keine Konsolen-/Seitenfehler und keine Framer-Domain-Anfragen; zuvor waren auf der Startseite 13 lokale SVG-Anforderungen mit 404 aufgefallen.

Dieser Lauf misst 1440 × 900 bei hellem Farbschema, am Seitenanfang und nach fünf Sekunden. Er belegt weder sämtliche Assets bei anderen Scrollpositionen oder Geräten noch vollständige Motion-, Editierbarkeits- oder Runtime-Freiheit. Im aktiven Original-Payload-Zustand meldete die Startseite weiterhin externe Framer-Anfragen und Browserfehler; der Schritt betrifft die lokale CSS-Asset-Auslieferung, nicht diese verbleibenden Abhängigkeiten.

Testläufe und Zahlen ausschließlich in `docs/current/qualitaet.md`. Die lokalen Laufartefakte sind ignoriert und können Projektinhalte enthalten; sie nicht ungeprüft einchecken.
