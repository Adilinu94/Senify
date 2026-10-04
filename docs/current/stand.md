# Aktueller Stand

> Basis: Commit `aad9550` (29.09.2026); der geprüfte Folge-Diff ist gesichert. Eine reine Store-Mapper-Auslagerung ist der aktuelle uncommittete P3-2-Schritt; Typecheck, Lint, Volltest und Coverage sind dafür grün. Frühere App-/PostgreSQL-Gates stehen mit Datum in `docs/current/qualitaet.md`.
> Stand: 29.09.2026. Messzahlen stehen ausschließlich in `docs/current/qualitaet.md` und werden von `pnpm quality:render` erzeugt, nicht von Hand gepflegt.
> Geplante Arbeit und Reihenfolge: `docs/fahrplan.md`. Historisches: `docs/history/`.

## Lesehinweis

Dieses Dokument beantwortet: **Was ist im Code, und wo hört es auf?**
Es enthält bewusst keine Testzahlen und keine Planung. Für jede Aussage steht ein Code- oder Testpfad.
Statuswerte: `belegt` (Test + Code), `implementiert` (Code, Test deckt es nicht direkt ab), `teilweise`, `geplant`, `bewusst vertagt`.

## Systemstatus

| Bereich | Status | Beleg | Bekannte Grenze |
|---|---|---|---|
| JSON-first NodeTree und Renderer | belegt | `packages/editor`, `packages/widget-engine`, `packages/renderer` | Der Legacy-Editor ist **weg**: `mount.ts` (3 270 Zeilen) ist gelöscht, `?view=editor` leitet sichtbar auf den Canvas um (R5 geschlossen) |
| Draft/Revision/Release | belegt | `packages/engine/src/store.ts`, `lifecycle.ts`, `release-manifest.test.ts` | Re-Bake erzeugt ein neues Release; finalisierte Releases werden nicht nachträglich mutiert (R7) |
| Style-Registry | belegt | `store.ts` `#writeStyleRules`, `style-rules.test.ts` | Optimistic Locking (`style_rules_version` + `FOR UPDATE` + `baseVersion` → 409) und der Klassen-Rename sind umgesetzt und getestet (R9 geschlossen) |
| MCP-Fassade | teilweise | `packages/mcp/src/tools.ts`, `packages/mcp/src/server.ts`, `packages/manifest/src/`, `packages/engine/src/paging.ts` | `outputSchema`/`structuredContent` sind nur für ausgewählte lesende Werkzeuge deklariert. Engine-Paging-Helfer und einzelne paginierte HTTP-Routen existieren, aber MCP-Tools bieten Pagination noch nicht durchgängig an. Das neutrale Manifest wird vom Docs-Portal genutzt; Server und Routenmatrix sind noch nicht daraus abgeleitet (R8 offen) |
| Referenz/Redesign | belegt | `redesign-proposals.ts`, `redesign-section-plan.ts`, `redesign-section-apply.ts`, vier Redesign-Suiten, ADR-0012/0013/0014 | Apply ist atomar, der Sektions-Plan wird ausgeführt (R3), Proposals veralten (R2), der Design-Record ist eingefroren (R4) und Medienbedarfe sind bedienbar (P2-2). Offen: automatische Medienbeschaffung — der Bedarf wird benannt und geschlossen, aber nicht selbst beschafft |
| Asset-Zugriff | belegt | `media.ts` `copySiteAssets`/`purgeAsset`, `http.ts` unter `/api/sites/:siteId/assets/…` | Site-Guard erzwungen; `getAsset` bleibt bewusst ungeprüft |
| Baustein-Bibliothek | teilweise | `packages/engine/src/library-*`, Bausteine-Workspace | Re-Attach, Similarity und mehrstelliger E2E-Nachweis fehlen |
| Framer-Import | teilweise | `packages/framer-import`, `packages/engine/src/imports.ts` | `runImport()` nutzt bei URL statisches `fetch()` (holt jetzt die verlinkten Stylesheets) statt `captureBrowser()`; Motion, Section-Erkennung, Mehrseiten-Crawl und Theme-Farben offen |
| Import-Transaktion | belegt | `packages/engine/src/imports.ts`, `packages/engine/test/imports.test.ts` | DB-Commit ist atomar; neu hochgeladene Assets werden bei Commit-Fehler kompensiert. Bereits vorhandene Assets werden nicht entfernt (R10 geschlossen) |
| Token-Trust-Seam | belegt | `operator-token.ts`, `http.ts:1202`, `auth.test.ts`, `server.test.ts:108` | Token-Routen sind `operatorOnly`, Proxy prüft Herkunft; Agents behalten normale Write-Rechte innerhalb ihrer Scopes |
| Payload-Islands | belegt | `renderer/src/islands.ts`, `engine/src/code-payloads.ts`, ADR-0010 | generische Framer-Module, Poster-Pflicht und Lizenz-Promotion unvollständig |
| Bündelung | belegt | `packages/app/build.mjs`, `packages/app/src/server.ts` (`appDir`), `scripts/verify-dist.mjs` | Build und Artefaktprüfung im vollständigen `pnpm verify` am 28.09.2026 bestanden |

