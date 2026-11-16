# Visueller Vergleich der Strukturseiten

**Stand:** 09.11.2026 · **Quelle:** `https://chocolate-attributes-385353.framer.app`
· **Build:** `.scratch/framer-live-2026-11-09/structure-navfix5-2026-11-09/chocolate/before`
· **Rohdaten:** `.scratch/framer-live-2026-11-09/visual-navfix-2026-11-09/result.json`

Die Quelle liefert aktuell die Seite „Astra", nicht mehr den alten
Chocolate-Inhalt. Verglichen wurde der Build **vor** der Textänderung, damit
der Testmarker nicht als Unterschied zählt.

## Verfahren

- Chromium, Gerätepixelverhältnis 1, Breiten 1440×900, 768×1024 und 390×844.
- Beide Seiten wurden bis 14.000 px durchgescrollt, dann nach oben gesetzt;
  danach 700 ms Wartezeit und Laden offener Bilder.
- Ganzseiten- und ersten Bildschirm aufgenommen.
- `pixelmatch` mit Schwelle 0.12 auf der überlappenden Fläche; Prozentwerte
  sind der Anteil abweichender Pixel, keine semantische Bewertung.
- Nur Scrollposition 0. Hover, Bewegung und echte Editoränderungen fehlen.
- In zwei von zwölf Vorbereitungen lief die 20-s-Grenze ab; die Screenshots
  wurden trotzdem genommen und sind entsprechend weniger beruhigt.

## Ergebnis nach dem Navigations-Fix

| Seite | Breite | Höhe Build / Original | Ganzseite | Erster Bildschirm |
|---|---|---|---|---|
| `/` | Desktop | 8966 / 8966 | 0.899 % | 0.251 % |
| `/` | Tablet | 11209 / 11206 | 6.457 % | 5.560 % |
| `/` | Mobil | 12698 / 12790 | 7.189 % | 8.043 % |
| `/about` | Desktop | 5537 / 5537 | 1.389 % | 1.327 % |
| `/about` | Tablet | 7183 / 7205 | 7.178 % | 23.869 % |
| `/about` | Mobil | 7993 / 8032 | 10.589 % | 28.012 % |

Der Build hatte in allen sechs Messungen keine Konsolenfehler und keine
fehlgeschlagenen Anfragen.

## Was der Fix geändert hat

Der Build enthält jetzt drei `<nav>`-Elemente statt einem. Auf Tablet und
Mobil erscheint der Hamburger, die Desktop-Links sind dort nicht mehr
sichtbar. Auf Desktop bleibt die Navigation unverändert.

Der erste Bildschirm verbesserte sich dadurch bei `/` von 6.245 auf
5.560 Prozent (Tablet) und von 9.765 auf 8.043 Prozent (Mobil); bei
`/about` von 24.322 auf 23.869 und von 29.840 auf 28.012 Prozent. Die
Ganzseitenwerte änderten sich nur wenig, weil dort viele andere Pixel
zählen.

## Verbleibende Abweichung

Die Navigation ist nicht mehr die Ursache der hohen Werte auf `/about`.
Dort bleibt der erste Bildschirm bei 23,9 beziehungsweise 28,0 Prozent.
Die Ursache ist noch nicht untersucht; Kandidaten sind der Hero-Textlink,
Schrift- und Farbunterschiede sowie die fehlende Framer-Dekoration.

## Nicht belegt

- Keine Parität der Darstellung, auch nicht auf Desktop.
- Keine Bewegung, kein Hover, kein Scrollzustand außer Position 0.
- Keine echte Editoränderung im Live-Lauf.
- Keine Aussage über weitere Seiten, CMS oder Gerätevarianten außerhalb
  des Kopfbereichs.
