# Research 25 — Emdash Deep-Dive (Learnings für Senify)

> Stand 15.09.2026. Quelle: geklonte Repo `emdash-cms/emdash` (Shallow-Clone), Pfade relativ zu Repos/emdash.
> EmDash-Version im Clone: 0.38.0 (`package.json` root: „Agent-portable reimplementation of WordPress on Astro"), Astro `^7.3.2` (Workspace-Katalog `pnpm-workspace.yaml`), Status „beta preview" (`README.md`).
> Einordnung vorab: EmDash ist ein **klassisches Content-CMS mit SSR**, **kein** Section-/Page-Builder. Die größten Learnings für Senify liegen im **Content-Kern**, im **MCP-/Agenten-Design** und in einzelnen **Lifecycle-Mechaniken** — nicht im Rendering-Modell.

---

## 1. Was Emdash ist (Architektur & Module)

**Grundmodell:** EmDash läuft *innerhalb* des Astro-Projekts. `emdash()` ist eine Astro-Integration, die Admin-UI, REST-API, Auth, Media-Library, MCP-Server und Middleware injiziert (`packages/core/src/astro/integration/index.ts`, Routen unter `/_emdash/*`). Ein Deployment = Astro-App mit eingebettetem CMS. Zielumgebungen: Cloudflare (D1 + R2 + Workers) oder Node + SQLite, optional Postgres; Portabilität über Kysely (SQL) und S3-API (Storage).

**Monorepo-Module** (`README.md` § Repository Structure, `packages/`):

| Modul | Inhalt |
|---|---|
| `packages/core` | Astro-Integration, REST-API (`src/astro/routes/api/**`), Handler (`src/api/handlers/*.ts`), Schema-Registry, Datenbank, Auth-Anbindung, CLI (`src/cli/**`), MCP (`src/mcp/server.ts`), Preview, Media, Search, Plugins, i18n |
| `packages/admin` | Admin-UI als React-SPA (Kumo-Designsystem, TanStack Router + React Query, Lingui) |
| `packages/auth` | Passkey/OAuth/Magic-Link, RBAC (`rbac.ts`), API-Tokens, Invites |
| `packages/cloudflare` | D1/R2/KV-Adapter, Worker-Loader-Sandbox, DO-Preview, Image-Binding-Endpoint |
| `packages/blocks` / `gutenberg-to-portable-text` | Portable-Text-Blöcke, WP-Konverter |
| `packages/plugins/*` | First-party Plugins (forms, audit-log, embeds, webhook-notifier, ai-moderation, …) |
| `apps/*` | Plattform-Dienste für die Plugin-/Theme-Registry (aggregator, labeler, release-service) |
| `templates/*`, `demos/*`, `docs/*` | Starter-Templates, Demo-Sites, Starlight-Doku mit eigenem MCP |

**Laufzeit-Kette:** Middleware: runtime init → setup check → auth → request context (AsyncLocalStorage). Handler-Layer mit `ApiResult<T>` (`{success,data}|{error:{code,message}}`), Routen sind dünne Wrapper (`AGENTS.md` § Architecture). **Schema liegt in der Datenbank**, nicht im Code: `_emdash_collections` + `_emdash_fields` sind Source of Truth; pro Collection wird eine echte SQL-Tabelle `ec_<slug>` mit typisierten Spalten angelegt (`packages/core/src/schema/registry.ts`). 77 Forward-only-Migrationen, statisch registriert (Workers-Bundler-Kompatibilität, `packages/core/src/database/migrations/runner.ts`).

**Kritisch für Senify:** Das DB-first-Schema (DDL zur Laufzeit via `CREATE/ALTER/DROP TABLE`) ist der größte architektonische Gegensatz zu Senifys Code-first-TypeBox-Registry. EmDash zahlt dafür: Typänderungen sind gesperrt („requires a manual content migration", `registry.ts` `updateField`), und Schema-Mutationen hängen an D1-Batch-Limits („Six rows per INSERT keep under D1's 100-parameter limit"). Als *Referenz* lehrreich, als *Vorbild* falsch für Senify.

---

## 2. Content-Modell & Feldsystem

**Collections & Fields** (`packages/core/src/schema/types.ts`): 16 Feldtypen — `string, text, url, number, integer, boolean, datetime, select, multiSelect, portableText, image, file, reference, json, slug, repeater`. Mapping auf 4 Spaltentypen (TEXT/REAL/INTEGER/JSON) via `FIELD_TYPE_TO_COLUMN`. Jede Collection bekommt Standardspalten: `id, slug, status, author_id, primary_byline_id, created_at, updated_at, published_at, scheduled_at, deleted_at, version, live_revision_id, draft_revision_id, locale, translation_group` (`registry.ts` `createContentTable`).

**Collection-Feature-Flags als First-Class-Konzept:** `supports: ["drafts","revisions","preview","scheduling","search","seo"]` steuert Verhalten pro Collection (Defaults `["drafts","revisions"]`). Dazu Präsentations-/Routing-Metadaten: `titleField`, `dateField` (steuern Admin-Listen-Spalten), `urlPattern` (`/{slug}` mit `{slug}`-Compile, `schema/url-pattern.ts`), `routable`, `hidden`, `group`, `admin.listColumns` (max 4), `editLocking`, `comments*`. **Sehr gutes Muster:** Collection-Metadaten, die UI und Rendering speisen, statt sie im Frontend-Code zu duplizieren.

**Relationen:** kein generisches Relationssystem, sondern drei konkrete Kanäle:
- `reference`-Felder + `_emdash_content_references` (Migration 043) für Entry→Entry;
- Taxonomien mit Junction `content_taxonomies` (Migration 051 denormalisiert: `entry_id` = `translation_group`, damit eine Suche über Locales greift);
- Bylines (Autoren-Entität) mit Junction `_emdash_content_bylines`, plus **Byline-Custom-Fields** (`_emdash_byline_fields`, Migration 042) — Site-spezifische Personen-Metadaten ohne Core-Änderung.

**Rich Text = Portable Text (JSON), nicht HTML** (`README.md` „Structured content, not serialized HTML"). Editor TipTap → PT-Konverter in `packages/core/src/content/converters/`. Für Agenten: Markdown↔PT-Konvertierung in `packages/core/src/client/portable-text.ts` (`portableTextToMarkdown`, `markdownToPortableText`, `convertDataForRead/Write`) — MCP- und CLI-Writes akzeptieren Markdown-Strings in `portableText`-Feldern; unbekannte Blöcke überleben als `<!--ec:block {...}-->`-Fences (`templates/blog/.agents/skills/emdash-cli/EDITING-FLOW.md`).

**Versionierung/Drafts** (`packages/core/src/database/migrations/001_initial.ts`, `014_draft_revisions.ts`, `repositories/revision.ts`): `revisions` speichert **JSON-Snapshots** (`collection, entry_id, data`), die Content-Tabelle trägt zwei Pointer `live_revision_id` / `draft_revision_id`. Published-Daten leben in der Content-Tabelle, der Draft im Revision-Snapshot; Publish promotet den Draft. Autosave schreibt mit `skipRevision` direkt den Draft. Prune-Queue (`_emdash_revision_prune_queue`, Migration 059) begrenzt die Historie. **Senify-Konflikt:** Senify hat bereits immutabile Page-Revisionen + Releases — EmDash liefert hier nur das Detail „Draft als Pointer + Snapshot" (deckungsgleich mit Senifys `publishedRevisionId` etc.).

**i18n: Row-per-Locale** (Migration 019, `i18n/config.ts`): jede Zeile hat `locale` + `translation_group` (ULID über alle Übersetzungen), `UNIQUE(slug, locale)`; jede Content-Query muss `locale` filtern („forgetting this is a correctness bug", `AGENTS.md`). Nicht-translatable Felder (`translatable: false`) werden über Locales synchronisiert. Fallback-Kette inkl. Zyklus-Schutz. **Für Senifys v2-i18n sehr brauchbar** (Entscheidung: pro-Sprache-Zeile vs. per-Translation-Group — die Doku stellt genau diese Frage).

**Seeds = deklaratives Schema+Content-Deployment** (`templates/blog/seed/seed.json`, `core/src/seed/`): JSON mit `collections/fields/taxonomies/menus/widgets/sections/content/settings`; CLI `emdash seed`; Bulk-Pfad `createSeedCollection()` erzeugt Tabelle + Felder in einem Batch. Ein Seed ist versionierbar und idempotent (Capture-Fingerprint = SHA-256 der Definition, `registry.ts` `buildSeedCollectionCaptureFingerprint`). **Das ist EmDashs Antwort auf „Agenten erzeugen Schemas"** — und eine der stärksten Übernahmen für Senify (Agenten schreiben Seed-JSON, kein DDL).

**Typgenerierung:** `npx emdash types` generiert `emdash-env.d.ts` mit `interface Post {…}` pro Collection aus dem Live-Schema (Dev-Server-Hook `astro/dev-typegen.ts`, Refresh bei Schema-Mutation). Templates committen die Datei.

---

## 3. Admin-/Editor-UX

**Technik:** React-SPA unter `/_emdash/admin/*`, gemountet via `astro/routes/admin.astro`; TanStack Router (eine `router.tsx` mit allen Routen, `packages/admin/src/router.tsx`), TanStack Query (Caches, Infinite Lists, Mutations), **Kumo** (Cloudflares Designsystem) statt handgerollter Komponenten, Lingui für i18n + strikt RTL-sichere Tailwind-Klassen (`AGENTS.md` § Admin UI). Alle Editor-Strings laufen durch Lingui; Fehlercodes sind stabil und werden clientseitig übersetzt.

**Content-Liste** (`ContentList.tsx` in `packages/admin/src/components/`): Cursor-Pagination (100er-Seiten), Server-Suche (debounced), Status-Filter, Autor-, Datums- und Byline-Filter, sortierbare Spalten (`titleField`/`dateField` aus Collection-Config), Bulk-Aktionen (Publish/Unpublish/Delete als concurrency-limited Queue `lib/bulk.ts` mit Failed-IDs-Retry), Trash-Ansicht mit Restore/Permanent-Delete, Duplicate.

**Content-Editor** (`ContentEditor.tsx`, `PortableTextEditor.tsx` + `components/editor/**`): Full-Bleed-Layout; Autosave (`updateContent … skipRevision:true`) + expliziter Save/Publish; Sidebar mit Status, Bylines, SEO, Publishing-Datum; Repeater-Feld; TipTap-basierter PT-Editor mit Drag-Handle, Block-Menü, Galleries, Code-Blocks inkl. Lowlight, Tabellen, Custom-Plugin-Blöcken, Document-Outline. **Autosave-/Publish-/Unpublish-Requests werden serialisiert** (`serializeEditorSave`, Request-Refs gegen Doppel-Feuern), Konflikte (409) werden über einen Re-Fetch-Flow aufgelöst (`recoverFromSaveConflict`).

**Concurrency-Muster (stark):**
- **`_rev`-Token (opaque)** auf jedem Item: Update/Publish verlangen den letzten Token, sonst `409 CONFLICT` → „read again and retry" (MCP-Doku `docs/src/content/docs/reference/mcp-server.mdx`; CLI verlangt `--rev` hart, `EDITING-FLOW.md`).
- **Entry-Edit-Locks** (`_emdash_entry_edit_locks`, Migration 075, `lib/useEntryLock.ts`, `EntryLockNotice.tsx`): Wer eine Entry öffnet, hält ein Lock; andere sehen eine Notice; Write-Errors werden über `entryLock.reportWriteError` abgefangen. MCP-Writes umgehen das Lock bewusst (dokumentiert!) — nur `_rev` schützt dort.
- Kein Hard-Delete: Delete = Trash (soft), `deleted_at`.

**Visual Editing** (`packages/core/src/visual-editing/editable.ts`, `toolbar.ts`): `{...entry.edit}` / `{...entry.edit.title}` sind Proxy-Objekte, die `data-emdash-ref`-Attribute in Markup streuen (in Produktion noop). Ein injiziertes Toolbar-Script bietet Inline-Text-/Image-Editing, Save-Status, Publish — ohne Build-Änderung am Template. **Elegant und für Senifys „Editor + Preview" später kopierbar** (Muster: Datenattribut-Annotation + separates Toolbar-Script).

---

## 4. Astro-Integration & Preview

**Regel: `output: "server"`, kein SSG für Content.** „All content pages must be server-rendered. No `getStaticPaths()` for CMS content" (`templates/blog/AGENTS.md`). EmDash nutzt **Astro 7 Live Content Collections**: `src/live.config.ts` registriert `defineLiveCollection({ loader: emdashLoader() })`; eine einzige `_emdash`-Collection bedient alle Content-Typen; `getEmDashCollection()` / `getEmDashEntry()` sind Wrapper (`packages/core/src/loader.ts`). Queries laufen pro Request gegen die DB — Änderungen sind sofort live, kein Rebuild („no rebuilds, no separate API", README).

**Query-Layer-Detail (Niveau hoch):**
- Keyset- **und** Offset-Pagination, `cursor`/`offset` als Union-Typ (Kompilierfehler bei beidem, `CollectionFilter`);
- `where`-Filter: Feld-Equality, `IN`, Range-Operatoren, Taxonomie-Slugs, `byline`; Taxonomie-Pfad hat einen Pivot-Driven-Fast-Path (`buildTaxonomyPivotQuery`);
- Folded Hydration: Terms/Bylines/SEO werden als JSON-Subqueries in die Content-Query gefaltet (ein Roundtrip; D1-Spaltenlimit-Argument), Expansion in JS (`stashFolded`, `expandFoldedSeo`);
- `cacheHint` wird an Astros Cache gereicht (`Astro.cache.set(cacheHint)`);
- **Query-Count-Budgets in CI:** `pnpm query-counts` schreibt Snapshots pro Route (`scripts/query-counts.snapshot.{sqlite,d1}.json`), „An increase on a logged-out route is presumed wrong" (`AGENTS.md`). Hart, aber für Senifys Performance-Ziele nachahmenswert (nur auf Plattform-, nicht Site-Seiten).

**Preview (relevant für Senify!)** (`packages/core/src/preview/`):
- HMAC-SHA256-signierte Tokens, Format `base64url(payload).base64url(sig)`, Payload `{cid:"collection:id", exp, iat}`, TTL-Parser (`1h/30m/1d/2w/s`), `generatePreviewToken`/`verifyPreviewToken` (`tokens.ts`);
- Ablauf des Flows: Admin → „View on site" → `POST /_emdash/api/content/{collection}/{id}/preview-url` → URL `…?\_preview=<token>`; Middleware verifiziert, pinnt Token auf ein Entry (Tokens für andere Entries öffnen nichts), `getEmDashEntry()` liefert automatisch Draft + `isPreview: true` (Guide `docs/src/content/docs/guides/preview.mdx`);
- Secret: per-Site in DB generiert, `EMDASH_PREVIEW_SECRET` überschreibt (Env gewinnt); `EMDASH_PREVIEW_PATH_PATTERN` für abweichende Routen; `getPreviewUrl()` für serverseitige Links.
- **Unterschied zu Senify:** EmDash-Previews sind Token-Zugriffe auf den *SSR-Draft*, keine Build-Artefakte. Senifys Entscheidung „echte Draft-Builds mit Token-URL + TTL" ist strenger; übernehmbar ist die Token-Mechanik (HMAC, per-Entry-Bindung, TTL, Middleware-Verify, `{locale}`-Paths).

---

## 5. Media & Assets

**Storage-Abstraktion** (`AGENTS.md`, `packages/core/src/storage/`): Interface `upload/download/delete/exists/list/getSignedUploadUrl`; Adapter Local + S3 (R2/AWS); Zugriff via `emdash.storage`. Upload-Flow: **Signed URLs** (Client lädt direkt zum Storage) → `confirm`-Route → Media-Record (`astro/routes/api/media/[id]/upload.ts`, `confirm.ts`, `upload-url.ts`); dedupe per `content_hash` (xxHash64, Migration 001).

**Media-Modell:** `media`-Tabelle mit `filename, mime_type, size, width/height, alt, caption, storage_key, content_hash`; später Focal Point (Migration 073), Blurhash/Placeholder (Migration 024), Ordner (072), Usage-Index (046+).

**Transforms:** EmDash **wrappt den Astro-Image-Endpoint** (`astro/integration/index.ts` `resolveImageEndpoint`): Medien-URLs (`/_emdash/api/media/file/{key}`) werden erkannt und die Bytes **direkt aus dem Storage** gelesen statt per HTTP (`media/image-endpoint.ts` `matchInternalMediaKey`); Plattform-Transformer (sharp via `astro:assets` bzw. Cloudflare `IMAGES`-Binding) macht die Arbeit; Formate webp/avif/jpeg/png, Qualitätsdefaults (PNG lossless-Ausnahme), Dimension-Cap 4000, long-lived Cache-Header, Sicherheits-Härtung (SVG als Attachment, CSP sandbox).

**Media-Usage-Index (Warnung):** Ein sehr aufwendiges Subsystem — Referenz-Extraktion aus Content-Feldern, Projektionen, Reconciliation, GC, Collection-Deletion-Processing (`packages/core/src/media/usage/*`, ~20 Dateien, Migrationen 046–066). Ein ehrliches Beispiel für **Overengineering durch Skalierung**; Senify braucht für v1 nur: Referenz beim Löschen prüfen + „used in"-Liste.

---

## 6. Sonstiges (Auth, Deployment, AI/MCP)

**Auth** (`packages/auth`): **Passkey-first** (WebAuthn) mit OAuth (GitHub/Google) und Magic-Link-Fallbacks; Rollen Subscriber/Contributor/Author/Editor/Admin; Authorization ist **permission-basiert** (`rbac.ts` `Permissions`-Map ist autoritativ; Routen nutzen `requirePerm`/`requireOwnerPerm` mit Ownership-Awareness, `AGENTS.md` § Authorization); CSRF per Pflicht-Header `X-EmDash-Request: 1`; API-Tokens `ec_pat_*` (gehasht, scopes); Audit-Log (Migration 001, Plugin `audit-log`).

**MCP (das wertvollste Kapitel für Senify)** (`packages/core/src/mcp/server.ts`, ~3.300 Zeilen):
- **Stateless Streamable HTTP** unter `/_emdash/api/mcp` (POST only; GET/DELETE 405), pro Request frischer Server + Transport (`astro/routes/api/mcp.ts`);
- **Auth:** Bearer mit drei Flows — OAuth 2.1 + PKCE (Interactive), OAuth Device Grant (`emdash login`), PATs; **Scopes** (`content:read/write`, `media:*`, `schema:*`, `taxonomies:manage`, `menus:manage`, `settings:*`, `mcp:tools[:pluginId]`, `admin`) und **zusätzlich RBAC-Minimum-Rollen** (Defense-in-Depth: „a scope never grants a permission the user does not have"); OAuth-Discovery via `/.well-known/oauth-protected-resource` + `…/oauth-authorization-server`, 401 mit `WWW-Authenticate`-Discovery-URL (`reference/mcp-server.mdx`);
- ~60 statische Tools in 8 Familien (`content_*` inkl. compare/discard-draft/translations, `schema_*`, `media_*` inkl. `media_upload` per Base64/URL, `taxonomy_*`, `menu_*`, `byline_*`, `revision_*`, `settings_*`, `search`); Plugin-Tools dynamisch als `<pluginId>__<name>` mit eigenem Scope;
- **Agenten-Pädagogik im Schema:** `_rev`-Beschreibung erklärt das Retry-Protokoll direkt im Param-Text (`REV_PARAM_DESCRIPTION`); Fehler als stabile Codes in `[CODE]`-Präfix **und** `_meta.code`; destructive Tools mit `destructiveHint` annotiert;
- **Markdown-Akzeptanz:** `convertWriteData` konvertiert Markdown→PT automatisch, Reads können `markdown`-Flag setzen — Agenten arbeiten in Markdown, das System in PT;
- Locks werden von MCP bewusst ignoriert, dokumentiert („MCP writes do not participate in the admin's entry edit lock").

**CLI** (`packages/core/src/cli/**`): `content/schema/media/menu/taxonomy/seed/types/login/publish/doctor/export-seed/migrate` etc. **Read-before-write erzwungen** (`--rev`), **Auto-Publish-Default** mit `--draft`-Opt-out — begründet exakt für Agenten („designed for agents… read-after-write consistency", `EDITING-FLOW.md`).

**Agent-Onboarding im Template** (starkes Muster): `templates/blog/.agents/skills/` enthält die Skills `building-emdash-site` (mit `references/querying-and-rendering.md`, `schema-and-seed.md`, …), `creating-plugins`, `emdash-cli`; `AGENTS.md` mit Site-Konventionen und Seiten-Tabelle; `.mcp.json` + `.cursor/mcp.json` + `.vscode/mcp.json` zeigen auf `https://docs.emdashcms.com/mcp`; das Repo selbst hat `skills/` (u. a. `wordpress-theme-to-emdash` mit Scaffold — ganze Migrations-Pipeline als Skill).

**Docs-MCP** (`docs/src/worker.ts`): Cloudflare-Worker vor der Starlight-Site; `search_docs`-Tool über **Cloudflare AI Search** (RAG, Chunks mit Source+Score); daneben generiertes `/llms.txt` aus der Starlight-Sidebar (`docs/src/pages/llms.txt.ts`) — **direkt vorbildlich für Senifys Portal-Artefakt 12** (gleiche Mechanik: Sidebar → llms.txt, Docs-MCP, Skills).

**Deployment/Infra:** Cloudflare-Pfad (D1/R2/KV/Worker-Loader; `packages/cloudflare`), Node+SQLite (Templates), Postgres optional (Paritätstests mit echter PG-Instanz!); Plugins sandboxed via **Dynamic Worker Loaders** mit Capability-Manifest (`definePlugin({capabilities})`) oder native; Backups/Export-Routen (`api/settings/backups/*`); Redirects + 404-Tracking; Object-Cache KV/Redis/Memory.

**Kuriose Randnotiz:** `packages/x402` + `docs/…/guides/x402-payments.mdx` (API-Bezahlungen) — zeigt Selbstverständnis „Plattform für Agents", ist für Senify irrelevant.

---

## 7. Übernahme-Tabelle (Bereich | Emdash-Muster | Empfehlung für Senify | Quelle: Dateipfad)

| Bereich | Emdash-Muster | Empfehlung für Senify | Quelle (Dateipfad) |
|---|---|---|---|
| **Content-Kern: Feature-Flags** | `supports[]` pro Collection steuert Drafts/Revisions/Search/SEO/Scheduling | **Übernehmen** (adaptiert): Collection-Config-Flags (`drafts`, `revisions`, `seo`, `preview`) statt impliziter Feature-Annahmen; steuert MCP-Tools, Editor-UI und Validierung | `packages/core/src/schema/types.ts` |
| Content-Kern: Listen-/Routing-Metadaten | `titleField`, `dateField`, `urlPattern` (`{slug}`-Compile), `routable`, `listColumns` | **Übernehmen**: Entry-Templates + URL-Ableitung + Admin-Listen-Spalten aus der Collection-Definition speisen — genau Senifys Entry-Template-Bedarf | `packages/core/src/schema/registry.ts`, `schema/url-pattern.ts` |
| Content-Kern: Concurrency | `_rev`-Token (opaque, read-before-write, 409 + Retry-Anleitung) | **Übernehmen (Priorität hoch)**: identisch zu Senifys MCP-Tool-Katalog; Token pro Entry, im Tool-Schema erklärt; Basis für Approval-Queue-Integration | `packages/core/src/mcp/server.ts` (`REV_PARAM_DESCRIPTION`), `docs/…/reference/mcp-server.mdx` |
| Content-Kern: Entry-Locks | `_emdash_entry_edit_locks` + Notice; MCP umgeht Lock bewusst | **Übernehmen (vereinfacht)**: optimistisches Locking ist bei Senify bereits entschieden; Lock-Notice-Muster und „MCP-Writes + _rev"-Regel dokumentieren | Migration `075_entry_edit_locks.ts`, `packages/admin/src/lib/useEntryLock.ts` |
| Content-Kern: Revisionen | `revisions`-JSON-Snapshots + `draft_/live_revision_id`-Pointer, Prune-Queue | **Teilweise**: Senify hat Revisionen/Releases; übernehmen: getrennte Pointer (Draft vs. Published) + automatischer Prune mit Queue (statt unbegrenzter Historie) | `packages/core/src/database/repositories/revision.ts`, Migration 059 |
| Content-Kern: Seeds | Deklaratives `seed.json` (Collections/Felder/Taxonomien/Menüs/Content), idempotent per Fingerprint; `createSeedCollection`-Bulk | **Übernehmen (Priorität hoch)**: Agenten deklarieren Entries/Collections als versionierbares JSON; Idempotenz + Dry-Run für MCP `apply_mutations`; Schema-Seeds müssen in Senify jedoch Code-Registry-Erweiterung bleiben (nicht DB-DDL) | `templates/blog/seed/seed.json`, `core/src/schema/registry.ts` (`createSeedCollection`) |
| Content-Kern: Feldtypen | 16 Typen inkl. `repeater`, `reference`, `slug`, `multiSelect`; Presence/Validation-Metadaten pro Feld | **Adaptiert**: Feld-Katalog als Vorlage für Senifys Entry-Feldsystem prüfen (mind. string/text/number/bool/datetime/select/image/file/reference/list); `repeater` mit Sub-Feld-Whitelist ist ein gutes Guardrail gegen Schema-Wildwuchs | `packages/core/src/schema/types.ts` (`RepeaterSubField`) |
| Content-Kern: i18n | Row-per-locale + `translation_group`; nicht-translatable sync; Fallback-Kette mit Zyklenschutz | **Übernehmen als Blaupause für v2-i18n** (nicht v1): Entscheidungsfrage pro Feld „per-locale oder per-group" explizit stellen — genau Senifys offene i18n-Frage | Migration `019_i18n.ts`, `packages/core/src/i18n/config.ts` |
| Content-Kern: Typgenerierung | `npx emdash types` erzeugt TS-Typen aus Live-Schema; Dev-Hook regeneriert | **Übernehmen (später)**: aus Senifys Registry generierte TS-Typen + Docs-Referenz aus einer Quelle — passt zu Artefakt 11/12 („nie auseinanderlaufen") | `packages/core/src/astro/dev-typegen.ts`, `templates/blog/emdash-env.d.ts` |
| **Astro-Renderer** | Live Content Collections + Loader, SSR, `cacheHint`, kein Rebuild | **Nicht übernehmen** (kollidiert mit Senifys SSG-Bake); übernehmen: separater Query-Layer mit Keyset-Pagination + typisierten Filtern für Senifys Build-Time-Queries | `packages/core/src/loader.ts`, `templates/blog/src/live.config.ts` |
| Renderer: Query-Budgets | Query-Count-Snapshots pro Route in CI, Regressionen sichtbar | **Übernehmen (knapp)**: Budget-Check für Senifys MCP-/Preview-Endpunkte; als CI-Artefakt statt Doku | `scripts/query-counts.mjs`, `AGENTS.md` § Performance |
| Renderer: Preview | HMAC-Token (`_preview`), per-Entry gebunden, TTL, Middleware-Verify, `isPreview`-Flag, `getPreviewUrl` mit `{locale}`-Paths | **Übernehmen (Mechanik)**: Senify hat Draft-Build-URLs + TTL entschieden — Signatur/Per-Entry-Bindung/TTL-Parser als konkrete Umsetzung übernehmen; `isPreview`-Banner-Konvention für Sites | `packages/core/src/preview/tokens.ts`, `urls.ts`, `docs/…/guides/preview.mdx` |
| Renderer: Visual Editing | Proxy-`{...entry.edit}` → `data-emdash-ref`; injizierte Toolbar für Inline-Edits | **Vormerken (nicht v1)**: Wenn Senify je Inline-Editing auf Build-Previews anbietet, ist das Proxy-Attribut + Toolbar-Script das leichteste Muster (kein Renderer-Eingriff) | `packages/core/src/visual-editing/editable.ts`, `toolbar.ts` |
| Renderer: Markdown-Brücke | Markdown↔Portable-Text an der Agent-Grenze; Opaque-Fences für Custom-Blöcke | **Übernehmen**: Senify akzeptiert Markdown in `richtext`-Props an der MCP-Grenze und rendert als Runs; für unbekannte Blöcke nicht PT, sondern Fehler/Verwerfen (Sektionen sind geschlossen) | `packages/core/src/client/portable-text.ts`, `EDITING-FLOW.md` |
| **Editor/Workspace** | Autosave (skipRevision) + explizites Save/Publish; serialisierte Requests; 409-Recovery | **Übernehmen**: exakt das Verhalten, das Senifys Puck-Editor + Approval-Flow braucht (Agent schreibt Draft, Mensch publish) | `packages/admin/src/router.tsx` (`serializeEditorSave`, `recoverFromSaveConflict`) |
| Editor: Listen-UX | Cursor-Pagination, Server-Suche, Filterleiste, Bulk-Aktionen mit Failed-ID-Retry, Trash + Restore | **Übernehmen (Auswahl)**: Bulk-Queue mit Teilfehler-Handling + Trash-Semantik (kein Hard-Delete) als Standard | `packages/admin/src/components/ContentList.tsx`, `lib/bulk.ts` |
| Editor: UI-Prinzipien | Striktes Designsystem (Kumo) statt Utility-Chaos; stabile Fehlercodes → lokalisierte Messages; Command Palette; ConfirmDialog | **Adaptiert**: Für Senify (Puck + eigenes Token-System) nur die Prinzipien: keine Ad-hoc-Buttons, Fehlercodes stabil, Dialoge als Komponenten | `packages/admin/src/components/Shell.tsx`, `AGENTS.md` § Kumo |
| Editor: Entry-Locks-Anzeige | Lock-Notice + Write-Error-Report im Editor | **Übernehmen**: sichtbarer „Agent bearbeitet gerade"-Zustand für die Approval-/Agent-Workflows | `components/EntryLockNotice.tsx` |
| **Deploy/Hosting** | Migrations-Policy (forward-only, immutable published, expand/contract), statisch registrierte Migrationen | **Übernehmen (Policy)**: Senifys Postgres-Migrationen brauchen dieselbe Disziplin (immutable, expand/contract, sichtbar im Review) | `AGENTS.md` § Migrations, `database/migrations/runner.ts` |
| Deploy: Default-Storage | `local()` mit `baseUrl /_emdash/api/media/file` als Dev-Default | Übernehmen als Dev-Default-Muster (Senify: Assets EU/S3; lokal = simpler Pfad-Proxy) | `astro/integration/index.ts` (`DEFAULT_STORAGE`) |
| **AI/MCP: Tool-Design** | Stateless HTTP-Endpoint; Scopes × Rollen; stabile Fehlercodes in `[CODE]` + `_meta.code`; `destructiveHint`; Markdown↔PT; Plugin-Tools namespaced | **Übernehmen (Priorität hoch)**: Senifys Tool-Katalog (Artefakt 10) ergänzen um `_meta`-Codes, destructive-Annotationen und die „Retry-Protokoll"-Beschreibungen in den Schemas | `packages/core/src/mcp/server.ts`, `astro/routes/api/mcp.ts` |
| AI/MCP: Auth | OAuth 2.1 + PKCE, Device Grant, PATs; Discovery-Endpoints; 401 mit `WWW-Authenticate` | **Übernehmen (Remote-Phase)**: Senify startet stdio/local; für den späteren Remote-MCP ist das EmDash-Modell (Scopes ∩ Rolle) die Referenz | `docs/…/reference/mcp-server.mdx`, `packages/core/src/auth/api-tokens.ts` |
| AI/MCP: CLI-Ergonomie | `--rev` Pflicht, Auto-Publish-Default, `--draft`, klare Fehlermeldungen | **Übernehmen**: Senify-CLI analog (Agenten brauchen Read-after-Write-Konsistenz ohne Lifecycle-Buchhaltung) | `EDITING-FLOW.md`, `packages/core/src/cli/commands/content.ts` |
| AI/MCP: Docs-MCP | Worker + AI Search (`search_docs`), `llms.txt` aus Sidebar generiert, `.mcp.json` in Templates | **Übernehmen (Portal v0, Artefakt 12)**: identisches Zielbild; llms.txt aus Sidebar-Konfiguration + Docs-MCP mit Quelle/Score; `read_docs` ist als Ergänzung sinnvoll (EmDash hat nur Suche) | `docs/src/worker.ts`, `docs/src/pages/llms.txt.ts` |
| AI/Agenten-Onboarding | Skills + `AGENTS.md` + MCP-Configs **im Template**; Knowledge-Router mit `references/*` | **Übernehmen (Artefakt 11)**: Senifys `senify`-Skillpaket exakt so strukturieren (SKILL.md + references/, Configs für Claude/Cursor/VSCode) | `templates/blog/.agents/skills/**`, `templates/blog/AGENTS.md` |
| Auth/RBAC | Permission-Map autoritativ, `requirePerm`/`requireOwnerPerm`, Audit-Log | **Nicht nötig für v1** (Single-Operator); aber Permission-Map-Form als saubere Struktur, falls Senify je Rollen bekommt | `packages/auth/src/rbac.ts` |
| Media: Signed-Upload-Flow | Signed Upload-URL → direkt zum Storage → `confirm` → Record; Dedupe per Hash | **Übernehmen**: passt zu EU-S3-Storage; Dedupe + „ensure metadata" via confirm | `astro/routes/api/media/*`, `packages/core/src/storage/` |
| Media: Transform | Astro-Image-Endpoint-Wrap mit Storage-Bytes statt HTTP; Formate/Qualität/Cap zentral validiert | **Übernehmen (Ideen)**: Senify baut srcset zur Build-Zeit; die Validierungsregeln (Formate, `MAX_TRANSFORM_DIMENSION`, Qualitätsdefaults, PNG-Ausnahme) sind direkte Vorlagen | `packages/core/src/media/image-endpoint.ts` |
| Media: Usage-Index | Vollständiger Referenz-Graph mit Reconciliation/GC | **Nicht übernehmen** (v1): nur „Asset löschen mit Usage-Check + Used-in-Liste"; das Subsystem ist ein Lehrbeispiel für Overengineering | `packages/core/src/media/usage/**` |
| **Nicht-Kern: WP-Migration, Plugins, Sandbox, Marketplace, Apps** | WXR-Import, Plugin-Sandbox, Registry, Release-Service | **Nicht übernehmen** — außerhalb Senifys v1-Scope (siehe § 8) | `packages/gutenberg-to-portable-text`, `packages/plugins/*`, `apps/*` |

---

## 8. Nicht übernehmen (und warum)

1. **DB-first-Schema mit Laufzeit-DDL** (`_emdash_collections` → `ec_*`-Tabellen per `ALTER TABLE`).
   Warum nicht: Senifys Schema-System (TypeBox-Registry, artefakt 01) ist bewusst Code-first und versioniert; DDL zur Laufzeit macht Migrationen/Nebenwirkungen zur Laufzeit-Frage, verhindert saubere Schema-Diffs und koppelt Feldtypen an SQL-Speicherung (EmDash verbietet deshalb in-place-Typwechsel). Senify: Schema-Erweiterungen nur über Registry-Code + additive Deployments; Entries in JSONB.
2. **SSR-Pflicht + Live Queries.** EmDashs Grundannahme („content pages must be server-rendered") widerspricht Senifys Kernentscheidung „vollstatischer Bake pro Release". Live-Queries ersetzen Astros Stärke (0-KB-Baseline, CDN, immutables). Senify behält Bake + atomaren Swap; nur die Preview-Token-Mechanik wird geliehen.
3. **Portable Text als alleiniges Rich-Text-System.** Mächtig (Custom Blocks, Agent-Konvertierung), aber Senifys Sektionen sind geschlossene Komponenten mit typisierten Props — ein PT-Blockbaum als zweites, offenes Vokabular innerhalb von Props erzeugt genau die Freiheitsgrade, die Senify vermeiden will. Empfehlung: Senifys `richtext`-Runs + Markdown-Grenze genügen; PT höchstens als Import-Format.
4. **Media-Usage-Index-Subsystem** (`media/usage/*`): ~20 Dateien, 8+ Migrationen, Work-Queues, Reconciliation für einen Use Case, den v1 nicht braucht. Kleiner Usage-Check reicht.
5. **Plugin-System, Sandbox (Dynamic Worker Loader), Capability-Manifeste, Marketplace/Registry, Release-Service-Apps.** Senify v1 ist ein internes Werkzeug ohne Drittentwickler; das ist EmDashs größter Komplexitätsblock (inkl. `apps/*`).
6. **Cloudflare-Spezifika als Architektur-Zentrum** (D1-Bind-Parameter-Limits, `CROSS JOIN`-Pinning in SQLite, Worker-Loader, DO-Preview). Senify = Postgres + EU-VPS; Dialekt-Workarounds nicht nachahmen.
7. **WordPress-Migrationsmaschinerie** (WXR-Parser, Gutenberg-Konverter, Import-Wizard, WP-Plugin-Portier-Skills). Für Senify bewusst out of scope (nur evtl. v2-Import-Kandidat).
8. **Kumo/TanStack/Lingui als konkrete Frontend-Abhängigkeiten.** Senify nutzt Puck (eigener Editor-Stack); Design kauft man bei Puck-Radix/shadcn ein. Muster (strikte Designsystem-Disziplin, Command Palette, Query-Caching) übernehmen — Packages nicht.
9. **76+ Migrationen als Organisationsform.** EmDash sammelt jede Änderung als eigene Nummer in einem flachen Ordner mit statischer Registrierung. Für Senify reicht ein schlankes, klar benanntes Migrationsregime (forward-only + expand/contract als Regel übernehmen, nicht die Datei-Flut).
10. **„Auto-Publish"-Default der CLI ungeprüft übernehmen.** Er ist für EmDashs Server-SSR sinnvoll (Read-after-write), kollidiert aber mit Senifys „Agent Draft → Mensch publiziert"-Guardrail. Übernehmen: Read-before-write (`_rev`) und `--draft`-Opt-out-Semantik, **nicht** das Auto-Publish.

---

## Kernaussagen für Senify in drei Sätzen

EmDash beweist, dass ein agenten-taugliches CMS **Convention-Over-Configuration im Agenten-Interface** braucht: `_rev`-Tokens, stabile Fehlercodes, Markdown-Brücken, CLI-Ergonomie und MCP-Scopes sind übertragbar und größtenteils sofort baubar. Der Content-Kern (Collections mit Feature-Flags, Titel-/Datums-Feld als Listen-Metadaten, URL-Patterns, Seed-JSON, i18n-Modell, Revision-Pointer) liefert Senify ein erprobtes Vokabular — während das Speichermodell (DB-first-DDL, SSR, PT) bewusst abzulehnen ist. Für Portal/Skills ist EmDash das nächstliegende Vorbild: `llms.txt` aus der Sidebar, Docs-MCP mit Quelle/Score, Skills + MCP-Configs direkt im Template.
