# Qualitäts- und Gate-Stand

> Basis: Commit `67a2862` — derselbe Inhalt wie der gemessene Arbeitsbaum vom 25.09., jetzt in den zehn P0-1-Commits seit `6973cb1`.
> Messzeitpunkt: **25.09.2026**, alle Werte in diesem Dokument wurden in dieser Sitzung selbst gemessen.
> Aktueller Stand: `docs/current/stand.md`. Planung: `docs/fahrplan.md`.

## Verifizierte Gates (eigener Lauf, 25.09.2026)

| Gate | Kommando | Ergebnis |
|---|---|---|
| Typecheck | `pnpm typecheck` | **grün**, Exit 0 |
| Gesamttests | `pnpm test` | **1642 grün / 15 übersprungen / 0 rot** in 190 Dateien (187 grün, 3 übersprungen) |
| Lint | `pnpm lint` | **grün**, Exit 0 |
| Visuelle Stabilität | `pnpm test:visual` | **grün** |
| Patch-Integrität | `git diff --check` | grün (nur CRLF-Hinweise) |
| Import-Tor (isoliert) | `pnpm exec vitest run packages/framer-import/test/import-visual-gate-browser.test.ts` | **grün** |
| Paritäts-Tor | `pnpm verify:parity` | in dieser Sitzung **nicht** ausgeführt (setzt installierten Chromium und Zeit voraus; CI fährt es) |
| Route-Matrix | `pnpm route-matrix` | in dieser Sitzung **nicht** neu erzeugt; Datei nennt 171 Routen |
| Coverage-Tor | `pnpm test:coverage` | **grün**, Exit 0 (26.09.2026) — 950 grün / 15 übersprungen / 0 rot in 98 Dateien (95 grün, 3 übersprungen), 0 Schwellenfehler. Zahlen unten |
| Postgres-Lane | `pnpm test:postgres` | **Nachweis steht aus.** Das Tor ist gebaut und wird rot, wenn `TEST_DATABASE_URL` fehlt oder ein Fall überspringt; ein grüner Lauf gegen eine echte Postgres existiert nicht (kein CI-Lauf, lokal keine nutzbaren Zugangsdaten, `docker` fehlt) |

**Nachlauf 26.09.2026 (nach P0-1, Basis `9f183c7`):** Typecheck grün (Exit 0), Lint grün (Exit 0), `git diff --check` grün, Gesamttests **1641 grün / 15 übersprungen / 1 rot** in 190 Dateien (317 s). Der eine rote Test (`packages/app/test/accessibility-browser.test.ts`, Timeout auf `.refs-search input` unter Volllast) ist im Isolierlauf **grün in 17,6 s** — dieselbe Lastflaky-Klasse wie die drei bekannten Fälle unten. Log: `.scratch/testlauf-26-09-p01.log`, `.scratch/a11y-isoliert.log`.

**Der Lintfehler ist behoben.** `packages/engine/test/redesign-transaction.test.ts:2` importierte ein ungenutztes `ensureSchema` und blockierte damit `pnpm verify` vollständig. Der Import ist entfernt, `pnpm lint` läuft seit 25.09.2026 mit Exit 0. `pnpm verify` erreicht den Testlauf. Details: `docs/fahrplan.md` P0-2.

## Testzahlen im Detail

| Kategorie | Anzahl | Bedeutung |
|---|---|---|
| Gesamte Tests | 1657 | inklusive aller Skip-Fälle |
| grün | 1642 | im Volllauf dieser Sitzung |
| übersprungen | 15 | drei Ursachen, siehe unten |
| rot | 0 | nach Wiederholung |
| Testdateien | 190 | 187 grün, 3 vollständig übersprungen |

### Die 15 übersprungenen Tests nach Ursache

| Ursache | Tests | Dateien | Klasse |
|---|---|---|---|
| `TEST_DATABASE_URL` nicht gesetzt | 5 | `engine/test/transactions.test.ts` (2), `engine/test/redesign-transaction.test.ts` (3) | **R11** — die einzigen Transaktionsbeweise gegen echtes PostgreSQL |
| UI-Vorschau-Parität deaktiviert | 10 | `editor/test/ui/vorschau-paritaet.test.ts` (7), `editor/test/ui/zustands-und-layoutprobe.test.ts` (3) | Altlast aus dem UI-Neuaufbau; erwartet Marker, die im neuen Preview nicht mehr liegen |

