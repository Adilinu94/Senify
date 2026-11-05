# Qualitäts- und Gate-Stand

> Stand: **05.11.2026**. Der Volltest und die Coverage beziehen sich auf die unten benannten Messläufe; spätere Änderungen werden gesondert genannt.
> Aktueller Umsetzungsstand: `docs/current/stand.md`. Planung: `docs/fahrplan.md`.

## Aktuelle Gates

| Gate | Kommando | Ergebnis und Umfang |
|---|---|---|
| History-Sperrerhalt | `pnpm exec vitest run packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 91 bestanden in 6 Dateien nach den Unknown-/Reload-/Dokumentwechsel- und Storage-Retry-Korrekturen. Storage-Retry-Regression vorher gezielt rot. `pnpm typecheck` und `pnpm lint` danach grün. Kein Backend-Vertrag geändert; kein neuer Voll-, Coverage-, PostgreSQL- oder Paritätslauf. |
| Externe History, Vorbereitung | `pnpm exec vitest run packages/editor/test/history.test.ts packages/editor/test/state/store.test.ts packages/editor/test/state/persist.test.ts packages/editor/test/state/session.test.ts packages/app/test/variables-editor-browser.test.ts packages/app/test/canvas-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026**, 89 bestanden in 6 Dateien. Danach Browser-Storage-Typisierung und eine Session-/Pipeline-Regression ergänzt: vier vollständige History-/State-Dateien erneut grün (79 bestanden), Retry-/Dialog-Browserfall erneut grün (gefilterter Lauf: 12 bestanden, 77 gezielt nicht ausgewählt). `pnpm typecheck` und `pnpm lint` danach grün. Kein neuer Voll-, Coverage-, PostgreSQL- oder Paritätslauf für diesen Diff. |
| Build, Typprüfung, Lint und Volltest | `pnpm verify` | **Grün am 05.11.2026** für die Undo-Umsetzung; danach folgten der gezielte Schutz reservierter Namen und die UI-Konfliktauflösung. |
| Editor-Konfliktauflösung | `pnpm exec vitest run packages/app/test/variables-editor-browser.test.ts --no-file-parallelism` | **Grün am 05.11.2026** für die nachfolgenden UI-Änderungen, einschließlich Antwortverlust, konkurrierender Eingaben und Undo/Redo nach Neuladen. Anschließende Fixes der Pipeline und des Konflikt-Neuladens wurden mit Pipeline- und Browser-Tests geprüft. |
| Visueller Editor-Gate | `pnpm test:visual` | **Grün am 05.11.2026** nach den UI-Änderungen; die Desktop-Baselines decken nicht alle Variablenzustände ab. |
| Coverage | `pnpm test:coverage` | **Grün am 05.11.2026** nach dem Schutz reservierter Namen; Messwerte siehe Coverage-Block. Die spätere UI-Änderung und der anschließende Pipeline-Fix sind in diesem Lauf nicht enthalten. |
| PostgreSQL, gezielt | `TEST_DATABASE_URL=… pnpm exec vitest run packages/engine/test/theme-variable-rename.test.ts packages/engine/test/backup-restore.test.ts --no-file-parallelism` | **Grün am 05.11.2026** gegen einen isolierten PostgreSQL-18.6-Cluster für Umbenennung, Undo, Migration, Konkurrenz und Rollback. Der Schutz reservierter Namen wurde danach gezielt in der In-Memory-Suite geprüft. |
| Doku-Messwerte | `pnpm quality:render` und `pnpm quality:check` | **Grün am 05.11.2026**; der erzeugte Coverage-Block stimmt mit dem Messlauf überein. |
| Parity und Import, separat | `pnpm verify:parity`, `pnpm verify:import` | Der hier zuvor dokumentierte separate Lauf vom 28.09.2026 ist historisch; für den aktuellen Editorstand wird daraus kein neuer Gate-Status abgeleitet. |

## Volltest

