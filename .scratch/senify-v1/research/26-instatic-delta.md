# Research 26 — Instatic Delta (Code-Details jenseits von Research 23)

> Stand 15.09.2026. Quelle: geklonte Repo `corebunch/instatic` (Shallow-Clone), Pfade relativ zu `Repos/instatic`. Abgrenzung: Ergänzt `research/23` (keine Wiederholungen) — Fokus: Code-Ebene von Content-Editor, Entry-Versionen, MCP/Live-Bridge, Bake-Pipeline, Relationen/Bindings, Loops, Forms.

---

## 1. Content-Workspace & Entry-Editor (Code)

### 1.1 Shell & Panel-Wiring
- Drei-Pane-Shell über `AdminWorkspaceCanvasLayout`: `ContentSidebar` (Explorer/Media/Agent) · `ContentDocumentCanvas` · `ContentSettingsPanel`. Besonderheit: Ist kein Entry selektiert, ist `contentRightPanel` `undefined` — das Layout interpretiert „absent" als „kein rechtes Panel" und reserviert **keinen leeren Rail**. Reopen über Notch `data-testid="content-settings-notch"` (`src/admin/layouts/AdminWorkspaceCanvasLayout/`, `docs/features/content-workspace.md:116-124`).
- Settings-Panel lädt generische Custom-Feld-Editoren **lazy** (`React.lazy(() => import('./ContentCustomFields'))`), weil der Cell-Editor-Graph (Media-Picker, Relation-Picker) zu schwer für das Initial-Chunk-Budget ist (`src/admin/pages/content/components/ContentSettingsPanel/ContentSettingsPanel.tsx:30-32`).

### 1.2 Tiptap-Body: Implementierungsdetails
- **Ein** ProseMirror-Dokument, kein Block-Array. Editor besitzt seinen State; nach außen geht nur die Markdown-Projektion über `onChange` (`src/admin/pages/content/TiptapBodyEditor.tsx:1-15`).
- Extension-Setup (`TiptapBodyEditor.tsx:126-231`):
  - `StarterKit` mit `heading.levels: [2,3,4]` — H1 ist für den Titel reserviert; Link `openOnClick:false`, `autolink`, `linkOnPaste`.
  - `Placeholder` (`showOnlyCurrent: true`), `Table` (resizable) + Row/Header/Cell, `TextAlign` (`defaultAlignment: null`). **Wichtig:** Text-Ausrichtung ist „session-only" — Markdown hat keine Alignment-Syntax, sie resettet beim Speichern/Reload (Kommentar `:152-168`).
  - Eigene Nodes `MediaNode` (Attrs `mediaType|src|alt`, gerendert als `<img>`/`<video>`) und `MediaUploadPlaceholder` (Paste/Drop-Upload mit Abbrechen-Button) (`src/admin/pages/content/nodes/MediaNode.ts:3-82`).
  - `SlashCommand` (char `/`, `startOfLine:false`, `allowSpaces:false`) mit externen Aktionen `media` + `dataToken` über Ref statt Re-Registrierung; Bubble-Menu, Floating-Menu, MediaNodeToolbar.
- **Inbound-Sync-Guard:** `lastSyncedMarkdownRef` + `setContent(..., { emitUpdate:false })` verhindert Caret-Verlust bei Parent-Re-Renders; `readOnly`-Sync und `focusSignal`-Handoff (Titel-Enter → Body) (`TiptapBodyEditor.tsx:237-272`).
- Imperatives Handle: `focusStart` / `insertText` / `insertMedia` (ersetzt selektiertes Media-Node) / `appendBlock` (`:274-299`).

### 1.3 Markdown als kanonisches Format
- `src/core/markdown/markdownDocument.ts` (748 Zeilen): custom `marked`-Tokenizer für `@[video](url)` (`:54-72`), Bilder allein auf einer Zeile werden zu Block-`media`-Nodes promoviert (`:165-189`), Serializer-Regeln `:527-531` (`video → @[video](src)`), Heading-Clamp auf 2–4 (`:678`), Mark-Reihenfolge `['link','underline','code','bold','italic','strike']` (`:613`), `firstMediaPathFromMarkdown` (`:737-746`).
- Konsequenz für Senify: Ein „Content-Body"-Feld braucht genau **ein** kanonisches Serialisierungsformat (hier Markdown) + Round-Trip-Funktionen + Importer-Oberfläche; der Editor bleibt State-Owner.

### 1.4 Custom-Felder im Content-Panel
- `ContentCustomFields.tsx` rendert `CellEditorRenderer` mit `context="detail"` — **derselbe** Renderer wie das Data-Workspace-Grid; Dispatcher pro Feldtyp (`src/admin/pages/data/components/DataGrid/cells/CellEditorRenderer.tsx:55-101`).
- Ausgeschlossen vom generischen Editor: `pageTree` (enthält ganzen NodeTree) und `fieldSchema` (enthält Feld-Array) (`ContentSettingsPanel.tsx:101-103`).
- Relationen: `RelationPickerDialog`; Anzeige-Auflösung über `useRelationTargetRows` — lädt die Rows **jeder distinkten** Ziel-Tabelle genau einmal (sortierter Key über Target-Tabellen), danach synchrone `resolveRow`-Lookups; Fetch-Fehler sind non-fatal (Fallback: rohe ID) (`src/admin/pages/content/hooks/useRelationTargetRows.ts`).
- Panel-Reihenfolge: Collection (Move) → Slug → SEO (nur wenn Collection Feld hat: `dataTableHasField`) → Status → Public URL → Author (nur mit `canEditAnyContent`) → Featured Media (nur wenn Feld existiert) → Custom-Felder. Status-Optionen matrixen Permissions (Draft nur mit `canEditEntry`, Published nur mit `canPublishHere` **und ohne Branch**); `scheduled` ist nur über Dialog setzbar (`ContentSettingsPanel.tsx:140-247`).

