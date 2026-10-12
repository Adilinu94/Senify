# Qualitäts- und Gate-Stand

> Stand: **11.10.2026** (Gate-Zeile CLI `tokens revoke`); darunter 09.10.2026: PR #1 (Härtung), PR #2 (MCP-Paging) und PR #3 (Schreib-`outputSchema`) sind gemergt; der Messwerte-Block ist auf dem aktuellen Stand neu gerendert. Frühere App-Gates sind mit ihrem tatsächlichen Datum gekennzeichnet.
> Aktueller Umsetzungsstand: `docs/current/stand.md`. Planung: `docs/fahrplan.md`.

## Aktuelle Gates

| Gate | Kommando | Ergebnis |
|---|---|---|
| P3-2: Typecheck, Lint | `pnpm typecheck`, `pnpm lint` | **Grün am 10.10.2026** nach dem neunten Store-Schritt (Entries `store-entries.ts`, ADR-0019) |
| P3-2: Volltest | `pnpm test` | **10.10.2026: Exit 0, keine fehlgeschlagene Datei** (lokal, Node 22, ohne `TEST_DATABASE_URL`). Die 28 browser-gebundenen Testdateien waren in diesem Lauf **übersprungen**, darunter `release-cutover-browser` und `accessibility-browser`: das vorinstallierte Chromium passt nicht zur Playwright-Version (`browserAvailable` ist falsch); keine dieser Dateien berührt Deployments oder Newsletter-Tokens; `submissions-browser` berührt die Notification-Outbox (die frühere Aussage, keine dieser Dateien berühre Notifications, war falsch); zwei berühren die Referenz-Sammlungen (`references-browser`, `visual-snapshot-browser`) und liefen nach dem achten Schritt einzeln grün; zwei berühren Entries (`entry-preview-browser`, `submissions-browser`) und liefen nach dem neunten Schritt einzeln grün (siehe unten). Die Zeile vom 08.10.2026 („beide Browser-Tests liefen grün“) war nicht belegt, die Läufe vom 08.10.2026 haben diese Dateien ebenfalls übersprungen. Einzelläufe mit nachgebautem Browser-Layout: siehe „Volltest“ |
| P3-2: Coverage | `pnpm test:coverage` | **Grün am 10.10.2026**, Exit 0, keine Schwellenfehler; Messwerte siehe Coverage-Block |
| CI wieder aktiv (Repo öffentlich), Plattform-Abgleich | GitHub Actions `verify.yml` | **12.10.2026:** Der erste CI-Lauf seit dem 07.10. auf `da05732`: Windows-Testsuite und PostgreSQL grün. Rot waren nur zwei Plattform-Abweichungen, beide durch lokal unter Windows erzeugte Referenzen. (1) Der Coverage-Messblock: Die Branch-Werte von `store.ts`, `lifecycle.ts` und `http.ts` weichen unter Linux um 0,03 bis 0,27 Punkte ab, also mehr als die erlaubten ±0,05. Der Block ist jetzt aus dem CI-Artefakt `coverage-summary` gerendert. (2) Die Visual-Baselines `editor-live` (am 10. und 11.10. unter Windows erzeugt) weichen unter Linux um 1,04 bzw. 1,24 % ab, die Grenze ist 1 %. `1024-editor-live-dark.png` ist aus dem Linux-Artefakt übernommen; die Diff-Artefakte tragen jetzt Viewport und Modus im Namen, damit `1440-editor-live-dark` im nächsten Lauf folgen kann. **Maßgeblich für den Messblock und die Baselines ist der Linux-Lauf der CI.** Ein lokales `quality:check` oder `test:visual` unter Windows darf davon abweichen |
| Port-Fix (`listenReachable`) und P3-2 Schritt 15 (`store-collections.ts`), **alle Gates** | `pnpm verify`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`/`quality:check` | **Grün am 11.10.2026, alle Kommandos Exit 0.** Volltest 2145/15/0, Coverage 1202/15/0 ohne Schwellenfehler, Visual, Parity, Import und PostgreSQL (6/6) grün. Zwei Coverage-Läufe davor waren rot mit `TypeError: fetch failed`, einmal „bad port“, einmal mit Port 6668. Ursache: Der dynamische Portbereich von Windows beginnt auf dieser Maschine bei 1024 (`netsh int ipv4 show dynamicport tcp`), sodass `listen(0)` gelegentlich einen Port vergibt, den `fetch` und Chromium sperren. Das ist kein Last-Flake, sondern deterministisch pro Port. Behoben ist es zentral in `@senify/core/net` (`listenReachable`, bindet neu, bis der Port erreichbar ist) für Engine, App-Server, Review-Visuals und 14 Test-Stubs |
| P3-2 Schritt 14 (`store-image-jobs.ts`), **alle Gates** | `pnpm verify`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`/`quality:check` | **Grün am 11.10.2026, alle Kommandos Exit 0.** Volltest in `pnpm verify` 2137/15/0 in 246 Dateien; Coverage 1197/15/0 ohne Schwellenfehler; Visual, Parity und Import grün; PostgreSQL 6/6 grün, 0 übersprungen, gegen einen isolierten Wegwerf-Cluster. Weiterhin kein CI-Beleg, weil GitHub Actions wegen der Abrechnung nicht starten |
| P3-2 Schritt 13 (`store-reviews.ts`), **alle Gates** | `pnpm verify`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`/`quality:check` | **Grün am 11.10.2026, alle Kommandos Exit 0.** `pnpm verify` (Build, dist, Lint, `diff --check`, Volltest) mit 2131 bestanden / 15 übersprungen / 0 rot in 245 Dateien (3 mit Skips); das ist der erste vollständig grüne Volltest seit dem globalen `testTimeout`. Coverage 1191/15/0 ohne Schwellenfehler. Visual, Parity und Import grün. PostgreSQL 6/6 grün, 0 übersprungen, gegen einen isolierten Wegwerf-Cluster (Port 55432, `fsync=off`, danach gelöscht). CI läuft derzeit nicht: Die GitHub-Actions-Jobs von PR #8 starten wegen eines Abrechnungsproblems nicht, die Belege sind deshalb lokal |
| P3-2 Schritt 12 (`store-bake-jobs.ts`) und globales `testTimeout` | `pnpm verify`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`/`quality:check` | **11.10.2026:** Coverage 1186/15/0 (120 Dateien grün, 3 mit Skips, keine Schwellenfehler), Visual, Parity, Import und quality grün. PostgreSQL 6/6 grün, 0 übersprungen, gegen einen isolierten Wegwerf-Cluster. `pnpm verify`: Build, dist und Lint grün; im Volltest 2125 bestanden, 15 übersprungen und **1 rot**: `review-dialog-browser.test.ts` (120-s-Timeout, 24 Chrome-Prozesse parallel auf der Maschine), danach einzeln 3 von 3 grün. Gegenüber den drei Läufen davor (19, 2 und 2 rot, alle mit dem 5-s-Default) hat das neue `testTimeout: 30_000` in `vitest.config.ts` die Fixture- und Engine-Flakes beseitigt; die zwei Timeouts pro Datei in `golden`/`capture` sind wieder entfernt |
| CLI `tokens revoke` (Ids mit `-`), alle Gates | `pnpm typecheck`, `pnpm lint`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`/`quality:check`, `git diff --check` | **11.10.2026:** Typecheck, Lint, Coverage (1181/15/0, keine Schwellenfehler), Visual, Parity, Import, `quality:check` und `diff --check` grün. PostgreSQL grün (6/6, 0 übersprungen) gegen einen isolierten, lokalen 18er-Cluster (Port 55432, `fsync=off`, nach dem Lauf gestoppt; der Systemdienst blieb unberührt). Vorher war die Lane lokal immer rot: `scripts/verify-postgres.mjs` reichte den Report-Pfad mit `shell: true` unquotiert durch, und ein `TEMP` mit Leerzeichen (`G:\AI Agentur\…`) zerfiel in zwei Argumente; das ist behoben. `pnpm verify` (Build, dist, Lint, Volltest) lief dreimal und war jedes Mal rot, mit 19, 2 und 2 roten Tests (2119 bestanden, 15 übersprungen), immer durch Timeouts und jedes Mal in anderen Dateien (`forms`, `imports`, `media`, `references`, `workflow`, `golden`, `agent-style-gate`, `idempotency`, `capture`, `review-dialog-browser`, `release-cutover-browser`). Jede dieser Dateien war einzeln grün. Auf der Maschine liefen parallel weitere Sessions (16 Node-Prozesse). `golden.test.ts` und `capture.test.ts` (reine Fixture-Verarbeitung, einzeln bis 3,6 s gegen den 5-s-Default) haben jetzt `timeout: 60_000`. Ein vollständig grüner Volltest steht auf diesem Stand noch aus |
| Patch-Prüfung | `git diff --check` | **Grün am 10.10.2026** |
| Doku-Messwerte | `pnpm quality:render` + `pnpm quality:check` | **Grün am 10.10.2026** auf dem Stand des neunten P3-2-Schritts; gerenderte Werte stimmen mit dem Lauf überein |
| Build, App-Gates und PostgreSQL | `pnpm verify`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres` | **Grün am 28.09.2026** auf dem zuvor gesicherten Folge-Diff; für die reine Mapper-Auslagerung nicht erneut erforderlich |
| CI auf dem PR-Branch | `.github/workflows/verify.yml` (Push und Pull Request) | **Alle 8 Läufe grün am 04.10.2026** auf `0386cf9` (verify, Windows, PostgreSQL, Coverage); der Visual-Test lief mit den Linux-Baselines von `master`. Davor war auf `6c35e3e` ein `verify`-Push-Lauf an einem Timeout in `accessibility-browser.test.ts` rot, der Pull-Request-Lauf desselben Codes grün, lokal 3 von 3 Läufen grün: als Timing-Flake gewertet, nicht als Befund |
| Route-Matrix | `pnpm route-matrix` | Kommando nicht separat ausgeführt; `route-matrix.test.ts` ist Teil des Volltests |