## Was nach ADR-0014 wirklich im Code steht

ADR-0014 ist nicht nur angenommen, der atomare Pfad ist implementiert und getestet:

- `compileRedesign()` und `commitRedesignApply()` bereiten den Plan vor und schreiben ihn kontrollflussfrei.
- `Store.applyRedesignPlan()` führt Claim und fachliche Effekte in **einer** Transaktion aus; die Postgres-Lane prüft Rollback- und Apply-Verhalten.
- Belege: `packages/engine/test/apply-redesign.test.ts`, `redesign-proposals.test.ts` und `redesign-transaction.test.ts` (letztere braucht `TEST_DATABASE_URL`, sonst Skip im normalen Lauf).
- Asset-Kopie: `copySiteAssets()` und `purgeAsset()` mit Pflicht-`siteId`; Routen liegen unter `/api/sites/:siteId/assets/…`.
- `finalizeRedesignProposal()` bleibt im Fehlerpfad von `runConfirmedApply`; weitere tote Pfade sind vor dem Entfernen anhand aktueller Aufrufer zu prüfen.

**Erledigte Ergänzungen gegenüber ADR-0014:** Der Sektions-Plan wird im Executor ausgeführt (P2-1/R3), Design-Records werden bei Review und Publish persistiert (P2-4/R4), und Proposals haben TTL/Sweep (P2-3/R2). Die Token-an-Site-Bindung ist weiterhin nicht Bestandteil des umgesetzten Vertrags; die bestehenden Scopes bleiben maßgeblich.

## Risiken und offene Übergänge

Jeder Eintrag hat eine Nummer, die `docs/fahrplan.md` und `docs/current/architektur.md` übernehmen. Das ist der verbindliche Katalog. Bereits geschlossene Schritte sind durch Code/Test belegt; die aktuellen Gates des Folge-Diffs stehen in `docs/current/qualitaet.md`.

