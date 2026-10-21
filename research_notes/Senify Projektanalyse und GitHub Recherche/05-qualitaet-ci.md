# Fachanalyse 5 — Qualität, Coverage-Tor, CI

**Basis:** `master` `5ac1a84` (19.10.2026). Geprüfte Dateien: `vitest.config.ts`,
`.github/workflows/verify.yml`, `package.json`, `.gitignore`, `packages/core/test/net.test.ts`,
`packages/manifest/package.json`, `scripts/render-manifest.mjs`.

---

## 1 — Der Testlauf dieser Untersuchung

### Erster Lauf (`pnpm test`, `TEMP` auf `C:`, Repository auf `G:`)

```
Test Files  40 failed | 232 passed | 3 skipped (275)
     Tests  111 failed | 2318 passed | 29 skipped (2458)
  Duration  483.91s
```

Ursache aller Fehlschläge: `EXDEV: cross-device link not permitted` beim Astro-Build
(siehe Fachanalyse 3, B2). Kein Codebefund.

### Gegenprobe (eine Datei, TEMP auf demselben Laufwerk)

```
$env:TEMP="G:\AI Agentur\Senify\node_modules\.cache\review-tmp"
$env:TMP=$env:TEMP
pnpm exec vitest run packages/renderer/test/widget-bake.test.ts
  ✓ packages/renderer/test/widget-bake.test.ts (2 tests) 44824ms
  Test Files  1 passed (1)   Tests  2 passed (2)
```

### Zweiter Lauf (`pnpm test`, TEMP auf `G:`)

Ergebnis siehe Abschnitt 6. Die verbleibenden Fehlschläge sind **Zeitüberschreitungen** unter
Last, nicht Funktionsfehler — das Muster ist in `docs/current/qualitaet.md` mehrfach dokumentiert
(„Das Fenster war die Last mehrerer paralleler Agent-Sessions auf derselben Maschine“, Zeile 92).

**Für die Bewertung wichtig:** Der erste Lauf ist der Grund, warum ein lokaler Volltest auf dieser
Maschine **nicht** als Beleg taugt, solange `TEMP` nicht auf das Repo-Laufwerk zeigt. Ohne diese
Kenntnis hätte man 111 rote Tests als Befund gemeldet.

---

## 2 — Der Coverage-Tor misst nicht mehr die Logik, die er schützen soll (Schwere: hoch)

`vitest.config.ts:61-104`:

```
include: [
  "packages/engine/src/http.ts",
  "packages/engine/src/store.ts",
  "packages/engine/src/lifecycle.ts",
  "packages/engine/src/forms.ts",
  "packages/editor/src/state/**",
  "packages/mcp/src/tools.ts",
],
```

Die Schwellen (`perFile: true`) gelten für genau diese Pfade.

**Die ausgelagerten Module stehen nicht darin.** ADR-0019 hat den Store inzwischen in 29
Fachmodule zerlegt; `http.ts` hat zwei, `mcp/src/tools.ts` zwei. Gemessen wird:

| Datei | Zeilen | im Tor? |
|---|---:|---|
| `store.ts` (die Fassade) | 3593 | ja |
| `http.ts` (Dispatcher + Routen) | 5220 | ja |
| **`store-style-rules.ts`** (die komplette Registry inkl. optimistischem Lock) | 719 | **nein** |
| **`store-references.ts`** | 575 | **nein** |
| **`store-assets.ts`** | 354 | **nein** |
| **`store-entries.ts`** | 366 | **nein** |
| **`store-settings.ts`** | 345 | **nein** |
| **`store-job-mappers.ts`** | 164 | **nein** |
| **`store-record-mappers.ts`** | 334 | **nein** |
| **`http-build-files.ts`** | 279 | **nein** |
| **`http-response.ts`** | 220 | **nein** |
| **`tools-support.ts`** | 269 | **nein** |
| **`tools-components.ts`** | 105 | **nein** |
| **Summe der 34 nicht gemessenen Module** | **7344** | — |

**Die Bilanz:** Das Tor misst 8 813 Zeilen Fassade und HTTP-Routing. Es misst **nicht** die 7 344
Zeilen, in denen der eigentliche Store- und Werkzeugcode today liegt. Der Kommentar in
`vitest.config.ts:46-54` beschreibt noch die alte Absicht:

> Bewusst NUR die Pfade, in denen Fehler am teuersten sind: HTTP-Dispatcher, Store, Lebenszyklus,
> Formulare, Editor-Zustand und die MCP-Werkzeuge.

