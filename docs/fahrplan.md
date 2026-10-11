# Fahrplan

> **Dokumenttyp:** fortlaufender Umsetzungsplan mit Gates. Dieses Dokument begleitet die Umsetzung und wird bei jedem abgeschlossenen Schritt aktualisiert.
> **Stand:** 29.09.2026 · **Basis:** die geprüfte Folgearbeit ist in `2a0afde` und `aad9550` gesichert. Der erste Schritt von P3-2 (Store-Row-Mapping) ist als `0193fde` committet; sein Gate war grün. Der Ist-Abgleich steht in `docs/current/stand.md`, `docs/current/architektur.md` und `docs/current/qualitaet.md`. Historische Abschnitte bleiben Verlauf und sind nicht automatisch der heutige Status.
> **Nicht verbindlich hier:** Testzahlen (gehören nach `docs/current/qualitaet.md`), Fachbegriffe (`CONTEXT.md`), angenommene Entscheidungen (`docs/adr/`).
> **Ersetzt:** `docs/history/umbauplan.md` (siehe `docs/README.md` für Vorrangregeln).

## Wie dieses Dokument arbeitet

- **P0 → P3** ist die priorisierte Reihenfolge; erledigte Schritte werden nicht erneut gestartet.
- Jeder offene Schritt hat Ready, Umsetzung, Gate und Done. Ohne grünen Gate kein nächster Umsetzungsschritt.
- `R1`–`R13` sind zwischen Fahrplan, Stand und Architektur synchron zu halten.
- Fertig heißt: Gate ausgeführt, Code/Testbeleg notiert, Risiko aktualisiert und – falls Zahlen betroffen sind – `qualitaet.md` ausschließlich mit Messdaten aktualisiert.
- Der historische P0-1-Commit hat einen damals sauberen Baum gesichert. Er ersetzt nicht die DoR-Bedingung, wenn danach erneut ein Folge-Diff entstanden ist.

---

## Aktueller DoR-Stand

Der frühere Blocker, ein uncommitteter Store-Mapper-Schritt, ist aufgehoben: Der geprüfte Folge-Diff ist in `2a0afde` und `aad9550` gesichert, der eng begrenzte erste P3-2-Schritt in `0193fde`. Er extrahiert Store-Row-Mapping nach `store-record-mappers.ts` und `store-row-utils.ts`; Typecheck, Lint, Volltest und Coverage waren am 29.09.2026 grün. Jeder weitere Schritt startet mit einem sauberen `git status --short` (siehe Definition of Ready). Frühere App-/DB-Gates und aktuelle Zahlen stehen ausschließlich in `docs/current/qualitaet.md`.

---

## Priorität 0 — Grundlage sichern und ehrlich machen

### P0-1 · Arbeitsbaum in fachlichen Commits sichern — ursprünglicher Bestand historisch erledigt; Folge-Diff gesichert 29.09.2026

Zehn fachliche Commits (`1e4645a…67a2862`) sicherten den ursprünglichen Bestand. Der spätere geprüfte Folge-Diff ist ebenfalls gesichert (`2a0afde`, `aad9550`). Der Store-Mapper-Schritt gehört zu P3-2 und ist als `0193fde` gesichert.

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

`.github/workflows/verify.yml` führt einen eigenen `postgres-tests`-Job mit Postgres 18 und `TEST_DATABASE_URL`. `pnpm test:postgres` wird rot, wenn ein Fall übersprungen wird oder keiner läuft. Der aktuelle Folge-Diff bestand die Lane lokal mit sechs Fällen gegen PostgreSQL 18.6, null übersprungen. Test-Fixture erstellt und entfernt ein eigenes Schema.

### P1-2 · Coverage-Schwellen (R11, Teil 2) — erledigt 28.09.2026

`vitest.config.ts` nutzt v8 und `perFile: true`; `pnpm test:coverage` prüft geschützte Pfade aus engine, editor und mcp. Gezielte Fehlerpfade: `error-paths.test.ts` (Idempotency-Release, Completion ohne Slot, Rollback), `auth.test.ts` (`operatorOnly`), `mutations.test.ts` (`baseVersion`-409) und `imports.test.ts` (Asset-Kompensation). Coverage bleibt ein Messwert der ausgeführten Tests und kein Vollständigkeitsbeweis. Zahlen ausschließlich in `docs/current/qualitaet.md`; das aktuelle Coverage-Gate ist grün.

### P1-3 · Lint-Ziel erweitern — erledigt 26.09.2026, Root-Config seit 04.10.2026 im Ziel

`pnpm lint` führt `eslint packages scripts eslint.config.mjs` aus; `pnpm check:patch` hängt in `verify`. Die Root-Konfiguration ist seit 04.10.2026 im Lint-Ziel (Beleg: Skript `lint` in `package.json`; der Lint-Lauf ist grün).

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

### P3-2 · God-Files aufteilen (R12) — in Arbeit, Mapper/Registry/HTTP/MCP plus neun Fach-Module (ADR-0019)

**Ready:** vorheriger Folge-Diff ist gesichert; Scope dieses Schritts ist auf die privaten Row-Typen, Mapper und Parser-Helfer des `Store` begrenzt. Keine öffentliche Store-API wird verändert.

