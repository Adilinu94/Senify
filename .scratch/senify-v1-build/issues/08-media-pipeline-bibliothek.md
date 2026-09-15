# 08: Media-Pipeline & Bibliothek

**What to build:** Medien von Upload bis Auslieferung: signierter Upload direkt zum EU-Storage, Validierung (Typ-Allowlist, Größe, Alt-Pflicht mit Dekorativ-Ausnahme), Hash-Dedupe, feine Varianten-Ladder (64 · 320 · 640 · 1024 · 1600 · 2048 · Intrinsic; kein Upscaling; AVIF + WebP + Original) mit automatischem `sizes`-Resolver aus der Sektions-Layoutmathematik, Blurhash + Aspect-Reservierung, Focal-Point-Crops. Bibliothek mit Ordner-Baum, Tags, vier Smart-Listen (Ohne Alt-Text · Ohne Tags · Große Dateien · Zuletzt ersetzt), Replace File unter gleicher ID/URL (Historie + Restore), Papierkorb, Bulk-Bearbeitung. Media-Tools (`upload_asset`, `update_asset`, `replace_asset`, `delete_asset`, `restore_asset`, `list_assets`) mit `write`-Scope; gelöschte Assets markieren `assetRef`s als „broken".

**Blocked by:** 05 (Renderer & Bake — srcset im Bake), 06 (MCP-Kern & Agent-Setup — Tools/Audit).

**Status:** Teil 1 umgesetzt (Media-Kern; `pnpm verify` grün, 219 Tests) — Bild-Varianten-Ladder, Blurhash und `<picture>`/`srcset` folgen als Teil 2 (sharp), siehe Umsetzungs-Notiz