Die Absicht gilt — aber der **Ort** des Stores hat sich geändert, und die Liste ist ihm nicht
gefolgt. Genau das ist die Art der Lücke, die ADR-0019 ausdrücklich nicht abdecken konnte: Der
Schnitt war „mechanisch, jede Zeile steht unverändert im neuen Modul“ — und mechanisch heißt: auch
ohne neues Testverhalten.

**Warum es nicht auffiel.** Die Schwellen sind gesetzt, und `pnpm test:coverage` ist grün — es
misst nur weniger, als der Name verspricht. `docs/current/qualitaet.md` nennt die Zahlen je Datei;
ein Ausfall eines neuen Moduls fällt in keiner dieser Zeilen auf.

**Was zu tun ist.** Die `include`-Liste auf die Fachmodule ausdehnen (zum Beispiel
`packages/engine/src/store-*.ts` und `packages/engine/src/http-*.ts`) und für die neuen Dateien
Schwellen setzen. Das ist eine Konfigurationsänderung von einer Zeile je Muster plus
Schwellenwerten. Wer die Dateien einzeln einträgt, bekommt pro Datei eine eigene Schwelle — das
entspricht der bestehenden `perFile`-Absicht.

**Ehrliche Einordnung.** Die betroffenen Module haben **eigene** Tests (z. B.
`packages/engine/test/store-references.test.ts` mit 26 Fällen, `store-style-rules.ts` über
`packages/engine/test/`). Der Testbestand ist also da — was fehlt, ist die **Messung**, nicht die
Prüfung. Der Unterschied ist wichtig: Ein nicht gemessener, aber getesteter Pfad ist eine
Lücke in der Übersicht; ein ungetesteter Pfad wäre ein Loch.

---

## 3 — Kein Drift-Tor für das Manifest

Siehe Fachanalyse 4, Abschnitt 2. Kurz: Das Manifest wird per Hand erzeugt
(`pnpm manifest:render`), und weder `pnpm verify` noch die CI noch die Tests prüfen, ob die
eingecheckte Fassung noch zum Quelltext passt. Der Test prüft nur die **Namen**.

---

## 4 — Die CI: vier Jobs, gepinnte Aktionen, kein Schreibzugriff

`.github/workflows/verify.yml`:

| Job | Was er beweist | Anmerkung |
|---|---|---|
| `verify` (ubuntu-24.04) | Build, Lint, `git diff --check`, Volltest, Artefakt-Tor, Docs-Portal-Build, Visual-Gate, Parität, Import-Tor | Chromium wird ausdrücklich installiert; ohne Browser ist das Tor rot statt übersprungen (Zeile 5-6) |
| `tests-windows` (windows-latest) | die Suite unter Windows | `TEMP`/`TMP` auf das Repo-Laufwerk (Zeile 109-111) — der Workaround aus B2 |
| `postgres-tests` | Transaktionsbeweise gegen echtes PostgreSQL 18 | die Lane ist rot, wenn ein Fall übersprungen wird (Zeile 145) |
| `coverage` | Schwellen-Tor + `quality:check` | `quality:check` **schreibt nicht**, sondern vergleicht (Zeile 166-171) |

**Was daran gut ist:**

- Aktionen sind **auf den Commit gepinnt**, nicht auf ein Tag (Zeile 44, 47, 50; Kommentar
  Zeile 37-39) — ein verschobenes Tag kann keinen fremden Code in den Lauf bringen.
- `permissions: contents: read` (Zeile 28-29) — der Workflow liest nur.
- `concurrency` bricht veraltete Läufe ab (Zeile 33-35).
- Der Lauf zählt auf dem Pull Request (Zeile 15-20) — auf `master` läuft er mit, damit ein roter
  Master nicht unbemerkt bleibt.
- `pnpm quality:check` im Coverage-Job: der Lauf, der dem Dokument **widerspricht**, wird rot,
  statt still das Dokument zu überschreiben. Genau die richtige Richtung.

**Was fehlt:**

| Lücke | Nutzen | Aufwand |
|---|---|---|
| **Kein Dependency-Audit** (`pnpm audit`) | bekannte Schwachstellen in der Abhängigkeitsliste werden erst sichtbar, wenn jemand danach sucht | eine Zeile im Workflow |
| **Kein Secret-Scan** (gitleaks) | der Repo enthält einen `operator token`-Mechanismus; ein versehentlich committeter Token wäre ein Vollzugriff | ein Workflow-Schritt + Konfiguration |
| **Kein Lizenz-Check** | die Abhängigkeiten wachsen (Playwright, Astro, Three.js, GSAP); die Lizenzlage ist nicht dokumentiert | ein Schritt, gelegentlich |
| `verify:import` fährt **eine** der beiden Import-Gate-Dateien (`import-visual-gate-browser.test.ts`), nicht `import-fixture-gate-browser.test.ts` | die Fixture-Gate-Datei prüft gegen echte Fremdseiten (höhere Aussagekraft) | eine Zeile im Skript |

