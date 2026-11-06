# Qualitäts- und Gate-Stand

> Stand: **05.11.2026**. Der Volltest und die Coverage beziehen sich auf die unten benannten Messläufe; spätere Änderungen werden gesondert genannt.
> Aktueller Umsetzungsstand: `docs/current/stand.md`. Planung: `docs/fahrplan.md`.

## Aktuelle Gates

| Gate | Kommando | Ergebnis und Umfang |
|---|---|---|
| Gemeinsame Delete/Restore-History, In-Memory-Vertrag | `pnpm exec vitest run packages/engine/test/style-rules.test.ts packages/engine/test/backup-restore.test.ts packages/engine/test/theme-variable-deletion.test.ts packages/engine/test/db-schema.test.ts packages/engine/test/theme-variable-rename.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 70 bestanden in 5 Dateien, 18 erwartete PostgreSQL-Skips. Nach der gezielt rot/grün geprüften Legacy-Fixture-Korrektur: Die neuen Klassenbelegspalten werden vor `DROP COLUMN` auf SQL-`NULL` gesetzt, damit `pg-mem` beim Wiederanlegen keinen früheren Inhalt reaktiviert; Null-Assertion nach Migration auch auf PostgreSQL geprüft. Kein produktiver Backend-Fix aus diesem Befund. Enthält den neuen Rename-Belegfall (nur Regel-`updatedAt` ausgenommen). Typecheck und Lint nach dem jüngsten Startup-/Storage-/Recovery-, Fixture- und Rename-Diff grün. Der vollständige PostgreSQL-Nachlauf und der App-/History-Gate sind danach grün (folgende Zeilen). |
| Gemeinsame Delete/Restore-History und Umbenennungs-History, App und Editor | `pnpm exec vitest run packages/app/test/variable-history.test.ts packages/app/test/variable-history-browser.test.ts packages/app/test/variables-editor-browser.test.ts packages/app/test/class-editor-browser.test.ts packages/app/test/save-conflict-browser.test.ts packages/app/test/canvas-browser.test.ts packages/app/test/canvas-history-browser.test.ts packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts packages/editor/test/state/external-history.test.ts packages/editor/test/state/history-checkpoint.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 277 bestanden in 13 Dateien, keine Skips. Abgenommen: echte Variablen-/Klassen-/Konflikt-/Canvas-Browserpfade, Session-/Store-/Pipeline-Observer-Recovery, gemischte History, Reload und Unknown-Sperren. Der Klassen-Browsertest deckte eine Order-Divergenz zwischen lokaler Seiten-Teilmenge und vollständiger Site-Registry auf; `reconcileStyleRuleOrder` und `reconcileStyleRuleOrderShift` spiegeln Server-Reorder und Delete/Restore-Positionen, neue Pipeline- und Store-Regressionen sichern beide Pfade. 09a erhält die History über eine bestätigte Umbenennung und migriert strukturierte `$token`/`$ref`-Verweise in Forward- und Undo-Patches; CSS-Textverweise verwerfen die History bewusst. Ein echter Browserfall prüft Undo und Redo nach Umbenennung. Der atomare Pipeline-Pfad für dokumentändernde externe Bestätigungen ist mit zwei Tests abgesichert (Dokument, Eintrag und alle Versionen gemeinsam); 09b bindet die Umbenennung als eigenen Eintrag an, inklusive Undo/Redo mit `undoOf`, Reload/Retry und atomarer Registry-Recovery. Der Legacy-Rename-Browsertest prüft den bestätigten Retry. Temporäre Debug-Instrumentierung entfernt. `pnpm typecheck` und `pnpm lint` grün. Der vollständige `pnpm verify` nach diesem Diff ist grün (2094 bestanden, 36 übersprungen, 0 fehlgeschlagen). |
| Gemeinsame Delete/Restore-History, PostgreSQL-Vertrag | `TEST_DATABASE_URL=… pnpm exec vitest run packages/engine/test/style-rules.test.ts packages/engine/test/backup-restore.test.ts packages/engine/test/theme-variable-deletion.test.ts packages/engine/test/db-schema.test.ts packages/engine/test/theme-variable-rename.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 88 bestanden in 5 Dateien, keine Skips, gegen den isolierten PostgreSQL-18.6-Cluster. Abgenommen: Klassen-Restore nach vollständig zurückgenommenen Variablenschritten, rohe Registry und vollständige Page-Inhalte/Metadaten/Identität, aktuelle Request-Basis, gespeicherte Restore-Ergebnisse, Altbelege, additive Migration, Backup, parallele Page-/Registry-/Theme-Writes, Rollback sowie neue und alte Rename-Registry-Belege. Der vorherige Rename-Rollback-Timeout trat bei gleichzeitiger Graphify-Last auf; der vollständige unveränderte Nachlauf ohne diese Last ist grün, keine Assertions oder Zeitlimits gelockert. Kein vollständiger PostgreSQL-Lane-, Gesamt-, Coverage-, Visual-, Parity- oder Importlauf. Nach dem 09b-Diff wurde derselbe Vertrag unverändert erneut grün ausgeführt: 88 bestanden, 0 Skips (isolierter Cluster auf Port 55486, danach gestoppt). |
| Rückwärtsverträgliche Registry-Inhaltsbelege für Rename | `pnpm exec vitest run packages/engine/test/theme-variable-rename.test.ts packages/engine/test/backup-restore.test.ts --no-file-parallelism` sowie derselbe Befehl mit `TEST_DATABASE_URL` | **Grün am 05.11.2026** in den kombinierten Engine-Läufen (70 bestanden/18 Skips in Memory, 88 bestanden/0 Skips auf PostgreSQL). Der rot/grün geprüfte Fall deckt neue Belege mit Kennzeichnung `raw-registry-updatedAt-excluded` (nur Regel-`updatedAt` unerheblich), alte Belege ohne Kennzeichnung (vollständiger Hash bleibt Pflicht) und unbekannte Kennzeichnung (keine Inhaltsausnahme) ab. Backup/Restore erhält Kennzeichnung und 64-stelligen Registry-Hash. Variablen-Browsertest 10 bestanden, `pnpm typecheck` und `pnpm lint` grün. Kein neuer Gesamt-, Coverage-, Visual-, Parity- oder Importlauf. |
| Geprüfte History-Checkpoints, Library | `pnpm exec vitest run packages/editor/test/state/history-checkpoint.test.ts packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts packages/editor/test/state/external-history.test.ts packages/app/test/canvas-history-browser.test.ts packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 161 bestanden in 9 Dateien, keine Skips, vollständiger vereinbarter Lauf nach dem letzten Testdiff. Abgenommen: Context-/Versionsbindung, bestätigte gemischte Einträge und Cursor, Copy-Ownership, Import ohne Save oder Dokument-Write, alle Patch-Arten über jede Cursorposition, malformed Daten und geerbte Referenzen, Coalesce und eindeutige IDs. Sicherheits-/Metadatenregressionen zuvor rot; `pnpm typecheck`, `pnpm lint` und Graphify AST-Update danach ausgeführt. Nur Library-Checkpoint, keine neue echte App-Variablen-History-Abnahme und kein neuer Gesamt-, Coverage-, Visual-, Parity-, Import- oder PostgreSQL-Lauf. |
| Serverbestätigte History, Canvas | `pnpm exec vitest run packages/editor/test/state/external-history.test.ts packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts packages/app/test/canvas-history-browser.test.ts packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 122 bestanden in 8 Dateien, keine Skips, vollständiger vereinbarter Lauf nach der letzten Statuskorrektur. Abgenommen: Toolbar, äußere/Frame-Shortcuts, Async-/synchrones API, Pipeline-/Runner-Sperren, Unknown/Retry, Eingabe-Race, Session-/Store-Mismatch und Destroy. `pnpm typecheck` und `pnpm lint` grün; Graphify AST-Update ausgeführt. Kontrollierte Canvas-Runner ersetzen keinen echten Delete/Restore-App-History-Gate; kein neuer Gesamt-, Coverage-, Visual-, Parity-, Import- oder PostgreSQL-Lauf in dieser Scheibe. |
| Delete/Restore-History-Vertrag, Backend | `TEST_DATABASE_URL=… pnpm exec vitest run packages/engine/test/theme-variable-deletion.test.ts packages/engine/test/theme-variable-rename.test.ts packages/engine/test/backup-restore.test.ts packages/engine/test/db-schema.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 47 bestanden in 4 Dateien, keine Skips, gegen isoliertes PostgreSQL 18.6 nach der rot/grünen Rohregistry-Regression. Abgenommen: aktuelle Request-Basis, vollständig zurückgenommene Page-/Registry-/Theme-Änderungen, Legacy/Migration, Backup, konkurrierende Writes, paralleles identisches Restore und Rollback bei Beleg-/Auditfehler. In-Memory-/SQL-Gate derselben Delete-/Backup-Dateien plus `dialect-gate.test.ts`: 24 bestanden, 7 erwartete PostgreSQL-Skips in 3 Dateien. Bestehender Variablen-Browser-Gate: 10 bestanden. `pnpm typecheck` und `pnpm lint` nach dem letzten Code-/Testdiff grün. Kein neuer Gesamt-, Coverage-, Visual-, Parity-, Import- oder vollständiger PostgreSQL-Lane-Lauf. |
| Serverbestätigte History, Library | `pnpm exec vitest run packages/editor/test/state/external-history.test.ts packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 117 bestanden in 7 Dateien nach rot/grünen Regressionen für atomare Beobachterbestätigung, ungültige Antworten, Ownership/Recovery und Registry-Belege. `pnpm typecheck`, `pnpm lint`, `pnpm quality:check` und `git diff --check` grün. App-/Canvas-Runner noch nicht angebunden; kein neuer Voll-, Coverage-, PostgreSQL-, Visual-, Parity- oder Importlauf für diese Scheibe. |
| History-Sperrerhalt | `pnpm exec vitest run packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 91 bestanden in 6 Dateien nach den Unknown-/Reload-/Dokumentwechsel- und Storage-Retry-Korrekturen. Storage-Retry-Regression vorher gezielt rot. `pnpm typecheck` und `pnpm lint` danach grün. Kein Backend-Vertrag geändert; kein neuer Voll-, Coverage-, PostgreSQL- oder Paritätslauf. |
| Externe History, Vorbereitung | `pnpm exec vitest run packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 89 bestanden in 6 Dateien. Danach Browser-Storage-Typisierung und eine Session-/Pipeline-Regression ergänzt: vier vollständige History-/State-Dateien erneut grün (79 bestanden), Retry-/Dialog-Browserfall erneut grün (gefilterter Lauf: 12 bestanden, 77 gezielt nicht ausgewählt). `pnpm typecheck` und `pnpm lint` danach grün. Kein neuer Voll-, Coverage-, PostgreSQL- oder Paritätslauf für diesen Diff. |
| Build, Typprüfung, Lint und Volltest | `pnpm verify` | **Grün am 06.11.2026 nach dem Selektorlisten-Diff**: Build, Typecheck, `verify:dist`, Lint, Patch-Gate und vollständige Tests. 2103 bestanden, 36 übersprungen, 0 fehlgeschlagen in 220 Testdateien (217 bestanden, 3 mit erwarteten Skips). Ein früherer Lauf war einmal durch einen ephemeren Port in der Fetch-Sperrliste rot (`redesign-cards-browser`); derselbe Test war isoliert grün. |
| Editor-Konfliktauflösung | `pnpm exec vitest run packages/app/test/variables-editor-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026** für die nachfolgenden UI-Änderungen, einschließlich Antwortverlust, konkurrierender Eingaben und Undo/Redo nach Neuladen. Anschließende Fixes der Pipeline und des Konflikt-Neuladens wurden mit Pipeline- und Browser-Tests geprüft. |
| Visueller Editor-Gate | `pnpm test:visual` | **Grün am 06.11.2026 nach dem Framer-Browser-Import-Diff**: 1 Browsertest, Desktop-Baselines bei 1440/1024 px stabil. Die Baselines decken nicht alle Variablenzustände ab. |
| Coverage | `pnpm test:coverage` | **Grün am 06.11.2026 nach dem Sitemap-Manifest-Diff**: 1229 bestanden, 36 übersprungen, 0 fehlgeschlagen in 112 Dateien, keine Schwellenfehler. Messwerte siehe Coverage-Block. |
| PostgreSQL-Lane | `TEST_DATABASE_URL=… pnpm test:postgres` | **Grün am 06.11.2026 nach dem Framer-Browser-Import-Diff** gegen den isolierten PostgreSQL-18.6-Cluster (Port 55486): 6 Fälle in 2 Dateien, 0 übersprungen. Deckt Transaktions- und Redesign-Apply-Atomarität ab; der Cluster wurde danach gestoppt. |
| PostgreSQL, gezielt | `TEST_DATABASE_URL=… pnpm exec vitest run packages/engine/test/theme-variable-rename.test.ts packages/engine/test/backup-restore.test.ts --no-file-parallelism` | **Grün am 05.11.2026** gegen einen isolierten PostgreSQL-18.6-Cluster für Umbenennung, Undo, Migration, Konkurrenz und Rollback. Der Schutz reservierter Namen wurde danach gezielt in der In-Memory-Suite geprüft. |
| Doku-Messwerte | `pnpm quality:render` und `pnpm quality:check` | **Grün am 06.11.2026**; der erzeugte Coverage-Block stimmt mit dem Messlauf überein. |
| Parity und Import, separat | `pnpm verify:parity`, `pnpm verify:import` | **Grün am 06.11.2026 nach dem Framer-Browser-Import-Diff**: `verify:parity` 1 Cutover-Browsertest (Kopf 0, Sektion ≈0,000006); `verify:import` 1 Import-Browsertest (Desktop/Tablet/Mobil Ratio 0, absichtliche Degradation wird rot erkannt). |
| Framer-Echtabnahme (Relay) | `senify export framer`, `senify prepare framer`, `senify import framer … --browser`, `senify import framer-site … --source-url` | **Teilweise am 06.11.2026**: Unframer 5 Seiten/15 Komponenten/1 CMS-Collection (6 Einträge); Mirror 51,6 MB, 24 Assets/43 Fonts, 0 Fehler. Sechs gespiegelte Routen in ein isoliertes Projekt geschrieben (Startseite 2166 Knoten/Score 59; Contact 334/57; Blog-Index 324/76; drei Beiträge 232/73, 208/78, 204/79), 0 Assetfehler. Das Sitemap-Manifest erkennt alle 10 veröffentlichten Routen; `/404` und die drei im Mirror fehlenden CMS-Routen sind im Browser mit 0 Blockern erfasst (186/208/206/217 Knoten). Der Schreiblauf dieser vier Routen ist durch den lokalen PostgreSQL-Ausfall blockiert (`0xC0000142`/Shared-Memory-Fehler 487). Pseudo-Zustände werden für die vier Engine-Zustände als Rule-`states` vorbereitet (6 auf Contact ausgewertet, 1 angewendet; 66 Pseudo-Element-/Selektorlisten-/Attributstellen offen); der Browser-Capture liest zusätzlich verlinkte Stylesheets über die CSSOM, und Hover-Media-/Selektorlisten-Regeln werden ausgewertet. Fonts, Motion, `runtimeFreeVerified` und der visuelle/zeitliche Original-gegen-Build-Vergleich bleiben offen. Kein CI-Gate; externe Site und Zugang erforderlich. Beleg: `.scratch/framer/acceptance-gracious-2026-11-06.md`. |
| Framer-Pseudo-Zustände und verlinkte Styles | `pnpm exec vitest run packages/framer-import/test --no-file-parallelism` | **Grün am 06.11.2026**: 150 Framer-Import-Tests, darunter neue Fälle für die vier Engine-Zustände, das Hover-Mapping in Style-Rules, Selektorlisten, Hover-Media-Gates und CSSOM-verlinkte Stylesheets. Die echte Contact-Seite wertet 6 Zustandsregeln aus und wendet 1 an; 66 Pseudo-Element-/Selektorlisten-/Attributstellen bleiben offen. |
| Elementor-V4-Referenz (Core 4.3.6) | manuell: `data/elementor-v4-reference/start.ps1` und Playwright/Chromium bei 1440 × 900 | **Aufgenommen am 06.11.2026, kein Paritäts-Gate**: Leerer Editor, Atomic Elements, Design System Defaults/Variables/Classes (leer), Class-Manager-Einführung, Structure, Heading Content/Style/Advanced mit Normal/Hover, History, Page Settings, Tablet/Mobil. Ein Heading wurde per Drag-and-drop eingefügt, veröffentlicht und nach Neuladen sowie auf der Frontend-Seite bestätigt. 15 Belege unter `docs/research/elementor-captures-2026-11-06/`. Core-only; Anlegeabläufe, klassische Widgets, Pro-Parität und der Live-Vergleich mit Senify bleiben offen. |

