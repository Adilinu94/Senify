# Fachanalyse 6 — GitHub-Repositories: Kandidaten, Nutzen, Urteil

**Methode.** Alle Zahlen stammen aus der **GitHub-API** (Abruf 19.10.2026), nicht aus
Suchergebnissen: `GET /api.github.com/repos/{owner}/{repo}` liefert Lizenz, Sternchen, letzten Push,
Archivstatus und offene Issues; `GET /api.github.com/repos/{owner}/{repo}/releases/latest` liefert
die letzte Version. Zwei Repositories wurden über die Such-API gefunden, weil die naheliegenden
Pfade 404 gaben (`timmoth/pg-boss` → `timgit/pg-boss`,
`thearpad/node-pg-migrate` → `salsita/node-pg-migrate`).

**Abgrenzung.** Jeder Kandidat ist an einem **konkreten, in diesem Bericht belegten Bedarf**
festgemacht. Repositories ohne Bezug zu einem Befund sind nicht aufgeführt. Die Urteile sind
**Empfehlungen**, keine getroffenen Entscheidungen — jede Adoption braucht die Zustimmung von
Adi und ein Gate aus `docs/fahrplan.md`.

**Lizenzhinweis vorab.** Die MCP-Projekte (`modelcontextprotocol/*`) befinden sich in einer
**Lizenzumstellung von MIT auf Apache-2.0** (Text in allen drei `LICENSE`-Dateien: „The MCP
project is undergoing a licensing transition from the MIT License to the Apache License, Version
2.0“). Senify ist `private: true` und wird nicht vertrieben; die praktische Folge ist gering —
der Punkt gehört aber in die Entscheidungsakte, weil eine Umstellung auch eine
Berichtspflicht-Pflicht auslöst, wenn das Projekt je veröffentlicht wird.

---

## Die Empfehlung in einem Satz

**Vier Adoptions, ein Spike, zwei Referenzen, der Rest weggelassen** — und der Grund ist in
jedem Fall benannt.

| # | Repository | Lizenz | Wartung | Urteil | Bedarf |
|---|---|---|---|---|---|
| 1 | `sverweij/dependency-cruiser` | MIT | aktiv (Push 19.10.2026, v18.6.0) | **übernehmen** | ADR-0019 zerlegt den Store in 29 Fachmodule; die Paketkanten sind tragend und bisher nur im Kopf geschützt |
| 2 | `dubzzz/fast-check` | MIT | sehr aktiv (Push 19.10.2026, v4.10.2) | **übernehmen** | eine Eigenschaft hätte den Autosave-Befund D sofort gefunden |
| 3 | `gitleaks/gitleaks` | MIT | aktiv (Push 30.09.2026, v8.30.1) | **übernehmen** | die CI prüft heute keine Geheimnisse |
| 4 | `google/osv-scanner` | Apache-2.0 | sehr aktiv (Push 18.10.2026) | **übernehmen** | die CI prüft heute keine Abhängigkeitslücken |
| 5 | `electric-sql/pglite` | Apache-2.0 | sehr aktiv (Push 19.10.2026, 16 170 ★) | **Spike** | 16 übersprungene Transaktionsfälle je Lauf, weil `pg-mem` keine echte PostgreSQL ist |
| 6 | `whitequark/ipaddr.js` | MIT | gepflegt (Push 27.09.2026, 661 ★) | **Spike** | 60 Zeilen handgeschriebene IP-Klassifikation in `packages/core/src/net.ts` |
| 7 | `modelcontextprotocol/typescript-sdk` | MIT → Apache-2.0 | sehr aktiv (Push 18.10.2026, v2.3.1) | **Spike** | Senify nutzt `^1.30.0`; es gibt eine v2-Linie |
| 8 | `modelcontextprotocol/inspector` | MIT → Apache-2.0 | aktiv (Push 14.10.2026, 11 102 ★) | **Referenz** | 106 Werkzeuge manuell prüfen |
| 9 | `modelcontextprotocol/modelcontextprotocol` | MIT → Apache-2.0 | sehr aktiv | **Referenz** | das offizielle Werkzeug-Schema für das Drift-Tor |
| 10 | `salsita/node-pg-migrate` | MIT | aktiv (Push 19.10.2026, 1 490 ★) | **Referenz** | `db.ts:130` sagt ausdrücklich: „there is no migration tooling in v1“ |
| 11 | `ai/size-limit` | MIT | aktiv (Push 07.10.2026, 14.2.0) | **Spike** | `app.js` ist 7436 Zeilen; der Fahrplan verschiebt „Dateigrößen-Budgets“ |
| 12 | `graphile/worker` / `timgit/pg-boss` | MIT | beide aktiv | **Referenz** | vier selbstgebaute Job-Queues — erst vereinheitlichen, dann ersetzen |
| 13 | `pinojs/pino` | MIT | aktiv (Push 06.10.2026, v10.4.0) | **Referenz** | 7 Server-Protokolle ohne Kontext |
| 14 | `csstree/csstree`, `postcss/postcss`, `csstools/postcss-plugins` | MIT / MIT / MIT-0 | alle aktiv | **weglassen** | das Projekt hat eine eigene, bewusst validierende CSS-Grammatik |
| 15 | `kysely-org/kysely`, `drizzle-team/drizzle-orm`, `knex/knex` | MIT / Apache-2.0 / MIT | aktiv | **weglassen** | rohes SQL ist hier eine Festlegung, kein Mangel |
| 16 | `nock/nock`, `mswjs/msw` | MIT | beide sehr aktiv | **weglassen** | der Autosave-Test braucht eine ablehnende Funktion, keine Bibliothek |
| 17 | `braintree/sanitize-url` | MIT | träge (Push 20.06.2026) | **weglassen** | `sanitize-html` deckt es ab |
| 18 | `immerjs/immer` | MIT | sehr aktiv (v11.1.21) | **weglassen** | der Editor hat ein eigenes Patch- und History-Modell |
| 19 | `nodejs/undici` | MIT | sehr aktiv | **weglassen** | Node bringt `fetch` mit |
| 20 | `renovatebot/renovate` | AGPL-3.0 | aktiv | **weglassen** | Dependabot ist im Repo schon benannt (`verify.yml:38`) |
| 21 | `stoplightio/spectral` | Apache-2.0 | aktiv (v6.17.0) | **weglassen** | es gibt kein OpenAPI-Dokument, das man linten könnte |

