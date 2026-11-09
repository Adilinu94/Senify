# Paket 1: Nachlauf mit Poster und echte Chocolate-Seiten

**Datum:** 09.11.2026 · **Ausgang:** `f580e7c` plus Änderung am Belegskript · isolierte Test-Engine mit pg-mem; keine Produktdatenbank. Das Skript `.scratch/framer/paket1-beleg.mts` erlaubt mit `SENIFY_PAKET1_OUT` ein neues, noch nicht vorhandenes Ausgabeziel und überschreibt so die ältere Abnahme nicht. Es prüft Posterreferenz, sichtbaren Änderungsmarker und Payload-Träger; für die Fixture prüft es zusätzlich, ob die Fixture-Runtime nur im Payload-Zustand montiert wird.

## Ergebnis

- Kontrollierte Offline-Fixture mit `og:image` und lokal bereitgestelltem Bild: Import trägt ein Poster; beim aktiven Payload erscheint die bearbeitete Überschrift nicht in HTML oder DOM, nach `active:false` in beiden. Die Fixture-Runtime läuft nur mit aktivem Träger. Die endgültige Skriptfassung bestand den isolierten Offline-Lauf. Der frühere fehlgeschlagene Probelauf nutzte eine ungeeignete Fixture ohne erkanntes Poster und ist kein Produktfehler.
- Chocolate `/` und `/about`: Browser-URL-Import mit `fidelity`, anschließend Textmutation, Build vor und nach der Mutation und Build nach Deaktivierung beider Seiten-Payloads. Beide Träger hatten Poster und ließen sich deaktivieren. Der Marker war mit aktivem Payload auf beiden Seiten weder in HTML noch DOM; nach Deaktivierung auf beiden Seiten in HTML und DOM. Der Seiten-Payload-Träger war danach nicht mehr im HTML. Das bestätigt den behobenen B1-Speicherweg auf diesen Seiten.
- Bedingungen: Desktop 1440 × 900, helles Farbschema, zu Beginn der Seite und nach fünf Sekunden Wartezeit; andere Breiten, Scroll- und Motion-Zustände sind damit nicht abgenommen. Beide Tests nutzen dieselbe pg-mem-Testinstanz. Der Lauf belegt weder vollständige visuelle Parität noch eine vollständige Runtime-Freiheitsprüfung.

## Neuer Befund: fehlende CSS-Maskenmedien

Die strukturierte Startseite erzeugte im Browser 13 fehlgeschlagene lokale Bildanforderungen (HTTP 404); `/about` erzeugte im selben Zustand keine Browserfehler. Eine unabhängige Browserdiagnose identifizierte die 13 Ziele als `/assets/<id>/import-image.svg`. Mindestens ein Ziel wird im gebauten `assets/style-rules.css` als `mask` und `-webkit-mask` referenziert, die entsprechende Datei fehlt im Ausgabeverzeichnis. Die Original-Payload-Ausgabe der Startseite fragte zudem Framer-Medien an und meldete ebenfalls einige 404; dies ist kein Beleg für eine runtimefreie oder offlinefähige Ausgabe.

**Code-Indiz:** `collectDeliverableAssets` in `packages/engine/src/bake.ts` sammelt derzeit Asset-Referenzen aus Seitenbäumen und Theme-Schriften. Site-StyleRules werden später an den Renderer gegeben, aber nicht an diesen Sammler. Daher ist die fehlende Berücksichtigung von CSS-Maskenreferenzen die naheliegende Ursache; sie ist anhand einer kontrollierten Gegenprobe und des Imports noch endgültig abzusichern. Nur Assets derselben Site und mit zulässigem Status ausliefern; keine beliebigen fremden Pfade einlesen.

## Nächster Schritt

Einen Regressionstest anlegen, der ein lokales SVG ausschließlich in einer gespeicherten StyleRule (auch unter Zustand/Gerät, falls die Werte dort separat liegen) referenziert, einen echten Build ausführt und sowohl CSS-Verweis als auch ausgelieferte Datei prüft. Vor der Änderung muss dieser Test rot sein. Anschließend Erfassung und Auslieferung um die relevanten CSS-Werte ergänzen, einschließlich Schutz vor fremden, gelöschten oder ungültigen Asset-Referenzen. Danach den betroffenen Browserfall und die passenden Engine-/Renderer-Gates erneut ausführen.

Lokale Laufdaten: `.scratch/framer-live-2026-11-09/paket1-b1-offline-final/` und `.scratch/framer-live-2026-11-09/paket1-b1-echt/`. Sie sind ignoriert, können Projektinhalte enthalten und dürfen nicht ungeprüft committet werden. Die Browserdiagnose liegt nur im lokalen Laufverzeichnis. Der Unframer-Zugang wurde für diesen Nachlauf nicht benötigt.
