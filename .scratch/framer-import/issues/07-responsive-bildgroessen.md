# Responsive Bildgroessen und Sichtbarkeit

Status: ready-for-agent
Label: ready-for-agent

## Befund

Auf Tablet und Telefon weichen mehrere Bilder in Groesse oder Sichtbarkeit von der Quelle ab, obwohl die Quelle je genau eine sichtbare Kopie hat. Der Messlauf `visual-settle2-2026-11-10` zeigt die Abweichung als Abschnittsdifferenz von 25,109 % auf `/` Tablet (y = 6552) und 18,866 % auf `/` Mobil (y = 5400).

Gemessen mit `bildvergleich-probe-2026-11-10.mts` (Bildboxen nach echtem Durchscrollen, Toleranz 5 px):

| Bild | Build 768 | Quelle 768 | Build 390 | Quelle 390 | Knoten |
|---|---|---|---|---|---|
| `carlpPM1kN3CInhX3cyoiSaBeY.png` | 190 x 70 | 728 x 579 | 190 x 70 | 350 x 373 | `fi-8a5eda-256` / `-257` |
| `23zbhLqXWJaYKXDXfcwz403QY.png` | 0 x 0 | 708 x 453 | 0 x 0 | 330 x 211 | `fi-8a5eda-311` |
| `kmzIY3DscBLklZ9EEdpqnP4YU.png` | 0 x 0 | 121 x 121 | 0 x 0 | 121 x 121 | `fi-8a5eda-549` |
| `7Osd9PtuR2Z93lzdHhTbtb5wEI.png` | 0 x 0 | 121 x 121 | 0 x 0 | 121 x 121 | `fi-8a5eda-557` |
| `NiRTSPhfqpzagfyKo7RmVTHOzs0.png` | 0 x 0 | 121 x 121 | 0 x 0 | 121 x 121 | `fi-8a5eda-565` |
| `kKgWSPAXQwKw028gXV4A7jSvFQ.png` | 330 x 210 | 190 x 70 | 330 x 210 | 190 x 70 | `fi-8a5eda-476` |

Desktop 1440 ist bei allen genannten Bildern deckungsgleich.

## Ursache (eingegrenzt)

- Der Portraet-Container `fi-8a5eda-256` bekommt im Tablet-Block `width:190px; height:70px`. Die Quelle hat an dieser Stelle keine feste Groesse: der Wrapper ist `position:absolute; inset:0`, der Elternteil setzt `aspect-ratio:0.9395973154362416` und wird 728 x 579 breit. Woher der 190-x-70-Tablet-Zustand kommt, ist nicht belegt; er passt zur Groesse der Footer-Logoleiste.
- Die Bildkette `fi-8a5eda-308 > -309 > -310 > -311` traegt in der Basis `width:1px; flex:1 0 0; aspect-ratio:1.56138 / 1`. Im Tablet-Block bekommt `-308` `width:100%; flex:none`, aber `-309` erhaelt keine Breite. Damit bleibt `-309` bei 1 px, die Hoehe folgt der Aspect-Ratio, und das Bild wird 0 x 0. Die Quelle setzt an dieser Stelle die volle Spaltenbreite.
- Beide Faelle treffen Knoten ohne HTML-id. `mergeDeviceVariants` paart Gerätevarianten nur ueber `htmlId`; die Breakpoint-Zustaende kommen aus dem Framer-CSS. Die Vermutung ist eine falsche Zuordnung der `_tablet`-Zustaende beim Falten der Breakpoint-Kopien.

## Naechster Schritt

1. Fuer `fi-8a5eda-256` und `fi-8a5eda-309` die IR-Knoten je Gerät ausgeben (vor dem Falten) und den 190-x-70-Tablet-Zustand sowie die fehlende Breite belegen.
2. Im Mapper die `_tablet`/`_mobile`-Props dieser Knoten gegen die Quell-CSS-Regeln pruefen.
3. Einen Test bauen, der einen Container mit `width:1px; flex:1 0 0; aspect-ratio` und einem Tablet-Override `width:100%` abbildet.

## Abnahme

Die sechs genannten Bilder liegen bei 1440, 768 und 390 px innerhalb von 5 px zur Quelle; der Tablet-Screenshot bei y = 6552 zeigt das Portraet in voller Groesse. Ein Test deckt den Breakpoint-Fall mit Aspect-Ratio und `1px`-Flex-Fuellung ab. Der Live-Vergleich nennt Datum und Quelle.

## Belege

- `.scratch/framer-live-2026-11-09/visual-settle2-2026-11-10/start/tablet/build-abschnitt-8.png` und `original-abschnitt-8.png`
- `.scratch/framer-live-2026-11-09/visual-settle2-2026-11-10/result.json`
- `.scratch/framer/bildvergleich-probe-2026-11-10.mts`
- `.scratch/framer/quelle-kopien-2026-11-10.mts`
- `.scratch/framer-live-2026-11-09/structure-relay6-2026-11-10/relay/before/assets/style-rules.css`
