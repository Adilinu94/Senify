# Hover-Zustände der Framer-Quelle

Status: needs-triage (gemessen, nicht umgesetzt)
Label: needs-triage

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
