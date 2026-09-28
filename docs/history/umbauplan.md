# Senify-Umbauplan

> ## ⚠️ ABGELÖST — HISTORISCHER PLANUNGSSTAND
>
> **Dieses Dokument ist nicht mehr die verbindliche Planung.** Es beschreibt den Planungsstand vom 24.09.2026 und wird nicht mehr fortgeschrieben.
>
> **Verbindlich ist jetzt [`docs/fahrplan.md`](fahrplan.md):** priorisierte Reihenfolge, Gates, Definition of Ready/Done und das Risiko-Register `R1`–`R13`.
>
> **Achtung bei Ist-Aussagen:** Mehrere Behauptungen in §3 sind am Code überholt. Belegt wurde bei der Überarbeitung am 25.09.2026:
> - §3.1 „alle drei Token-Routen sind `public: true`" — **falsch**: alle drei sind `operatorOnly: true` (`http.ts:1202`, `auth.test.ts`).
> - §3.1 „Proxy ohne Origin-Prüfung" — **überholt**: `trustedProxyRequest()` prüft `sec-fetch-site` und `Origin`/`Host` (`server.ts:97-108`, Test `server.test.ts:108`).
> - §3.3 „keine sichtbare Compare-and-Swap-Version" in der Style-Registry — **überholt**: `style_rules_version` + `FOR UPDATE` + `baseVersion` → 409 (`store.ts:2624-2657`, `style-rules.test.ts:87`).
> - §3.5 „Lint deckt `packages` und `scripts` ab" als Ziel — offen.
> - §2.3 Idempotency-Transaktionssicherheit — **weiterhin offen**, jetzt als Risiko `R6` in `docs/fahrplan.md` geführt.
>
> Für Ist-Aussagen gilt `docs/current/stand.md`, für Messzahlen `docs/current/qualitaet.md`. Der Text unten bleibt unverändert als Nachweis des damaligen Planungsstands erhalten.
>
> **Was aus diesem Plan weiterlebt:** Die Phasen 0–9 sind im Fahrplan unter anderem Namen enthalten (P0-3 Idempotency, P1-1 Postgres-Lane, P1-2 Coverage, P3-1 Legacy-Editor, P3-3 MCP-Schemas, P3-4 Manifest, P3-5 Import-Transaktion), bereits erledigt oder als P3-Block eingestuft. Die Randkapitel §15 (Referenz-Repositories) und §18 (Risiken) bleiben als Materialsammlung nützlich.

---

> **Ursprünglicher Kopf (Stand 24.09.2026):** Dokumenttyp: Plan und Roadmap. Dieses Dokument beschreibt keine aktuelle Messung und keinen vollständigen Ist-Stand. Aktueller Stand: `docs/current/stand.md`. Architektur: `docs/current/architektur.md`. Qualitäts- und Gate-Stand: `docs/current/qualitaet.md`.

**Stand:** 24.09.2026  
**Arbeitsgrundlage:** aktueller Arbeitsbaum auf `master`, Commit `6973cb1`, einschließlich umfangreicher uncommitteter Änderungen  
**Zweck:** Senify konsistent, sicher, reproduzierbar und als zusammenhängendes Website-Produkt weiterbauen  
**Status:** Planungsdokument. Dieses Dokument beschreibt die Zielarchitektur und die Reihenfolge der Maßnahmen. Es ist keine Aussage, dass alle Maßnahmen bereits umgesetzt sind.

---

## 1. Kurzfassung

Senify besitzt bereits eine starke Grundlage:

- `Site → Page → NodeTree` als gemeinsames fachliches Modell.
- Ein gemeinsamer Mutationsvertrag für Menschen und Agenten.
- Optimistic Locking für Page-Drafts.
- Audit-Log, Undo und Draft/Revision/Release.
- Canvas- und Bake-Parität.
- Lokale PostgreSQL- und Asset-Speicherung.
- MCP-Fassade, Referenzpipeline und Deploy-Adapter.
- Breite Testabdeckung über Engine, Editor, Renderer, MCP und Browser.

Die größten Risiken liegen an den Übergängen:

```text
Browser → Dashboard-Proxy → Engine → PostgreSQL
Agent → MCP → Engine → NodeTree
Import → IR → EditorDocument → NodeTree → Release
CMS-Änderung → Bake-Job → aktiver Release → Besucher
```

Die größten aktuellen Lücken sind:

1. lokale Browser-Anfragen werden zu großzügig mit dem Operator-Token vertraut.
2. Import, Style-Registry, Idempotency und Release haben nicht überall dieselbe Transaktions- und Wiederherstellungssemantik.
3. EditorDocument und NodeTree bilden weiterhin zwei mehrere Entwicklungspfade.
4. `?view=editor` hält einen Legacy-Editor neben dem Canvas-Editor am Leben.
5. Der menschliche First-Run endet nicht zuverlässig bei einer bearbeitbaren Startseite.
6. Review, Publish, Release und Rollback sind technisch vorhanden, aber nicht als klarer Produktfluss sichtbar.
7. Build, echte PostgreSQL-Tests, Coverage und Accessibility sind noch nicht vollständige Release-Gates.
8. Historische Analysedokumente und aktueller Code sind nicht sauber getrennt.

**Leitentscheidung des Umbaus:**

> Der Editor, MCP und die menschliche Oberfläche müssen auf eine gemeinsame fachliche Wahrheit schreiben. Jede Änderung muss entweder vollständig committed, vollständig verworfen oder ausdrücklich als recoverbar markiert sein.

---

## 2. Zielbild

### 2.1 Fachliche Datenflüsse

Ziel:

```text
Site
 ├─ Theme
 ├─ Style Registry
 ├─ Collections und Entries
 ├─ Assets
 ├─ References
 ├─ Pages
 │   └─ Draft
 │       └─ NodeTree
 └─ Releases
     ├─ Page Revisions
     ├─ Theme Snapshot
     ├─ Style Snapshot
     ├─ Content Snapshot
     ├─ Asset Snapshot
     └─ Build Artifact
```

Ein Schreibvorgang folgt immer diesem Muster:

```text
Input prüfen
→ Berechtigung prüfen
→ aktuellen Stand prüfen
→ Mutation anwenden
→ Draft und Audit atomar schreiben
→ Version und Optimistic-Lock-Fence aktualisieren
→ Event veröffentlichen
→ Antwort zurückgeben
```

### 2.2 Ein kanonisches Editor-Modell

Ziel:

- `EditorDocument` ist die interne Editor-Wahrheit.
- `NodeTree` ist das definierte Austauschformat zwischen Engine, Persist und Bake.
- `editor-bridge` ist ein begrenzter Adapter, kein zweiter fachlicher Schreibpfad.
- Jede Konvertierung besitzt Roundtrip-Tests für alle unterstützten Felder.

Zielpfade:

```text
packages/section-sdk/src/types.ts
packages/editor/src/state/document.ts
packages/editor/src/state/migration.ts
packages/editor/src/state/store.ts
packages/editor/src/state/persist.ts
packages/engine/src/mutations/editor-bridge.ts
```

### 2.3 Ein sicherer lokaler Betrieb

Ziel:

- Die Engine bleibt an Loopback gebunden.
- Der Dashboard-Proxy injiziert den Operator-Token nur für gültige lokale Browser-Herkunft.
- Mutierende Requests benötigen eine gültige Origin-/Host-Prüfung.
- Token-Bootstrap und Token-Verwaltung sind getrennt.
- Jeder Proxy-Request hat ein Upstream-Timeout.
- Öffentliche Form-, Asset- und Preview-Routen behalten nur ihre beabsichtigten Autorisierungsmechanismen.

### 2.4 Ein nachvollziehbarer Release-Contract

Ziel:

```text
Drafts
→ Preview
→ Review
→ Pre-Release-Checks
→ Release Snapshot
→ Bake Artifact
→ atomare Aktivierung
→ Deploy
```

Ein Release ist fachlich unveränderlich. Ein Re-Bake erzeugt ein neues Build-Artefakt oder einen neuen Release-Snapshot. Ein bestehendes Release wird nicht nachträglich still verändert.

### 2.5 Ein sichtbarer menschlicher Produktfluss

Der Primärnutzer muss ohne MCP und ohne API diesen Weg gehen können:

```text
Site anlegen
→ Startseite automatisch anlegen
→ Section einfügen
→ Text und Styles bearbeiten
→ Review öffnen
→ bewusst veröffentlichen
→ Release ansehen
→ bei Bedarf zurückrollen
```

---

## 3. Ausgangslage und belegte Risiken

### 3.1 Sicherheit

**Proxy:**

- `packages/app/src/server.ts:97-140`
- Operator-Token wird in `packages/app/src/server.ts:109-111` automatisch gesetzt.
- API-Proxying erfolgt in `packages/app/src/server.ts:227-235`.

**Öffentliche Token-Routen:**

- `packages/engine/src/http.ts:1725-1773`
- `POST /api/tokens`
- `GET /api/tokens`
- `DELETE /api/tokens/:tokenId`
- alle drei Routen sind aktuell `public: true`.