### 1.5 Draft-State & Save-Maschine
- `useContentEntryDraft.ts`: lokale Felder `title/slug/seoTitle/seoDescription/featuredMediaId/body/customCells`; `isDirty` per Feldvergleich + `JSON.stringify(customCells)`. `saveDraft()` merged `...selectedEntry.cells, ...customCells` + normalisierte Built-ins (`slugFromTitle`), ruft `saveCmsDataRowDraft`. `handlePublish` = saveDraft → `publishCmsDataRow`; `handleStatusChange('published')` delegiert an Publish, `scheduled` wird defensiv abgelehnt (`src/admin/pages/content/hooks/useContentEntryDraft.ts`).
- Save-Fehler-States zentralisiert: `runEntryOp` (Permission-Gate → Phase `pending` → `apply` → `done`; `rethrow` für dialoggetriebene Aufrufer) (`src/admin/pages/content/utils/entryOp.ts`).
- Built-in/Custom-Trennung: `stripPostTypeBuiltInCells` liest Custom-Zellen aus `cells` (`src/core/data/cells.ts:167-177`).

### 1.6 Live-Modus (Draft-Preview im echten Template)
- `LiveCanvas.tsx`: **sandboxed iframe**; `POST /admin/api/cms/data/rows/:id/preview` mit Draft-Cells liefert HTML → `iframe.srcdoc`; nach Load wird eine **frische Tiptap-Instanz direkt im `iframe.contentDocument`** auf dem Marker `[data-instatic-content-region]` gemountet; Inline-Editor-CSS wird injiziert. Floating-Menus rendern außerhalb des Iframes und übersetzen Koordinaten über floating-ui-Virtual-Reference (`src/admin/pages/content/components/LiveCanvas/LiveCanvas.tsx:1-40, 300-370`).
- Refetch-Debounce 350 ms nur für Titel/SEO/Featured — Body-Änderungen lösen **keinen** Iframe-Reload aus (Body wird in-place editiert); Titel-/SEO-Änderungen zerstören und remounten den Iframe-Editor (`LiveCanvas.tsx:26-40, 316-345`).
- Server-Endpoint `server/handlers/cms/data/preview.ts`: nur `kind:'postType'`; merged `row.cells` + gepostete Draft-Cells; `resolveTemplateChain(entry)` + `composeTemplateChain`; synthetischer `PublishedDataRow`; `entryStack:[publishedDataRowToLoopItem(...)]`; Loop-/Media-Prefetch; `buildSiteCssBundle` + `publishPage` + `buildPublishedSiteModuleJsMap` + `applyPublishedHtmlPipeline`; `cache-control: no-store`. SEO-Override nur über `documentMeta` (`readEntrySeoOverride`) — `page.title` bleibt der Titel-Binding-Wert.

---

## 2. Entry-Versionen & Draft/Publish (Code)

### 2.1 Version-Write (Row-Publish)
`server/repositories/data/publish.ts::persistDataRowPublish` — eine Transaktion:
1. Row laden; vorherige Route über `data_rows.active_version_id → data_row_versions` lesen.
2. `nextDataRowVersionNumber` = `max(version_number)+1` (ANSI `coalesce(max(...),0)+1`, einzige Heimat des Invariants: `server/repositories/data/versions.ts:17-24`).
3. `INSERT data_row_versions (id,row_id,version_number,cells_json,slug,published_by_user_id)`.
4. `UPDATE data_rows SET status='published', active_version_id, published_at, …`.
5. **Slug-Redirect:** Wenn die vorherige Route abweicht → `INSERT data_row_redirects … ON CONFLICT (from_route_base, from_slug) DO UPDATE` (`:184-198`).
- `published_by_user_id` ist nullable → geplante Publishes (System-Actor) laufen sauber durch.

### 2.2 Orchestrierung (Layer A/B für Row)
`server/publish/publishRow.ts`:
- Erst `runPublishFlush()` — **flusht den Yjs/Collab-Relay**, damit der Publish exakt den Stand backt, den Editoren sehen (Debounce-Fenster!).
- Dann `withPublishLock(...)` (ISS-038: kein Überlappen von read-version → bake → bump).
- Layer A: Artefakt in **aktiven Slot** mit `getPublishVersion()+1` schreiben (Hole-Shells müssen die Version tragen, die der Bump gleich setzt); bei Slug-Wechsel altes Artefakt löschen. Disk-Fehler werden **geloggt, nicht fatal** (abgeleiteter State).
- Danach `bumpPublishVersion()` (Layer B invalidiert lazy).
- Retraktion: `PATCH /status` (draft|unpublished) entfernt Artefakt + `bumpPublishVersionSerialized()` (`server/handlers/cms/data/rows.ts:348-375`). Scheduled: `scheduleDataRowPublish`/`cancelScheduledPublish`, Tick in `server/publish/publishScheduler.ts` (Fehler → zurück auf `draft`).

### 2.3 Versions-API
- `GET /rows/:id/versions` → `listDataRowVersions` (Publisher-Join, neueste zuerst) (`server/repositories/data/versions.ts:52-76`).
- `POST /rows/:id/versions/:versionId/restore` → kopiert Version-Cells **in den Draft** (`saveDataRowDraft`), nichts wird veröffentlicht; Slug-Kollision → 409; Audit `version.restore` (`server/handlers/cms/data/rows.ts:481-540`).