---

## 1 — `sverweij/dependency-cruiser` (MIT) — **übernehmen**

**Bedarf.** ADR-0019 hat den `Store` in 29 Fachmodule zerlegt, P3-3 Punkt 4 hat das Manifest in
ein eigenes Paket gezogen, **weil** eine Paketkante einen Zyklus erzeugt hatte. Diese Zyklen sind
damit **Handarbeit** — geschützt durch eine Entscheidung im Kopf, nicht durch eine Regel im Code.
Die Route-Matrix wird inzwischen aus dem Manifest erzeugt, „statt `tools.ts`-Textparsing“
(Fahrplan P3-3 Punkt 8); genau solche Regeln sind es, die beim nächsten Umbau brechen.

**Konkret nutzbar.** Eine Regeldatei, die verbietet:

- `docs-portal → mcp` (der Zyklus, den P3-3 Punkt 4 aufgelöst hat),
- `manifest → mcp` (das Paket muss neutral bleiben),
- `mcp → docs-portal` (die Gegenkante),
- `engine → app` und `app → engine` (die Fassade darf nur in eine Richtung kennen).

**Aufwand.** Eine Konfigurationsdatei, ein `pnpm exec depcruise` im `verify`-Skript, ein
CI-Schritt. **Lizenz** MIT, keine Laufzeitabhängigkeit (nur DevDependency), 7307 ★, Push am
19.10.2026.

**Warum jetzt.** Jeder weitere P3-2-Schritt (der Fahrplan nennt `http.ts`, `mcp/tools.ts`,
`app.js`) berührt Paketgrenzen. Eine Regel, die die bereits getroffenen Entscheidungen mechanisch
prüft, ist billiger als eine neue Entscheidung pro Umbau.

**Risiko.** Gering. Das Werkzeug meldet nur; es verändert nichts. Ein Zyklus, der legitim ist,
wird als Ausnahme eingetragen — mit derselben Begründung, die heute in den ADR steht.

---

## 2 — `dubzzz/fast-check` (MIT) — **übernehmen**

**Bedarf.** Die Engine hat eine **Vokabular-Operation** (`EDITOR_MUTATION_OPS`,
`packages/engine/src/mutations/contract.ts:38-58`, 19 Operationen). Der Editor hat eine **andere
Vokabular-Liste** (`PAGE_OPS` ∪ `SITE_OPS`, `packages/editor/src/state/persist.ts:127-150`,
18 Operationen). Die beiden Listen werden von Hand synchron gehalten — und genau das ist
gescheitert: **`setNodeHiddenDevices` fehlt in der Editor-Liste** (Fachanalyse 1, Befund D). Die
Engine kann die Operation vollständig; der Editor verwirft sie, und der Benutzer verliert die
Änderung beim Neuladen.

**Die Eigenschaft, die den Fehler gefunden hätte.**

```
Für jede Operation op ∈ EDITOR_MUTATION_OPS:
  store.apply(op)  ⇒  pending.length > 0  ∧  unsupported ∌ op
```

Diese eine Eigenschaft, gegen die 19 Operationen geprüft, hätte den Fehler **beim Bauen des
Tests** gefunden — nicht beim Benutzer. Sie ist keine künstliche Konstruktion: „die Engine kann
alles, was sie beschreibt, und der Editor lässt nichts davon fallen“ ist eine **Aussage über das
Produkt**, und sie ist falsch.

**Zweiter Nutzen.** Die Patch-Übersetzung (`patchesToPending`) ist eine Abbildung mit
Rückrichtung: Patch → Mutation → Patch. `fast-check` kann zufällige Operationsfolgen erzeugen und
prüfen, ob der Zustand nach dem Hin- und Zurück wieder derselbe ist. Die vorhandenen Tests decken
Einzelfälle ab (`persist.test.ts`, 14 Fälle in der Pipeline).

