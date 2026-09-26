# Aktuelle Architektur

> Dieses Dokument beschreibt den **Ist-Zustand** des Arbeitsbaums, nicht den Zielzustand.
> Zielarchitektur und Reihenfolge: `docs/fahrplan.md`. Umsetzungsstand: `docs/current/stand.md`.
> Die Risiko-Nummern `R1`–`R13` sind mit `docs/current/stand.md` und `docs/fahrplan.md` identisch.

## Seams

| Seam | Was er leistet | Datei |
|---|---|---|
| `EditorDocument` | internes Editor-Dokument (v2-Tree mit Geräte-Suffixen, `states`, `motion`, `classes`) | `packages/editor/src/state/document.ts` |
| `NodeTree` | Persistenz- und Bake-Vertrag | `packages/section-sdk/src/types.ts` |
| `editor-bridge` | Adapter zwischen beiden Modellen, keine zweite Fachwahrheit | `packages/engine/src/mutations/editor-bridge.ts` |
| `Store` | kapselt PostgreSQL-Schreibpfade, Transaktionen, Revisionen | `packages/engine/src/store.ts` |
| `Renderer` | erzeugt aus NodeTree, Theme, Styles und Assets eine statische Site | `packages/renderer/src/bake.ts` |
| MCP-Fassade | delegiert an Engine-Routen, kein zweiter Fachschreibpfad | `packages/mcp/src/tools.ts` |

**Bekannte Spannung (R5):** `NodeTree` ist die einzige Persistenzwahrheit, aber zwei Editor-Oberflächen rendern darauf — der Canvas (`editor/src/canvas/`) und der Legacy-Editor (`editor/src/mount.ts`, 3260 Zeilen, weiter in `editor/src/index.ts:4` exportiert und in `app.js:6385` gerufen). `?view=editor` ist der einzige erreichbare Einstieg.

## Referenz-Redesign

```text
Referenzbibliothek
→ plan_redesign (read-only)
→ create_redesign_proposal (Direction Cards + Sektions-Plan serverseitig abgeleitet)
→ menschliche Direction Decision (POST /api/redesign-proposals/:id/confirm, operatorOnly)
→ compileRedesign()  (liest, rechnet, vergibt jede Kennung vorab)
→ commitRedesignApply() / Store.applyRedesignPlan()  (eine Transaktion)
→ Draft mit bestätigtem Theme und Scaffold (scope "scaffold-theme")
→ Sektions-Plan über get_page/get_section/apply_mutations umsetzen   ← heute Handarbeit (R3)
→ get_design_report/diff_reference/create_preview
→ submit_for_review/get_review_feedback
```

### Was der Apply atomar schreibt (ADR-0014, belegt)

`Store.applyRedesignPlan()` (`store.ts:1758`) führt in genau einer Transaktion aus:

1. Proposal-Claim mit `FOR UPDATE` (`status = 'applying'`, `decision`), Ablehnung wenn nicht `proposed` (`store.ts:1806-1826`).
2. Anlage der Zielsite und ihrer eigenen Theme-Zeile aus dem Plan.
3. Seed der Startseite, sofern der Plan eine vorsieht.
4. Die kopierten Seiten samt Drafts in der Zielsite.
5. `themeWrite` und `pageWrites` gegen die erwarteten Versionen.
6. Audit-Einträge und den Proposal-Abschluss.

Der Commit ist bewusst kontrollflussfrei: jede Verzweigung und jede Kennung ist im Compile entschieden. Deshalb gibt es keinen dauerhaften `applying`-Zustand mehr — ein Absturz rollt Entscheidung und Effekte gemeinsam zurück, der Proposal bleibt `proposed` und ist erneut bestätigbar.

Dateien liegen aus demselben Grund **vor** der Transaktion und werden bei einem Commit-Fehler über die im Plan bekannten Speicherpfade kompensiert (ADR-0014 §5): ein Rollback kann keine Datei löschen, eine Zeile ohne Datei wäre schlimmer als eine verwaiste Datei (der Bake überspringt sie still).

