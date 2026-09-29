# Fahrplan

> **Dokumenttyp:** fortlaufender Umsetzungsplan mit Gates. Dieses Dokument begleitet die Umsetzung und wird bei jedem abgeschlossenen Schritt aktualisiert.
> **Stand:** 29.09.2026 · **Basis:** die geprüfte Folgearbeit ist in `2a0afde` und `aad9550` gesichert. Der erste Schritt von P3-2 (Store-Row-Mapping) ist aktuell in Arbeit; sein Gate ist grün, die Änderungen werden vor dem nächsten Schritt committet. Der Ist-Abgleich steht in `docs/current/stand.md`, `docs/current/architektur.md` und `docs/current/qualitaet.md`. Historische Abschnitte bleiben Verlauf und sind nicht automatisch der heutige Status.
> **Nicht verbindlich hier:** Testzahlen (gehören nach `docs/current/qualitaet.md`), Fachbegriffe (`CONTEXT.md`), angenommene Entscheidungen (`docs/adr/`).
> **Ersetzt:** `docs/history/umbauplan.md` (siehe `docs/README.md` für Vorrangregeln).

## Wie dieses Dokument arbeitet

- **P0 → P3** ist die priorisierte Reihenfolge; erledigte Schritte werden nicht erneut gestartet.
- Jeder offene Schritt hat Ready, Umsetzung, Gate und Done. Ohne grünen Gate kein nächster Umsetzungsschritt.
- `R1`–`R13` sind zwischen Fahrplan, Stand und Architektur synchron zu halten.
- Fertig heißt: Gate ausgeführt, Code/Testbeleg notiert, Risiko aktualisiert und – falls Zahlen betroffen sind – `qualitaet.md` ausschließlich mit Messdaten aktualisiert.
- Der historische P0-1-Commit hat einen damals sauberen Baum gesichert. Er ersetzt nicht die DoR-Bedingung, wenn danach erneut ein Folge-Diff entstanden ist.

---

## Aktueller DoR-Blocker

Der zuvor geprüfte Folge-Diff ist in `2a0afde` und `aad9550` gesichert. Der aktuelle, eng begrenzte P3-2-Schritt extrahiert Store-Row-Mapping nach `store-record-mappers.ts` und `store-row-utils.ts`; Typecheck, Lint, Volltest und Coverage sind am 29.09.2026 grün. Der Arbeitsbaum bleibt bis zu diesem Schritt-Commit absichtlich geändert; der nächste Schritt startet erst danach. Frühere App-/DB-Gates und aktuelle Zahlen stehen ausschließlich in `docs/current/qualitaet.md`.

---

## Priorität 0 — Grundlage sichern und ehrlich machen

### P0-1 · Arbeitsbaum in fachlichen Commits sichern — ursprünglicher Bestand historisch erledigt; Folge-Diff gesichert 29.09.2026

Zehn fachliche Commits (`1e4645a…67a2862`) sicherten den ursprünglichen Bestand. Der spätere geprüfte Folge-Diff ist ebenfalls gesichert (`2a0afde`, `aad9550`). Der neue uncommittete Store-Mapper-Schritt gehört zu P3-2 und muss dessen Gate und Commit durchlaufen, bevor ein weiterer Schritt beginnt.

Der lokale Runtime-Store `data/`, `full.log` sowie Graphify-Ausgaben sind ignoriert und werden nicht übernommen. Die Graphify-Semantik-Auswertung ist unvollständig; daraus wird kein Vollständigkeitsbeleg abgeleitet.

**Gate:** Für den gesicherten Folge-Diff liefen `pnpm verify`, `pnpm test:visual`, `pnpm verify:parity`, `pnpm verify:import`, `pnpm test:postgres`, `pnpm test:coverage` und `pnpm quality:check` am 28.09.2026 grün. Aktuelle P3-2-Gates sind unter P3-2 und in `docs/current/qualitaet.md` dokumentiert.

### P0-2 · Lintfehler der Postgres-Testdatei — historisch erledigt 25.09.2026

Der alte `ensureSchema`-Import in `redesign-transaction.test.ts` wurde entfernt. P0-2 ist historisch abgeschlossen; der aktuelle `pnpm lint`-Lauf ist grün.

