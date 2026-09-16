# Handoff: Senify v1 (Stand 16.09.2026)

Diese Datei beschreibt, was gebaut wurde, wie man es startet und prüft, was offen ist und welche Fallstricke unterwegs aufgetreten sind. Sie ist für die nächste Person oder Session gedacht, die hier weiterarbeitet.

## 1. Was das Produkt ist

Senify baut Websites aus einem Brief. Der Agent (Claude Code, Cursor, opencode) spricht über MCP mit der lokalen Engine: Seiten anlegen, Sektionen einfügen, Inhalte füllen, prüfen, zur Freigabe geben. Daneben gibt es ein Programm im Browser mit Projekten, Arbeitsbereich, visuellem Editor, Referenz-Bibliothek, Einsendungen und Einstellungen. Veröffentlichung läuft über einen Bake (statische Seiten), Freigabe und Rollback inklusive.

Details zum Fachmodell stehen in `CONTEXT.md` und in den Entscheidungen unter `docs/adr/`:

- `docs/adr/0001-json-first-bau-modell.md`
- `docs/adr/0002-astro-als-site-renderer.md`
- `docs/adr/0003-gsap-als-choreografie-kern.md`

## 2. Pakete

| Paket | Aufgabe |
| --- | --- |
| `@senify/core` | Fehlertyp `SenifyError`, gemeinsame Grundlagen |
| `@senify/section-sdk` | Schema und Typen für Sektionen (TypeBox als Single Source) |
| `@senify/registry` | Sektionskatalog mit Definitionen, Varianten, Golden-Beispielen und React-Komponenten |
| `@senify/renderer` | Bake der statischen Seiten, Bindings, Loops, Formular-Token |
| `@senify/tokens` | Theme und Tokens (Farben, Typo, Abstände, Radius) |
| `@senify/engine` | Backend: Store, HTTP-Routen, Mutations, Checks, Lifecycle, Formulare, Referenzen, Einstellungen, Mail, Backup |
| `@senify/editor` | Visueller Editor (Puck-kompatibler Adapter, Panels, Frames, Inline-Text, Undo/Redo, Explorer, Deep-Links) |
| `@senify/app` | Programm-Shell: Dashboard-Server mit Proxy, SPA, Editor-Bundle on demand, `senify start` |
| `@senify/mcp` | CLI (`senify`), MCP-Server, Tokens, Skill-Auslieferung |
| `@senify/docs-portal` | Dokumentationsportal (statisch, Pagefind, Agenten-Exporte) |
| `@senify/skills` | Skillpaket für Agenten-Clients |
| `@senify/analysis-worker` | Worker für die Referenz-Analyse |

## 3. Starten und testen

### Voraussetzungen

- Node.js 24 oder neuer, pnpm 10
- Postgres. Docker ist auf dem aktuellen Rechner **nicht** installiert, dort läuft stattdessen eine eigene Instanz (siehe unten).

### Auf diesem Rechner ist bereits eingerichtet

- Eigene Postgres-Instanz (Postgres 18) unter `C:\Users\adini\.senify\pg`, Port **5433**, Benutzer `senify`, ohne Passwort, Datenbank `senify`.
- Die Verbindungs-URL steht in `C:\Users\adini\.senify\config.json` als `databaseUrl` (`postgres://senify@127.0.0.1:5433/senify`). Damit genügt `pnpm start`, es braucht keine Umgebungsvariable.
- Postgres-Binaries liegen unter `C:\Program Files\PostgreSQL\18\bin` (`pg_ctl.exe`, `psql.exe`, `createdb.exe`).
- Chromium für Playwright liegt unter `%LOCALAPPDATA%\ms-playwright` (für Aufnahmen und Browser-Tests).

### Befehle

```powershell
pnpm install                     # Abhängigkeiten
pnpm start                       # Engine + Dashboard, Ausgabe nennt die URL
pnpm start -- --no-open          # ohne Browser zu öffnen
pnpm senify tokens list          # CLI direkt (beliebige Unterbefehle)
pnpm verify                      # Build + Lint + alle Tests
```