**Umsetzung:**
1. `store-record-mappers.ts` + `store-row-utils.ts` (`0193fde`): Asset-, Code-Payload-, Collection- und Entry-Row-Mapping und die gemeinsamen DB-Zeilen-Konvertierungen.
2. `store-audit.ts` + `store-style-rules.ts` (08.10.2026): der Audit-Insert (`buildAuditInsert`, `NewAuditEntry`) und die komplette Style-Registry. Der Cluster umfasste die Rule-Helfer (`buildStyleRule`, `withExtras`, Namens-/Selektor-Prüfungen), die harten Schreibprüfungen (`assertWritableRule` — jetzt exportiert, weil der Framer-Import seine Regeln in derselben Transaktion prüft), die Agent-Zäune und die neun Registry-Methoden samt ihres optimistischen Locks. `Store` behält die öffentliche API und delegiert; `assertWritableRule` wird an der einen Stelle außerhalb des Clusters (Framer-Import) direkt importiert.
3. `http-response.ts` + `http-build-files.ts` (08.10.2026): die Antwort-Primitive (`sendJson`, `sendText`, `sendFile`, `sendError`, `statusFor`, `CONTENT_TYPES`) und die Auslieferung aus einem Bake. `http-build-files.ts` hält, was einen Build liest: das Token-Portal der signierten Vorschau (`sameToken` konstantzeitlich), das Rewriting der Root-URLs, die Index-Auflösung, die Root-Dateien und die Frage, welcher Build überhaupt bedient (`?release=`/`?preview=`/aktives Release/neueste Vorschau). Beide Module bekommen ihren engen Kontexttyp (`BuildFileContext = { store }`) und keinen Zugriff auf die Route-Tabelle; `http.ts` bedient sich ihrer und behält Dispatcher und Routen.
4. `tools-support.ts` + `tools-components.ts` (09.10.2026): die geteilte MCP-Maschinerie. `tools-support.ts` hält Registry, Schema-Bausteine (`objectSchema`, `listSchema`, `pagingQuery`), die Argument-Wächter (`requireString` & Co.), MIME-Erkennung, Datei-Lesen/-Upload und die Info-Formatierer (`propInfo`, `sectionInfo`, `pageFor`); `tools-components.ts` hält den Komponenten-Walk (`walkComponent`, `readOverrideBag`, `definitionVersion`, `componentInstanceList`, `componentName`). **Die Werkzeug-Definitionen bleiben in `tools.ts`**: `scripts/render-manifest.mjs` liest genau diese Datei als Text, ein Verschieben ließe Werkzeuge still aus dem Manifest fallen. `tools.ts` (3759 → 3417 Zeilen) importiert beide Module.
5. `store-forms.ts` + `store-forms.test.ts` (10.10.2026, `f328c69`): die sechs Formular-Operationen als `FormsRepository` (nur `Db` als Abhängigkeit); Tail-Mapper (`store-form-mappers.ts`, `store-job-mappers.ts`, `store-reference-mappers.ts`, `store-settings-mappers.ts`) und `toBoolean` nach `store-row-utils.ts`.
6. `store-settings.ts` + `store-settings.test.ts` (10.10.2026, `f5abcb6`): die acht Einstellungs-Operationen als `SettingsRepository` (7 Fälle); `isUniqueViolation` nach `store-row-utils.ts`.
7. `store-releases.ts` + `store-releases.test.ts` (10.10.2026, `8d45ed0`): die acht Release-Operationen als `ReleasesRepository` (7 Fälle), Einzeltransaktionen bleiben im Modul.
8. `store-deploy.ts` + `store-deploy.test.ts` (10.10.2026, `21b24c4`): fünf Deployment- plus vier Deploy-Einstellungs-Operationen als `DeployRepository` (9 Fälle); `getSite`-Existenzprüfung als Konstruktor-Funktion (ADR-0019 Punkt 7 präzisiert).
9. `store-notifications.ts` + `store-notifications.test.ts` (10.10.2026, `b43fe1a`): fünf Outbox- plus drei Newsletter-Token-Operationen als `NotificationsRepository` (10 Fälle); Row-Mapper bleiben in `store-form-mappers.ts`.
10. `store-reference-library.ts` + `store-reference-library.test.ts` (10.10.2026, `27f5109`): fünf Sammlungs-Operationen als `ReferenceLibraryRepository` (8 Fälle); zwei Store-interne Helfer ziehen als Modul-Methoden mit.
11. `store-entries.ts` + `store-entries.test.ts` (10.10.2026, `b499636`): 17 Entry-Operationen als `EntriesRepository` (14 Fälle); `entryConflictError` wird im Modul genutzt. `store.ts` steht nach dem Merge bei 6165 Zeilen.
12. `store-bake-jobs.ts` + `store-bake-jobs.test.ts` (11.10.2026): die sieben Operationen der Re-bake-Queue (E12) als `BakeJobsRepository` (5 Fälle: Dedup, Claim pro Site, Backoff bis Erschöpfung, abgelaufener Lease, `not_found`). Die Eingabetypen sind jetzt benannt (`EnqueueBakeJobInput`, `ClaimBakeJobInput`, `FailBakeJobInput`). Previews und Review-Items im selben Abschnitt bleiben vorerst in `store.ts`. `store.ts`: 6165 → 6022 Zeilen.
13. `store-reviews.ts` + `store-reviews.test.ts` (11.10.2026): vier Preview- und vier Review-Item-Operationen als `ReviewsRepository` (5 Fälle: Preview-Roundtrip und idempotentes Ablaufen, Review mit Eröffnungsnotiz, Statusfilter, Kommentar-Append mit Teil-Patch, `not_found`). Row-Typen, Mapper und `REVIEW_STATUS_VALUES` ziehen mit, weil nur dieser Abschnitt sie nutzt; die Eingabetypen sind benannt. `store.ts`: 6022 → 5787 Zeilen.

**Zweiter Schritt (07.10.2026):** Die übrigen Row-Typen, Spaltenlisten und Mapper am Ende von `store.ts` (alles hinter dem Audit-Insert) liegen jetzt in vier Fach-Modulen: `store-form-mappers.ts` (Formular-Schnappschüsse, Benachrichtigungen, Newsletter-Token), `store-reference-mappers.ts` (Referenzen, Sammlungen, Einstellungen, Profile, Referenz-Jobs, Zuweisungen), `store-job-mappers.ts` (Import-, Bake- und Image-Jobs) und `store-settings-mappers.ts` (SMTP-, Engine- und Image-Einstellungen); `toBoolean` wanderte nach `store-row-utils.ts`. `store.ts` schrumpft von 8831 auf 8179 Zeilen. Die Verschiebung ist mechanisch: jede aus `store.ts` verschwundene Zeile steht unverändert in einem neuen Modul, `store.ts` gewinnt nur Import-Zeilen, die Store-API ist unverändert. Beleg: `pnpm typecheck` und `pnpm lint` grün, alle Engine-, Editor- und MCP-Tests grün (`pnpm test:coverage` Exit 0), vorhandene Assertions unverändert.

