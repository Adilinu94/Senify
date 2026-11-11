# Responsive Bildgroessen und Sichtbarkeit

Status: ready-for-agent
Label: ready-for-agent

## Befund

Auf Tablet und Telefon weichen zwei Bilder in der Groesse von der Quelle ab, obwohl die Quelle je genau eine sichtbare Kopie hat. Der Messlauf `visual-settle2-2026-11-10` zeigt die Abweichung als Abschnittsdifferenz von 25,109 % auf `/` Tablet (y = 6552) und 18,866 % auf `/` Mobil (y = 5400).

Gemessen mit `bildvergleich-probe-2026-11-10.mts` (Bildboxen nach echtem Durchscrollen, Lazy-Loading abgeschaltet, Toleranz 5 px):

| Bild | Build 768 | Quelle 768 | Build 390 | Quelle 390 | Knoten |
|---|---|---|---|---|---|
| `carlpPM1kN3CInhX3cyoiSaBeY.png` | 190 x 70 | 728 x 579 | 190 x 70 | 350 x 373 | `fi-8a5eda-256` / `-257` |
| `kKgWSPAXQwKw028gXV4A7jSvFQ.png` | 330 x 210 | 190 x 70 | 330 x 210 | 190 x 70 | `fi-8a5eda-476` |

Desktop 1440 ist bei beiden deckungsgleich. Die uebrigen Bildabweichungen im Vergleich sind Positionen einer laufenden Marquee (gleiche Groesse, anderer Takt) und keine Groessenfehler. Ein erster Probelauf ohne abgeschaltetes Lazy-Loading meldete zusaetzlich vier 0-x-0-Bilder; das waren nicht geladene Bilder, kein Layoutfehler.

## Ursache (eingegrenzt)

- Beide Bilder liegen in derselben rotierenden Logokarte (`counterRotate360`/`rotate360`). Die IR-Probe `ir-gerade-2026-11-10.mts` zeigt beim Portraet: Der Wrapper `n1095` traegt im IR **desktop keine Groesse**, aber **tablet und mobil 190 x 70**. Das ist die Groesse der Logokarte, nicht des Portraets. Die Quelle hat an dieser Stelle keine feste Groesse: der Wrapper ist `position:absolute; inset:0`, der Elternteil setzt `aspect-ratio:0.9395973154362416` und wird 728 x 579 breit.
- Die Logokarte `kKgWSP` bekommt umgekehrt 330 x 210 statt 190 x 70. Die beiden Groessen scheinen zwischen den Karten vertauscht.
- Beide Knoten haben keine HTML-id; die Gerätevarianten werden ueber das Framer-CSS gelesen. Die Vermutung ist eine falsche Zuordnung der Komponenten-Variante beim Falten der Breakpoint-Kopien: Die Karte erbt die Groesse einer anderen Variante desselben Bausteins.

## Naechster Schritt

1. Fuer `fi-8a5eda-256` und `fi-8a5eda-476` die Komponenten-Instanz und ihre Variantenklasse (`framer-v-*`) im IR ausgeben und die Quelle der 190-x-70- beziehungsweise 330-x-210-Zustaende belegen.
2. Im Mapper die `_tablet`/`_mobile`-Props dieser Karten gegen die Quell-CSS-Regeln und die Variantenklasse pruefen.
3. Einen Test bauen, der eine Komponenten-Instanz mit zwei Varianten unterschiedlicher Groesse abbildet.

## Abnahme

Die zwei genannten Bilder liegen bei 1440, 768 und 390 px innerhalb von 5 px zur Quelle; der Tablet-Screenshot bei y = 6552 zeigt das Portraet in voller Groesse. Die uebrigen Bilder stimmen in der Groesse (Marquee-Positionen duerfen abweichen). Ein Test deckt die Groessenvarianten der rotierenden Logokarte ab. Der Live-Vergleich nennt Datum und Quelle.

## Belege

- `.scratch/framer-live-2026-11-09/visual-settle2-2026-11-10/start/tablet/build-abschnitt-8.png` und `original-abschnitt-8.png`
- `.scratch/framer-live-2026-11-09/visual-settle2-2026-11-10/result.json`
- `.scratch/framer/bildvergleich-probe-2026-11-10.mts`
- `.scratch/framer/ir-gerade-2026-11-10.mts`
- `.scratch/framer/quelle-kopien-2026-11-10.mts`
- `.scratch/framer-live-2026-11-09/structure-relay6-2026-11-10/relay/before/assets/style-rules.css`