Dashboard standardmäßig `http://localhost:4322`, Engine `http://localhost:4321`. Beenden mit `Strg+C`.

Die Postgres-Instanz startet und stoppt man so:

```powershell
$pg = "C:\Program Files\PostgreSQL\18\bin"
& "$pg\pg_ctl.exe" -D "$env:USERPROFILE\.senify\pg" -o "-p 5433" -l "$env:USERPROFILE\.senify\pg.log" start
& "$pg\pg_ctl.exe" -D "$env:USERPROFILE\.senify\pg" stop -m fast
```

### Testlage

- Zuletzt vollständig gemessen: **67 Testdateien, 471 Tests grün, 2 übersprungen** (`pnpm test`).
- Der Gate-Befehl `pnpm verify` (Build, Lint, Tests) ist nur grün, wenn im Arbeitsbaum keine halbfertige fremde Arbeit liegt. Siehe Abschnitt 6 zur Zusammenarbeit zweier Sessions.
- Die zwei übersprungenen Tests brauchen eine echte Datenbank: `$env:TEST_DATABASE_URL = "postgres://senify@127.0.0.1:5433/senify"` und dann `pnpm vitest run packages/engine/test/transactions.test.ts`.
- Laufender Start geprüft: Dashboard liefert HTTP 200, Engine-Health über den Proxy `{"ok":true,"version":"0.1.0"}`, Projekt anlegen über `POST /api/sites` liefert 201 mit Profil `standard`, Editor-Bundle `/editor.js` wird ausgeliefert.

## 4. Stand der Tickets

Alle Tickets liegen unter `.scratch/senify-v1-build/issues/`. Der Fortschritt steht in Zeile 7 als `**Status:**` (freier Text), das Triage-Vokabular ist in `docs/agents/triage-labels.md` beschrieben.

| Ticket | Stand |
| --- | --- |
| 01 Projekt-Fundament | umgesetzt, Fidelity-Tests laufen gegen echtes Postgres |
| 02 Site & Pages + Mutations | umgesetzt |
| 03 Sektionsbibliothek | umgesetzt |
| 04 Theme & Tokens | umgesetzt |
| 05 Renderer & Bake | umgesetzt |
| 06 MCP-Kern & Agenten-Setup | umgesetzt |
| 07 Lifecycle, Review & Checks | umgesetzt, Motion-Video-Diffs offen |
| 08 Medien-Pipeline | umgesetzt (Varianten, Blurhash, `picture`/`srcset`) |
| 09 Content-Kern | umgesetzt, Workspace in der Shell |
| 10 Templates, Bindings & Loops | umgesetzt, Entwurfs-Vorschau nachgeliefert |
| 11 Forms & Submissions | umgesetzt, Einsendungen-Tab mit CSV und Job-Retry |
| 12 Programm-Shell | umgesetzt, Mail belegt, Restore eingebaut, Verpackung offen |
| 13 Visueller Editor | umgesetzt, Browserprüfung nachgeliefert |
| 14 Referenzen-Bibliothek | umgesetzt, Sammlungen, Briefe, Oberfläche, Designprüfung |
| 15 Docs-Portal | umgesetzt |
| 16 Voll-Individualisierung | umgesetzt |
| 17 Elementor-naher Editor | **in Arbeit** (M1 und M2 umgesetzt, M3 und M4 offen), eigene Session |

## 5. Was zuletzt dazukam