**Origin-Helfer:**

- `packages/engine/src/http.ts:789-800`
- wird aktuell nur im Formularpfad verwendet, nicht als allgemeiner Schreibschutz.

### 3.2 Import und Jobs

**Import-Schreibpfad:**

- `packages/engine/src/imports.ts:150-210`
- Page-Erzeugung, Draft, Style-Regeln und Theme werden getrennt geschrieben.

**Importroute:**

- `packages/engine/src/http.ts:4446-4539`
- Job wird erstellt und anschließend synchron ausgeführt.
- `GET /api/sites/:siteId/imports` in `packages/engine/src/http.ts:4542-4556` verwendet `listDueImportJobs()` ohne Site-Filter.
- Eine passende Methode existiert bereits in `packages/engine/src/store.ts:5491-5499`.

**Browser-Capture:**

- `packages/framer-import/src/capture-browser.ts:59-72` enthält die Browser-Capture-Fähigkeit.
- `packages/framer-import/src/import.ts:49-59` verwendet für URLs `fetch()` und statisches HTML-Capture.
- `runImport()` verwendet `captureBrowser()` nicht.

### 3.3 Style Registry und Idempotency

**Style Registry:**

- `packages/engine/src/store.ts:1933-1972`
- wird als komplettes Array gelesen und mit einem einfachen `UPDATE` geschrieben.
- Es gibt dort keine sichtbare Compare-and-Swap-Version.

**Idempotency:**

- `packages/engine/src/http.ts:429-499`
- Schreiboperation und `completeIdempotencyKey()` sind getrennt.
- bei einem Completion-Fehler wird der Key in `packages/engine/src/http.ts:492-497` gelöscht.

### 3.4 Editor

**Editorpfade:**

- Canvas-Default und Legacy-Deep-Link: `packages/app/public/app.js:5093-5098`.
- Canvas-Mount: `packages/app/public/app.js:5100-5580`.
- Legacy-Pfad: `packages/app/public/app.js:6077` ff.
- EditorBundle enthält weiterhin `mountEditor`.
- Zwei Datenmodelle: `packages/section-sdk/src/types.ts` und `packages/editor/src/state/document.ts`.

**Theme:**

- `/theme.css` in `packages/app/src/server.ts:163-173` wird aus `defaultTheme()` erzeugt.
- Inspector-Initialisierung in `packages/app/public/app.js:5469-5473` verwendet `editor.defaultTheme()`.
- Das Site-Theme wird dort nicht geladen.

**First-Run:**

- Site-Erstellung: `packages/app/public/app.js:284-290`.
- Seiten-Empty-State: `packages/app/public/app.js:3858-3862`.
- `createSite()` in `packages/engine/src/store.ts:1234-1287` legt keine Startseite an.

### 3.5 Build, Test und CI

**Root-Skripte:**

- `package.json:14-20`
- `build` und `typecheck` sind beide `tsc -p tsconfig.json`.
- `verify` besteht aus Typecheck, Lint und Tests.
- `tsconfig.json:19` setzt `noEmit: true`.

**CI:**

- `.github/workflows/verify.yml:23-29`
- Chromium wird installiert.
- `pnpm verify` läuft.
- `pnpm verify:parity` läuft.
- Ein PostgreSQL-Service ist nicht konfiguriert.

**Teststatus des Arbeitsstands:**

- TypeScript-Prüfung: erfolgreich.
- `git diff --check`: erfolgreich.
- Vollständiger Lint-Lauf: rot.
- bekannte unbenutzte Variablen wurden in `packages/framer-import/src/library.ts:40` und `packages/framer-import/src/assets.ts:190` gemeldet.
- ein Canvas-Browsertest schlug im parallelen Gesamtlauf fehl, bestand aber isoliert.
- echte PostgreSQL-Tests wurden ohne `TEST_DATABASE_URL` übersprungen.

### 3.6 Produkt- und Accessibility-Lücken

**Workspaces:**

- `packages/app/public/app.js:3805-3813` enthält Seiten, Artikel, Vorlagen, Einsendungen, Prüfen, Aktivität und Einstellungen.
- Medien, Releases, Aufträge, Domains, Theme-Verwaltung und MCP-Status fehlen dort.

**Toasts:**

- `packages/app/public/app.js:75-79`
- globale Shell-Toasts besitzen keine erkennbare Live-Region.

**Veröffentlichte Seite:**

- `packages/renderer/astro-template/src/layouts/Page.astro:126-138`
- kein sichtbares `<main>` und kein Skip-Link.
- `packages/registry/src/components/Media.tsx:24-32`
- Video ohne Caption-Track.

**Designsystem:**

- `packages/app/public/ui.css:17-27` beschreibt mehrere parallele Farbsysteme.
- `packages/app/public/app.css:14-22` nutzt weiterhin ältere Rollen.
- `packages/editor/src/canvas/styles.ts:40-44` nutzt die Editor-Tokenquelle.

---

## 4. Grundregeln für den Umbau

### 4.1 Keine zweite Wahrheit

Jede fachliche Information hat genau eine verantwortliche Quelle:

- Draft: Page-Draft.
- Theme: Theme-Datensatz.
- Style Rules: Style Registry.
- Editor-Zustand: `EditorStore`.
- Server-Version: `draftVersion`.
- Freigabe: Release.
- Audit: Audit-Log.
- Build: Build-Artefakt.
- öffentliche Ausgabe: Renderer-Ausgabe.

Eine neue Tabelle oder ein neues Feld darf nicht parallel zu einem alten Feld ohne klaren Migrationspfad eingeführt werden.

### 4.2 Atomar oder sichtbar recoverbar

Jeder Schreibvorgang muss eine der folgenden Eigenschaften besitzen:

1. Er wird vollständig in einer Transaktion committed.
2. Er wird vollständig verworfen.
3. Sein Ergebnis wird als `recoverable` markiert und kann sicher fortgesetzt werden.
4. Er wird ausdrücklich als Dry Run ausgeführt und verändert keine produktiven Daten.

Ein HTTP-Fehler darf nicht so behandelt werden, als sei die fachliche Änderung niemals passiert.

### 4.3 Ein Test prüft die Interface

Tests sollen bevorzugt über die öffentliche Module-Interface testen:

- HTTP-Vertrag,
- Engine-Interface,
- Editor-Session,
- MCP-Tool,
- Release-Flow.

Tests, die private Implementierungsdetails prüfen, gehören nur ergänzend hinein.

### 4.4 Änderungen mit Architecture-Gates absichern

Nach dem Umbau werden folgende Regeln automatisiert geprüft:

- keine verbotenen Package-Zyklen,
- keine unversionierten Produktionsmigrationen,
- kein Legacy-Editor im Standardbundle,
- kein ungeprüfter Zugriff auf Fremd-Origin-Schreibrouten,
- keine veralteten Design-Tokens in Produktions-UI,
- keine Release-Datei außerhalb des Release-Manifests,
- keine importierten Felder ohne Roundtrip-Test.

### 4.5 One primary action per view

Jede Ansicht erhält höchstens eine deutlich hervorgehobene Primäraktion.

Beispiele:

- Seiten: `Neue Seite`.
- Editor: `Speichern` oder `Veröffentlichen`, nicht beide gleichzeitig gleich stark.
- Review: `Freigeben` oder `Änderungen anfordern`.
- Release: `Rollback`.
- Import: `Dry Run prüfen`, danach `Import schreiben`.

---

# 5. Phase 0: Arbeitsstand und Gate wieder belastbar machen

**Priorität:** P0  
**Ziel:** Bevor Architekturänderungen beginnen, muss der aktuelle Arbeitsstand reproduzierbar bewertbar sein.

## 0.1 Uncommittete Änderungen inventarisieren

**Zieldateien:**

- keine neue Fachdatei nötig.
- bestehende `.scratch`-Tickets und `HANDOFF.md` als Quelle verwenden.

**Maßnahmen:**

1. `git status --short` in einen aktuellen Snapshot übernehmen.
2. Geänderte Dateien in fachliche Gruppen sortieren:
   - Engine
   - Editor
   - App
   - MCP
   - Renderer
   - Import
   - Dokumentation
   - Tests
3. Untracked Dateien einzeln klassifizieren:
   - produktiver Code,
   - Test,
   - Dokumentation,
   - lokales Artefakt.
4. Jede fachliche Änderung einem Ticket oder einer Measure-Zahl zuordnen.
5. Diff in fachliche Pakete teilen, bevor große Refactors beginnen.

**Fertig, wenn:**

- jede nicht ignorierte Änderung einem Bereich zugeordnet ist,
- kein untracked Scratch-Screenshot versehentlich als Produktdatei behandelt wird,
- der Ausgangszustand in einer kurzen Statusnotiz dokumentiert ist.

## 0.2 Lint reparieren

**Zieldateien:**

- `packages/framer-import/src/library.ts:40`
- `packages/framer-import/src/assets.ts:190`
- `eslint.config.mjs`

**Maßnahmen:**

