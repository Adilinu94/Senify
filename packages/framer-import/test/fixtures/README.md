# Framer-Import Fixtures

Drei getrimmte Framer-Exporte als Golden-Grundlage für die Import-Tests (S1).
Quelle: `C:\Users\adini\FramerExport\framer-*` (eigene Framer-Projekte des
Betreibers, 23.09.2026 exportiert).

## Was enthalten ist

Pro Export genau zwei Dateien:

- `index.html` — die SSR-geservte Seite mit den drei Import-Datenkanälen:
  `<script type="framer/appear" id="__framer__appearAnimationsContent">`
  (Appear-Animationen), `id="__framer__breakpoints"` (Breakpoint-Hashes) und
  `data-framer-hydrate-v2` (Hydration-Handover).
- `styles/canvas-sandbox-on-page.<hash>.css` — die Seiten-CSS (alle
  Breakpoint-Varianten und Font-Faces inline).

## Was absichtlich weggelassen ist

- `scripts/` (Framer-Runtime, React, three.js, framer-motion — die
  Original-Runtime wird nicht mitgetestet, nur die Datenkanäle)
- `assets/fonts`, `assets/images`, `assets/videos` (Binär-Ballast, Lizenzen)
- `editorbar.*.css` (Framer-Editor-UI, nicht Teil der Seite)
- `serve.cjs`, `three.min.js`, `apply-content.cjs`, `content.json`
- `subpages/`, `data/`, `tokens/` (leer bzw. projektspezifisch)

Die drei Exporte decken die Profil-Bandbreite ab: `stupendous-football`
(klein, 300 KB HTML), `fluffy-rectangle` (3D-Island mit WaveBackground,
611 KB HTML), `easier-train` (groß, 945 KB HTML).

## Lizenz

Eigene Projekte, keine Dritt-Lizenzen berührt. Die Font-Faces in den CSS
verweisen auf Framer-CDN-URLs; die Fixtures laden keine Fonts nach — die
Golden-Tests vergleichen Markup/CSS-Struktur, kein Font-Rendering.
