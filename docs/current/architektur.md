# Aktuelle Architektur

> Dieses Dokument beschreibt den Ist-Zustand des Arbeitsbaums, nicht den Zielzustand.
> Zielarchitektur und Reihenfolge: `docs/fahrplan.md`. Umsetzungsstand: `docs/current/stand.md`.
> Die Risiko-Nummern `R1`–`R13` sind mit `docs/current/stand.md` und `docs/fahrplan.md` identisch. Der geprüfte Folge-Diff ist gesichert; der P3-2-Mapper-Schritt ist gegatet und als `0193fde` committet. Details und aktuelle Ergebnisse stehen in `docs/current/qualitaet.md`.

## Seams

| Seam | Was er leistet | Datei |
|---|---|---|
| `EditorDocument` | internes Editor-Dokument (v2-Tree mit Geräte-Suffixen, `states`, `motion`, `classes`) | `packages/editor/src/state/document.ts` |
| `NodeTree` | Persistenz- und Bake-Vertrag | `packages/section-sdk/src/types.ts` |
| `editor-bridge` | Adapter zwischen beiden Modellen, keine zweite Fachwahrheit | `packages/engine/src/mutations/editor-bridge.ts` |
| `Store` | kapselt PostgreSQL-Schreibpfade, Transaktionen und Revisionen; Mapper und erste Fach-Module (Formulare, Einstellungen, Releases, Deployments, Notifications, Referenz-Bibliothek, Entries, Re-bake-Queue, Previews/Reviews; ADR-0019) werden im Rahmen von R12 ausgelagert, `Store` delegiert | `packages/engine/src/store.ts`, `store-forms.ts`, `store-settings.ts`, `store-releases.ts`, `store-deploy.ts`, `store-notifications.ts`, `store-reference-library.ts`, `store-entries.ts`, `store-bake-jobs.ts`, `store-reviews.ts`, `store-record-mappers.ts`, `store-form-mappers.ts`, `store-reference-mappers.ts`, `store-job-mappers.ts`, `store-settings-mappers.ts`, `store-row-utils.ts` |
| `Renderer` | erzeugt aus NodeTree, Theme, Styles und Assets eine statische Site | `packages/renderer/src/bake.ts` |
| MCP-Fassade | delegiert an Engine-Routen; neutrale Tool-Fakten liegen zusätzlich im Manifest-Paket | `packages/mcp/src/tools.ts`, `packages/manifest/src/` |

**R5 geschlossen:** `NodeTree` bleibt die Persistenzwahrheit; der Legacy-Editor `packages/editor/src/mount.ts` ist gelöscht. Der Canvas (`editor/src/canvas/`) ist aktiv. `FrameRenderer` liegt als gemeinsamer Typ in `packages/editor/src/frame-renderer.ts`; `?view=editor` wird sichtbar auf Canvas umgeleitet. Belege: `packages/app/test/server.test.ts`, `packages/app/test/canvas-view-browser.test.ts`.

**MCP-Manifest und Paging:** `@senify/manifest` hält generierte Tool-Fakten (106 Werkzeuge, inkl. aller gerufenen Routen) und ist die eine Quelle: Docs-Portal und Routenmatrix lesen daraus, der Server spiegelt seine Fakten per Test. `packages/engine/src/paging.ts` definiert das HTTP-Paging; die paginierten MCP-Listenwerkzeuge bieten `limit`/`offset` mit `total`/`hasMore` an, und 12 Werkzeuge (6 lesend, 6 schreibend) deklarieren `outputSchema` (R8 geschlossen).

## Referenz-Redesign

```text
Referenzbibliothek
→ plan_redesign (read-only)
→ create_redesign_proposal (Direction Cards + Sektions-Plan serverseitig abgeleitet)
→ menschliche Direction Decision (POST /api/redesign-proposals/:id/confirm, operatorOnly)
→ compileRedesign() (liest, rechnet, vergibt jede Kennung vorab)
→ commitRedesignApply() / Store.applyRedesignPlan() (eine Transaktion)
→ Draft mit bestätigtem Theme, Scaffold und — sofern ausführbar — Sektions-Plan
→ offene Medienbedarfe über die Media-Needs-Route auflösen (nicht automatisch beschaffen)
→ get_design_report / diff_reference / create_preview
→ submit_for_review / get_review_feedback
```