### 2.4 Versionen für Pages (Full-Publish) — anderes Modell!
- Full-Publish schreibt `site_snapshots` **einmal** (mit `content_hash`) und pro Page eine `data_row_versions`-Row, die per `site_snapshot_id` auf den geteilten Snapshot zeigt und nur `runtime_assets_json` (page-scoped) trägt (`server/repositories/publish.ts:222-281`; Kommentar `:5-8`).
- `getDraftPublishStatus` leitet „draft ahead?" aus dem Join `data_rows.active_version_id → data_row_versions → site_snapshots.content_hash` ab (`server/repositories/publish.ts:170-191`).
- Konsequenz: Zwei Versions-Granularitäten — **Rows** snapshotten sich selbst (per-Row-Publish), **Pages** snapshotten den ganzen Site-Dokument-Stand (Full-Publish).

---

## 3. MCP-Server & Live-Bridge (Code)

### 3.1 Transport & Auth
- Endpoint `/_instatic/mcp` = **Streamable HTTP** über `@modelcontextprotocol/server` v2 (`createMcpHandler`), Web-Standards nativ, **stateless per Request**; Legacy-Initialize-Clients laufen über `legacy:'stateless'`. POST-Body-Cap **68 MiB** (inline base64-Media) über `readTextBodyWithLimit` + `parsedBody`-Replay (kein doppelter SDK-Read) (`server/ai/mcp/transports/http.ts`).
- Origin-Validierung gegen DNS-Rebinding über die bestehende `originAllowed`-Policy; 401 trägt `WWW-Authenticate: Bearer resource_metadata="…", scope="mcp"` (RFC 9728) (`server/ai/mcp/auth.ts:42-54`).
- Bearer-Auflösung: OAuth-Access-Token (`imcp_at_…`) → `findOAuthAccessGrant` (**resource-gebunden**), sonst PAT → `findConnectionByTokenHash(sha256)`; `last_used_at` best-effort (`auth.ts`).

### 3.2 OAuth-Stack („kein OAuth 2.1-Handbuch nötig"-Vorlage)
- **DCR**: `POST /_instatic/oauth/register` — Public Clients (kein Secret); `token_endpoint_auth_method: none`; redirect_uris nur HTTPS oder HTTP auf Loopback (`server/ai/mcp/oauth/handler.ts:86-140`).
- **Token**: form-encoded only; Authorization-Header verboten (public clients); `resource` muss exakt matchen; Code-TTL **5 min**, Access-Token **1 h**, Refresh **rotiert** — Reuse eines rotierten Refresh-Tokens wird als Credential-Theft gewertet und **widerruft den ganzen Grant** (`server/ai/mcp/oauth/store.ts:16-17, 206-260`).
- **Grant-TTL 90 Tage** (`OAUTH_GRANT_TTL_DAYS` in `server/ai/mcp/connectors/store.ts:18`); Scope-Set nur `mcp` + `offline_access` (`oauth/protocol.ts:11-46`); PKCE S256, Verifier-Validierung + SHA-256-Challenge.
- PATs: Präfixe `imcp_pat_|imcp_ac_|imcp_at_|imcp_rt_`, 32 Bytes Base64URL, nur Hashes persistiert (`connectors/token.ts`). Erstellung: Capability `ai.providers.manage` + **Subset-Check** (`capabilitiesUserCannotGrant`) + **Step-Up** (`handlers/management.ts:71-115`); Expiry 1–3650 Tage oder explizit nie.
- Doku/Endpunkt-Liste inkl. Consent-Screen `/admin/ai/oauth/authorize` (Admin-Session + Capability-Floor + Step-Up): `docs/features/mcp-connectors.md:43-77`.

