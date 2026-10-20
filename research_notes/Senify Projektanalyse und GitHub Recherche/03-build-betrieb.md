# Fachanalyse 3 — Build, Betrieb, Jobs, Backup

**Basis:** `master` `5ac1a84` (19.10.2026). Geprüfte Dateien: `packages/renderer/src/bake.ts`,
`packages/engine/src/bake-worker.ts`, `packages/engine/src/lifecycle.ts`,
`packages/engine/src/store-bake-jobs.ts`, `packages/engine/src/maintenance.ts`,
`packages/engine/src/backup.ts`, `packages/engine/src/deploy.ts`, `packages/engine/src/image-worker.ts`,
`packages/core/src/net.ts`, `vitest.config.ts`, `.github/workflows/verify.yml`.

**Wichtig:** Der lokale Volltest dieser Untersuchung lief **zuerst rot** (111 Fehlschläge in 40
Dateien) und wurde danach mit korrigierter Umgebung wiederholt. Die Ursache ist eine
Umgebungs-, keine Code-Eigenschaft. Beide Läufe sind in Fachanalyse 5 dokumentiert.

---

## Übersicht

| Nr. | Befund | Schwere | Einordnung |
|---|---|---|---|
| B1 | Der Bake blockiert die Event-Loop des ganzen Prozesses | **hoch** (Betrieb) | Architekturentscheidung, bisher nicht bewertet |
| B2 | 111 lokale Testfehlschläge durch `EXDEV` (Temp auf anderem Laufwerk) | **hoch** (Entwicklungsfluss) | im CI behoben, lokal nicht |
| B3 | Die Bake-Lease (60 s) ist kürzer als der Bake-Timeout (180 s) | niedrig | kein Schaden im Einzelprozess, aber semantisch lose |
| B4 | Die Deploy-Frist ist keine harte Frist (kein Timeout je Anfrage) | niedrig | Hänger möglich |
| B5 | Restore: Datenbank-Transaktion und Dateikopie sind nicht eine Einheit | niedrig | bekannte Grenze, nicht dokumentiert |
| B6 | `.tmp/` und `.bake-tmp/` stehen bei jedem `git status` als ungetrackt | niedrig | Hygiene |

---

## B1 — Der Bake blockiert die Event-Loop (Schwere: hoch für den Betrieb)

`packages/renderer/src/bake.ts:778-800`:

```
779:  const result = spawnSync(
780:    process.execPath,
781:    [astroBin(), "build", "--root", stageDir, "--outDir", outDir],
...
790:    timeout: 180000,
```

`spawnSync` ist **synchron**. Während der Astro-Build läuft, ist die Event-Loop des Node-Prozesses
blockiert: keine Timer, keine Promises, keine HTTP-Antwort.

**Wo der Bake läuft.** Der Re-Bake-Worker (`packages/engine/src/bake-worker.ts:89-118`) ist ein
Intervall-Worker **im Hauptprozess** — kein Worker-Thread, kein Kindprozess:

```
106:  const timer = setInterval(() => {
107:    void tick();
108:  }, options.intervalMs ?? 2_000);
```

`tick()` ruft `runBakeJobOnce()` → `rebakeActiveRelease()` (`lifecycle.ts:157`) → `bakePages()` →
`bakeSite()` → `runAstroBuild()`.

**Folge.** Solange ein Re-Bake läuft, antwortet die Engine **nicht**:

- Das Dashboard (`packages/app/src/server.ts`) hängt; die Startseite lädt nicht.
- Der Editor kann nicht speichern — ein Autosave-Request wartet im Browser.
- MCP-Werkzeuge (`@senify/mcp`) antworten nicht; ein Agent-Timeout ist wahrscheinlicher als eine
  Antwort.
- Der Re-Bake-Worker selbst kann seinen nächsten Tick nicht fahren (`setInterval` feuert nicht).

**Wie lange.** Der Astro-Build einer Site mit vielen Seiten und Bewegungs-Tokens dauert Sekunden bis
Minuten. `runAstroBuild` bricht nach 180 s ab (Zeile 790) — das ist ein Deckel, keine Planung.

**Warum es bisher nicht auffiel.** Der Bake ist ein seltener Vorgang (ein Re-Bake je Inhaltsänderung
mit Dedupe pro Site, `store-bake-jobs.ts:63`) und der Benutzer wartet im Zweifel ohnehin. Für einen
Agenten, der über MCP arbeitet, ist ein 30-Sekunden-Hänger kein „seltener Vorgang“, sondern ein
Fehlschlag.

**Einstufung.** Das ist kein Fehler, sondern eine Architekturentscheidung, die nirgends
bewertet wurde. Die Alternativen:

