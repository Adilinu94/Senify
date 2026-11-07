# Framer-Echtabnahme: Chocolate (`chocolate-attributes-385353.framer.app`)

Stand: 07.11.2026 · Status: **teilweise, mit behobenem Layoutblocker, SVG-Icons, eigener 404-Seite und erhaltener Body-/Farbschema-Palette** · Quelle: veröffentlichte Framer-Site und Unframer-MCP-Zugang (Zugang nur über Umgebungsvariablen, keine Secrets in dieser Datei).

## Inventar

- Unframer-Snapshot: 9 Seiten, 13 Komponenten, 1 CMS-Collection (`Blog Posts`) mit 3 Einträgen.
- FramerExport-Mirror: Startseite plus 6 flache Unterseiten (`/about`, `/blog`, `/contact`, `/price`, `/privacy-policy`, `/terms-and-condition`), 69 Bilder, 316 Fonts im Export.
- Vorbereitung: 19 Assets, 54 Fonts, 0 fehlgeschlagene Downloads.
- Sitemap: 10 Routen, inklusive drei materialisierter `/blog/:slug`-Routen. `/404` steht nicht in der Sitemap und wurde separat per Browser-Import ergänzt.

## Import

Elf Seiten wurden in ein isoliertes Senify-Projekt geschrieben (`Framer Chocolate SVG`, Site-ID `sRo15qZiA9LsTD`). Kein Schreibvorgang ist fehlgeschlagen; alle Seiten haben Status `imported`. Für die SVG-/404-Gegenprobe wurde zusätzlich die `/about`-Seite in ein separates Projekt importiert (`0jdMo3iJDP41Ot`).

## Behobener Blocker: seitenweite Knoten-ID-Kollision

Framer vergibt auf jeder Seite dieselben Knoten-IDs (`fi27` usw.). Der site-weite CSS-Bake deduplizierte bisher nur nach `id`; dadurch überschrieb die Startseite das Layout von `/about` (und weiteren Unterseiten). Die importierten Knoten-IDs werden jetzt mit demselben Seiten-Hash wie die Framer-Klassenregeln gescoped (`fi-<scope>-N`).

## Behobene Lücken: SVG-Icons und `/404` (07.11.2026)

- Unbekannte Framer-SVGs werden nicht mehr als generische Platte gemappt. Der Mapper übernimmt die Geometrie als inertes `data:image/svg+xml`-Bild, ergänzt `xmlns`, übernimmt die berechnete Farbe für `currentColor` und lehnt Skripte, `foreignObject`, Event-Handler sowie externe URLs ab. Die `/about`-Seite zeigt dadurch die Security-Icons, das Plus-Symbol und die Zitatmarke statt leerer Kreise oder kaputter Bildsymbole.
- Eine veröffentlichte Seite unter `/404` ersetzt jetzt den statischen Astro-Fallback. Die Preview liefert die importierte 404-Seite mit 1448 px (Original 1418 px) und 0,800 Textüberlappung. Der Framer-Originallauf meldet auf `/404` selbst einen Konsolenfehler; die Senify-Preview bleibt fehlerfrei.
- Grenze: Die SVGs sind statische Bilder, keine einzeln editierbaren Pfade. `data:`-Bilder mit CSS-Variablen in Füllungen können auf ihren Fallback zurückfallen.

## Farbtoken, Theme-Patch und Farbschema (07.11.2026)

- `--apply-theme` ist im Seitenkoordinator und im CLI verfügbar; der Font-Patch wird nur mit der ersten geschriebenen Seite angewendet, damit ein Mehrseitenimport nicht pro Seite eine neue Theme-Version erzeugt.
- Framer-Rohvariablen (`--token-<uuid>`) werden in Regeln und Knoten-Props zu konkreten Farbwerten aufgelöst. Unbekannte Variablen behalten ihren CSS-Fallback. Tests: `import-fidelity.test.ts`.
- Der Browser-Capture pinnt jetzt das helle Farbschema (`colorScheme: "light"`), damit ein geerbtes OS-Dunkelschema nicht die andere Palette ins IR schreibt. Test: `capture-browser.test.ts`.
- **Behoben (07.11.2026):** Der statische Parser hat keine Media-Auswertung. `prefers-color-scheme`-Blöcke werden jetzt für das gepinnte helle Schema aufgelöst: Der helle Block wird entpackt, der dunkle verworfen. Framer-Rohfarben (`--token-*`) werden in Regeln, Knoten-Props und inerten SVG-Daten-URIs konkretisiert. Die berechnete Body-Palette wird vom `body`-Regelsatz auf den Root-Knoten übernommen und im Page-Layout auf `<body>` gesetzt.
- **Nachmessung `/about` (1440 px):** Body `rgb(15, 14, 13)`, Überschrift `rgb(250, 250, 249)`, Höhe 5557 px (Original 5537 px), Pixel-Diff 8,3 % (vorher 89,6 %). Die übrigen Routen wurden in diesem Lauf nicht neu gemessen; die Tabellenwerte unten sind der Stand vor dem Farbmodus-Fix.
- **Grenze:** Der Import bildet das aktive helle Farbschema ab. Ein echter Dual-Modus mit separaten Light-/Dark-Varianten wird nicht als zwei Zustände gespeichert.

