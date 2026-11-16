# About-Vergleich mit eingefrorener Quelle wiederholen

Type: task
Status: resolved

## Problem

Der visuelle Vergleich von `/about` misst unterschiedliche A/B-Fassungen.
Der Build enthält „Fewer tools.", die Live-Quelle lieferte beim
Screenshot „Hire managers and do work". Dadurch sind Text, Seitenhöhe und
Pixelabweichung nicht vergleichbar.

## Beleg

- `.scratch/framer-live-2026-11-09/visual-herofix2-2026-11-09/result.json`
- Screenshots `about/tablet/*.png`, `about/mobil/*.png`
- Erster Bildschirm 12.342/14.937 %, ganz 10.094/9.634 %
- Höhen Build/Quelle: 7183/5505 Tablet, 7993/5290 Mobil

## Nächster Schritt

- Den SSR-/Browser-Aufbau der importierten Fassung als eingefrorene
  Vergleichsquelle rendern (gleiche HTML/CSS/Assets wie der Build), nicht
  die Live-Seite.
- Danach den Hero bei 768 und 390 px vergleichen. Falls die Überschrift
  weiterhin leer bleibt, Farbe, Layout und Sichtbarkeit der eingefügten
  Variante prüfen.
- Erst mit derselben Fassung eine Aussage über Parität treffen.

## Abnahme

- Vergleich Build gegen dieselbe eingefrorene Fassung; Abweichung und
  verbleibende Unterschiede benannt.

## Answer

Die vermutete A/B-Fassung war eine Gerätevariante: Desktop „Fewer tools.",
Tablet „Hire managers and do work". `restoreIdLessDeviceVariants` hat
beide Fassungen in den Build gebracht. Der Lauf `visual-herofix3`
vergleicht dieselbe Fassung; die Höhen passen (5537/5537, 7174/7205,
7965/8032). Erster Bildschirm 0.364/13.057/11.185 %, ganz
1.229/5.228/7.208 %. Die verbleibende Top-Abweichung ist der fehlende
Hero-Button, Issue 04. Eine eingefrorene Quelle ist für diesen Fall nicht
mehr nötig.

## Comments

- 09.11.2026: Nach der allgemeinen Varianten-Ergänzung. Die vermeintliche
  A/B war die Gerätevariante; der Lauf `visual-herofix3` vergleicht dieselbe
  Fassung. Offen bleibt der Hero-Button (Issue 04).