1. unbenutzte Parameter und Variablen entfernen oder mit fachlichem `_`-Prefix versehen, wenn sie absichtlich nur Teil der Signatur sind.
2. `pnpm lint` erweitern auf `eslint packages scripts`.
3. `scripts/` vollständig einbeziehen.
4. `git diff --check` als eigenes Script aufnehmen.
5. Root-Script `verify` nach erfolgreicher Reparatur erneut ausführen.

**Akzeptanzkriterium:**

```text
pnpm lint → exit 0
git diff --check → exit 0
```

## 0.3 Testlauf stabilisieren

**Zieldateien:**

- `vitest.config.ts`
- `packages/app/test/canvas-browser.test.ts`
- `packages/app/test/support.ts`
- Browser-Test-Ausgabeinfrastruktur

**Maßnahmen:**

1. den fehlgeschlagenen Canvas-Test unter Parallelbedingungen reproduzieren.
2. Testfehler mit konkreter Stelle und Umgebungszustand dokumentieren.
3. Browser-Tests in eine eigene Testgruppe verschieben, falls die Parallelität die Ursache ist.
4. eindeutige Output-Verzeichnisse vergeben.
5. keine Screenshots oder Bake-Verzeichnisse zwischen parallelen Tests teilen.
6. Zeitlimits an tatsächliche Browser-Laufzeit anpassen, ohne Assertions zu entfernen.

**Akzeptanzkriterium:**

- Canvas-Test besteht isoliert.
- Canvas-Test besteht im vollständigen Lauf mindestens fünfmal ohne zufällige Fehler.
- `pnpm test` liefert einen stabilen Exitcode.

## 0.4 Echte PostgreSQL-Lane vorbereiten

**Zieldateien:**

- `.github/workflows/verify.yml`
- `packages/engine/test/transactions.test.ts`
- `packages/engine/test/helpers.ts`
- `docker-compose.yml`

**Maßnahmen:**

1. PostgreSQL-Service für CI definieren.
2. `TEST_DATABASE_URL` explizit setzen.
3. Schema vor dem Test vorbereiten.
4. Testdatenbank nach dem Test zerstören.
5. `pg-mem` weiterhin für schnelle Unit-Tests behalten.
6. PostgreSQL-Tests als Integration Gate neben dem schnellen Lauf ausführen.

**Akzeptanzkriterium:**

- CI zeigt einen separaten grünen PostgreSQL-Schritt.
- Transaktionstest mit Audit-Fehler läuft nicht mehr im Skip-Modus.
- Transaktionstest ohne echte Datenbank läuft nur als expliziter lokaler Zusatzlauf.

---

# 6. Phase 1: Localhost-Trust-Boundary

**Priorität:** P0  
**Ziel:** Eine fremde Webseite kann keine mutierenden lokalen Aktionen auslösen.

## 1.1 Herkunft und Host im App-Proxy prüfen

**Zieldateien:**

- `packages/app/src/server.ts`
- `packages/app/test/server.test.ts`

**Neue interne Regeln:**

```text
Erlaubte Browserherkunft:
- http://127.0.0.1:<dashboard-port>
- http://localhost:<dashboard-port>, falls das der konfigurierte Host ist

Abzulehnen:
- Origin einer fremden Website
- fehlender Origin bei mutierenden Browser-Requests, sofern kein nicht-browser CLI-Client beteiligt ist
- Host, der nicht zum lokalen Dashboard gehört
- Sec-Fetch-Site=cross-site für mutierende API-Aufrufe
```

**Maßnahmen:**

1. Proxy-Anfrage vor dem Einsetzen des Tokens prüfen.
2. `Origin`, `Referer` und `Sec-Fetch-Site` zentral auswerten.
3. `Host` gegen den tatsächlich konfigurierten Dashboard-Port prüfen.
4. Für GET-Anfragen großzügig bleiben, für POST/PUT/PATCH/DELETE strikt prüfen.
5. Fehlerantwort mit verständlicher Kategorie liefern.
6. Tests für erlaubte und abgelehnte Herkunft ergänzen.

**Akzeptanzkriterium:**

- lokaler Dashboard-Test `POST /api/sites` bleibt erfolgreich.
- Request mit fremdem Origin erhält 403.
- Request mit `Sec-Fetch-Site: cross-site` erhält 403.
- ohne gültige Herkunft wird kein Operator-Token injiziert.

## 1.2 Engine-Schreibrouten zusätzlich schützen

**Zieldateien:**

- `packages/engine/src/http.ts`
- `packages/engine/test/...`

**Maßnahmen:**

1. einen zentralen Dispatcher-Hook für mutierende Browser-Requests ergänzen.
2. Formular-Sonderregeln und Admin-Regeln nicht duplizieren.
3. öffentliche Form-Submit-Route ausnehmen, aber weiterhin mit Origin-, Rate- und Token-Regeln schützen.
4. Preview-/Asset-Dateirouten getrennt behandeln.
5. Fehlerkategorien standardisieren.

**Akzeptanzkriterium:**

- Engine nimmt mutierende Requests nur mit gültigem Bearer-Token und gültigem Context an.
- Form-Submit bleibt öffentlich, besitzt aber eigene Sicherheitsregeln.
- kein Public-Route-Default überschreibt versehentlich Authentifizierung.

## 1.3 Token-Bootstrap trennen

**Zieldateien:**

- `packages/engine/src/http.ts`
- `packages/app/src/start.ts`
- `packages/mcp/src/cli.ts`
- `packages/engine/test/...`

**Ziel:**

```text
CLI/Programmstart → interner Bootstrap → erster Operator-Token
Danach → authentifizierte Token-Verwaltung
```

**Empfohlene Lösung:**

- interne Bootstrap-Route nur über lokalen Prozesskanal,
- alternativ einmalige Bootstrap-Nonce in einer Datei mit restriktiven Rechten,
- kein dauerhaft öffentliches `POST /api/tokens`.

**Maßnahmen:**

1. Token-Erstellung aus dem normalen HTTP-Routenmodell herauslösen.
2. `GET /api/tokens` absichern.
3. `DELETE /api/tokens/:tokenId` absichern.
4. Token-Erstellung mit Audit versehen.
5. Token-Bootstrapfehler in `senify doctor` sichtbar machen.
6. CLI-Setup ohne Browser aufrufen können.

**Akzeptanzkriterium:**

- `POST /api/tokens` ohne Bootstrap-Kontext ist nicht mehr öffentlich erreichbar.
- ein gültiger Operator kann Tokens listen und widerrufen.
- ein revoke eines unbekannten Tokens bleibt 404/401 nach bestehender Policy.

## 1.4 Proxy-Timeouts und Abbruch

**Zieldateien:**

- `packages/app/src/server.ts`
- `packages/app/test/server.test.ts`

**Maßnahmen:**

1. `AbortController` für Upstream-Requests.
2. `requestTimeout` und `headersTimeout` setzen.
3. Upstream-Timeout als 504 mit Kategorie `timeout`.
4. bei geschlossenem Client keine weiteren Proxy-Schreibversuche starten.
5. SSE-Verbindungen nicht mit normalen Request-Timeouts zerstören.

**Akzeptanzkriterium:**

- ein hängender Engine-Request blockiert den Dashboard-Prozess nicht dauerhaft.
- SSE bleibt während normaler API-Requests geöffnet.
- Proxy-Test prüft 504-Verhalten.

---

# 7. Phase 2: Datenintegrität und Wiederherstellbarkeit

**Priorität:** P0  
**Ziel:** Jeder Schreibpfad ist transaktional oder eindeutig recoverbar.

## 2.1 Import als fachliche Transaktion oder Saga

**Zieldateien:**

- `packages/engine/src/imports.ts`
- `packages/engine/src/store.ts`
- `packages/engine/src/http.ts`
- `packages/engine/test/imports.test.ts`

**Schritt 1: Fachliche Grenze definieren**

```text
ImportInput
→ Capture
→ Normalize
→ Map
→ FidelityReport
→ ImportPlan
→ CommitImportPlan
```

**Schritt 2: CommitImportPlan bauen**

Eine Methode soll:

1. Zielsite prüfen.
2. Zielpage prüfen oder anlegen.
3. Style Rules validieren.
4. Theme-Patch validieren.
5. Audit-Eintrag vorbereiten.
6. alle Daten in einer Transaktion schreiben.
7. ImportJob auf `succeeded` setzen.
8. Report speichern.

**Schritt 3: Fehlerstatus modellieren**

Neue Statuswerte:

```text
queued
running
succeeded
failed
partially_applied
recoverable
cancelled
```

`partially_applied` darf nur existieren, wenn ein expliziter Resume- oder Compensation-Pfad vorhanden ist.

**Akzeptanzkriterien:**

- Fehler beim Style-Write führt zu keiner halb geschriebenen Page.
- Fehler beim Theme-Patch führt zu keinem importierten Draft.
- Dry Run verändert keine Daten.
- Fehler im Report nach erfolgreichem Commit ist als recoverbar sichtbar.
- ein Integrationstest simuliert jeden Commit-Schritt.