## Volltest

Der Checkpoint-Abschlussgate vom 05.11.2026 enthält außerdem `pnpm quality:check` und `git diff --check` nach dem Dokumentationsabgleich. Der Scope endet vor App-Persistenz, Belegen, Runnern und Unknown-Recovery.

Der Canvas-Abschlussgate vom 05.11.2026 umfasst außerdem `pnpm quality:check` und `git diff --check` nach dem Dokumentationsabgleich. Die Library- und Backend-Läufe unten bleiben getrennte frühere Abnahmen, keine Aussage über bereits integrierte App-Variablen-Runner.

Der Abschluss-Gate der Backend-Delete/Restore-Scheibe vom 05.11.2026 umfasst außerdem grüne Läufe von `pnpm quality:check` und `git diff --check` nach dem Dokumentationsabgleich. Das Graphify-Update ist AST-only und kein Produkt- oder Paritätsnachweis.

Der letzte vollständige Lauf `pnpm verify` vom 06.11.2026 lief nach dem Selektorlisten-Diff und umfasst Build, Typecheck, `verify:dist`, Lint, Patch-Gate und die vollständige Testsuite. Die Tabelle ist der Messstand dieses Volltests. Ein früherer Lauf war einmal an einem ephemeren Port in der Fetch-Sperrliste rot; derselbe Browsertest war isoliert grün.