| Nr. | Risiko | Status | Beleg |
|---|---|---|---|
| R1 | Kein Produktionsbuild; `build` = `typecheck` | **Implementierung und aktuelles Build-/Artefakt-Gate geschlossen** | `packages/app/build.mjs` (esbuild-Bundle nach `packages/app/dist`), `package.json` (`build` + `verify:dist` in `verify`), `scripts/verify-dist.mjs`; `appDir` in `app/src/server.ts` liefert das Artefakt. Negativ geprüft: ohne `dist/` endet das Tor mit Exit 1 und nennt jeden fehlenden Grund |
| R2 | Kein Aufräumen verwaister `proposed`-Proposals, keine TTL | **geschlossen 27.09.2026** | Spalte `expires_at` plus Sweep-Index in `db.ts`; `Store.expireStaleRedesignProposals()` (`store.ts`) altert unentschiedene Zeilen zu `expired`, aufgerufen aus `listRedesignProposals` und `getRedesignProposal`; `applyRedesignPlan` prüft die Frist **im Claim**, ein abgelaufener Vorschlag scheitert mit `conflict` und ohne halben Write. Test: `test/redesign-proposal-ttl.test.ts` (6 Fälle) |
| R3 | Sektions-Plan wird im Apply nicht ausgeführt | **geschlossen 27.09.2026** | `compileRedesign` leitet aus `card.sectionPlan` die Ziel-Section-Writes ab (`apply-redesign.ts`, Plan-Zweig **vor** der Inhaltsprüfung), `rebuildPageTree` (`redesign-section-apply.ts`) baut sie, `commitRedesignApply` schreibt sie in derselben Transaktion. `sectionPlanApplied` ist ehrlich: `true` nur bei mindestens einem Write **und** null offenen Medienbedarfen. Test: `redesign-proposals.test.ts:372` (`sectionPlanApplied: true`, `scope: "section-plan"`) |
| R4 | Kein versionierter Design-Record an Draft/Review/Release | **geschlossen 27.09.2026** | Tabelle `design_records` (`db.ts`) mit Stage, gemessenem Stand und dem eingefrorenen Report; `Store.createDesignRecord/listDesignRecords/getDesignRecord` (`store.ts`); `lifecycle.ts` schreibt einen Record beim Publish **und** beim Review; `ReleaseManifest` trägt `designRecordId`/`designScore`/`designVerdict`, der Content-Re-Bake reicht den Record des Basis-Releases weiter. `designStateVersion` (`design-report.ts`) ist der Stand-Fingerabdruck. Test: `test/design-record.test.ts` (6 Fälle) |
| R5 | Legacy-Editor `?view=editor` noch im Bundle und erreichbar | **geschlossen 28.09.2026** | **Punkt 1:** `?view=editor` leitet sichtbar auf den Canvas um (Toast), der Parameter wird aus dem Hash entfernt. **Punkt 2:** `mountEditor`/`createStubRenderer` trugen `@deprecated`. **Punkt 3:** die Browser-Tests fuhren auf eine eigene Seite. **Punkt 4:** `packages/editor/src/mount.ts` (3 270 Zeilen) ist **gelöscht**, ebenso `legacy-editor.html` und die zwei Legacy-Browser-Tests. Der einzige Teil, den Live-Code noch brauchte, war der Typ `FrameRenderer` — er liegt jetzt in `frame-renderer.ts`, und `canvas.ts` sowie `react-renderer.tsx` importieren direkt von dort. `server.test.ts` prüft, dass der Bundle `mountEditor` nicht mehr enthält; die Suche ist verankert und gibt den Kontext aus, weil React selbst `...NodeIntoContainer` mitbringt |
| R6 | Idempotency-Completion-Fehler löscht den Claim nach vollzogenem Write | **geschlossen 26.09.2026** (`d233971`) | `http.ts:531-541`: der `run()`-Fehler gibt den Key frei, der Completion-Fehler nicht; `completeIdempotencyKey` prüft das `UPDATE` per `RETURNING` und wirft bei 0 Zeilen; Zustand `committed_unknown` in `http.ts:506-519`. Beweis: `idempotency.test.ts:343` (Retry antwortet 409, kein zweiter Write) |
| R7 | Release-Manifest ohne Content-, Asset-, Payload-, Template-Snapshot | **geschlossen 28.09.2026** | `ReleaseManifest` trägt Snapshots für `assets`, `components`, `payloads` und `entries` (`packages/engine/src/types.ts`). `buildReleaseSnapshots` (`lifecycle.ts`) sammelt verwendete Daten und meldet fehlende referenzierte Assets; `restoreSnapshotAssets` stellt verfügbare Bytes aus dem Basis-Release wieder her. Tests: `packages/engine/test/release-manifest.test.ts`. Grenze: fehlen Asset-Zeile und Release-Datei, verweigert der Publish-Guard den Vorgang mit 422, statt ein defektes Bild zu liefern. |
| R8 | MCP-Tools ohne durchgängige Schema-/Pagination-Verträge | **Punkte 1 bis 5 erledigt 28.09.2026** | **Punkt 1:** `outputSchema` auf `ToolDefinition`, Schemata für 6 lesende Werkzeuge; `structuredFor` sendet `structuredContent` nur, wenn das Werkzeug ein Schema deklariert **und** der Wert es erfüllt. **Punkt 2:** `McpErrorPayload.retryable` je Kategorie (nur `conflict`/`rate_limit` sind wiederholbar) und begrenztes `attempt` je (Werkzeug, Argumente). **Punkt 3:** `packages/engine/src/paging.ts` — `limit` (Standard 50, Kappe 200) und `offset` auf Sites, Seiten, Assets, Einträge, Referenzzuweisungen, Releases, Bake-Jobs und Image-Jobs; die Kappe wird **abgelehnt, nicht gekürzt**, weil eine stille Kürzung eine andere Frage beantwortet als die gestellte. **Punkt 4:** `@senify/manifest` als neutrales Paket — `tools.ts` ist **generiert** (`pnpm manifest:render` aus `mcp/src/tools.ts`, 106 Werkzeuge), `types.ts` hält die Typen, `tools-index.ts` die Logik, `index.ts` den Join. **Punkt 5:** `docs-portal` importiert `@senify/manifest` statt `@senify/mcp/tools`; der Zyklus ist aufgelöst. Tests: `paging.test.ts` (9), `manifest.test.ts` (6), 2 in `workflow.test.ts`. **Rest:** die Schreibwerkzeuge tragen noch kein `outputSchema` |
| R9 | Klassen-Rename in der Style-Registry nicht enthalten | **geschlossen 27.09.2026** | `Store.updateStyleRule` (`store.ts`) benennt eine Klassenregel um, lässt die `id` stehen und lässt den `selector` mitziehen; `ambient` geht nur über `selector`, `scoped` gar nicht. Test: `test/style-rules.test.ts` (5 Fälle: Rename mit Selektor, Namenskollision, ungültiger Name, Ambient, Scoped) |
| R10 | Import-Assets außerhalb der gemeinsamen DB-Transaktion | **Kompensationsvertrag geschlossen 27.09.2026** | Neu erzeugte Uploads werden bei fehlgeschlagenem DB-Commit kompensiert; `packages/engine/test/imports.test.ts` erzwingt einen 409 nach dem Upload und prüft das Entfernen. Datei und DB bleiben getrennte Ressourcen; bereits vorhandene Assets werden nicht entfernt. `getAsset` bleibt absichtlich ungeprüft |
| R11 | Keine Coverage-Schwelle, kein PG-Service in CI | **Implementierung und aktuelle lokale Gates geschlossen** | Coverage-Schwellen, Fehlerpfad-Tests und PG-Job sind vorhanden (`vitest.config.ts`, `test/error-paths.test.ts`, `verify.yml`); aktueller Laufstatus steht ausschließlich in `docs/current/qualitaet.md` |
| R12 | God-Files als Änderungskosten | offen, **erste Store-Auslagerung umgesetzt** | `store-record-mappers.ts` enthält Asset-, Code-Payload-, Collection- und Entry-Mapper; `store-row-utils.ts` enthält DB-Konvertierungen. `Store`-Operationen sowie `http.ts`, `app.js` und MCP-Tools bleiben zu zerlegen (P3-2). |
| R13 | Arbeitsbaum ungesichert | Vorheriger Folge-Diff ist gesichert; der aktuelle P3-2-Schritt bleibt bis Gate/Commit ungesichert | `git status --short`; aktive Änderungen sind auf Row-Mapper begrenzt |