Zusätzlich können Browser-Suiten über `browserSkip`/`!browserAvailable` überspringen, wenn Chromium fehlt. In `.github/workflows/verify.yml` wird Chromium installiert; die Paritäts- und Visual-Gates setzen `SENIFY_REQUIRE_BROWSER=1` und fallen dann **rot** statt still zu überspringen.

## Coverage-Gate (eigener Lauf, 26.09.2026)

Geführt über `pnpm test:coverage`, Provider v8, `perFile: true`. Der Lauf umfasst die Suites von `engine`, `editor` und `mcp`, nicht die schweren Browser-Suiten. Gemessen und geschützt sind die sechs in `docs/fahrplan.md` P1-2 genannten Pfade. Die Schwellen liegen jeweils knapp unter dem gemessenen Stand; gehoben wird nach einer Änderung, nicht vorher.

| Gruppe und Datei | Statements | Branches | Functions | gesetzte Latte (st/br/fn/ln) |
|---|---|---|---|---|
| `engine/src/http.ts` | 91,12 | 71,95 | 93,57 | 80 / 68 / 88 / 80 |
| `engine/src/store.ts` | 84,09 | 76,25 | 93,45 | 80 / 68 / 88 / 80 |
| `engine/src/lifecycle.ts` | 89,79 | 74,14 | 100 | 80 / 68 / 88 / 80 |
| `engine/src/forms.ts` | 84,09 | 73,60 | 100 | 80 / 68 / 88 / 80 |
| `mcp/src/tools.ts` | 90,72 | 62,15 | 86,08 | 85 / 60 / 82 / 85 |
| `editor/src/state/*` (15 Dateien) | 66,98 bis 100 | 56,75 bis 100 | 66,66 bis 100 | 60 / 52 / 62 / 60 |

Die niedrigsten Werte je Gruppe sind der eigentliche Grund für die Latte: `editor/src/state/document.ts` mit 66,98 Statements und Functions, `editor/src/state/selection.ts` mit 56,75 Branches, `engine/src/http.ts` mit 71,95 Branches, `mcp/src/tools.ts` mit 62,15 Branches.

**Zwei Grenzen dieses Tores, beide bewusst:**

1. Es misst nur, was die Suite ohnehin berührt. Die in P1-2 Punkt 3 geforderten gezielten Fehlerpfade (`withIdempotency`-Catch, `releaseIdempotencyKey`, Transaktions-Rollback, `operatorOnly`-Ablehnung, `baseVersion`-409) haben weiterhin keine eigenen Tests. Eine hohe Zahl ist hier kein Beweis für Fehlerabdeckung.
2. `packages/editor/src/state/browser.ts` ist aus der Messung genommen. Die Datei enthält nichts als `export *`-Zeilen, hat also keine eigenen Aussagen; ihre Prozentzahl misst nichts. Was sie durchreicht, steht einzeln in der Tabelle.

**Zwei Fallen, die den Lauf zuerst gebrochen hatten** (festgehalten, damit niemand sie zweimal baut): ein eigenes `exclude`-Feld in `vitest.config.ts` **ersetzt** die Vitest-Standardwerte, und ohne `coverageConfigDefaults.exclude` stehen `dist/` (seit P0-4 echte Build-Artefakte) und `node_modules` in der Messung; die Report-Erzeugung bricht dann mit ENOENT in `coverage/.tmp` ab. Und: `pnpm exec vitest run --coverage` über den **gesamten** Bestand inklusive Browser-Suiten braucht über 400 s und erbt deren Lastflakes; das Tor läuft deshalb eingegrenzt.

## Flakes unter Volllast (dokumentiert, nicht behoben)

In den Vollläufen vom 25.09. (drei Browser-Tests) und 26.09. (ein Browser-Test) waren Browser-Suiten unter Volllast rot. **Alle bestehen isoliert:**

