# Vitest 4 — Abschlussprüfung und Gegenproben

> **Stand: 21.10.2026, PR #96, noch nicht gemergt.** Dies ist der dauerhafte
> Prüfbeleg für den Upgrade-Schritt. Aktuelle Laufzahlen und der generierte
> Linux-Coverage-Messblock stehen ausschließlich in `docs/current/qualitaet.md`.
> CI `39643730891` auf `cd1108f` ist vollständig grün; Upgrade-Abschluss im
> Arbeitsbranch, kein Merge nach `master` freigegeben.

## Definition of Ready und Umfang

- Sauberer Arbeitsbranch `claude/vitest-4-geprueft-2026-10-21` im isolierten Worktree,
  ursprüngliche Basis `1a4ef77`. Fremde Analyse-Skripte bleiben unangetastet.
- Ziel: Runner und Coverage-Provider 4.1.11, funktionierende Workerbegrenzung,
  unveränderte Coverage-Schwellen, echte Verhaltensbelege und vollständige CI.
- Produktverträge bleiben unverändert; die Coverage-Nacharbeit ergänzt Tests,
  nicht die Implementierung. Kein Merge des PR nach `master`.
- Gates: `pnpm verify` mit Browserpflicht, die sechs CI-Jobs und die Drift-Gates
  aus `docs/fahrplan.md` (P1-4, Definition of Done).

## Änderungen und Einordnung

| Stand | Inhalt und Beleg |
|---|---|
| `abff882` | `package.json`/`pnpm-lock.yaml`: Vitest und V8-Provider 4.1.11; drei Runner-/Pool-Ausnahmen aus `osv-scanner.toml` entfernt. `vitest.config.ts` nutzt `forks` und `maxWorkers`, `.github/workflows/verify.yml` nutzt `VITEST_MAX_WORKERS=2`. `tsconfig.json` nimmt die Root-Konfiguration in den Typecheck auf. |
| Konfigurations-Gegenprobe | `maxThreads` ist mit Vitest 4 kein gültiges Root-Feld: im erweiterten Typecheck rot reproduziert. Mit `maxWorkers` grün. Ein Prozess-Harness maß vier gleichzeitig laufende Worker standardmäßig und zwei mit der CI-Variable. Die alte `poolOptions.threads`-Begrenzung traf den damaligen Standard-Pool `forks` nicht. |
| Erster Linux-Lauf `39609593862` | Der Runner funktioniert; das Coverage-Tor meldete echte Schwellenverletzungen unter dem AST-basierten V8-Remapping. Kein Absenken der Schwellen, kein Ausblenden zusätzlicher Dateien und keine Umdeutung als bloße Flakiness. |
| `c2b2b71` | Gezielte Mapper-, Dokument-, Build-Datei-, HTTP-, Formular-, Lifecycle- und MCP-Vertragstests ergänzen bislang nicht präzise belegte Zweige. Testaussagen anschließend nachgeschärft und mit sieben Einzelmutationen gegengeprüft. |
| `02520ed` | Aktuellen `master` `d14880e` übernommen, damit die PR-CI starten kann. Konflikt nur in der Qualitätsdokumentation: beide Nachträge erhalten. Überzählige EOF-Leerzeilen in einer Upstream-Testdatei entfernt, keine inhaltliche Änderung. Upstream-Produktarbeit bleibt erhalten. |
| `ca0d3ff` | Library-Uninstall am vollständigen erwarteten Detach-Draft, Draft-Version, Titel/Pfad und Audit geprüft. Zusätzliche Einzelgegenprobe 31 erkennt abgetrennte Root-Kinder; anschließend bytegenau wiederhergestellt und Baseline grün. |
| Linux-Lauf `39628036316` | Alle unveränderten Coverage-Schwellen bestehen. Verify einschließlich Pflicht-Browser, Visual, Parity, Import, Windows, echte PostgreSQL-Lane und beide Scans bestehen. Nur der bisherige Doku-Messblock war rot. Der neue Block wurde aus dem Linux-Artefakt erzeugt; `pnpm quality:check` ist damit exakt grün. Quelle/Hash und Laufzahlen: `docs/current/qualitaet.md`. |
| Zweiter Basisabgleich `08ef71d` | Während des Doku-Abschlusses gingen PR #98 und #99 nach `master` (`328bfdc`). Ein Konflikt im Messblock verhinderte die PR-CI. Beide Produkt-Auslagerungen und Doku-Nachträge erhalten. Upstream ergänzt `store-library.ts` in der bestehenden Coverage-Gruppe, ohne Schwellen zu senken. Die Upgrade-Änderung selbst bleibt unverändert. |
| Linux-Lauf `39640839148` | Beide Basis-Auslagerungen integriert, vollständiges lokales Verify mit Pflicht-Chromium und fünf CI-Jobs grün. Sämtliche Coverage-Schwellen einschließlich Library bestehen; nur der ältere Messblock war rot. Neue Linux-Summary unverändert übernommen, Generator und exakter Abgleich grün. Der Doku-Folge-Push ist durch den vollständig grünen Lauf `39643730891` bestätigt. |
| Abschlusslauf `39643730891` auf `cd1108f` | Alle sechs CI-Jobs vollständig grün, einschließlich Coverage-Schwellen und Doku-Abgleich. Linux-Summary bytegenau identisch mit der bereits gerenderten Quelle. Aktuelle Messzahlen und Artefakt-Hash ausschließlich in `docs/current/qualitaet.md`; PR bleibt Draft und ungemergt. |