**Zur Einordnung:** Der CI ist für ein lokales Einzelplatz-Programm bereits überdurchschnittlich.
Die drei fehlenden Punkte sind **Hygiene**, keine Lücken im Beweis.

---

## 5 — Die globale Testabschaltung des Adresswächters

`vitest.config.ts:27-31`:

```
// Viele Tests importieren von einem lokalen 127.0.0.1-Server. Produktiv
// weisen Import und Referenz-Analyse private Ziele ab (ADR-0016); der
// Betreiber-Schalter gilt hier fuer die ganze Suite, die Tests des Schutzes
// (packages/core/test/net.test.ts) schalten ihn selbst wieder aus.
env: { SENIFY_ALLOW_PRIVATE_URLS: "1" },
```

**Das ist eine bewusste, dokumentierte Abwägung** — und sie ist richtig: Ohne sie könnte die
Hälfte der Suite keinen lokalen Server anprechen.

**Die Restgefahr.** Vier Testdateien schalten den Wächter wieder ab:
`packages/core/test/net.test.ts:15`, `packages/engine/test/references.test.ts:384`,
`packages/engine/test/references-capture-chain.test.ts:233`, `packages/engine/test/imports.test.ts:736`
(alle mit `vi.stubEnv("SENIFY_ALLOW_PRIVATE_URLS", "")`).

**Jeder andere Test läuft mit dem Wächter abgeschaltet.** Ein neuer Test, der einen Wächterpfad
prüft und das Stubbing vergisst, prüft die **falsche** Verhalten und ist grün. Der Fehler ist
stillschweigend — genau die Art, die die Coverage-Lücke so lange unsichtbar gemacht hat.

**Vorschlag.** Einen Helfer `withStrictNetwork(fn)` in `@senify/core/testing` anbieten, der die
Variable setzt **und** am Ende prüft, dass sie nicht versehentlich gesetzt war. Noch besser: Ein
Helper, der **fehlschlägt**, wenn ein Test, der den Wächter prüfen will, mit gesetzter Variable
startet — dann ist der Fehler sofort sichtbar.

---

## 6 — Der zweite Volltest (TEMP auf dem Repo-Laufwerk)

```
Test Files  4 failed | 268 passed | 3 skipped (275)
  Duration  732.87s
```

Die vier roten Dateien sind **alle** unter Last und **keine** Funktionsfehler:

| Datei | Fehler |
|---|---|
| `packages/mcp/test/write-output.test.ts` | `Failed Suites`: `[vitest-worker]: Timeout calling "fetch"` — der Timeout beim **Laden** des Moduls |
| `packages/app/test/release-cutover-browser.test.ts` | `Matcher did not succeed in time` — `expected 'Veröffentliche …' to contain 'aktiv'` (Playwright) |
| `packages/engine/test/design-record.test.ts` | `Test timed out in 90000ms` |
| `packages/engine/test/lifecycle.test.ts` | `Test timed out in 90000ms` |

**Der Fall `release-cutover-browser` ist im Repository als bekannter Flake dokumentiert**
(`docs/current/qualitaet.md`, Zeilen 40, 68 und 70: „scheitert an einem abgebrochenen
`/api/events`-Stream“; dort ist auch vermerkt, dass der Fehlschlag auf dem Stand vor der
Releases-Schritt-Änderung **identisch** auftritt).

**Der Zusammenhang, der mehr zählt als die Fehlerliste:** Die beiden 90-Sekunden-Timeouts sind
**Review-Tests mit Bake**. Im grünen Lauf brauchen die Nachbarn desselben Zyklus **12,3 s**,
**15,3 s** und **23,8 s**:

```
✓ review loop > submits a review with preview, diff and checks  12299ms
✓ review loop > runs request changes → fix → approve → release  15299ms
✓ review loop > rolls back to an older release as a new release  23797ms
```

Unter Last derselben Suite überschreiten sie die 90 s. Die Marge ist dünn, und der Grund ist der
**synchrone Bake** (Fachanalyse 3, B1). Der Bake ist damit nicht nur ein Betriebsproblem, sondern
auch die Ursache der testseitigen Flakes — ein Argument, das über „der Bake ist langsam“ hinausgeht.