Der letzte vollständige Lauf `pnpm verify` vom 05.11.2026 wurde vor dem nachträglichen Schutz reservierter Namen, der UI-Konfliktauflösung und dem Pipeline-Fix ausgeführt. Diese Änderungen wurden anschließend gezielt getestet; die Tabelle ist der Messstand dieses Volltests und keine Behauptung über einen späteren vollständigen Lauf.

| Kategorie | Anzahl | Bedeutung |
|---|---:|---|
| Tests gesamt | 1902 | inklusive Skip-Fälle |
| bestanden | 1874 | Volltest vom 05.11.2026 |
| übersprungen | 28 | unter anderem PostgreSQL-Fälle ohne Testdatenbank und UI-Vorschau-Paritätsfälle |
| fehlgeschlagen | 0 | gemessener Volltest |
| Testdateien | 214 | 211 bestanden, 3 mit erwarteten Skips |

Der PostgreSQL-Gate für die betroffenen Transaktionspfade lief separat gegen einen eigens initialisierten lokalen Cluster; der bereits laufende Systemdienst wurde nicht verändert. Der Testcluster wurde gestoppt.

## Coverage-Gate (letzter Messlauf)

Geführt über `pnpm test:coverage`, v8-Provider und `perFile: true`. Der Lauf umfasst `engine`, `editor` und `mcp`, nicht die schweren Browser-Suiten. Die Schwellen liegen in `vitest.config.ts`.

Der Lauf vom 05.11.2026 meldete **1083 bestanden / 28 übersprungen / 0 fehlgeschlagen** in 110 Dateien und keine Schwellenfehler. Die Übersicht unten wurde aus derselben Messung gerendert und mit `pnpm quality:check` geprüft.

### Gemessene Coverage der geschützten Pfade

<!-- messwerte:anfang -->

<!-- Erzeugt von `scripts/render-quality.mjs` aus `coverage/coverage-summary.json`.
     Nicht von Hand editieren: dieser Block ist ein Messwert, und `pnpm quality:check`
     lässt den Lauf rot werden, sobald Dokument und Lauf auseinanderlaufen. -->

**Gemessen:** 2026-11-05 · vitest coverage (v8)

| Pfad | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `packages/engine/src/http.ts` | 90.85 | 72.62 | 92.47 | 90.85 |
| `packages/engine/src/store.ts` | 85.40 | 77.25 | 93.51 | 85.40 |
| `packages/engine/src/lifecycle.ts` | 87.01 | 74.19 | 100.00 | 87.01 |
| `packages/engine/src/forms.ts` | 84.09 | 73.60 | 100.00 | 84.09 |
| `packages/mcp/src/tools.ts` | 91.84 | 61.10 | 85.06 | 91.84 |
| `packages/editor/src/state/*` (14 Dateien) | 66.98 bis 100.00 | 56.75 bis 100.00 | 66.66 bis 100.00 | 66.98 bis 100.00 |

**Über alle gemessenen Dateien:** Statements 87.95 · Branches 73.89 · Functions 90.21 · Lines 87.95

<!-- messwerte:ende -->

`pnpm quality:check` prüft die Übereinstimmung des Blocks mit `coverage/coverage-summary.json` (Prozentzahlen mit ±0,05 Toleranz: derselbe Commit schwankt zwischen Läufen um ein bis zwei Branches, nur `engine/src/store.ts` wackelte, drei Läufe 76.74 / 76.76 / 76.74); nach einem neuen Coverage-Lauf ist `pnpm quality:render` auszuführen und anschließend `pnpm quality:check`.

Coverage misst nur, was die Suite ausführt, und ist kein Vollständigkeitsbeweis für alle Fehlerpfade. `packages/editor/src/state/browser.ts` ist ausgenommen, da sie nur Re-Exports enthält.

## Bekannte Grenzen

- Die gezielten PostgreSQL-Tests vom 05.11.2026 decken die oben genannten Umbenennungs- und Backup-Pfade ab; sie ersetzen keinen erneuten vollständigen PostgreSQL-Gate. Die CI-Lane verwendet PostgreSQL 16.
- Der separate Parity- und Import-Gate wurde für die nachfolgenden Editoränderungen nicht erneut nachgewiesen.
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