**Nicht abschließend erklärt:** Ein experimenteller Thread-Pool beendete den
Windows-Volltest nativ mit `0xC0000005`. Der Fehler ist nicht auf eine konkrete
Ursache isoliert. Das rechtfertigt weder eine Änderung der Produktlogik noch
eine Behauptung, Threads seien grundsätzlich defekt. Der zuvor verwendete
Prozess-Pool bleibt erhalten und besteht Volltest und Windows-CI.

## Testaussagen statt reiner Coverage-Zahlen

| Testpfad | Tatsächlich geprüfter Vertrag |
|---|---|
| `packages/engine/test/store-record-mappers.test.ts` | DB-Zahlen und optionale Werte; unbekannte Asset-/Variant-/Payload-Arten; ungültige Feldlisten, Felddefinitionen und Supports; beide Entry-Status-Lesewege. |
| `packages/editor/test/state/document.test.ts` | Fehlende und doppelte Knoten, CSS-Kinder/Slots, ungültige Komponentenverweise, verschachtelte Slot-Deklarationen, erste Deklaration, Abrunden endlicher Slot-Maxima und ungültige Maxima. |
| `packages/engine/test/http-build-files.test.ts` | Build-Auswahl, Pfadbegrenzung, explizite Preview-Tokenprüfung, Ablauf und Status, HTML-Rewriting mit Query/Fragment/`srcset`, Directory-Fallback und Vorrang des aktiven Releases. |
| `packages/engine/test/http-route-contracts.test.ts` | Feste erwartete Routen statt Iteration nur über vorhandene Routen; Parameter-/Token-/Limit-Prüfung, tatsächliche Datei-/MIME-Auslieferung, kaputte StorageRefs, gespeicherte Image-Einstellungen, ausgelassene Werte und explizites Secret-Löschen. Modul-Guards werden direkt geprüft, erreichbare Verträge zusätzlich über echtes HTTP. |
| `packages/engine/test/forms-contracts.test.ts` | Signierte ungültige Payloads, fremde/missing Snapshots, Hosts/Origins, eingefrorene Feldregeln vor Writes, unkonfigurierte Ziele, unerwartete Fehler, gespeicherter Titel-Fallback und No-JS-Redirects einschließlich Ablehnung. |
| `packages/engine/test/lifecycle-contracts.test.ts` | Fremde Revision ohne Draft-/Titel-/Pfadänderung, leere Site/Page-Auswahl vor Bake, geschlossene Reviews/idempotentes Discard und feldgenauer Struktur-Diff. |
| `packages/mcp/test/tool-contracts.test.ts` | Echter `EngineClient` und echte Engine: Motion einschließlich `enabled: false`, Secret-Erhalt/-Ersetzung/-Löschung mit Entschlüsselung, Library-Version und installierte Version, gesamter Draft nach Uninstall einschließlich Verbindungen und Detach-Audit, ungültige Styles ohne Write sowie gespeicherte Import-Optionen. Kein Stub, der nur einen konstruierten Antwortkörper bestätigt. |