**Aufwand.** Eine DevDependency. Der Einstieg ist eine Datei mit einer Eigenschaft; die
Generatoren für die Operationen sind der eigentliche Aufwand, aber überschaubar (die Operationen
sind eine geschlossene Liste, keine freie Algebra).

**Lizenz** MIT, 5208 ★, Push am 19.10.2026, v4.10.2 (19.09.2026), offizielles Paket `@fast-check/vitest`
für Vitest-Integration. **Risiko** gering: reine Testabhängigkeit, kein Produktivcode.

**Einschränkung, die ich nennen muss.** `fast-check` findet **Gegenbeispiele**, keine Beweise. Die
Eigenschaft oben ist vollständig (alle 19 Operationen), also wäre ein Fehlschlag ein echter Befund.
Für die Patch-Umkehr gilt das nicht in jedem Fall — dort ist die Eigenschaft eine
**Hypothese**, die der Compiler prüfen muss.

---

## 3 — `gitleaks/gitleaks` (MIT) — **übernehmen**

**Bedarf.** Das Programm verwaltet einen **Operator-Token** (`packages/app/src/server.ts:168-170`,
der Proxy hängt ihn an), API-Tokens (`api_tokens`-Tabelle, `db.ts:75`) und Deployment-Token
verschlüsselt (ADR-0017, „Schlüssel außerhalb der Datenbank“). Die CI prüft **kein** Geheimnis.
Ein versehentlich committeter Token wäre ein Vollzugriff auf das lokale Programm und — bei einem
konfigurierten Netlify-/Vercel-Token — auf den Deploy-Konten.

**Aufwand.** Ein Workflow-Schritt (`gitleaks detect --source . --redact`), eine `.gitleaks.toml`
mit den Ausnahmen, die das Projekt wirklich braucht (Beispielkonfigurationen, `full.log`?).
Das Werkzeug ist ein Go-Binary; die Releases liegen für alle drei Plattformen vor, der Schritt
lädt sie und prüft die Prüfsumme.

**Lizenz** MIT, 30 127 ★, Push am 30.09.2026, v8.30.1. **Risiko** gering, mit einer
Einschränkung: Falschmeldungen. Der Operator-Token wird zur Laufzeit erzeugt und liegt im
Datenverzeichnis (ignoriert) — das ist die wahrscheinlichste Falschmeldung und gehört in die
Ausnahmeliste.

---

## 4 — `google/osv-scanner` (Apache-2.0) — **übernehmen**

**Bedarf.** Die Abhängigkeitsliste ist gewachsen: Astro 7, Playwright 1.63, Vite 8, Three.js,
GSAP, Tailwind 4, TypeBox, `pg`, `sharp`, `sanitize-html`, `marked`, `@modelcontextprotocol/sdk`.
Die CI prüft keine davon auf bekannte Schwachstellen. `pnpm audit` wäre die Minimalvariante (ohne
zusätzliche Abhängigkeit, aber mit der pnpm-Audit-Datenbasis).

**Warum OSV-Scanner statt nur `pnpm audit`.** OSV-Scanner liest `pnpm-lock.yaml` **und** prüft
gegen die OSV-Datenbank (Google, Branchenstandard); es findet auch Pakete, die unter einem
anderen Namen geführt werden. Es ist ein Go-Binary — im CI ein Download-Schritt mit
Prüfsummenvergleich.

**Lizenz** Apache-2.0, 11 211 ★, Push am 18.10.2026. **Aufwand** ein CI-Schritt.
**Risiko** mittel (Mittel): Der Scanner meldet auch transitive Schwachstellen, die im
Node-Modulbaum gar nicht landen. Die Auswertung braucht eine Ausnahmeliste — sonst wird der
Schritt nach einem Monat ignoriert, und Ignorierte Schritte sind schlechter als fehlende.

---

## 5 — `electric-sql/pglite` (Apache-2.0) — **Spike**

**Bedarf.** Die Testsuite läuft gegen `pg-mem` — eine **Emulation**, kein PostgreSQL. Die
Folge steht im Fahrplan und in `docs/current/qualitaet.md` mehrfach:

- „die Atomarität ist mit pg-mem nicht prüfbar“ (Fahrplan, P3-2 Schritt 7),
- 16 **übersprungene** Transaktionsfälle je Volltest ohne `TEST_DATABASE_URL`
  (`qualitaet.md`, Zeile 92: „1068 bestanden / **15 übersprungen**“),
- `store-assets.test.ts`: „die Atomarität von `replaceAssetDerivatives` ist ein Beweis gegen echte
  Postgres und ohne `TEST_DATABASE_URL` übersprungen“ (Zeile 45).

**Was PGlite ändert.** PGlite ist echtes PostgreSQL, nach WebAssembly kompiliert, im Prozess, ohne
Server. Die 16 lokalen Sprünge entfallen; die Tests prüfen Transaktionen, Rollbacks und
`FOR UPDATE` gegen die echte Engine. Die CI-Lane gegen PostgreSQL 18 bleibt zusätzlich bestehen —
sie prüft die Version, die deployed wird.

**Aufwand.** Mittler: PGlite spricht das Postgres-Protokoll; der bestehende `pg`-Treiber kann über
den Socket-Server-Modus darauf zugreifen. Das ist eine Anpassung des Test-Harnesses, kein
Umbau der Engine.