### 3.3 Tool-Modell & Live-Bridge (Browser-Tools)
- Zwei Executionsklassen (`server/ai/mcp/registry.ts`): **server-resolved** (laufen ohne Editor) vs. **browser** (werden an den offenen Workspace des Connector-Owners relayed). Registry mischt MCP-spezifische Headless-Tools **vor** die Site-Toolset-Liste, damit sie Namens-Duplikate gewinnen (z. B. `site_list_documents` headless statt Snapshot-Variante); `site_list_tokens` ist exkludiert.
- Capability-Filter nutzt **denselben Gate** wie der eingebaute Agent (`toolAllowedForCapabilities`).
- Zählung in `server/ai/tools/`: **38 Tools mit `execution:'browser'`, 13 mit `execution:'server'`** (Site+Content-Write/Read) plus MCP-Sondertools in `server/ai/mcp/tools/`.
- `tools/list` hängt an jede Browser-Tool-Beschreibung die Voraussetzung an („Requires the … workspace to be open … cannot run headlessly") — damit das Modell die Bedingung **beim Tool-Pick** erfährt, nicht erst durch einen Fehlversuch (`server/ai/mcp/server.ts:43-69`).
- **Bridge-Server** (`server/ai/mcp/editorBridge.ts`): ein Bridge-Eintrag pro `(userId, scope)`; NDJSON über `text/event-stream` (Proxy-Flush); Heartbeat-Bytes alle 25 s; **Idle-Lease 120 s**, re-armiert bei jedem Tool-Traffic (aktiv nie gekappt, nur Orphans recyceln); neueste Instanz gewinnt; Callback liefert `bridgeId` + `toolRequest{requestId,toolName,input}`.
- **Bridge-Client** (`src/admin/ai/useMcpWorkspaceBridge.ts`): Mount nur wenn Workspace wirklich ready (`enabled`), sonst meldet die Presence-Schicht fälschlich „connected". Reconnect-Loop: 3 s transient, 15 s bei Auth-Fehler, **0 s** wenn der Stream ≥30 s lebte (idle-Lease-Recycle); `visibilitychange` kürzt Wartezeit in Background-Tabs ab. Ergebnis-POST an `/admin/api/ai/tool-result` mit `bridgeId`+`requestId`. Timeout pro Browser-Call: **90 s** (`server/ai/runtime/transport.ts:44`).
- **Content-Bridge** validiert Inputs **doppelt**: Server advertised TypeBox-Schemas, Browser prüft erneut per TypeBox bevor Live-Draft mutiert wird (Defence in depth) (`src/admin/pages/content/agent/contentBridge.ts:1-30`). Body wird als Markdown ausgetauscht und browser-seitig in/aus Tiptap konvertiert.
- **Row-Autorisierung vor dem Relay**: `server/ai/mcp/contentAuthorization.ts` prüft `own|any`-Capabilities pro Dokument **serverseitig, bevor** der Call den Browser erreicht — der (stärkere) Admin-Cookie des Owners darf die delegierte Token-Berechtigung nicht erweitern.
- **Warum kein Headless-Tree-Write (Doku + Code):** „There is deliberately no headless DB-mutating page-tree tool — that created a second surface with identical node ids that desynced from the open editor and got clobbered by its autosave" (`server/ai/mcp/registry.ts:14-17`); „The open editor store is the single source of truth for draft edits; a second DB mutation path would desynchronize node state and overwrite the live document" (`docs/features/mcp-connectors.md:158`). Headless Reads + `site_publish` **flushen den Collab-Relay vorher** → kein stale-Fenster.
- `site_publish` ist ein **server-executed** Tool mit `requiredCapabilities:['pages.publish']`, ruft `publishDraftSite` und schreibt ein Audit-Event mit `source:'mcp'` + `connectorId` (`server/ai/mcp/tools/publishTool.ts`).
- Orientierung: `get_context` (headless) meldet Bridge-Presence (`siteConnected`/`contentConnected`), Templates (target/priority) und ob eine Entry von `everywhere`-Templates umschlossen wird (`server/ai/mcp/tools/contextTool.ts`).

---

## 4. Publisher/Bake-Pipeline (3 Layer, Code-Ebene)

### 4.1 Layer A — Disk-Bake mit Pointer-Swap
- `server/publish/staticArtefact.ts`: zwei Slot-Verzeichnisse + **Pointer-Datei `current`** (plain file mit Slot-Namen; bewusst **symlink-frei** für unprivilegierte Windows-User; liest zusätzlich legacy Symlinks). `writeArtefact` = tmp + rename (atomar pro Datei). `swapSlot` schreibt `current.tmp` und benennt sie atomar um → in-flight Reader behalten fds in den ALTEN Slot.
- Pfad-Sicherheit: `resolveArtefactPath` (URL-Decode, `..`-Reject, Containment-Check nach `path.join`).
- Full-Publish (`server/publish/publishSite.ts`): Phase 1 = teure Arbeit **außerhalb** der Transaktion (Dependency-Cache/`bun install`, Importmap, esbuild-Runtime-Builds — SQLite serialisiert sonst alle Transaktionen); Phase 2 = kurze Transaktion (`persistSitePublish`); Phase 3 = Bake: erst **404-Artefakt** (damit eine echte Seite `404` es überschreiben kann und autoritativ bleibt), dann alle Pages, dann **alle Row-Routen** (`bakeDataRows.ts` — sonst stranden Row-Artefakte beim Slot-Swap), CSS-Bundles + Runtime-Assets; dann `swapSlot`; dann `bumpPublishVersion()`. Per-Page/Run try/catch: Fehler fallen auf den Live-Renderer durch.
- Hole-Shells werden mit `getPublishVersion()+1` gestempelt, weil der Bump die synchrone Folgeanweisung nach dem Swap ist.

### 4.2 Layer B — LRU
- `server/publish/renderCache.ts`: Key `urlPath\0queryString(canonical)`; Cap 1000 (`RENDER_CACHE_MAX_ENTRIES`); Versions-Tag pro Entry; **Version wird bei Render-Start gecaptured** — ein Publish, der mitten im Render landet, verwirft das Ergebnis statt es als aktuell zu cachen; single-flight pro Key; `peek()` als Vor-Route-Resolution-Fastpath (warm = null DB-Arbeit).
- `publishState.ts`: `publishVersion` (monoton), `withPublishLock` (Promise-Chain-Serializer), `createVersionedSingleFlight` (generalisierter versions-gekeyter Memo für Snapshot/CSS-JS-Memos, ein Reset-Hook für Tests). `bumpPublishVersionSerialized()` NIE innerhalb offener Transaktion (Deadlock-Gefahr mit dem Publish-Lock).

### 4.3 Layer C — Hole-Runtime
- `server/publish/holeRuntime.ts`: IIFE ~1,1 KB; `IntersectionObserver` rootMargin 200 px; **beobachtet das Placeholder-Kind**, nicht `<instatic-hole>` selbst (`display:contents` → kein Layout-Box → Observer würde nie feuern); Swap via `el.outerHTML = html` (kein morphdom); Fetch-Fehler still (Skeleton bleibt). URL `/_instatic/hole/<nodeId>?v=<publishVersion>&u=<page-url>`; `v`-Mismatch → Sentinel statt stale HTML; `u` speist Route-Frame + Loop-Pagination-Key.
- Auto-Klassifikation: `src/core/publisher/dynamicDetection.ts` — eine Predicate (`classifyNode`) für alle Regeln (Module-Flag, request-dependent Bindings `route.query.*`, Token in String-Props, Loop-Quellen `requestDependent`/`perVisitor`, **Rule 3.5** static-loop-body-promotion, Rule 4 VC-Ref-Boundary).
- `canonicalRenderQuery` (`server/publish/loopPrefetch.ts:194-201`): behält nur `loop_<nodeId>_page` (sortiert); Junk-Params kollabieren zu `''` → Layer-A-Fastpath. Nur dann ist der Disk-Hit erlaubt.

### 4.4 Draft-Previews — drei getrennte Wege
1. **Editor-Preview:** `POST /admin/api/cms/runtime/preview` mit dem **Draft-Site-Dokument im Body** (auch unsaved Edits); `buildRuntimePreviewDocument` mit per-Frame-AssetBase `/_instatic/preview/runtime/`; Loop-Prefetch liest Branch-Rows (`server/handlers/cms/runtime.ts:193-250`).
2. **Content-Live:** `handleRowPreview` (siehe 1.6) — Draft-Cells, echtes Template, gleiche Pipeline, `no-store`.
3. **Branch-Preview-Links:** `server/branches/previewLinks.ts` — 24-Byte-Token, **gehasht** gespeichert; `/_instatic/preview/<token>` validiert, setzt HttpOnly-Cookie (30 Tage), Redirect auf Root; jede öffentliche GET mit Cookie rendert den Branch-Draft (`server/publish/branchPreview.ts`: Inline-CSS, Loops vom Branch, On-Demand-Runtime-Bundles, **keine Publish-Hooks**, `no-store` + `noindex`, Banner); `/_instatic/preview/exit` räumt auf. Widerruf/Deletion invalidiert, weil das Cookie nur den Token trägt, keinen eigenen Grant.
- Published-Snapshot-Memo: `server/publish/publishedSnapshotCache.ts` — versions-gekeyter Memo, geteilt zwischen Public-Router-Row-Resolution, Hole- und Loop-Endpoint.

---

## 5. Relationen, Repeater, pageTree, Entry-Templates/Bindings (Code)

### 5.1 Datenmodell der Feldtypen (cells)
- `relation` single: `rowId|null` · multi: `string[]`; `repeater`: geordnete `{id, cells}[]`; `pageTree`: `NodeTree<PageNode>`; `fieldSchema`: `DataField[]` (`src/core/data/schemas.ts:83-263`).
- Repeater ist **eine Ebene**: `RepeaterItemFieldSchema` schließt `repeater|pageTree|fieldSchema` aus (Relationen sind erlaubt) (`schemas.ts:206-238`); Items haben stabile IDs → deterministische Reorder-/Duplicate-Operationen.
- Repeater-Editor (`src/admin/pages/data/components/DataGrid/cells/RepeaterCell.tsx`): Add/Remove + **Move-Up/Down-Buttons** (kein DnD), Expand/Collapse mit Item-Summary, `commitItems` schreibt kompletten Array-Wert; Media-Sonderfall `MediaRepeaterGallery`.
- `pageTree`-Zelle im Grid: `PageTreeCell.tsx` rendert nur einen „Open editor →"-Button; `readOnly` gated ihn **bewusst nicht** (readOnly heißt „nicht inline editierbar"; Navigation in den Editor erzwingt eigene Permissions) (`PageTreeCell.tsx:4-17`).

