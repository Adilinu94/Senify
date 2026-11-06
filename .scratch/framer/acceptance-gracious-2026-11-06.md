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

CMS: `Blogs` (`P1Eaf2Yss`), 6 Einträge. Die Sitemap listet alle sechs Beiträge als veröffentlichte Routen; der Mirror enthält nur drei davon. Die dynamische Vorlage `/blogs/:slug` wird über die sechs konkreten Routen materialisiert.

## Mirror und Vorbereitung

- FramerExport-Mirror: 51.592.027 Bytes, Startseite 704.835 Bytes, Contact 241.517 Bytes, Blogs 242.997 Bytes. Die Unterseiten liegen flach unter `subpages/` (`contact.html`, `blogs.html`, `blogs_<slug>.html`).
- `prepare framer` mit Unframer-Snapshot: 1 aufbereitete Seite, 24 heruntergeladene Assets, 43 Fonts, 0 fehlgeschlagene Assets. `ignoredFlattenedPages: true`; fehlende statische Seiten im Mirror-Inventar: `/blogs`, `/404`, `/contact`.
- Die flachen Unterseiten enthalten **kein SSR-Seitenmodell**: `contact.html` hat 0 `data-framer-name`-Knoten; die statische Aufnahme liefert 1 Knoten. Die Startseite hat 291 `data-framer-name`-Knoten und liefert 2166 Knoten.
- Der vorhandene Browser-Capture rendert `/contact` mit 334 Knoten, 6 Motion-Samples, 5 Findings, 0 Blockern. Deshalb wurde der Importpfad um `browser: true` / `--browser` erweitert.

## Importe in das isolierte Projekt

Alle sechs ursprünglich gespiegelten Routen wurden mit `mode: fidelity` in ein isoliertes Senify-Projekt geschrieben. Kein Asset-Download ist fehlgeschlagen.

| Route | Modus | Seite | Knoten | Zugeordnet | Score | Assets | Fonts | Findings |
|---|---|---|---|---:|---:|---:|---:|---:|
| `/` | Mirror, statisch | `6PpjmQLcP6PwS_` | 2166 | 714 | 59 | 24 | 43 | 15 |
| `/contact` | Browser | `hJVAF4w3qaSPUS` | 334 | 181 | 57 | 2 | 43 | 10 |
| `/blogs` | Browser | `vDLqTyTeSChvGQ` | 324 | 227 | 76 | 8 | 43 | 6 |
| `/blogs/a-checklist-for-shipping-a-branded-client-portal-in-a-week` | Browser | `BmAgOJHI4JC9sG` | 232 | 153 | 73 | 3 | 43 | 6 |
| `/blogs/custom-domains-done-right-ssl-dns-and-a-seamless-client-handoff` | Browser | `fv3p0A0itIDP01` | 208 | 154 | 78 | 3 | 43 | 6 |
| `/blogs/your-customers-should-never-meet-your-vendors` | Browser | `noYkmm5MRdUp2e` | 204 | 154 | 79 | 3 | 43 | 6 |

## Sitemap-Manifest und restliche Routen

Die Sitemap enthält 10 Routen; der Mirror nur 5 Unterseiten. Der neue Koordinator liest die Sitemap (`--source-url` oder `source` aus `export-report.json`), nimmt die Startseite aus dem Mirror und erfasst jede flache Unterseite im Browser. Der echte Manifestlauf ergibt:

| Route | Quelle | Im Mirror | Capture-Ergebnis |
|---|---|---|---|
| `/` | Mirror | ja | 2166 Knoten, geschrieben |
| `/blogs` | Browser | ja | 324 Knoten, geschrieben |
| `/contact` | Browser | ja | 334 Knoten, geschrieben |
| 3 gespiegelte Blog-Routen | Browser | ja | 232/208/204 Knoten, geschrieben |
| `/404` | Browser | nein | 186 Knoten, 0 Blocker, erfasst |
| `how-to-make-an-embedded-portal-feel-native-to-your-product` | Browser | nein | 208 Knoten, 0 Blocker, erfasst |
| `build-vs.-embed-the-real-cost-of-building-client-portals-in-house` | Browser | nein | 206 Knoten, 0 Blocker, erfasst |
| `what-white-label-really-means-for-saas-client-portals` | Browser | nein | 217 Knoten, 0 Blocker, erfasst |