**Lizenz** Apache-2.0, 16 170 ★, Push am 19.10.2026, sehr aktive Entwicklung. **Risiko** mittel:
Der WASM-Start kostet Zeit je Testprozess (das ist bei 275 Dateien relevant), und nicht jede
PostgreSQL-Funktion ist in der WASM-Version gleich. **Deshalb Spike, nicht Adoption** — der Spike
misst Startzeit und Funktionsabdeckung an **einer** Suite (`packages/engine/test/transactions.test.ts`).

**Nebenbei zu prüfen:** `pg-mem` ist eine Abhängigkeit, die mit PGlite entfallen könnte. Das
`@senify/core`-Paket führt sie heute als **Produktiv**-Abhängigkeit (`packages/core/package.json`:
`pg-mem@^3.0.5`) — obwohl sie nur von Tests gebraucht wird. Das ist ein Fund: eine Emulation von
PostgreSQL gehört nicht in die Laufzeitabhängigkeiten eines Pakets, das eine echte Datenbank
ansteuert.

---

## 6 — `whitequark/ipaddr.js` (MIT) — **Spike**

**Bedarf.** `packages/core/src/net.ts:35-96` enthält rund 60 Zeilen handgeschriebener
IP-Klassifikation: IPv4-Bereiche, IPv6-Gruppen, IPv4-verpacktes IPv6, NAT64, 6to4, Teredo,
unique local, link-local, site-local, multicast, documentation, discard. Das ist **genau** die
Logik, bei der ein fehlender Bereich eine Sicherheitslücke ist — und sie muss bei jeder neuen
 reservierten RFC nachgezogen werden.

`ipaddr.js` bietet eine mature `range()`-Klassifikation (`unicast`, `private`, `loopback`,
`linkLocal`, `uniqueLocal`, `carrierGradeNat`, `reserved`, …) und ist seit 2011 im Einsatz.

**Was der Spike klären muss.** Die **beobachtbare** Reihenfolge muss bleiben: die Meldung
„Nur öffentliche http(s)-Adressen sind erlaubt …“ (`net.ts:26-31`), der Feldername `url`, der
Betreiber-Schalter, die Schema-Prüfung. `packages/core/test/net.test.ts` pinnt das Verhalten
bereits an 15 Adressen (Zeile 19-76) — der Spike ist also gegen diese Tests zu messen.

**Was von `ipaddr.js` **nicht** ersetzt wird:** die DNS-Prüfung, das **Pinning**
(`net.ts:138-140`), die Weiterleitungsprüfung je Hop (`net.ts:242-263`) und der Größendeckel.
Das sind die eigentlichen Sicherheitsmechanismen; die Adressklassifikation ist nur ihre
Grundlage.

**Lizenz** MIT, 661 ★, Push am 27.09.2026, keine Releases (es wird direkt über npm versioniert —
`ipaddr.js` hat 2.x). **Risiko** gering. **Nutzen** mittel — es ist Aufräumarbeit, die Fehler
vermeidet, nicht ein Feature.

---

## 7 — `modelcontextprotocol/typescript-sdk` (MIT → Apache-2.0) — **Spike**

**Bedarf.** Senify nutzt `@modelcontextprotocol/sdk@^1.30.0`
(`packages/mcp/package.json`). Die letzte Version ist **v2.3.1** (5.10.2026). Ein Upgrade von v1
auf v2 ist in der MCP-Welt erfahrungsgemäß ein breaking change (Transport, Schema-Typen,
Registrierung).

**Was zu prüfen ist.** Ob der Server unter v2 unverändert läuft und ob die eigene
Werkzeugdefinition (`packages/mcp/src/tools.ts`, `outputSchema`, `structuredContent`) die
v2-Typen noch erfüllt. Der eigene Code hängt an den SDK-Typen
(`packages/mcp/src/server.ts:461-466`).

**Lizenzhinweis.** Die Umstellung von MIT auf Apache-2.0 ist angekündigt und im Lizenztext
nachzulesen. Da Senify nicht vertrieben wird, ist die Verpflichtung gering — der Punkt gehört
aber in die Akte.

**Aufwand** mittel. **Nutzen** mittel: eine alte SDK-Version ist ein Wartungsrisiko, sobald der
Server des Clients (Cursor, Claude, …) auf das neue Protokoll geht.

---

## 8 — `modelcontextprotocol/inspector` (MIT → Apache-2.0) — **Referenz**

**Bedarf.** 106 Werkzeuge, ein Manifest, ein Spiegel-Test. Der Spiegel-Test
(`packages/mcp/test/manifest-mirror.test.ts`) prüft Name, Scope, Titel, Beschreibung und
`writes` — aber **nicht**, ob ein Werkzeug sich im Aufruf richtig verhält.

Der Inspector ist ein visueller Client: er listet alle Werkzeuge, zeigt ihre Schemata und lässt
sie aufrufen. Er ist **keine Abhängigkeit**, sondern ein Werkzeug für die manuelle Prüfung eines
Werkzeugs nach einer Änderung an der Serverlogik.

**Lizenz** MIT → Apache-2.0, 11 102 ★, Push am 14.10.2026.

---

