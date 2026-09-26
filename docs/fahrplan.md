# Fahrplan

> **Dokumenttyp:** fortlaufender Umsetzungsplan mit Gates. Dieses Dokument begleitet die Umsetzung und wird bei jedem abgeschlossenen Schritt aktualisiert.
> **Stand:** 26.09.2026 · **Basis:** Commit `67a2862` (Arbeitsbaum sauber) · **Belege:** `docs/current/stand.md`, `docs/current/architektur.md`, `docs/current/qualitaet.md`
> **Nicht verbindlich hier:** Testzahlen (gehören nach `docs/current/qualitaet.md`), Fachbegriffe (`CONTEXT.md`), angenommene Entscheidungen (`docs/adr/`).
> **Ersetzt:** `docs/umbauplan.md` (dort stehen Phasen 0–9, die hier nicht fortgeführt werden; siehe `docs/README.md` für die Vorrangregeln).

## Wie dieses Dokument arbeitet

- **P0 → P3** ist die Reihenfolge. Ein Block der Priorität *n* startet erst, wenn der Gate des *n-1*-Blocks grün ist.
- **Jeder Schritt hat einen Gate.** Der Gate ist ein ausführbares Kommando, kein Urteil. Ohne grünen Gate kein nächster Schritt.
- **Jeder Schritt hat eine Definition of Ready:** was vorher grün und vorhanden sein muss.
- **Jeder Schritt hat eine Definition of Done:** was außer „erledigt" auch noch belegbar ist.
- **Ein offener Risiko-Index `R1`–`R13`** leitet von `docs/current/stand.md` und `docs/current/architektur.md` auf die Schritte über. Wer einen Schritt startet, schließt damit nicht implizit andere Risiken.
- **Fertig heißt:** Schritt markiert, Risiko als geschlossen gestrichen, `stand.md` und `qualitaet.md` aktualisiert.

---

## Priorität 0 — Grundlage sichern und ehrlich machen

Vor jeder inhaltlichen Arbeit gilt: **Der Arbeitsbaum ist das größte Risiko, und `pnpm build` ist der größte Bluff im Projekt.**

### P0-1 · Arbeitsbaum in fachlichen Commits sichern — erledigt am 26.09.2026

**Erledigt 26.09.2026:** Zehn Commits `1e4645a…67a2862` in der Reihenfolge Hygiene → Gate → Engine → Import → Renderer+Widget-Engine → Editor → App → MCP+Skills → Doku → Notizen; `git status --short` ist leer; `.gitignore` ergänzt um `.scratch/ui-audit/*.json` (erzeugte Messläufe bleiben lokal, Notizen und Messwerkzeuge sind getrackt). Der Plan darunter bleibt als Dokumentation der Klassifikation stehen.

**Warum:** 110 geänderte, 1 gelöschte und 119 untrackte Dateien. Solange steht kein einzelner Stand auf einem Commit; `stand.md` muss auf einen Hash zeigen, nicht auf eine Momentaufnahme.

**Ready:** kein anderer Strang schreibt gerade in denselben Baumbestand.

**Umsetzung:**

1. Untracked Dateien klassifizieren. Nicht ins Repo gehören Screenshots, Messbilder, lokale Logs: `.scratch/editor-v2-rebuild/aufnahmen*/`, `proto-*.png`, `*.log`. Die `.gitignore` deckt das bisher nur teilweise ab — die Lücken schließen, nicht die Dateien mitcommitten.
2. Geänderte Dateien nach **fachlichen Paketen** committen, nicht in einem Klumpen:
   - `Doku:` `CONTEXT.md`, `AGENTS.md`, `README.md`, `docs/**`, `HANDOFF.md`, `RESEARCH.md`, `PRODUCT.md`, `llms.txt`
   - `Engine:` `packages/engine/src/**` + die dazugehörigen `test/**` **gemeinsam** (der Diff ist atomar, sie trennen ihn sonst)
   - `Editor:` `packages/editor/**`
   - `App:` `packages/app/**`
   - `MCP + Skills:` `packages/mcp/**`, `packages/skills/**`
   - `Renderer + Widget-Engine:` `packages/renderer/**`, `packages/widget-engine/**`
   - `Import:` `packages/framer-import/**`, `packages/analysis-worker/**`
   - `Gate:` `.github/workflows/verify.yml`, `eslint.config.mjs`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `pnpm-lock.yaml`
3. Untracked **Code- und Testdateien** in dasselbe Paket wie ihre Änderung, nicht als eigenständigen Commit. Das betrifft u. a. `apply-redesign.ts`, `imports.ts`, `deploy.ts`, `library.ts`, `undo-batch.ts`, `route-matrix.ts`, `redesign-proposals.ts`, `redesign-section-plan.ts`, `code-payloads.ts`, `design-contract.ts` samt ihrer Testdateien.
4. Untracked **neue Produktdateien** prüfen: `PRODUCT.md`, `docs/README.md`, `docs/history/`, `docs/adr/0009-0010`, `docs/adr/0012-0014`, `docs/adr/README.md`, `docs/current/`, `docs/umbauplan.md`, `llms.txt`, `scripts/verify-visual.mjs`, `packages/engine/scripts/route-matrix.ts`, `packages/app/test/visual-baselines/`.