Zwei Risiken sind **keine** offenen Lücken, sondern bewusste Grenzen, die nicht als Fehler geführt werden:

- **Postgres-Skip ohne `TEST_DATABASE_URL`** ist im normalen lokalen Volltest beabsichtigt (`ADR-0004`); die separate CI-/lokale Pflicht-Lane wird durch `pnpm test:postgres` erzwungen (R11 geschlossen).
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
- **Sektions-Plan wird ausgeführt** (P2-1, R3): `compileRedesign` leitet die Ziel-Section-Writes aus dem bestätigten Plan ab, `rebuildPageTree` baut die Knoten (bestehende Quelle wird am Ort umgeschrieben, eine leere Seite aus dem Plan neu aufgebaut), und `commitRedesignApply` schreibt sie in derselben Transaktion wie Theme und Claim. Kein zweiter, nicht-atomarer Schreibpfad.
- `applyResult` nennt den Umfang ehrlich: `scope: "section-plan"` mit `sectionPlanApplied: true`, wenn der Plan geschrieben wurde und kein Medienbedarf offen ist; sonst `scope: "scaffold-theme"` mit `false`. Beide Felder kommen aus derselben Quelle und können sich nicht widersprechen.
- **Proposal-TTL** (P2-3, R2): `expires_at` (7 Tage) wird bei der Erstellung gesetzt, der Sweep altert unentschiedene Vorschläge zu `expired`, und der Claim prüft die Frist selbst — ein Bestätigungsversuch danach scheitert mit `conflict` und ohne halben Write. Abgelaufene Zeilen werden markiert, nie gelöscht.
- **Design-Record** (P2-4, R4): Publish und Review schreiben je einen eingefrorenen Report (`design_records`) mit dem Stand, auf dem er gemessen wurde. Das Release-Manifest zeigt auf den Record statt neu zu rechnen, ein Content-Re-Bake reicht ihn weiter. Zwei Publishes desselben Stands zeigen denselben Score; ein späterer Draft-Stand macht einen Record *veraltet*, nicht falsch.
- `apply_redesign` bleibt als autonomer Legacy-Weg bestehen und liefert alle routbaren Zielseiten mit `seeded`.
- Site-Theme wird im produktiven Canvas als Theme-Objekt und als `GET /api/sites/:siteId/theme.css` geladen.

