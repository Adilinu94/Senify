# Tablet- und Mobilnavigation zeigt Desktop-Variante

Type: task
Status: resolved

## Problem

Der Struktur-Build zeigte bei 768 px und 390 px die Desktop-Navigation
(Home, Pricing, About, Blog, Contact, Book a demo). Die Quelle zeigte dort
den Hamburger und die schmale Navigation. Auf 1440 px stimmte die Navigation.

## Beleg

Vor dem Fix:

- `.scratch/framer-live-2026-11-09/visual-before-2026-11-09/result.json`
- Screenshots `start/tablet/*.png` und `start/mobil/*.png`
- Messung für `/`: Tablet 6.520 % ganz und 6.245 % erster Bildschirm,
  Mobil 7.304 % und 9.765 %, Desktop 0.899 % und 0.251 %.
- Messung für `/about`: Desktop 1.261 % und 0.557 %, Tablet 7.224 % und
  24.322 %, Mobil 10.746 % und 29.840 %.

Nach dem Fix:

- `.scratch/framer-live-2026-11-09/structure-navfix5-2026-11-09/result.json`
- `.scratch/framer-live-2026-11-09/visual-navfix-2026-11-09/result.json`
- Drei `<nav>` im Build, Knoten 744/297.
- Erster Bildschirm: `/` Tablet 5.560 %, Mobil 8.043 %; `/about` Tablet
  23.869 %, Mobil 28.012 %. Die Navigation ist nicht mehr die Ursache der
  verbleibenden Abweichung.

## Ursache (untersucht)

Die Quelle rendert drei Navigationsvarianten: Desktop, Tablet und Telefon.
Jede Variante ist ein eigener id-loser Container mit eigener `hiddenAt`-
Menge. Die Browser-Aufnahme bei 1440 px sieht nur die Desktop-Variante.
`mergeDeviceVariants` in `packages/framer-import/src/import.ts` glich
statischen und Browser-Baum nur über die HTML-ID ab und fügte nur
telefon-exklusive **Sections** ein. Die Navigationscontainer haben keine
HTML-ID. Deshalb fehlten die schmalen Varianten, und die Desktop-Variante
behielt keine `visibleOn`-Einschränkung.

## Umgesetzt

`restoreTopLevelNavVariants` in `packages/framer-import/src/import.ts`
sucht im SSR-Aufbau die Gruppe der id-losen Navigationsvarianten, setzt die
Desktop-Kopie auf `visibleOn: ["desktop"]` und ergänzt die Tablet- und
Telefon-Kopien aus dem jeweiligen SSR-Aufbau. Die Zuordnung erfolgt über
die Basisklasse, nicht über die Form, weil die hydratisierte Desktop-
Navigation ein anderes SVG trägt. Der Lauf ist auf Navigationsgruppen am
Seitenkopf begrenzt; allgemeine id-lose Kind-Varianten bleiben offen.

## Abnahme

- Minimal-Test in `packages/framer-import/test/device-variants.test.ts`:
  Desktop-Kopie `visibleOn: ["desktop"]`, Tablet `["tablet"]`, Telefon
  `["mobile"]`; idempotent und ohne Nicht-Navigationsgruppen.
- Live-Lauf `/` und `/about`: 768 px und 390 px zeigen den Hamburger, die
  Desktop-Links sind nicht sichtbar; 1440 px bleibt unverändert.
- Visueller Vergleich mit neuen Zahlen dokumentiert.

## Answer

Behoben in `restoreTopLevelNavVariants` (Import-Merge) mit
`device-variants.test.ts` und dem Live-Lauf `structure-navfix5`. Die
verbleibenden Bildabweichungen auf `/about` sind nicht mehr der Navigation
zuzuordnen und bleiben als eigener visueller Fall offen.

## Comments

- 09.11.2026: Befund aus dem visuellen Vergleich. Desktop ist nah, Tablet
  und Mobil brachen an der Navigation.
- 09.11.2026: Fix umgesetzt; drei `<nav>` im Build, Hamburger erscheint auf
  Tablet und Mobil. 558 Framer-Import-Tests grün.