**Gate:**

```bash
git status --short | wc -l        # → 0
git diff --check                  # → Exit 0
pnpm typecheck                    # → Exit 0
```

**Done:** `git log --oneline` zeigt mindestens die acht Paket-Commits; `stand.md` nennt den neuen Hash.

---

### P0-2 · Lintfehler der neuen Postgres-Testdatei — erledigt am 25.09.2026

**Warum:** `pnpm verify` = `build && lint && test`. Ein einziger ungeprüfter Import in einer neuen Testdatei hätte das komplette Gate rot gemacht.

**Erledigt:** `packages/engine/test/redesign-transaction.test.ts:2` importiert nur noch `{ compileRedesign, Store, type Db, type DbClient }`; der ungenutzte `ensureSchema`-Import ist entfernt, `pnpm lint` läuft mit Exit 0. Kein offener Rest.

**Gate:** `pnpm lint` → Exit 0. **Done:** erreicht.

---

### P0-3 · Idempotency-Completion-Fehler schließen (R6)

**Warum:** Das ist der einzige **echte Datenintegritätsfehler** im bisherigen Befund. `completeIdempotencyKey` läuft im `try` (`http.ts:518`), der `catch` ruft `releaseIdempotencyKey` (`http.ts:529`, `DELETE`). Scheitert nur die Completion nach geschriebenem Write, wird der Claim gelöscht und ein Retry erzeugt ein zweites Entity.

**Ready:** P0-1, P0-2. Die `idempotency.test.ts`-Suite ist grün und versteht den Vertrag.

**Umsetzung:**

> **Das ist eine Schema-Änderung, nicht nur Fehlerbehandlung.** `committed_response_unknown` ist ein neuer Wert in `idempotency_keys` und braucht ein Feld für das unbestätigte Ergebnis. Beide werden additiv ergänzt (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, das Muster aus `db.ts:110-115`); `ensureSchema` bleibt der einzige Ort. Ohne diese Ergänzung wäre der Zustand nur ein Kommentar.

1. **Zustand modellieren statt zu löschen.** Ein Key braucht mindestens die Zustände `in_progress` → `completed` | `committed_response_unknown`. Der `catch` unterscheidet: Fehler **aus** `run()` → Key freigeben (so ist es korrekt); Fehler **aus** `completeIdempotencyKey` → Key **nicht** freigeben, sondern als `committed_response_unknown` markieren.
2. **`rowCount` prüfen.** `completeIdempotencyKey` löst heute erfolgreich auf, wenn das `UPDATE` null Zeilen trifft (`store.ts:3830-3848`); das ist ein Fehlerfall, kein Erfolg.
3. Der Replay-Pfad beantwortet `committed_response_unknown` mit dem letzten bekannten Ergebnis oder mit einem eindeutigen Fehler, der den Aufrufer informiert, dass die fachliche Änderung bereits passiert ist — **niemals** mit einer zweiten Schreibung.
4. Audit-Eintrag für den Zustandswechsel.
5. Keys nach erfolgreichem Commit länger aufbewahren als In-Progress-Keys; Cleanup separat.

**Tests:**

- Fehler in `run()` → Key freigegeben, Retry schreibt (liegt bereits vor, `idempotency.test.ts:269`).
- **Fehler nach** `run()`, **in** `completeIdempotencyKey` → Key **nicht** freigegeben, Retry erzeugt kein zweites Entity. **Dieser Test fehlt — er ist der Beweis.**
- Zwei parallele Requests mit demselben Key erzeugen genau eine Ressource.

**Gate:**

```bash
pnpm exec vitest run packages/engine/test/idempotency.test.ts   # → Exit 0
pnpm exec vitest run packages/engine/test/db-schema.test.ts     # → Exit 0, neue Spalte sichtbar
pnpm exec vitest run packages/engine/test/backup-restore.test.ts # → Roundtrip trägt den neuen Zustand
pnpm exec vitest run packages/engine/test/transactions.test.ts  # mit und ohne TEST_DATABASE_URL
```

**Done:** `stand.md` streicht R6; der neue Fall steht in `idempotency.test.ts` und ist benannt; `db-schema.test.ts` und `backup-restore.test.ts` decken die neue Spalte ab.

---

### P0-4 · Build-Echtheit einführen (R1)

**Warum:** `build` und `typecheck` sind dieselbe Zeile mit `noEmit: true`. Es existiert kein Produktionsartefakt, deshalb beweist `verify`, dass der **Arbeitsbaum** korrekt ist, nicht das, was ausgeliefert würde. Das ist die Prämisse, unter der alle anderen Gates zu lesen sind.

**Ready:** P0-1 (Build-Konfiguration liegt im Gate-Paket).

**Umsetzung, in dieser Reihenfolge:**