### P0-3 · Idempotency-Completion-Fehler schließen (R6) — erledigt 26.09.2026 (`d233971`)

Die Completion prüft `UPDATE ... RETURNING`; Fehler aus `run()` geben den Key frei, Completion-Fehler behalten/markieren ihn, Retry bei `committed_unknown` antwortet mit 409. Umsetzung über additive Tabelle `idempotency_committed`. Belege: `packages/engine/src/http.ts`, `idempotency.test.ts`, `error-paths.test.ts`.

Der ursprüngliche Plan mit `committed_response_unknown`/`ALTER TABLE` ist überholt; die implementierte Lösung ist additiv. Gate für künftige Änderungen: Idempotency-, Schema-, Backup- und Transaktionstests.

### P0-4 · Build-Echtheit einführen (R1) — Implementierung abgeschlossen 27.09.2026

`packages/app/build.mjs` baut App-Artefakte; `pnpm build` führt `typecheck` plus Workspace-Builds aus. `scripts/verify-dist.mjs` hängt an `pnpm verify` und ist eigener CI-Schritt. Der Negativfall ohne `dist/` endet mit Exit 1. **R1 ist implementierungsseitig geschlossen.** Der aktuelle Folge-Diff hat Build und Artefaktprüfung im `pnpm verify`-Lauf dieser Runde bestanden; die weiteren App-Gates müssen noch ausgeführt werden.

Kein Minify/Tree-Shake/Sourcemaps in diesem Schritt. ESM-Aufteilung und Dateigrößen-Budgets gehören, falls priorisiert, in P3-2.

---

## Priorität 1 — CI muss beweisen, was der Code behauptet

### P1-1 · PostgreSQL-Lane in CI (R11, Teil 1) — erledigt 28.09.2026

`.github/workflows/verify.yml` führt einen eigenen `postgres-tests`-Job mit Postgres 16 und `TEST_DATABASE_URL`. `pnpm test:postgres` wird rot, wenn ein Fall übersprungen wird oder keiner läuft. Der aktuelle Folge-Diff bestand die Lane lokal mit sechs Fällen gegen PostgreSQL 18.6, null übersprungen. Test-Fixture erstellt und entfernt ein eigenes Schema.

### P1-2 · Coverage-Schwellen (R11, Teil 2) — erledigt 28.09.2026

`vitest.config.ts` nutzt v8 und `perFile: true`; `pnpm test:coverage` prüft geschützte Pfade aus engine, editor und mcp. Gezielte Fehlerpfade: `error-paths.test.ts` (Idempotency-Release, Completion ohne Slot, Rollback), `auth.test.ts` (`operatorOnly`), `mutations.test.ts` (`baseVersion`-409) und `imports.test.ts` (Asset-Kompensation). Coverage bleibt ein Messwert der ausgeführten Tests und kein Vollständigkeitsbeweis. Zahlen ausschließlich in `docs/current/qualitaet.md`; das aktuelle Coverage-Gate ist grün.

### P1-3 · Lint-Ziel erweitern — erledigt 26.09.2026, Root-Config offen

`pnpm lint` führt `eslint packages scripts` aus; `pnpm check:patch` hängt in `verify`. `eslint.config.mjs` selbst ist noch nicht im Lint-Ziel. Der aktuelle Lint-Lauf ist grün; Root-Config-Linting bleibt für P3-6 offen.

**Gate P1:** Workflow enthält `verify`, `test:visual`, `verify:parity`, `verify:import`, `postgres-tests` und `coverage`. Der aktuelle Gesamt-Diff hat diese Lanes bestanden.

---

## Priorität 2 — Redesign zu Ende bringen — erledigt

Der ursprüngliche Produktblock P2-1 bis P2-4 ist mit Code-/Testbelegen abgeschlossen. Nicht erledigt ist automatische Bild-/Medienbeschaffung; sie ist kein Teil der bereits erledigten operativen Need-Auflösung.

### P2-1 · Sektions-Plan im Executor (R3) — erledigt 27.09.2026