### Asset-Kopie und Site-Guard (ADR-0014, belegt)

- `copySiteAssets()` (`media.ts:777`) vergibt **neue** Asset-IDs und **neue** Speicherpfade, kopiert Ordner, Bildleiter, Blurhash und Datei-Historie und schreibt die Draft-Verweise um.
- `purgeAsset()` nimmt `siteId` als Pflichtargument (`media.ts:917`); `updateAsset` und die Lese-Route sind site-scoped.
- `rewriteAssetIds` ersetzt nur **bekannte** Zuordnungen; unbekannte Verweise bleiben stehen, damit `broken-asset` ehrlich meldet statt zu verlieren.
- Acht Routen liegen unter `/api/sites/:siteId/assets/…`; ein Ordner-`DELETE` ebenso. **Ausnahme mit Absicht:** `getAsset` bleibt ungeprüft, weil der Sektions-Plan die Zugehörigkeit selbst auswertet.

### Toter Pfad nach ADR-0014

`Store.claimRedesignProposal()` (`store.ts:4797`) hat keinen Aufrufer mehr (`rg` über `packages/` → nur die Definition). `Store.finalizeRedesignProposal()` (`store.ts:4830`) wird nur im Fehlerpfad von `runConfirmedApply()` benutzt, wenn der Plan selbst nicht einmal aufgestellt werden konnte. Beide sind Kandidaten für eine spätere Bereinigung, **kein** Sicherheits- oder Datenproblem.

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

- `runImport()` verwendet bei URLs `fetch()` und `captureHtml()`; `captureBrowser()` existiert und ist getestet, aber nicht der normale URL-Orchestrator.
- Payloads werden im Hauptpfad nur für Mirror-Quellen extrahiert.
- Der Import-Commit liefert bei gleichem Inhalt einen Receipt und verhindert doppelte DB-Schreibvorgänge auch mit neuem Idempotency-Key.
- **Assets liegen außerhalb der DB-Transaktion (R10):** neu erzeugte Uploads werden bei einem fehlgeschlagenen Commit kompensiert, bereits vorhandene nicht.

## Schreibpfade

| Pfad | Transaktionales Verhalten | Beleg |
|---|---|---|
| Page-Draft | `baseDraftVersion`, 409 bei Konflikt | `store.ts` `persistBatch` |
| Draft + Revision + Audit | **eine** Transaktion | `persistBatch`, `transactions.test.ts` |
| Style-Registry | Row-Lock + `style_rules_version` + `baseVersion` → 409 | `store.ts:2624-2657`, `style-rules.test.ts:87` |
| Redesign-Apply | **eine** Transaktion (Claim + Effekte) | `store.ts:1758`, ADR-0014 |
| Import (DB) | atomar mit Receipt | `imports.ts`, `imports.test.ts` |
| Import (Dateien) | außerhalb der Transaktion (R10) | ADR-0014 §5 |
| **Idempotency** | **Lücke (R6)** | `http.ts:517-533` |

### Die Idempotency-Lücke im Detail (R6)

```ts
try {
  const result = await run();                          // hat bereits geschrieben
  await completeIdempotencyKey({ ... });               // http.ts:518
  return result;
} catch (error) {
  await releaseIdempotencyKey({ ... });                // http.ts:529 — DELETE
  throw error;
}
```

`completeIdempotencyKey` läuft **innerhalb** des `try`. Scheitert nur diese Zeile (Verbindungsabbruch, DB-Fehler) nach erfolgreichem `run()`, greift der `catch`, ruft `releaseIdempotencyKey()` — ein `DELETE` (`store.ts:3857-3861`) — und **löscht den Claim, obwohl die fachliche Änderung bereits geschrieben ist**. Ein Retry mit demselben Key erzeugt dann ein zweites Entity.

Der bestehende Test `idempotency.test.ts:269` prüft den umgekehrten Fall (Fehler **in** `run()` → Key freigegeben). Genau dieser Testfall ist die Ursache der Lücke, nicht seine Lösung. Der Umbauplan §2.3 hat das Szenario beschrieben; die Umsetzung ist R6 im Fahrplan.

