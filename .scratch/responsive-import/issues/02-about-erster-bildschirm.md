# Erster Bildschirm von /about weicht stark ab

Type: bug
Status: needs-triage

## Problem

Nach dem Navigations-Fix bleibt der erste Bildschirm von `/about` bei
23.869 % (Tablet) und 28.012 % (Mobil) Pixelabweichung. `/` liegt bei
5.560 % beziehungsweise 8.043 %. Die Navigation ist nicht mehr die Ursache.

## Beleg

- `.scratch/framer-live-2026-11-09/visual-navfix-2026-11-09/result.json`
- Screenshots `about/tablet/top*.png` und `about/mobil/top*.png`
- Desktop `/about`: 1.327 % erster Bildschirm, 1.389 % ganz.

Zum Vergleich vor dem Navigations-Fix: Tablet 24.322 %, Mobil 29.840 %.

## Nächster Schritt

- Screenshots seitenweise vergleichen und den Differenzbereich eingrenzen:
  Hero, Textlink, Farben, Schrift, fehlende Dekoration.
- DOM und berechnete Stile der sichtbaren Elemente vergleichen; Assets und
  Bildzuschnitt prüfen.
- Erst danach einen Fix bauen oder die Abweichung bewusst dokumentieren.

## Abnahme

- Ursache benannt und belegt; entweder Fix mit neuem visuellen Lauf oder
  dokumentierte, begründete Abweichung.

## Comments

- 09.11.2026: Befund nach dem Navigations-Fix. Der Kopfbereich ist behoben,
  die restliche Abweichung ist noch nicht zugeordnet.
