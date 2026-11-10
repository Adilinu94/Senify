# Hero-Button fehlt auf Tablet und Mobil

Type: bug
Status: ready-for-agent

## Problem

Der Struktur-Build zeigt auf Tablet und Mobil unter dem Hero-Absatz keinen
„Get started"-Button. Die Quelle zeigt dort einen schwarzen Button. Auf
Desktop ist der Build nah an der Quelle.

## Beleg

- `.scratch/framer-live-2026-11-09/visual-herofix3-2026-11-09/result.json`
- Screenshots `about/tablet/build-top.png` und `original-top.png`,
  `about/mobil/*.png`
- Erster Bildschirm `/about`: Desktop 0.364 %, Tablet 13.057 %, Mobil 11.185 %
- Im HTML steht der Link bei Vorkommen 2:
  `<a href="/price" class="w-link framer-979bdd-95 ...">Get started</a>`
- Für `framer-979bdd-95` gibt es keine Regel in den Build-CSS-Dateien; der
  Link trägt auch keinen Inline-Stil. Er ist im DOM, aber ohne Fläche.

## Ursache (Hypothese)

Die allgemeine Varianten-Ergänzung klont die Tablet-/Telefon-Hero-Gruppe aus
dem SSR-Aufbau. Deren Quellklassen werden beim Klonen nicht zu Knotenstilen
aufgelöst, sodass der Button ohne Layout/Padding bleibt. Die Desktop-Fassung
kommt aus dem Browser-Capture und trägt die aufgelösten Werte.

## Nächster Schritt

- Die Klassenzuordnung für eingefügte Gerätevarianten prüfen; die
  Quellklassen des Buttons müssen als Knotenstil ankommen.
- Minimal-Fixture mit Hero-Button in Desktop-, Tablet- und Telefonfassung.
- Live-Lauf `/about` bei 1440, 768 und 390 px.

## Abnahme

- Der Button ist auf allen drei Breiten sichtbar, sitzt unter dem Absatz und
  erscheint nicht doppelt.
- Der visuelle Lauf zeigt den Button; die restliche Abweichung ist benannt.

## Comments

- 09.11.2026: Befund nach der allgemeinen Varianten-Ergänzung. Überschrift
  und Absatz sind jetzt sichtbar, der Button nicht.