Die MCP-Vertragstests rufen die Tool-Handler mit echtem HTTP-Client auf; sie sind
kein neuer vollständiger Stdio-Protokolltest. Den Transport prüfen die bestehenden
MCP-Suiten im Volltest. Der Library-PATCH ändert Metadaten und hebt die Version,
nicht die Definition; der Test behauptet deshalb keinen Definitionsaustausch.
Die neue Suite verwendet `pg-mem` über `bootMcpEnv`, keinen echten PostgreSQL-
Dienst und keinen Rollback-Beweis. Transaktionssicherheit wird getrennt mit PGlite
und der PostgreSQL-CI-Lane geprüft. „Echte Engine“ meint den tatsächlichen
Produktcode und HTTP-Writes, nicht einen unveränderten produktiven DB-Adapter.

## Gegenproben 24–31 — einzeln, nicht nur gemeinsam

Ausgeführt am 21.10.2026 unter Windows mit Node 24.15.0 und Vitest 4.1.11.
Ziel war ausschließlich `.tmp/vitest4-counterproof`, auf `abff882` mit den
nachgeschärften Testdateien aus `c2b2b71`. Jeder Lauf verändert **genau eine**
Produktstelle, führt die genannte Testdatei aus und stellt die Originaldatei
anschließend im `finally` wieder her. Jede Probe endete mit Exit 1 und mindestens
einem Assertion-Fehlschlag, nicht an Import-/Dependency-Fehlern.

| Probe | Exakte Mutation | Test und gemessenes Fehlerbild |
|---|---|---|
| 24 | `store-record-mappers.ts`: `fields: toFieldDefs(row.fields),` → `fields: toJson<FieldDef[]>(row.fields),` | `store-record-mappers.test.ts:70–78`: neun Assertions rot; `expected [Function] to throw an error`. Sowohl falsche Listenform als auch ungültige Felddefinitionen werden nicht mehr abgewiesen. |
| 25 | `editor/src/state/document.ts`: `? Math.floor(rawMax)` → `? Math.ceil(rawMax)` | `document.test.ts:129–145`: eine Assertion rot; erwartetes Slot-Maximum 2, tatsächlich 3. |
| 26 | `http-build-files.ts`: nur den expliziten Preview-Guard `if (!sameToken(url.searchParams.get("token"), preview.token)) {` unmittelbar vor `throw new AuthError` durch `if (false && !sameToken(url.searchParams.get("token"), preview.token)) {` deaktivieren | `http-build-files.test.ts:50–55`: eine Assertion rot; `promise resolved "{ status: 200, file: … }" instead of rejecting`. Der andere Token-Guard bleibt unverändert. |
| 27 | `forms.ts`: `validateSubmission(snapshot, input.values);` auskommentieren | `forms-contracts.test.ts:73–90`: elf Assertions rot; ungültige Einsendung wird als `{ ok: true, state: 'created', … }` angenommen. Weitere Ablehnungsfälle derselben Datei schlagen ebenfalls fehl. |
| 28 | `lifecycle.ts`: `if (revision.pageId !== input.pageId) {` → `if (false && revision.pageId !== input.pageId) {` | `lifecycle-contracts.test.ts:17–27`: eine Assertion rot; die fremde Revision wird tatsächlich als Page zurückgegeben statt abgewiesen. |
| 29 | `http-routes-ops.ts`: `patch.customApiKeyEncrypted = null;` auskommentieren | `http-route-contracts.test.ts:103–117`: eine Assertion rot; gespeicherter Ciphertext bleibt stehen, `expected 'v1.…' to be null`. Kein Ciphertext oder Klartext-Produktgeheimnis wird hier abgelegt. |
| 30 | `mcp/src/tools.ts`: `if (enabled !== undefined) spec.enabled = enabled;` → `if (enabled) spec.enabled = enabled;` | `tool-contracts.test.ts:29–46`: eine Assertion rot; tatsächliche gespeicherte Motion verliert `enabled: false`. |
| 31 | `engine/src/store.ts`, nur in `deleteLibraryInstall`: nach `const tree = structuredClone(page.draft) as NodeTree;` und vor `let changed = false;` die Zeile `tree.nodes[tree.rootNodeId]!.children = [];` ergänzen | `tool-contracts.test.ts`, „verlustfreien Uninstall“: eine Assertion rot, Exit 1; gespeicherter Draft ist nicht mehr gleich dem erwarteten Detach-Draft. Die alte bloße Überschriftenprüfung hätte die abgetrennten Root-Kinder nicht erkannt. |