1. **`spawnSync` → `spawn` (asynchron).** Der Bake läuft dann im Hintergrund, die Engine antwortet
   weiter. Der Aufwand ist klein: die Stelle ist eine Funktion (`runAstroBuild`), und `bakeSite`
   ist bereits `async`. Der Astro-Build braucht den Ausgabepfad erst am Ende.
2. **Der Bake in einen Worker-Thread oder Kindprozess.** Volle Isolation, größerer Aufwand,
   dafür stirbt ein hängender Bake nicht das ganze Programm.
3. **Ein Timeout je Anfrage plus ein Auslastungszeichen.** Kein Ersatz, nur ein Netz.

**Empfehlung.** Variante 1 zuerst — sie ändert die Semantik nicht und beseitigt den Betriebsfehler.
Variante 2 ist die richtige Antwort, sobald der Bake häufiger oder länger wird.

**Nebenwirkung, die man kennen muss.** Der Bake legt sein Stage-Verzeichnis im Workspace an
(`bake.ts:744-750`: `packages/renderer/.bake/stage-<ts>-<rand>`), weil Astro Workspace-Pakete über
den Verzeichnisbaum auflösen muss. Das ist der Grund, warum der Bake **nicht** im Temp-Verzeichnis
läuft — und damit die Ursache von B2.

---

## B2 — `EXDEV`: 111 lokale Testfehlschläge, die nichts mit dem Code zu tun haben (Schwere: hoch)

**Der Messlauf dieser Untersuchung.**

Erster Volltest (`pnpm test`, 16.10.2026, Repository auf `G:`, `TEMP` auf `C:`):

```
Test Files  40 failed | 232 passed | 3 skipped (275)
     Tests  111 failed | 2318 passed | 29 skipped (2458)
  Duration  483.91s
```

Die Fehlerursache ist einheitlich:

```
EXDEV: cross-device link not permitted,
rename 'G:\AI Agentur\Senify\packages\renderer\.bake\stage-1792438099919-62852\.astro\.prerender\_astro\_..CybIDuJ_.css'
    -> 'C:\Users\adini\AppData\Local\Temp\senify-widget-bake-PihjF0\dist\_astro\_..CybIDuJ_.css'
    at async Object.rename (node:internal/fs/promises:785:10)
    at async ssrMoveAssets (astro/dist/core/build/static-build.js:257:5)
    at runAstroBuild packages/renderer/src/bake.ts:796:11
```

Astro verschiebt die gebauten Dateien per `rename()` aus dem Stage-Verzeichnis (immer auf dem
Repo-Laufwerk, siehe B1) in das Ausgabeverzeichnis (hier im Temp-Verzeichnis). `rename()` über
Laufwerksgrenzen ist auf Windows nicht erlaubt.

**Gegenprobe.** Derselbe Test mit `TEMP`/`TMP` auf demselben Laufwerk wie das Repository:

```
$env:TEMP="G:\AI Agentur\Senify\node_modules\.cache\review-tmp"
$env:TMP=$env:TEMP
pnpm exec vitest run packages/renderer/test/widget-bake.test.ts
  ✓ widget base stylesheet in the release (Phase 1) (44824ms)
  Test Files  1 passed (1)   Tests  2 passed (2)
```

**Grün.** Die 111 Fehlschläge waren die Laufwerksgrenze, kein Code.

**Das Repository kennt das Problem — nur nicht lokal.** `.github/workflows/verify.yml:104-112`:

```
# Das Repo liegt auf D:, das Standard-Temp auf C:. Astro verschiebt
# Dateien per rename() zwischen Stage und Zielordner, und das scheitert
# über Laufwerke hinweg (EXDEV). Das Temp-Verzeichnis des Laufers liegt
# auf demselben Laufwerk wie das Repo.
env:
  TEMP: ${{ runner.temp }}
  TMP: ${{ runner.temp }}
```

Die CI setzt die Variablen also ausdrücklich — für den Linux-Runner, wo `runner.temp` ohnehin auf
demselben Laufwerk liegt wie das Repository. Der **Windows-Job** setzt dasselbe
(`verify.yml:109-111`), ebenfalls mit dem Kommentar „Das Repo liegt auf D: …“.

**Die Lücke.** Es gibt **kein lokales Skript**, das diese Bedingung herstellt. `pnpm test` auf
einer Windows-Maschine, deren Repository auf einem anderen Laufwerk liegt als `%TEMP%`, ist rot —
mit 111 Fehlern in 40 Dateien, die alle dieselbe Ursache haben. Wer das nicht kennt, hält es für
einen kaputten Stand.