| Kategorie | Anzahl | Bedeutung |
|---|---:|---|
| Tests gesamt | 2139 | inklusive Skip-Fälle |
| bestanden | 2103 | Volltest vom 06.11.2026 nach dem Selektorlisten-Diff |
| übersprungen | 36 | unter anderem PostgreSQL-Fälle ohne Testdatenbank und UI-Vorschau-Paritätsfälle |
| fehlgeschlagen | 0 | gemessener Volltest |
| Testdateien | 220 | 217 bestanden, 3 mit erwarteten Skips |

Die PostgreSQL-Gates für die betroffenen Transaktionspfade liefen separat gegen eigens initialisierte lokale Cluster; der bereits laufende Systemdienst wurde nicht verändert. Der frühere Rename-Cluster wurde gestoppt. Der isolierte Delete/Restore-Cluster wurde für die gezielten Engine-Abnahmen und die PostgreSQL-Lane verwendet und danach gezielt gestoppt.

## Coverage-Gate (letzter Messlauf)

Geführt über `pnpm test:coverage`, v8-Provider und `perFile: true`. Der Lauf umfasst `engine`, `editor` und `mcp`, nicht die schweren Browser-Suiten. Die Schwellen liegen in `vitest.config.ts`.

Der Lauf vom 06.11.2026 meldete **1229 bestanden / 36 übersprungen / 0 fehlgeschlagen** in 112 Dateien und keine Schwellenfehler. Die Übersicht unten wurde aus derselben Messung gerendert und mit `pnpm quality:check` geprüft.