**Ausfgeführt wurde** `pnpm test` **ohne** `TEST_DATABASE_URL` (also gegen `pg-mem`) und **ohne**
`SENIFY_REQUIRE_BROWSER` (Browser-Suiten, die keinen passenden Browser finden, überspringen sich
stillschweigend).

---

## 7 — Weitere Beobachtungen zur Testinfrastruktur

- **`testTimeout: 30_000`** (`vitest.config.ts:41`) mit dem Kommentar, dass der 5-s-Default unter
  Last zufällige Fehlschläge erzeugt hat. Zwei Dateien (`golden.test.ts`, `capture.test.ts`) haben
  zusätzlich 60 s. Der 90-s-Deckel in `lifecycle.test.ts` ist ein Einzelwert.
- **Die Browser-Suiten überspringen sich selbst**, wenn das installierte Chromium nicht zur
  Playwright-Version passt (`docs/current/qualitaet.md`, Zeile 43). Im Volltest erscheinen sie dann
  als „übersprungen“, nicht als Fehlschlag. **Das ist die gefährlichste Lücke der ganzen
  Testinfrastruktur:** ein Browser-Test, der still überspringt, prüft nichts. `SENIFY_REQUIRE_BROWSER=1`
  macht daraus einen Fehler — die CI setzt es nicht (der Browser wird dort ohnehin installiert).
  **Empfehlung:** `SENIFY_REQUIRE_BROWSER=1` auch im lokalen `pnpm test` setzen oder als
  eigenes Skript `pnpm test:browser` anbieten, das daran scheitert, wenn Chromium fehlt.
- **Die ungetrackten Verzeichnisse** `.tmp/` und `.bake-tmp/` (siehe Fachanalyse 3, B6) verhindern
  einen sauberen Arbeitsbaum — und die DoR-Bedingung des Fahrplans verlangt genau das
  (`docs/fahrplan.md:220`).

---

## Umsetzung (20.10.2026)

- **Coverage-Lücke geschlossen:** das Tor misst jetzt auch `packages/engine/src/store-*.ts` und
  `http-*.ts` — 33 Dateien, rund 7 000 Zeilen, die vorher ungemessen waren. Drei schwach gemessene
  Dateien (`store-settings-mappers.ts` 39 Branches, `store-style-rules.ts`, `http-build-files.ts`
  57 Statements) haben eigene Schwellen; die Gruppe der übrigen liegt knapp unter der niedrigsten
  Datei der Gruppe. `scripts/render-quality.mjs` zeigt die Gruppen als Zeile mit **Bereich**, nicht
  als Mittelwert.
- **Transaktionsbeweise ohne Postgres-Dienst:** PGlite (PostgreSQL nach WebAssembly, im Prozess)
  fährt die Beweise, die vorher übersprungen wurden. `createTransactionDatabase()` in
  `packages/engine/test/helpers.ts` nimmt das konfigurierte PostgreSQL, sonst PGlite. Der Preis
  ist der Boot des WASM-Instanz (rund fünf Sekunden je Testdatei).
- **Geheimnis- und Lückenscan in der CI:** `gitleaks` (gepinnt, Prüfsumme verglichen, volle
  Historie) und `osv-scanner` (Binary aus dem Release mit fester Version, Prüfsumme aus
  `osv-scanner_SHA256SUMS` verglichen) als eigene Jobs, mit Ausnahmelisten, die je einen Grund
  tragen (`osv-scanner.toml` zusätzlich mit Ablaufdatum). Der Weg über den revidierbaren
  Fremd-Workflow von Google ist **nicht gangbar**: er brachte den ganzen Lauf in einen
  `startup_failure` — Gegenprobe: ohne den Job startet der Lauf, mit dem Fremd-Workflow nicht.
- **Paketregeln in der CI:** `pnpm deps:check` (dependency-cruiser) hängt an `pnpm verify` und
  hat einen eigenen CI-Schritt.
- **Browser-Suiten überspringen sich nicht mehr still** (zweite Prüfung, 20.10.2026): die
  Browser-Suiten tragen `describe.skipIf(!browserAvailable)`. Fehlt Chromium oder passt es nicht
  zur Playwright-Version, verschwanden sie **ohne** Fehlermeldung — ein grüner Lauf, in dem die
  Browser-Tore nie gelaufen sind. Der CI-Job `verify` setzt jetzt `SENIFY_REQUIRE_BROWSER=1`;
  die Suite läuft dann und wird rot, statt grün zu sein ohne Test. Nachgemessen: ohne die
  Variable `1 skipped`, mit ihr ein Fehler (`Executable doesn't exist`). Der Windows-Job setzt sie
  bewusst nicht — dort ist kein Chromium installiert, die Browser-Tore laufen im Linux-Job.