**Empfehlung** (klein, hoher Nutzen für den Entwicklungsfluss):

1. Ein Skript `scripts/with-local-temp.mjs` (oder ein `pretest`-Haken), das `TEMP`/`TMP` auf ein
   Verzeichnis **im Repository** setzt (z. B. `node_modules/.cache/tmp` — ignoriert, auf
   demselben Laufwerk) und dann den eigentlichen Befehl startet.
2. Ein Satz in `docs/current/qualitaet.md` und in `AGENTS.md`: „Volltests auf Windows brauchen ein
   Temp-Verzeichnis auf demselben Laufwerk wie das Repository.“

Damit wäre der lokale Volltest grün — und die 111 Fehlschläge wären als Umgebungsproblem
erkennbar statt als Codebefund.

---

## B3 — Die Bake-Lease ist kürzer als der Bake (Schwere: niedrig)

- `DEFAULT_BAKE_LEASE_MS = 60_000` (`bake-worker.ts:36`).
- `runAstroBuild` darf 180 s laufen (`bake.ts:790`).
- `expireBakeLeases(now)` gibt abgelaufene Leases zurück in die Queue
  (`store-bake-jobs.ts:164-168`).

**Im Einzelprozess entsteht kein Schaden:** `startBakeWorker` verhindert überlappende Ticks
(`bake-worker.ts:92`, `if (stopped || running) return;`), und während des Bakes blockiert die
Event-Loop ohnehin jeden weiteren Tick. `completeBakeJob` (Zeile 111) setzt den Status
unbedingt auf `done` — ohne den Lease zu prüfen.

**Warum es trotzdem notiert wird.** Die Lease existiert, damit ein *abgestürbter* Prozess seine
Arbeit nicht verliert. Ein Bake, der länger als 60 s dauert, verliert diesen Schutz: Die Lease
läuft ab, obwohl der Job noch läuft. Sobald zwei Engine-Instanzen gegen dieselbe Datenbank
arbeiten könnten (etwa ein zweiter Start derselben Installation), könnte die zweite Instanz den
Job übernehmen, während die erste noch bäckt.

**Empfehlung.** Die Lease an die tatsächliche Bake-Dauer koppeln (etwa `max(60 s, 3 × Timeout)`)
oder den Bake-Timeout auf einen Wert unterhalb der Lease bringen. Der kleinere Eingriff ist der
Timeout — dann ist die Lease per Konstruktion länger als jeder Job.

---

## B4 — Die Deploy-Frist ist keine harte Frist (Schwere: niedrig)

`packages/engine/src/deploy.ts:345-364`: Die Pollschleife hat eine Frist
(`NETLIFY_POLL_TIMEOUT_MS`), aber **jede einzelne Anfrage** hat keinen Timeout:

```
194:  const response = await fetchImpl(`${NETLIFY_API}${path}`, {
195:    method,
196:    headers: { authorization: `Bearer ${token}`, ... },
```

Kein `AbortSignal`, kein `signal: AbortSignal.timeout(...)`. Hängt die Verbindung, hängt der
Deploy-Aufruf — und die Frist der Schleife greift nicht, weil sie nur **zwischen** den Anfragen
geprüft wird.

**Warum das nicht als „Kritisch“ geführt wird.** Der Aufrufer ist ein Deployment-Pfad, kein
Server-Request pro Benutzer; ein hängender Deploy blockiert den Job, nicht das Programm. Der
Deploy läuft über den Job-Worker mit eigenem Lease.

**Empfehlung.** `signal: AbortSignal.timeout(30_000)` je Anfrage. Zwei Zeilen, und die Frist wird
zu einer echten Frist.

---

## B5 — Restore: zwei Schreibvorgänge, eine Einheit (Schwere: niedrig)

`packages/engine/src/backup.ts:466-470`:

```
466:  const counts = await input.store.replaceTables({
467:    order: restoreOrder(Object.keys(tables)),
468:    rows: tables,
469:  });
470:  restoreDataDir(join(dir, "files"), input.dataDir, targetDir);
```

Die Tabellen werden in **einer** Transaktion ersetzt, danach wird das Datenverzeichnis
zurückgeschrieben. Bricht der zweite Schritt ab, sind die Tabellen der Sicherung und die Dateien
auseinander.

**Was daran gut ist** (und ausdrücklich festgehalten gehört):

- Der Ordner wird **nur gelesen** (Zeile 429-433).
- Zeilen und Dateien werden **vor** dem Schreiben gegen Manifest und Prüfsummen validiert
  (`readRestoreManifest`, `readRestoreTables`, `readRestoreFiles`, Zeilen 451-453).