### Gemessene Coverage der geschützten Pfade

<!-- messwerte:anfang -->

<!-- Erzeugt von `scripts/render-quality.mjs` aus `coverage/coverage-summary.json`.
     Nicht von Hand editieren: dieser Block ist ein Messwert, und `pnpm quality:check`
     lässt den Lauf rot werden, sobald Dokument und Lauf auseinanderlaufen. -->

**Gemessen:** 2026-11-06 · vitest coverage (v8)

| Pfad | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `packages/engine/src/http.ts` | 90.85 | 72.62 | 92.47 | 90.85 |
| `packages/engine/src/store.ts` | 85.92 | 79.07 | 93.61 | 85.92 |
| `packages/engine/src/lifecycle.ts` | 87.01 | 74.19 | 100.00 | 87.01 |
| `packages/engine/src/forms.ts` | 84.09 | 73.60 | 100.00 | 84.09 |
| `packages/mcp/src/tools.ts` | 91.81 | 61.10 | 85.06 | 91.81 |
| `packages/editor/src/state/*` (16 Dateien) | 66.98 bis 100.00 | 56.75 bis 100.00 | 66.66 bis 100.00 | 66.98 bis 100.00 |

**Über alle gemessenen Dateien:** Statements 88.51 · Branches 75.84 · Functions 90.94 · Lines 88.51