**Nachschärfung der Proben:** Probe 26 muss am zweiten Token-Guard mit `AuthError`
ansetzen; ein unspezifischer Stringersatz war mehrdeutig und zählt nicht als
Beleg. Probe 28 verwendet eine zweite Site: auf derselben Site hätte nach dem
entfernten Ownership-Guard ein zusätzlicher Pfadkonflikt die Regression verdeckt.
Mit der korrigierten Fixture ist die **unerlaubte Annahme** nachgewiesen, nicht nur
irgendein roter Lauf.

**Reproduktion:** In einem separaten Worktree dieselben Testdateien und die oben
angegebene Mutation bereitstellen, dann je Probe
`node <primärer-worktree>/node_modules/vitest/vitest.mjs run <Testdatei> --reporter=json --outputFile=<separater-report>`
ausführen. Packageweise Dependencies müssen dort auflösbar sein. Fehler beim
Import sind kein erfolgreich erkannter Mutant. Vor der nächsten Probe die
Produktdatei wiederherstellen, am Schluss dieselben sieben Testdateien gemeinsam
ohne Mutationen ausführen. Kein produktiver Arbeitsbaum ist dafür ein zulässiges
Mutationsziel.

**Historischer Mutationsanker:** Probe 31 wurde vor PR #98 auf `abff882` mit der
weiter nachgeschärften Testdatei ausgeführt; deshalb ist `store.ts` oben korrekt.
Seit dem zweiten Basisabgleich liegt derselbe Detach-Code in
`packages/engine/src/store-library.ts`, Methode `LibraryRepository.deleteLibraryInstall`
(`structuredClone(page.draft)` vor `let changed = false`). Für die exakte alte
Gegenprobe die dokumentierte Basis verwenden; für eine neue Probe den aktuellen
Modulpfad verwenden. Die alte Gegenprobe wird nicht als neuer Mutationslauf nach
der Auslagerung ausgegeben; den integrierten Vertrag belegt die grüne CI.

Lokale Rohbelege (nicht versionierte Laufartefakte):
`node_modules/.cache/vitest4-probe-24.json` bis `vitest4-probe-30.json`,
`vitest4-counterproof-results.json`, `run-vitest4-probes.mjs` und
`vitest4-counterproof-restored.log`. Die Tabelle hält die Mutationen und
entscheidenden Fehlerbilder unabhängig von diesen Cache-Dateien fest.
Nach der Rücknahme waren alle sieben Produktdateien zeilenendnormalisiert
identisch mit dem primären Arbeitsbranch; die Gegenproben-Baseline war grün.
Die spätere integrierte CI und das lokale Verify bestehen ebenfalls.

**Zusätzliche Probe 31 nach Runde 3:** Dieselbe isolierte Basis mit der weiter
nachgeschärften MCP-Testdatei. `run-vitest4-library-probe.mjs` prüft den eindeutigen
Mutationsanker und genau die fehlgeschlagene Uninstall-Assertion. `store.ts` wurde
im `finally` bytegenau zurückgeschrieben; die neue Testdatei besteht danach auch
im Gegenproben-Worktree. Rohbelege: `vitest4-probe-31.json`/-`.log`,
`vitest4-probe-31-restored.log`, jeweils in `node_modules/.cache/`.
Die integrierten Vertragssuiten einschließlich Library, Typecheck, Lint und
Manifest-/Route-Matrix-Checks bestehen nach dieser Ergänzung. Laufzahlen nur in
`docs/current/qualitaet.md`.