| Test | Volllauf | isoliert |
|---|---|---|
| `app/test/submissions-browser.test.ts` | Timeout bei `td:has-text("Max Mustermann")` | grün, 53,4 s |
| `framer-import/test/capture-browser.test.ts` | Timeout bei „URL unreachable" | grün, 5/5 |
| `framer-import/test/import-visual-gate-browser.test.ts` | Timeout 240 s | grün, 93,4 s |
| `app/test/accessibility-browser.test.ts` | Timeout bei `.refs-search input` (Volllauf 26.09., 317 s) | grün, 17,6 s |

Der Wiederholungslauf des Gesamtbestands war vollständig grün (1642/15/0). Ursache ist die Last durch vier parallele Worker (`vitest.config.ts`, `poolOptions.threads.maxThreads: 4`) plus schwere Playwright-Suiten; die Suite ist in der Datei bereits kommentiert gedeckelt. **Das ist R12/R11-Territorium, kein Inhaltsfehler.**

## Eingeschränkte Nachweise

- Die Transaktions-Atomarität von ADR-0014 ist gegen `pg-mem` bewiesen, **nicht** gegen echtes PostgreSQL. `redesign-transaction.test.ts` schreibt es selbst: „The pg-mem test double ignores ROLLBACK, so an atomicity test on it would pass without proving anything."
- `pnpm build` ist ein TypeScript-Lauf und **kein** Produktionsbuild (**R1**). Was `verify` grün macht, ist der Arbeitsbaum, kein Artefakt.
- Kein Coverage-Block in `vitest.config.ts` (**R11**): es gibt keine Schwelle, die eine Regression abfangen würde.
- Die visuellen Baselines liegen unter `packages/app/test/visual-baselines/`; Aktualisierung ist ein expliziter Vorgang über `UPDATE_VISUAL_SNAPSHOTS=1`.
- Das Import-Tor verwendet eine kontrollierte Fixture; alle drei echten Export-Fixtures laufen nicht vollständig durch.

## CI-Stand

`.github/workflows/verify.yml` fährt **drei voneinander unabhängige Jobs**, damit jede Aussage einen eigenen grünen oder roten Balken hat:

**Job `verify`** (nacheinander):

1. `pnpm install --frozen-lockfile`
2. Chromium-Installation mit Dependencies
3. `pnpm verify` (Build, Lint über `packages` und `scripts`, Patch-Integrität, Tests)
4. `pnpm test:visual`
5. Upload der Diff-Artefakte bei Fehlschlag
6. `pnpm verify:parity`
7. `pnpm verify:import`

**Job `postgres-tests`:** Postgres-16-Service auf Port 5432, `TEST_DATABASE_URL` gesetzt, dann `pnpm test:postgres`. Das Skript wird rot, wenn die Variable fehlt, ein Fall überspringt oder kein Fall läuft. **Bisher kein Lauf** — der Job ist seit 26.09. im Workflow, sein erster grüner Nachweis steht mit dem nächsten Push aus.

**Job `coverage`:** `pnpm test:coverage` mit den Schwellen aus `vitest.config.ts`, plus Upload der JSON-Zusammenfassung als Artefakt.

**Fehlt weiterhin:** ein Docs-Portal-Build als eigener Schritt und die Prüfung von `eslint.config.mjs` selbst. **Nicht mehr fehlend:** der PostgreSQL-Service und das Coverage-Gate (beide seit 26.09. im Workflow, PG-Nachweis offen), der echte Build-Schritt (P0-4) und `scripts/` im Lint-Ziel (P1-3).

## Pflege-Regeln

- Testzahlen werden **nur** hier geführt und nicht in `stand.md`, `fahrplan.md` oder ADRs kopiert.
- Jede Zeile dieses Dokuments nennt ein Kommando oder eine Datei; Behauptungen ohne Beleg gehören nicht hierher.
- Nach jedem Gate-Lauf, der Zahlen ändert, wird dieses Dokument aktualisiert — nicht die anderen Current-Dokumente.