Messung vor dem Farbmodus-Fix, Original gegen Senify-Preview, 1440 px, vollflächig (Wortmengen-Überlappung; die früheren 1,000-Werte stammten aus einer anderen Textzählung):

| Route | Textüberlappung vorher | Textüberlappung nachher | Höhe Original | Höhe vorher | Höhe nachher |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 0,913 | 0,969 | 8966 | 9030 | 9030 |
| `/about` | 0,448 | **0,963** | 5537 | 3876 | 5557 |
| `/blog` | 0,725 | **0,889** | 1972 | 1859 | 2002 |
| `/contact` | 0,920 | 0,920 | 3585 | 2577 | 3619 |
| `/price` | 0,994 | 0,942 | 4309 | 937 | 4343 |
| `/privacy-policy` | 0,828 | **0,917** | 2051 | 900 | 2081 |
| `/terms-and-condition` | 0,887 | **0,917** | 2189 | 900 | 2219 |
| drei Blog-Routen | 0,958/0,963/0,958 | 0,958/0,963/0,958 | 3255/3213/3053 | 900 | 3445/3475/2515 |
| `/404` | 0,000 | **0,800** | 1418 | 900 | 1448 |

Der Pixelvergleich bleibt bei 81–97 % Abweichung (`/about` 0,896). Die Text- und Höhenwerte belegen die korrigierte Struktur; sie belegen **keine** Pixel-, Font- oder Motion-Parität. Kleine Höhendifferenzen (20–30 px) entstehen durch die fehlenden Pseudo-Elemente und abweichende Schriftmetriken.

## Runtime und Ausgabe

- Der gebackene Build enthält keine Framer-Runtime, keine `framerusercontent`-/Framer-CDN-URLs und keine Framer-Skripte.
- Die Startseite enthält lokale Motion-Skripte (GSAP/Motion-Daten); die Unterseiten sind statisch.
- Schriften und Bilder liegen lokal im Build.
- `runtimeFreeVerified` bleibt dennoch `false`: Der Nachweis ist ein statischer Scan plus Browserlauf, kein vollständiger Netzwerk- und Zeitverhaltensnachweis.

## Benannte Lücken

1. **Dekorative Pseudo-Elemente und Hintergrundtexturen:** 31–39 Struktur-/Pseudo-Regeln werden nicht übernommen; dadurch fehlen Flächen, Muster und einzelne Rahmen.
2. **SVG-Bearbeitbarkeit:** Icons liegen als statische, inerte Bilder vor. Einzelne Pfade, Farbvarianten und Symbolbibliotheken sind nicht editierbar.
3. **Pixel-/Font-/Motion-Parität und Sicherheits-Hintergrundbilder:** `/about` liegt nach dem Farbmodus-Fix bei 8,3 % Pixel-Diff; die übrigen Routen wurden nicht neu gemessen. Die Security-Zeile zeigt noch gebrochene Hintergrundbilder; Schriftglättung, Gewichte, Abstände und Bilder unterscheiden sich. Eine zeitliche Motion-Gegenprobe fehlt. Ein echter Dual-Modus mit separaten Light-/Dark-Varianten bleibt offen.
4. **`/blog/pto…`:** Höhe 2515 statt 3053; Text ist vollständig, aber mindestens ein dekorativer/visueller Abschnitt fehlt.
5. **Framer-Interaktionen:** Nicht alle Hover-/Scroll-/In-View-Interaktionen sind als Senify-Motion abgebildet; die bekannten Grenzen aus der vorherigen Relay-Abnahme gelten weiter.
6. **RuntimeFreeVerified:** Der statische Scan und der fehlerfreie Browserlauf belegen keine vollständige Netzwerk- und Zeitverhaltensfreiheit.

## Reproduktion (ohne Zugangsdaten)

```powershell
# Zugang nur über Umgebungsvariablen:
$env:UNFRAMER_URL='https://mcp.unframer.co/mcp?...'
$env:SITE_URL='https://chocolate-attributes-385353.framer.app/'
# Snapshot, Mirror, Prepare, Start, Import, Preview und Vergleich wie in
# docs/framer-roadmap.md und docs/current/stand.md beschrieben.
```

Die lokale PostgreSQL-Testinstanz lief isoliert auf Port 39401; die Engine auf 4321/4322. Beide wurden nach der Abnahme gestoppt.
