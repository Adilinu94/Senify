# Responsive Bildgroessen und Sichtbarkeit

Status: resolved 11.11.2026
Label: ready-for-agent

## Befund

Auf Tablet und Telefon wichen zwei Bilder in der Groesse von der Quelle ab, obwohl die Quelle je genau eine sichtbare Kopie hat. Der Messlauf `visual-settle2-2026-11-10` zeigte die Abweichung als Abschnittsdifferenz von 25,109 % auf `/` Tablet (y = 6552) und 18,866 % auf `/` Mobil (y = 5400).

Gemessen mit `bildvergleich-probe-2026-11-10.mts` (Bildboxen nach echtem Durchscrollen, Lazy-Loading abgeschaltet, Toleranz 5 px):

| Bild | Build 768 | Quelle 768 | Build 390 | Quelle 390 | Knoten |
|---|---|---|---|---|---|
| `carlpPM1kN3CInhX3cyoiSaBeY.png` | 190 x 70 | 728 x 579 | 190 x 70 | 350 x 373 | `fi-8a5eda-256` / `-257` |
| `kKgWSPAXQwKw028gXV4A7jSvFQ.png` | 330 x 210 | 190 x 70 | 330 x 210 | 190 x 70 | `fi-8a5eda-476` |

Desktop 1440 war bei beiden deckungsgleich. Die uebrigen Bildabweichungen im Vergleich sind Positionen einer laufenden Marquee (gleiche Groesse, anderer Takt) und keine Groessenfehler. Ein erster Probelauf ohne abgeschaltetes Lazy-Loading meldete zusaetzlich vier 0-x-0-Bilder; das waren nicht geladene Bilder, kein Layoutfehler.

## Ursache

`mergeStatesBySignature` paart die Knoten der Geraetebauten ueber `tag|Klassen|Varianten|id`. Ein Element ohne Klasse, Variante und id hat nur `div||||`; alle solchen Divs der Seite teilten sich eine Signatur, und die Paarung fiel auf die Dokumentreihenfolge zurueck. Im Relay-Build bekam der Portraet-Wrapper (`n1095`, keine Klasse) den Tablet-Zustand einer Logokarte (190 x 70), die Logokarte `kKgWSP` umgekehrt 330 x 210. Beide Groessen stehen in der Quelle an dieser Stelle nicht: Der Portraet-Wrapper ist `position:absolute; inset:0`, der Elternteil setzt `aspect-ratio:0.9395973154362416` und wird 728 x 579 breit.

## Korrektur

`signature(node, context)` nimmt fuer Elemente ohne eigene Token (Klasse, Variante, id) den naechsten klassierten Vorfahren als Kontext. Elemente mit eigenen Token behalten die bisherige Signatur, damit die wiederholten Karten weiter ueber die Reihenfolge gepaart werden. Neuer Test `merge-signature.test.ts`: zwei klassenlose Kinder unter verschiedenen klassierten Eltern, der Geraetebau steht in umgekehrter Reihenfolge. Ohne den Kontext bekommt das erste Kind 330 x 210, mit ihm 190 x 70; die Gegenprobe ist ausgefuehrt.

## Ergebnis 11.11.2026

- IR Relay7: Der Portraet-Wrapper traegt auf Tablet und Mobil keine feste Groesse mehr; `kKgWSP` traegt auf allen drei Geraeten 190 x 70.
- Bildvergleich `bildvergleich-relay7.log`: 24 Bilder je Seite; bei 1440, 768 und 390 stimmen die Groessen der beiden genannten Bilder. Die verbleibenden Abweichungen sind ausschliesslich Marquee-Positionen gleicher Groesse (Delta 0 in Breite und Hoehe).
- Abschnittsvergleich `visual-settle3-2026-11-11`: `/` Tablet y = 6552 von 25,109 auf 1,350 %, `/` Mobil y = 5400 von 18,866 auf 0,872 %. Der Screenshot zeigt das Portraet in voller Groesse.
- Die restlichen Ausreisser sind der Calendly-Platzhalter (`/contact` Mobil 28,639 %, Produktentscheidung) und die laufende Marquee (Tablet max 5,971 % bei y = 10647, Mobil max 12,832 % bei y = 9450).
- Framer-Import-Suite 581 bestanden, 2 uebersprungen; Typecheck und Lint gruen.

## Abnahme

Erfuellt: Die zwei genannten Bilder liegen bei 1440, 768 und 390 px innerhalb von 5 px zur Quelle; der Tablet-Screenshot bei y = 6552 zeigt das Portraet in voller Groesse. Die uebrigen Bilder stimmen in der Groesse (Marquee-Positionen duerfen abweichen). Ein Test deckt die Groessenvarianten der klassenlosen Kopien ab. Der Live-Vergleich nennt Datum und Quelle.

## Belege

- `packages/framer-import/src/import.ts` (`mergeStatesBySignature`)
- `packages/framer-import/test/merge-signature.test.ts`
- `.scratch/framer-live-2026-11-09/structure-relay7-2026-11-11/` (IR und Build)
- `.scratch/framer/bildvergleich-relay7.log` (Bildboxen bei 1440, 768 und 390)
- `.scratch/framer-live-2026-11-09/visual-settle3-2026-11-11/result.json`
- `.scratch/framer-live-2026-11-09/visual-settle3-2026-11-11/start/tablet/build-abschnitt-8.png`
- `.scratch/framer/karte-2026-11-11.mts` (IR-Zustaende der Karten)