## 9 — `modelcontextprotocol/modelcontextprotocol` (MIT → Apache-2.0) — **Referenz**

**Bedarf.** Für das Drift-Tor aus Fachanalyse 4 (2.4) ist ein **externer** Maßstab nützlich: das
offizielle JSON-Schema des Werkzeug-Objekts. Ein Drift-Test, der zusätzlich prüft, dass jeder
Manifest-Eintrag dem offiziellen `Tool`-Schema entspricht, fängt eine ganze Klasse von Fehlern
ab, die ein hausinterner Test nicht sieht.

**Lizenz** MIT → Apache-2.0, 9482 ★, Push am 19.10.2026.

---

## 10 — `salsita/node-pg-migrate` (MIT) — **Referenz**

**Bedarf.** `packages/engine/src/db.ts:130` sagt es ausdrücklich:

> Additive like every other column here: v1 has no migration tooling, so …

und Zeile 427: „later, once a real Postgres migration path exists“. Das Schema wird über
`CREATE TABLE IF NOT EXISTS` und **additive** Spalten gebaut. Additive heißt: eine Spalte kann
hinzukommen, aber **nicht** umbenannt, umgetypt oder entfernt werden.

Das ist eine bewusste v1-Entscheidung, kein Versäumnis. Der Referenzwert liegt in der
Erkenntnis: **sobald** die erste destruktive Schemaänderung ansteht, gibt es kein Werkzeug dafür
und keinen Weg zurück. `node-pg-migrate` (MIT, 1490 ★, Push am 19.10.2026) oder `umzug`
(MIT, 2217 ★, v3.8.3) sind beide Kandidaten; `node-pg-migrate` ist der einfachere, weil es
SQL-Dateien schreibt, die man lesen kann, bevor man sie ausführt.

**Empfehlung.** Jetzt nicht einführen. In der Akte festhalten, **wann** es fällig ist: bei der
ersten Spalte, die umbenannt oder entfernt werden muss.

---

## 11 — `ai/size-limit` (MIT) — **Spike**

**Bedarf.** `packages/app/public/app.js` ist 7436 Zeilen; das Editor-Bundle und die
Renderer-Bundles kommen dazu. Der Fahrplan verschiebt die Frage ausdrücklich: „Kein
Minify/Tree-Shake/Sourcemaps in diesem Schritt. ESM-Aufteilung und Dateigrößen-Budgets gehören,
falls priorisiert, P3-2“ (P0-4). `size-limit` rechnet den **echten** Startaufwand (nicht die
gepackte Größe) und lässt einen Pull Request rot werden.

**Aufwand** gering: eine Konfiguration mit einem Budget je Bundle, ein Schritt im `verify`-Skript.

**Nutzen** mittel: macht eine verschobene Entscheidung messbar. **Risiko** gering — aber das Budget
muss gesetzt werden, sonst wird der Schritt zur Formalität.

---

## 12 — `graphile/worker` (MIT) und `timgit/pg-boss` (MIT) — **Referenz**

**Bedarf.** Senify hat **vier** eigene Job-Queues: Bake-Jobs, Image-Jobs, Import-Jobs,
Referenz-Jobs. Jede mit Lease, Backoff, Dedupe, Absturz-Erholung und einem eigenen Repository-Modul
(`store-bake-jobs.ts`, `store-image-jobs.ts`, `store-import-jobs.ts`, `store-references.ts`
Abschnitt). Das ist die meiste duplizierte Logik im Store.

**Warum trotzdem kein Austausch.** Beide Bibliotheken sind gut (`graphile/worker`: MIT, 2415 ★,
v0.18.0, Push 09.10.2026; `pg-boss`: MIT, 4071 ★, Push 17.10.2026). Aber: die Queues sind klein,
getestet und an die Transaktionsgrenzen des Stores gebunden (ein Job-Claim läuft in derselben
Transaktion wie sein Zustandswechsel). Ein Austausch wäre eine große, riskante Umstellung für
ein lokales Programm mit einer Handvoll Jobs.

**Der richtige Schritt ist der kleinere.** Erst die **vier** Queues in **ein** Repository
vereinen (in der Art von ADR-0019: ein Fachmodul, `Db` als einzige Abhängigkeit, `Store`
delegiert). Das ist mechanisch, im Fahrplan bereits angelegt (P3-2) und senkt den Pflegeaufwand
spürbar. **Danach** lohnt die Frage, ob eine fremde Queue etwas bietet, das die eigene nicht
hat — und die Antwort wird vermutlich „weniger Integration, nicht mehr Funktion“ sein.

---

## 13 — `pinojs/pino` (MIT) — **Referenz**

**Bedarf.** 48 `console.*`-Aufrufe im Produktivcode. **41 davon liegen in
`packages/mcp/src/cli.ts`** — dort ist die Konsole der gewollte Ausgabeweg (der CLI-Text gehört auf
das Terminal, nicht in ein Log). Die **sieben übrigen** sind Server-Protokolle, und die nennen
**keinen** Kontext: welche Site, welcher Job, welcher Request.
`console.error("[engine] bake worker failed", error)` (`bake-worker.ts:101`),
`console.error("[engine] image worker failed", error)` (`image-worker.ts:386`),
`console.error("[engine] unexpected error", error)` (`http-response.ts:221`). Alle drei nennen
**keinen** Kontext: welche Site, welcher Job, welcher Request. Das lokale `full.log` (ignoriert)
ist damit ein Fehlerhaufen ohne Bezug.