## Iterativer Deep Review

### Runde 1 — Testaussage und Vertragsgrenzen

Nachgeschärfte Prüflücken, keine zusätzlichen Produktbugs:

- **HIGH:** Revision-Ownership-Fixture hatte einen konkurrierenden Pfadfehler;
  zweite Site und korrekte Fehlerkategorie/Unverändertheit ergänzt
  (`lifecycle-contracts.test.ts:17–27`, Probe 28).
- **MEDIUM:** Verschlüsselter Wert allein belegt nicht die richtige Secret-Weitergabe;
  tatsächliche Entschlüsselung beim Erhalt, Ersetzen und Löschen ergänzt
  (`tool-contracts.test.ts:49–71`).
- **MEDIUM:** Library-Lifecycle brauchte die fachlich korrekte Metadaten-Version,
  installierte Version und Inhaltserhalt (`tool-contracts.test.ts:74–101`).
- **MEDIUM:** Iteration über vorhandene Routen hätte eine entfernte Route übersehen;
  feste Signaturen und ausdrücklicher Missing-Route-Fehler
  (`http-route-contracts.test.ts:28–35`).

Gate: gezielte Vertragssuiten, Typecheck, Lint und einzelne Gegenproben rot mit
anschließend grüner Baseline. Änderungen sind in `c2b2b71` gesichert.

### Runde 2 — alle 14 Blickwinkel, Dokumentationsabgleich

Neue Doku-Befunde:

- **MEDIUM:** `docs/fahrplan.md`, Abschnitt P1-4/R14, und der Analyseabschluss
  beschrieben noch drei entfernte Runner-/Pool-Ausnahmen als aktuell offen.
  Differenziert korrigiert; die separate Cache-Ausnahme bleibt offen.
- **MEDIUM:** `docs/current/qualitaet.md`, Abschnitt „Coverage-Gate (aktueller Lauf)“
  und „Bekannte Grenzen“, bezeichnete historische Läufe als aktuell.
  Linux-Quelle und aktuelle Gates ergänzt, Geschichte ausdrücklich markiert.
- **MEDIUM:** Gegenproben 24–30 fehlten dauerhaft in Bericht und Belegregister.
  Exakte Mutationen, Fehlerbilder, Wiederherstellung und Prüflimits hier ergänzt.
- **MEDIUM:** `reports/senify-projektanalyse-2026-10.md`, Anhang A, und
  `05-qualitaet-ci.md`, Abschnitt 6, erklärten alle alten Timeouts als Flakes durch
  synchronen Bake, ohne diese Ursache pro Fehler zu isolieren. Die Behauptung ist
  auf beobachtete Timeouts und eine plausible Lastursache zurückgenommen.
- **LOW:** Analysebericht und Arbeitsstand mischten historische Analysegrenzen
  mit späteren Umsetzungsbelegen. Datierte Abschlussabschnitte trennen beides.

Der stale Messblock wurde bereits vor dieser Runde als CI-Blocker erkannt;
seine Korrektur aus dem Linux-Artefakt ist kein neuer Produktbefund.
Keine neue Produktregression aus der vollständigen Runde. Die Abschlussrunde
nach den Doku-Korrekturen stand damals noch aus und ist in Runde 5 dokumentiert.

### Runde 3 — alle 14 Blickwinkel, Belege gegen den Code

Neue Befunde:

- **MEDIUM:** `tool-contracts.test.ts`, Library-Uninstall, behauptete Verlustfreiheit,
  prüfte aber nur das Fortbestehen einer Überschrift. Jetzt wird der gesamte
  gespeicherte Draft gegen den erwarteten reinen Metadaten-Detach verglichen:
  alle Node-IDs, Kinder, Slots, Props und fremden Nodes bleiben erhalten; dazu
  Draft-Version, Titel/Pfad und Detach-Audit. Keine Produktänderung.