1. **App-Shell als echtes Artefakt:** `app.js` (6669 Zeilen handgeschrieben) über esbuild bündeln lassen. Die Infrastruktur ist da — `server.ts:34` bündelt den Editor bereits. Dieselbe Bündelung als Ausgabe in `dist/` statt als Laufzeit-Aufruf.
2. **Skripte trennen:** `typecheck` (nur Typen), `build:app`, `build:docs`, `build:renderer`, `build:release`, `build` (alle). `verify` hängt an `build`, nicht an `typecheck`.
3. **Kein Regressionstest auf Dev-Pfad:** der Paritäts-Test und `visual-snapshot` lesen aktuell aus dem Arbeitsbaum. Sobald ein Artefakt existiert, muss mindestens **ein** Gate es prüfen — sonst ist die Echtheit theoretisch.
4. **Minify/Tree-Shake** kommt **nicht** in diesem Schritt. Erst Artefakt, dann Optimierung. Ein bundler-basierter `dist/` ist das Ziel, nicht die Feinabstimmung.

**Gate:**

```bash
pnpm build          # erzeugt nachweislich Dateien (ls packages/app/dist, packages/docs-portal/dist)
pnpm typecheck      # bleibt als eigener Schritt separat
pnpm verify:parity  # grün
pnpm test:visual    # grün
```