**Warum nur Referenz.** Für ein lokales Einzelplatz-Programm ist `console.error` eine
vertretbare Wahl. `pino` (MIT, 18 257 ★, v10.4.0) wäre die strukturierte Alternative — aber sie
kostet eine Abhängigkeit im Hauptprozess und verändert die Ausgabe, die der Betreiber heute liest.

**Die Überlegung wert, wenn:** der Bake-Befund (Fachanalyse 3, B1) hat gezeigt, wie schwer ein
Fehler ohne Kontext zu diagnostizieren ist.

---

## 14 — CSS-Werkzeuge: `csstree/csstree`, `postcss/postcss`, `csstools/postcss-plugins` — **weglassen**

**Der Befund, der dagegen spricht.** Senify hat eine **eigene** CSS-Grammatik:
`packages/widget-engine/src/css/value-grammar.ts` (rund 370 Zeilen) mit einem eigenen Parser,
Normalisierung und Validierung. Ihre Begründung steht in der Datei (Zeile 15-20):

> Step 3 matters as much as step 2: validating one string and emitting another is how bypasses
> survive. `parseCssValue` returns the normalized, validated text.

Das ist eine **bewusste** Entscheidung: das Projekt validiert und gibt **genau den geprüften
Text** aus. Ein zweiter CSS-Motor (csstree, PostCSS) wäre eine zweite Wahrheit über CSS — mit
zwei Validierungsregeln, zwei Fehlermeldungen und der Frage, wer wann welche anwendet.

**PostCSS** ist ein **Transformator** (Plugins, Source-Maps, AST-Plugin-API). Senify schreibt
CSS, es verarbeitet keine beliebigen CSS-Pipelines. **weglassen.**

**`csstools/postcss-plugins`** sind PostCSS-Plugins — derselbe Grund. **weglassen.**

**Wo csstree trotzdem eine Rolle hätte** — und warum ich es trotzdem ablehne: der Lexer könnte
das **freie Theme-CSS** des Betreibers prüfen, das heute ungeprüft in `assets/theme.css`
landet (`packages/renderer/src/bake.ts:669`). Der Nutzen ist gering: ungültiges Theme-CSS
ignoriert der Browser, und das Theme kommt vom Betreiber, nicht von einem Fremden. Ein
zusätzlicher CSS-Stack für diesen Randfall ist ein schlechter Handel.

**Sonderfall `sanitize-url`:** `braintree/sanitize-url` (MIT, 371 ★, Push 20.06.2026) wäre für
importierte Inhalte denkbar — aber `sanitize-html` ist bereits im Registry-Paket im Einsatz und
deckt HTML-Attribute ab. **weglassen.**

---

## 15 — Query-Builder: `kysely-org/kysely`, `drizzle-team/drizzle-orm`, `knex/knex` — **weglassen**

**Der Befund, der dagegen spricht.** Senify schreibt **rohes SQL** mit dem `pg`-Treiber über
4120 Zeilen Store plus 5220 Zeilen `http.ts`. ADR-0004 legt PostgreSQL als einzige Datenbank
fest. Ein Query-Builder würde die SQL-Form erhalten, aber typisiert — das ist ein Komfortgewinn,
kein Fehlerbehebung.

Die Argumente **dafür** (Kysely: 14 282 ★, MIT, v0.29.7, Push 19.10.2026; Drizzle: 36 092 ★,
Apache-2.0, 2166 offene Issues; Knex: 20 337 ★, MIT, Push 26.06.2026) sind echt: Typos werden
zu Compile-Zeitern, und die Schema-Definition existiert einmal.

**Warum trotzdem weglassen.** Der Preis ist eine Migration von über 9 000 Zeilen SQL in ein
Builder-Schema, mit dem Risiko, dass das Verhalten der Transaktionen und der Optimistischen Locks
sich ändert. Für ein lokales Programm ist das ein Maß, das den Nutzen übersteigt. **Wenn** der
Store-Zerlegung ein Ende hat und `http.ts` als Nächstes kommt, ist ein Builder eine ernsthafte
Option — als **eigener** Schritt mit eigenem Gate, nicht als Beiläufigkeit.

---

## 16 — HTTP-Mocking: `nock/nock`, `mswjs/msw` — **weglassen (für diesen Bedarf)**

**Der Bedarf.** Die Autosave-Tests brauchen einen **ablehnenden** Transport, um Befund A
(Fachanalyse 1) überhaupt prüfen zu können. Die Test-Harness in
`packages/editor/test/state/persist.test.ts:18-35` kann das heute nicht: `Scripted` liefert
`SaveResponse | undefined`, und `request` ist `async` und löst **immer** auf.

**Warum keine Bibliothek nötig ist.** Der Transport ist eine gewöhnliche Funktion. Ein ablehnender
Transport ist:

```ts
request: async () => { throw new Error("offline"); }
```