### 5.2 Entry-Templates & Row↔Page-Mapping
- `pages`-Systemtabelle speichert Template-Config in drei Zellen: `templateEnabled` (bool), `templateTarget` (JSON), `templatePriority` (number); Mapping tolerant über `parsePageTemplate` (ungültig → Template wird still verworfen) (`src/core/data/pageFromRow.ts:90-97`, `src/core/page-tree/pageTemplate.ts`).
- Targets: `{kind:'everywhere'} | {kind:'postTypes', tableSlugs[≥1]} | {kind:'notFound'}`; Priority absteigend, Dokument-Order als Tiebreak; `LEVELS=['everywhere','postTypes']` — der Resolver ist level-agnostisch, neue Breadth-Ebene = ein Konstanten-Eintrag (`src/core/templates/templateMatching.ts:47-98`).
- **Composer** (`src/core/templates/templateCompose.ts`):
  - Templates **ohne `base.outlet`** werden gefiltert (kein Fehler — unfertiges Template zählt nicht).
  - Splice von innen nach außen; Node-IDs werden re-keyed: Terminal-Page `c0_`, äußere Templates `t<i>_` → gerenderte `uid` liest `t0_c0_<id>`; `composedNodeSourceId()` mappt zurück (für Merge-Review-Highlights) (`:16-39`).
  - Inneres `base.body` wird gedroppt; trägt es Props/BreakpointOverrides, werden sie auf einen synthetischen `base.container` (`<prefix>bodyprops`) migriert, damit Body-Styling nicht verloren geht (`:58-83`).
  - Nur der **erste** Outlet wird ersetzt; Extra-Outlets rendern leer. Nach dem Merge `reindexNodeParents` (Sizes-Resolver liest `parentId`). Innenliegende Template-Config wird mitgeführt, damit Asset-Scopes auf Entry-Routen greifen (`:154-172`).
- **Bindings** (`src/core/templates/dynamicBindings.ts`):
  - Quellen `currentEntry|parentEntry` (Stack-Top / eins darunter) sowie `page|site|route`; Feldpfade dotted (`author.name`) — Relations-Traversal als normaler Pfad.
  - Zweiphasig: (1) strukturierte Whole-Prop-Bindings inkl. `fallback:'empty'` → `''`; Markdown-Shim für `body`/`bodyMarkdown` mit `format:'html'` (Tokens **vor** Markdown-Render interpoliert); (2) Token-Interpolation `{source.field}` in allen String-Props, inkl. `htmlAttributes` eine Ebene tiefer (nie Markdown-gerendert); Richtext-Key-Props werden markdown→HTML gerendert und **sanitisiert** (`sanitizeRichtext`, Canvas-XSS-Guard GHSA-7vxr-r5h2-rh76).
  - `base.outlet` bekommt implizit `currentEntry.body` (html) als Binding — `effectiveNodeBindings` teilen Publisher und Canvas, damit beide identisch rendern (`:101-121`).