### Was der Apply atomar schreibt (ADR-0014)

`Store.applyRedesignPlan()` führt Claim und fachliche Effekte in genau einer Transaktion aus:

1. Proposal-Claim mit `FOR UPDATE` und gespeicherter menschlicher Direction Decision.
2. Anlage der Zielsite und ihrer Theme-Zeile.
3. Seed der Startseite, sofern der Plan eine vorsieht.
4. Kopierte Seiten samt Drafts in der Zielsite.
5. Vorbereitete Theme- und Page-Writes gegen erwartete Versionen.
6. Audit-Einträge und Proposal-Abschluss.

Kontrollfluss, Ableitungen und Kennungen werden vor dem Commit im Compile-Schritt berechnet. Ein Transaktionsfehler rollt Claim und fachliche Effekte gemeinsam zurück. Belege: `packages/engine/test/apply-redesign.test.ts`, `redesign-proposals.test.ts`, `redesign-transaction.test.ts`; die Postgres-Tests brauchen `TEST_DATABASE_URL`, sonst werden sie im normalen Volltest übersprungen.

Dateien werden außerhalb der DB-Transaktion vorbereitet und bei fehlgeschlagenem Commit kompensiert (ADR-0014 §5). Eine gemeinsame Transaktion für Dateisystem und Datenbank besteht nicht.

### Sektions-Plan und Medienbedarf

- `compileRedesign()` leitet Ziel-Section-Writes aus dem bestätigten Plan ab; `rebuildPageTree()` baut Knoten, und der Commit schreibt sie atomar mit Theme und Claim.
- `sectionPlanApplied` ist nur wahr, wenn mindestens ein Write vorliegt und kein Medienbedarf offen bleibt.
- Medienbedarfe sind über `POST /api/redesign-proposals/:id/media-needs` adressierbar und werden über die kanonischen Mutationen mit Versionsprüfung/Audit aufgelöst. Automatische Beschaffung über `select`/`upload`/`generate` ist nicht vorhanden.
- `avoid` bleibt absichtlich ohne Asset-Verweis; Site-Zugehörigkeit wird vor dem Schreiben geprüft.
- Proposal-TTL: `expires_at` (sieben Tage), Sweep auf `expired`, Fristprüfung im Claim. Beleg: `packages/engine/test/redesign-proposal-ttl.test.ts`.
- Design-Records werden bei Review und Publish persistiert; Manifest und Content-Re-Bake referenzieren den eingefrorenen Record. Beleg: `packages/engine/test/design-record.test.ts`.

### Asset-Kopie und Site-Guard

- `copySiteAssets()` vergibt neue Asset-IDs und Speicherpfade, kopiert Ordner/Bildvarianten/Blurhash/Dateihistorie und schreibt Draft-Verweise um.
- `purgeAsset()` verlangt `siteId`; `updateAsset` und die Lese-Route sind site-scoped.
- `rewriteAssetIds` ersetzt bekannte Zuordnungen; unbekannte Referenzen bleiben sichtbar und können `broken-asset` auslösen.
- Asset-Routen liegen unter `/api/sites/:siteId/assets/`; `getAsset` bleibt absichtlich ungeprüft, weil der Sektions-Plan die Zugehörigkeit selbst auswertet.

### Verbliebene Redesign-Methoden

`Store.finalizeRedesignProposal()` bleibt im Fehlerpfad von `runConfirmedApply()`. Weitere tote Pfade sind vor einer Bereinigung anhand aktueller Aufrufer zu prüfen; sie sind kein bekanntes Sicherheits- oder Datenproblem.

## Framer-Import

```text
URL oder Mirror
→ statisches fetch() oder captureBrowser()
→ FramerIrDocument
→ normalize
→ mapDocument + mapFramerMotion
→ FidelityReport
→ optional Assets, Fonts und Island-Payloads
→ EditorDocument
→ NodeTree
→ Draft/Revision/Release
```

### Aktuelle Grenzen