## 2.2 Style Registry mit Optimistic Locking

**Zieldateien:**

- `packages/engine/src/db.ts`
- `packages/engine/src/store.ts`
- `packages/engine/src/http.ts`
- `packages/engine/test/style-rules.test.ts`

**Empfehlung:**

- `style_registry_version` in `sites` ergänzen,
- jede Antwort enthält `styleRegistryVersion`,
- Schreibpfade verwenden:
  - `UPDATE sites SET style_rules_json = ..., style_registry_version = style_registry_version + 1 WHERE id = $1 AND style_registry_version = $2`,
- Konflikt liefert `409` mit aktueller Version.

**Alternativ:**

Style Rules in eigene Tabelle mit atomaren Einzeloperationen überführen, wenn das Registry-Modell häufiger wächst.

**Akzeptanzkriterien:**

- zwei konkurrierende Style-Schreibvorgänge überschreiben sich nicht,
- Konflikt ist deterministisch,
- Audit enthält die verwendete Version,
- bestehende Style-Tests bleiben grün.

## 2.3 Idempotency transaktional absichern

**Zieldateien:**

- `packages/engine/src/http.ts`
- `packages/engine/src/store.ts`
- `packages/engine/src/db.ts`
- `packages/engine/test/...`

**Empfohlene Struktur:**

```text
IdempotencyClaim
→ Fachtransaktion
→ Response + completedAt in derselben Transaktion
```

**Maßnahmen:**

1. `completeIdempotencyKey()` nicht blind bei jedem Fehler freigeben.
2. Zustand `committed-response-unknown` oder äquivalente Recovery erlauben.
3. Key-Fingerprint weiterhin binden.
4. Keys nach erfolgreichem Commit länger aufbewahren als In-Progress-Keys.
5. Cleanup separat und sicher planen.
6. Test für Completion-Fehler nach erfolgreichem Write ergänzen.

**Akzeptanzkriterium:**

- ein Retry nach unsicherem Completion erzeugt kein zweites Entity,
- ein absichtlich fehlgeschlagener Request darf mit neuem oder bereinigtem Key versucht werden,
- zwei parallele Requests mit gleichem Key erzeugen nur eine Ressource.

## 2.4 Audit atomar an den Write koppeln

**Zieldateien:**

- `packages/engine/src/store.ts`
- `packages/engine/src/content.ts`
- `packages/engine/src/imports.ts`
- `packages/engine/test/...`

**Prüfen:**

- Page Create,
- Page Delete,
- Site Create,
- Site Trash,
- Asset Create,
- Asset Replace,
- Asset Delete,
- Style Write,
- Theme Write,
- Content Create/Update,
- Import,
- Rollback.

**Regel:**

Eine fachliche Änderung und ihr Audit-Eintrag gehören in dieselbe Transaktion, wenn beide für die Aussage „was passierte“ notwendig sind.

## 2.5 Import-Jobs wirklich durable machen

**Zieldateien:**

- `packages/engine/src/store.ts`
- `packages/engine/src/http.ts`
- `packages/engine/src/imports.ts`
- `packages/engine/src/index.ts`
- `packages/engine/test/bake-jobs.test.ts`
- `packages/engine/test/imports.test.ts`

**Maßnahmen:**

1. Site-Filter für Import-Jobs erzwingen.
2. `claimImportJob` mit Lease ergänzen.
3. `leaseUntil` und `workerId` verwenden.
4. abgelaufene Jobs zurück in die Queue geben.
5. Retry mit Backoff.
6. nach Prozessstart offene Jobs fortsetzen.
7. Status über SSE veröffentlichen.
8. maximal einen Import pro Site oder Job gleichzeitig bearbeiten.
9. Import-Worker vom Bake-Worker trennen.

**Akzeptanzkriterium:**

- `GET /api/sites/:siteId/imports` zeigt ausschließlich Jobs dieser Site.
- ein Prozessabbruch hinterlässt einen resumbaren Job,
- zwei Worker beanspruchen denselben Job nicht gleichzeitig,
- Retry ist nachvollziehbar und begrenzt.

---

# 8. Phase 3: Release und Build verlässlich machen

**Priorität:** P0/P1  
**Ziel:** Rollback und Deploy sind reproduzierbar und nachvollziehbar.

## 3.1 Vollständiges Release-Manifest

**Zieldateien:**

- `packages/engine/src/types.ts`
- `packages/engine/src/lifecycle.ts`
- `packages/engine/src/store.ts`
- `packages/engine/test/release-manifest.test.ts`

**Manifest-Inhalt:**

```ts
type ReleaseManifest = {
  releaseId: string;
  pageRevisions: ReleasePageRevision[];
  themeSnapshot: unknown;
  styleRules: StyleRule[];
  contentSnapshot: ContentReleaseSnapshot;
  templateSnapshot: TemplateReleaseSnapshot;
  assetSnapshot: AssetReleaseSnapshot;
  payloadSnapshot: PayloadReleaseSnapshot;
  rendererVersion: string;
  buildHash: string;
  capturedAt: string;
  siteDate: string;
  restoredFrom?: string;
};
```

**Snapshot-Prinzip:**

- unveränderlich,
- kein Verweis auf aktuelle Live-Daten,
- vollständig serialisierbar,
- mit eigener Integritätsprüfung,
- in der Release-Aktivierung referenziert.

## 3.2 Re-Bake modellieren

**Zielpfad:**

- `packages/engine/src/lifecycle.ts:139-190`
- `packages/engine/src/store.ts:3077-3087`
- `packages/engine/src/bake-worker.ts`

**Neue Begriffe:**

- `ReleaseSnapshot`
- `BuildArtifact`
- `ContentRevision`
- `Activation`

**Ablauf:**

```text
CMS-Änderung
→ ContentRevision
→ BuildArtifact
→ Pre-Release-Checks
→ optional neue ReleaseActivation
```

Der bestehende Release-Datensatz wird nicht mehr nachträglich mit einem neuen Build überschrieben.

## 3.3 Build-Hash und Payload-Hash

**Zieldateien:**

- `packages/engine/src/build-hash.ts`
- `packages/engine/src/render/...` beziehungsweise `packages/renderer/src/bake.ts`
- `packages/engine/src/deploy.ts`

**Maßnahmen:**

1. Build-Hash aus vollständigem Manifest berechnen.
2. Manifest selbst in den Hash einbeziehen.
3. jede Payload-Datei separat prüfen.
4. Deploy vor dem Upload lokal verifizieren.
5. Abweichung als harter Fehler.
6. Release-Checker und Deploy-Checker teilen denselben Vertrag.

**Akzeptanzkriterium:**

- veränderte Payload-Datei verhindert Deploy,
- verändertes Manifest verhindert Deploy,
- Build-Hash ist für exakt gleiche Inputs stabil,
- Form-Token-Semantik ist im Manifest ausdrücklich dokumentiert.

## 3.4 Publish-Cutover

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/engine/src/http.ts`
- `packages/engine/src/lifecycle.ts`
- `packages/app/test/release-cutover-browser.test.ts`

**Ziel:**

- Canvas-Button `Veröffentlichen` führt ausschließlich über die Release-Route.
- keine direkte Re-Bake-Alternative im UI.
- vor dem Publish wird ein sichtbarer Dialog geöffnet.
- Review und Checks sind Teil des Dialogs.
- nach Erfolg wird der neue Release sichtbar angezeigt.

**Akzeptanzkriterium:**

- ein Browserpublish erzeugt genau einen Release-Snapshot,
- der Rollback-Button arbeitet auf diesem Release,
- die Paritätsmessung läuft im produktiven Publishpfad.

---

# 9. Phase 4: Editor-Modell konsolidieren

**Priorität:** P0/P1  
**Ziel:** Nur ein Editorpfad, ein Modell, eine History.

## 4.1 Modellentscheidung dokumentieren

**Neue Entscheidungsdatei:**

```text
docs/adr/0011-editor-document-als-kanonisches-modell.md
```

**Inhalt:**

- Warum `EditorDocument` intern kanonisch wird.
- Warum `NodeTree` am Persistenz- und Bake-Seam bleibt.
- Welche Felder transformiert werden.
- Welche Migrationen verboten sind.
- Welche Roundtrip-Tests Pflicht sind.

## 4.2 Bridge als Adapter begrenzen

**Zieldateien:**

- `packages/engine/src/mutations/editor-bridge.ts`
- `packages/editor/src/state/persist.ts`
- `packages/editor/src/state/document.ts`

**Regeln:**

- Bridge kennt keine Editor-UI-Zustände.
- Bridge enthält keine eigene History.
- Bridge führt keine Alternative Validierung ein.
- alle nicht darstellbaren Felder werden entweder vollständig transformiert oder als Finding ausgegeben.
- kein stiller Feldverlust.

**Testmatrix:**

| Feld | Persist → Editor | Editor → Persist |
|---|---:|---:|
| Props | Test | Test |
| Children | Test | Test |
| Slots | Test | Test |
| Varianten | Test | Test |
| Classes | Test | Test |
| Overrides | Test | Test |
| Motion | Test | Test |
| Hidden Devices | Test | Test |
| Locked | Test | Test |
| Payload | Test | Test |

## 4.3 Legacy-Editor in einen Übergangspfad verschieben

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/editor/src/browser-entry.ts`
- `packages/editor/src/mount.ts`
- `packages/editor/test/editor-browser.test.ts`