---

## 6. Loops (Code)

- `renderLoop` (`src/core/publisher/renderLoop.ts`): Varianten-Round-Robin `variants[i % variants.length]`; kein Prefetch-Datum → HTML-Kommentar-Marker; **leere Items → `''` (kein Wrapper)**; Wrapper-Attrs `data-instatic-loop/-page/-mode/-has-more/-page-size`; `htmlAttributes` über den geteilten Sanitizer (reserviert `data-instatic-*`/`data-canvas-*`); classIds/inlineStyles auf den Wrapper; pro Iteration frischer Child-Config mit `entryStack:[...baseStack,item]` (unveränderliche Snapshots).
- **`entry.field` ist der Sonderfall**: wird NICHT prefetched, sondern synchron pro Iteration vom Stack-Top aufgelöst (`renderLoop.ts:138-166`); `resolveEntryFieldItems` (`src/core/loops/sources/entryField.ts`) macht direction/offset/limit, reichert Media-IDs aus der Media-Map zu `src/url/path/altText/mimeType/width/height` an, exponiert Primitive als `currentEntry.value`, Objekte gespreadet + `value/index`. Kein Infinite-Paginating für kontextuelle Quellen.
- **Prefetch** (`server/publish/loopPrefetch.ts`): `collectLoopNodes` über `walkRenderTree` (inkl. VC-Definition-Trees, cycle-guarded); Page-Nummer nur bei `pagination==='infinite'` aus `loop_<id>_page`; Slice = `offset + (page-1)*pageSize`; `Promise.all` pro Loop-Node → `RenderConfig.loopData`; Walker bleibt synchron.
- `data.rows`-Filter: **eine** Zell-Bedingung mit geschlossenem Operator-Set (`is|isNot|isTrue|isFalse|isSet|isEmpty`), Sortierung als `orderBy: 'cell:<fieldId>'` — beides über `cellFilter.ts`/`cellOrderSql` (Feldname als Bind-Parameter, nie SQL-Text; SQL-Safety-Test scannt den Loop-Baum auf PG-Ismen). Nicht vergleichbare Felder (multiSelect, media, repeater, pageTree, fieldSchema, Mehrfach-Relation) werden aus den Picker-Optionen ausgeschlossen, weil ihre Zellen Collections als JSON-Text lesen. Text-Vergleich in beiden Dialekten (Zahlen lexikografisch!).
- Deep-Links: `/blog?loop_<nodeId>_page=2` rendert serverseitig (kein JS nötig); Constraints: nur `infinite`, kontextuelle Quellen ausgenommen, Out-of-Range → leer (kein Wrapper), kein Total/„Seite x von y" exponierbar (`docs/features/loops.md:492-518`).
- Canvas-Preview: `useLoopPreviewItems` — `data.rows` über `GET /data/tables/:id/loop-preview` (branch-aware), `site.pages` über `selectSitePagesLoopItems` mit referenzieller Stabilität (kein Re-Render fremder Loop-Bodies beim Tippen), Canvas-Cap **6 Items**; Plugin-Sources rufen `preview()` synchron.

---

## 7. Forms & Submissions (Code)

### 7.1 Modell: Primitive als normale Nodes
- Module: `base.form` (Modi `cms|custom`), `base.label`, `base.input`, `base.textarea`, `base.select`, `base.option`, `base.option-group`, `base.checkbox`, `base.radio`, `base.submit`, `base.form-message` (`src/modules/base/forms/index.ts:166-442`). Kein verstecktes Feld-Builder-Shape — Autoren komponieren normale Nodes, jede bleibt editierbar.
- `FormSettingsPanel` + `formSettingsAnalysis.ts`: kontextueller Setup-Block oben in den Modul-Settings; promotete Props (mode, Form ID, Ziel-Tabelle) werden aus der schema-getriebenen Liste unterdrückt (`PROMOTED_FORM_PROPERTY_KEYS`); Feld-Picker patcht `fieldId/name/id/type/required/Validierung` in **einem** Edit; „Tabelle aus Formular anlegen" leitet Felder aus den Authored Nodes ab; Ziel-Tabellen sind **nur non-system `data`-Tabellen** (`src/core/forms/targets.ts`), System-Tabellen (Pages/Posts/Components) sind ausgeblendet.
- Form-ID ist Maschinen-ID mit Normalisierung (`normalizeIdentifierValue`) — Publisher, Snapshot, Runtime und Handler normalisieren identisch.

### 7.2 Snapshot-Derivation (Publish-Request-Zeit)
- `src/core/forms/snapshot.ts`: `derivePageFormSnapshots(page)` läuft die Page-Tree ab, sammelt pro `base.form` (mode `cms`): Controls (mit `fieldId`, `name`, Input-Typ, required/min/max/pattern), Labels (Auto-Target = **nächster Control im selben Form-Subtree**; explicit via `targetId`), Submits (nur ohne/mit passender `formId`), Messages (kind success/error/status), `honeypotName` (Default `company`), `minSubmitSeconds` (Default 2).
- Der Server vertraut **dem publizierten Snapshot**, nie den Client-Angaben zu Feldern oder Ziel-Tabellen (`server/forms/handler.ts:109-136`).