**Done:** `ls` zeigt Artefakte; `package.json` nennt getrennte Skripte; `architektur.md` aktualisiert (Tabelle „Bündelung und Auslieferung").

**Bewusst nicht in P0:** Ersetzen von `app.js` durch ein komplettes ESM-Modulsystem, Code-Splitting, Dateigrößen-Budgets. Das gehört in P3-2 (God-Files).

---

**Gate P0 gesamt:**

```bash
pnpm verify && pnpm test:visual && git status --short | wc -l
# → Exit 0, Exit 0, 0
```

Erst danach beginnt P1.

---

## Priorität 1 — CI muss beweisen, was der Code behauptet

Bis hierher laufen alle Gates nur lokal. **P1 ist der Block, in dem Aussagen überprüfbar werden.**

### P1-1 · PostgreSQL-Lane in CI (R11, Teil 1)

**Warum:** Die übersprungenen Tests sind die einzigen, die die Transaktionssemantik **wirklich** beweisen. Betroffen sind `transactions.test.ts` und `redesign-transaction.test.ts`; eine dritte Datei überspringt je nach Browser-Verfügbarkeit. Zahlen und Ursachen stehen in `docs/current/qualitaet.md` und werden hier bewusst nicht wiederholt. Ohne die Lane sind alle Transaktionsversprechen (ADR-0014, Persistenz, `persistBatch`) gegen ein In-Memory-Zweifelsystem belegt, das ROLLBACK ignoriert. `redesign-transaction.test.ts` sagt das im eigenen Kommentar.

**Ready:** P0-3 (sonst wird die Lane für einen bekannten Fehler rot). P0-3 ist seit 26.09. geschlossen (`d233971`).

**Stand 26.09.2026 — umgesetzt, Nachweis steht aus.** Der Job existiert: `postgres-tests` in `.github/workflows/verify.yml` mit einem `services:`-Block (Postgres 16, Port 5432) und `TEST_DATABASE_URL` als Job-Umgebung. Geführt wird er über `pnpm test:postgres` (`scripts/verify-postgres.mjs`), das **rot** wird, wenn `TEST_DATABASE_URL` fehlt oder auch nur ein Fall überspringt — ein grünes Tor ohne Datenbank wäre kein Nachweis. Punkt 3 der Umsetzung ist bereits von `packages/engine/test/helpers.ts` erledigt: es baut pro Lauf ein eigenes Schema auf und hängt es beim Schließen ab. **Die Done-Bedingung ist nicht erfüllt:** ein grüner Lauf mit 0 übersprungenen Fällen existiert nicht. Es gibt keinen CI-Lauf seit dem Push, und lokal war keine erreichbare Postgres mit nutzbaren Zugangsdaten zu finden (Port 5432 belegt, Anmeldung abgelehnt; `docker` fehlt). R11 bleibt offen, bis ein Lauf da ist.

**Umsetzung:**

1. PostgreSQL-Service in `.github/workflows/verify.yml` (ein `services:`-Block, Port 5432).
2. `TEST_DATABASE_URL` als Environment-Variable für den Test-Schritt.
3. Schema vor dem Test aufbauen, Testdatenbank danach zerstören.
4. `pg-mem` für die schnellen Unit-Tests behalten — es ist kein Ersatz, sondern die andere Hälfte.
5. **Separater Job**, nicht im selben Schritt wie die schnellen Tests: die Lane muss als eigener grüner/roter Balken sichtbar sein.

**Gate:**

```bash
# lokal, wenn eine Postgres-Instanz verfügbar ist:
TEST_DATABASE_URL="postgres://…" pnpm exec vitest run packages/engine/test/transactions.test.ts packages/engine/test/redesign-transaction.test.ts
# → Exit 0, keine Übersprungen mehr in diesen beiden Dateien (Zahlen: docs/current/qualitaet.md)
```

CI: ein Job `postgres-tests` ist grün und meldet 0 übersprungen in diesen beiden Dateien.

**Done:** `qualitaet.md` zeigt für diese beiden Dateien „0 übersprungen"; `stand.md` und R11 im Fahrplan bleiben offen, bis auch Coverage und Build in CI stehen.

**Hinweis:** In dieser Umgebung war `docker` nicht verfügbar und kein Postgres auf 5433 erreichbar — die Lane lässt sich daher hier nur als CI-Definition schreiben, nicht als lokaler Nachweis.

---

### P1-2 · Coverage-Schwellen aktivieren (R11, Teil 2)

**Ready:** P1-1 (Coverage ohne die CI-Lane gibt ein trügerisches Gefühl).

**Stand 26.09.2026 — Tor aktiv, Punkte 1, 2 und 4 erfüllt, Punkt 3 offen.** `vitest.config.ts` führt einen v8-Block mit `perFile: true`; eine Datei unter ihrer Schwelle macht das Tor rot, ein Durchschnitt kann nicht mehr retten. Geschützt sind exakt die in Punkt 2 genannten Pfade, in drei Gruppen mit jeweils eigener Latte. Der Lauf hängt an `pnpm test:coverage` und führt nur die Suites der geschützten Pfade (engine, editor, mcp) — die schweren Browser-Suiten sind bewusst draußen, weil ein Tor, das unter Playwright-Last fasst, abgeschaltet statt repariert wird. Gemessene Werte und die gesetzten Latten stehen in `docs/current/qualitaet.md`. Zwei Fallen sind im Konfigationskommentar festgehalten: ein eigenes `exclude`-Feld **ersetzt** die Vitest-Standardwerte (ohne `coverageConfigDefaults.exclude` landen `dist/` und `node_modules` in der Messung und die Report-Erzeugung bricht ab), und `packages/editor/src/state/browser.ts` ist als reine Re-Export-Datei ausgenommen, weil ihre Prozentzahl ohne eigene Aussagen nichts misst. **Punkt 3 ist nicht geleistet:** die gezielten Fehlerpfade (`withIdempotency`-Catch, `releaseIdempotencyKey`, Transaktions-Rollback, `operatorOnly`-Ablehnung, `baseVersion`-409) haben keine eigenen Tests; die vorhandenen Zahlen messen nur, was die Suite ohnehin berührt.

**Umsetzung:**

1. `vitest --coverage` mit Thresholds **pro Datei**, nicht global. Startniveau niedrig (z. B. 60 %) und nach oben gehen; keine globale 100 %.
2. Geschützt werden zuerst die Pfade, in denen Fehler am teuersten sind: `engine/src/http.ts`, `engine/src/store.ts`, `engine/src/lifecycle.ts`, `engine/src/forms.ts`, `editor/src/state/`, `mcp/src/tools.ts`.
3. **Gezielt Fehlerpfade:** `withIdempotency`-Catch, `releaseIdempotencyKey`, Transaktions-Rollback, `operatorOnly`-Ablehnung, `baseVersion`-409. Eine rezeptive Abdeckung ohne Fehlerpfade ist wertlos.
4. `coverage/` ist bereits in `.gitignore`.

**Gate:**

```bash
pnpm exec vitest run --coverage          # → Exit 0, Schwellen erreicht
pnpm verify                              # → Exit 0
```

**Done:** `vitest.config.ts` nennt die Schwellen; `qualitaet.md` verzeichnet das Coverage-Gate.

---

### P1-3 · Lint-Ziel erweitern

**Warum:** `lint` deckt nur `packages/` ab (`package.json:19`). `scripts/verify-parity.mjs`, `scripts/verify-visual.mjs`, `eslint.config.mjs` selbst und die Workflow-Skripte sind nie geprüft. Das ist die gleiche Lücke wie „build ist kein build", nur kleiner.

**Ready:** P0-1 (die Skripte sind im Gate-Paket).

**Umsetzung:** `eslint packages scripts` plus `git diff --check` als eigenes Skript, eingehängt in `verify`.

**Stand 26.09.2026 — erledigt.** `lint` = `eslint packages scripts`, `check:patch` = `git diff --check`, und `verify` = `build && lint && check:patch && test`. Die Skripte waren lint-fähig (`eslint.config.mjs` führte die Node-Globale für `scripts/**/*.mjs` schon), es fehlte nur das Ziel. Gate: `eslint scripts` für sich grün; `git diff --check` grün. **Nicht vom Tor erfasst:** `eslint.config.mjs` selbst liegt weiterhin außerhalb des Ziels — die Umsetzung im Fahrplan nennt es als Grund, aber nicht als Punkt, und eine Wurzel-Config ist kein `scripts/`-Pfad.

**Gate:** `pnpm lint` → Exit 0, inklusive `scripts/`. Beim Lauf am 26.09. meldete `pnpm lint` sieben Fehler in `packages/engine/src/apply-redesign.ts` und `packages/engine/src/redesign-section-apply.ts`. Beide gehören nicht zu diesem Schritt: die erste Datei war uncommittet in Arbeit am Sektions-Executor (P2-1), die zweite noch ungetrackt. Der Stand von `master` war vor diesen Arbeiten lint-grün.

---

**Gate P1 gesamt:** `.github/workflows/verify.yml` führt mindestens `verify`, `test:visual`, `verify:parity`, `verify:import`, **postgres-tests** und **coverage** — jeder Schritt einzeln sichtbar. **Stand 26.09.2026:** alle sechs sind im Workflow vorhanden, `coverage` als dritter eigener Job. Der Gesamt-Gate gilt erst mit einem grünen `postgres-tests`-Lauf als erreicht; der Nachweis fehlt (siehe P1-1).

---

## Priorität 2 — Redesign zu Ende bringen

Der Redesign-Flow hat ein Versprechen: **„ein Mensch wählt eine Richtung, das Ergebnis steht."** Bislang liefert der Apply ein Theme und ein Scaffold; der Sektions-Plan wird danach von Hand in Einzelmutationen aufgebaut. Das ist die offene Produktlücke.

### P2-1 · Sektions-Plan im Executor ausführen (R3)

**Warum:** `sectionPlanApplied` steht auf `false`, und `rg sectionPlan apply-redesign.ts` liefert null Treffer — der Plan wird nirgends gelesen. ADR-0013 sagt, er sei ein Handoff; ADR-0014 hat die atomare Mechanik gebaut, aber den Plan nicht eingehängt.

**Ready:**

- P0-3 (Idempotency), damit ein Wiederholungsfall nicht eine doppelte Seite schreibt.
- **Regel:** Der Executed-Plan darf **keinen** neuen Schreibpfad erfinden. Er schreibt über die kanonischen Mutationen, sonst entsteht eine zweite Wahrheit für Dinge, die Editor und MCP bereits beherrschen.

**Umsetzung:**

1. `compileRedesign()` erweitern: aus `card.sectionPlan` die Ziel-Section-Writes **ableiten** (Zieltyp, Varianten-Preset, erhaltene Inhalte, Slots) — wie heute schon für Theme und Seeds.
2. Die abgeleiteten Writes in den bestehenden `RedesignCommitPlan` aufnehmen. **Kein `if`, kein `continue`, kein I/O** im Commit — das ist die Regel, auf der die Atomarität von ADR-0014 ruht.
3. **Medienbedarf zuerst:** `reuse` → bekannte Asset-IDs umschreiben (die Mechanik liegt in `rewriteAssetIds`); `select`/`upload`/`generate` bleiben offen und erzeugen eine sichtbare Warnung statt eines stillen Fehlschlags; `avoid` erzeugt keinen Verweis.
4. Unbekannte und veraltete Zieltypen bleiben `manual` — sie werden **nicht** still weggelassen.
5. Erst wenn alle Needs gedeckt sind, `sectionPlanApplied: true` setzen. Nicht vorher: das Feld ist eine Ehrlichkeitsaussage, kein Fortschrittsindikator.

**Tests:**

- Plan-Exekution schreibt alle Sections in einem Commit; ein erzwungener Fehler in der Mitte hinterlässt **keine** Seite (Postgres-Lane, P1-1).
- `reuse`-Assets werden umgeschrieben, `avoid` landet nicht im Draft, unbekannter Typ bleibt `manual`.
- Ein zweiter Apply desselben Proposals erzeugt nichts ein zweites Mal.

**Gate:**

```bash
pnpm exec vitest run packages/engine/test/redesign-proposals.test.ts packages/engine/test/redesign-section-plan.test.ts
pnpm exec vitest run packages/engine/test/redesign-transaction.test.ts   # nach P1-1 gegen echtes Postgres
```

**Done:** `applyResult.sectionPlanApplied` ist in einem belastbaren Fall `true`; `stand.md` streicht R3; die Skills (`senify-referenz-redesign.md`, `router.md`) nennen den Weg nicht mehr als Handarbeit.

---

### P2-2 · Medienbedarf operativ machen

**Warum:** Der Sektions-Plan benennt heute Rollen (`select`, `upload`, `generate`) — ohne Weg, sie zu bedienen. Ohne diesen Schritt bleibt P2-1 für Seiten mit Medienbedarf in der Hälfte der Fälle stecken.

**Ready:** P2-1 (erst wenn der Plan läuft, ist die Bedarfsliste real).

**Umsetzung:**

1. **`reuse`:** Reuse-Mechanik, zuerst — bereits vorhanden (`copySiteAssets`).
2. **`select`:** Asset-Auswahl im Bestätigungsdialog, gegen die Media-Library der Zielsite.
3. **`upload`:** Upload in die Zielsite, nicht in die Quelle.
4. **`generate`:** Bildgenerierung über die Provider-Kette (ADR-0008) aus dem Prompt-Need.
5. Jeder verbleibende Need muss **sichtbar** sein: im `applyResult.warnings`, in der Review, im Design-Report.

**Gate:** Ein Browserlauf mit einer Seite, deren Plan zwei `generate`- und eine `select`-Rolle enthält, führt vollständig bis `submit_for_review`.

---

### P2-3 · Proposal-TTL und Aufräumen (R2)

**Warum:** `redesign_proposals` (`db.ts:248-259`) hat keinen `expires_at`. Verwaiste `proposed`-Proposals sammeln sich; es gibt keinen Purge-Pfad. Das ist kleine Arbeit, aber sie gehört vor dem Produktivbetrieb, nicht danach.

**Ready:** P2-1 (damit ein Aufräumen keinen laufenden Apply trifft).

**Umsetzung:** Spalte hinzufügen, TTL-Regel (Alt-Proposal wird `expired`, nicht stumm gelöscht), Bereinigung beim List-Endpunkt oder als Periodik, Massenverwaltung in der Oberfläche.

**Gate:** Ein Test legt ein altes Proposal an → es erscheint als `expired`, verschwindet aus der Standardliste, und ein Apply darauf schlägt mit `conflict` fehl, nicht mit einem halben Write.

---

### P2-4 · Design-Record als versioniertes Objekt (R4)

**Warum:** `buildDesignReport` wird in `lifecycle.ts:269` (Publish-Gate) und `:633` (Review) **zur Laufzeit** berechnet und verworfen. Damit ist die Aussage „dieses Release war grün" nicht reproduzierbar; eine spätere Änderung des Scores verändert die Geschichte.

**Ready:** P1-2 (der Report braucht stabile Zahlen, sonst ist der Record wertlos).

**Umsetzung:**

1. Report als versioniertes Objekt an Draft, Review und Release persistieren.
2. Release-Manifest und Review-Eintrag verweisen auf denselben Record, nicht auf eine Neuberechnung.
3. Der Record ist unveränderlich; eine spätere Änderung erzeugt einen neuen.

**Gate:** Zwei Publishes desselben Stands zeigen denselben `score`/`verdict` im gespeicherten Record; ein Rollback stellt den Record des Basis-Releases wieder her.

---

**Gate P2 gesamt:** Der Redesign-Flow läuft vollständig **als Mensch** von der Auswahl bis zum Review, ohne `apply_mutations` von Hand, wenn kein `manual`-Typ im Plan steht. Belegt durch einen Browser-Test und die Postgres-Lane.

---

## Priorität 3 — Reduktion, Verträge, Vollständigkeit

Diese Blöcke senken die Änderungskosten und die Fehlerrate, aber sie blockieren keine funktionale Arbeit mehr. Reihenfolge innerhalb von P3 ist frei wählbar, solange die jeweiligen Ready-Bedingungen erfüllt sind.

### P3-1 · Legacy-Editor ablösen (R5)

**Warum:** Zwei Schreibpfade bedeuten doppelte Arbeit für jede Editor-Änderung. Der Legacy-Editor hat seit 22.09. keine Änderung mehr erhalten — er wird gehalten, nicht benutzt.

**Ready:** P0-1. **Nicht** vorher löschen: die Datei ist Bestandteil des ungesicherten Deltas.

**Umsetzung, schrittweise:**

1. `?view=editor` leitet auf die Canvas-Ansicht um, mit sichtbarem Hinweis.
2. `mountEditor` und `mount.ts` als `// @deprecated` markieren.
3. Browser-Tests auf den Canvas umstellen (`editor-browser.test.ts` prüft heute noch den Alt-Pfad).
4. **Erst danach löschen**, und nur wenn kein produktiver Nutzer mehr davon abhängt (Umbauplan §4.3, Punkt 6 — die Stufen sind korrekt, nur die Position in der Reihenfolge war es nicht).
5. `editor-bridge.ts` und `EditorDocument`-Roundtrip-Tests bleiben bestehen — sie sind nicht Teil des Legacy-Editors.

**Gate:** `?view=editor` erreicht den Canvas; `mount.ts` wird nur noch aus `index.ts` referenziert; `pnpm test` grün.

**Achtung:** Das ADR-0011 (EditorDocument als kanonisches Modell) ist in `docs/adr/README.md:23` bewusst reserviert und gehört **nicht** in diesen Schritt — es ist eine Entscheidung, keine Aufräumaktion.

---

### P3-2 · God-Files aufteilen, ohne Verhalten zu ändern (R12)

**Warum:** `store.ts` 8672, `app.js` 6669, `http.ts` 5404, `tools.ts` 3515, `mount.ts` 3260 Zeilen. Jede Berührung kostet Review-Zeit und provoziert Konflikte mit Parallelsträngen.

**Ready:** P0-1 (ein sauberer Stand ist Voraussetzung für jede Metrik am Diff).

**Regel:** **Nur File-Move, keine API-Änderung, keine Verhaltensänderung, keine gleichzeitigen Refactors.** Ein Schritt pro Datei, jeder Schritt mit grünem Gate.

**Umsetzung:**

1. `store.ts` → `store/` mit `sites.ts`, `pages.ts`, `content.ts`, `media.ts`, `references.ts`, `redesign.ts`, `releases.ts`, `auth.ts`, `audit.ts`, `index.ts` (eine `Store`-Facade, äußere Signaturen identisch).
2. `http.ts` → Ressourcen-Routen pro Domain; der Dispatcher bleibt der einzige gemeinsame Punkt.
3. `mcp/tools.ts` → Tool-Gruppen; das Manifest bleibt die eine Quelle (siehe P3-3).
4. `app.js` → ESM-Module. **Das ist der größte Schritt** und gehört erst ans Ende, weil er kein reines File-Move ist — die Shell hat derzeit kein Modulsystem.
5. `mount.ts` fällt mit P3-1 weg, nicht hier.

**Gate pro Schritt:** `pnpm typecheck && pnpm lint && pnpm test` → Exit 0, **ohne** geänderte Assertions.

---

### P3-3 · MCP-Schema-first (R8)

**Warum:** 106 Tools, **0** `outputSchema`, **0** `structuredContent`. LLM-Clients müssen Text parsen, statt strukturiert zu lesen. Fehler sind nicht typisiert, und die Doku-Quelle ist handgeschrieben.

**Ready:** P0-1. `@sinclair/typebox` ist bereits eine Dev-Dependency, die Input-Schemata existieren.

**Umsetzung:**

1. `outputSchema` + `structuredContent` für die **lesenden** Tools zuerst (`get_*`, `list_*` — etwa 30 Tools). Der größte Nutzen pro Aufwand.
2. Einheitliches Fehlerobjekt mit `retryable`.
3. Pagination für Sites, Pages, Assets, Entries, References, Releases, Jobs.
4. Tool-Manifest aus einem neutralen Paket exportieren, damit `docs/mcp-route-matrix.md`, die Skills und der Server aus **einer** Quelle entstehen (heute: Handpflege in `tools.ts`, `server.ts` und drei `skills/*.md`).
5. `docs-portal` darf die MCP-Implementierung nicht importieren (bekannter Zyklus, nur über Lazy-Import kaschiert).

**Gate:** `get_site` und `list_pages` liefern valides `structuredContent`; die Routenmatrix-Datei wird aus dem Manifest erzeugt und der Test auf den erzeugten Stand gesetzt.

---

### P3-4 · Release-Manifest vervollständigen (R7)

**Warum:** `ReleaseManifest` trägt `styleRules`, `rendererVersion`, `buildHash`, `capturedAt`, `siteDate` — aber keinen Content-, Asset-, Payload- oder Template-Snapshot. Ein Rollback stellt daher nicht alles wieder her, was zum Stand gehörte.

**Ready:** P2-4 (der Design-Record gehört in dasselbe Manifest).

**Umsetzung:** Felder ergänzen und jeweils als Snapshot, nicht als Verweis auf aktuelle Live-Daten; `rebakedFrom`/`restoredFrom` bleiben wie sie sind; Build-Hash aus dem **vollständigen** Manifest berechnen.

**Gate:** Rollback liefert den ursprünglichen fachlichen Zustand vollständig (Scope, Einträge, Medien, Templates, Islands, Design-Record); ein veränderter Payload-Satz verhindert den Deploy.

---

### P3-5 · Import-Assets in die Transaktion ziehen (R10)

**Ready:** P1-1 (eine Atomaritätsbehauptung braucht die Postgres-Lane).

**Umsetzung:** Dateien wie in ADR-0014 §5 behandeln — vorbereiten, dann eine Transaktion, Kompensation bei Fehler. Der Rest besteht: `getAsset` bleibt absichtlich ungeprüft.

**Gate:** Ein fehlgeschlagener Import hinterlässt keine Asset-Zeile ohne Datei und kompensiert neu erzeugte Uploads.

---

### P3-6 · God-Files und Doku-Prozesse, die nicht Code sind

- `docs/current/qualitaet.md` durch CI erzeugen oder erzeugen lassen, statt es von Hand zu pflegen. **Regel bleibt:** die Testzahlen sind ein Projektionsziel, kein mitkopierter Text. Das Doku-Dokument rendert, was der Lauf schreibt.
- `HANDOFF.md` und `docs/verbesserungsplan.md` nach `docs/history/` verschieben — `docs/history/README.md` führt sie bereits als historisch, die Dateien stehen nur noch nicht dort. Dasselbe gilt für `RESEARCH.md` (Stand 14.09., mit „historisch"-Header).
- `.scratch/`-Hygiene entscheiden: entweder komplettes Ignore oder komplette Struktur. Heute sind `issues/` getrackt, Messbilder nicht — die Mischung kostet bei jedem Commit Zeit.

---

## Risiko-Register

Leitet von `stand.md` und `architektur.md` ab. **Status** ist der Stand, **Schritt** der Punkt, der es schließt.

| Nr. | Risiko | Status | Schritt |
|---|---|---|---|
| R1 | Kein Produktionsbuild | offen | P0-4 |
| R2 | Keine Proposal-TTL / kein Aufräumen | offen | P2-3 |
| R3 | Sektions-Plan nicht ausgeführt | offen | P2-1 |
| R4 | Kein Design-Record | offen | P2-4 |
| R5 | Legacy-Editor im Bundle | offen | P3-1 |
| R6 | Idempotency-Completion-Fehler | offen | **P0-3** |
| R7 | Manifest ohne Snapshots | offen | P3-4 |
| R8 | MCP ohne `outputSchema` | offen | P3-3 |
| R9 | Style-Registry-Klassen-Rename | offen | P3 (eigener Mini-Schritt, nach R12) |
| R10 | Import-Assets außerhalb der Tx | offen | P3-5 |
| R11 | Kein PG-Service, kein Coverage in CI | **teilweise geschlossen 26.09.2026**: PG-Service und Coverage-Job sind im Workflow, das Coverage-Tor ist lokal grün; der grüne PG-Lauf fehlt | P1-1 (Rest), P1-2 Punkt 3 |
| R12 | God-Files | offen | P3-2 |
| R13 | Arbeitsbaum ungesichert (230 Dateien) | **geschlossen 26.09.2026** (`6973cb1..67a2862`) | **P0-1** |

---

## Definition of Ready (für den Start eines Blocks)

Ein Block beginnt, wenn **alle** erfüllt sind:

1. Der Gate des vorherigen Prioritätsblocks ist grün und wurde ausgeführt, nicht behauptet.
2. `git status --short` ist sauber (P0-1 ist abgeschlossen), damit jeder Schritt am Diff messbar ist.
3. Kein anderer Strang schreibt gerade in die betroffenen Dateien.
4. Die Zieldateien sind in der „Zieldateien"-Liste des Schritts benannt.
5. Ein Test existiert, der den Fehler vor der Änderung zeigt (oder die Testlücke ist ausdrücklich benannt).

## Definition of Done (für einen Schritt)

Ein Schritt gilt erst als fertig, wenn **alle** erfüllt sind:

1. Der **Gate** wurde ausgeführt und war grün.
2. Jede Aussage „umgesetzt" in `stand.md` nennt Code- oder Testpfad.
3. Das Risiko ist im Register auf `geschlossen` gesetzt und die Zeile aus den offenen Listen in `stand.md` entfernt.
4. `docs/current/qualitaet.md` trägt die neuen Zahlen, **falls** sich ein Gate verändert hat.
5. Kein anderes Dokument wurde aktualisiert, das Testzahlen enthält.
6. Es wurde nichts committet, was nicht zu diesem Schritt gehört.

---

## Arbeitsstand dieses Dokuments

| Datum | Änderung |
|---|---|
| 25.09.2026 | Erste Fassung. Grundlage: eigene Gate-Läufe dieser Sitzung (typecheck, lint, Gesamttests, `test:visual` — Zahlen in `docs/current/qualitaet.md`, inkl. Nachläufe der drei Flakes) und Code-Prüfung aller `R`-Einträge an `Datei:Zeile`. |
| 26.09.2026 | P0-1 abgeschlossen: Arbeitsbaum in zehn fachlichen Commits gesichert (`1e4645a…67a2862`), `git status` leer, R13 geschlossen. P0-2 war bereits am 25.09. erledigt; offen in P0 bleiben P0-3 und P0-4. |
| 26.09.2026 | P1 gebaut: Postgres-Lane als eigener Job (`postgres-tests`) mit `pnpm test:postgres` als Tor, Coverage-Tor mit Pro-Datei-Schwellen (`pnpm test:coverage`), Lint-Ziel auf `scripts/` erweitert und `check:patch` in `verify` eingehängt. R11 auf teilweise geschlossen. Nicht geleistet: der grüne PG-Lauf (keine Zugangsdaten, kein CI-Lauf) und P1-2 Punkt 3 (eigene Fehlerpfad-Tests). Hinweis zur Reihenfolge: P0-3 und P0-4 wurden in einer parallel laufenden Sitzung committet (`d233971`, `4b24a1a`); deren Registerzeilen R6 und R1 sind dort noch nicht nachgezogen. |

**Offene Felder bewusst nicht ausgefüllt:** Aufwandsschätzungen. Der Umbauplan hatte sie nicht, der Verbesserungsplan nannte nur Größenklassen ohne Bezug zum konkreten Code. Sobald P0-1 steht, sind Schätzungen anhand der tatsächlichen Diffs möglich — bis dahin wäre jede Zahl eine Erfindung.

**Verwandte offene Punkte aus dem Umbauplan, die hier bewusst NICHT fortgeführt werden:**

Die Phasen 0–9 des Umbauplans (Localhost-Trust-Boundary, Datenintegrität, Release-Contract, Editor-Modell, First-Run, Accessibility, MCP, CI-Gates, Migrationen) sind in diesem Fahrplan entweder enthalten (unter anderem Namen: P0-3, P1-1, P1-2, P3-1, P3-3), bereits erledigt (Token-Routen sind `operatorOnly`, Proxy prüft Herkunft, Style-Registry hat Optimistic Locking) oder als P3-4/P3-5 eingestuft. Wer sie dort nachschlägt, liest einen Planungsstand vom 24.09.2026 — siehe `docs/README.md` für die Vorrangregeln.