**Phasen:**

1. Legacy-Editor read-only machen.
2. alle Legacy-Writes auf den Engine-Mutationspfad umleiten.
3. Standardbundle von `mountEditor` befreien.
4. Legacy-Deep-Link nur mit Hinweis "Legacy" öffnen.
5. Browser-Tests auf Canvas umstellen.
6. Legacy-Modul löschen, wenn keine produktiven Nutzer mehr davon abhängen.

**Akzeptanzkriterium:**

- Canvas ist der einzige sichtbare Editor.
- `?view=editor` erzeugt keinen zweiten unabhängigen Savepfad.
- kein Legacy-Code wird in den Standardbundle aufgenommen.

## 4.4 Human- und Agent-History trennen

**Zieldateien:**

- `packages/editor/src/state/store.ts`
- `packages/editor/src/state/session.ts`
- `packages/editor/src/state/persist.ts`
- `packages/app/public/app.js`

**Zielzustände:**

```text
local-clean
local-dirty
saving
saved
remote-updated
conflict
error
```

**Remote-Änderung:**

- nicht blind durch `replaceDocument()` überschreiben,
- Diff anzeigen,
- Konfliktentscheidung anbieten,
- getrennte Undo-Grenzen dokumentieren.

## 4.5 Site-Theme als Editorvertrag

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/app/src/server.ts`
- `packages/editor/src/state/session.ts`
- `packages/editor/src/canvas/canvas.ts`
- `packages/editor/src/inspector/inspector.ts`
- `packages/app/test/canvas-view-browser.test.ts`

**Ablauf:**

```text
Page öffnen
→ Site laden
→ Theme laden
→ Theme an Session übergeben
→ Canvas und Inspector rendern mit demselben Theme
→ Preview und Bake verwenden denselben Tokenvertrag
```

**Akzeptanzkriterium:**

- individuelle Site-Tokens erscheinen im Editor,
- ein Test mit verändertem Accent beweist Canvas-/Inspector-/Release-Parität,
- Default-Theme wird nur als Fallback verwendet.

---

# 10. Phase 5: Human First-Run und Workspaces

**Priorität:** P0/P1  
**Ziel:** Der Primärnutzer kann ohne API und MCP einsteigen.

## 5.1 Site-Dialog

**Zieldateien:**

- `packages/app/public/index.html`
- `packages/app/public/app.js`
- `packages/app/public/app.css`

**Ersetzen:**

- `prompt()` in `packages/app/public/app.js:284-290`,
- `prompt()` für Umbenennen,
- `confirm()` für Löschen und Papierkorb.

**Dialoginhalt:**

- Name,
- Slug-Vorschau,
- Startseite automatisch anlegen,
- Site-Profil,
- Fehlerstatus,
- Primäraktion `Site anlegen`.

**Akzeptanzkriterium:**

- Site-Erstellung funktioniert vollständig per Tastatur.
- Fokus liegt beim Öffnen im Namensfeld.
- Fehler bleiben sichtbar, bis der Nutzer korrigiert oder abbricht.
- Destructive Aktionen verlangen eine zweite sichtbare Bestätigung.

## 5.2 Startseite automatisch anlegen

**Zieldateien:**

- `packages/engine/src/store.ts`
- `packages/engine/test/...`
- `packages/app/public/app.js`

**Regel:**

`createSite()` erzeugt in einer kontrollierten Transaktion:

- Site,
- Theme,
- eine Startseite mit Path `/`.

**Akzeptanzkriterium:**

- eine frische Site besitzt immer mindestens eine Page,
- `/` ist eindeutig,
- die erste Page ist im Editor direkt erreichbar,
- Fehler beim Anlegen der Startseite rollt Site-Erstellung zurück.

## 5.3 Seiten-Workspace

**Zieldateien:**

- `packages/app/public/app.js:3825-3906`
- `packages/app/public/index.html`
- `packages/app/test/...`

**Aktionen:**

- Seite anlegen,
- umbenennen,
- duplizieren,
- löschen,
- Pfad ändern,
- Status anzeigen,
- Draft-Version anzeigen,
- Editor öffnen,
- Verlauf anzeigen.

**Akzeptanzkriterium:**

- Seitenverwaltung funktioniert ohne API,
- jede Aktion hat verständliche Fehlermeldungen,
- Löschen ist reversibel oder eindeutig als endgültig markiert.

## 5.4 Releases und Rollback

**Zieldateien:**

- `packages/app/public/app.js:3805-3813`
- `packages/app/public/app.js`
- `packages/app/test/release-cutover-browser.test.ts`

**Neuer Workspace:**

```text
Releases
- aktiver Release
- Release-Liste
- Build-Hash
- Renderer-Version
- Zeitpunkt
- Review-Bezug
- Rollback
```

**Akzeptanzkriterium:**

- Nutzer kann einen älteren Release auswählen,
- Vor dem Rollback werden die Auswirkungen angezeigt,
- Rollback erzeugt einen neuen, nachvollziehbaren Zustand,
- der vorherige Release bleibt lesbar.

## 5.5 Medien-Workspace

**Zielpfade:**

- `packages/app/public/app.js`
- `packages/app/public/app.css`
- `packages/app/test/...`
- `packages/engine/src/media.ts`
- `packages/engine/src/variants.ts`

**Funktionen:**

- Upload,
- Drag-and-drop,
- Ordner,
- Suche,
- Tags,
- Alt-Text,
- Replace,
- Versionen,
- Trashed,
- Restore,
- Verwendung,
- Varianten,
- Blurhash,
- Download.

## 5.6 CMS-Workspace

**Zieldateien:**

- `packages/app/public/app.js:4500-4900`
- `packages/engine/src/content.ts`
- `packages/app/public/app.css`

**Controls:**

- Text,
- Rich Text,
- E-Mail,
- Zahl,
- Boolean,
- Auswahl,
- Relation,
- Media,
- Repeater,
- Datum,
- Slug.

**Akzeptanzkriterium:**

- Primärnutzer muss für normale Felder keine JSON-Struktur verstehen.
- Relationen und Medien werden visuell ausgewählt.
- Draft/Publish und Versionen sind sichtbar.
- Fehler nennen das betroffene Feld.

## 5.7 Redesign-Workspace

**Zielpfade:**

- `packages/app/public/app.js`
- `packages/engine/src/apply-redesign.ts`
- `packages/engine/src/references-brief.ts`
- `packages/engine/src/reference-visual-diff.ts`
- `packages/engine/src/design-report.ts`

**Ablauf:**

```text
Referenz wählen
→ Profil ansehen
→ Design-Brief prüfen
→ drei Richtungen erzeugen
→ eine Richtung auswählen
→ Draft erzeugen
→ Score ansehen
→ Visual Diff ansehen
→ Review einreichen
```

**Akzeptanzkriterium:**

- ein Mensch kann denselben Design-Transfer durchführen wie ein Agent,
- jede Entscheidung wird gespeichert,
- jede Behauptung trägt Evidenzstatus,
- keine Richtung wird ungeprüft live veröffentlicht.

---

# 11. Phase 6: Accessibility und Designsystem

**Priorität:** P1  
**Ziel:** Die Zusage aus `PRODUCT.md` wird im Produkt und in veröffentlichten Websites messbar.

## 6.1 Design-Token-Migration

**Zieldateien:**

- `.scratch/editor-v2-rebuild/design-system/senify.css`
- `packages/app/public/ui.css`
- `packages/app/public/app.css`
- `packages/editor/src/ui/tokens.ts`
- `packages/editor/src/ui/skin.ts`
- `packages/editor/src/canvas/styles.ts`
- `packages/app/test/ui-tokens-parity.test.ts`

**Zielrollen:**

- `--ui-surface-*`
- `--ui-ink-*`
- `--ui-line-*`
- `--ui-signal-*`
- `--ui-accent-*`
- `--ui-canvas-selection`
- `--ui-canvas-hover`
- `--ui-focus`

**Architekturregeln:**

1. Design-Tokens werden aus einer Quelle erzeugt.
2. App und Editor verwenden semantische Rollen.
3. alte `--ed-*` und `--bg-*`-Ersatzrollen werden entfernt oder ausschließlich in einem Legacy-Bundle verwendet.
4. kein hardcodiertes Hex in Produktions-UI.
5. kein Farbwert für Fokus, Auswahl, Primäraktion und Signalstatus gleichzeitig.

**Akzeptanzkriterium:**

- Token-Paritätstest prüft Quelle und beide UIs.
- Architecture-Test findet keine Altrollen in aktiven Produktionsdateien.
- Dark Mode entspricht der Entscheidung im Produkt.

## 6.2 Shell-Dialoge

**Zieldateien:**

- `packages/app/public/index.html`
- `packages/app/public/app.js`
- `packages/app/public/app.css`

**Regeln:**

- `role="dialog"`,
- `aria-modal="true"`,
- Titel,
- Beschreibung,
- Fokus beim Öffnen,
- Fokusfalle,
- Escape schließt,
- Fokus kehrt zurück.

## 6.3 Toasts und Statusmeldungen

**Zieldateien:**

- `packages/app/public/app.js:75-79`
- `packages/app/public/index.html`
- `packages/editor/src/canvas/canvas.ts`

**Maßnahmen:**

- Shell-Toast als `role="status"`.
- Fehler als `role="alert"`.
- Speicherstatus als Live-Region.
- Fehler nicht nach sieben Sekunden still entfernen, wenn eine Handlung nötig ist.
- Statusmeldung enthält konkrete Aktion.

## 6.4 Cmd-K

**Zieldateien:**

- `packages/app/public/index.html`
- `packages/app/public/app.js:6050-6120`
- `packages/app/public/app.css`

**Semantik:**

- Dialog,
- Eingabe,
- Listbox,
- Optionen,
- aktive Option,
- `aria-activedescendant`,
- sichtbarer Fokus,
- vollständige Tastaturbedienung.

## 6.5 Editor-Fokus

**Zieldateien:**

- `packages/editor/src/inspector/`
- `packages/editor/src/explorer/`
- `packages/editor/src/canvas/`
- `packages/editor/src/history/`
- `packages/editor/src/ui/`

**Maßnahmen:**

- jedes Eingabefeld mit Label oder `aria-labelledby`,
- jedes Toggle mit Zustand,
- Dialog-Fokus standardisieren,
- alle primären Aktionen per Tastatur erreichbar,
- Trefferflächen mindestens 24 × 24 px,
- sichtbarer Fokus bei `:focus-visible`.

## 6.6 Veröffentlichte Website

**Zieldateien:**

- `packages/renderer/astro-template/src/layouts/Page.astro`
- `packages/registry/src/components/Media.tsx`
- `packages/registry/src/components/Navbar.tsx`
- `packages/registry/src/components/Gallery.tsx`
- `packages/engine/src/release-checks.ts`

**Maßnahmen:**

1. Skip-Link.
2. `<main>`-Landmark.
3. Header-, Nav- und Footer-Landmarks.
4. Video-Captions.
5. Alt-Texte semantisch prüfen.
6. Formularfelder beschriftet.
7. Gallery-Status und Tastaturbedienung.
8. `prefers-reduced-motion` zentral durchsetzen.
9. A11y-Checks in Review und Publish aufnehmen.

---

# 12. Phase 7: MCP und Agentenarbeit

**Priorität:** P1  
**Ziel:** Agenten können sicherer, strukturierter und beobachtbarer arbeiten.

## 7.1 Tool-Verträge

**Zieldateien:**

- `packages/mcp/src/tools.ts`
- `packages/mcp/src/server.ts`
- `packages/mcp/test/workflow.test.ts`
- `docs/mcp-route-matrix.md`

**Maßnahmen:**

1. TypeBox-Schemas als gemeinsame Quelle.
2. `outputSchema` für zentrale Tools.
3. `structuredContent` für Ergebnisse.
4. einheitliche Fehlerobjekte.
5. `retryable` im Fehlervertrag.
6. Pagination für Sites, Pages, Assets, Entries, References, Releases und Jobs.
7. Tool-Manifest aus einem neutralen Paket.
8. Doku und Tests aus demselben Manifest ableiten.

## 7.2 Package-Zyklus auflösen

**Ist:**

```text
engine → framer-import → editor → engine
mcp → docs-portal → mcp
```

**Ziel:**

- `@senify/contracts` für gemeinsame Typen und Tool-Beschreibungen,
- `@senify/import-domain` für IR-/Import-Verträge,
- Editor und Engine über browser-safe Verträge verbinden,
- Docs-Portal importiert keine MCP-Implementierung.

**Architecture-Test:**

- keine Zyklen,
- keine `engine`-Imports in `renderer`,
- keine Node-only-Imports in Browser-Seams,
- Playwright muss als Package-Dependency dort deklariert sein, wo der Import produktiv verwendet wird.

## 7.3 Agentenpanel

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/app/public/app.css`
- `packages/editor/src/...`