Noch nicht vorhanden: **automatische Medienbeschaffung**. Medienbedarfe sind adressierbar und können über `POST /api/redesign-proposals/:id/media-needs` geschlossen werden; `select`/`upload`/`generate` werden nicht automatisch ausgeführt. Der Import-Fehlerpfad kompensiert neu hochgeladene Assets nach fehlgeschlagenem DB-Commit (R10 geschlossen); Datei- und DB-Schreibvorgang bilden weiterhin keine gemeinsame Transaktion.

## Framer-Import S0 bis S9

| Scheibe | Status | Nachweis | Grenze |
|---|---|---|---|
| S0 Messung | belegt | `.scratch/framer-import/befund.md`, Messskripte | Plugin- und Kostenfragen bleiben teilweise offen |
| S1 IR und Normalisierung | implementiert | `framer-import/src/{ir,normalize,mapper,fidelity}.ts` | vollständige Bearbeitbarkeit jedes Knotens nicht flächendeckend belegt |
| S2 Capture und Assets | teilweise | `capture-browser.ts`, `assets.ts`, Browser-Tests | `runImport()` nutzt `fetch()` + `captureHtml()` statt `captureBrowser()` |
| S3 Import und Jobs | belegt | `imports.ts`, `imports-contract.ts`, Import-Routen, `imports.test.ts` | DB-Commit atomar mit Receipts; externe Assets kompensiert |
| S3b Island-Payloads | teilweise | `code-payloads.ts`, Renderer-Tests | Mirror-Quellen und wenige Adapter, nicht generisch |
| S4 Fremdcode | teilweise | Importdialog, Report, Review | generische Extraktion, Poster, Lizenz-Promotion offen |
| S5 Visual Gate | teilweise | `import-visual-gate-browser.test.ts`, `import-fixture-gate-browser.test.ts` | Gate läuft auf den drei echten Export-Fixtures mit Ratchet-Grenzen (Pixeldifferenz, Texthöhe, Links); Tablet wird bei 900 px gemessen, weil Senifys Tablet bei 1023,98 px endet und Framers bei 1199 px; fluffy-rectangle liegt bei Desktop noch bei 67 % Differenz |
| S6 Bibliotheksmodell | belegt | `library.ts`, Bibliotheksrouten, MCP-Tools | mehrstelliger Installations-/Update-Nachweis offen |
| S7 Bibliotheks-UI | teilweise | Bausteine-Workspace, Explorer-Tab | vollständiger menschlicher E2E-Weg offen |
| S8 Motion-Mapping | implementiert | `mapFramerMotion`, Motion-Report, ADR-0006 | eigene Framer-Motion-ADR und vollständiger Coverage-Nachweis offen |
| S9 Erweiterung | geplant | `.scratch/framer-import/plan.md` | Mehrseitenbaum, CMS-Mapping, Localization, Code-Sections |