`compileRedesign()` leitet Writes aus der bestätigten Card ab, `rebuildPageTree()` baut Zielknoten, der Commit schreibt sie in derselben Transaktion wie Theme und Claim. `sectionPlanApplied` ist nur bei tatsächlich geschriebenem Plan ohne offene Needs wahr. Belege: `apply-redesign.ts`, `redesign-section-apply.ts`, `redesign-proposals.test.ts`, `redesign-transaction.test.ts`.

### P2-2 · Medienbedarfe operativ machen — erledigt 28.09.2026, Gate erfüllt

Bedarfe sind adressierbare Arbeitspakete mit Zielknoten und Prop-Pfad und werden über `POST /api/redesign-proposals/:id/media-needs` mit den kanonischen Mutationen aufgelöst. Die Ownership-Prüfung läuft **vor** dem Write; `avoid` bleibt absichtlich leer und ist **kein** Bedarf.

**Das Gate ist erfüllt:** `packages/app/test/media-needs-browser.test.ts` führt im echten Browser von der Quellseite über Bestätigen, Medienbedarf-Panel, `generate`-Job und `manual` bis zur eingereichten Review. Der Lauf benutzt die **echte** Provider-Kette (`custom` gegen einen lokalen Test-Endpunkt), keinen injizierten Stub — ein Stub ließe den Lauf grün, während die Kette kaputt ist, und genau die ist es, worauf ein `generate` sich stützt.

**Was der Bau am Produkt geändert hat, nicht nur am Test:** `rebuildPageTree` trug den **kaputten Asset-Verweis** aus der Quelle in den neu gebauten Knoten. Die Folge war ein 422 beim Review-Submit Stunden nach dem Apply — der Publish-Guard sah ein Asset, das nicht existiert. Jetzt wird ein Prop, dessen Slot der Plan als offenen Bedarf benannt hat, **nicht** übernommen. „Inhalt erhalten" heißt Inhalt erhalten; ein Verweis auf ein gelöschtes Asset ist kein Inhalt, sondern ein Loch, das der Plan schon benannt hat. Der Slot ist leer, der Mensch füllt ihn, und der Guard hat nichts zu beanstanden.

**Drei weitere Befunde aus dem Lauf, festgehalten weil sie wiederkehrten:** (1) Die Bildgenerierung ist ein **Job**; der Dialog wartet auf `succeeded`, nicht auf eine fertige Datei. (2) Der Status heißt `succeeded`/`canceled`, nicht `done`/`cancelled` — mit den falschen Namen wartete der Dialog endlos auf einen Zustand, den es nicht gibt. (3) Die Referenz braucht ein **gespeichertes Bild als Snapshot mit `previewPath`**, nicht nur eine `storageRef`; die Engine verweigert eine Richtung aus einer Referenz ohne Aufnahme, zu Recht — eine Richtungskarte ist ein Screenshot.

**Weiterhin nicht automatisch beschafft:** `select`/`upload`/`generate` benennen und bedienen, aber der Lauf beschafft nicht von allein. Das ist der bewusst offene Rest — die Bedienung steht, der Einkauf nicht.

### P2-3 · Proposal-TTL und Aufräumen (R2) — erledigt 27.09.2026

Sieben Tage `expires_at`, Sweep zu `expired`, Prüfung im Claim; abgelaufene Anwendung scheitert mit `conflict`. Beleg: `packages/engine/test/redesign-proposal-ttl.test.ts`.

### P2-4 · Design-Record (R4) — erledigt 27.09.2026

Versionierte Records werden bei Review und Publish gespeichert; Manifest und Re-Bake verweisen auf denselben Record. Beleg: `packages/engine/test/design-record.test.ts`.

**Gate P2:** Die genannten Engine- und Postgres-Tests sind im aktuellen Gesamt-Gate grün; Details stehen in `docs/current/qualitaet.md`.

---

## Priorität 3 — Reduktion, Verträge, Vollständigkeit

### P3-1 · Legacy-Editor ablösen (R5) — erledigt 28.09.2026