- **MEDIUM:** Die Timeout-Ursachenbehauptung stand weiterhin in Bericht §4.4
  und unmittelbar vor der Präzisierung in §6.2. Beide Stellen sind korrigiert,
  statt sich durch einen widersprechenden Nachtrag nur scheinbar zu relativieren.
- **LOW:** Die neuen MCP-Verträge verwenden `pg-mem`; die Bezeichnung „echte
  Engine“ darf nicht als PostgreSQL-/Rollback-Beleg gelesen werden. Diese Grenze
  ist jetzt ausdrücklich ausgewiesen.

Gate: Baseline vor und nach der Nachschärfung grün; Probe 31 an genau der
Uninstall-Assertion rot, danach bytegenau wiederhergestellt und grüne
Gegenproben-Baseline. Integrierte Vertragssuiten, Typecheck, Lint und beide
Drift-Checks grün. Keine Produktänderung.

### Runde 4 — Konfiguration und innere Konsistenz

**Ein neuer LOW-Befund:** Die neue Abschlussnotiz behauptete eine bestehende
Dependabot-Pflege der Actions. In `.github/` existiert aber nur `workflows/verify.yml`,
keine Dependabot-Konfiguration. Der Workflow-Kommentar nennt Dependabot lediglich
als mögliche Pflegeform. Die Notiz ist auf manuelle Wiedervorlage korrigiert;
keine ungefragte Einrichtung eines Bots. Keine neue Produktregression.

### Runde 5 — vollständige Abschlussrunde, keine neuen Befunde

| Blickwinkel | Konkrete Abschlussprüfung |
|---|---|
| 1 · Dateien/Abschnitte | PR-Diff und alle sieben Vertrags-/Mapper-/Dokument-Testdateien mit Bericht §6.3 und Anhang D, Stand, Fahrplan und Qualitätsdokument abgeglichen; ursprüngliche Analyse und neuer Abschluss getrennt. |
| 2 · Funktionen/Items | Assertions aller ergänzten Fälle gelesen; sieben Mutationsanker sowie der zusätzliche Uninstall-Mutant mit Rohreport abgeglichen. Kein Erfolg allein aus einer Stub-Antwort abgeleitet. |
| 3 · Kategorien | Unit-, HTTP-/Engine-, MCP-, Browser-, Transaktions-, Scan- und Konfigurationsbelege getrennt; weder Live-Deploy noch vollständige Fremdseiten-Abdeckung behauptet. |
| 4 · Cleanup/Last | `bootEngine`/`bootMcpEnv` schließen Server/DB und entfernen ihre Testdaten; neue Suites schließen über `afterAll`, Formular-Mocks über `afterEach`. Gegenproben schreiben im `finally` zurück. Worker-Limits nachgemessen, kein neues Benchmark-Versprechen. |
| 5 · Client/Server | Tool-Argumente gegen tatsächlichen HTTP-Client/Engine und gespeicherte Werte geprüft; Secret-Löschen, `enabled: false`, Import-`job.id` und Library-Metadaten-PATCH stimmen überein. |
| 6 · Plattformen | Linux-CI mit Pflicht-Chromium, Windows-CI ohne Chromium und lokales Windows-Verify mit Pflicht-Chromium getrennt dokumentiert. Windows-/Linux-Zeilenenden und Artefakt-Pfade normalisiert geprüft. |
| 7 · Netzwerk/Fehler | Token-, Origin-, Pfad-, Limit-, Snapshot- und ungeplante Fehlerfälle prüfen Kategorien oder Status plus No-Write, wo zugesagt; kein genereller Timeout-Ursachenbeweis behauptet. |
| 8 · Zustände | Revision-Ownership, Release/Preview-Vorrang, geschlossene Reviews, Motion Set/Clear, Secret Erhalt/Ersetzen/Löschen und Library Install/Update/Detach an Writes geprüft. |
| 9 · UX/Interaktion | Bestehende Browser-/Visual-/Parity-/Import-Gates unverändert; No-JS-Formularrückwege geprüft. Kein neuer UI-Entwurf oder vollständiges UX-Audit durch diesen Runner-Schritt behauptet. |
| 10 · Konfiguration | `package.json`, `vitest.config.ts`, `tsconfig.json`, `osv-scanner.toml` und kompletter `verify.yml` gelesen; Lockfile-Versionen und Worker-/Pool-Migration geprüft. Coverage-Block der Konfiguration zeilenendnormalisiert identisch mit `1a4ef77`. |
| 11 · Secrets | Nur feste Testgeheimnisse in den Fixtures; Ausgaben auf Klartext geprüft, Deploy-Werte tatsächlich entschlüsselt. OSV-Ausnahme sichtbar, beide CI-Scans als getrennte Gates. Keine neue Ausnahme hinzugefügt. |
| 12 · Daten/Zugriff | Fremde Revision ohne konkurrierenden Pfadfehler, ungültige Formulare vor Write und Storage-Auswege abgewiesen. `pg-mem`-Vertragstests nicht als Rollback-Belege bezeichnet. |
| 13 · Qualität bestehender Belege | Missing-Route-Fixture, Secret-Entschlüsselung, Library-Version und vollständiger Detach-Draft gegen tatsächlichen Code geprüft; Testpfade existieren, Gegenproben scheitern an Assertions statt Imports. |
| 14 · Konsistenz | Probe-Nummern, datierte Stände, R14-Rest, PR-Draft-/Nicht-Merge-Grenze und Linux-Quelle abgestimmt. Aktuelle Messzahlen nur im Qualitätsdokument; Artefakt dort hashgeprüft und `quality:check` exakt grün. |