Die vier nicht gespiegelten Routen sind damit per Manifest und Browser-Capture vollständig vorbereitet. Der vollständige Koordinator-Schreiblauf für sie konnte in dieser Umgebung nicht abgeschlossen werden: Der isolierte PostgreSQL-Cluster fällt nach Client-Backends mit `0xC0000142` und anschließendem Shared-Memory-Fehler 487 aus; der lokale Systemdienst auf Port 5432 verlangt andere Zugangsdaten als die lokale Konfiguration. Der Engine-Browser-Import ist über die sechs geschriebenen Seiten und die neuen Tests belegt; der Koordinator über sieben Unit-Tests.

## Belegte Fähigkeiten

- Unframer-Zugang, Projektzuordnung und Snapshot funktionieren gegen das echte Projekt.
- FramerExport-Mirror und Asset-/Font-Vorbereitung funktionieren; 0 fehlgeschlagene Downloads.
- Die Startseite lässt sich statisch analysieren und schreiben.
- Client-gerenderte Unterseiten lassen sich über den Browser-Modus analysieren und schreiben; der Browser-Capture sieht 334 statt 1 Knoten auf `/contact`.
- Sechs Routen erzeugen echte Senify-Seiten mit Asset-Übernahme; der CMS-Text der drei Blog-Routen ist enthalten.
- Das Sitemap-Manifest erkennt alle 10 veröffentlichten Routen und wählt Mirror beziehungsweise Browser automatisch; die drei fehlenden CMS-Routen und `/404` sind im Browser mit 0 Blockern erfasst.

## Benannte Lücken

1. Der Koordinator-Schreiblauf für `/404` und die drei nicht gespiegelten CMS-Routen ist durch den lokalen PostgreSQL-Ausfall blockiert (siehe oben), nicht durch den Code. Ein Lauf auf einer funktionsfähigen Datenbank bleibt offen.
2. `runtimeFreeVerified` bleibt `false`; ein runtimefreier Zielbetrieb ist mit diesem Lauf nicht bewiesen.
3. Die Startseite meldet 951 anfangs verborgene Elemente ohne Appear-Daten, mehrere generische SVG-Symbole, Lenis-Smooth-Scroll und nicht vollständig abgebildete Animationen.
4. `/contact` meldet 12 verborgene Elemente. Die 93 Pseudo-Zustandsregeln werden erkannt, aber **0** in `contextStyles` übernommen; die 45 Font-Subsets stehen **1** Theme-Font gegenüber (DSGVO-Umschreibung ist Roadmap-Scheibe S2.3b); vier Framer-Interaktionen sind nicht als Senify-Motion-Preset abbildbar. Das sind geplante Roadmap-Scheiben, keine stillen Fehler.
5. Ein vollständiger visueller und zeitlicher Vergleich Original gegen gebackene Senify-Ausgabe wurde in diesem Lauf nicht ausgeführt. Die Seiten sind geschrieben, aber Pixel-, Font-, Zustands- und Motion-Treue sind offen.
6. Das isolierte Projekt lief auf dem lokalen Testcluster; es sind keine Produktions- oder Nutzerdaten betroffen.

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
# Manifest: senify import framer-site <mirror> --site <id> --source-url $env:SITE_URL --write
```

Codeänderung dieser Abnahme: `RunImportInput.browser`, Browser-Zweig in `runImport`, `browser` im Engine-Importvertrag, `--browser` in der CLI, `packages/framer-import/src/route-manifest.ts` (Sitemap-Parser und Mirror/Browser-Auswahl), `--source-url` im Koordinator und im MCP-Tool sowie sieben neue Tests.