- [x] Upload → Asset-Record (Original-Auflösung, Maße aus dem Datei-Header); Dedupe per SHA-256; signierter Client-Upload (HMAC-Ticket, 15 min TTL)
- [~] Bake liefert referenzierte Assets unter `/assets/<assetId>/<filename>` aus (Cache-Busting per `?v=`); `<picture>`/`srcset`/`sizes` + Blurhash + Aspect-Reservierung folgen mit der Varianten-Ladder (Teil 2)
- [x] Replace File erhält ID/URL (Verwendungen bleiben gültig), Metadaten bleiben, Historie + Restore; Cache-Busting per Query-Version (CDN-Invalidierung folgt mit T14)
- [x] Bibliothek: Ordner-Baum (Löschen → Kinder/Assets nach „Ohne Ordner"), Tags, vier Smart-Listen, Suche/Filter/Sortierung (UI folgt mit T12)
- [x] Bulk-Bearbeitung (Alt-Texte, Tags, Ordner, Trash/Purge) mit Ergebnisbericht inkl. Fehler-IDs
- [x] Alt-Pflicht-Hard-Check greift (Dekorativ-Ausnahme dokumentiert); getrashte/unbekannte Assets → hard „broken"-Fehler an Referenzen
- [x] Alle Media-Tools (`upload_asset`, `update_asset`, `list_assets`, `replace_asset`, `delete_asset`, `restore_asset`) mit `write`-Scope; Prüfstelle-1-Tests decken die Verträge

Quellen: `artifacts/15`, `artifacts/25`, Spec „Media" (Verträge aus 15/25), `research/26` (Signed-Upload-Muster).

## Handoff für die ausführende Session (Stand 15.09.2026)

**Auftrag:** Media-Kern umsetzen: Assets-Upload (signiert, lokal), Dedupe, Bibliothek (Ordner/Tags/Smart-Listen), Replace mit Historie, Papierkorb, Bulk-Bearbeitung, Media-Tools, Referenz-Check. **Kein Commit** — die übergreifende Session committet nach Review.

**Anlaufpunkte:** `AGENTS.md`, `CONTEXT.md`, `artifacts/15` (Media), `artifacts/25` (Erweiterung), `research/26` (Signed-Upload), Spec „Media". Muster im Code: `packages/engine/src/store.ts` (Store-Methoden + Row-Mapper), `packages/engine/src/http.ts` (Routen mit `scope`/`destructive`/`public`), `packages/engine/src/lifecycle-contract.ts` (Body-Schemas), `packages/engine/src/checks.ts` (Check-Pipeline), `packages/engine/test/lifecycle.test.ts` (Testmuster inkl. `bootEngine` mit `dataDir`), `packages/mcp/src/tools.ts` (Tool-Katalog), `packages/mcp/test/workflow.test.ts`.

**Ist-Stand:** T01–T07 sind committet (`pnpm verify` grün, 204 Tests). Der Engine-Store kennt Sites/Pages/Mutations/Theme/Tokens/Lifecycle (Releases, Previews, Reviews); der Bake läuft über `bakePages` in `<dataDir>/previews|releases/<id>`; `dataDir` kommt aus `EngineOptions.dataDir` (Tests: Temp-Verzeichnis).

**Umsetzung (Vorschlag, Reihenfolge):**
1. **Storage-Modul** `packages/engine/src/storage.ts`: Dateien unter `<dataDir>/assets/<siteId>/<assetId>/<dateiname>`, `history/` für ersetzte Dateien; Funktionen `assetDir`, `writeAssetFile`, `removeAssetDir`, `resolveStoredFile` (Traversal-Schutz wie `resolvePreviewFile`).
2. **Schema** (`db.ts`): `assets` (id, site_id, filename, mime, kind, byte_size, width, height, hash, alt_text, decorative, folder_id, tags jsonb, storage_ref, status ready|trashed, replaced_by?, created_at, updated_at, trashed_at), `asset_folders` (id, site_id, name, parent_id, created_at), `asset_history` (id, asset_id, storage_ref, mime, byte_size, created_at).
3. **Upload signiert (lokal):** `POST /api/sites/:siteId/assets/upload-url` (write) → `{ uploadId, url, expiresAt }`; `PUT /api/assets/upload/:uploadId` (public-by-token wie Preview-Dateien, Token als Query-Param) nimmt die Rohbytes, prüft Typ-Allowlist (image/*, video/mp4, application/pdf) und Größenlimit (Default 25 MB), schreibt die Datei, legt den Asset-Record an — **Dedupe per SHA-256** (gleicher Hash + Site → vorhandenes Asset zurückgeben, kein zweiter Record). PNG/JPEG/WebP/GIF-Größen aus dem Header lesen reicht (kein sharp nötig).
4. **Bibliothek:** `GET /api/sites/:siteId/assets` mit Filtern `folder` (id|none), `tag`, `alt=missing`, `q`, `sort`; `GET /api/assets/:assetId`; `PATCH /api/assets/:assetId` (altText, decorative, folderId, tags); Ordner-CRUD (`POST/GET /api/sites/:siteId/asset-folders`, `DELETE /api/asset-folders/:id` → Kinder wandern nach „Ohne Ordner"); vier Smart-Listen als Query-Flags (`alt=missing`, `tag=none`, `minBytes=…`, `sort=replacedAt`).
5. **Replace + Historie:** Upload-URL mit `replaceAssetId` → neue Datei nach `history/` verschieben, neue Datei aktiv, `asset_history`-Eintrag, ID/URL bleiben gleich; `GET /api/assets/:assetId/history`; `POST /api/assets/:assetId/restore-history/:historyId` (write).
6. **Trash/Purge/Bulk:** `DELETE /api/assets/:assetId` → Status `trashed` (Dateien bleiben); `POST /api/assets/:assetId/purge` (publish, destruktiv) → Dateien + Record weg; `POST /api/sites/:siteId/assets/bulk` mit `{ ids, patch?, trash?, purge? }` → Ergebnisbericht `{ updated, failed: [{ id, reason }] }`.
7. **Referenz-Check:** `checks.ts` erweitern: `assetRef { assetId }` in Props, die auf unbekannte oder getrashte Assets zeigen → **hard** (Submit/Publish) mit Suggestion. Dafür `runChecks` eine `assetStatus: Map<string, "ready" | "trashed" | "missing">` mitgeben (Aufrufer laden die Assets der Site).
8. **MCP-Tools** (`packages/mcp/src/tools.ts`): `upload_asset` (lokaler `filePath`, liest die Datei, signierter Upload), `update_asset`, `list_assets`, `replace_asset`, `delete_asset`, `restore_asset` — `write`-Scope außer Purge; Tool-Liste in `workflow.test.ts` anpassen.
9. **Tests:** `packages/engine/test/media.test.ts` (Upload+Dedupe, Allowlist/Größenlimit, Ordner/Tags/Smart-Listen, Replace+Historie+Restore, Trash/Purge, Bulk mit Ergebnisbericht, Asset-Check blockt Submit) und einen MCP-Fall in `workflow.test.ts` (upload → update → list), Tool-Zählung anpassen.

**Randbedingungen:** Deutsch mit englischen Fachbegriffen; keine Kompromiss-Hacks, keine ungenutzten Exporte, Kommentare sparsam; `pnpm verify` muss grün sein; Bild-Varianten-Ladder, Blurhash und `<picture>`/`srcset` im Bake sind **nicht** Teil dieses Schritts (eigener Folgeschritt mit sharp/Playwright-Infrastruktur) — im Ticket-Kommentar dokumentieren, nicht halb bauen.

## Umsetzungs-Notiz (ausführende Session T08)

**Umgesetzt:** Storage-Modul (`<dataDir>/assets/<siteId>/<assetId>/`, ersetzte Dateien unter `history/<historyId>/`), Schema `assets` / `asset_folders` / `asset_history`, signierter Upload (stateless HMAC-Ticket über `POST /api/sites/:siteId/assets/upload-url` + `PUT /api/assets/upload/:uploadId?token=`), Dedupe per SHA-256, Bibliothek (Ordner-Baum, Tags, vier Smart-Listen, Suche/Filter/Sortierung), Replace File mit Historie + Restore, Papierkorb + Purge + Bulk mit Ergebnisbericht, Asset-Referenz-Hard-Check („broken" bei getrashten oder unbekannten Assets, Dekorativ-Ausnahme bei der Alt-Pflicht), sechs Media-Tools mit `write`-Scope und Auslieferung (öffentliche Datei-Route + Asset-Kopie in den Bake).

**Bewusst NICHT in diesem Schritt** (eigener Folgeschritt mit sharp/Playwright-Infrastruktur):
- **Bild-Varianten-Ladder** (64 · 320 · 640 · 1024 · 1600 · 2048 · Intrinsic, kein Upscaling) in AVIF + WebP,
- **Blurhash** samt Aspect-Ratio-Reservierung,
- **`<picture>` / `srcset` / `sizes`-Resolver** im Bake.

Der Bake liefert deshalb (noch) das Original in genau einer Auflösung unter `/assets/<assetId>/<filename>` aus; die Ladder/AVIF/WebP ersetzen später nur diesen einen Datei-Verweis. Die Asset-Verträge bleiben dafür kompatibel (Hash, Maße, MIME, Replace-Historie liegen schon vor).

**Abweichungen vom Handoff (bewusst):**
- `assets.replaced_by` entfällt: Replace läuft unter gleicher ID/URL, ein Zeiger hätte keinen Produzenten. Stattdessen `assets.replaced_at` als Wahrheit für die Smart-Liste „Zuletzt ersetzt".
- Das Upload-Ticket ist **stateless** HMAC-signiert (wie eine echte Presigned-URL) statt als DB-Session — kein zusätzliches Tabellen-Handling, kurze TTL.
- `runChecks` erhält `assets: Map<id, { status, decorative }>` statt nur `Map<id, "ready"|"trashed"|"missing">`; der Dekorativ-Flag ist die dokumentierte Ausnahme der Alt-Pflicht.
- Zusätzliche Routen, die der Handoff offen ließ: `GET /assets/:assetId/:filename` (öffentliche Auslieferung, spiegelt den Bake-Pfad) und `POST /api/assets/:assetId/restore` (Un-Trash für `restore_asset`).