## Priorisierte offene Arbeit

Verbindlich und priorisiert steht die Liste in **`docs/fahrplan.md`**. Der vorherige Folge-Diff ist gesichert. P3-2 läuft mit der ersten reinen Modul-Auslagerung in `store.ts`; der nächste Schritt beginnt erst nach deren Commit.

Danach verbleiben: die MCP-Verträge und Manifest-Konsumenten (R8), die Modulaufteilung der vier God-Files (R12) sowie die zwei CI-Verbesserungen aus P3-6.

## Bewusst vertagt

- freie Motion-Timeline
- vollständige Sections-Migration zu Visual Components (Nutzerentscheidung 21.09.)
- Localization, E-Commerce, Marketplace, Multiplayer
- Dual-Dialect-Ausstieg aus PostgreSQL bis Phase 5 oder später (ADR-0004)
- Mobile Responsiveness des Portals (Desktop-Werkzeug-Entscheidung 24.09., siehe `.scratch/editor-v2-rebuild/ui-audit-2026-09-24.md`)

## Framer-Import: Stand der Treue (Oktober 2026)

Gemessen auf den drei echten Exporten gegen das Original (Desktop, Tablet, Mobil):

| Bereich | Stand |
|---|---|
| Klassen-CSS | kein 20-KB-Limit mehr; Selektoren werden einmal kompiliert; Pseudo-Zustände (`:hover`) fließen nicht mehr in den Basisstil, sondern werden als Fund gemeldet |
| Geräte-Kopien | identische Kopien werden gefaltet; strukturell verschiedene bleiben und sind pro Gerät sichtbar (Bake schreibt exakte Breitenbereiche) |
| Links, Alt, Anker, Sprache, SEO-Meta | werden übernommen (Frame mit `link`/`anchorId`, `body` mit sanitisiertem Inline-HTML) |
| Regeln | IDs seitenbezogen (`fi-<scope>-n`); ein Re-Import ersetzt die eigenen Regeln der Seite statt sie zu stapeln |
| Schutz | `expectedIrHash` und `baseDraftVersion` verhindern, dass „Übernehmen" etwas anderes schreibt als analysiert wurde; Dry-Run nennt `existingPage` |
| Modus | `mode: "fidelity"` behält Verläufe, Schatten, Rundungen; Standard bleibt `dna` |
| Widget-Engine | `var(--x, …)` in Funktionsargumenten wird nicht mehr zu `var(- - x …)` zerlegt |
| Typografie | Framers `--framer-*`-Variablen werden pro Gerät gegen die Preset-Klassen aufgelöst (Schriftgröße, Farbe, Familie); ein angehobenes Heading übernimmt die Typografie des Headings; `position: fixed/sticky` und `inset` bleiben erhalten |

Offen: Breakpoints der Quelle (Framer 810/1200, Senify 640/1024: zwischen 1024 und 1199 px zeigt das Original das Tablet-Layout, der Import das Desktop-Layout), gemessene Hover- und Scroll-Effekte (die Appear-Effekte sind abgebildet), Erkennung von Navbar/Hero/Footer als Sections, Mehrseiten-Crawl, Theme-Farben, Vorschau mit Screenshots im Dialog, Undo für den Import, Seitensprache beim Backen (kommt aus der Site-Einstellung).