`packages/editor/src/mount.ts`, `legacy-editor.html` und Legacy-Browser-Tests sind entfernt. Der Canvas-Redirect und Bundle-Ausschluss sind getestet; `FrameRenderer` liegt in `frame-renderer.ts`. Historische Umsetzungsschritte unten sind abgeschlossen, keine offene Löschaufgabe.

### P3-2 · God-Files aufteilen (R12) — in Arbeit, erster Store-Schritt

**Ready:** vorheriger Folge-Diff ist gesichert; Scope dieses Schritts ist auf die privaten Row-Typen, Mapper und Parser-Helfer des `Store` begrenzt. Keine öffentliche Store-API wird verändert.

**Umsetzung:** Asset-, Code-Payload-, Collection- und Entry-Row-Mapping liegt in `packages/engine/src/store-record-mappers.ts`; gemeinsam genutzte DB-Zeilen-Konvertierungen liegen in `store-row-utils.ts`. Der Store-Operationscode bleibt noch groß und wird in separaten Schritten behandelt.

**Reihenfolge:** `store.ts`, `http.ts`, `mcp/tools.ts`, `app.js`; `mount.ts` entfällt mit P3-1. Nicht mehrere große Module gleichzeitig aufteilen.

**Gate dieses Schritts:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm quality:render`, `pnpm quality:check` und `git diff --check` am 29.09.2026 grün; vorhandene Assertions unverändert. Vor einem weiteren Schritt: Änderungen fachlich committen und `git status --short` leer prüfen. Bei Browser-/Build-Pfaden zusätzlich die passenden App-Gates.

### P3-3 · MCP-Schema-first (R8) — Punkte 1 bis 5 erledigt 28.09.2026

**Punkt 1 — `outputSchema` für die lesenden Werkzeuge.** `outputSchema` auf `ToolDefinition`, Schemata für `list_sites`, `get_site`, `list_pages`, `get_page`, `list_assets`, `list_references`. `structuredFor` im Server sendet `structuredContent` nur, wenn das Werkzeug ein Schema deklariert **und** der Wert es erfüllt; ein nicht passender Wert wird protokolliert und **ohne** Struktur geschickt, damit der Textblock die Wahrheit bleibt. Beim Bauen fiel ein Fehler auf, den der Server korrekt fand: das erste Listenschema sah `{ items: [...] }` vor, die Routen liefern aber `{ sites: … }` mit eigenem Schlüssel. Ein Schema, das der Code nicht hält, ist schlimmer als keines.

**Punkt 2 — ein Fehlerobjekt mit `retryable`.** Die Tabelle steht im Code, weil sie eine **Entscheidung** ist: von den fünf Engine-Kategorien ist nur `conflict` wiederholbar, denn dort liefert die Engine den aktuellen Zustand mit, den man erneut schicken kann. `validation`, `guardrail`, `not_found` und `auth` sind es nicht — bei `auth` ist das der wichtigste Fall, weil ein Agent, der 401 in einer Schleife wiederholt, wie ein Angriff aussieht. `attempt` zählt je (Werkzeug, Argumente), begrenzt auf 200 Einträge.

**Punkt 3 — Pagination.** `packages/engine/src/paging.ts`: `limit` mit Standard 50 und Kappe 200, `offset` validiert statt geklemmt. Eingespeist in Sites, Seiten, Assets, Einträge, Referenzzuweisungen, Releases, Bake-Jobs und Image-Jobs. Drei Entscheidungen: (1) **Kein Parameter heißt eine begrenzte Seite**, nicht die ganze Liste — sonst bleibt das Unbegrenzte der Normalfall. (2) Die Kappe wird **abgelehnt, nicht gekürzt**; eine stille Kürzung beantwortet eine andere Frage als die gestellte, und der Aufrufer merkt es nicht. (3) `total` und `hasMore` beschreiben die **gefilterte** Liste; ein `total` über den ganzen Bestand ließe einen Aufrufer aufhören, obwohl er die Auswahl nicht gesehen hat. Der aktive Release bleibt außerhalb des Blocks — er ist ein Zeiger, kein Listeneintrag, und wer Seite 3 der Historie liest, muss wissen, was live ist. Offset statt Cursor, bewusst: diese Listen werden von Menschen bearbeitet, und ein eingeschobener Datensatz ist heilbar; bei einem Nur-Anhängen-Log wäre er es nicht.

**Punkt 4 — das Manifest aus einem neutralen Paket.** `@senify/manifest`. `tools.ts` ist **generiert** (`pnpm manifest:render` liest `mcp/src/tools.ts` und schreibt 106 Werkzeuge), `types.ts` hält die Typen, `tools-index.ts` die Logik, `index.ts` den Join. Warum generiert und nicht handgeschrieben: drei Stellen lesen das Manifest, und eine Handkopie von 106 Werkzeugen ist eine Kopie, die beim ersten Rename driftet. **Die Grenze des Pakets steht im Code:** Schemas und Handler bleiben in `@senify/mcp`. Die Fakten über ein Werkzeug sind Daten; ein TypeBox-Schema ist ein lebendes Objekt, das der Engine-Vertrag gehört, und eine Kopie davon im Manifest wäre eine zweite Stelle zum Ändern. Was das Manifest trägt: Name, Scope, Titel, Beschreibung, Route, Gruppe, `writes` und die Parameter als Namen/Typ/Pflicht.

**Punkt 5 — der Zyklus ist aufgelöst.** `docs-portal` importierte `@senify/mcp/tools`, um die Werkzeuge zu dokumentieren, und zog damit den ganzen Server in den Doku-Build. Der Fahrplan nannte den Lazy-Import dafür „kaschiert"; er war kaschiert. Jetzt: `@senify/manifest`, ohne Server, ohne Zyklus. Dass `@senify/mcp` in den Abhängigkeiten des Doku-Portals **nicht** mehr steht, ist der Beweis.

**Was beim Bauen auffiel und festgehalten gehört:** Der erste Manifest-Aufbau ließ die generierte Datei ihre eigenen Helfer re-exportieren — ein Zyklus, der **erst im gebauten Bundle** als `Cannot read properties of undefined (reading 'map')` auftauch und keinen der beiden Module nannte. Ein Zyklus, der sich erst im Bundle zeigt, ist der Grund, warum der Join in einer dritten Datei liegt. Und: 15 der 106 Werkzeuge haben **keine** HTTP-Route, weil sie direkt am Store arbeiten. Das ist eine Eigenschaft des Werkzeugs, kein Extraktionsfehler — `manifest.test.ts` prüft es ausdrücklich, weil `null` („keine Route") und `null` („nicht gefunden") zwei verschiedene Behauptungen sind.

**Tests:** `paging.test.ts` (9 Fälle), `manifest.test.ts` (6), zwei in `mcp/test/workflow.test.ts`, `docs-portal` vollständig grün ohne MCP-Server.

**Noch offen:** strukturierte `outputSchema` für relevante Schreibwerkzeuge, `limit`/`offset` samt Metadaten an paginierten MCP-Werkzeugen sowie die gemeinsame Manifest-Quelle für MCP-Server und Routenmatrix. Diese Restpunkte werden jetzt umgesetzt, damit Schreibantworten programmatisch nutzbar sind und Generator-/Drift-Tests die Konsumenten synchron halten.

### P3-4 · Release-Manifest (R7) — erledigt 28.09.2026

Snapshot-Werte für Assets, Components, Payloads und Entries sind enthalten. Asset-Zeilen und verfügbare Bytes können aus dem Basis-Release wiederhergestellt werden; wenn Zeile und Datei fehlen, wird mit 422 verweigert. Belege: `lifecycle.ts`, `release-manifest.test.ts`.

### P3-5 · Import-Asset-Kompensation (R10) — erledigt 27.09.2026

Neu erzeugte Uploads werden nach fehlgeschlagenem DB-Commit kompensiert; negativer Fehlerpfad in `packages/engine/test/imports.test.ts`. Datei und DB sind keine gemeinsame Transaktion; dies bleibt eine dokumentierte Grenze.

### P3-6 · Doku-Prozesse und `.scratch/`-Hygiene — teilweise erledigt

- Coverage-Zahlenblock in `qualitaet.md` wird von `scripts/render-quality.mjs` erzeugt; CI führt `pnpm quality:check` aus.
- Historische Dokumente liegen unter `docs/history/`.
- `.scratch/`-Regel: Absicht und Werkzeuge bleiben getrackt; erzeugte Logs, Bilder und Messergebnisse werden ignoriert (`.gitignore`).
- Offen: Docs-Portal-Build als eigener sichtbarer CI-Schritt (aktuell in rekursivem Build enthalten) und Linting von `eslint.config.mjs`.

---

## Risiko-Register

| Nr. | Risiko | Status | Schritt |
|---|---|---|---|
| R1 | Kein Produktionsbuild | **Implementierung und aktuelle Build-/Artefakt-Gates geschlossen** (`pnpm verify`, 28.09.2026) | P0-4 |
| R2 | Keine Proposal-TTL / kein Aufräumen | **geschlossen** | P2-3 |
| R3 | Sektions-Plan nicht ausgeführt | **geschlossen** | P2-1 |
| R4 | Kein Design-Record | **geschlossen** | P2-4 |
| R5 | Legacy-Editor im Bundle | **geschlossen** | P3-1 |
| R6 | Idempotency-Completion-Fehler | **geschlossen** | P0-3 |
| R7 | Manifest ohne Snapshots | **geschlossen** | P3-4 |
| R8 | MCP-Schemas, Pagination und Manifest-Konsumenten nicht durchgängig | **teilweise geschlossen**; Schreib-`outputSchema`, MCP-Page-Inputs/-Metadaten und Manifest-Nutzung durch Server/Routenmatrix offen | P3-3 |
| R9 | Style-Registry-Klassen-Rename ohne Test | **geschlossen** | P3 (Mini-Schritt) |
| R10 | Import-Asset-Kompensation unbelegt | **Kompensationsvertrag geschlossen**; eine gemeinsame Datei-/DB-Tx besteht nicht | P3-5 |
| R11 | Kein PG-Service/Coverage/Fehlerpfade in CI | **Implementierung und aktuelle lokale Gates geschlossen**; CI-Jobs vorhanden | P1-1, P1-2 |
| R12 | God-Files | **offen** | P3-2 |
| R13 | Ursprünglicher Arbeitsbaum ungesichert | **Vorheriger Folge-Diff gesichert**; der aktuelle P3-2-Schritt bleibt bis Gate und Commit offen | P0-1 / P3-2 |

## Definition of Ready für neue Schritte

1. Der vorherige Prioritäts-Gate ist ausgeführt und grün.
2. `git status --short` ist sauber; ein historischer sauberer Commit reicht nicht, wenn ein neuer Folge-Diff entstanden ist.
3. Kein anderer Strang schreibt dieselben Dateien.
4. Zieldateien und betroffene Schnittstellen sind benannt.
5. Ein Test belegt den Ausgangsfehler, oder die Testlücke ist ausdrücklich benannt.

## Definition of Done

1. Gate ausgeführt und grün.
2. Jede Statusaussage in `stand.md` hat Code-/Testbeleg.
3. Risiko und offene Liste aktualisiert.
4. Neue Messzahlen nur in `docs/current/qualitaet.md`.
5. Es wird nichts committet, was nicht zum Schritt gehört.

## Arbeitsstand dieses Dokuments

| Datum | Änderung |
|---|---|
| 29.09.2026 | P0-1-Folge-Diff in `2a0afde`/`aad9550` gesichert. P3-2 begann mit einer reinen Store-Mapper-Auslagerung; Typprüfung, Lint, Volltest und Coverage bestanden. P3-2 bleibt offen, bis auch die weiteren Module zerlegt sind. |
| 28.09.2026 | Folge-Diff fachlich geprüft und alle P0-Gates grün ausgeführt. A11y-Browser-Test gegen Debounce/Ladeablauf synchronisiert; vollständiges `pnpm verify`, Visual, Parity, Import, Coverage, PostgreSQL und `quality:check` bestanden. PostgreSQL lief isoliert lokal gegen 18.6, ohne den bestehenden Dienst anzutasten. `data/` und leeres `full.log` als lokale Laufzeit-/Testausgaben klassifiziert und ignoriert. Folge-Diff ist noch zu sichern; P3-2 startet erst nach sauberem Status. |