## Releases

- `page_revisions` speichert Tree, Titel und Pfad; Metadaten, Template und Layout-ID sind **nicht** als vollständiger Snapshot enthalten.
- `releases` speichert `pageRevisions`, `themeSnapshot`, Manifest und Build-Referenz.
- `ReleaseManifest` trägt heute genau: `styleRules`, `rendererVersion`, `buildHash`, `capturedAt`, `siteDate`, optional `rebakedFrom`/`restoredFrom` (`types.ts:170-182`). **Es fehlen (R7):** Content-, Asset-, Payload- und Template-Snapshot.
- Finalisierte Releases werden gegen Build- und Manifest-Mutationen geschützt; ein Content-Re-Bake erzeugt ein neues Release und verändert den bisherigen Datensatz nicht.
- Der Aktivzeiger darf zwischen Releases wechseln; ältere Build-Verzeichnisse bleiben erhalten.

## Island-Payloads

- `site_code_payloads` liegt neben dem NodeTree.
- Der Canvas führt Payloads nicht aus, Preview und Release schon.
- Bake-Dateien liegen unter `assets/payloads/`.
- Budgets und Integrität stehen in `packages/engine/src/guardrails.ts`; Begründung in `docs/adr/0010-island-payload-fuer-importierten-fremd-code.md`.
- Fremdcode mit unbekannter Lizenz darf laut ADR-0010 nicht in die globale Bibliothek promotet werden.

## Bündelung und Auslieferung (R1)

| Artefakt | Heute | Beleg |
|---|---|---|
| Editor-Bundle | bei Bedarf per **esbuild** gebündelt, `format: esm`, `write: false`, nicht minifiziert | `app/src/server.ts:34-51` |
| Shell `app.js` | handgeschrieben, ungebündelt, per `<script type="module">` geladen | `app/public/app.js` (6669 Z.), `index.html:94` |
| `pnpm build` | `tsc -p tsconfig.json` mit `noEmit: true` → **kein Artefakt** | `package.json:14`, `tsconfig.json:19` |
| Paritäts-Tor | bäckt über `publishRelease` und liest `/api/releases/:id/files/…` — echter Release-Pfad, aber aus dem Arbeitsbaum | `scripts/verify-parity.mjs`, `release-cutover-browser.test.ts:245` |

Daraus folgt die präzise Aussage: Das Paritäts-Tor prüft einen **echten** Release aus **ungebündeltem** Quellcode. Es beweist nicht, dass ein Produktionsartefakt entsteht — weil keins entsteht.

## Bekannte Übergänge (Risiko-Register)

| Nr. | Übergang | Zustand | Beleg |
|---|---|---|---|
| R1 | Quelle → Artefakt | nicht vorhanden | `package.json:14`, `tsconfig.json:19` |
| R2 | Proposal → Aufräumen | fehlt (kein `expires_at`) | `db.ts:248-259` |
| R3 | Sektions-Plan → NodeTree | Handarbeit | `sectionPlanApplied: false` |
| R4 | Design-Report → Draft/Review/Release | flüchtig | `lifecycle.ts:269`, `:633` |
| R5 | Legacy-Editor → Canvas | zwei Pfade | `editor/src/index.ts:4`, `app.js:6385` |
| R6 | Write → Idempotency-Abschluss | Lücke | `http.ts:517-533` |
| R7 | Release → vollständiger Snapshot | unvollständig | `types.ts:170-182` |
| R8 | MCP-Tool → Client-Schema | fehlt | 0 `outputSchema` |
| R9 | Style-Registry → Klassen-Rename | fehlt | `style-rules.test.ts` |
| R10 | Import → Dateien | außerhalb der Tx | ADR-0014 §5 |
| R11 | Nachweis → CI | fehlt (PG, Coverage) | `verify.yml`, `vitest.config.ts` |
| R12 | Änderung → Datei | God-Files | Zeilenzahlen in `stand.md` |
| R13 | Arbeitsbaum → Commit | 230 Dateien offen | `git status --short` |