**Anzeigen:**

- Agent-Name,
- Run-ID,
- Token-ID,
- Scopes,
- aktueller Schritt,
- letzte Mutation,
- letzte Fehlermeldung,
- Retry,
- Approval-Status,
- Diff,
- Resume,
- Stop.

**Gefährliche Aktionen:**

- Delete,
- Publish,
- Rollback,
- Themewechsel,
- Raw CSS,
- Ambient Rules,
- Domainänderung.

Diese Aktionen sollen standardmäßig eine menschliche Freigabe verlangen.

## 7.4 Agenten-Follow

**Zielpfad:**

- `packages/app/public/app.js:5543-5561`

**Neue Regeln:**

- Follow standardmäßig aus,
- explizite Aktivierung,
- sichtbarer Status,
- keine Navigation mit offenen lokalen Änderungen,
- Pause und Fortsetzen,
- Run-ID wird angezeigt,
- Remote-Änderung erzeugt einen sichtbaren Diff.

---

# 13. Phase 8: Build, CI und Wartbarkeit

**Priorität:** P1  
**Ziel:** Tests, Builds und Architekturverträge werden zuverlässig und aussagekräftig.

## 8.1 Build-Skripte trennen

**Zieldatei:**

- `package.json`

**Zielskripte:**

```text
pnpm typecheck
pnpm build:packages
pnpm build:app
pnpm build:docs
pnpm build:renderer
pnpm build:release
pnpm lint
pnpm test
pnpm test:postgres
pnpm test:browser
pnpm verify:parity
pnpm verify
```

**Regeln:**

- `typecheck` prüft nur Typen.
- `build` erzeugt reale Artefakte.
- Produktionsbuilds prüfen exportierte Package-Flächen.
- Docs-Portal wird separat gebaut.

## 8.2 Coverage

**Zieldatei:**

- `vitest.config.ts`

**Coverage-Schwellen zuerst für:**

- `packages/engine/src/http.ts`,
- `packages/engine/src/store.ts`,
- `packages/engine/src/lifecycle.ts`,
- `packages/engine/src/forms.ts`,
- `packages/editor/src/state/`,
- `packages/widget-engine/src/css/`,
- `packages/mcp/src/tools.ts`.

Keine globale 100-Prozent-Metrik, sondern gezielte Branches und Fehlerpfade.

## 8.3 Type-aware Lint

**Zieldatei:**

- `eslint.config.mjs`

**Schrittweise aktivieren:**

- `recommendedTypeChecked`,
- `projectService`,
- `no-floating-promises`,
- `no-misused-promises`,
- `no-unsafe-*` nur für bewusst geprüfte Grenzen.

## 8.4 CI-Gates

**Zieldatei:**

- `.github/workflows/verify.yml`

**Gates:**

1. `lint-and-typecheck`
2. `unit-tests`
3. `postgres-tests`
4. `browser-tests`
5. `parity-test`
6. `docs-build`
7. `security-tests`
8. `a11y-and-release-checks`

## 8.5 Large Files zerlegen

**Ziel:**

- `packages/engine/src/http.ts` in Ressourcenrouter.
- `packages/engine/src/store.ts` in Store-Domänen.
- `packages/mcp/src/tools.ts` in Tool-Gruppen.
- `packages/editor/src/mount.ts` entfernen oder in Module zerlegen.
- `packages/app/public/app.js` in ESM-Module zerlegen.

Jede neue Datei bekommt eine klare fachliche Verantwortung.

---

# 14. Phase 9: Backups, Migrationen und Betrieb

**Priorität:** P2  
**Ziel:** Datenbank und lokale Dateien bleiben über Upgrades und Wiederherstellungen zuverlässig.

## 9.1 Migrationen

**Zieldateien:**

- `packages/engine/src/db.ts`
- neu: `packages/engine/src/db/migrations/`

**Aufbau:**

```text
001_initial_schema
002_author_tokens
003_style_registry
004_releases
005_import_jobs
...
```

**Regeln:**

- jede Migration hat eine ID,
- jede Migration ist atomar,
- jede Migration wird nur einmal ausgeführt,
- angewandte Migrationen liegen in einer Historientabelle,
- `SCHEMA_STATEMENTS` wird nicht als dauerhafte Quelle für alle Änderungen weitergeführt,
- Schema-Dump dient nur der Erstellung der ersten Migration.

## 9.2 Backups

**Zieldatei:**

- `packages/engine/src/backup.ts`

**Manifest:**

```ts
type FileEntry = {
  path: string;
  bytes: number;
  sha256: string;
};
```

**Restore-Gates:**

