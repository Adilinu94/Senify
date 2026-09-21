# Bildgenerierung 02 — Jobs, Worker, Provider-Kette, MCP (S2)

Status: resolved
Quelle: `.scratch/bildgenerierung/spec.md` (Scheibe S2), `docs/adr/0008-lokale-bildgenerierung.md`.
Blocked by: 01

## Kontext

Der Default-Provider (image-use) braucht ≈ 1 min, der Fallback (Qwen) 9–45 min — synchrone Aufrufe
scheiden aus. Jobs laufen durable nach dem Muster `bake-worker` (Lease, Attempts, Loop). Dieses
Ticket baut die **Provider-Kette**: image-use zuerst, bei Quota-/Verfügbarkeits-/Refusal-Fehlern
automatisch Qwen; das Ergebnis geht durch die bestehende Media-Pipeline (Dedupe, Variants,
Alt-Text-Pflicht). Der image-use-Provider selbst kommt in Ticket 06 — hier wird die Kette generisch
gebaut und mit einem Test-Provider (Stub) getestet.

## Aufgabe

1. Tabelle `image_jobs` (Postgres, ADR-0004): `id`, `site_id`, `status`
   (`queued|running|succeeded|failed|canceled`), `request` (jsonb inkl. optionalem `provider`),
   `provider_used`, `attempts`, `lease_until`, `provider_job_id`, `asset_id`, `error`
   (jsonb, ein Eintrag je Provider-Versuch), `created_at`, `started_at`, `finished_at`;
   Store-Methoden für Claim/Lease/Finish analog Bake-Jobs.
2. `packages/engine/src/image-worker.ts`: `runImageJobOnce` + `startImageWorker` nach
   `bake-worker.ts` (Lease, Backoff, max. 2 Wiederholungen je Provider); Start in
   `packages/app/src/start.ts`. **Provider-Kette** gemäß Spec:
   - Primär `image.provider` (Default `image-use`), Fallback `image.fallbackProvider` (Default
     `comfyui`); Job-Override `provider` überschreibt den Primär-Provider.
   - Fehlerklassifikation → Fallback-Kategorien: Kontingent/Rate-Limit (→ Fallback + Cooldown),
     nicht verfügbar/nicht eingerichtet (→ Fallback + kurzer Cooldown), „kein Bild trotz gültigem
     Prompt" (→ Fallback, kein Cooldown), Timeout/Stall (ein Retry, dann Fallback), ungültige
     Eingabe (kein Fallback).
   - Cooldown: nach Quota-/Verfügbarkeitsfehler pausiert der Provider für `cooldownMinutes`
     (Default 60); solange wird direkt der Fallback genutzt.
   - Ein Provider-Wechsel zählt nicht als Fehlversuch.
3. Erfolgspfad: `createUploadTicket` + `commitUpload` (`packages/engine/src/media.ts`) mit den
   Metadaten aus `request` (altText, decorative, folderId, tags, filename) → `asset_id` am Job.
4. Routen (Engine):
   - `POST /api/sites/:siteId/images/jobs` (write) → 202 `{ jobId, status, provider }`
   - `GET /api/sites/:siteId/images/jobs` (read, Filter `status`)
   - `GET /api/images/jobs/:jobId` (read, inkl. `providerUsed`)
   - `DELETE /api/images/jobs/:jobId` (write, Cancel nur `queued`)
   Body: `prompt` ODER `referenceId`; `provider?`, `width?`, `height?`, `steps?`, `seed?`,
   `filename?`, `altText?`, `decorative?`, `folderId?`, `tags?`, `idempotencyKey?`.
5. MCP-Tools in `packages/mcp/src/tools.ts`: `generate_image` (write), `get_image_job` (read),
   `list_image_jobs` (read). `generate_image` nicht in `IDEMPOTENT_TOOLS`, nicht in
   `OPEN_WORLD_TOOLS` (`packages/mcp/src/server.ts`).
6. Tests (pg-mem): Lebenszyklus, **Fallback** (Primär-Provider wirft Quota-Fehler → Job über den
   Fallback fertig, `provider_used` korrekt, Cooldown gesetzt), Neustart-Resume über abgelaufene
   Lease ohne Doppel-Submit, kein Provider verfügbar → sauberer Fehler, Alt-Text/Metadaten fließen
   ins Asset.

## Akzeptanz

- End-to-End (mit Stub-Providern): `generate_image` → Job `queued` → Worker → `succeeded` +
  `assetId`; das Asset erscheint in `list_assets`.
- Simulierter Quota-Fehler des Primär-Providers: Job wird über den Fallback fertig, `providerUsed`
  = Fallback, Cooldown gesetzt.
- Engine-Neustart mitten im Job: Job wird wieder aufgenommen (Lease), kein Doppel-Submit.
- Kein Provider verfügbar: `validation`-Fehler mit Hinweis auf die Einstellungen.
- `pnpm verify` grün.

## Referenzen