## Volltest

`pnpm verify` lief am 28.09.2026 auf dem zuvor gesicherten Folge-Diff. Für die P3-2-Mapper-Schritte liefen Typecheck, Lint und der vollständige Testbefehl separat; der reine Modulwechsel ändert keine Browser-, Build- oder Datenbankverträge.

Beim zweiten Schritt (07.10.2026) waren im vollständigen Testbefehl zwei Browser-Tests rot. `release-cutover-browser.test.ts` scheitert an einem abgebrochenen `/api/events`-Stream (Chromium-Version der lokalen Umgebung) und tut das auch auf unverändertem `master`; die Filter-Korrektur liegt in PR #4. `accessibility-browser.test.ts` lief in die 30-Sekunden-Grenze von `locator.focus` (`.refs-search input`), während der Volltest parallel lief, und war einzeln auf demselben Stand grün: dieselbe Timing-Einordnung wie am 04.10.2026.

Einzelläufe am 09.10.2026 (Chromium 1194 per Symlink im erwarteten Playwright-1243-Layout bereitgestellt, `SENIFY_REQUIRE_BROWSER=1`, nur diese zwei Dateien): `accessibility-browser.test.ts` **grün**. `release-cutover-browser.test.ts` besteht Veröffentlichung, Auslieferung, Paritätsmessung und Rollback und scheitert erst an der letzten Zeile (`failedRequests`), weil zwei `/api/events`-Anfragen abgebrochen werden; das Ergebnis ist **identisch auf dem Stand vor dem Releases-Schritt (`f5abcb6`)**, also nicht durch die Auslagerung verursacht. Die Ursache ist weiter offen (Filter-Korrektur in PR #4).

Einzelläufe am 10.10.2026 nach dem achten Store-Schritt (gleiches Browser-Layout, `SENIFY_REQUIRE_BROWSER=1`): `references-browser.test.ts` (2 Tests) und `visual-snapshot-browser.test.ts` (1 Test) **grün**; beide legen Referenz-Sammlungen über `/api/reference-collections` an.

Einzelläufe am 10.10.2026 nach dem neunten Store-Schritt (gleiches Browser-Layout, `SENIFY_REQUIRE_BROWSER=1`): `entry-preview-browser.test.ts` (1 Test, legt Entries über `/api/sites/:id/entries` an) und `submissions-browser.test.ts` (1 Test: Einsendung in eine Ziel-Collection, CSV und fällige Notification-Jobs) **grün**. Der zweite Lauf belegt damit auch die Notification-Outbox aus dem siebten Schritt gegen die Browser-Oberfläche, die bisher nur im Volltest übersprungen wurde.

| Kategorie | Anzahl | Bedeutung |
|---|---:|---|
| Tests gesamt | 1716 | inklusive Skip-Fälle |
| bestanden | 1701 | Volltest 29.09.2026 |
| übersprungen | 15 | DB-Transaktionsfälle ohne DB-URL im normalen Volltest und UI-Vorschau-Paritätsfälle |
| fehlgeschlagen | 0 | aktueller Volltest |
| Testdateien | 195 | 192 bestanden, 3 mit erwarteten Skips |

Die Postgres-Fälle liefen separat gegen einen eigens initialisierten, lokalen PostgreSQL-18.6-Cluster; der bereits laufende Systemdienst wurde nicht verwendet oder verändert. Der Cluster wurde nach dem Gate gestoppt. Es werden keine Datenbank-Passwörter oder Verbindungs-URLs in dieser Doku abgelegt.

## Coverage-Gate (aktueller Lauf)

Geführt über `pnpm test:coverage`, v8-Provider und `perFile: true`. Der Lauf umfasst die Suites von `engine`, `editor` und `mcp`, nicht die schweren Browser-Suiten. Die Schwellen liegen in `vitest.config.ts`; nur dort ist die maßgebliche Konfiguration.

Der aktuelle Lauf vom 09.10.2026 (lokal auf Windows, TEMP/TMP/TMPDIR auf dem Laufwerk des Repos, ohne `TEST_DATABASE_URL`): **1068 bestanden / 15 übersprungen / 0 fehlgeschlagen** in 109 Dateien (106 bestanden, 3 mit Skips), null Schwellenfehler. Nach den P3-2-Extraktionen liegt `store.ts` bei 85.66 und `http.ts` bei 93.13 — die verschobene Registry steht in `store-style-rules.ts`, die Bake-Auslieferung in `http-build-files.ts`, und beides ist über die Fassaden mitgetestet. Die MCP-Werkzeugdatei `tools.ts` liegt nach der vierten Auslagerung bei 91.83. Ein Lauf am selben Tag war rot, ohne dass ein Fehler im Code stand: nachdem die zwei MCP-Client-Timeouts (siehe unten) behoben waren, flakte genau eine Publish-Bake-Datei (`design-record.test.ts`, vitest-60-s-Deckel); der Wiederholungslauf war vollständig grün, die Datei ist isoliert grün. Das Fenster war die Last mehrerer paralleler Agent-Sessions auf derselben Maschine. Die Übersicht unten wurde mit `pnpm quality:render` aktualisiert und anschließend durch `pnpm quality:check` bestätigt.

**MCP-Client-Timeout (behoben 09.10.2026).** Die zwei Dauer-Flakes des Vortags lagen nicht im Code, sondern an einer Testgrenze, die kürzer war als das System, das sie prüft: der MCP-Client trennt nach dem SDK-Default von 60 s ohne Antwort, der Engine-Bake gibt sich aber selbst 180 s (`packages/renderer/src/bake.ts`). Unter Last lag ein Bake über 60 s, und `workflow.test.ts` sowie `write-output.test.ts` brachen mit `MCP error -32001: Request timed out` ab. Die Aufrufe, die eine Seite veröffentlichen oder eine Vorschau backen, setzen jetzt an der Aufrufstelle `timeout: 300_000`; beide Dateien sind seither grün. Weiterhin gilt: die Bake-Ausgabe wird in `.bake/tmp` (gitignored) gestaged und vor einem Lauf geräumt, weil sich sonst Restverzeichnisse ansammeln und die Läufe verlangsamen.

### Gemessene Coverage der geschützten Pfade

<!-- messwerte:anfang -->

<!-- Erzeugt von `scripts/render-quality.mjs` aus `coverage/coverage-summary.json`.
     Nicht von Hand editieren: dieser Block ist ein Messwert, und `pnpm quality:check`
     lässt den Lauf rot werden, sobald Dokument und Lauf auseinanderlaufen. -->

**Gemessen:** 2026-10-11 · vitest coverage (v8)

| Pfad | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `packages/engine/src/http.ts` | 93.14 | 74.32 | 94.23 | 93.14 |
| `packages/engine/src/store.ts` | 84.52 | 79.28 | 93.53 | 84.52 |
| `packages/engine/src/lifecycle.ts` | 87.01 | 74.46 | 100.00 | 87.01 |
| `packages/engine/src/forms.ts` | 84.25 | 73.62 | 100.00 | 84.25 |
| `packages/mcp/src/tools.ts` | 91.85 | 62.01 | 85.50 | 91.85 |
| `packages/editor/src/state/*` (15 Dateien) | 66.98 bis 100.00 | 56.75 bis 100.00 | 66.66 bis 100.00 | 66.98 bis 100.00 |

**Über alle gemessenen Dateien:** Statements 88.55 · Branches 74.02 · Functions 90.75 · Lines 88.55

<!-- messwerte:ende -->

`pnpm quality:check` prüft die Übereinstimmung des Blocks mit `coverage/coverage-summary.json` (Prozentzahlen mit ±0,05 Toleranz: derselbe Commit schwankt zwischen Läufen um ein bis zwei Branches, nur `engine/src/store.ts` wackelte, drei Läufe 76.74 / 76.76 / 76.74); nach einem neuen Coverage-Lauf ist `pnpm quality:render` auszuführen und anschließend `pnpm quality:check`.

Coverage misst nur, was die Suite ausführt, und ist kein Vollständigkeitsbeweis für alle Fehlerpfade. `packages/editor/src/state/browser.ts` ist ausgenommen, da sie nur Re-Exports enthält.

## Bekannte Grenzen

- Der aktuelle Postgres-Lauf belegt sechs Transaktionsfälle auf PostgreSQL 18.6; die CI-Lane verwendet PostgreSQL 18 (`postgres:18` in `.github/workflows/verify.yml`).
- `pnpm test:visual`, `pnpm verify:parity` und `pnpm verify:import` sind für den zuvor gesicherten Folge-Diff am 28.09.2026 grün; sie wurden durch die reine Mapper-Auslagerung nicht berührt.
- Die Visual-Baselines liegen unter `packages/app/test/visual-baselines/`; Aktualisierung ist ein expliziter Vorgang über `UPDATE_VISUAL_SNAPSHOTS=1`.
- Das Import-Tor nutzt eine kontrollierte Fixture; nicht alle echten Export-Fixtures durchlaufen es vollständig.
- Paging ist in `packages/engine/src/paging.ts` für Sites, Seiten, Assets, Einträge, Referenzzuweisungen, Releases, Bake-Jobs und Image-Jobs eingebaut (`limit` Standard 50, Kappe 200, `offset` validiert). `outputSchema` tragen die 6 lesenden Listenwerkzeuge und seit PR #3 auch `create_site`, `create_page`, `create_preview`, `submit_for_review`, `publish_release`, `rollback_release`. Beleg: `paging.test.ts`, `write-output.test.ts`.
- GitHub Actions startet seit dem 07.10.2026 keine Jobs mehr („payments have failed or spending limit needs to be increased"); CI-Grün wird lokal ersetzt (Coverage-Lauf oben, gezielte Gates je Branch), bis die Abrechnung behoben ist.

## CI-Stand

`.github/workflows/verify.yml` enthält vier voneinander unabhängige Jobs. Trigger sind `pull_request` und `workflow_dispatch` (manuell); pro Push läuft nichts mehr, um Minuten zu sparen (07.10.2026). Der Workflow hat nur `contents: read`, die Actions sind auf Commits gepinnt, und ein neuer Push bricht veraltete Läufe ab.

**Job `verify`:** Installiert Chromium, führt `pnpm verify` (Build, Artefaktprüfung, Lint einschließlich `eslint.config.mjs`, Patch-Integrität, Tests), den Docs-Portal-Build als eigenen Schritt, `pnpm test:visual`, `pnpm verify:parity` und `pnpm verify:import` aus.

**Job `tests-windows`:** `pnpm test` unter Windows, mit TEMP/TMP auf dem Laufwerk des Repos (sonst scheitert Astros `rename()` mit EXDEV). Der Job ist seit dem 04.10.2026 blockierend (ohne `continue-on-error`).

**Job `postgres-tests`:** Postgres-18-Service mit `TEST_DATABASE_URL`, dann `pnpm test:postgres`; der Job wird rot, wenn die Variable fehlt, Tests übersprungen werden oder kein Fall läuft.

**Job `coverage`:** `pnpm test:coverage`, danach `pnpm quality:check` und Upload der JSON-Zusammenfassung.

Der Pull-Request-Lauf prüft den Merge mit dem **aktuellen** `master`. Bewegt sich `master` und ändert dabei die Coverage der geschützten Pfade, kann `pnpm quality:check` im Pull-Request-Lauf rot werden, obwohl der Push-Lauf desselben Commits grün ist. Dann `master` in den Zweig mergen, `pnpm test:coverage` und `pnpm quality:render` ausführen und den Block committen.

Offene CI-Verbesserungen aus P3-6 gibt es nicht mehr.

## Pflege-Regeln

- Testzahlen werden ausschließlich hier geführt, nicht in `stand.md`, `fahrplan.md` oder ADRs.
- Jede Aussage zu einem bestandenen Gate nennt Lauf und Zeitpunkt; historische Resultate sind ausdrücklich als historisch markiert.
- Nach jedem Gate-Lauf, der Zahlen ändert, wird dieses Dokument aktualisiert — nicht die anderen Current-Dokumente.