### 7.3 Submission-Flow & Speicherung (wichtig für Ticket 26)
- **Es gibt KEINE eigenen Form-/Submission-Tabellen.** Submissions werden per `createDataRow` in die Ziel-`data`-Tabelle geschrieben und feuern `content.entry.created` mit Actor `{kind:'system'}` (`server/forms/handler.ts:138-144`). Submissions sind damit normale Entries (im Data-Workspace sichtbar); kein Workflow (kind `data` hat keinen Status).
- Zweistufiger Public-Flow: Browser-Runtime (Module-JS-Kanal: `base.form`-`render()` emittiert `formRuntimeJs` bei `mode==='cms'`; ausgeliefert unter `/_instatic/module-js/base.form.js`) prefetcht bei Form-Attach eine Challenge (`POST /_instatic/form/challenge`) und postet dann Werte+Challenge an `/_instatic/form/submit`.
- **Challenge-Store in-memory** (`server/forms/challenge.ts`): Map Cap **2000** (älteste eviktiert), TTL **5 min**, single-use, gebunden an `pageId`+`formId`; HMAC-SHA256-Token (`INSTATIC_FORM_SECRET`/`INSTATIC_SECRET_KEY`, sonst Prozess-Random-Fallback), constant-time Vergleiche. Page-Token = **stateless HMAC** (kein Ablauf) und wird per `stampFormPageTokens`-Regex auf **gebackene Pages UND Hole-Fragmente** gestempelt (`server/forms/formRuntime.ts`) — deshalb cache-sicher.
- Hardening komplett: Origin **Pflicht** + `originAllowed` + `Sec-Fetch-Site` same-origin/none; Body-Caps 8 KiB Challenge / 1 MiB Submit (413); Rate-Limit per IP und per IP+Form (Challenge und Submit getrennt); Honeypot + Min-Submit-Time gemessen ab **Challenge-Issue** (deshalb Prefetch beim Attach); `validation.ts` lehnt unbekannte Felder ab, koerziert auf Tabellentypen, prüft email/url/number/select + Control-min/max/pattern, Limits 100 Felder / 10 000 Zeichen.
- Schwachstelle (kritisch für Senify): In-Memory-Challenges skalieren nicht horizontal (mehrere Instanzen bräuchten shared store oder Sticky-Sessions); Rate-Limits ebenfalls in-memory.

---

## 8. Delta-Tabelle

