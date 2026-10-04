# Qualitäts- und Gate-Stand

> Stand: **29.09.2026**. Die zuvor geprüfte Folgearbeit ist gesichert. Der aktuelle P3-2-Schritt ist eine reine Row-Mapper-Auslagerung; seine gezielten Gates sind ausgeführt. Frühere App-Gates sind mit ihrem tatsächlichen Datum gekennzeichnet.
> Aktueller Umsetzungsstand: `docs/current/stand.md`. Planung: `docs/fahrplan.md`.

## Aktuelle Gates

| Gate | Kommando | Ergebnis |
|---|---|---|
| P3-2: Typecheck, Lint, Volltest | `pnpm typecheck`, `pnpm lint`, `pnpm test` | **Grün am 29.09.2026** nach Store-Mapper-Auslagerung |
| P3-2: Coverage | `pnpm test:coverage` | **Grün am 29.09.2026**, keine Schwellenfehler; Messwerte siehe Coverage-Block |
| Patch-Prüfung | `git diff --check` | **Grün am 29.09.2026** |
| Doku-Messwerte | `pnpm quality:render` + `pnpm quality:check` | **Grün am 29.09.2026**; gerenderte Werte stimmen mit dem Lauf überein |
| Build, App-Gates und PostgreSQL | `pnpm verify`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres` | **Grün am 28.09.2026** auf dem zuvor gesicherten Folge-Diff; für die reine Mapper-Auslagerung nicht erneut erforderlich |
| Route-Matrix | `pnpm route-matrix` | Kommando nicht separat ausgeführt; `route-matrix.test.ts` ist Teil des Volltests |

## Volltest

`pnpm verify` lief am 28.09.2026 auf dem zuvor gesicherten Folge-Diff. Für den P3-2-Mapper-Schritt liefen am 29.09.2026 Typecheck, Lint und der vollständige Testbefehl separat; der reine Modulwechsel ändert keine Browser-, Build- oder Datenbankverträge.

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

Der aktuelle Lauf vom 29.09.2026: **1003 bestanden / 15 übersprungen / 0 fehlgeschlagen** in 103 Dateien, null Schwellenfehler. Die Übersicht unten wurde mit `pnpm quality:render` aktualisiert und anschließend durch `pnpm quality:check` bestätigt.

### Gemessene Coverage der geschützten Pfade

<!-- messwerte:anfang -->

<!-- Erzeugt von `scripts/render-quality.mjs` aus `coverage/coverage-summary.json`.
     Nicht von Hand editieren: dieser Block ist ein Messwert, und `pnpm quality:check`
     lässt den Lauf rot werden, sobald Dokument und Lauf auseinanderlaufen. -->

**Gemessen:** 2026-10-04 · vitest coverage (v8)

| Pfad | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `packages/engine/src/http.ts` | 91.29 | 73.06 | 93.63 | 91.29 |
| `packages/engine/src/store.ts` | 84.46 | 77.28 | 93.58 | 84.46 |
| `packages/engine/src/lifecycle.ts` | 87.01 | 74.19 | 100.00 | 87.01 |
| `packages/engine/src/forms.ts` | 84.25 | 73.62 | 100.00 | 84.25 |
| `packages/mcp/src/tools.ts` | 91.01 | 62.37 | 87.01 | 91.01 |
| `packages/editor/src/state/*` (14 Dateien) | 66.98 bis 100.00 | 56.75 bis 100.00 | 66.66 bis 100.00 | 66.98 bis 100.00 |

**Über alle gemessenen Dateien:** Statements 87.51 · Branches 73.35 · Functions 91.00 · Lines 87.51

<!-- messwerte:ende -->

`pnpm quality:check` prüft die Übereinstimmung des Blocks mit `coverage/coverage-summary.json` (Prozentzahlen mit ±0,05 Toleranz: derselbe Commit schwankt zwischen Läufen um ein bis zwei Branches, nur `engine/src/store.ts` wackelte, drei Läufe 76.74 / 76.76 / 76.74); nach einem neuen Coverage-Lauf ist `pnpm quality:render` auszuführen und anschließend `pnpm quality:check`.

Coverage misst nur, was die Suite ausführt, und ist kein Vollständigkeitsbeweis für alle Fehlerpfade. `packages/editor/src/state/browser.ts` ist ausgenommen, da sie nur Re-Exports enthält.

## Bekannte Grenzen

- Der aktuelle Postgres-Lauf belegt sechs Transaktionsfälle auf PostgreSQL 18.6; die CI-Lane verwendet PostgreSQL 16.
- `pnpm test:visual`, `pnpm verify:parity` und `pnpm verify:import` sind für den zuvor gesicherten Folge-Diff am 28.09.2026 grün; sie wurden durch die reine Mapper-Auslagerung nicht berührt.
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