- `runImport()` verwendet für URLs `fetch()` und `captureHtml()`; `captureBrowser()` existiert und ist getestet, ist aber nicht der normale URL-Orchestrator.
- Payloads werden im Hauptpfad nur für Mirror-Quellen extrahiert.
- Der Import-Commit liefert bei gleichem Inhalt einen Receipt und verhindert doppelte DB-Schreibvorgänge auch mit neuem Idempotency-Key.
- Datei und DB bilden keine gemeinsame Transaktion. Neu erzeugte Uploads werden bei fehlgeschlagenem Commit kompensiert; der Fehlerpfad ist in `packages/engine/test/imports.test.ts` belegt. Bereits vorhandene Assets werden nicht entfernt. R10 ist mit diesem Kompensationsvertrag geschlossen.

## Schreibpfade

| Pfad | Transaktionales Verhalten | Beleg |
|---|---|---|
| Page-Draft | `baseDraftVersion`, 409 bei Konflikt | `store.ts`, `persistBatch` |
| Draft + Revision + Audit | eine Transaktion | `persistBatch`, `transactions.test.ts` |
| Style-Registry | Row-Lock + `style_rules_version` + `baseVersion` → 409 | `store.ts`, `style-rules.test.ts` |
| Redesign-Apply | eine Transaktion (Claim + Effekte) | `store.ts`, `redesign-transaction.test.ts` |
| Import (DB) | atomar mit Receipt | `imports.ts`, `imports.test.ts` |
| Import (Dateien) | getrennte Ressource; neu erzeugte Uploads werden bei DB-Commit-Fehler kompensiert | `imports.ts`, `imports.test.ts` |
| Idempotency | Completion-Fehler löscht nach Write keinen Claim | `http.ts`, `idempotency.test.ts`, `error-paths.test.ts` |

### Idempotency (R6, geschlossen)

Der Fehler aus `run()` gibt den Key frei, weil kein erfolgreicher fachlicher Write feststeht. Ein Fehler in `completeIdempotencyKey` behält den Claim und markiert ihn; `completeIdempotencyKey` prüft `UPDATE ... RETURNING`, und der Claim-Pfad prüft den Marker. Ein Retry im Zustand `committed_unknown` antwortet mit 409 statt einen zweiten Write auszuführen. Der Zustand wird über die additive Tabelle `idempotency_committed` abgebildet. Belege: `packages/engine/test/idempotency.test.ts` und `error-paths.test.ts`.

## Releases (R7, geschlossen)

- `page_revisions` speichert Tree, Titel und Pfad; nicht alle Metadaten eines Pages sind pauschal Teil des Revisions-Snapshots.
- `releases` speichert `pageRevisions`, `themeSnapshot`, Manifest und Build-Referenz.
- `ReleaseManifest` enthält Renderer-/Build-Metadaten sowie Snapshot-Werte für `assets`, `components`, `payloads` und `entries` (`packages/engine/src/types.ts`). `buildReleaseSnapshots` sammelt die verwendeten Werte und meldet fehlende referenzierte Assets.
- `restoreSnapshotAssets` stellt Zeilen und verfügbare Bytes aus dem Basis-Release wieder her. Fehlen sowohl Asset-Zeile als auch Release-Datei, wird der Vorgang mit 422 verweigert. Belege: `packages/engine/src/lifecycle.ts`, `packages/engine/test/release-manifest.test.ts`.
- Finalisierte Releases bleiben unverändert; ein Content-Re-Bake erzeugt ein neues Release.
- Der Aktivzeiger darf zwischen Releases wechseln; ältere Build-Verzeichnisse bleiben erhalten.

## Island-Payloads

- `site_code_payloads` liegt neben dem NodeTree.
- Der Canvas führt Payloads nicht aus, Preview und Release schon.
- Bake-Dateien liegen unter `assets/payloads/`.
- Budgets und Integrität stehen in `packages/engine/src/guardrails.ts`; Begründung in ADR-0010.
- Fremdcode mit unbekannter Lizenz darf laut ADR-0010 nicht in die globale Bibliothek promotet werden.

## Bündelung und Auslieferung (R1, Implementierung geschlossen)

