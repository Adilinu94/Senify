# Hover-Zustände der Framer-Quelle

Status: Stufe 1 (ADR-0033) und Stufe 2, Gleitdauer (ADR-0034), umgesetzt. Rest offen: Eltern-Hover als Regel, Federkurve, Tablet/Mobil
Label: ready-for-human (Triage 12.11.2026, Scheiben unten)

## Befund

Der Textlink-Hover aus Issue 03 ist kein Fehler im Mapper. Der Capture liest `:hover` nur aus dem Stylesheet (`IrInteraction`, `applyClassRules` in `capture-html.ts`). Die Relay-Quelle (`gracious-balance-599544.framer.app`) hat dort keine passende Regel.

Gemessen am 11.11.2026, Startseite, 1440 × 900, Messskript `.scratch/motion-import/hover-messung-2026-11-11.mjs`:

- Die Spiegelung (`.scratch/framer-live-2026-11-09/mirror/index.html`) enthält `:hover` nur in Framers allgemeinen Regeln für Text-Links im Code-Block (`--framer-link-hover-text-color`). Das Build-CSS (`structure-relay9-2026-11-11/.../style-rules.css`) enthält 0 `:hover`.
- Von 28 Links und Knöpfen verändern 5 beim echten Hover ihre berechnete Darstellung: vier Knöpfe ohne Text (Hintergrund `rgb(255,255,255)` → `rgb(17,17,17)`, dazu ein anderer Innenschatten) und der „Submit“-Knopf (Hintergrund `rgb(17,17,17)` → `rgba(51,51,51,0.85)`).
- Das sind Framer-Varianten, die die Laufzeit beim Hover umschaltet. Ein CSS-Capture sieht sie nicht.

## Folgerung

Ein Import mit `capture: "browser"` müsste Hover-Zustände messen: Kandidaten (Links, Knöpfe, `role=button`) einzeln hovern, eine feste Liste visueller Eigenschaften vor und nach dem Hover vergleichen und die Differenz als `interactions.hover` am Knoten ablegen. Der bestehende Weg danach (`StyleRule.states`, Baker schreibt `:hover`) ist vorhanden.

## Offene Entwurfsfragen (vor dem Code zu klären)

- Welche Eigenschaften zählen (Farbe, Hintergrund, Rand, Schatten, Deckkraft, Transform, Filter), und wie lang die Übergangszeit ist (CSS-`transition` ableiten oder messen)?
- Wie wird der Knoten zugeordnet? Der Live-Schlüsselstempel (`senifyStampKeys`) ist an die DOM-Reihenfolge gebunden.
- Hover am Elternelement verändert Kinder (Karte hebt Bild an). Zählt das als Zustand des Elternknotens oder braucht es `.eltern:hover .kind`? Der Mapper meldet solche Regeln heute nur.
- Reichen die gemessenen Werte auf Tablet und Mobil, oder bleibt Hover auf Desktop (`(hover: hover)`)?

## Nicht entschieden

Die Messung belegt das Vorkommen auf einer Quelle. Sie belegt nicht, wie häufig das bei anderen Framer-Seiten ist.

## Nachtrag 11.11.2026: Übergang der Quelle

Gemessen mit .scratch/motion-import/hover-uebergang-probe.mts und hover-dauer-probe.mts an derselben Quelle: Alle 5 Hover-Knoten gleiten (Zwischenwerte nach 30 und 120 ms), obwohl das CSS 	ransition-duration: 0s hat. Der Wechsel beginnt nach etwa 100 bis 160 ms und endet nach rund 300 ms (letzter Wertwechsel bei 214 bis 457 ms). Folge 1 (umgesetzt): Der Messzeitpunkt wartet auf das Ende der Animation. Folge 2 (offen): Der Import gibt 	ransition nicht weiter, der Hover springt dort. Ob eine Übergangszeit ableitbar ist, entscheidet ein eigener Schritt mit eigener ADR.

## Nachtrag 11.11.2026: Eltern-Hover-Befunde

Die Befunde sanken von 22 auf 15, weil der feste Lesezeitpunkt (450 ms) bei sieben Knoten laufende Animationen als Kinder-Änderung las. Die 14 verbliebenen Elternknoten ändern ihre Kinder auch im eingeschwungenen Zustand. Siehe ADR-0033, Folgen. Beleg: .scratch/motion-import/eltern-hover-probe.mts.

## Nachtrag 12.11.2026: Gleitdauer und weitere Quellen

Sechs weitere Quellen mit .scratch/motion-import/hover-uebergang-probe.mts gemessen: Fünf haben Hover-Knoten, bei allen gleitet mindestens einer (Hintergrund, Transform, Deckkraft); Textlink-Farben springen. Daraus ADR-0034: Dauer wird abgeleitet und als transition am Basisstil abgelegt (Relay 350 bis 400 ms, Donutshop 500 bis 550 ms). Offen: Federkurve statt ease, Eltern-Hover als Regel, Tablet/Mobil. Nicht geklärt: Ein Capture gegen wedge.framer.website lief einmal über 10 Minuten ohne Ende und war danach nicht reproduzierbar (zweiter Lauf 48 s).

## Triage 12.11.2026: Scheiben

Stufe 1 und 2 sind umgesetzt (ADR-0033, ADR-0034). Der Rest ist klein geschnitten:

- 08a Eltern-Hover als Regel (.eltern:hover .kind): ready-for-agent, braucht eine eigene ADR und einen roten Test mit Kartenbeispiel. An der Relay-Quelle betrifft es 14 Elternknoten, bei Donutshop 21 Befunde (hover-capture-probe.mts).
- 08b Federkurve statt ease: needs-info. Erst belegen, dass die Abweichung sichtbar ist (Kurvenmessung an mehreren Quellen); ohne Beleg nicht bauen.
- 08c Tablet, Mobil und Touch ((hover: hover)-Schutz): ready-for-human. Produktfrage, ob Hover auf Touch erhalten bleiben soll.