- **Referenz-Bibliothek nach dem Vorbild Taste Vault.** Die Vorbild-Quelle liegt als Referenz unter `Repos/taste-vault` (gitignoriert, nicht committen), eigene Aufnahmen beider Oberflächen unter `.scratch/refs/aufnahmen/` (`taste-*.png`, `unser-*.png`, dazu `audit.json` mit allen Messwerten). Umgesetzt sind: Sammlungen mit den Feldern des Vorbilds (`name`, `description`, `deployFor`, `vocabulary`, `risk`, `accent`, `imageStyle`), Zähler, serverseitige Suche, Filter und Sortierung, der Stil-Katalog mit den 18 Familien aus `styles.json` (MIT, Herkunft im Code vermerkt), Briefe in der Engine (Einzelbrief, Sammelbrief, Stilbrief, Bild-Prompt, Haus-DNA-Block) samt vier MCP-Werkzeugen, manuelle Referenzen per Upload, dazu die Oberfläche mit Leiste, Karten, Vergleich bis drei, Detailseite mit Brief-Spalte, Stil-Guide und Vorlieben in den Einstellungen.
- **Designprüfung gegen das Vorbild.** Gemessen mit Chromium bei 1440, 1024, 900 und 375 px in beiden Oberflächen. Behoben wurden: waagerechter Überlauf bei 375 px (kam aus der Shell-Kopfleiste), fehlender Sammlungs-Wechsler unter 1000 px, fehlende Fokusringe, fehlende Bewegungsreduktion, zu kleine Trefferfläche der Vergleichsauswahl und ein Kontrast von 2,26 auf 5,24. Danach: SVG-Symbole statt typografischer Zeichen und eine Ladeanzeige beim Ansichtswechsel.
- **Mail und Sicherung.** Der SMTP-Client ist gegen einen echten lokalen SMTP-Server belegt (Erfolg, `AUTH LOGIN`, falsche Zugangsdaten, nicht erreichbarer Port, Abbruch mitten im Dialog). Sicherungen lassen sich zurückspielen: Prüfung gegen Manifest und Prüfsummen, automatisches Schutznetz vorher, Tabellenwechsel in einer Transaktion, Route nur mit ausdrücklicher Bestätigung.
- **Start lauffähig.** Die CLI braucht `tsx`, weil die Registry `.tsx`-Dateien enthält. Deshalb gibt es `pnpm start` und `pnpm senify`; Anleitung in `README.md`.

## 5b. Runde 2 am 16.09.2026: Referenzen wirklich wie das Vorbild

- **Echte Daten statt Platzhalter.** `pnpm exec tsx packages/engine/scripts/import-taste-vault.ts --from Repos/taste-vault [--dry-run]` liest `data/gallery.json` und `images/` des Vorbilds und legt 12 Sammlungen und 46 Referenzen mit allen Originalwerten an (idempotent, zweiter Lauf aktualisiert nur). Die 46 Originalbilder liegen im Datenverzeichnis (`~/.senify/references/<id>/snapshots/`), **nicht** im Repo: sie zeigen fremde Websites und stehen nicht unter der MIT-Lizenz des Vorbildcodes. Achtung: Die Engine drosselt auf 60 Anfragen je Minute, das Skript taktet den Bildversand mit 1,1 s; die Snapshot-Route selbst ist inzwischen von der Drosselung ausgenommen.
- **Oberfläche nach Messwerten.** Leiste 219 px (Eintrag 184 × 37), Raster 3 × 367 px mit 32/24 px, Karte 301 px, Suche 480 × 44, Grundschrift Segoe UI Variable, Überschrift Bahnschrift 56 px mit -2,3 px, Umbruch bei 1750/1190/1000/650/380 px. Hover: Rand `#ac96e9`, Ring `#e9e1f8`, Etikett „Referenz öffnen", Titel `#593dc3`; Auswahl mit 2 px `#6346d7`.
- **Popup statt Detailseite.** Klick auf eine Karte öffnet ein modales Fenster (1408 × 846 bei 1440 px, Radius 13, Backdrop 48 % mit 4 px Weichzeichnung, Bildbühne `#e9ecf1` mit 24 px, Detailspalte 345 px mit 27/24 px), Blättern per Pfeiltasten und Knöpfen, Zoom/Einpassen, Escape und Klick daneben schließen, mobil einspaltig.
- **Zwei CSS-Fallen, die Zeit gekostet haben:** Dialoge hängen am Body und erben die Variablen der Fläche nicht (Regeln für `.refs-dialog` ergänzt), und die App-Regel `button.primary` überschreibt Größe, Radius und Schrift der Referenz-Knöpfe (Maße im Referenzen-Kontext festgesetzt).
- **Briefe wörtlich wie das Vorbild:** Einzelbrief (Reference, Screenshot, Aesthetic, Vocabulary, What to borrow, Composition, Image recipe), Sammelbrief mit Trenner, Sammlungs- und Stilbrief, Bildrezept-Prompt und Haus-DNA. Die Vorlagen stammen aus dem Vorbild (MIT), erfundene Fallbackzeilen sind entfernt.
- **Abnahme:** Chromium-Durchlauf über alle 14 Leisten-Einträge, Suche, Sortierung, Hover-, Fokus- und Auswahlzustände, Vergleichsfenster und Mobilansicht; Messskripte und Screenshots im Scratchpad (`vorbild-ui.*`, `abnahme.json`, `p-*.png`, `m-*.png`), eigene Aufnahmen unter `.scratch/refs/aufnahmen/`.

