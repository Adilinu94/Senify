# Handoff: Senify v1 (Stand 16.09.2026)

Diese Datei beschreibt, was gebaut wurde, wie man es startet und prüft, was offen ist und welche Fallstricke unterwegs aufgetreten sind. Sie ist für die nächste Person oder Session gedacht, die hier weiterarbeitet.

## 1. Was das Produkt ist

Senify baut Websites aus einem Brief. Der Agent (Claude Code, Cursor, opencode) spricht über MCP mit der lokalen Engine: Seiten anlegen, Sektionen einfügen, Inhalte füllen, prüfen, zur Freigabe geben. Daneben gibt es ein Programm im Browser mit Projekten, Arbeitsbereich, visuellem Editor, Referenzen-Tab und Einstellungen. Veröffentlichung läuft über einen Bake (statische Seiten), Freigabe und Rollback inklusive.

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
| `@senify/engine` | Backend: Store, HTTP-Routen, Mutations, Checks, Lifecycle, Formulare, Referenzen, Einstellungen, Backup |
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

### Was zuletzt geprüft wurde

- `pnpm verify`: 60 Testdateien, **447 Tests grün**, 2 absichtlich übersprungen, Lint und Typecheck sauber.
- Laufender Start geprüft: Dashboard liefert HTTP 200, Engine-Health über den Proxy `{"ok":true,"version":"0.1.0"}`, Projekt anlegen über `POST /api/sites` liefert 201 mit Profil `standard`, Editor-Bundle `/editor.js` wird mit 427 KB ausgeliefert.
- Fidelity-Tests gegen echtes Postgres (nur mit gesetzter `TEST_DATABASE_URL`, siehe Abschnitt 6).

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
| 07 Lifecycle, Review & Checks | umgesetzt, Screenshot-/Motion-Diffs offen |
| 08 Medien-Pipeline | umgesetzt (Varianten, Blurhash, `picture`/`srcset`) |
| 09 Content-Kern | umgesetzt, Workspace mit T12 integriert |
| 10 Templates, Bindings & Loops | umgesetzt, Draft-Vorschau offen |
| 11 Forms & Submissions | umgesetzt, Einsendungsansicht und Job-Retry im Programm offen |
| 12 Programm-Shell | umgesetzt, Einstellungen inklusive |
| 13 Visueller Editor | umgesetzt, Puck-Runtime im Browser offen |
| 14 Referenzen-Tab | umgesetzt, Motion-Videos offen |
| 15 Docs-Portal | umgesetzt |
| 16 Voll-Individualisierung | umgesetzt |

## 5. Arbeitsweise im Projekt

- Antworten und Artefakte auf **Deutsch**, Fachbegriffe englisch. Fragen an den Nutzer über den interaktiven Frage-Dialog, nicht als Freitext-Runde.
- Ein Befehl als Gate: `pnpm verify`. Nur bei grünem Lauf committen.
- **Kommentare sparsam.** TypeScript strict und ESM, Imports mit `.ts`-Endung.
- Fehler über `SenifyError` mit `category`, `field`, `suggestion`. Contracts mit TypeBox.
- Datenbanken **additiv** ändern (neue Tabelle oder Spalte, kein `ALTER` an Bestehendem, Deprecation statt Löschen).
- Commit-Konvention: Betreffzeile mit Ticketnummer, Leerzeile, `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`. Kein `git add -A`, nur die betroffenen Pfade stagen.
- Bei parallelen Sessions: Dateibereiche strikt trennen, sonst überschreiben sich die Bearbeitungen im selben Arbeitsbaum.

## 6. Fallstricke und Lessons Learned