<!-- messwerte:ende -->

`pnpm quality:check` prüft die Übereinstimmung des Blocks mit `coverage/coverage-summary.json` (Prozentzahlen mit ±0,05 Toleranz: derselbe Commit schwankt zwischen Läufen um ein bis zwei Branches, nur `engine/src/store.ts` wackelte, drei Läufe 76.74 / 76.76 / 76.74); nach einem neuen Coverage-Lauf ist `pnpm quality:render` auszuführen und anschließend `pnpm quality:check`.

Coverage misst nur, was die Suite ausführt, und ist kein Vollständigkeitsbeweis für alle Fehlerpfade. `packages/editor/src/state/browser.ts` ist ausgenommen, da sie nur Re-Exports enthält.

## Bekannte Grenzen

- Die PostgreSQL-Lane (6 Fälle) und die gezielten Engine-Abnahmen liefen am 05.11.2026 gegen isoliertes PostgreSQL 18.6 grün. Die CI-Lane verwendet PostgreSQL 16; ein Lauf gegen diese Version ist lokal nicht belegt.
- Der separate Parity- und Import-Gate lief am 05.11.2026 nach dem Slice-08-Diff erneut grün. Beide Tore bleiben kontrollierte Browser-/Fixture-Abnahmen und kein Beweis vollständiger Elementor-/Framer-Parität.
- Die Visual-Baselines liegen unter `packages/app/test/visual-baselines/`; Aktualisierung ist ein expliziter Vorgang über `UPDATE_VISUAL_SNAPSHOTS=1`.
- Das Import-Tor nutzt eine kontrollierte Fixture; nicht alle echten Export-Fixtures durchlaufen es vollständig.
- Paging ist in `packages/engine/src/paging.ts` für Sites, Seiten, Assets, Einträge, Referenzzuweisungen, Releases, Bake-Jobs und Image-Jobs eingebaut (`limit` Standard 50, Kappe 200, `offset` validiert). `outputSchema` tragen weiterhin nur die lesenden Werkzeuge; die Schreibwerkzeuge sind bewusst zurückgestellt. Beleg: `paging.test.ts` (9 Fälle).

