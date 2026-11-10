# Erster Bildschirm von /about weicht stark ab

Type: bug
Status: resolved

## Problem

Nach dem Navigations-Fix bleibt der erste Bildschirm von `/about` bei
23.869 % (Tablet) und 28.012 % (Mobil) Pixelabweichung. `/` liegt bei
5.560 % beziehungsweise 8.043 %. Die Navigation ist nicht mehr die Ursache.

## Beleg

- `.scratch/framer-live-2026-11-09/visual-navfix-2026-11-09/result.json`
- Screenshots `about/tablet/top*.png` und `about/mobil/top*.png`
- Desktop `/about`: 1.327 % erster Bildschirm, 1.389 % ganz.

Zum Vergleich vor dem Navigations-Fix: Tablet 24.322 %, Mobil 29.840 %.

## Ursache (untersucht)

Der Build zeigt auf Tablet und Mobil nur das Eyebrow-Label und das Bild.
Die Überschrift, der Absatz und der Button fehlen im HTML. Die Quelle
rendert den Hero-Text in id-losen `ssr-variant`-Gruppen, zum Beispiel die
Überschrift in `<div class="ssr-variant hidden-1tpocsl hidden-18bxkjb">`
mit den Wörtern als einzelne `span`-Elemente. Die Desktop-Fassung ist im
Build vorhanden, die Tablet-/Telefon-Fassungen werden nicht ergänzt. Die
Navigations-Reparatur greift nur für `<nav>`-Gruppen; hier braucht es
dieselbe Ergänzung für Überschriften- und Rich-Text-Gruppen, rekursiv
unterhalb des Seitenkopfs.

Die Live-Quelle wechselt den Hero-Text (Astra-A/B). Der eingefügte
Quelltext zeigt aktuell „Few ...", der Screenshot „Hire managers and do
work". Die Zuordnung muss sich auf die Struktur, nicht auf den Text
stützen.

## Nächster Schritt

- `restoreTopLevelNavVariants` zu einer rekursiven Ergänzung id-loser
  Gerätevarianten erweitern, zunächst für Gruppen mit `<nav>`, `<h1>` bis
  `<h3>` und Rich-Text-Containern.
- Weitere Fälle nur über Basisklasse, `hiddenAt` und disjunkte Sichtbarkeit
  zuordnen; Kollisions- und Doppelungsprüfung wie beim Navigations-Fix.
- Minimal-Fixture mit Hero-Überschrift, Absatz und Button; Live-Lauf
  `/about` bei 768 und 390 px.
- Erst danach einen Fix bauen oder die Abweichung bewusst dokumentieren.

## Abnahme

- Ursache benannt und belegt; der Hero-Text erscheint bei 768 und 390 px
  wieder, ohne doppelte Inhalte.
- Fix mit neuem visuellen Lauf oder dokumentierte, begründete Abweichung.

## Answer

Behoben in `restoreIdLessDeviceVariants` (`packages/framer-import/src/import.ts`):
Der Pass läuft SSR- und Desktop-Baum parallel ab, ordnet id-lose
Geschwistergruppen über Basisklasse und disjunkte Sichtbarkeit zu, setzt
die Desktop-Kopie auf `visibleOn: ["desktop"]` und ergänzt Tablet- und
Telefon-Kopien. Live: `/about` 506 statt 297 Knoten, drei `<nav>`,
Hero-`<h1>`, Absatz und „Get started" im HTML. 559 Framer-Import-Tests
grün (2 übersprungen), Visual-Gate-Fixtures innerhalb der Ratchet.

Der visuelle Lauf `visual-herofix3` zeigt Überschrift und Absatz auf
Tablet und Mobil. Die Quelle hat je Breakpoint eigene Hero-Texte (Desktop
„Fewer tools.", Tablet „Hire managers"), keine A/B-Fassung; der Build
trägt beide. Der Hero-Button „Get started" bleibt auf Tablet und Mobil
unsichtbar und ist als Issue 04 offen.

## Comments

- 09.11.2026: Befund nach dem Navigations-Fix. Der Kopfbereich ist behoben,
  die restliche Abweichung ist noch nicht zugeordnet.
- 09.11.2026: Ursache eingegrenzt. Die Hero-Überschrift steckt in einer
  id-losen `ssr-variant`-Gruppe; der Build hat nur die Desktop-Fassung.
  Nächster Schritt ist die rekursive Ergänzung für Überschriften- und
  Rich-Text-Gruppen.