**Zwischenstand nach Runde 5:** fünf dokumentierte Runden im Upgrade-Abschluss; Runde 5 ist die
erste vollständige Runde ohne neue Befunde. Davor vier Testaussage-Lücken,
fünf Dokumentationslücken, zwei weitere Prüflücken samt DB-Begriffsgrenze und
eine falsche Pflegebehauptung korrigiert. Keine zusätzliche Produktregression
oder Ship-Stopper in diesem Abschlussumfang. Das ist keine Zusage, dass Senify
insgesamt fehlerfrei ist. Die CI `39643730891` hat den gepushten Abschlussstand
vollständig geprüft.

**Graphify-Gate:** `graphify update .` nach der letzten Teständerung mit Exit 0
ausgeführt (`node_modules/.cache/graphify-vitest4-close.log`). Das aktualisiert
den Codegraphen AST-basiert, nicht die semantischen Doku-Knoten. Der Lauf meldet
Dateien ohne modellierte Symbole und geänderte Community-Namen; der Graph ist
eine Navigationshilfe, kein Vollständigkeitsbeweis für diesen Review.

Nach dem zweiten Basisabgleich erneut AST-basiert mit Exit 0 aktualisiert:
`node_modules/.cache/graphify-vitest4-second-integration.log`. Die späteren
Statusnachträge ändern keinen Code; semantische Doku-Knoten sind weiterhin
kein aktueller Beleg für den CI-Status.

**Review des zweiten Basisabgleichs:** Geänderter Merge-Umfang nach `328bfdc`
erneut auf Verträge, Ressourcen, Konfiguration und Belegkonsistenz geprüft.
Die Library-Methoden liegen jetzt hinter der Store-Fassade in `store-library.ts`;
der vollständige MCP-Uninstall-Vertrag besteht unverändert. Die zusätzliche
Coverage-Gruppendatei und die neuen Upstream-Tests bleiben erhalten. Kein
handgemischter Messblock, keine verlorenen Markdown-/Doku-Änderungen und keine
neue Produktänderung durch die Integration. Typecheck, Lint, Paketregeln und
gezielte Integrationssuiten grün; beide generierten Dokumente ohne Drift.
Vollständiges lokales Verify und alle produktprüfenden CI-Schritte bestehen auf
`08ef71d`. Der reine Messblock-Drift wurde ausschließlich aus der zugehörigen
Linux-Summary behoben; der Doku-Folge-Push ist in `39643730891` vollständig grün.

