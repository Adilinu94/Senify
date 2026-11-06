# Framer-Abnahme: Relay (`gracious-balance-599544.framer.app`)

Stand: 06.11.2026 · Status: **teilweise** · Quelle: veröffentlichte Framer-Site und Unframer-MCP-Zugang (Zugang nur über Umgebungsvariable, kein Secret in dieser Datei).

## Inventar

Unframer-Snapshot: 5 Seiten, 15 Komponenten, 1 CMS-Collection mit 6 Einträgen. Die veröffentlichte Site und das Unframer-Projekt wurden über die Produktions-Origin zugeordnet.

| Seite | Pfad | XML-Größe |
|---|---|---|
| `augiA20Il` | `/` | 100.782 |
| `czSVNrhfT` | `/blogs` | 4.662 |
| `Wpam3ccJC` | `/404` | 3.898 |
| `hDe0DQYhB` | `/blogs/:slug` | 3.788 |
| `IhzGOdswc` | `/contact` | 12.051 |

Komponenten: Primary/secondary button, Navabar Links, Navigation, Profile, Availability, Sphere Button, aesthetic accordian, Testimonials, Testimonial Texts, Arrow, blog card, Form submit button, Social button, custom cursor.

CMS: `Blogs` (`P1Eaf2Yss`), 6 Einträge. Veröffentlicht sind drei Blog-Routen; die dynamische Vorlage `/blogs/:slug` wird über diese drei Routen materialisiert.

## Mirror und Vorbereitung

- FramerExport-Mirror: 51.592.027 Bytes, Startseite 704.835 Bytes, Contact 241.517 Bytes, Blogs 242.997 Bytes. Die Unterseiten liegen flach unter `subpages/` (`contact.html`, `blogs.html`, `blogs_<slug>.html`).
- `prepare framer` mit Unframer-Snapshot: 1 aufbereitete Seite, 24 heruntergeladene Assets, 43 Fonts, 0 fehlgeschlagene Assets. `ignoredFlattenedPages: true`; fehlende statische Seiten im Mirror-Inventar: `/blogs`, `/404`, `/contact`.
- Die flachen Unterseiten enthalten **kein SSR-Seitenmodell**: `contact.html` hat 0 `data-framer-name`-Knoten; die statische Aufnahme liefert 1 Knoten. Die Startseite hat 291 `data-framer-name`-Knoten und liefert 2166 Knoten.
- Der vorhandene Browser-Capture rendert `/contact` mit 334 Knoten, 6 Motion-Samples, 5 Findings, 0 Blockern. Deshalb wurde der Importpfad um `browser: true` / `--browser` erweitert.

## Importe in das isolierte Projekt

Alle sechs veröffentlichten Routen wurden mit `mode: fidelity` in ein isoliertes Senify-Projekt geschrieben. Kein Asset-Download ist fehlgeschlagen.

| Route | Modus | Seite | Knoten | Zugeordnet | Score | Assets | Fonts | Findings |
|---|---|---|---:|---:|---:|---:|---:|---:|
| `/` | Mirror, statisch | `6PpjmQLcP6PwS_` | 2166 | 714 | 59 | 24 | 43 | 15 |
| `/contact` | Browser | `hJVAF4w3qaSPUS` | 334 | 181 | 57 | 2 | 43 | 10 |
| `/blogs` | Browser | `vDLqTyTeSChvGQ` | 324 | 227 | 76 | 8 | 43 | 6 |
| `/blogs/a-checklist-for-shipping-a-branded-client-portal-in-a-week` | Browser | `BmAgOJHI4JC9sG` | 232 | 153 | 73 | 3 | 43 | 6 |
| `/blogs/custom-domains-done-right-ssl-dns-and-a-seamless-client-handoff` | Browser | `fv3p0A0itIDP01` | 208 | 154 | 78 | 3 | 43 | 6 |
| `/blogs/your-customers-should-never-meet-your-vendors` | Browser | `noYkmm5MRdUp2e` | 204 | 154 | 79 | 3 | 43 | 6 |

## Belegte Fähigkeiten

- Unframer-Zugang, Projektzuordnung und Snapshot funktionieren gegen das echte Projekt.
- FramerExport-Mirror und Asset-/Font-Vorbereitung funktionieren; 0 fehlgeschlagene Downloads.
- Die Startseite lässt sich statisch analysieren und schreiben.
- Client-gerenderte Unterseiten lassen sich über den neuen Browser-Modus analysieren und schreiben; der Browser-Capture sieht 334 statt 1 Knoten auf `/contact`.
- Alle sechs veröffentlichten Routen erzeugen echte Senify-Seiten mit Asset-Übernahme; der CMS-Text der drei Blog-Routen ist enthalten.

## Benannte Lücken

1. Der Mehrseiten-Koordinator (`import framer-site`) ignoriert flache Framer-Unterseiten (`ignoredFlattenedPages: true`). Ein Routenmanifest aus Unframer-Seiten und Mirror-Dateien fehlt; die Einzelseiten-Route mit `--browser` funktioniert.
2. Die drei übrigen CMS-Einträge haben keine veröffentlichte Route im Mirror. Ob sie Entwürfe, unveröffentlichte Einträge oder andere Vorlagen sind, ist nicht belegt.
3. `/404` wird vom Importer bewusst nicht als normale Seite behandelt.
4. `runtimeFreeVerified` bleibt `false`; ein runtimefreier Zielbetrieb ist mit diesem Lauf nicht bewiesen.
5. Die Startseite meldet 951 anfangs verborgene Elemente ohne Appear-Daten, mehrere generische SVG-Symbole, Lenis-Smooth-Scroll und nicht vollständig abgebildete Animationen.
6. `/contact` meldet 12 verborgene Elemente, 93 Pseudo-Zustandsregeln, 45 Font-Subsets und vier nicht als Senify-Motion-Preset abbildbare Framer-Interaktionen.
7. Ein vollständiger visueller und zeitlicher Vergleich Original gegen gebackene Senify-Ausgabe wurde in diesem Lauf nicht ausgeführt. Die Seiten sind geschrieben, aber Pixel-, Font-, Zustands- und Motion-Treue sind offen.
8. Das isolierte Projekt lief auf dem lokalen Testcluster; es sind keine Produktions- oder Nutzerdaten betroffen.

## Reproduktion

```powershell
# Zugang nur als Umgebungsvariable, nie in Dateien:
$env:UNFRAMER_URL='https://mcp.unframer.co/mcp?id=…&secret=…'
$env:SITE_URL='https://gracious-balance-599544.framer.app/'
# Snapshot: packages/mcp/src/unframer.ts -> snapshotUnframer({ secretUrl, sourceUrl, outputDir })
# Mirror:  senify export framer $env:SITE_URL <mirror>
# Prepare: senify prepare framer <mirror> <prepared> --unframer-snapshot <snapshot.json>
# Import:  senify import framer <mirror> --site <id> --page-path / --write --mode fidelity
# Browser: senify import framer https://gracious-balance-599544.framer.app/contact --site <id> --page-path /contact --browser --write --mode fidelity
```

Codeänderung dieser Abnahme: `RunImportInput.browser`, Browser-Zweig in `runImport`, `browser` im Engine-Importvertrag, `--browser` in der CLI sowie ein Browser-Regressionstest und ein Vertragsnegativtest.