## 6. Arbeitsweise im Projekt

- Antworten und Artefakte auf **Deutsch**, Fachbegriffe englisch. Fragen an den Nutzer über den interaktiven Frage-Dialog, nicht als Freitext-Runde.
- Ein Befehl als Gate: `pnpm verify`. Nur bei grünem Lauf committen.
- **Kommentare sparsam.** TypeScript strict und ESM, Imports mit `.ts`-Endung. Fehler über `SenifyError` mit `category`, `field`, `suggestion`. Contracts mit TypeBox. Datenbanken **additiv** ändern (kein `ALTER` an Bestehendem, Deprecation statt Löschen).
- Commit-Konvention: Betreffzeile mit Ticketnummer, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`.
- **Zwei Sessions im selben Arbeitsbaum** (kommt hier regelmäßig vor): vor jedem Commit `git status` prüfen und **immer nach Pfaden stagen, nie `git add -A`**. Liegt schon fremde Arbeit im Index, mit Pfadspezifikation committen (`git commit -F datei -- pfad1 pfad2`). Ist `pnpm verify` rot, aber ausschließlich wegen einer fremden, uncommitteten Datei, im Commit-Text belegen (Datei, Fehler, warum fremd) und den eigenen Teil einzeln grün fahren (`pnpm exec eslint packages/<paket>`, passendes `pnpm vitest run <pfad>`).

## 7. Fallstricke und Lessons Learned

- **Node kann die CLI nicht direkt ausführen.** Die Registry enthält `.tsx`-Dateien, die reines Node nicht laden kann. Deshalb läuft die CLI über `tsx` (`pnpm start`, `pnpm senify`). Ohne das war `senify start` auf keinem Rechner ausführbar.
- **pg-mem verdeckt Fehler.** In der Standard-Testsuite läuft die Datenbank auf pg-mem. Dort ignoriert `withTransaction` das Rollback. Zwei Tests prüfen Rollback und Atomarität deshalb nur gegen echtes Postgres und werden ohne `TEST_DATABASE_URL` übersprungen. Beim ersten echten Lauf war die Ursache, dass die Testhilfe das Wegwerf-Schema anlegte, aber **nie migrierte**; das ist in `packages/engine/test/helpers.ts` behoben (`ensureSchema` im gescopten Schema, Aufräumen bei Fehlern).
- **Schwere Integrationstests brauchen großzügige Timeouts.** Unter voller Suite (67 Dateien parallel) lief ein Bake-Test über 30 Sekunden; er hat jetzt 120 Sekunden. Ein sporadisches 502 beim Editor-Bundle im App-Test unter Volllast ist bekannt und harmlos, isoliert läuft er grün.
- **Playwright ist optional.** Live-Aufnahmen von Referenzen brauchen Chromium (`npx playwright install chromium`, liegt unter `%LOCALAPPDATA%\ms-playwright`). Fehlt der Browser, überspringt sich der Capture-Test sauber und der Snapshot-Fallback greift.
- **Das Editor-Bundle wird bei Bedarf gebaut** (esbuild, ausgeliefert unter `/editor.js`). Rechnet mit ein paar Sekunden beim ersten Aufruf einer Seite.
- **Designprüfung mit Messwerten statt Augenmaß.** Ein Playwright-Skript, das in beiden Oberflächen dieselben Werte ausliest (Rasterspalten, Abstände, Schriftgrößen, Kontraste, Überlauf), findet Unterschiede in Minuten. Kontrast und Trefferflächen prüft man am besten gleich mit; ein Klick knapp außerhalb der sichtbaren Fläche belegt die Trefferfläche.
- **Portal-Aliase müssen exakt sein.** In `packages/docs-portal/astro.config.mjs` werden Aliasse als exakte Regexe gebunden, sonst zieht ein Subpath-Import die schwere Kette aus Engine und Renderer in den Portal-Build.
- **Puck ist nur ein optionales Peer-Dependency.** Der Editor erzeugt Puck-kompatible Strukturen mit eigenen Typen und bleibt dadurch ohne Browser und ohne Puck-Runtime testbar.
- **Sub-Agenten haben ein Rundenlimit (100).** Große Aufträge deshalb in Etappen mit Zwischencommits planen; mehrfach hinterließ ein abgebrochener Agent uncommittete, halbfertige Arbeit mit Typecheck-Fehlern und Debug-Dateien (`tmp-*.ts`) im Baum.
- **Kleine stille Bugs lohnen sich zu suchen.** Zwei Beispiele: Das Auswerte-Skript im Live-Capture lief nie (Funktion als String an `page.evaluate`), und ein Entwurfs-Rename hätte die veröffentlichte URL mitgenommen, weil `resolve` die aktive Version nicht las.
- **Datenbank im Home-Verzeichnis.** Bei fehlendem Docker ist der eigene Cluster unter `~/.senify/pg` die pragmatische Lösung. Er läuft dauerhaft, solange man ihn nicht stoppt.

## 8. Offene Punkte und nächste Schritte

1. **Ticket 17 fertigstellen** (eigene Session): M3 und M4 des Elementor-nahen Editors.
2. **Motion-Videos** (Tickets 07 und 14): Die Pipeline erzeugt nur Standbilder. Sobald es Artefakte gibt, gehören Video und Diff dazu.
3. **STARTTLS im Mailversand** ist nicht lokal geprüft (kein Zertifikat im Test); der TLS-Pfad ist unverändert und ungetestet.
4. **Restore bei laufender Engine** tauscht Dateien ohne globales Lock, und der Knopf im Dashboard fehlt noch (die Route steht).
5. **Verpackung und System-Start** (Ticket 12): Desktop-Verknüpfung, Start mit dem System. Die Autostart-Deutung weicht bewusst vom Artefakt ab und ist im Ticket notiert.
6. **Postgres-Fidelity** gehört in eine regelmäßige Prüfung, nicht nur in die Hand (Befehl in Abschnitt 3).
7. **Aufräumen:** `.scratch/refs/` ist absichtlich nicht committet (Referenzbilder). `packages/app/tmp-drag.ts` und ähnliche `tmp-*`-Dateien stammen aus fremden Sessions und können weg, sobald dort committet ist.

## 9. Wo was steht

- `CONTEXT.md`: Fachmodell und Begriffe.
- `AGENTS.md`: Arbeitsweise für Agenten (Sprache, Frage-Dialog, Skills).
- `docs/adr/`: getroffene Architekturentscheidungen.
- `docs/agents/`: Prozess für Tickets, Triage-Labels, Domänen-Dokumente.
- `.scratch/senify-v1-build/issues/`: alle Tickets mit Auftrag, Umsetzungsnotiz und Kommentaren.
- `.scratch/senify-v1/`: Spezifikation, Artefakte und Prototypen aus der Planungsphase.
- `.scratch/refs/`: Referenzbilder und eigene Aufnahmen (nicht committet).
- `Repos/taste-vault`: Vorbild-Quelle der Referenz-Bibliothek (gitignoriert).
- `README.md`: Startanleitung.