### Runde 6 — Abschlussstatus und Reproduzierbarkeit nach Upstream

**Ein neuer LOW-Doku-Befund (Blickwinkel 13/14):** Der historische Anker der
Probe 31 blieb richtig, brauchte nach PR #98 aber einen ausdrücklich aktuellen
Reproduktionspfad. Oben sind Basis und heutiges Library-Modul getrennt; kein
neuer Mutationslauf behauptet. Außerdem die planmäßigen Ausstehend-Vermerke
durch den tatsächlichen CI-Beleg ersetzt und historische Gates als Verlauf
gekennzeichnet. Keine neue Produktregression.

Definition of Ready für diesen Statusabschluss: sauberer Arbeitsbranch, grüner
Lauf `39643730891`, beide Linux-Artefakte vorhanden und bytegenau identisch,
unveränderte Coverage-Konfiguration gegenüber integriertem Upstream. Gate:
`quality:check`, `manifest:check`, `route-matrix:check` und Diff-Prüfung; der
reine Doku-Folge-Push wird zusätzlich vollständig in der PR-CI geprüft.

### Runde 7 — alle 14 Blickwinkel am Abschlussdelta, keine neuen Befunde

Abschlussdelta: ausschließlich Statusdokumentation und historische/current
Belegtrennung; Produkt-, Test- und Konfigurationsstand bleiben unverändert.
Dateien/Items/Kategorien (1–3) gegen PR-Diff und Belegregister abgeglichen;
Cleanup/Client-Server/Plattformen/Fehler/Zustände/UX (4–9) gegen den unveränderten,
vollständig grünen Verify-, Browser-, Windows- und PostgreSQL-Stand geprüft.
Konfiguration/Secrets/Daten (10–12): kompletter Workflow und Coverage-Vertrag
gelesen, identischer Coverage-Block zu `328bfdc`, keine neue Ausnahme, echte
DB-Lane von `pg-mem`-Verträgen getrennt. Bestehende Belege/Konsistenz (13–14):
aktueller Library-Anker, Linux-Artefakthash, Gate-Zahlen, Querverweise,
R14-Rest und Draft-/Nicht-Merge-Grenze abgestimmt. Keine weiteren Befunde am
Abschlussdelta und kein Ship-Stopper; keine Behauptung allgemeiner Fehlerfreiheit.

Der zusätzliche Status-Commit ändert keinen Produkt-/Test-/Coverage-Code.
Sein abschließender CI-Status wird im PR verifiziert, statt einen endlosen
Folge-Commit nur für die eigene Commit-ID zu erzeugen.

## Grenzen und offene Arbeit

- R14 bleibt teilweise offen: `GHSA-ch52-4w7c-c8xp`,
  `http-cache-semantics` 4.2.0, Ausnahme bis 30.11.2026 in `osv-scanner.toml`.
  Der grüne Scan bedeutet „keine nicht ausgenommenen Funde“, nicht „keine Lücken“.
- Testabdeckung ist kein Beweis für jede Funktion, alle echten Fremdseiten oder
  einen Live-Deploy zu einem Provider. Bestehende Produktgrenzen bleiben im Fahrplan.
- Die gepinnten GitHub Actions melden eine Node-20-Deprecation-Warnung und werden
  vom Runner unter Node 24 ausgeführt; die Jobs bestehen. Kein ungeprüftes Action-
  Upgrade in diesem Runner-Schritt. Manuelle Wiedervorlage bei der nächsten
  Action-Pflege; im Repo ist kein Dependabot-Workflow konfiguriert.
- Der Upgrade-Abschluss ist im Arbeitsbranch belegt, nicht nach `master` gemergt.
  Die vollständig leere Review-Runde ist oben belegt. Offene Produktarbeit aus
  dem Fahrplan bleibt außerhalb dieses Runner-Schritts.