- **Node kann die CLI nicht direkt ausführen.** Die Registry enthält `.tsx`-Dateien, die reines Node nicht laden kann. Deshalb läuft die CLI über `tsx` (`pnpm start`, `pnpm senify`). Ohne das war `senify start` auf keinem Rechner ausführbar.
- **pg-mem verdeckt Fehler.** In der Standard-Testsuite läuft die Datenbank auf pg-mem. Dort ignoriert `withTransaction` das Rollback. Zwei Tests prüfen Rollback und Atomarität deshalb nur gegen echtes Postgres und werden ohne `TEST_DATABASE_URL` übersprungen. Beim ersten echten Lauf war die Ursache, dass die Testhilfe das Wegwerf-Schema anlegte, aber **nie migrierte**; das ist in `packages/engine/test/helpers.ts` behoben (`ensureSchema` im gescopten Schema, Aufräumen bei Fehlern).
- **Schwere Integrationstests brauchen großzügige Timeouts.** Unter voller Suite (60 Dateien parallel) lief ein Bake-Test über 30 Sekunden; er hat jetzt 120 Sekunden. Ein sporadisches 502 beim Editor-Bundle im App-Test unter Volllast ist bekannt und harmlos, isoliert läuft er grün.
- **Playwright ist optional.** Live-Aufnahmen von Referenzen brauchen Chromium (`npx playwright install chromium`, liegt unter `%LOCALAPPDATA%\ms-playwright`). Fehlt der Browser, überspringt sich der Capture-Test sauber und der Snapshot-Fallback greift.
- **Das Editor-Bundle wird bei Bedarf gebaut** (esbuild, ausgeliefert unter `/editor.js`). Rechnet mit ein paar Sekunden beim ersten Aufruf einer Seite.
- **Portal-Aliase müssen exakt sein.** In `packages/docs-portal/astro.config.mjs` werden Aliasse als exakte Regexe gebunden, sonst zieht ein Subpath-Import die schwere Kette aus Engine und Renderer in den Portal-Build.
- **Puck ist nur ein optionales Peer-Dependency.** Der Editor erzeugt Puck-kompatible Strukturen mit eigenen Typen und bleibt dadurch ohne Browser und ohne Puck-Runtime testbar.
- **Kleine stille Bugs lohnen sich zu suchen.** Zwei Beispiele: Das Auswerte-Skript im Live-Capture lief nie (Funktion als String an `page.evaluate`), und ein Entwurfs-Rename hätte die veröffentlichte URL mitgenommen, weil `resolve` die aktive Version nicht las.
- **Datenbank im Home-Verzeichnis.** Bei fehlendem Docker ist der eigene Cluster unter `~/.senify/pg` die pragmatische Lösung. Er läuft dauerhaft, solange man ihn nicht stoppt.

## 7. Offene Punkte und nächste Schritte

Empfohlene Reihenfolge, jeweils mit Begründung:

1. **Editor im echten Browser prüfen** (Ticket 13): Puck-Runtime einbinden und die Arbeitsfläche mit echten Media-Queries durchklicken. Das ist der größte ungeprüfte Bereich, weil es dafür keinen Browser im Testlauf gibt.
2. **Einsendungsansicht und Job-Retry im Programm** (Ticket 11): API und CSV stehen, die Ansicht fehlt. Nützlich für jeden, der Formulare einsetzt.
3. **Draft-Vorschau** (Ticket 10): Unveröffentlichte Entwürfe lassen sich noch nicht ansehen, der Preview-Endpoint arbeitet auf freigegebenen Ständen.
4. **Motion-Videos und Screenshot-Diffs** (Tickets 07 und 14): Die Pipeline erzeugt nur Standbilder. Sobald es Artefakte gibt, gehören Slider und Diffs dazu.
5. **Echter Mailversand** (Ticket 12): SMTP ist implementiert, aber nie gegen ein echtes Postfach gelaufen. Ein Testpostfach würde das absichern.
6. **Restore automatisieren** (Ticket 12): Sicherungen werden erzeugt und angezeigt, das Einspielen ist Handarbeit mit dokumentierten Schritten.
7. **Verpackung und System-Start** (Ticket 12): Desktop-Verknüpfung, Start mit dem System, Autostart-Deutung weicht bewusst vom Artefakt ab und ist im Ticket notiert.

Dazu zwei technische Punkte, die keinen Ticketbezug brauchen:

- Die zwei Fidelity-Tests gehören in eine regelmäßige Prüfung, nicht nur in die Hand: `$env:TEST_DATABASE_URL = "postgres://senify@127.0.0.1:5433/senify"` und dann `pnpm vitest run packages/engine/test/transactions.test.ts`.
- Der pg-mem-Kompromiss bleibt: In der Standard-Suite wird kein echtes Rollback geprüft. Wenn das wichtig wird, sollte die Suite gegen echtes Postgres laufen.

## 8. Wo was steht

- `CONTEXT.md`: Fachmodell und Begriffe.
- `AGENTS.md`: Arbeitsweise für Agenten (Sprache, Frage-Dialog, Skills).
- `docs/adr/`: getroffene Architekturentscheidungen.
- `docs/agents/`: Prozess für Tickets, Triage-Labels, Domaenen-Dokumente.
- `.scratch/senify-v1-build/issues/`: alle Tickets mit Auftrag, Umsetzungsnotiz und Kommentaren.
- `.scratch/senify-v1/`: Spezifikation, Artefakte und Prototypen aus der Planungsphase.
- `README.md`: Startanleitung.
