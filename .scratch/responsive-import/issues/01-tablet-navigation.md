# Tablet- und Mobilnavigation zeigt Desktop-Variante

Type: task
Status: ready-for-human

## Problem

Der Struktur-Build zeigt bei 768 px und 390 px die Desktop-Navigation
(Home, Pricing, About, Blog, Contact, Book a demo). Die Quelle zeigt dort
den Hamburger und die schmale Navigation. Auf 1440 px stimmt die Navigation.

## Beleg

- `.scratch/framer-live-2026-11-09/visual-before-2026-11-09/result.json`
- Screenshots `start/tablet/*.png` und `start/mobil/*.png`
- Messung für `/`: Tablet 6.520 % ganz und 6.245 % erster Bildschirm,
  Mobil 7.304 % und 9.765 %, Desktop 0.899 % und 0.251 %.
- Messung für `/about`: Desktop 1.261 % und 0.557 %, Tablet 7.224 % und
  24.322 %, Mobil 10.746 % und 29.840 %.
- Der erste Lauf lieferte für `/about` einen 404, weil der statische Server
  `/about` nicht auf `about/index.html` abbildete. Der korrigierte Lauf
  ersetzt diese Zahlen; er steht in derselben `result.json`.

## Ursache (untersucht)

Die Quelle rendert mehrere Navigationsvarianten. Die Desktop-Navigation
steht in der Basis. Eine schmale Variante steht in
`<div class="ssr-variant hidden-10cxdd5 hidden-72rtr7">`, also tablet- und
desktop-hidden. Weitere Varianten für Tablet sind zu prüfen.

Die Browser-Aufnahme bei 1440 px sieht nur die Desktop-Variante.
`mergeDeviceVariants` in `packages/framer-import/src/import.ts` gleicht
statischen und Browser-Baum nur über die HTML-ID ab und fügt nur
telefon-exklusive **Sections** ein. Die Navigationsvarianten haben keine
HTML-ID. Deshalb wird die schmale Navigation nicht eingefügt und die
Desktop-Navigation behält keine `visibleOn`-Einschränkung.

## Nächster Schritt

Eine sichere Zuordnung für id-lose Kind-Teilbäume entwerfen. Die IR-Keys
sind laut Kommentar über Breiten hinweg nicht stabil. Kandidaten sind
`data-framer-name` plus Komponentenklasse oder die Position unter demselben
Elternknoten, jeweils mit Kollisionsprüfung und einem Minimal-Fixture als
Regression. Keine Zuordnung nur über die Position ohne Prüfung.

## Abnahme

- Minimal-Fixture mit Desktop- und schmaler Navigation: Desktop-Variante
  `visibleOn: ["desktop"]`, schmale Variante `visibleOn: ["tablet", "mobile"]`.
- Live-Lauf `/` und `/about`: 768 px und 390 px zeigen den Hamburger und
  nicht die Desktop-Links; 1440 px bleibt unverändert.
- Der visuelle Vergleich dokumentiert die neuen Zahlen.

## Comments

- 09.11.2026: Befund aus dem visuellen Vergleich. Desktop ist nah (0.873 %),
  Tablet und Mobil brechen an der Navigation.