Das ist **eine Zeile** in der Harness. `nock` (MIT, 13 130 ★, v15.0.3) und `msw`
(MIT, 18 299 ★, v3.0.3) sind beide aktiv und gut — aber sie ersetzen die *Netzwerkebene*, während
hier die *Funktion* die Einheit ist. Beide würden die Test-Harness komplexer machen, nicht
einfacher.

**Wo sie doch passen würden:** für Tests der HTTP-Hilfe `api()` in `packages/app/public/app.js:72`,
die echte HTTP-Antworten des Dashboards simulieren müssen. Das ist heute nicht der Schmerzpunkt.
**weglassen für jetzt; merken, wenn die App-HTTP-Tests wachsen.**

---

## 17 — `immerjs/immer` (MIT) — **weglassen**

**Der Befund, der dagegen spricht.** Der Editor hat ein eigenes Zustandsmodell: Patch-basiert,
mit Undo/Redo über History-Einträge (`packages/editor/src/state/patches.ts`,
`operations.ts:1207`). `immer` wäre ein **zweites** Zustandsmodell im selben Paket — und die
Frage, welches der beiden gilt, wäre bei jeder Änderung neu zu beantworten.

Der Editor braucht Undo/Redo mit **Patches**, nicht mit Zustandskopien. `immer` löst ein Problem,
das dieser Editor nicht hat. **weglassen.**

---

## 18 — `nodejs/undici` (MIT) — **weglassen**

Node 24 bringt `fetch` mit, und Senify nutzt es durchgängig. `undici` liefert zusätzliche
Fähigkeiten (Pool-Verwaltung, Proxy-Unterstützung,Dispatcher), die hier nicht gebraucht werden.
**weglassen.**

---

## 19 — `renovatebot/renovate` (AGPL-3.0) — **weglassen**

Das Repo nennt Dependabot bereits als Weg, die gepinnten Aktionen zu aktualisieren
(`.github/workflows/verify.yml:38`: „Aktualisieren per Dependabot (`package-ecosystem:
github-actions`) oder von Hand“). Dependabot ist in GitHub eingebaut, ohne zusätzliche
Betriebsverantwortung. Renovate (22 800 ★, AGPL-3.0, Push 19.10.2026) wäre die mächtigere
Wahl — und für ein Projekt dieser Größe die überdimensionierte.

**Ausdrücklich nicht empfohlen wird hier ein Wechsel der Aktionen von SHA-Pinning auf Tags.**
Das SHA-Pinning (Kommentar `verify.yml:37-39`) ist eine gute Entscheidung.

---

## 20 — `stoplightio/spectral` (Apache-2.0) — **weglassen**

Spectral lintet OpenAPI-Dokumente. Senify hat **kein** OpenAPI-Dokument; es hat eine
Routenmatrix (`packages/engine/src/route-matrix.ts`) und ein Manifest. Es gibt nichts zu linten.

**Bedingt sinnvoll**, falls das Projekt sich entscheidet, eine maschinenlesbare API-Beschreibung
zu veröffentlichen: dann wäre Spectral das Werkzeug, um sie konsistent zu halten — und
gleichzeitig der Anlass, sie zu erzeugen. **Der Anlass ist die interessantere Frage**: Soll Senify
ein OpenAPI-Dokument haben? Ein MCP-Server mit 106 Werkzeugen und 90 Routen hat eine
API-Oberfläche, die ein Agent liest. Eine offene Spezifikation wäre für Dritte nützlich — und
Spectral wäre dann das Werkzeug, das sie in Form hält.

---

## Zusammenfassung: was zuerst

| Reihenfolge | Maßnahme | Aufwand | Nutzen | Belegt durch |
|---|---|---|---|---|
| 1 | eine Eigenschaft „jede Engine-Operation erzeugt eine Pending-Liste“ (`fast-check`) | gering | **hoch** — findet Befund D künftig automatisch | Fachanalyse 1 |
| 2 | Drift-Tor für das Manifest (ohne fremdes Werkzeug) | gering | hoch | Fachanalyse 4 |
| 3 | `dependency-cruiser` mit den Regeln aus ADR-0019 und P3-3 | gering | hoch | Fachanalyse 4 |
| 4 | `gitleaks` im CI | gering | mittel | Fachanalyse 5 |
| 5 | `osv-scanner` (oder `pnpm audit`) im CI | gering | mittel | Fachanalyse 5 |
| 6 | Coverage-Liste auf die Fachmodule ausdehnen | gering | hoch | Fachanalyse 5 |
| 7 | lokales Temp auf dem Repo-Laufwerk (Skript) | gering | hoch (Entwicklungsfluss) | Fachanalyse 3 |
| 8 | `pglite`-Spike gegen `transactions.test.ts` | mittel | mittel | Fachanalyse 5 |
| 9 | `ipaddr.js`-Spike gegen `net.test.ts` | gering | mittel | Fachanalyse 2 |
| 10 | `spawnSync` → `spawn` im Bake | gering | **hoch** (Betrieb) | Fachanalyse 3 |

Die ersten sieben Punkte brauchen **keine** neue Abhängigkeit. Das ist kein Zufall: Die Befunde
dieser Untersuchung sind zum größten Teil **Lücken in Prüfungen**, nicht in Funktionen. Die
Werkzeuge, die eine Lücke schließen, sind meist billiger als die Lücke.

