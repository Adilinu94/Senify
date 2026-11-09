# Visueller Vergleich der Strukturseiten

**Stand:** 09.11.2026 · **Quelle:** `https://chocolate-attributes-385353.framer.app`
· **Build:** `.scratch/framer-live-2026-11-09/structure-linkfix-2026-11-09/chocolate/before`
· **Rohdaten:** `.scratch/framer-live-2026-11-09/visual-before-2026-11-09/result.json`

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

## Ergebnis

| Seite | Breite | Höhe Build / Original | Ganzseite | Erster Bildschirm |
|---|---|---|---|---|
| `/` | Desktop | 8966 / 8966 | 0.899 % | 0.251 % |
| `/` | Tablet | 11209 / 11206 | 6.520 % | 6.245 % |
| `/` | Mobil | 12698 / 12790 | 7.304 % | 9.765 % |
| `/about` | Desktop | 5537 / 5537 | 1.261 % | 0.557 % |
| `/about` | Tablet | 7183 / 7205 | 7.224 % | 24.322 % |
| `/about` | Mobil | 7993 / 8032 | 10.746 % | 29.840 % |

Der Build hatte in allen sechs Messungen keine Konsolenfehler und keine
fehlgeschlagenen Anfragen.

## Befund

Auf Desktop ist die Darstellung nah. Auf Tablet und Mobil zeigt der Build
die Desktop-Navigation (Home, Pricing, About, Blog, Contact, Book a demo),
während die Quelle den Hamburger und die schmale Navigation zeigt. Auf dem
Telefon ragt die Desktop-Navigation links aus dem Bild. Das erklärt den
hohen Unterschied im ersten Bildschirm, besonders auf `/about`.

Die Höhen weichen nur wenig ab: `/` Tablet +3 px und Mobil -92 px,
`/about` Tablet -22 px und Mobil -39 px. Der Fehler sitzt damit sichtbar
im Kopfbereich, nicht in einem fehlenden ganzen Abschnitt.

## Offener Fall

`.scratch/responsive-import/issues/01-tablet-navigation.md`

Die Quelle rendert getrennte Navigationsvarianten. Die Browser-Aufnahme bei
1440 px sieht nur die Desktop-Variante; der statische Merge ordnet
id-lose Kind-Teilbäume nicht zu. Ein Fix braucht eine stabile Zuordnung
über Breiten hinweg und ein Minimal-Fixture.

## Nicht belegt

- Keine Parität der Darstellung, auch nicht auf Desktop.
- Keine Bewegung, kein Hover, kein Scrollzustand außer Position 0.
- Keine echte Editoränderung im Live-Lauf.
- Keine Aussage über Tablet- und Telefonvarianten einzelner Abschnitte
  außerhalb des Kopfbereichs.