1. Manifest vorhanden.
2. Version bekannt.
3. Tabellen vollständig.
4. Dateiliste vollständig.
5. jede Datei vorhanden.
6. jede Datei stimmt im SHA-256.
7. keine unbekannten Dateien.
8. Datenbank-Transaktion vorab vorbereitet.
9. Safety-Backup vor dem Überschreiben.

## 9.3 Formular-Tokens

**Zieldatei:**

- `packages/engine/src/forms.ts`
- `packages/engine/src/types.ts`

**Tokenvertrag:**

```ts
type FormTokenPayload = {
  siteId: string;
  formId: string;
  snapshotId: string;
  issuedAt: number;
  expiresAt: number;
  nonce?: string;
};
```

**Akzeptanzkriterium:**

- abgelaufenes Token wird abgelehnt,
- manipulierte Ablaufzeit wird durch Signaturprüfung erkannt,
- Form-Snapshot-Version ist eindeutig,
- Newsletter-TTL und allgemeines Formular-Token bleiben getrennt verständlich.

## 9.4 Secret-Rotation

**Zieldatei:**

- `packages/engine/src/secrets.ts`
- `packages/engine/src/settings.ts`
- `packages/mcp/src/doctor.ts`

**Maßnahmen:**

- Key-Version,
- `keyId`,
- Re-Encryption,
- Secret-Status im Doctor,
- Rotationstest,
- verständliche Fehlermeldung bei altem Ciphertext.

---

# 15. Referenz-Repositories: Was konkret übernommen wird

## 15.1 `Repos/instatic`

**Übernehmen:**

- ein gemeinsames Tree-Modell,
- Publisher-Snapshots,
- versionierte Migrationen,
- TypeBox an Systemgrenzen,
- Architecture-Gates,
- getrennte Editor- und Publisher-Layouts,
- atomare statische Artefakte.

**Nicht übernehmen:**

- Bun als alleinige Runtime,
- vollständige Plugin-Sandbox als v1-Ziel,
- Multi-Instance-Architektur ohne aktuellen Bedarf.

## 15.2 `Repos/puck`

**Übernehmen:**

- ein Editor-Dokument für Editor und Renderer,
- kleine öffentliche Editor-Interfaces,
- Datenmodell unabhängig von UI-Konfiguration,
- klare Trennung von Visual Components und Seiten.

**Nicht übernehmen:**

- React-only-Architektur,
- Wegfall der NodeTree-Domäne,
- Vereinfachung, die Senifys Guardrails schwächt.

## 15.3 `Repos/site-clone`

**Übernehmen:**

- Browser-Runtime messen,
- DOM, Canvas und GPU getrennt erfassen,
- Motion aus echten Runtime-APIs lesen,
- Pixel-Diff als Beweis,
- Evidenzstatus für Annahmen.

**Zielpfade:**

- `packages/analysis-worker/`,
- `packages/framer-import/`,
- `packages/engine/src/references-capture-chain.ts`,
- `packages/engine/src/reference-visual-diff.ts`.

## 15.4 `Repos/taste-vault`

**Übernehmen:**

- Designreferenz als Vokabular,
- Sammlungen,
- drei Richtungen,
- Auswahl einer Richtung,
- Variationen nach Auswahl,
- Briefs mit überprüfbaren Entscheidungen.

**Zielpfade:**

- `packages/engine/src/apply-redesign.ts`,
- `packages/engine/src/references-brief.ts`,
- `packages/app/public/app.js`.

## 15.5 `Repos/payload`

**Übernehmen:**

- Drafts,
- Revisionen,
- Access Control,
- CSRF,
- Migrationen,
- Step-up-Freigaben,
- fein abgestufte Rechte.

## 15.6 `Repos/emdash`

**Übernehmen:**

- Capability-Denken,
- Plugin-Manifest,
- strukturierte Content-Typen,
- Agent-Skills,
- portable Datenadapter als langfristige Richtung.

**Später, nicht sofort:**

- vollständige Plugin-Sandbox,
- Multi-Storage-Abstraktion,
- Cloud-first-Betrieb.

## 15.7 `Repos/elementor-main`

**Übernehmen:**

- UX-Muster für Drag-and-drop,
- vollständige Styling-Kontrolle,
- gute Empty States,
- Plugin-Ökosystem als langfristige Produktidee.

**Nicht übernehmen:**

- WordPress-/PHP-Architektur,
- monolithische Editor-Architektur,
- historische Plugin-Abhängigkeiten.

---

# 16. Detaillierte Reihenfolge der Umsetzung

## Schritt 1: Qualitätsbaseline

1. Uncommittete Änderungen inventarisieren.
2. Lintfehler beheben.
3. `pnpm typecheck` ausführen.
4. `git diff --check` ausführen.
5. Browserfehler isolieren und stabilisieren.

**Gate:** Lint, TypeScript und reproduzierbarer Testlauf.

## Schritt 2: Proxy absichern

1. Origin- und Hostprüfung implementieren.
2. Mutierende Methoden einschränken.
3. `Sec-Fetch-Site` prüfen.
4. Proxy-Timeout ergänzen.
5. Tests für erlaubte und fremde Herkunft schreiben.

**Gate:** Keine mutierende Cross-Origin-Aktion.

## Schritt 3: Token-Bootstrap schließen

1. öffentliche Tokenrouten entfernen,
2. lokalen Bootstrap einführen,
3. CLI an neuen Bootstrap anpassen,
4. Tokenrotation und Doctor ergänzen.

**Gate:** Erster Start funktioniert, danach sind Tokenrouten geschützt.

## Schritt 4: Idempotency und Import

1. Transaktionsgrenze definieren.
2. Import-Commit-Methode bauen.
3. Style-Registry-Version ergänzen.
4. Completion-Fehler testen.
5. Import-Recovery implementieren.

**Gate:** kein `partially_applied` ohne Recovery.

## Schritt 5: Jobs

1. Site-Filter reparieren.
2. Import-Lease ergänzen.
3. Worker-Resume testen.
4. Retry und SSE integrieren.
5. Job-UI ergänzen.

**Gate:** Import- und Bake-Jobs sind nach Neustart nachvollziehbar.

## Schritt 6: Release-Snapshot

1. Manifestfelder erweitern.
2. Content-, Template-, Asset- und Payload-Snapshots speichern.
3. Re-Bake als neues Artefakt modellieren.
4. Build-Hash und Deploy-Hash verbinden.
5. Release- und Deploy-Tests ergänzen.

**Gate:** Rollback liefert reproduzierbar den ursprünglichen fachlichen Zustand.

## Schritt 7: Editor-Modell

1. ADR schreiben.
2. Roundtrip-Felder vollständig inventarisieren.
3. Bridge als Adapter begrenzen.
4. Legacy-Editor read-only machen.
5. Human-/Agent-History trennen.
6. Site-Theme laden.

**Gate:** Canvas ist der einzige sichtbare Schreibeditor.

## Schritt 8: First-Run

1. Site-Dialog,
2. Startseite,
3. Seiten-Workspace,
4. Release-Workspace,
5. Medien-Workspace,
6. CMS-Workspace.

**Gate:** Site → Page → Editor → Review → Release → Rollback funktioniert ohne MCP.

## Schritt 9: Accessibility und Designsystem

1. Tokenquelle,
2. Dark-Mode-Entscheidung,
3. Fokus,
4. Dialoge,
5. Live-Regionen,
6. Cmd-K,
7. veröffentlichte Landmarks,
8. Captions,
9. A11y-Gate.

**Gate:** zentrale Browser-A11y-Suite und statische Release-Checks sind grün.

## Schritt 10: MCP und Architektur

1. MCP Output-Schemas,
2. Pagination,
3. Fehlervertrag,
4. Package-Zyklen auflösen,
5. Large Files zerlegen,
6. Architecture-Gates.

**Gate:** keine verbotenen Zyklen und keine handgeschriebenen Schemata an zentralen Toolgrenzen.

---

# 17. Definition of Done für den gesamten Umbau

Der Umbau gilt als abgeschlossen, wenn alle folgenden Bedingungen erfüllt sind:

## Sicherheit

- [ ] Dashboard-Proxy prüft Origin, Host und Fetch-Metadaten.
- [ ] Operator-Token wird nur für gültige lokale Herkunft injiziert.
- [ ] Token-Bootstrap ist nicht öffentlich erreichbar.
- [ ] alle mutierenden Engine-Routen besitzen Auth- und Context-Regeln.
- [ ] Security-Tests laufen in CI.

## Datenintegrität

- [ ] Import ist atomar oder besitzt einen getesteten Recoverypfad.
- [ ] Style Registry besitzt Optimistic Locking.
- [ ] Idempotency übersteht Completion-Fehler.
- [ ] alle relevanten Writes schreiben Audit atomar.
- [ ] Jobs besitzen Claim, Lease, Retry und Resume.
- [ ] echte PostgreSQL-Tests laufen in CI.

## Editor

- [ ] Es gibt genau einen sichtbaren Editorpfad.
- [ ] Legacy-Editor ist nicht im Standardbundle.
- [ ] alle Editorfelder haben Roundtrip-Tests.
- [ ] Mensch- und Agent-History sind unterscheidbar.
- [ ] Site-Theme ist im Editor identisch zum Release.

