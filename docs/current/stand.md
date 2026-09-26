# Aktueller Stand

> Basis: Arbeitsbaum auf Commit `6973cb1` (23.09.2026), mit 230 uncommitteten Dateien (110 geändert, 1 gelöscht, 119 untracked).
> Stand: 25.09.2026. Messzahlen stehen ausschließlich in `docs/current/qualitaet.md`.
> Geplante Arbeit und Reihenfolge: `docs/fahrplan.md`. Historisches: `docs/history/`.

## Lesehinweis

Dieses Dokument beantwortet: **Was ist im Code, und wo hört es auf?**
Es enthält bewusst keine Testzahlen und keine Planung. Für jede Aussage steht ein Code- oder Testpfad.
Statuswerte: `belegt` (Test + Code), `implementiert` (Code, Test deckt es nicht direkt ab), `teilweise`, `geplant`, `bewusst vertagt`.

## Systemstatus

| Bereich | Status | Beleg | Bekannte Grenze |
|---|---|---|---|
| JSON-first NodeTree und Renderer | belegt | `packages/editor`, `packages/widget-engine`, `packages/renderer` | Legacy-Editor `?view=editor` bleibt ausgeliefert (R5) |
| Draft/Revision/Release | belegt | `packages/engine/src/store.ts`, `lifecycle.ts`, `release-manifest.test.ts` | Re-Bake erzeugt ein neues Release; finalisierte Releases werden nicht nachträglich mutiert (R7) |
| Style-Registry | belegt | `store.ts` `#writeStyleRules`, `style-rules.test.ts:87-113` | **Optimistic Locking ist umgesetzt**: `style_rules_version` + `FOR UPDATE` + `baseVersion` → 409. Offen ist nur ein Klassen-Rename (R9) |
| MCP-Fassade | belegt | `packages/mcp/src/tools.ts`, `docs/mcp-route-matrix.md` | 106 Tools, **0** `outputSchema`, **0** `structuredContent` (R8); Approval-Runtime und Pagination fehlen |
| Referenz/Redesign | belegt | `redesign-proposals.ts`, `redesign-section-plan.ts`, `redesign-section-plan.test.ts`, `redesign-proposals.test.ts`, ADR-0012/0013/0014 | Apply ist atomar (R3), der **Sektions-Plan wird im Apply nie gelesen** (R3); kein Design-Record (R4), keine Proposal-TTL (R2) |
| Asset-Zugriff | belegt | `media.ts` `copySiteAssets`/`purgeAsset`, `http.ts` unter `/api/sites/:siteId/assets/…` | Site-Guard erzwungen; `getAsset` bleibt bewusst ungeprüft |
| Baustein-Bibliothek | teilweise | `packages/engine/src/library-*`, Bausteine-Workspace | Re-Attach, Similarity und mehrstelliger E2E-Nachweis fehlen |
| Framer-Import | teilweise | `packages/framer-import`, `packages/engine/src/imports.ts` | `runImport()` nutzt bei URL statisches `fetch()` statt `captureBrowser()` |
| Import-Transaktion | teilweise | `packages/engine/src/imports.ts`, `imports.test.ts` | DB-Commit ist atomar; **Assets liegen außerhalb der Transaktion** (R10) |
| Token-Trust-Seam | belegt | `operator-token.ts`, `http.ts:1202`, `auth.test.ts`, `server.test.ts:108` | Token-Routen sind `operatorOnly`, Proxy prüft Herkunft; Agents behalten normale Write-Rechte innerhalb ihrer Scopes (R6) |
| Payload-Islands | belegt | `renderer/src/islands.ts`, `engine/src/code-payloads.ts`, ADR-0010 | generische Framer-Module, Poster-Pflicht und Lizenz-Promotion unvollständig |
| Bündelung | teilweise | `app/src/server.ts:34` (esbuild), `tsconfig.json:19` (`noEmit: true`) | **Kein Produktionsbuild**: `build` = `typecheck`; Shell `app.js` ungebündelt (R1) |

## Was nach ADR-0014 wirklich im Code steht

ADR-0014 ist nicht nur angenommen, der atomare Pfad ist implementiert und getestet:

- `compileRedesign()` (`apply-redesign.ts:476`) liest und rechnet, `commitRedesignApply()` (`apply-redesign.ts:796`) schreibt die vorbereiteten Aussagen kontrollflussfrei.
- `Store.applyRedesignPlan()` (`store.ts:1758`) führt Claim, Zielsite, Theme, Seeds und Audit in **einer** Transaktion aus; ein Rollback lässt keinen halben Zustand zurück.
- Belegt durch `test/apply-redesign.test.ts` und `test/redesign-proposals.test.ts`; die echte PostgreSQL-Atomarität prüft `test/redesign-transaction.test.ts` (braucht `TEST_DATABASE_URL`, sonst Skip).
- Asset-Seite erledigt: `copySiteAssets()` (`media.ts:777`), `purgeAsset()` mit Pflicht-`siteId` (`media.ts:917`), acht Routen unter `/api/sites/:siteId/assets/…`.
- Tot danach: `Store.claimRedesignProposal()` (`store.ts:4797`) wird nirgends mehr aufgerufen; `finalizeRedesignProposal()` (`store.ts:4830`) lebt nur noch im Fehlerpfad von `runConfirmedApply`.

**Nicht umgesetzt aus ADR-0014 (letzter Abschnitt):** die Ausführung des Sektions-Plans im Executor, der Design-Record an Review/Release, die Token-an-Site-Bindung und das Aufräumen verwaister Proposals.

## Risiken und offene Übergänge

Jeder Eintrag hat eine Nummer, die `docs/fahrplan.md` und `docs/current/architektur.md` übernehmen. Das ist der verbindliche Katalog.

| Nr. | Risiko | Status | Beleg |
|---|---|---|---|
| R1 | Kein Produktionsbuild; `build` = `typecheck` | offen | `package.json:14-15`, `tsconfig.json:19`, `server.ts:34` |
| R2 | Kein Aufräumen verwaister `proposed`-Proposals, keine TTL | offen | `db.ts:248-259` (kein `expires_at`), `redesign-proposals.ts` ohne Purge-Pfad |
| R3 | Sektions-Plan wird im Apply nicht ausgeführt | offen | `sectionPlanApplied: false` in `redesign-proposals.ts:508`/`:547`; `rg sectionPlan apply-redesign.ts` → 0 Treffer |
| R4 | Kein versionierter Design-Record an Draft/Review/Release | offen | `buildDesignReport` wird in `lifecycle.ts:269`/`:633` zur Laufzeit berechnet, nirgends persistiert |
| R5 | Legacy-Editor `?view=editor` noch im Bundle und erreichbar | offen | `editor/src/index.ts:4`, `app.js:6385`, `app.js:4946` |
| R6 | Idempotency-Completion-Fehler löscht den Claim nach vollzogenem Write | offen | `http.ts:517-533`: `completeIdempotencyKey` (L518) läuft im `try`, der `catch` (L529) ruft `releaseIdempotencyKey` |
| R7 | Release-Manifest ohne Content-, Asset-, Payload-, Template-Snapshot | offen | `types.ts:170-182` |
| R8 | MCP-Tools ohne `outputSchema`/`structuredContent` | offen | 106 Tools, 0/0 Treffer in `packages/mcp/src/*.ts` |
| R9 | Klassen-Rename in der Style-Registry nicht enthalten | offen | `style-rules.test.ts` deckt Rename nicht ab |
| R10 | Import-Assets außerhalb der DB-Transaktion | offen | `imports.ts` ohne `withTransaction`; ADR-0014 §5 |
| R11 | Keine Coverage-Schwelle, kein PG-Service in CI | offen | `vitest.config.ts` ohne Coverage-Block, `verify.yml` ohne Service |
| R12 | God-Files als Änderungskosten | offen | `store.ts` 8672, `app.js` 6669, `http.ts` 5404, `tools.ts` 3515, `mount.ts` 3260 Zeilen |
| R13 | Arbeitsbaum ungesichert: 230 Dateien seit dem letzten Commit | offen | `git status --short` am 25.09.2026 |

Zwei Risiken sind **keine** offenen Lücken, sondern bewusste Grenzen, die nicht als Fehler geführt werden:

- **Postgres-Skip ohne `TEST_DATABASE_URL`** ist beabsichtigt (`ADR-0004`): Die CI-Lane fehlt, die Tests sind geschrieben. Das ist R11, kein Datenintegritätsfehler.
- **`claimRedesignProposal` als tote Methode** ist die direkte Folge von ADR-0014 (Entscheid und Effekte in einem Commit), kein Versehen.

## Redesign-Workflow

Aktuell vorhanden:

- Skill `senify-referenz-redesign.md` mit Completion-Kriterien und kanonischem Ablauf.
- Serverseitig abgeleitete **Direction Cards**: Bild, Theme-Specimen, Begründung, Regeln, Warnungen, Fingerabdruck. Agenten können keine Cards oder Theme-Patches einspeisen (`create_redesign_proposal` nimmt nur `pageId`/`referenceIds`).
- **Sektions-Plan** je Card: immutable Zuordnung der Quell-Sections zu registrierten Zieltypen und Varianten, mit vollständigem Variant-Preset, erhaltenen Inhalten, expliziten Slots und Medienbedarf. Vor dem Speichern gegen eine Kopie des Quell-Drafts bewiesen (`validateSectionPlan`), ohne DB-Änderung.
- **Medienbedarf** je Card: eigene Quell-Assets als `reuse`, fehlende/fremde als `select`, Referenzlogos und identitätsgefährdende Medien als `avoid`, sonst als Prompt-Need. Referenzmedien werden nie Ziel-Assets.
- Persistentes **Redesign Proposal** (ADR-0012) mit Planbasis, unveränderlichen Cards und der **Direction Decision** des Menschen; `stale` wird berechnet und blockiert ohne Auto-Rebase.
- `offerHash` ist ein Inhalts-Hash ohne Direction-ID; vor dem Confirm wird die gespeicherte Card neu gehasht → 409 bei Manipulation.
- Menschliche Bestätigung als **ein** Kommando (`POST /api/redesign-proposals/:id/confirm`, `operatorOnly`, kein MCP-Werkzeug).
- **Atomarer Apply** (ADR-0014): `compileRedesign` + `commitRedesignApply`; Claim und Effekte in einer Transaktion.
- `applyResult` nennt den Umfang ehrlich: `scope: "scaffold-theme"`, `sectionPlanApplied: false`.
- `apply_redesign` bleibt als autonomer Legacy-Weg bestehen und liefert alle routbaren Zielseiten mit `seeded`.
- Site-Theme wird im produktiven Canvas als Theme-Objekt und als `GET /api/sites/:siteId/theme.css` geladen.

Noch nicht vorhanden (Ausführungsstände R2, R3, R4): Section-Writes über kanonische Mutationen im selben Commit, Design-Record, automatische Medienbeschaffung, Proposal-TTL.

## Framer-Import S0 bis S9

| Scheibe | Status | Nachweis | Grenze |
|---|---|---|---|
| S0 Messung | belegt | `.scratch/framer-import/befund.md`, Messskripte | Plugin- und Kostenfragen bleiben teilweise offen |
| S1 IR und Normalisierung | implementiert | `framer-import/src/{ir,normalize,mapper,fidelity}.ts` | vollständige Bearbeitbarkeit jedes Knotens nicht flächendeckend belegt |
| S2 Capture und Assets | teilweise | `capture-browser.ts`, `assets.ts`, Browser-Tests | `runImport()` nutzt `fetch()` + `captureHtml()` statt `captureBrowser()` |
| S3 Import und Jobs | belegt | `imports.ts`, `imports-contract.ts`, Import-Routen, `imports.test.ts` | DB-Commit atomar mit Receipts; externe Assets kompensiert |
| S3b Island-Payloads | teilweise | `code-payloads.ts`, Renderer-Tests | Mirror-Quellen und wenige Adapter, nicht generisch |
| S4 Fremdcode | teilweise | Importdialog, Report, Review | generische Extraktion, Poster, Lizenz-Promotion offen |
| S5 Visual Gate | belegt | `import-visual-gate-browser.test.ts` | kontrollierte Fixture, nicht alle echten Export-Fixtures |
| S6 Bibliotheksmodell | belegt | `library.ts`, Bibliotheksrouten, MCP-Tools | mehrstelliger Installations-/Update-Nachweis offen |
| S7 Bibliotheks-UI | teilweise | Bausteine-Workspace, Explorer-Tab | vollständiger menschlicher E2E-Weg offen |
| S8 Motion-Mapping | implementiert | `mapFramerMotion`, Motion-Report, ADR-0006 | eigene Framer-Motion-ADR und vollständiger Coverage-Nachweis offen |
| S9 Erweiterung | geplant | `.scratch/framer-import/plan.md` | Mehrseitenbaum, CMS-Mapping, Localization, Code-Sections |

## Priorisierte offene Arbeit

Verbindlich und priorisiert steht diese Liste in **`docs/fahrplan.md`** mit Gates und Definition of Done.
Kurzfassung der Reihenfolge: **Arbeitsbaum sichern → Build-Echtheit → Sicherheits-/Integritäts-Reste → CI-Nachweis (PG + Coverage) → Sektions-Executor → Legacy-Editor → Manifest → MCP-Schemas → God-File-Aufteilung.**

## Bewusst vertagt

- freie Motion-Timeline
- vollständige Sections-Migration zu Visual Components (Nutzerentscheidung 21.09.)
- Localization, E-Commerce, Marketplace, Multiplayer
- Dual-Dialect-Ausstieg aus PostgreSQL bis Phase 5 oder später (ADR-0004)
- Mobile Responsiveness des Portals (Desktop-Werkzeug-Entscheidung 24.09., siehe `.scratch/editor-v2-rebuild/ui-audit-2026-09-24.md`)