- `.scratch/bildgenerierung/spec.md` (Provider-Kette, Job-Modell, Routen, MCP-Tools, S2)
- `packages/engine/src/bake-worker.ts`, `packages/engine/src/media.ts`,
  `packages/app/src/start.ts`, `packages/mcp/src/tools.ts`, `packages/mcp/src/server.ts`

## Comments

**Umgesetzt (21.09.2026)** — S2 steht: durable Jobs, Provider-Kette mit Cooldown, Resume, Routen, MCP-Tools.

Gebaut:
- Tabelle `image_jobs` (request/error als jsonb, attempts/max_attempts, lease_until, provider_job_id, asset_id) + `image_provider_cooldowns`; Store: `enqueueImageJob`, `claimImageJob` (ein laufender Job pro Site), `setImageJobProvider`, `completeImageJob` (mit Versuchshistorie), `failImageJob`, `cancelImageJob` (nur queued), `expireImageLeases` (requeue bzw. failed nach max. Attempts), `getImageJob`, `listImageJobs`, `listProviderCooldowns`, `setProviderCooldown`.
- `packages/engine/src/image-worker.ts`: `runImageJobOnce` + `startImageWorker` (Start in `packages/app/src/start.ts`); Lease = Job-Timeout + 5 min. Kette: Primär (`image.provider` oder Job-Override) → Fallback (`image.fallbackProvider`), ein Provider pro Versuch; Quota → Fallback + `cooldownMinutes`, nicht verfügbar → Fallback + 5 min, Refusal/generation → Fallback ohne Cooldown, Timeout → ein Retry beim selben Provider, ungültige Eingabe → Job sofort `failed`. Ein Provider-Wechsel zählt nicht als Fehlversuch.
- **Resume statt Doppel-Submit:** `ImageProvider` hat optionales `resume(providerJobId)`; ComfyUI implementiert es (`/history` + `/view`, Dimensionen aus dem PNG, Seed aus dem Graph). Der Worker ruft es nach Lease-Expiry auf, wenn `provider_job_id` gesetzt ist; scheitert es, läuft die normale Kette. Der ComfyUI-Provider meldet die `prompt_id` per `onJobId`-Callback direkt nach dem Submit.
- Erfolgspfad über `createUploadTicket` + `commitUpload` mit altText/decorative/folderId/tags/filename → `asset_id`.
- Routen: `POST /api/sites/:siteId/images/jobs` (202, idempotent über `withIdempotency`), `GET …/images/jobs` (Filter `status`), `GET /api/images/jobs/:jobId`, `DELETE /api/images/jobs/:jobId` (409 bei nicht-queued). Body: `prompt` ODER `referenceId` (Prompt aus `buildImagePrompt`, ohne Rezept `validation` mit Hinweis auf `get_reference_brief`), `provider?`, Größe/Steps/Seed, Asset-Metadaten. `provider: off` → `validation`.
- MCP: `generate_image` (write), `get_image_job`, `list_image_jobs` (read); nicht in `IDEMPOTENT_TOOLS`/`OPEN_WORLD_TOOLS`.

Nachweise:
- `packages/engine/test/images-jobs.test.ts` (8 Tests, pg-mem): Lebenszyklus inkl. Asset-Metadaten; Liste + Cancel (409 bei running); `off`-Ablehnung; Quota-Fallback mit Cooldown (zweiter Job überspringt den Provider ohne Aufruf); Timeout-Retry beim selben Provider; invalid_input ohne Fallback; kein Provider verfügbar → sauberer `failed` + Cooldown-Einträge; Resume nach Lease-Expiry (`resume` statt `generate`, kein Doppel-Submit).
- `packages/mcp/test/workflow.test.ts`: neuer Test „generates an image: job → worker → asset (S2)“ — `generate_image` → `get_image_job` → Worker-Zyklus (Stub) → `succeeded` + `assetId` → `list_image_jobs` + `list_assets`. Katalogliste um die drei Tools erweitert.
- Engine-Suite: 37 Dateien, 347 Tests grün (2 skipped); MCP-Suite 18 Tests grün; `server.test.ts`/`save-pipeline.test.ts` grün; Typecheck + Lint sauber.
- **Live-End-to-End** (ComfyUI 0.37.0, Seed 44, Provider `comfyui`): `POST …/images/jobs` → 202 `queued` → Worker → **`succeeded` in 127 s**, `providerUsed: comfyui`, `assetId` gesetzt; Asset in der Bibliothek: 512×512, `altText`/`tags` korrekt. Skript: `.scratch/bildgenerierung/smoke-s2.mts`.

Abweichungen/Notizen:
- `completeImageJob` persistiert die Versuchshistorie mit (sonst ginge der Quota-Fallbacks-Eintrag beim Erfolg verloren — im Test aufgefallen und gefixt).
- `Engine` exponiert jetzt `maxUploadBytes` (der Worker braucht es für den Media-Kontext).
