# Hero-Button fehlt auf Tablet und Mobil

Type: bug
Status: resolved 10.11.2026

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

## Ursache

Nicht die Klassenzuordnung der eingefügten Variante war falsch, sondern die
Paarung der Gerätewerte. `mergeStatesBySignature` ordnete die Knoten des
Desktop-Baums den Knoten des Tablet-/Telefon-Aufbaus über Tag, Basisklassen
und HTML-id zu. Framer-Komponenten teilen ihre Basisklassen und unterscheiden
sich nur in `framer-v-<hash>`. Dadurch trafen sich der gefüllte Hero-Button
und der Outline-Button „Careers" derselben Signatur. Der Hero-Button bekam
Transparenz, Inset-Rahmen und 6 px Innenabstand des Outline-Buttons; seine
dunkle Textfarbe blieb. Ergebnis: dunkler Text auf transparentem dunklem
Hero, der Button verschwand.

Der Reihenfolgetest zeigte die Verwechslung direkt: Im Tablet-Aufbau stehen
Hero-Button, Outline-Button und CTA-Button hintereinander, im Desktop-Baum
Navigation, Hero und CTA. Ohne die Variantenklasse im Schlüssel erhielt der
Hero die Werte des Outline-Buttons.

## Fix

- `packages/framer-import/src/import.ts`: Der Paarungsschlüssel in
  `mergeStatesBySignature` enthält jetzt zusätzlich die sortierten
  `variantClasses`.
- `packages/framer-import/test/device-variants.test.ts`: Regressionstest mit
  gleichen Basisklassen, unterschiedlichen Variantenklassen und abweichender
  Reihenfolge. Ohne den Fix rot (Hero erhält `transparent`).

## Abnahme

- Der Button ist auf allen drei Breiten sichtbar, sitzt unter dem Absatz und
  erscheint nicht doppelt.
- Der visuelle Lauf zeigt den Button; die restliche Abweichung ist benannt.

## Belege nach dem Fix

- Live-Import mit `structure`: `/` 816 Knoten, `/about` 506 Knoten, je 0
  Payloads, Ausgabe und Träger `structure`, Laufzeitprüfung widerlegt.
  `.scratch/framer-live-2026-11-09/structure-issue04-2026-11-10/result.json`
- Visueller Lauf bei 1440/768/390 px:
  `.scratch/framer-live-2026-11-09/visual-issue04-2026-11-10/result.json`
- `/about` erster Bildschirm: Desktop 0.415 %, Tablet 1.287 % (vorher
  13.057 %), Mobil 1.931 % (vorher 11.185 %). Ganzseite: 1.238 / 3.240 /
  5.323 %.
- `/` erster Bildschirm unverändert 0.251 / 5.560 / 8.043 %. Ganzseite
  0.899 / 6.577 / 7.175 %; die Höhe auf Tablet wächst von 11209 auf 11250 px
  gegen 11206 px der Quelle, weil der zuvor unsichtbare Button jetzt Fläche
  einnimmt.
- Screenshots: `about/tablet/build-top.png`, `about/mobil/build-top.png` und
  `start/tablet/build-top.png` zeigen je genau einen gefüllten Button.

## Grenzen

- Der visuelle Lauf misst nur Scrollposition 0, ohne Hover und Bewegung; die
  Vorbereitung lief in die 20-s-Grenze.
- Die Live-Quelle kann sich zwischen Läufen ändern.
- Kein neuer Volltest, kein PostgreSQL- und kein Paritätsnachweis.

## Comments

- 09.11.2026: Befund nach der allgemeinen Varianten-Ergänzung. Überschrift
  und Absatz sind sichtbar, der Button nicht.
- 10.11.2026: Ursache in der Zustandspaarung belegt und behoben. Der Button
  ist bei 768 und 390 px sichtbar; Desktop unverändert.