## Releases

- [ ] Release-Manifest enthält alle relevanten Snapshots.
- [ ] Re-Bake verändert keinen alten Release.
- [ ] Rollback ist fachlich reproduzierbar.
- [ ] Deploy prüft Manifest und Dateiintegrität.
- [ ] Publish verwendet den echten Releasepfad.

## Produktoberfläche

- [ ] Neue Site erhält automatisch eine Startseite.
- [ ] Seiten, Medien, Releases, Jobs und Rollback sind sichtbar.
- [ ] CMS-Felder sind visuell bedienbar.
- [ ] Review und Rollback sind verständlich.
- [ ] Redesign-Flow ist für Menschen nutzbar.
- [ ] Agentenpanel zeigt Run, Status, Freigaben und Diffs.

## Qualität

- [ ] Build und Typecheck sind getrennt.
- [ ] echte Build-Artefakte werden erzeugt.
- [ ] Lint deckt `packages` und `scripts` ab.
- [ ] Coverage-Gates schützen kritische Module.
- [ ] Browser-, A11y-, Parity- und Postgres-Gates laufen getrennt.
- [ ] keine instabilen Browser-Tests ohne dokumentierte Ursache.

## Dokumentation

- [ ] `docs/` enthält aktuelle Architektur- und Betriebsdokumente.
- [ ] historische Analysen sind als historisch markiert.
- [ ] Routenmatrix wird automatisch geprüft.
- [ ] Test- und Toolzahlen werden nicht manuell als aktueller Wahrheitsstand gepflegt.
- [ ] ADRs beschprechen die wesentlichen Entscheidungen.

---

# 18. Risiken und Gegenmaßnahmen

## Risiko: zu großer Umbau

**Gegenmaßnahme:**

- jede Phase hat ein eigenes Gate,
- keine Phase startet ohne bestandenen vorherigen Gate,
- Änderungen werden in kleinen PRs oder Tickets geschnitten.

## Risiko: historische Daten werden unlesbar

**Gegenmaßnahme:**

- vor Schemaänderung Read-only-Kompatibilität bauen,
- Backups vor jedem Migrationslauf,
- Legacy-Daten zunächst lesen, dann schrittweise migrieren,
- kein automatisches Löschen alter Felder.

## Risiko: Release-Reform bremst die Produktentwicklung

**Gegenmaßnahme:**

- zunächst Release-Snapshot einführen,
- bestehende Re-Bake-Semantik nur markieren und nicht sofort entfernen,
- Rollback-Parität schrittweise erweitern,
- alte Releases lesbar halten.

## Risiko: Editor-Cutover bricht Agenten

**Gegenmaßnahme:**

- Agenten weiterhin über NodeTree-Mutationen schreiben,
- EditorDocument-Transformation im Service testen,
- Roundtrip-Golden-Tests vor dem Löschen der Bridge ausführen.

## Risiko: Designsystem-Migration erzeugt visuellen Drift

**Gegenmaßnahme:**

- Rollen zuerst definieren,
- Tokens nur mechanisch migrieren,
- Screenshots und Paritätstests vor und nach jeder Änderung vergleichen,
- alte Haut zunächst im Legacy-Bundle behalten.

## Risiko: lokale Sicherheit wird zu restriktiv

**Gegenmaßnahme:**

- CLI- und Agentenzugriffe ausdrücklich testen,
- Origin-Regeln nach Herkunft getrennt testen,
- Fehlermeldungen mit klarem Hinweis auf erlaubte lokale Adresse ausgeben.

---

# 19. Dokumentationsstruktur nach dem Umbau

```text
docs/
  README.md
  current/
    architecture.md
    security.md
    editor.md
    data-model.md
    release-and-deploy.md
    build-and-ci.md
    operations.md
    mcp.md
  decisions/
    0001-json-first-bau-modell.md
    ...
    0011-editor-document-als-kanonisches-modell.md
  features/
    editor/
    imports/
    references/
    releases/
    media/
    cms/
  research/
  history/
    analyse-2026-09-23.md
    handoff-2026-09-22.md
```

**Regel für `docs/current/`:**

- beschreibt ausschließlich den aktuellen Zustand,
- jede Behauptung nennt einen Quellpfad,
- jedes Invariante verweist auf einen Test,
- alte Versionen gehören nach `docs/history/`.

**Regel für `docs/history/`:**

- Datum und Commit nennen,
- keine offenen Punkte als aktuellen Ist-Stand formulieren,
- als historischer Snapshot kennzeichnen.

---

# 20. Erste konkrete Tickets aus diesem Plan

## Ticket 1: Proxy-Origin-Gate

**Zieldateien:**

- `packages/app/src/server.ts`
- `packages/app/test/server.test.ts`

**Akzeptanzkriterien:**

- Cross-Origin-Schreibrequest 403,
- lokaler Schreibrequest 2xx,
- kein Token bei ungültiger Herkunft.

## Ticket 2: Token-Bootstrap schließen

**Zieldateien:**

- `packages/engine/src/http.ts`
- `packages/app/src/start.ts`
- `packages/mcp/src/cli.ts`

**Akzeptanzkriterien:**

- `GET /api/tokens` geschützt,
- `DELETE /api/tokens/:tokenId` geschützt,
- CLI-Bootstrap funktioniert ohne Browser.

## Ticket 3: Import-Commit-Grenze

**Zieldateien:**

- `packages/engine/src/imports.ts`
- `packages/engine/src/store.ts`
- `packages/engine/test/imports.test.ts`

**Akzeptanzkriterien:**

- kein halber Import,
- Fehlerstatus eindeutig,
- Dry Run unverändert.

## Ticket 4: Style Registry Version

**Zieldateien:**

- `packages/engine/src/db.ts`
- `packages/engine/src/store.ts`
- `packages/engine/src/http.ts`
- `packages/engine/test/style-rules.test.ts`

**Akzeptanzkriterien:**

- konkurrierende Writes erzeugen 409,
- keine stille Überschreibung,
- Audit enthält Version.

## Ticket 5: Site-Theme im Canvas

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/editor/src/canvas/canvas.ts`
- `packages/editor/src/inspector/inspector.ts`
- `packages/app/test/canvas-view-browser.test.ts`

**Akzeptanzkriterien:**

- Canvas zeigt Site-Theme,
- Inspector zeigt Site-Theme,
- Preview und Bake nutzen dieselben Tokens.

## Ticket 6: First-Run mit Startseite

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/engine/src/store.ts`
- `packages/app/test/...`

**Akzeptanzkriterien:**

- Site-Erstellung erzeugt Startseite,
- neue Site öffnet direkt eine bearbeitbare Page,
- Fehler bleiben verständlich.

## Ticket 7: Legacy-Editor Read-only

**Zieldateien:**

- `packages/app/public/app.js`
- `packages/editor/src/mount.ts`
- `packages/editor/src/browser-entry.ts`

**Akzeptanzkriterien:**

- keine unabhängigen Legacy-Writes,
- Canvas bleibt Standard,
- Deep-Link ist als Legacy markiert.

## Ticket 8: Release-Snapshot erweitern

**Zieldateien:**

- `packages/engine/src/types.ts`
- `packages/engine/src/lifecycle.ts`
- `packages/engine/src/store.ts`
- `packages/engine/test/release-manifest.test.ts`

**Akzeptanzkriterien:**

- Manifest enthält Content-, Template-, Asset- und Payload-Snapshots,
- Rollback stellt alle Daten wieder her,
- Re-Bake verändert alte Releases nicht.

## Ticket 9: PostgreSQL-CI-Gate

**Zieldateien:**

- `.github/workflows/verify.yml`
- `packages/engine/test/transactions.test.ts`

**Akzeptanzkriterien:**

- echte Transaktionen laufen in CI,
- kein Skip wegen fehlender Datenbank,
- Transaktionsfehler bleiben sichtbar.

## Ticket 10: Dokumentation neu trennen

**Zieldateien:**

- `docs/README.md`
- neue `docs/current/*`
- `docs/history/*`
- `HANDOFF.md`
- `docs/verbesserungsplan.md`

**Akzeptanzkriterien:**

- aktueller Ist-Stand eindeutig,
- historische Zahlen als historisch markiert,
- keine widersprüchlichen Tool- und Testzahlen in current docs.

---

## Schlussfolgerung

Der Umbau sollte nicht als große Neuschreibung behandelt werden. Die vorhandene Fachdomäne ist stark genug. Der Umbau konzentriert sich auf:

```text
Vertrauen
→ Transaktionen
→ kanonisches Editor-Modell
→ Release-Snapshots
→ sichtbarer Produktfluss
→ Test- und Architektur-Gates
```

Sobald diese sechs Ebenen stabil sind, kann Senify die vorhandenen Stärken, insbesondere die Agentenfähigkeit, die Renderparität und die Referenzpipeline, zuverlässig als Produkt ausbauen.
