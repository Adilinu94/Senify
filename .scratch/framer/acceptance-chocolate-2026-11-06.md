# Framer-Echtabnahme: Chocolate (`chocolate-attributes-385353.framer.app`)

Stand: 06.11.2026 · Status: **teilweise, mit behobenem Layoutblocker** · Quelle: veröffentlichte Framer-Site und Unframer-MCP-Zugang (Zugang nur über Umgebungsvariablen, keine Secrets in dieser Datei).

## Inventar

- Unframer-Snapshot: 9 Seiten, 13 Komponenten, 1 CMS-Collection (`Blog Posts`) mit 3 Einträgen.
- FramerExport-Mirror: Startseite plus 6 flache Unterseiten (`/about`, `/blog`, `/contact`, `/price`, `/privacy-policy`, `/terms-and-condition`), 69 Bilder, 316 Fonts im Export.
- Vorbereitung: 19 Assets, 54 Fonts, 0 fehlgeschlagene Downloads.
- Sitemap: 10 Routen, inklusive drei materialisierter `/blog/:slug`-Routen. `/404` steht nicht in der Sitemap und wurde separat per Browser-Import ergänzt.

## Import

Elf Seiten wurden in ein isoliertes Senify-Projekt geschrieben (`Framer Chocolate Acceptance 4`, Site-ID `M-Ny0py7u2CvLs`). Kein Schreibvorgang ist fehlgeschlagen; alle Seiten haben Status `imported`.

## Behobener Blocker: seitenweite Knoten-ID-Kollision

Framer vergibt auf jeder Seite dieselben Knoten-IDs (`fi27` usw.). Der site-weite CSS-Bake deduplizierte bisher nur nach `id`; dadurch überschrieb die Startseite das Layout von `/about` (und weiteren Unterseiten). Die importierten Knoten-IDs werden jetzt mit demselben Seiten-Hash wie die Framer-Klassenregeln gescoped (`fi-<scope>-N`).

Messung Original gegen Senify-Preview, 1440 px, vollflächig:

| Route | Textüberlappung vorher | Textüberlappung nachher | Höhe Original | Höhe vorher | Höhe nachher |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 0,913 | 0,913 | 8966 | 9030 | 9030 |
| `/about` | 0,448 | **1,000** | 5537 | 3876 | 5557 |
| `/blog` | 0,725 | **0,889** | 1972 | 1859 | 2002 |
| `/contact` | 0,920 | 0,920 | 3585 | 2577 | 3619 |
| `/price` | 0,994 | 0,994 | 4309 | 937 | 4343 |
| `/privacy-policy` | 0,828 | **0,917** | 2051 | 900 | 2081 |
| `/terms-and-condition` | 0,887 | **0,917** | 2189 | 900 | 2219 |
| drei Blog-Routen | 1,000 | 1,000 | 3053/3213/3255 | 900 | 2515/3475/3445 |

Der Pixelvergleich bleibt bei 80–97 % Abweichung. Die Text- und Höhenwerte belegen die korrigierte Struktur; sie belegen **keine** Pixel-, Font-, Icon- oder Motion-Parität.

## Runtime und Ausgabe

- Der gebackene Build enthält keine Framer-Runtime, keine `framerusercontent`-/Framer-CDN-URLs und keine Framer-Skripte.
- Die Startseite enthält lokale Motion-Skripte (GSAP/Motion-Daten); die Unterseiten sind statisch.
- Schriften und Bilder liegen lokal im Build.
- `runtimeFreeVerified` bleibt dennoch `false`: Der Nachweis ist ein statischer Scan plus Browserlauf, kein vollständiger Netzwerk- und Zeitverhaltensnachweis.

## Benannte Lücken

1. **SVG-Icons:** 12–13 SVG-Knoten pro Unterseite werden als generische Platten übernommen; die Original-Icons fehlen.
2. **Dekorative Pseudo-Elemente und Hintergrundtexturen:** 31–39 Struktur-/Pseudo-Regeln werden nicht übernommen; dadurch fehlen Flächen, Muster und einzelne Rahmen.
3. **`/404`:** Der Browser-Import schreibt die Seite, aber der Astro-404-Fallback überschreibt `404.html`; die Preview ist leer. Eine eigene 404-Template-Zuordnung fehlt.
4. **Pixel-/Font-/Motion-Parität:** Der visuelle Diff bleibt hoch; Schriftglättung, Gewichte, Abstände und Bilder unterscheiden sich. Eine zeitliche Motion-Gegenprobe wurde nicht ausgeführt.
5. **`/blog/pto…`:** Höhe 2515 statt 3053; Text ist vollständig, aber mindestens ein dekorativer/visueller Abschnitt fehlt.
6. **Framer-Interaktionen:** Nicht alle Hover-/Scroll-/In-View-Interaktionen sind als Senify-Motion abgebildet; die bekannten Grenzen aus der vorherigen Relay-Abnahme gelten weiter.

## Reproduktion (ohne Zugangsdaten)

```powershell
# Zugang nur über Umgebungsvariablen:
$env:UNFRAMER_URL='https://mcp.unframer.co/mcp?...'
$env:SITE_URL='https://chocolate-attributes-385353.framer.app/'
# Snapshot, Mirror, Prepare, Start, Import, Preview und Vergleich wie in
# docs/framer-roadmap.md und docs/current/stand.md beschrieben.
```

Die lokale PostgreSQL-Testinstanz lief isoliert auf Port 39401; die Engine auf 4321/4322. Beide wurden nach der Abnahme gestoppt.
