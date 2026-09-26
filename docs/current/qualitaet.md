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

`.github/workflows/verify.yml` fährt nacheinander:

1. `pnpm install --frozen-lockfile`
2. Chromium-Installation mit Dependencies
3. `pnpm verify` (Build, Lint, Tests)
4. `pnpm test:visual`
5. Upload der Diff-Artefakte bei Fehlschlag
6. `pnpm verify:parity`
7. `pnpm verify:import`

**Fehlt (R11):** ein PostgreSQL-Service mit `TEST_DATABASE_URL`, ein echter Build-Schritt, ein Coverage-Gate, ein Docs-Portal-Build. `scripts/` liegt außerhalb von `eslint packages`.

## Pflege-Regeln

- Testzahlen werden **nur** hier geführt und nicht in `stand.md`, `fahrplan.md` oder ADRs kopiert.
- Jede Zeile dieses Dokuments nennt ein Kommando oder eine Datei; Behauptungen ohne Beleg gehören nicht hierher.
- Nach jedem Gate-Lauf, der Zahlen ändert, wird dieses Dokument aktualisiert — nicht die anderen Current-Dokumente.