## CI-Stand

`.github/workflows/verify.yml` enthält drei voneinander unabhängige Jobs:

**Job `verify`:** Installiert Chromium, führt `pnpm verify` (Build, Artefaktprüfung, Lint, Patch-Integrität, Tests), `pnpm test:visual`, `pnpm verify:parity` und `pnpm verify:import` aus.

**Job `postgres-tests`:** Postgres-16-Service mit `TEST_DATABASE_URL`, dann `pnpm test:postgres`; der Job wird rot, wenn die Variable fehlt, Tests übersprungen werden oder kein Fall läuft.

**Job `coverage`:** `pnpm test:coverage`, danach `pnpm quality:check` und Upload der JSON-Zusammenfassung.

Offene CI-Verbesserungen: Docs-Portal-Build als eigener sichtbarer Schritt (aktuell durch rekursives `pnpm build` enthalten) und Linting der Root-Konfiguration `eslint.config.mjs`.

## Pflege-Regeln

- Testzahlen werden ausschließlich hier geführt, nicht in `stand.md`, `fahrplan.md` oder ADRs.
- Jede Aussage zu einem bestandenen Gate nennt Lauf und Zeitpunkt; historische Resultate sind ausdrücklich als historisch markiert.
- Nach jedem Gate-Lauf, der Zahlen ändert, wird dieses Dokument aktualisiert — nicht die anderen Current-Dokumente.