**Entscheidung (08.10.2026, ADR-0019, am 09.10.2026 von Adi angenommen):** Die `Store`-Klasse (rund 6 990 Zeilen, 252 Methoden) wird schrittweise zur dünnen Fassade über Fach-Module (`store-<fachgebiet>.ts`, Klasse `<Fachgebiet>Repository`). Adi wählte im Frage-Dialog Variante A (Fach-Module mit `Db`-Zugriff, `Store` delegiert) statt mehrerer Stores (B) oder Mixins (C). Fachübergreifende Transaktionen gehören dem Aufrufer (die drei, `applyRedesignPlan`, `duplicateSiteWithPlan` und `commitFramerImportPlan`, bleiben zuletzt am `Store`); eine Transaktion, die in einer Modul-Methode beginnt und endet, zieht mit ins Modul (ADR-0019, Punkt 4, am 09.10.2026 präzisiert). Reihenfolge der Fachgebiete: Formulare, Einstellungen, danach Fachgebiete mit Einzeltransaktionen.

**Dritter Schritt (08.10.2026), Formulare:** `packages/engine/src/store-forms.ts` (`FormsRepository`) enthält die sechs Formular-Operationen (`getOrCreateFormSecret`, `resolveFormId`, `saveFormSnapshot`, `getFormSnapshot`, `getFormSnapshotForForm`, `listFormSnapshots`) unverändert; `Store` hält eine Instanz und delegiert je Methode in einer Zeile, die öffentliche Signatur ist gleich geblieben (`SaveFormSnapshotInput` wird aus dem Modul wiederverwendet). `store.ts` schrumpft von 8177 auf 8098 Zeilen. Beleg: `packages/engine/test/store-forms.test.ts` (5 Fälle, vor dem Modul rot mit „Cannot find module '../src/store-forms.ts'", danach grün) prüft das Modul und die Gleichheit mit der Fassade; `forms.test.ts` läuft unverändert weiter.

**Vierter Schritt (08.10.2026), Einstellungen:** `packages/engine/src/store-settings.ts` (`SettingsRepository`) enthält die acht Operationen der vier Einzeilen-Einstellungen (SMTP, Engine, Bild, Referenzen: je `get…Settings`/`update…Settings`) unverändert; `Store` delegiert je Methode in einer Zeile. Mit ins Modul zogen die drei öffentlich exportierten Patch-Typen (`store.ts` re-exportiert sie, `index.ts` bleibt unverändert) und der neue `ReferenceSettingsPatch`; `isUniqueViolation` liegt jetzt in `store-row-utils.ts`, weil `store.ts` es weiter braucht. Nicht Teil des Schnitts: die zwei Deploy-Einstellungen, sie rufen `getSite` und folgen mit dem Fachgebiet Sites (ADR-0019, Punkt 7). `store.ts` schrumpft von 8098 auf 7797 Zeilen. Beleg: `packages/engine/test/store-settings.test.ts` (7 Fälle, vor dem Modul rot mit „Cannot find module '../src/store-settings.ts'", danach grün) prüft das Modul, die Patch-Semantik, die Provider-Validierung und die Gleichheit mit der Fassade; `settings.test.ts`, `backup-restore.test.ts` und `forms.test.ts` laufen unverändert weiter. Jede aus `store.ts` entfernte Zeile steht unverändert im neuen Code, abgesehen vom ergänzten `export` an `isUniqueViolation` und der Signatur von `updateReferenceSettings`.

**Fünfter Schritt (09.10.2026), Releases:** `packages/engine/src/store-releases.ts` (`ReleasesRepository`) enthält die acht Release-Operationen (`createRelease`, `activateRelease`, `finalizeRelease`, `updateReleaseManifest`, `getRelease`, `listReleases`, `getActiveReleaseId`, `attachReleaseBuild`) samt dem privaten `ReleaseRow` und `mapRelease`; `Store` delegiert je Methode in einer Zeile. Die beiden Transaktionen `activateRelease` und `finalizeRelease` beginnen und enden in je einer Methode und stehen deshalb im Modul (ADR-0019, Punkt 4). Die drei Inline-Parametertypen sind als `CreateReleaseInput`, `ActivateReleaseInput` und `FinalizeReleaseInput` benannt, damit `Store` sie nicht doppelt ausschreibt; die Feldlisten sind unverändert, die öffentliche Signatur ist gleich geblieben. `store.ts` schrumpft von 7797 auf 7642 Zeilen. Beleg: `packages/engine/test/store-releases.test.ts` (7 Fälle, vor dem Modul rot mit „Failed to load url ../src/store-releases.ts", danach grün) prüft Lesen, Sortierung und Limit, `not_found`, einmalige Aktivierung und Finalisierung mit `conflict` bei Wiederholung (Build-Ref und aktiver Zeiger bleiben stehen), das Sperren von `attachReleaseBuild`/`updateReleaseManifest` nach gesetztem Build-Ref und die Gleichheit mit der Fassade; `release-manifest.test.ts` und die übrigen Release-Tests laufen unverändert weiter. Jede aus `store.ts` entfernte Zeile steht unverändert im neuen Code, abgesehen von den drei Inline-Signaturen und dem nun ungenutzten Import `ReleasePageRevision`. Grenze: Die Atomarität (Rollback bei Fehler mitten in der Transaktion) ist mit pg-mem nicht prüfbar; der Konfliktpfad ist sequentiell abgedeckt, weil das erste `UPDATE` bei Konflikt 0 Zeilen trifft, bevor das `INSERT` läuft.

**Sechster Schritt (10.10.2026), Deployments und Deploy-Einstellungen:** `packages/engine/src/store-deploy.ts` (`DeployRepository`) enthält die fünf Deployment-Operationen (`createDeployment`, `finishDeployment`, `getDeployment`, `listDeployments`, `updateDeploymentTarget`) und die vier Deploy-Einstellungs-Operationen (`getDeploySettings`, `updateDeploySettings`, `getNetlifyTokenEncrypted`, `getVercelTokenEncrypted`; ADR-0019 und der vierte Schritt sprachen irrtümlich von zwei) samt `DeploymentRow`, `DeploySettingsRow` und `mapDeployment`; `Store` delegiert je Methode in einer Zeile. Der Schnitt weicht in einem Punkt von der bisherigen Planung ab (ADR-0019, Punkt 7, am 10.10.2026 präzisiert): Die Deploy-Einstellungen warten nicht auf ein Sites-Modul, sondern das Modul bekommt die Existenzprüfung als Funktion im Konstruktor (`(siteId) => this.getSite(siteId)` im `Store`) und kennt den `Store` nicht. Keine Transaktion beteiligt. Die drei Inline-Parametertypen heißen jetzt `CreateDeploymentInput`, `FinishDeploymentInput` und `DeploySettingsPatch` (Feldlisten unverändert, öffentliche Signaturen gleich geblieben). `store.ts` schrumpft von 7642 auf 7415 Zeilen. Beleg: `packages/engine/test/store-deploy.test.ts` (9 Fälle, vor dem Modul rot mit „Cannot find module '../src/store-deploy.ts'“, danach grün) prüft den Lebenslauf eines Deployments, `not_found` mit Feld `deploymentId`, Sortierung und Limit, das Ziel-Update, die Default-Einstellungen, die injizierte Existenzprüfung (wird mit der Site-ID gerufen, `not_found` mit Feld `siteId`), Token behalten, ersetzen und löschen ohne Klartext-Rückgabe, die Validierung ohne Teil-Schreiben und die Gleichheit mit der Fassade; `deploy.test.ts` läuft unverändert weiter. Jede aus `store.ts` entfernte Zeile steht unverändert im neuen Code, abgesehen von den zwei nun ungenutzten Typ-Importen, den drei Inline-Signaturen und `this.getSite` → `this.#getSite`.

**Siebter Schritt (10.10.2026), Notifications:** `packages/engine/src/store-notifications.ts` (`NotificationsRepository`) enthält die acht übrigen Methoden des Abschnitts „forms (T11)“, die nicht zu den Formular-Schnappschüssen gehören: die Notification-Outbox (`enqueueNotification`, `getNotification`, `listNotifications`, `listDueNotifications`, `markNotificationResult`) und die einmal verwendbaren Newsletter-Tokens (`createNewsletterToken`, `getNewsletterToken`, `markNewsletterTokenUsed`); `Store` delegiert je Methode in einer Zeile. Beide Teile hängen an der Zustellung der Formular-Mails und teilen sich die Mapper aus `store-form-mappers.ts`, deshalb ein Modul. Keine Transaktion, keine Abhängigkeit nach außen (nur `Db`). Die drei Inline-Parametertypen heißen jetzt `EnqueueNotificationInput`, `MarkNotificationResultInput` und `CreateNewsletterTokenInput` (Feldlisten unverändert, öffentliche Signaturen gleich geblieben). `store.ts` schrumpft von 7415 auf 7279 Zeilen. Beleg: `packages/engine/test/store-notifications.test.ts` (10 Fälle, vor dem Modul rot mit „Cannot find module '../src/store-notifications.ts'“, danach grün) prüft Einreihen, `not_found` mit Feld `notificationId`, Sortierung und Limit je Site, die Fälligkeitsliste (nur wartende Nachrichten, nach geplantem Versuchszeitpunkt aufsteigend, Limit), das Zustellergebnis, Token ausstellen, Ablaufdatum, die einmalige Verwendung (die erste Verwendungszeit bleibt), `not_found` mit Feld `token` und die Gleichheit mit der Fassade; `forms.test.ts` läuft unverändert weiter. Jede aus `store.ts` entfernte Zeile steht unverändert im neuen Code, abgesehen von zwei nun ungenutzten Typ-Importen und den drei Inline-Signaturen.

**Achter Schritt (10.10.2026), Referenz-Bibliothek:** `packages/engine/src/store-reference-library.ts` (`ReferenceLibraryRepository`) enthält den Abschnitt „reference library (T14)“: die fünf Sammlungs-Operationen (`createReferenceCollection`, `getReferenceCollection`, `listReferenceCollections`, `updateReferenceCollection`, `deleteReferenceCollection`) und die vier Hilfen für Nachschlagen und Zähler. Zwei davon (`findReferenceCollection`, `referenceCollections`) verlieren das `#`, weil die Referenz-Operationen des `Store` sie aufrufen (drei Aufrufstellen, jetzt über `this.#referenceLibrary`); sie gehören nicht zur Store-API. `Store` delegiert je Methode in einer Zeile. Die zwei Inline-Parametertypen heißen jetzt `CreateReferenceCollectionInput` und `ReferenceCollectionPatch` (Feldlisten unverändert, öffentliche Signaturen gleich geblieben). Abhängigkeit nach außen: nur `Db`. Eine Einzeltransaktion: `deleteReferenceCollection` setzt `design_references.collection_id` auf `NULL` und löscht dann die Sammlung; sie berührt damit eine Tabelle des späteren Referenz-Moduls, ruft aber keine fremde Methode auf. ADR-0019 Punkt 4 ist dafür präzisiert (siehe ADR). `store.ts` schrumpft von 7279 auf 7134 Zeilen. Beleg: `packages/engine/test/store-reference-library.test.ts` (8 Fälle, vor dem Modul rot mit „Cannot find module '../src/store-reference-library.ts'“, danach grün) prüft die Standardwerte, alle Felder inklusive Art `style` und externer ID, `not_found` mit Feld `collectionId`, Sortierung nach Position und Name samt Art-Filter und Zählern, teilweise Änderung (`warning: null` löscht), das Löschen (Verweise bleiben ohne Sammlung, Anzahl wird zurückgegeben, zweites Löschen ist `not_found`), die beiden Nachschlage-Hilfen und die Gleichheit mit der Fassade; `references-library.test.ts` läuft unverändert grün, ebenso die Browser-Tests `references-browser` und `visual-snapshot-browser` im Einzellauf (Stand in `docs/current/qualitaet.md`). Nicht belegt: die Atomarität der Lösch-Transaktion, denn pg-mem kann keinen Rollback nachstellen (dafür braucht der Test `TEST_DATABASE_URL`). Jede aus `store.ts` entfernte Zeile steht unverändert im neuen Code, abgesehen von den zwei Inline-Signaturen, den zwei umbenannten Hilfen, den drei Aufrufstellen im `Store` und den nun ungenutzten Importen.

**Neunter Schritt (10.10.2026), Entries:** `packages/engine/src/store-entries.ts` (`EntriesRepository`) enthält den Abschnitt „entries (T09)“: die acht Eintrags-Operationen (`listEntries`, `getEntry`, `findLiveEntryBySlug`, `findPublishedEntryBySlug`, `createEntry`, `updateEntryRow`, `setEntryDeleted`, `deleteEntryRecord`), die fünf Versions-Operationen (`createEntryVersion`, `getEntryVersion`, `listEntryVersions`, `maxEntryVersionNumber`, `deleteEntryVersions`) und die vier Slug-Weiterleitungen (`createEntryRedirect`, `findEntryRedirect`, `deleteEntryRedirect`, `listEntryRedirects`); `Store` delegiert je Methode in einer Zeile. Keine Transaktion, keine Abhängigkeit nach außen (nur `Db`); die Schreibpfade der Inhalte (`updateEntryRow` mit erwarteter Version, `entryConflictError` bei Konflikt) bleiben unverändert im Modul. Die fünf Inline-Parametertypen heißen jetzt `ListEntriesFilter`, `CreateEntryInput`, `UpdateEntryRowInput`, `CreateEntryVersionInput` und `CreateEntryRedirectInput` (Feldlisten unverändert, öffentliche Signaturen gleich geblieben). Der `Store`-Delegat von `listEntryVersions` deklariert `limit?: number` und reicht `undefined` durch, sodass der Standardwert 50 weiter im Modul gilt. `store.ts` schrumpft von 7134 auf 6856 Zeilen. Beleg: `packages/engine/test/store-entries.test.ts` (14 Fälle, vor dem Modul rot mit „Failed to load url ../src/store-entries.ts“, danach grün) prüft das Anlegen als Version 1, `not_found` mit Feld `entryId` und `versionId`, die Sortierung (neueste zuerst) mit Filtern nach Collection, Status, Papierkorb und Suchbegriffen sowie Limit, die Suche nach dem Slug (lebende Einträge, Papierkorb gibt den Slug frei, `exceptId`), die veröffentlichte Auflösung über den Eintrags-Slug oder den Slug der aktiven Version (Entwurf und Papierkorb nicht), die optimistische Version (neue Version, veralteter Stand ergibt `conflict` mit Feld `baseVersion`, unbekannter Eintrag `not_found`), Papierkorb und Wiederherstellung ohne Versionssprung, das Löschen samt Versionen (zweites Löschen `not_found`), die unveränderlichen Schnappschüsse mit begrenztem Limit und höchster Nummer, das gezielte Löschen von Versionen (leere Liste ändert nichts), die Weiterleitungen (jüngste je Pfad gewinnt, Liste älteste zuerst, Löschen je Pfad) und die Gleichheit mit der Fassade; `content.test.ts`, `bake.test.ts` und `templates.test.ts` laufen unverändert grün, ebenso die Browser-Tests `entry-preview-browser` und `submissions-browser` im Einzellauf (Stand in `docs/current/qualitaet.md`). Jede aus `store.ts` entfernte Zeile steht unverändert im neuen Code, abgesehen von den fünf Inline-Signaturen (Anfang und Ende; die Feldzeilen stehen um zwei Leerzeichen eingerückt weniger) und den zehn nun ungenutzten Import-Zeilen.

**Reihenfolge:** `store.ts`, `http.ts`, `mcp/tools.ts`, `app.js`; `mount.ts` entfällt mit P3-1. Nicht mehrere große Module gleichzeitig aufteilen.

**Gate dieses Schritts:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm quality:render`, `pnpm quality:check` und `git diff --check` am 29.09.2026 grün; vorhandene Assertions unverändert. Vor einem weiteren Schritt: Änderungen fachlich committen und `git status --short` leer prüfen. Bei Browser-/Build-Pfaden zusätzlich die passenden App-Gates. Der vierte Schritt (09.10.2026) lief mit typecheck, lint, Coverage-Volllauf (1068/15/0), `quality:render`/`quality:check` und `check:patch` grün. **Gate des zweiten Schritts (07.10.2026):** dieselben Kommandos; `pnpm test` hatte zwei rote Browser-Tests ohne Bezug zur Auslagerung (Einordnung in `docs/current/qualitaet.md`), alles andere grün.

### P3-3 · MCP-Schema-first (R8) — geschlossen 07.10.2026

**Punkt 1 — `outputSchema` für die lesenden Werkzeuge.** `outputSchema` auf `ToolDefinition`, Schemata für `list_sites`, `get_site`, `list_pages`, `get_page`, `list_assets`, `list_references`. `structuredFor` im Server sendet `structuredContent` nur, wenn das Werkzeug ein Schema deklariert **und** der Wert es erfüllt; ein nicht passender Wert wird protokolliert und **ohne** Struktur geschickt, damit der Textblock die Wahrheit bleibt. Beim Bauen fiel ein Fehler auf, den der Server korrekt fand: das erste Listenschema sah `{ items: [...] }` vor, die Routen liefern aber `{ sites: … }` mit eigenem Schlüssel. Ein Schema, das der Code nicht hält, ist schlimmer als keines.

**Punkt 2 — ein Fehlerobjekt mit `retryable`.** Die Tabelle steht im Code, weil sie eine **Entscheidung** ist: von den fünf Engine-Kategorien ist nur `conflict` wiederholbar, denn dort liefert die Engine den aktuellen Zustand mit, den man erneut schicken kann. `validation`, `guardrail`, `not_found` und `auth` sind es nicht — bei `auth` ist das der wichtigste Fall, weil ein Agent, der 401 in einer Schleife wiederholt, wie ein Angriff aussieht. `attempt` zählt je (Werkzeug, Argumente), begrenzt auf 200 Einträge.

**Punkt 3 — Pagination.** `packages/engine/src/paging.ts`: `limit` mit Standard 50 und Kappe 200, `offset` validiert statt geklemmt. Eingespeist in Sites, Seiten, Assets, Einträge, Referenzzuweisungen, Releases, Bake-Jobs und Image-Jobs. Drei Entscheidungen: (1) **Kein Parameter heißt eine begrenzte Seite**, nicht die ganze Liste — sonst bleibt das Unbegrenzte der Normalfall. (2) Die Kappe wird **abgelehnt, nicht gekürzt**; eine stille Kürzung beantwortet eine andere Frage als die gestellte, und der Aufrufer merkt es nicht. (3) `total` und `hasMore` beschreiben die **gefilterte** Liste; ein `total` über den ganzen Bestand ließe einen Aufrufer aufhören, obwohl er die Auswahl nicht gesehen hat. Der aktive Release bleibt außerhalb des Blocks — er ist ein Zeiger, kein Listeneintrag, und wer Seite 3 der Historie liest, muss wissen, was live ist. Offset statt Cursor, bewusst: diese Listen werden von Menschen bearbeitet, und ein eingeschobener Datensatz ist heilbar; bei einem Nur-Anhängen-Log wäre er es nicht.

**Punkt 4 — das Manifest aus einem neutralen Paket.** `@senify/manifest`. `tools.ts` ist **generiert** (`pnpm manifest:render` liest `mcp/src/tools.ts` und schreibt 106 Werkzeuge), `types.ts` hält die Typen, `tools-index.ts` die Logik, `index.ts` den Join. Warum generiert und nicht handgeschrieben: drei Stellen lesen das Manifest, und eine Handkopie von 106 Werkzeugen ist eine Kopie, die beim ersten Rename driftet. **Die Grenze des Pakets steht im Code:** Schemas und Handler bleiben in `@senify/mcp`. Die Fakten über ein Werkzeug sind Daten; ein TypeBox-Schema ist ein lebendes Objekt, das der Engine-Vertrag gehört, und eine Kopie davon im Manifest wäre eine zweite Stelle zum Ändern. Was das Manifest trägt: Name, Scope, Titel, Beschreibung, Route, Gruppe, `writes` und die Parameter als Namen/Typ/Pflicht.

**Punkt 5 — der Zyklus ist aufgelöst.** `docs-portal` importierte `@senify/mcp/tools`, um die Werkzeuge zu dokumentieren, und zog damit den ganzen Server in den Doku-Build. Der Fahrplan nannte den Lazy-Import dafür „kaschiert"; er war kaschiert. Jetzt: `@senify/manifest`, ohne Server, ohne Zyklus. Dass `@senify/mcp` in den Abhängigkeiten des Doku-Portals **nicht** mehr steht, ist der Beweis.

**Was beim Bauen auffiel und festgehalten gehört:** Der erste Manifest-Aufbau ließ die generierte Datei ihre eigenen Helfer re-exportieren — ein Zyklus, der **erst im gebauten Bundle** als `Cannot read properties of undefined (reading 'map')` auftauch und keinen der beiden Module nannte. Ein Zyklus, der sich erst im Bundle zeigt, ist der Grund, warum der Join in einer dritten Datei liegt. Und: 15 der 106 Werkzeuge haben **keine** HTTP-Route, weil sie direkt am Store arbeiten. Das ist eine Eigenschaft des Werkzeugs, kein Extraktionsfehler — `manifest.test.ts` prüft es ausdrücklich, weil `null` („keine Route") und `null` („nicht gefunden") zwei verschiedene Behauptungen sind.

**Tests:** `paging.test.ts` (9 Fälle), `manifest.test.ts` (6), zwei in `mcp/test/workflow.test.ts`, `docs-portal` vollständig grün ohne MCP-Server.

**Punkt 6 — MCP-Pagination (PR #2, `64a35ae`, 07.10.2026).** Die paginierten Listenwerkzeuge nehmen `limit`/`offset` und liefern `total`/`hasMore`; der Manifest-Generator behandelt den Query-String nicht als Pfadparameter (sonst würde `list_assets` als `assets:param` lesen). Beleg: `mcp/test/paging.test.ts`.

**Punkt 7 — Schreib-`outputSchema` (PR #3, `e294b59`, 07.10.2026).** `create_site`, `create_page`, `create_preview`, `submit_for_review`, `publish_release`, `rollback_release` deklarieren ein Schema; `publish_release` und `rollback_release` teilen `RELEASE_RESULT_SCHEMA`, die neue Release-ID kommt als `structuredContent`. Beleg: `mcp/test/write-output.test.ts` (war vor dem Schema rot).

**Punkt 8 — gemeinsame Manifest-Quelle (07.10.2026).** `@senify/manifest` trägt je Werkzeug alle gerufenen Routen (`routes`, `:param`-Form); die Routenmatrix wird daraus erzeugt (`buildRouteMatrixFromManifest` statt `tools.ts`-Textparsing), der Server spiegelt Name/Scope/Titel/Beschreibung live aus `TOOLS` (`mcp/test/manifest-mirror.test.ts`). Dabei gefunden und behoben: der Generator las Parameter-`description` als Tool-Text (`set_component_override`), verschluckte `request<Type>`-Aufrufe (4 Mutations-/Komponenten-Tools) und buk verschachtelte Templates ins `routeExample` (`list_references`); die Parser lesen CR-bereinigt (CRLF-Blobs brachen den Block-Split). Die Matrix ist dadurch strenger geworden (90 statt 92 Tool-Routen): zwei alte Zuschreibungen (`assets/:assetId`-GET, `entries/resolve`) waren Matcher-Artefakte ohne echten Aufrufer und stehen jetzt ehrlich auf Operator. Beleg: `route-matrix.test.ts`, `manifest.test.ts`, `manifest-mirror.test.ts` (Spiegel-Test war vor dem Fix rot).

R8 ist damit geschlossen; P3-3 ist erledigt.

### P3-4 · Release-Manifest (R7) — erledigt 28.09.2026

Snapshot-Werte für Assets, Components, Payloads und Entries sind enthalten. Asset-Zeilen und verfügbare Bytes können aus dem Basis-Release wiederhergestellt werden; wenn Zeile und Datei fehlen, wird mit 422 verweigert. Belege: `lifecycle.ts`, `release-manifest.test.ts`.

### P3-5 · Import-Asset-Kompensation (R10) — erledigt 27.09.2026

Neu erzeugte Uploads werden nach fehlgeschlagenem DB-Commit kompensiert; negativer Fehlerpfad in `packages/engine/test/imports.test.ts`. Datei und DB sind keine gemeinsame Transaktion; dies bleibt eine dokumentierte Grenze.

### P3-6 · Doku-Prozesse und `.scratch/`-Hygiene — erledigt 04.10.2026

- Coverage-Zahlenblock in `qualitaet.md` wird von `scripts/render-quality.mjs` erzeugt; CI führt `pnpm quality:check` aus.
- Historische Dokumente liegen unter `docs/history/`.
- `.scratch/`-Regel: Absicht und Werkzeuge bleiben getrackt; erzeugte Logs, Bilder und Messergebnisse werden ignoriert (`.gitignore`).
- Seit 04.10.2026: Docs-Portal-Build ist ein eigener sichtbarer Schritt im Job `verify` (`.github/workflows/verify.yml`), und `eslint.config.mjs` liegt im Lint-Ziel (`pnpm lint`).

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
| R8 | MCP-Schemas, Pagination und Manifest-Konsumenten nicht durchgängig | **geschlossen** (Punkt 8: Matrix aus Manifest, Server-Spiegel-Test) | P3-3 |
| R9 | Style-Registry-Klassen-Rename ohne Test | **geschlossen** | P3 (Mini-Schritt) |
| R10 | Import-Asset-Kompensation unbelegt | **Kompensationsvertrag geschlossen**; eine gemeinsame Datei-/DB-Tx besteht nicht | P3-5 |
| R11 | Kein PG-Service/Coverage/Fehlerpfade in CI | **Implementierung und aktuelle lokale Gates geschlossen**; CI-Jobs vorhanden | P1-1, P1-2 |
| R12 | God-Files | **offen** | P3-2 |
| R13 | Ursprünglicher Arbeitsbaum ungesichert | **geschlossen**: Folge-Diff in `2a0afde`/`aad9550`, erster P3-2-Schritt in `0193fde` gesichert | P0-1 / P3-2 |

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
| 11.10.2026 | P3-2 Schritt 13: Previews und Review-Items als `ReviewsRepository` (`store-reviews.ts`, 5 Fälle), `store.ts` 6022 → 5787 Zeilen. Alle Gates lokal grün, `pnpm verify` mit vollständigem Volltest eingeschlossen (Details in `docs/current/qualitaet.md`). GitHub Actions starten zurzeit nicht (Abrechnung), daher kein CI-Beleg auf PR #8. |
| 11.10.2026 | P3-2 Schritt 12: Re-bake-Queue als `BakeJobsRepository` (`store-bake-jobs.ts`, 5 Repository-Fälle), `store.ts` 6165 → 6022 Zeilen. Dazu `testTimeout: 30_000` global in `vitest.config.ts`, weil der 5-s-Default unter Volllast zufällig wechselnde Dateien riss. Gates: Coverage, Visual, Parity, Import, PostgreSQL und quality grün; im Volltest bleibt 1 Browser-Timeout (`review-dialog-browser`), einzeln 3 von 3 grün (Details in `docs/current/qualitaet.md`). |
| 11.10.2026 | CLI: `senify tokens revoke <id>` nimmt Ids an, die mit `-` beginnen (`allowUnknownOption`; das Id-Alphabet in `ids.ts` enthält `-`, etwa 1 von 64 Ids war betroffen). Eine vertippte Option ohne Wert scheitert jetzt an der Prüfung der Id-Form (14 Zeichen, `newEntityId`) und erreicht die Engine nicht. Die Id-Erzeugung bleibt unverändert, weil bestehende Ids sonst weiter betroffen wären. Belege: `packages/mcp/test/cli.test.ts` (Id mit `-`, vertippte Option, Revoke ohne `--`). Nebenbei behoben: `scripts/verify-postgres.mjs` quotet den Report-Pfad, damit die Postgres-Lane auch mit `TEMP` auf dem Repo-Laufwerk läuft (Pfad mit Leerzeichen). Außerdem haben `golden.test.ts` und `capture.test.ts` jetzt Timeouts gegen den 5-s-Default. Alle Gates sind gelaufen. Grün sind typecheck, lint, Coverage, Visual, Parity, Import, PostgreSQL und quality. `pnpm verify` blieb dreimal rot, nur durch wechselnde Timeouts unter paralleler Last, und jede betroffene Datei war einzeln grün. Details in `docs/current/qualitaet.md`. |
| 11.10.2026 | Zwei parallele P3-2-Linien zusammengeführt: die im Haupt-Repo neu aufgebauten Schritte 5–11 waren inhaltsgleich mit `origin/claude/p3-2-store-sites-2026-10-09` und entfallen, ihr Doku-Stand (ADR-0019 Punkt 7, Schritte 5–11) ist portiert. `review/css-compiler-motion-fixes` gemergt (11 Konflikte); Nacharbeit: Leer-Regel-Abkürzung in `styleRulesReport` entfernt (Knoten-Stile kompilieren auch ohne Regeln), zwei Dialog-Tests auf die neue Dialog-API (Titel als Name, Textarea), vier Settings-Baselines neu gerendert. Zwei MCP-Test-Flakes gehärtet (`cli.test.ts`: Token-ID nach `--`, weil IDs mit `-` beginnen können; `write-output.test.ts`: Testlimit = Bake-Budget). Volltest, Coverage und `quality:check` grün, nur mit `TEMP`/`TMP` auf dem Repo-Laufwerk (EXDEV). |
| 10.10.2026 | Neun Branches gemergt und gepusht (`1038125..9296a99`): Editor-Familie Graphit/Inspektor/Elemente/Bausteine/Panelwechsel/Struktur (E1–E6), `bake-knoten-stile`, Dialoge (PR #4), diag-quality-Workflow (danach als temporär entfernt). Ein add/add-Konflikt (`elements-panel-browser.test.ts`, Branch-Version als Obermenge übernommen). Visual-Baselines neu gerendert (12 PNGs), Gates typecheck/lint grün. Hinweis: `TEMP`/`TMP` müssen aufs Repo-Laufwerk zeigen (EXDEV bei Astro-`rename`, siehe CI-Workflow), `node_modules` war zeitweise durch parallele Session beschädigt. P3-2-Familie (5er-Stack, Spitze `sites`), ADR-Branch und `review/css-compiler-motion-fixes` bleiben offen (echte Konflikte in `store.ts`/Doku bzw. 11 Dateien). |
| 10.10.2026 | ADR-0015 bis ADR-0019 auf `accepted` gesetzt (Remote-Stand `06bca9a` vom 09.10.2026 lokal übernommen: Statuszeilen + neue ADR-0019 Store-Fassade, `docs/adr/README.md` nachgezogen). Coverage-Toleranz `±0,05` in `quality:check` bleibt. |
| 04.10.2026 | PR-Branch `claude/hardening-2026-09-29` auf `master` (`15f3406`) gebracht, alle 8 CI-Läufe grün. P1-3 (Root-Config im Lint) und P3-6 (Docs-Portal-Build als eigener Schritt) erledigt; der Windows-Job ist blockierend. `docs/current/stand.md` führt Origin-Trennung, SSRF-Schutz, Schlüsseldatei und öffentliche Adresse je Projekt mit Code-/Testbelegen (ADR-0015 bis 0018, noch vorgeschlagen). |
| 29.09.2026 | P0-1-Folge-Diff in `2a0afde`/`aad9550` gesichert. P3-2 begann mit einer reinen Store-Mapper-Auslagerung; Typprüfung, Lint, Volltest und Coverage bestanden. P3-2 bleibt offen, bis auch die weiteren Module zerlegt sind. |
| 07.10.2026 | PR #1 (Härtung, ADRs 0015–0018), PR #2 (MCP-Paging) und PR #3 (Schreib-`outputSchema`) gemergt; Dialoge als PR #4 offen. P3-3-Punkte 6+7 in Fahrplan und Stand nachgetragen; Messwerte-Block neu gerendert. |
| 09.10.2026 | Vierter P3-2-Schritt: `tools-support.ts` (Registry, Schema-Bausteine, Argument-Wächter, MIME, Datei-Upload, Info-Formatierer) und `tools-components.ts` (Komponenten-Walk) aus `packages/mcp/src/tools.ts` heraus (3759 → 3417 Zeilen). Die Werkzeug-Definitionen bleiben bewusst in `tools.ts`, weil `scripts/render-manifest.mjs` diese Datei als Text parst. Zusätzlich: MCP-Test-Client-Timeout an den Aufrufstellen auf 300 s angehoben (das SDK trennt sonst nach 60 s, das Engine-Bake-Budget liegt bei 180 s) — das entfernte die zwei Dauer-Flakes in `workflow.test.ts` und `write-output.test.ts`. Gates: typecheck, lint, Coverage-Volllauf `pnpm test:coverage` (1068/15/0), quality render/check, check:patch grün. |
| 08.10.2026 | Dritter P3-2-Schritt: `http-response.ts` (Antwort-Primitive) und `http-build-files.ts` (Auslieferung aus einem Bake: Preview-Token, Root-Dateien, Index-Auflösung, Build-Auswahl) aus `http.ts` heraus (5644 → 5165 Zeilen). Gates: typecheck, lint, Volllauf `pnpm test` (1863/15/0), Coverage (1068/15/0, http.ts 93.13), quality render/check, diff --check grün. Zweiter P3-2-Schritt: `store-audit.ts` (Audit-Insert) und `store-style-rules.ts` (Style-Registry, ~540 Zeilen) aus `store.ts` heraus; die Store-Fassade delegiert, die öffentliche API bleibt. Zuvor an diesem Tag: Fixture-Pfad-Fix (`fileURLToPath` statt `pathname`) in `capture-browser.test.ts`. |
| 07.10.2026 | P3-3-Punkt 8 (Manifest-Quelle für Matrix und Server-Spiegel) umgesetzt, R8 geschlossen; nächster offener Block ist P3-2 (God-Files). |
| 07.10.2026 | P3-2 zweiter Schritt: Row-Typen und Mapper des `store.ts`-Tails in vier Fach-Module ausgelagert (`store.ts` 8831 → 8179 Zeilen), Store-API unverändert. Zerlegung der `Store`-Klasse wartet auf eine Designentscheidung (ADR). |
| 08.10.2026 | ADR-0019 (Store als Fassade über Fach-Module, vorgeschlagen; Variante A von Adi gewählt). P3-2 dritter Schritt: Formular-Operationen in `store-forms.ts` (`FormsRepository`), `store.ts` 8177 → 8098 Zeilen, Store-API unverändert. |
| 08.10.2026 | P3-2 vierter Schritt: SMTP-, Engine-, Bild- und Referenz-Einstellungen in `store-settings.ts` (`SettingsRepository`), `store.ts` 8098 → 7797 Zeilen, Store-API unverändert. Deploy-Einstellungen bleiben (hängen an `getSite`). |
| 09.10.2026 | P3-2 fünfter Schritt: Release-Operationen in `store-releases.ts` (`ReleasesRepository`), `store.ts` 7797 → 7642 Zeilen, Store-API unverändert. ADR-0019, Punkt 4 präzisiert: Einzeltransaktionen ziehen mit ins Modul. |
| 09.10.2026 | ADR-0015 bis ADR-0019 von Adi im Frage-Dialog bestätigt und auf `accepted` gesetzt (Status in den ADRs und in `docs/adr/README.md`). Coverage-Toleranz `±0,05` in `quality:check` bleibt (Entscheidung Adi). |
| 10.10.2026 | P3-2 sechster Schritt: Deployments und Deploy-Einstellungen in `store-deploy.ts` (`DeployRepository`, `getSite` als injizierte Funktion), `store.ts` 7642 → 7415 Zeilen, Store-API unverändert. ADR-0019, Punkt 7 präzisiert: Deploy-Einstellungen warten nicht auf Sites. |
| 10.10.2026 | P3-2 siebter Schritt: Notification-Outbox und Newsletter-Tokens in `store-notifications.ts` (`NotificationsRepository`), `store.ts` 7415 → 7279 Zeilen, Store-API unverändert. |
| 10.10.2026 | P3-2 achter Schritt: Referenz-Bibliothek (Sammlungen) in `store-reference-library.ts` (`ReferenceLibraryRepository`), `store.ts` 7279 → 7134 Zeilen, Store-API unverändert; ADR-0019 Punkt 4 präzisiert. |
| 10.10.2026 | P3-2 neunter Schritt: Entries mit Versionen und Slug-Weiterleitungen in `store-entries.ts` (`EntriesRepository`), `store.ts` 7134 → 6856 Zeilen, Store-API unverändert. |
| 28.09.2026 | Folge-Diff fachlich geprüft und alle P0-Gates grün ausgeführt. A11y-Browser-Test gegen Debounce/Ladeablauf synchronisiert; vollständiges `pnpm verify`, Visual, Parity, Import, Coverage, PostgreSQL und `quality:check` bestanden. PostgreSQL lief isoliert lokal gegen 18.6, ohne den bestehenden Dienst anzutasten. `data/` und leeres `full.log` als lokale Laufzeit-/Testausgaben klassifiziert und ignoriert. Folge-Diff ist noch zu sichern; P3-2 startet erst nach sauberem Status. |