| Artefakt | Heute | Beleg |
|---|---|---|
| Editor-Bundle | Build-time esbuild, `format: esm`; zur Laufzeit aus `dist`, im Entwicklungsweg on demand | `packages/app/build.mjs`, `packages/app/src/server.ts` |
| Shell `app.js` | Build-time esbuild nach `packages/app/dist/app.js` | `packages/app/build.mjs`, `packages/app/public/app.js` |
| `pnpm build` | `tsc --noEmit` plus rekursive Package-Builds; erzeugt App- und Docs-Portal-Artefakte | `package.json`, Workspace-Package-Skripte |
| Artefakt-Tor | `scripts/verify-dist.mjs` läuft in `pnpm verify` und als eigener CI-Schritt | `package.json`, `.github/workflows/verify.yml` |
| Paritäts-Tor | echter Release-Pfad, aber aus ungebündeltem Arbeitsbaum | `scripts/verify-parity.mjs` |

R1 ist durch Build und angeschlossenes Artefakt-Gate implementierungsseitig geschlossen. `pnpm verify` hat Build und Artefakt-Gate auf dem Folge-Diff am 28.09.2026 bestanden.

## Bekannte Übergänge (Risiko-Register)

| Nr. | Übergang | Zustand | Beleg |
|---|---|---|---|
| R1 | Quelle → Artefakt | Implementierung sowie aktueller Build-/Artefakt-Gate geschlossen | `package.json`, `scripts/verify-dist.mjs`, `verify.yml` |
| R2 | Proposal → Aufräumen | geschlossen: TTL, Sweep und Claim-Prüfung | `db.ts`, `store.ts`, `redesign-proposal-ttl.test.ts` |
| R3 | Sektions-Plan → NodeTree | geschlossen: Plan-Writes im atomaren Apply | `apply-redesign.ts`, `redesign-section-apply.ts`, `redesign-proposals.test.ts` |
| R4 | Design-Report → Review/Release | geschlossen: versionierte Design-Records | `lifecycle.ts`, `design-record.test.ts` |
| R5 | Legacy-Editor → Canvas | geschlossen: Legacy-Datei entfernt, Redirect sichtbar | `mount.ts` gelöscht, `frame-renderer.ts`, Canvas-/Server-Tests |
| R6 | Write → Idempotency-Abschluss | geschlossen | `http.ts`, `idempotency.test.ts`, `error-paths.test.ts` |
| R7 | Release → Snapshots | geschlossen: Assets, Components, Payloads und Entries; begrenzter Asset-Restore-Fehlerfall | `types.ts`, `lifecycle.ts`, `release-manifest.test.ts` |
| R8 | MCP → Schema/Pagination/Manifest | geschlossen: retryable, Output-Schemas (6 lesend + 6 schreibend), MCP-Pagination, Manifest als Faktenquelle für Docs/Matrix/Server-Spiegel | `mcp/src/tools.ts`, `mcp/src/server.ts`, `manifest/`, `engine/src/paging.ts`, `engine/src/route-matrix.ts` |
| R9 | Style-Registry → Klassen-Rename | geschlossen | `style-rules.test.ts` |
| R10 | Import → Dateien | Kompensation neuer Uploads nach Commit-Fehler belegt; keine gemeinsame Datei-/DB-Transaktion | `imports.ts`, `imports.test.ts` |
| R11 | Nachweis → CI | Gates vorhanden und auf dem Folge-Diff lokal bestanden | `verify.yml`, `vitest.config.ts`, `test:postgres`, `error-paths.test.ts` |
| R12 | Änderung → Datei | teilweise: Store-Row-Mapping, Formular-Operationen (`store-forms.ts`), Einstellungen (`store-settings.ts`), Release-Operationen (`store-releases.ts`) Deployments mit Deploy-Einstellungen (`store-deploy.ts`), Notifications (`store-notifications.ts`) Referenz-Sammlungen (`store-reference-library.ts`) Entries mit Versionen und Slug-Weiterleitungen (`store-entries.ts`) die Re-bake-Queue (`store-bake-jobs.ts`) sowie Previews und Review-Items (`store-reviews.ts`) ausgelagert; übrige Store-Operationen und übrige Module offen | `store.ts`, `store-forms.ts`, `store-settings.ts`, `store-releases.ts`, `store-deploy.ts`, `store-notifications.ts`, `store-reference-library.ts`, `store-entries.ts`, `store-bake-jobs.ts`, `store-reviews.ts`, `store-record-mappers.ts`, `http.ts`, `app.js`, `mcp/src/tools.ts` |
| R13 | Arbeitsbaum → Commit | Folge-Diff und Store-Mapper-Schritt gesichert (`2a0afde`, `aad9550`, `0193fde`) | `git status --short` |