- Vor dem Ersetzen wird eine **Sicherheitskopie** des Ist-Zustands erstellt (Zeile 455-464) — mit
  Namenskollisionsschleife, damit sie nie im Ordner landet, den sie schützen soll.
- Der Ordner läuft über `runExclusive` (`http.ts:4894`), der Wartungsgate sperrt währenddessen
  alle anderen Anfragen (`maintenance.ts:35-47`, `51-67`). Die Sperre wird **vor** dem Warten
  gesetzt, damit kein neuer Request dazwischenrutscht; der exklusive Vorgang selbst hält keinen
  Slot und kann nicht auf sich selbst warten (Kommentar `maintenance.ts:6-7`).

**Die Grenze** (Transaktion vs. Dateisystem) ist im Code nicht als solche benannt. Sie gehört in
`docs/current/stand.md` neben die bereits dokumentierte Grenze aus P3-5 (Import-Asset-Kompensation:
„Datei und DB sind keine gemeinsame Transaktion; dies bleibt eine dokumentierte Grenze“).

---

## B6 — Zwei ungetrackte Verzeichnisse im Arbeitsbaum (Schwere: niedrig)

`git status --short --branch` zeigt dauerhaft:

```
?? .bake-tmp/
?? .tmp/
```

Beide stehen **nicht** in `.gitignore` (dort stehen `.bake/`, `.astro/`, `coverage/`, `output/`).
Sie entstehen aus lokalen Läufen und tauchen bei jeder Statusabfrage auf — die auch die
DoR-Bedingung des Fahrplans prüft (`docs/fahrplan.md:220`: „`git status --short` ist sauber“).
Ein sauberer Arbeitsbaum ist damit lokal **nicht herstellbar**, ohne die Ordner zu löschen.

**Empfehlung.** Beide Pfade in `.gitignore` aufnehmen. Der Inhalt ist lokales Arbeitsmaterial
(gleiche Begründung wie bei `.scratch/`, Zeile 45-70 der Datei).

---

## Was in diesem Bereich **nicht** geprüft wurde

- **Der Bake im Produktivbetrieb.** Es wurde kein Release gebacken und keine veröffentlichte Seite
  geprüft. Alle Aussagen zum Bake stammen aus dem Code.
- **Die tatsächliche Bake-Dauer** auf einer realen Site. B1 beschreibt die Wirkung, nicht die
  Dauer in Sekunden.
- **`packages/engine/src/store-image-jobs.ts` und `image-worker.ts`** wurden gelesen, aber nicht
  vollständig geprüft. Der Worker sieht gut aus: die Lease ist mindestens so lang wie der
  Job-Timeout (`image-worker.ts:177`: `leaseMs: options.leaseMs ?? (settings.timeoutMinutes + 5) * 60_000`),
  es gibt einen harten Timeout mit Kill-Marge (`image-use-provider.ts:196-217`) und genau einen
  Wiederholungsversuch bei Timeout (`image-worker.ts:264`, `311`).
- **Der Deploy gegen die echten Netlify-/Vercel-APIs** wurde nicht ausgeführt (keine Zugangsdaten).

---

## Umsetzung (20.10.2026)

- **B1 (Bake blockiert die Event-Loop):** `spawn` statt `spawnSync` in
  `packages/renderer/src/bake.ts`. Der Build läuft als Kindprozess, `running` blockiert nichts
  mehr; ein hängender Build wird nach 180 Sekunden beendet.
- **B2 (EXDEV):** die Ursache war nicht das Temp-Verzeichnis, sondern der Bake: Astro verschiebt
  die gebauten Dateien per `rename()` aus dem Stage-Ordner (im Workspace) in den Zielordner (im
  Temp), und ein `rename()` über Laufwerke scheitert mit `EXDEV`. `buildInto()` baut jetzt neben
  der Stage und kopiert das Ergebnis ins Ziel (`packages/renderer/src/bake.ts`). Auf einem
  Laufwerk entfällt die Kopie. **Das war ein Produktivfehler**, nicht nur ein Testproblem: ein
  Benutzer mit Repo und Datenordner auf verschiedenen Laufwerken hätte denselben Fehler im
  Release-Bake bekommen.
- **B6 (`.tmp/`, `.bake-tmp/`):** beide stehen jetzt in `.gitignore`.
- **Der geplante Umweg entfällt:** Das Skript „Temp auf dem Repo-Laufwerk“ (Maßnahme 4 des
  Berichts) wäre eine Scheinlösung gewesen — es hätte den Fehler in dieser einen Umgebung
  verdeckt, nicht die Ursache beseitigt. Es wurde nicht angelegt.