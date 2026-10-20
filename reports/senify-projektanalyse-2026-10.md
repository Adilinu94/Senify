# Senify — Projektanalyse und GitHub-Recherche

**Stand:** 19.10.2026 · **Basis:** `master` `5ac1a84` (Merge PR #55) · **Analysierte Gegenprobe:** `19c8ee0` (PR #39)
**Umfang:** alle 15 Workspace-Pakete, sieben Fachbereiche, sechs Fachanalysen
**Anwendungscode:** unverändert. Kein Commit, kein Pull, kein Push.

> **Was dieses Dokument ist.** Eine Untersuchung, kein Umsetzungsbericht. Jede Aussage ist mit
> Datei und Zeile belegt; jede Prüfgrenze ist ausgewiesen. Die **Belegformate** unterscheiden
> sich: *bestätigt* (reproduziert), *Codebefund* (im Code gelesen, nicht ausgeführt), *offen*
> (nicht geprüft oder eine Entscheidung liegt bei Adi).
>
> **Verbindliche Dokumente bleiben `docs/fahrplan.md`, `docs/current/*` und `docs/adr/`.** Dieser
> Bericht ist ein Vorschlag und ändert keine bestehende Entscheidung.

---

## 1 — Kurzfassung

Senify ist in der Substanz **solide**. Die Testsuite ist umfangreich (2458 Tests in 275 Dateien),
die CI hat vier Jobs mit gepinnten Aktionen, die dokumentierten Entscheidungen (ADR-0016 bis
ADR-0020) sind begründet und im Code nachvollziehbar. Die Fehler dieser Untersuchung sind
**fast alle Lücken in Prüfungen**, nicht in Funktionen: Ein Bedienelement speichert nicht
(Autosave-Befund D), eine Liste von Operationen driftet still, ein Coverage-Tor misst 7 344 Zeilen
nicht, ein generiertes Dokument darf veralten, ohne dass etwas rot wird.

**Die fünf Befunde, die zählen:**

| # | Befund | Schwere | Eine Zeile Beleg |
|---|---|---|---|
| **1** | **Die Sichtbarkeit je Gerät wird nie gespeichert.** Der Inspektor schreibt `setNodeHiddenDevices`; die Engine kann die Operation vollständig; der Editor verwirft sie vor dem Versand. Der Benutzer sieht die Änderung, sie ist nach dem Neuladen weg. | **hoch** | `persist.ts:127-142` |
| **2** | **Änderungen während eines laufenden Saves gehen verloren.** Die Save-Queue wird überschrieben statt zusammengeführt. | **hoch** | `persist.ts:536` |
| **3** | **Ein Style-Registry-Konflikt ist nicht auflösbar.** Der Wiederholen-Knopf sendet die *Seiten*version, gebraucht wird die *Registry*-version — die Engine liefert sie nicht. Der Benutzer verliert seinen Regel-Entwurf. | **hoch** | `persist.ts:549-554` |
| **4** | **Der Bake blockiert das ganze Programm.** `spawnSync` hält die Event-Loop; während eines Re-Bakes antwortet die Engine nicht — Dashboard, Editor, MCP. | **hoch** (Betrieb) | `bake.ts:779` |
| **5** | **Der lokale Volltest ist auf dieser Maschine nicht grün zu bekommen**, ohne `TEMP` auf das Repo-Laufwerk zu setzen: 111 Fehlschläge in 40 Dateien, alle mit derselben Ursache (`EXDEV`). | **hoch** (Entwicklungsfluss) | `verify.yml:104-112` |

**Die beiden Gates, die am meisten bringen und kein neues Werkzeug brauchen:**

- **Eine Eigenschaftstest-Regel:** „Jede Operation der Engine-Vokabular erzeugt eine nicht-leere
  Save-Queue“ — diese eine Regel hätte Befund 1 beim Bauen der Tests gefunden.
- **Ein Drift-Tor für das Manifest** (106 Werkzeuge, 85 KB, per Hand erzeugt) — heute prüft
  niemand, ob die eingecheckte Fassung noch zum Quelltext passt.

**Zur GitHub-Frage:** Von 21 geprüften Kandidaten sind **4 zur Adoption empfohlen**
(`dependency-cruiser`, `fast-check`, `gitleaks`, `osv-scanner`), **3 als Spike**
(`pglite`, `ipaddr.js`, MCP-SDK v2), **4 als Referenz** und **10 als weggelassen** — jeweils mit
benanntem Grund. Alle Zahlen (Lizenz, Wartung, Version) stammen aus der GitHub-API, nicht aus
Suchergebnissen.

**Zur Gesamtwirkung:** Sieben der zehn empfohlenen Maßnahmen brauchen **keine** neue
Abhängigkeit. Das ist kein Zufall, sondern das Muster dieser Untersuchung: Die Funktionen halten
largedanken; die Prüfungen halten nicht mit.

---

## 2 — Rahmen, Basis und Methodik

### 2.1 Basis

| Punkt | Stand |
|---|---|
| Commit | `5ac1a84` (Merge PR #55, 19.10.2026) |
| Gegenprobe | `19c8ee0` (Merge PR #39) — für `persist.ts`, `net.ts`, `references-lifecycle.ts` und `visual.ts` unverändert gegenüber `5ac1a84` |
| Arbeitsbaum | nur ungetrackt: `.bake-tmp/`, `.tmp/`, `research_notes/` — **nicht angefasst** |
| Branch | `master`, synchron zu `origin/master` (der Stand wurde während der Untersuchung von `19c8ee0` auf `5ac1a84` aktualisiert; beide Stände wurden geprüft) |
| Umgebung | Windows, Node 24.15.0, Repository auf `G:`, `%TEMP%` auf `C:` |

**Grenze der Aussage:** Alle Aussagen gelten für den lokalen Stand. Vier Commits zwischen den
beiden Ständen betrafen `packages/framer-import`, `packages/widget-engine/src/breakpoints.ts`,
`packages/renderer/src/{bake,style-css,motion}.ts`, `packages/engine/src/import-preview.ts` und
`packages/editor/src/canvas/*` — **keine** der in diesem Bericht genannten Fundstellen.

**Der Umsetzungsstand (6.1) gilt auf einem anderen Stand.** Die Analyse-Basis `5ac1a84` bleibt die
Grundlage der Befunde. Die Umsetzung entstand danach auf dem Branch
`claude/projektanalyse-umsetzung-2026-10-20` (PR #71), aufgebaut auf `origin/master` und mit den
Upstream-Ständen dazwischen (PRs #57, #63–#69: Framer-Import-Korrekturen, Editor-Toolbar,
Token-Fallbacks, HTTP-Fachmodule nach ADR-0019, Bild-Assets aus der Quelle). Diese PRs haben
**keine** der in diesem Bericht genannten Fundstellen berührt; wo sie dieselben Dateien anfassten
(`docs/current/stand.md`, `docs/fahrplan.md`, `vitest.config.ts`, `packages/renderer/src/bake.ts`),
wurden beide Seiten zusammengeführt.

### 2.2 Was ich durchgeführt habe

- **Gelesen:** 15 Paketmanifeste, die Architektur-, Status- und Qualitätsdokumentation, alle
  ADRs, `vitest.config.ts`, `.github/workflows/verify.yml`, `package.json`, `.gitignore`,
  `scripts/render-manifest.mjs`, und in den sieben Fachbereichen die jeweils zentralen Module.
- **Ausgeführt:** `pnpm test` (zweimal, siehe 2.3), eine gezielte Gegenprobe, ein
  TypeScript-Probe-Skript mit sechs Autosave-Gegenproben, GitHub-API-Abfragen für 21 Repositories,
  Anysearch-Recherche zur ersten Orientierung.
- **Nicht ausgeführt:** `pnpm build`, `pnpm test:coverage`, `pnpm test:visual`, `pnpm verify:parity`,
  `pnpm verify:import`, `pnpm test:postgres`, `pnpm quality:render`, `pnpm quality:check`,
  `pnpm manifest:render`, `pnpm route-matrix`, `pnpm verify:dist`, `pnpm lint`, `pnpm typecheck`.

### 2.3 Der Testlauf — und warum er zweimal lief

**Erster Lauf** (`pnpm test`, `%TEMP%` auf `C:`): **40 Dateien rot, 111 Tests rot**, 2318
bestanden, 29 übersprungen, 483,91 s.

Alle Fehlschläge hatten **eine** Ursache:

```
EXDEV: cross-device link not permitted,
rename 'G:\AI Agentur\Senify\packages\renderer\.bake\stage-…\.astro\.prerender\_astro\_..CybIDuJ_.css'
    -> 'C:\Users\adini\AppData\Local\Temp\senify-widget-bake-PihjF0\dist\_astro\_..CybIDuJ_.css'
    at runAstroBuild packages/renderer/src/bake.ts:796:11
```

Astro verschiebt per `rename()` aus dem Stage-Verzeichnis (immer auf dem Repo-Laufwerk) in das
Ausgabeverzeichnis. `rename()` über Laufwerksgrenzen ist auf Windows nicht erlaubt.

**Gegenprobe** (eine Datei, `%TEMP%` auf `G:`): **grün**, 2 Tests, 44,8 s.
**Zweiter Lauf** (ganze Suite, `%TEMP%` auf `G:`): siehe Anhang A.

**Was daraus folgt:** Ohne diese Gegenprobe hätte man 111 rote Tests als Befund gemeldet. Die
Ursache ist eine Umgebungsbedingung, die das Repository **selbst dokumentiert** — aber nur für
die CI (`verify.yml:104-112`) und nicht für den lokalen Lauf.

---

## 3 — Abdeckung: was geprüft wurde und was nicht

| Bereich | Geprüft | Nicht geprüft |
|---|---|---|
| **Architektur / Kern** | 15 Pakete, `store.ts` (Fassade), 29 Fachmodule, `ADR-0019` | jede einzelne Store-Methode |
| **Backend / Sicherheit** | `http.ts` (Auth, Rate-Limit, Wartungstor), `net.ts`, Idempotenz, Deploy, Backup | alle ~90 Routen einzeln |
| **Frontend / Editor** | `persist.ts` vollständig, `session.ts`, `operations.ts`, `patches.ts`, Inspektor, `app.js` (Statuszeile) | Canvas-Rendering, Frames, Drag&Drop |
| **Renderer / Betrieb** | `bake.ts` vollständig, `bake-worker.ts`, `lifecycle.ts` (Re-Bake), `store-bake-jobs.ts`, `maintenance.ts`, `backup.ts`, `deploy.ts` | ein echter Release-Bake, ein echter Deploy |
| **KI / Import / Referenzen** | `references-lifecycle.ts`, `references-capture-chain.ts`, `import-preview.ts`, `visual.ts`, `image-worker.ts`, `image-use-provider.ts` | ein Referenzlauf gegen eine echte Fremdseite, ein Bildgenerierungs-Job |
| **MCP / Dokumentation** | `server.ts`, `tools.ts` (Struktur), `manifest/**`, `render-manifest.mjs`, `skills/**`, `docs-portal` | ein Live-Aufruf eines MCP-Werkzeugs, die Werkzeug-Doku im Portal |
| **Qualität / CI** | `vitest.config.ts`, `verify.yml`, `package.json`, `.gitignore`, zwei Volltests | `pnpm audit`, ein Postgres-Lauf, der Coverage-Lauf |

**Diese Untersuchung ist eine Stichprobe mit Belegen, keine Prüfung jeder Funktion.** Die
Coverage-Matrix in Anhang B sagt das ausdrücklich.

---

## 4 — Die Befunde

Die ausführlichen Analysen liegen in `research_notes/Senify Projektanalyse und GitHub Recherche/`.
Hier die Zusammenfassung mit der Begründung der Priorität.

### Priorität 1 — Funktionsfehler, je einzeilig behebbar

#### 4.1 Die Sichtbarkeit je Gerät wird nie gespeichert

**Der Ablauf.** Der Inspektor schreibt die Operation
(`packages/editor/src/inspector/inspector.ts:1282-1288`). Der Store verarbeitet sie
(`packages/editor/src/state/operations.ts:1207`). Die Engine kann sie vollständig — Schema
(`packages/engine/src/mutations/editor-contract.ts:145-152`), Bridge
(`packages/engine/src/mutations/editor-bridge.ts:199-219`, schreibt beide Breakpoints idempotent),
Vokabular (`packages/engine/src/mutations/contract.ts:42`) — **und beweist es**:
`packages/engine/test/editor-mutations.test.ts:55-74` prüft genau diesen Bridge-Zweig.

**Der Bruch.** Der Editor filtert die Operation weg, **bevor** die Patch-Übersetzung sie erreicht:

```
packages/editor/src/state/persist.ts:466
  if (!PAGE_OPS.has(op) && !SITE_OPS.has(op)) { recordUnsupported([op]); return; }
```

`PAGE_OPS` (Zeile 127-142) hat 14 Einträge, `SITE_OPS` (145-150) vier. Die Engine-Vokabular hat
19. **Genau eine fehlt: `setNodeHiddenDevices`.**

**Der Schaden.** Der Benutzer schaltet „nur am Handy aus“ um, sieht es sofort, und nach dem
Neuladen ist es weg. Die Statuszeile sagt ehrlich „nicht speicherbar: setNodeHiddenDevices“
(`packages/app/public/app.js:6548-6549`) — aber die Änderung sieht gespeichert aus.

**Der Test, der falsche Sicherheit gibt.** `packages/editor/test/state/persist.test.ts:426-451`
heißt „maps the hidden-device field onto the dedicated op“ und ist grün. Er prüft aber
`patchesToPending` **einzeln** — die Funktion, die der Filter nie erreicht. Auf der anderen
Seite steht ein zweiter grüner Test (die Engine-Brücke). **Zwei grüne Tests, ein gebrochener
Pfad dazwischen** — das ist die Form, in der so ein Fehler durch jede Einzelprüfung hindurchgeht.

**Behebung:** eine Zeile in `PAGE_OPS`. **Test:** ein Fall über die Pipeline, nicht über die Funktion.

→ Fachanalyse 1, Befund D

#### 4.2 Änderungen während eines laufenden Saves gehen verloren

`persist.ts:536` (Fehlerfall) und `persist.ts:527` (Konfliktfall) schreiben `pending = batch` —
also **überschreiben** die zwischenzeitlich eingetroffenen Änderungen, statt sie voranzustellen.
Das lokale Dokument enthält sie, die Save-Queue nicht. Der Server bekommt sie nie; ein Neuladen
verwirft sie.

Der vorhandene Test (`persist.test.ts:412-422`) kann den Fehler nicht sehen: Träte eine zweite
Änderung während des Requests hinzu, wäre `pending` nach dem Fehler ebenfalls `1` — nur der
andere Batch.

**Behebung:** `pending = [...batch, ...pending]` an beiden Stellen.

→ Fachanalyse 1, Befund B

#### 4.3 Ein Style-Registry-Konflikt ist nicht auflösbar

`persist.ts:549-554` setzt bei einem Registry-409 **keine** `conflictVersion`. `retry()`
(Zeile 574-584) sendet ohne Argument deshalb nichts. Die Shell ruft `session.retry(fresh.draftVersion)`
auf (`app.js:6583`) — das ist die **Seiten**version; gebraucht wird die **Registry**-version
(`baseVersion` in `persist.ts:484`). Die Engine meldet sie nicht
(`packages/engine/src/store-style-rules.ts:722-727` nennt nur `field: "baseVersion"`).

**Der Kreis.** Der Knopf „Eigene Änderungen senden“ löst nichts; der Dialog öffnet sich erneut
mit „unbekannter Version“ (`persist.ts:79-82`). Der einzige Ausweg ist ein Neuladen des Browsers —
und das verwirft den lokal gepflegten Regel-Entwurf (`app.js:6573`).

**Behebung:** Die Engine muss die aktuelle Registry-Version im Konflikt melden; der Client muss
sie übernehmen. Zwei Seiten, je eine Zeile plus Feld.

→ Fachanalyse 1, Befund E

### Priorität 2 — Betrieb und Entwicklungsfluss

#### 4.4 Der Bake blockiert das ganze Programm

`packages/renderer/src/bake.ts:779` benutzt `spawnSync` mit 180 s Deckel. Der Re-Bake-Worker
läuft im **Hauptprozess** (`packages/engine/src/bake-worker.ts:106`). Während des Bakes: kein
Dashboard, kein Speichern, keine MCP-Antwort, kein Worker-Tick.

**Behebung:** `spawnSync` → `spawn` (asynchron). `bakeSite` ist bereits `async`; die Funktion
`runAstroBuild` ist die einzige Stelle.

**Der Bake ist auch die Ursache der testseitigen Flakes.** Die beiden 90-Sekunden-Timeouts des
korrigierten Volltests sind Review-Tests mit Bake; ihre grünen Nachbarn brauchen 12,3 s, 15,3 s
und 23,8 s (Anhang A). Die Marge ist dünn, und der Grund ist der synchrone Bake.

→ Fachanalyse 3, B1

#### 4.5 Der lokale Volltest scheitert an der Laufwerksgrenze

Siehe 2.3. **Behebung:** ein Skript, das `TEMP`/`TMP` auf ein Verzeichnis im Repository setzt
(z. B. `node_modules/.cache/tmp`), plus ein Satz in `docs/current/qualitaet.md` und `AGENTS.md`.

→ Fachanalyse 3, B2

#### 4.6 Das Coverage-Tor misst nicht mehr die Logik, die es schützen soll

`vitest.config.ts:61-72` misst `http.ts`, `store.ts`, `lifecycle.ts`, `forms.ts`,
`editor/src/state/**` und `mcp/src/tools.ts`. Die **34 ausgelagerten Module mit zusammen 7 344
Zeilen** stehen nicht darin — darunter `store-style-rules.ts` (719 Zeilen, die komplette Registry
inklusive des optimistischen Locks) und `store-references.ts` (575 Zeilen).

Gemessen werden 8 813 Zeilen Fassade und Routing; **nicht** gemessen die 7 344 Zeilen, in denen
der Store-Code heute liegt. Die betroffenen Module haben eigene Tests — es fehlt die **Messung**,
nicht die Prüfung.

**Behebung:** die `include`-Liste auf `packages/engine/src/store-*.ts` und `http-*.ts` ausdehnen
und je Datei eine Schwelle setzen.

→ Fachanalyse 5, Abschnitt 2

#### 4.7 Das Manifest darf veralten, ohne dass etwas rot wird

`packages/manifest/src/tools.ts` (85 KB, 106 Werkzeuge) wird per Hand erzeugt
(`pnpm manifest:render`). Weder `pnpm verify` noch die CI noch ein Test prüft, ob die
eingecheckte Fassung noch zum Quelltext passt. Der Manifest-Test prüft nur die **Namen**
(`packages/manifest/test/manifest.test.ts:37-49`). Eine geänderte Beschreibung, Parameterliste
oder Route bleibt unentdeckt — und die Doku, die Routenmatrix und die Skills laufen auseinander.

Der Generator benennt das Risiko selbst (`scripts/render-manifest.mjs:340-346`): „A regex that
assumed one of them would silently produce an empty parameter list for the other, and a
documentation table with missing rows is worse than one that fails.“

**Behebung:** ein Test, der den Generator laufen lässt und das Ergebnis mit der eingecheckten
Datei vergleicht. Sekunden, und die Fehlerklasse ist geschlossen.

→ Fachanalyse 4, Abschnitt 2

### Priorität 3 — Grenzen, die eine Entscheidung brauchen

#### 4.8 Der Browser-Pfad der Netzwerkgrenze

Der Node-Pfad ist vollständig geschützt: jede Weiterleitung einzeln geprüft, DNS-Antwort
**gepinnt**, Body begrenzt (`packages/core/src/net.ts:108-141`, `242-263`), mit Tests belegt
(`packages/core/test/net.test.ts`).

Der Browser-Pfad ist es nicht: **kein** `context.route()` im Produktivcode (nur in Tests). Die
Referenz-Analyse prüft nur die **Startadresse**
(`packages/engine/src/references-lifecycle.ts:456`) und navigiert dann selbst (Zeile 548).
Weiterleitungen und Sub-Requests laufen ungeprüft; was der Browser abholt, landet im
Referenzprofil, im Design-Vertrag und in den gespeicherten Schnappschüssen
(`references-lifecycle.ts:563`, `273`, `279`, `862`).

**ADR-0016 hat das bewusst angenommen** — und begründet es mit dem Dashboard-Schutz
(`docs/adr/0016-…md`, Abschnitt „Nicht geändert“). Dieser Schutz ist im Code **bestätigt**
(`packages/app/src/server.ts:113-145`). Die Begründung deckt aber nur das **Dashboard**, nicht die
übrigen internen Dienste der Maschine.

**Das ist keine Wiedereröffnung einer geschlossenen Entscheidung, sondern ihre vermessene
Reichweite.** Die Frage „gilt die Annahme auch für interne Dienste auf anderen Ports?“ ist eine
Abwägung (Einzelplatz-Programm vs. Betrieb neben anderen Diensten) und gehört zu Adi.

→ Fachanalyse 2

#### 4.9 Die vier eigenen Job-Queues

Bake-, Image-, Import- und Referenz-Jobs haben jeweils Lease, Backoff, Dedupe und
Absturz-Erholung — viel duplizierte Logik. Der sinnvolle Schritt ist **nicht** der Austausch
gegen eine fremde Queue, sondern die **Vereinheitlichung** der vier in ein Fachmodul (in der Art
von ADR-0019). Danach lohnt die Frage erst.

→ Fachanalyse 6, Nummer 12

### Priorität 4 — Kleinere, aber billige Behebungen

| Befund | Ort | Aufwand |
|---|---|---|
| Ein verbrauchter Debounce stellt keinen neuen Timer — eine Änderung bleibt ungespeichert liegen | `persist.ts:450-457`, `504` | eine Zeile |
| Die Pipeline ist nicht ausnahmesicher; ein ablehnender Transport blockiert alle folgenden Saves (latent — die Shell wandelt Fehler in Status um) | `persist.ts:519` | `try/catch` + `finally` |
| Die Deploy-Frist ist keine harte Frist (kein Timeout je Anfrage) | `deploy.ts:194-210` | zwei Zeilen |
| `.tmp/` und `.bake-tmp/` stehen bei jedem `git status` als ungetrackt und verhindern einen sauberen Arbeitsbaum | `.gitignore` | zwei Zeilen |
| `pg-mem` steht als **Produktiv**-Abhängigkeit im `@senify/core`-Paket, obwohl es nur den `./testing`-Subpfad bedient — damit installiert jeder Endbenutzer von `@senify/core` eine PostgreSQL-Emulation mit | `packages/core/package.json:11-13` | eine Zeile (dev + optional peer) |
| Browser-Suiten überspringen sich **still**, wenn Chromium nicht zur Playwright-Version passt | `docs/current/qualitaet.md` Zeile 43 | `SENIFY_REQUIRE_BROWSER=1` lokal setzen |
| Die Skills prüfen **nicht**, ob die genannten Werkzeuge noch existieren | `packages/skills/test/skills.test.ts` | ein Test gegen das Manifest |
| Der Import-Vorschau-Schutz hängt an der **Reihenfolge** zweier Aufrufe | `import-preview.ts:119-125` | Prüfung an die Browserstelle |
| Die Restore-Grenze (Transaktion ≠ Dateikopie) ist nicht dokumentiert | `backup.ts:466-470` | eine Zeile in `stand.md` |

---

## 5 — GitHub-Repositories

**Methode.** Alle Angaben aus der GitHub-API (19.10.2026): `repos/{o}/{r}` für Lizenz, Sterne,
letzten Push, Archivstatus, offene Issues; `releases/latest` für die Version. Der Lizenztext der
MCP-Repositories wurde im Klartext gelesen.

**Ergebnis:** 4 zur Adoption, 3 als Spike, 4 als Referenz, 10 weggelassen.

| Repository | Lizenz | Wartung | Urteil | Bedarf |
|---|---|---|---|---|
| `sverweij/dependency-cruiser` | MIT | Push 19.10.2026, v18.6.0 | **übernehmen** | die ADR-0019- und P3-3-Paketregeln mechanisch prüfen |
| `dubzzz/fast-check` | MIT | Push 19.10.2026, v4.10.2 | **übernehmen** | die Eigenschaft, die Befund 1 gefunden hätte |
| `gitleaks/gitleaks` | MIT | Push 30.09.2026, v8.30.1 | **übernehmen** | die CI prüft heute keine Geheimnisse |
| `google/osv-scanner` | Apache-2.0 | Push 18.10.2026 | **übernehmen** | die CI prüft heute keine Abhängigkeitslücken |
| `electric-sql/pglite` | Apache-2.0 | Push 19.10.2026 | **Spike** | 16 lokal übersprungene Transaktionsfälle (`pg-mem` ist eine Emulation) |
| `whitequark/ipaddr.js` | MIT | Push 27.09.2026 | **Spike** | 60 Zeilen handgeschriebene IP-Klassifikation in `net.ts` |
| `modelcontextprotocol/typescript-sdk` | MIT → Apache-2.0 | v2.3.1 (05.10.2026) | **Spike** | Senify nutzt `^1.30.0`; es gibt eine v2-Linie |
| `modelcontextprotocol/inspector` | MIT → Apache-2.0 | Push 14.10.2026 | **Referenz** | 106 Werkzeuge manuell prüfen |
| `modelcontextprotocol/modelcontextprotocol` | MIT → Apache-2.0 | Push 19.10.2026 | **Referenz** | das offizielle Werkzeug-Schema für das Drift-Tor |
| `salsita/node-pg-migrate` | MIT | Push 19.10.2026 | **Referenz** | `db.ts:130`: „there is no migration tooling in v1“ |
| `ai/size-limit` | MIT | Push 07.10.2026 | **Spike** | der Fahrplan verschiebt „Dateigrößen-Budgets“ |
| `graphile/worker` / `timgit/pg-boss` | MIT | beide aktiv | **Referenz** | vier eigene Queues — erst vereinheitlichen |
| `pinojs/pino` | MIT | Push 06.10.2026 | **Referenz** | 7 Server-Protokolle ohne Kontext |
| `csstree`, `postcss`, `postcss-plugins` | MIT / MIT / MIT-0 | alle aktiv | **weglassen** | das Projekt hat eine eigene, bewusst validierende CSS-Grammatik |
| `kysely`, `drizzle-orm`, `knex` | MIT / Apache-2.0 / MIT | aktiv | **weglassen** | rohes SQL ist eine Festlegung (ADR-0004), kein Mangel |
| `nock`, `msw` | MIT | beide sehr aktiv | **weglassen** | der Test braucht eine ablehnende Funktion, keine Bibliothek |
| `sanitize-url` | MIT | Push 20.06.2026 | **weglassen** | `sanitize-html` deckt es ab |
| `immer` | MIT | v11.1.21 | **weglassen** | der Editor hat ein eigenes Patch- und History-Modell |
| `undici` | MIT | sehr aktiv | **weglassen** | Node bringt `fetch` mit |
| `renovate` | AGPL-3.0 | aktiv | **weglassen** | Dependabot ist im Repo bereits benannt |
| `spectral` | Apache-2.0 | v6.17.0 | **weglassen** | es gibt kein OpenAPI-Dokument |

**Begründungen im Volltext:** `research_notes/Senify Projektanalyse und GitHub Recherche/06-github-repositories.md`.

**Lizenzhinweis:** Die MCP-Projekte stellen von MIT auf Apache-2.0 um (im Lizenztext
nachzulesen). Senify ist `private: true` und nicht vertrieben — die praktische Folge ist gering,
der Punkt gehört aber in die Akte.

---

## 6 — Maßnahmenplan

Jede Zeile nennt den Beleg und das Gate, das sie braucht. **Kein Schritt ist hier gestartet.**

| # | Maßnahme | Bereich | Aufwand | Beleg | Gate aus `docs/fahrplan.md` |
|---|---|---|---|---|---|
| 1 | `setNodeHiddenDevices` in `PAGE_OPS` + Test über die Pipeline | Editor | sehr klein | 4.1 | `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` |
| 2 | `pending = [...batch, ...pending]` an beiden Stellen + zwei Tests | Editor | sehr klein | 4.2 | wie 1 |
| 3 | Registry-Konflikt: Version melden und übernehmen | Editor + Engine | klein | 4.3 | wie 1 + `pnpm test:postgres` |
| 4 | Skript „Temp auf dem Repo-Laufwerk“ | Entwicklungsfluss | sehr klein | 2.3 | `pnpm test` (grün) |
| 5 | Coverage-Liste auf die Fachmodule ausdehnen | Qualität | klein | 4.6 | `pnpm test:coverage`, `pnpm quality:check` |
| 6 | Drift-Tor für das Manifest | MCP/Doku | klein | 4.7 | `pnpm test`, `pnpm manifest:render` (unverändert) |
| 7 | `dependency-cruiser` mit den ADR-Regeln | Qualität | klein | Fachanalyse 6 | `pnpm test` |
| 8 | `gitleaks` + `osv-scanner` im CI | CI | klein | Fachanalyse 5 | CI-Lauf |
| 9 | `spawnSync` → `spawn` im Bake | Betrieb | klein | 4.4 | `pnpm verify:parity`, `pnpm verify:import` |
| 10 | Eigenschaft „jede Engine-Operation erzeugt eine Pending-Liste“ (`fast-check`) | Editor | mittel | Fachanalyse 6 | wie 1 |
| 11 | `pglite`-Spike gegen `transactions.test.ts` | Qualität | mittel | Fachanalyse 6 | `pnpm test` (ohne Sprünge) |
| 12 | `ipaddr.js`-Spike gegen `net.test.ts` | Sicherheit | klein | Fachanalyse 6 | `packages/core/test/net.test.ts` |
| 13 | Entscheidung: Reichweite von ADR-0016 auf interne Dienste | Sicherheit | — | 4.8 | ADR (neu oder Ergänzung) |
| 14 | Merge der vier Job-Queues in ein Fachmodul | Backend | mittel | Fachanalyse 6 | `pnpm test:coverage`, `pnpm test:postgres` |
| 15 | MCP-SDK-v1→v2 prüfen | MCP | mittel | Fachanalyse 6 | `pnpm test` (MCP-Suiten) |

**Reihenfolge nach Wirkung und Aufwand:** 1–9 sind billig und je ein Gate. 10–12 sind die
Werkzeugfragen. 13 ist eine Entscheidung, kein Schritt. 14 und 15 gehören in bestehende
Fahrplan-Schritte (P3-2 für `http.ts` / `mcp/tools.ts`).

**Was ich nicht empfehle:** ein sofortiger Umbau der Query-Erzeugung, ein Austausch der
Job-Queues gegen eine fremde Bibliothek, ein CSS-Stack von außen, `immer` im Editor, ein
OpenAPI-Dokument ohne Anlass.

### 6.1 Umsetzungsstand vom 20.10.2026

Der Plan ist abgearbeitet. Jede Zeile nennt, was tatsächlich gemacht wurde und wie es belegt ist.

| # | Stand | Was |
|---|---|---|
| 1 | **erledigt** | `"setNodeHiddenDevices"` in `PAGE_OPS` (`packages/editor/src/state/persist.ts:151`). Der Test geht über die **Pipeline** (Store → `flush()` → Request-Body), nicht über die Übersetzungsfunktion. Ohne die Zeile ist `packages/editor/test/state/persist-vocabulary.test.ts` rot — gegengeprüft. |
| 2 | **erledigt** | `pending = [...batch, ...pending]` an **allen vier** Stellen, an denen die Warteschlange fortgeschrieben wird (`packages/editor/src/state/persist.ts:576`, `:611`, `:620`, `:628`). Zwei Tests: eine Änderung während eines fehlschlagenden und während eines konfligierenden Requests. Ohne die Änderung sind beide rot — gegengeprüft. |
| 3 | **erledigt** | Die Engine meldet die aktuelle Registry-Version im Konfliktfehler (`currentVersion` in `SenifyErrorDetails`, `packages/engine/src/store-style-rules.ts:726-729`), der Client übernimmt sie (`readCurrentVersion`, `persist.ts:369`) und sendet sie beim Wiederholen (`persist.ts`, `retry()`). Vorher schickte der Wiederholungsweg die **Seiten**version als Registry-Version — der Konflikt war nicht auflösbar. Zusätzlich: der Ablehnungsfall (Transport lehnt ab) und der verbrauchte Debounce. |
| 4 | **überholt** | Die Ursache lag nicht im Temp-Verzeichnis, sondern im Bake: Astro verschob die gebauten Dateien per `rename()` aus dem Stage-Ordner (im Repo) in den Zielordner (im Temp), und ein `rename()` über Laufwerke scheitert mit `EXDEV`. Der Bake baut jetzt neben der Stage und kopiert das Ergebnis (`packages/renderer/src/bake.ts`, `buildInto`). Ein Umgebungsskript hätte den Fehler nur in dieser einen Umgebung verdeckt. |
| 5 | **erledigt** | Die Coverage-Liste misst jetzt auch `packages/engine/src/store-*.ts` und `http-*.ts` — 33 Dateien, rund 7 000 Zeilen, die vorher ungemessen waren. Drei schwach gemessene Dateien haben eigene Schwellen, damit die Gruppen-Schwelle nicht auf das niedrigste File fällt. |
| 6 | **erledigt** | `scripts/render-manifest.mjs --check` vergleicht die generierte Datei mit dem Generator (zeilenendunabhängig), `pnpm manifest:check` ruft das, ein Test in `packages/manifest/test/manifest.test.ts` ruft es im normalen Lauf, die CI hat einen eigenen Schritt. |
| 7 | **erledigt** | `.dependency-cruiser.js` mit sieben Regeln (Paketkanten aus ADR-0019/P3-3, keine verbotene Basis-Abhängigkeit, kein neuer Zyklus zwischen Paketen). `pnpm deps:check` hängt an `pnpm verify` und an der CI. Gegenprobe: ein temporärer Zyklus über Paketgrenzen wurde vom Tor gemeldet, nach dem Entfernen nicht mehr. |
| 8 | **erledigt** | `gitleaks` und `osv-scanner` als eigene CI-Jobs, beide mit gepinnter Version und **geprüfter Prüfsumme**. Der `osv-scanner` holt sein Binary aus dem Release und vergleicht es gegen `osv-scanner_SHA256SUMS`; der Weg über den revidierbaren Fremd-Workflow von Google brachte den **ganzen Lauf** in einen `startup_failure` — belegt durch eine Gegenprobe: ohne den Job startete der Lauf, mit dem Fremd-Workflow nicht. **Belege:** der gitleaks-Job meldet **keinen** Fund — der Historien-Scan ist lokal nachgefahren (`no leaks found`); die Ausnahmen in `.gitleaks.toml` tragen je einen Grund und unterscheiden drei Sorten: absichtliche Beispielschlüssel in **getrackten** Dateien (zwei Idempotency-Keys im Redesign-Test, der SMTP-Testschlüssel — **Gegenprobe**: ohne diese Ausnahme meldet der Historien-Scan 3 Funde), lokales Arbeitsmaterial, das nie committet wird (`.scratch/refs/nick/`, `.tmp/`, `.bake-tmp/`, `graphify-out/`, `packages/renderer/.bake/` — steht in der `.gitignore`) und zwei Fehlalarme der generischen Regel in getrackten Notizen (Prosa und ein Bezeichner, kein Schlüssel). Auch der Arbeitsbaum-Scan meldet mit dieser Liste nichts. Der OSV-Scan meldet **ohne** Ausnahmeliste 5 Funde in 3 Paketen (`vitest`/`@vitest/mocker` 3.2.7, `tinypool` 1.1.1, `http-cache-semantics` 4.2.0) — die vier Advisory-IDs dazu sind mit Ablaufdatum 30.11.2026 ausgenommen, mit der Ausnahmeliste meldet der Scanner `No issues found` (lokal und im CI-Job). Die Lücken der ersten Messung (16) sind mit den Overrides (`devalue`, `sharp`, `smol-toml`, `source-map-js`, `hono`) und dem SDK-Update (`@modelcontextprotocol/sdk` 1.30.0 → 1.32.1) geschlossen. |
| 9 | **erledigt** | `spawn` statt `spawnSync` (`packages/renderer/src/bake.ts`). Der Bake blockiert die Event-Loop nicht mehr: während eines Re-Bakes antworten Dashboard, Editor und MCP wieder. |
| 10 | **anders gelöst** | Die Eigenschaft „jede Engine-Operation erzeugt eine Pending-Liste“ ist als **Wörterbuch-Test** implementiert, nicht als Zufalls-Eigenschaft: `packages/editor/test/state/persist-vocabulary.test.ts` fährt alle 19 Operationen des Engine-Vokabulars durch den Store und die Pipeline. Das ist **stärker** als ein Generator: das Vokabular ist eine geschlossene Liste, ein Zufallsgenerator könnte eine Operation auslassen. Eine zweite Eigenschaft (Patch → Mutation → Patch) prüft dieselben 19 Operationen auf einen stabilen Zustand. **`fast-check` wurde deshalb nicht eingeführt** — es hätte die Abhängigkeit gebracht, ohne einen Fall zu finden, den die erschöpfende Prüfung nicht findet. |
| 11 | **erledigt, mit adoption** | Der Spike war positiv: PGlite (PostgreSQL nach WebAssembly, im Prozess) legt das Schema der Engine an und rollt eine Transaktion echt zurück. Übernommen: `createTransactionDatabase()` in `packages/engine/test/helpers.ts` nimmt das konfigurierte PostgreSQL, sonst PGlite. Die 16 zuvor übersprungenen Transaktionsfälle laufen damit im **normalen** Testlauf, nicht nur in der CI-Lane mit Postgres-Dienst. |
| 12 | **erledigt, weggelassen** | `ipaddr.js` wurde über einen Korpus von 42 Adressen gegen die Hand-Klassifikation geprüft: **4 Unterschiede**, davon zwei zu *locker* (die Benchmarking-Range 198.18/15 und das veraltete Site-Local `fec0::1` kennt die Bibliothek nicht) und einer zu *strenger* (6to4). Die Bibliothek ersetzt damit einen Teil der Hand-Logik, aber die Policy (welche Bereiche öffentlich sind) bleibt handzuschreiben — und die harten Teile des Moduls (DNS-Auflösung, Pinning, Redirect-Prüfung, Byte-Grenze) bleiben ohnehin. **Verdikt: weglassen**, die Hand-Klassifikation bleibt. |
| 13 | **entschieden und umgesetzt** | ADR-0022 (20.10.2026) erweitert ADR-0016 auf den Browserpfad: jeder Request des Referenz- und des Import-Captures läuft durch dieselbe Adressprüfung (`isAllowedBrowserUrl` in `@senify/core/net`, Playwright-Route auf `**/*`). `file:` bleibt für den Offline-Mirror erlaubt. |
| 14 | **nicht begonnen, mit Begründung** | Die Analyse nannte den Merge „mechanisch“ — das hält der Blick auf den Code nicht. Von den vier Queues haben **nur zwei** (Bake, Bild) eine Lease; die Import- und die Referenz-Jobs kennen keinen Lease-Claim, sondern ein `listDue`-Muster. Die Semantik unterscheidet sich weiter: der Bake-Job zählt bei einem Fehler mit Backoff auf, der Bild-Job geht sofort in `failed`; der Bake-Job kennt `next_attempt_at`, der Bild-Job nicht. Eine gemeinsame Repository-Klasse bräuchte fünf bis sechs Stellschrauben (Tabelle, Spalten, Reihenfolge, Zusatzfilter, Zusatzklausel) und würde das SQL aus Strings zusammenbauen — lesbarer wird es dadurch nicht, und es widerspricht ADR-0019 (ein Fachmodul je Fachgebiet). Die eigentliche Begründung des Merge („erst vereinheitlichen, **dann** über eine fremde Queue entscheiden“) verliert ihren Grund, weil dieselbe Analyse zum Ergebnis kommt, dass eine fremde Queue weniger Integration und nicht mehr Funktion bringt. **Befund dokumentiert, nicht umgesetzt.** |
| 15 | **erledigt, mit Verdikt** | Der MCP-SDK steht auf **v1.32.1** (npm, MIT, veröffentlicht 05.10.2026). v2 existiert nur im Git-Repository (`v2.3.1`), **nicht** auf npm — ein Produktiv-Abhängigkeit darauf wäre eine Git- oder Prerelease-Referenz. Die genutzte API ist klein (`Server`, `StdioServerTransport`, wenige Typen), ein späterer Wechsel ist eingegrenzt. Der Lizenzwechsel des Projekts (MIT → Apache-2.0 für neue Beiträge) betrifft die veröffentlichte v1 nicht. |

**Nebenwirkungen, die dabei entstanden sind und im Bericht vom 19.10.2026 nicht stehen konnten:**
`pg-mem` war eine **Produktiv**-Abhängigkeit von `@senify/core`, obwohl nur der `./testing`-Subpfad
ihn braucht (jetzt DevDependency); der Test der Docs-Portals zog den MCP-Server in den
Docs-Build (die Kante, die P3-3 Punkt 4 aufgelöst hatte, hielt der Test fest — jetzt kommt die Zahl
der Werkzeuge aus dem Manifest); `.tmp/` und `.bake-tmp/` lagen als ungetrackte Artefakte im
Arbeitsbaum und stehen jetzt in `.gitignore`.

**Was erst der CI-Lauf zeigte** (drei Befunde, die lokal unsichtbar waren — der lokale Lauf ist
Windows, der CI-Lauf Linux, und die Auflösung des Lockfiles ist plattformabhängig):

- **Playwright musste zurück auf 1.63.0.** Die Aktualisierung der Abhängigkeiten zog Playwright
  von 1.63 auf 1.64.1, und damit ändert sich der Browser, mit dem die **Bildreferenzen**
  aufgenommen wurden: `release-cutover-browser`, `widget-slice-browser`,
  `import-visual-gate-browser` und `import-fixture-gate-browser` vergleichen Pixel und melden
  Unterschiede. Die Referenzen werden ohnehin nur aus einem Linux-Lauf der CI neu aufgenommen
  (so im Fahrplan festgehalten), deshalb steht Playwright wieder auf 1.63.0.
- **Zwei Playwright-Versionen im Baum ergeben zwei `Page`-Typen.** `@axe-core/playwright` löst
  seinen Peer gegen die **neueste** passende Version auf (`playwright-core` 1.64.1), die
  Browser-Tests benutzen den Typ aus dem `playwright`-Paket (1.63.0) — der Typecheck bricht mit
  `TS2739` ab (`getByRef`, `webmcp` fehlen). `playwright-core` ist deshalb auf 1.63.0 gepinnt.
- **`hono` 4.13.8 (GHSA-5r4p-p66f-jhc7, Mittel)** stand im Lockfile, obwohl 4.13.11 die
  gepatchte Version ist — der lokale Scan hatte es nicht gesehen, weil das Lockfile dort noch
  737 statt 763 Pakete auflöste. Ein Override wie bei den anderen drei.

---

## 7 — Was ich ausdrücklich **nicht** behaupte

- **Kein Befund gegen geschlossene Risiken.** R1 bis R9, R11 und R13 sind im Fahrplan geschlossen;
  ich melde sie nicht erneut. R10 ist im Kompensationsvertrag geschlossen, mit einer ausdrücklich
  dokumentierten Grenze (keine gemeinsame Datei-/DB-Transaktion) — ich melde sie ebenfalls nicht
  erneut, sondern weise nur darauf hin, dass **die zweite** solche Grenze (Restore, Fachanalyse 3,
  B5) noch nicht dokumentiert ist. R12 (God-Files) ist offen und im Fahrplan eingeplant — ich habe
  nichts hinzugefügt, was darüber hinausgeht.
- **Keine Änderung an bestehenden Entscheidungen.** ADR-0016 bleibt angenommen. Meine Aussage
  dazu ist eine **vermessene Reichweite**, keine Wiedereröffnung.
- **Keine Laufzeitbelege für die Browser-Befunde.** Die Netzwerkbefunde sind Codeableitungen. Es
  wurde **kein** Angriff durchgeführt, kein Redirect auf einen privaten Dienst versucht, kein
  Metadatendienst abgerufen.
- **Keine Prüfung jeder Funktion.** 15 Pakete, sieben Bereiche, Stichproben mit Belegen. Anhang B
  benennt die geprüfte Tiefe je Bereich.
- **Keine Aussage über die aktuellen Testzahlen des Projekts.** Die Zahlen in
  `docs/current/qualitaet.md` sind der maßgebliche Stand; die Laufzahlen dieser Untersuchung
  stehen in Anhang A und sind **nicht** in die Projektdokumentation kopiert.
- **Kein Gate dieser Untersuchung.** Diese Untersuchung ist eine Analyse, kein Umsetzungsschritt
  im Sinne des Fahrplans. Für die Maßnahmen 1–15 gilt die Definition of Ready des Fahrplans
  (sauberer Arbeitsbaum, benannte Zieldateien, benannte Schnittstellen).
- **Keine Aussage über `origin/master` nach `5ac1a84`.** Der lokale Stand war zum Analysezeitpunkt
  synchron; ein zwischenzeitlicher Push ist nicht berücksichtigt.

---

## Anhang A — Testläufe dieser Untersuchung

| Lauf | Umgebung | Ergebnis |
|---|---|---|
| `pnpm test` (1) | `%TEMP%` auf `C:`, Repo auf `G:` | 40 Dateien rot / 111 Tests rot / 2318 bestanden / 29 übersprungen; 483,91 s; **eine** Ursache: `EXDEV` |
| `vitest run packages/renderer/test/widget-bake.test.ts` | `%TEMP%` auf `G:` | 1 Datei grün / 2 Tests grün; 48,93 s |
| `pnpm test` (2) | `%TEMP%` auf `G:` | **4 Dateien rot / 268 grün / 3 übersprungen (275)**, 732,87 s |

**Die vier roten Dateien des zweiten Laufs — alle unter Last, keine Funktionsfehler:**

| Datei | Fehler | Einordnung |
|---|---|---|
| `packages/mcp/test/write-output.test.ts` | `Failed Suites`: `[vitest-worker]: Timeout calling "fetch"` beim Laden des Moduls | Lade-Timeout unter Last |
| `packages/app/test/release-cutover-browser.test.ts` | `Matcher did not succeed in time` — `expected 'Veröffentliche …' to contain 'aktiv'` | Playwright-Timeout; **im Repo als bekannter Flake dokumentiert** (`docs/current/qualitaet.md` Zeilen 40, 68, 70: der `/api/events`-Stream bricht ab) |
| `packages/engine/test/design-record.test.ts` | `Test timed out in 90000ms` | Review-Test mit Bake |
| `packages/engine/test/lifecycle.test.ts` | `Test timed out in 90000ms` | Review-Test mit Bake |

**Ein Zusammenhang, der wichtig ist:** Die beiden 90-Sekunden-Timeouts sind **Review-Tests mit
Bake**. Im grünen Lauf brauchen die Nachbarn desselben Zyklus 12,3 s, 15,3 s und 23,8 s
(`submits a review with preview, diff and checks`, `runs request changes → fix → approve →
release`, `rolls back to an older release as a new release`). Unter Last derselben Suite
überschreiten sie die 90 s. Die Marge ist also dünn — und der Grund ist der **synchrone Bake**
(Befund 4.4). Der Bake ist nicht nur ein Betriebsproblem, er ist auch die Ursache der
testseitigen Flakes.

**Beide Läufe liefen** ohne `TEST_DATABASE_URL` (also gegen `pg-mem`) und ohne gesetztes
`SENIFY_REQUIRE_BROWSER` (Browser-Suiten, die keinen Browser finden, überspringen sich still).

## Anhang B — Prüftiefe je Bereich

| Bereich | Tiefe | Nicht erreicht |
|---|---|---|
| Architektur / Kern | Paketraster, Store-Fassade, 29 Fachmodule, alle ADRs | jede Store-Methode |
| Backend / Sicherheit | Auth, Rate-Limit, Wartungstor, Adressprüfung, Idempotenz, Deploy, Backup | alle ~90 Routen einzeln |
| Frontend / Editor | Save-Pipeline vollständig, Store-Operationen, Patch-Übersetzung, Inspektor, Shell-Verdrahtung | Canvas, Frames, Drag&Drop, Tastatur |
| Renderer / Betrieb | Bake vollständig, Re-Bake-Worker, Lease, Wartungstor, Restore, Deploy | echter Release, echter Deploy |
| KI / Import / Referenzen | Capture-Kette, Import-Vorschau, Analyse-Worker, Bild-Worker | Fremdseiten-Lauf, Bild-Job |
| MCP / Dokumentation | Serverlaufzeit, Manifest, Generator, Skills, Paketgrenzen | Live-Werkzeugaufruf, Portal-Doku |
| Qualität / CI | Vitest-Konfiguration, vier CI-Jobs, zwei Volltests, Gitignore | Coverage-Lauf, Postgres-Lane, `pnpm audit` |

## Anhang C — Dateien dieser Untersuchung

| Datei | Inhalt |
|---|---|
| `research_notes/Senify Projektanalyse und GitHub Recherche/00-arbeitsstand.md` | Untersuchungsrahmen, Belegregister, Prüfgrenzen, Arbeitsstand |
| `…/01-autosave-editor.md` | Fachanalyse 1 — Autosave-Pipeline und Editor-Zustand (5 Befunde) |
| `…/02-netzwerkgrenze.md` | Fachanalyse 2 — Node-Pfad, Browser-Pfad, ADR-0016 |
| `…/03-build-betrieb.md` | Fachanalyse 3 — Build, Betrieb, Jobs, Backup (6 Befunde) |
| `…/04-mcp-dokumentation.md` | Fachanalyse 4 — MCP-Vertrag, Manifest, Dokumentation |
| `…/05-qualitaet-ci.md` | Fachanalyse 5 — Qualität, Coverage-Tor, CI |
| `…/06-github-repositories.md` | Fachanalyse 6 — 21 Kandidaten, Nutzen, Urteil |
| `…/autosave-probe.mts` | die sechs ausgeführten Gegenproben (Review-Sonde, kein Regressionstest) |
| `reports/senify-projektanalyse-2026-10.md` | dieser Bericht |