| Bereich | Detail | Warum relevant für Senify | Quelle: Dateipfad |
|---|---|---|---|
| Content-Editor | Ein ProseMirror-Doc; Markdown ist kanonisch in der `body`-Zelle; Media als eigene Node mit `![alt](src)`/`@[video](src)` | Senify-Content-Body braucht genau ein kanonisches Format + Round-Trip; kein Block-Modell | `src/admin/pages/content/TiptapBodyEditor.tsx`, `src/core/markdown/markdownDocument.ts` |
| Content-Editor | TextAlign bewusst session-only (nicht persistiert) | Pragmatismus-Muster: „Feature sichtbar, aber nicht speicherbar" statt halbgares Parsing | `TiptapBodyEditor.tsx:152-168` |
| Content-Editor | Custom-Felder rendern über **denselben** `CellEditorRenderer` wie das Data-Grid; `pageTree`/`fieldSchema` ausgeschlossen | Ein Feld-Renderer, zwei Workspaces → keine UI-Drift; Senify sollte Cell-Editor zentral bauen | `ContentSettingsPanel.tsx`, `ContentCustomFields.tsx`, `DataGrid/cells/CellEditorRenderer.tsx` |
| Content-Editor | Save-State-Maschine `runEntryOp` (Permission → pending → apply → done, optional rethrow) | Wiederverwendbares Muster gegen hängende „Saving…"-Zustände | `src/admin/pages/content/utils/entryOp.ts` |
| Content-Editor | Live-Modus: iframe-srcdoc + frische Tiptap-Instanz **im** iframe; Refetch nur bei Titel/SEO (350 ms) | Blueprint für „Entry im echten Template editieren"; Body-Inline-Edit ohne Reload | `LiveCanvas.tsx`, `server/handlers/cms/data/preview.ts` |
| Entry-Versionen | `data_row_versions` = Snapshot je Row-Publish (`max+1`); `active_version_id` ist die Wahrheit; Slug-Wechsel schreibt Redirect | Vorlage für Senify-Entry-History + Auto-Redirects | `server/repositories/data/publish.ts`, `versions.ts` |
| Entry-Versionen | Version-Restore kopiert in den **Draft**, veröffentlicht nichts; Audit-Event | „Restore as Draft"-Semantik wie bei Pages (Artefakt 05) | `server/handlers/cms/data/rows.ts:481-540` |
| Entry-Versionen | Pages versionieren anders: ein `site_snapshots`-Blob + pro Page eine Version-Row mit `site_snapshot_id` + runtime_assets | Zwei Granularitäten (Row vs. Site) bewusst trennen | `server/repositories/publish.ts:222-281` |
| Publish | Row-Publish flusht zuerst den Collab-Relay; Disk-Fehler sind non-fatal; Lock serialisiert read→bake→bump | Draft-Persistenz-Debounce vs. Publish-Konsistenz ist ein gelöstes Problem — Muster übernehmen | `server/publish/publishRow.ts`, `publishState.ts` |
| Bake | Layer A: zwei Slots + Pointer-*Datei* (symlink-frei, Windows-fähig), atomarer Swap, tmp+rename je Datei | Direkt übertragbar auf Senifys statischen Bake (Artefakt 02/05) | `server/publish/staticArtefact.ts` |
| Bake | 404 zuerst backen, dann Pages, dann Row-Routen (sonst stranden Artefakte beim Swap) | Reihenfolge-Detail, das man erst durch Bugfixes lernt | `server/publish/publishSite.ts`, `bakeDataRows.ts` |
| Bake | Layer B: LRU mit Versions-Capture bei Render-Start (mid-flight-Publish verwirft statt cached) | Korrektheits-Detail für Senifys Preview-/Cache-Design | `server/publish/renderCache.ts` |
| Bake | Layer C: `<instatic-hole>` `display:contents` → Observer beobachtet das Platzhalter-Kind; outerHTML-Swap; ~1,1 KB Runtime | Konkretes Server-Islands-Muster ohne Framework | `server/publish/holeRuntime.ts` |
| Bake | Canonical Query: nur `loop_<id>_page` überlebt; Junk-Params → Layer-A-Hit | Cache-Key-Hygiene für Senify-Previews/Filter | `server/publish/loopPrefetch.ts:194-201` |
| Previews | Drei Wege: Editor-Preview (Draft-Body), Content-Live (Draft-Cells), Branch-Link (Hash-Token + HttpOnly-Cookie, 30 Tage, Revoke statt Ablauf) | Senify braucht vermutlich nur 1–2 davon — Entscheidung explizit treffen | `server/handlers/cms/runtime.ts`, `server/branches/previewLinks.ts`, `branchPreview.ts` |
| MCP | Streamable HTTP, stateless, 68-MiB-Cap, RFC-9728-401, DCR public clients, PKCE S256, 1-h-Tokens, Refresh-Rotation mit Reuse-Revoke, 90-Tage-Grant | Fast 1:1-Vorlage für Senifys MCP-Auth (Artefakt 04), inkl. Security-Details | `server/ai/mcp/transports/http.ts`, `oauth/*`, `connectors/store.ts` |
| MCP | Live-Bridge: NDJSON/SSE, ein Bridge je `(user,scope)`, Idle-Lease 120 s re-armiert, 90-s-Call-Timeout, Client-Reconnect-Trick | Alternative zu Senifys headless `apply_mutations` — als spätere Option dokumentiert | `server/ai/mcp/editorBridge.ts`, `src/admin/ai/useMcpWorkspaceBridge.ts` |
| MCP | Kein Headless-Tree-Write (Desync-Grund in Code+Doku); Browser-Prerequisite wird in `tools/list`-Beschreibungen gehängt | Senify-Entscheidung „headless bleibt" ist damit untermauert; Tool-Beschreibungen als UX-Fläche übernehmen | `server/ai/mcp/registry.ts:14-17`, `server.ts:43-69` |
| MCP | Row-Autorisierung serverseitig vor dem Relay (Cookie darf Token-Rechte nicht erweitern); doppelte TypeBox-Validierung im Browser | Security-Muster für agentische Writes | `contentAuthorization.ts`, `contentBridge.ts` |
| Templates | `template.target` in 3 Zellen (`templateEnabled/Target/Priority`); tolerante Parser; Level-agnostischer Chain-Resolver | Konkrete Speicher-/Resolver-Form für Senify-Ticket 23 | `src/core/data/pageFromRow.ts:90-97`, `src/core/templates/templateMatching.ts` |
| Templates | Compose: Outlet-Splice, ID-Rekeying (`t0_c0_`), Body-Drop mit Styling-Migration, reindexNodeParents | Wichtigstes Implementierungsdetail für „Layout schließt Seite ein" | `src/core/templates/templateCompose.ts` |
| Bindings | `resolveDynamicProps` zweiphasig (Whole-Prop + Token), Markdown-Shim, htmlAttributes-Ebene, Richtext-Sanitizing; Outlet-Body implizit | Blueprint für Senifys `{ "$entry": … }`-Bindings + Outlet-Sektion | `src/core/templates/dynamicBindings.ts` |
| Relationen | Relation = Row-ID(s); Anzeige-Auflösung batcht pro Ziel-Tabelle, Fallback rohe ID; Picker-Dialog shared | Pragmatische Relation-UX ohne Joins | `useRelationTargetRows.ts`, `RelationCell.tsx` |
| Repeater | `{id,cells}[]`, eine Ebene, Move-Buttons statt DnD, stabile Item-IDs | Repeater-Umfang für Senify-Content-Kern festzurren | `src/core/data/schemas.ts:206-238`, `RepeaterCell.tsx` |
| Loops | Round-Robin-Varianten, leere Items → kein Wrapper, kein Total; `entry.field` synchron pro Iteration; Prefetch via walkRenderTree inkl. VC-Trees | Loop-Semantik + Pagination-Grenzen für Senify-Ticket 23 | `src/core/publisher/renderLoop.ts`, `server/publish/loopPrefetch.ts`, `entryField.ts` |
| Forms | Keine Submission-Tabellen: Submissions = `data_rows` in der Ziel-`data`-Tabelle + `content.entry.created` (Actor system) | Ticket 26: Für Senify reicht „Submissions als Entries" — keine eigene Infrastruktur | `server/forms/handler.ts:138-144` |
| Forms | Snapshot beim Publish (Controls/Labels/Submits aus dem Tree); nur non-system data-Tabellen; Form-ID normalisiert | Form-Modell deklarativ aus Nodes, Server vertraut Snapshot | `src/core/forms/snapshot.ts`, `targets.ts` |
| Forms | Challenge in-memory (Cap 2000, 5 min, single-use), stateless HMAC-Page-Token auf gebackene Pages + Holes, Honeypot + Min-Submit-Time, Origin-Pflicht, Rate-Limits | Starke, einfache Spam-Abwehr — aber In-Memory = Single-Instanz-Grenze (kritisch) | `server/forms/challenge.ts`, `formRuntime.ts`, `handler.ts` |