---

## Umsetzung (20.10.2026) — die vier Empfehlungen und die drei Spikes

| Kandidat | Urteil jetzt | Was |
|---|---|---|
| `dependency-cruiser` | **übernommen** | `.dependency-cruiser.js` mit sieben Regeln, `pnpm deps:check` in `pnpm verify` und in der CI. Gegenprobe: ein temporärer Zyklus über Paketgrenzen wurde gemeldet |
| `fast-check` | **nicht übernommen** | Die Eigenschaft, die den Befund D gefunden hätte, ist als Wörterbuch-Test implementiert: alle 19 Operationen des Engine-Vokabulars fahren durch den Store und die Pipeline (`packages/editor/test/state/persist-vocabulary.test.ts`). Das Vokabular ist eine geschlossene Liste — eine erschöpfende Prüfung ist stärker als ein Zufallsgenerator, und die Abhängigkeit hätte keinen Fall gefunden, den die erschöpfende Prüfung nicht findet. Die zweite Eigenschaft (Patch → Mutation → Patch) prüft dieselben 19 Operationen |
| `gitleaks` | **übernommen** | Eigener CI-Job, Version 8.30.1 gepinnt, Prüfsumme verglichen, Scan über die volle Historie. Verifiziert: der Historien-Scan meldet keinen Fund (`no leaks found`), mit und ohne die Ausnahmen. Die Ausnahmen in `.gitleaks.toml` tragen je einen Grund und unterscheiden drei Sorten: die absichtlichen Beispielschlüssel in **getrackten** Dateien (zwei Idempotency-Keys im Redesign-Test, der SMTP-Testschlüssel — Gegenprobe: ohne diese Ausnahme meldet der Historien-Scan 3 Funde), das lokale Arbeitsmaterial, das nie committet wird (`.scratch/refs/nick/`, `.tmp/`, `.bake-tmp/`, `graphify-out/`, `packages/renderer/.bake/`; steht in der `.gitignore`) und zwei Fehlalarme der generischen Regel in getrackten Notizen (Prosa und ein Bezeichner, kein Schlüssel). Auch der Arbeitsbaum-Scan meldet mit dieser Liste nichts |
| `osv-scanner` | **übernommen** | Eigener CI-Job: Binary aus dem Release mit fester Version, Prüfsumme aus `osv-scanner_SHA256SUMS` verglichen. Der Weg über den revidierbaren Fremd-Workflow von Google ist nicht gangbar (der Lauf fiel in einen `startup_failure`; Gegenprobe: ohne den Job startet er). Erste Messung: 16 Funde, davon 12 geschlossen (Overrides für `devalue`, `sharp`, `smol-toml`, `source-map-js`, `hono`; SDK auf 1.32.1). Im Stand des Branches meldet der Scan ohne Ausnahmeliste 5 Funde in 3 Paketen (`vitest`/`@vitest/mocker` 3.2.7, `tinypool` 1.1.1, `http-cache-semantics` 4.2.0) — die vier Advisory-IDs dazu sind bis 30.11.2026 ausgenommen, mit der Ausnahmeliste meldet er `No issues found` |
| `pglite` | **übernommen** | Der Spike war positiv (Schema legt an, Transaktion rollt echt zurück). `createTransactionDatabase()` in `packages/engine/test/helpers.ts`; die 16 zuvor übersprungenen Transaktionsfälle laufen im normalen Testlauf |
| `ipaddr.js` | **weggelassen** | Gegenprobe über 42 Adressen: 4 Unterschiede, zwei davon zu locker (Benchmarking-Range 198.18/15, veraltetes Site-Local `fec0::1` — die Bibliothek kennt sie nicht), einer zu strenger (6to4). Die Policy bleibt handgeschrieben; die harten Teile (DNS, Pinning, Redirects, Byte-Grenze) blieben ohnehin |
| MCP-SDK v1 → v2 | **v1 bleibt** | Auf npm ist v2 **nicht** veröffentlicht (latest: 1.32.1, MIT, 05.10.2026). v2 existiert nur im Git-Repository (`v2.3.1`) — eine Produktivabhängigkeit darauf wäre eine Git- oder Prerelease-Referenz. Die genutzte API ist klein, ein späterer Wechsel ist eingegrenzt |
| `pg-boss` / `graphile/worker` | **Referenz, bleibt Referenz** | Der Analyse-Text nennt als ersten Schritt „erst die vier Queues vereinheitlichen, dann über eine fremde Queue entscheiden“. Der Blick auf den Code zeigt: nur zwei der vier Queues haben eine Lease (Bake, Bild), Import- und Referenz-Jobs laufen über `listDue`; die Fehlersemantik ist verschieden (Backoff-Zähler gegen sofortiges `failed`). Eine gemeinsame Repository-Klasse bräuchte fünf bis sechs Stellschrauben und würde das SQL aus Strings bauen. Da dieselbe Analyse zum Ergebnis kommt, dass eine fremde Queue weniger Integration und nicht mehr Funktion bringt, entfällt der Grund für den Merge. **Befund dokumentiert, nicht umgesetzt.** |