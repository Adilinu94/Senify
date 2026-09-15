# Research 23 — Instatic Deep-Dive (Repo-Analyse)

> Stand 14.09.2026. Quelle: geklonte Repo `corebunch/instatic` (Shallow-Clone nach `%TEMP%\opencode\instatic`), gelesen: `AGENTS.md`, `docs/editor.md`, `docs/features/{content-storage,content-workspace,data-workspace,media,modules,visual-components,mcp-connectors}.md`, `docs/reference/css-class-registry.md`.
> Auftrag (Nutzer): „Es soll ein komplettes CMS sein — Texte/Bilder einfach austauschen. Ein visueller Editor ähnlich Instatic."

## 1. Was Instatic technisch ist

Bun-Server + React-19/Vite-SPA; Postgres **oder** SQLite; TypeBox überall; Yjs-CRDT-Co-Editing; 3-Layer-Publisher (Static-Bake + LRU + Server-Islands); QuickJS-Plugin-Sandbox; eigener MCP-Server. Output bewusst **framework-frei** (plain HTML/CSS).

## 2. CMS-Kern (das „komplette CMS")

### Universal-Content-Model
- **`data_tables` + `data_rows`** — alles: Posts, Pages, Visual Components, Layouts, freie Tabellen. Kinds: `postType | data | page | component | layout`; Systemtabellen geseedet & geschützt.
- **Feldsystem (16 Typen):** text, longText, richText, number, boolean, date, dateTime, select, multiSelect, url, email, **media** (single/multi), **relation** (single/multi), **repeater** (1 Ebene), pageTree, fieldSchema.
- Zellen in `cells_json` keyed by field-id; `slug`/`status` denormalisiert für Index/Route.
- **Workflow:** `draft | published | unpublished | scheduled` + **`data_row_versions`** (Snapshot je Publish) + Scheduled-Publish-Tick. Soft-Delete (`deleted_at`).
- **Entry-Templates:** Post-Types bekommen öffentliche Detailseiten über ein Template (Page mit `template.target = postTypes`) + Entry-Stack (`currentEntry`) + dynamische Bindings (`resolveDynamicProps`).
- **Loops:** `base.loop` iteriert über Queries (Prefetch im Publisher).
- **Forms:** native Formular-Primitives; Submissions landen in eigenen Tabellen.
- **Site-Transfer:** Bundle-Import/-Export über alle Tabellen/Rows.

### Data Workspace (`/admin/data`)
Spreadsheet-Grid (read-only) + Inspector: **RowDetail** (Zell-Editor) / **TableSettings** (Schema). `FieldSchemaComposer` (DnD-Reorder, Maschinen-ID aus Label abgeleitet), Feld-Tiers (mandatory built-ins `title/slug` · optional built-ins `body/featuredMedia/seoTitle/seoDescription` · custom), Bulk-Actions, Context-Menüs, Import/Export, Row-Duplicate mit Slug-Kollisionslogik.

### Content Workspace (`/admin/content`)
Collection-/Entry-Explorer + **Tiptap/ProseMirror-Body** (kanonisch **Markdown** in der `body`-Zelle; Bubble-/Slash-Menü, Input-Rules) + Settings-Panel (Status, Slug, Autor, SEO, Featured Media, Custom-Felder via `CellEditorRenderer`). **Write-/Live-Modus** (Entry im echten Template). 15 Content-MCP-Tools.

### Media (`/admin/media`)
Datei-Manager-Canvas: **Ordner** (Baum+DnD), **Smart Folders** (Missing-Alt/Title, Untagged, Large, Recently-Replaced), **Tags**, **Replace File** (ID/URL bleiben stabil!), **Trash** (Soft-Delete+Purge), Floating Windows (Viewer, Upload-Queue, Bulk-Edit), Capability-Split (read/write/replace/delete).
Upload-Pipeline: Magic-Byte-MIME-Sniff, Worker-Pool (sharp), **Varianten-Ladder 64/320/640/1024/1600/2048 + Intrinsic-Rung**, Blurhash, Dominant-Color, Video-Poster; `srcset` **nur aus Varianten** + **`sizes`-Resolver** (leitet `sizes` aus Layout-CSS-Mathematik ab); Storage-Adapter mit Signed-Redirect (1 h TTL).

## 3. Visueller Editor (das „Instatic-Gefühl")

### Canvas
- **Design-Modus:** je Breakpoint ein **eigener Iframe** (side-by-side, Zoom/Pan, Start 50 %) → echte Media-Queries/`vw`/Stile; **Live-Modus:** EIN Frame in echter Größe, normal scrollbar. Beide voll editierbar.
- Iframe-Isolation (Stile, Plugin-Module in Sandbox), Style-Injectors (Editor-Chrome unlayered vs. User-CSS in `@layer`), Selection-/Hover-Rings (Overlay außerhalb des Zoom-Layers, RAF-Loop mit separaten Read/Write-Phasen), Selected-Layer-Toolbar (DnD, Insert, Duplicate, Delete), **Alt-Inspect-Ladder** (Baum-Picker beim Hover).
- **Inline-Text-Editing:** Doppelklick → `contentEditable="plaintext-only"` auf dem **echten Element** im Iframe; jeder Keystroke committet live (`updateNodeProps`) → alle Breakpoints aktualisieren; Escape = Revert; ein Undo-Eintrag.

### Store & Panels
- Zustand+Mutative, 12 Slices, **patch-basiertes Undo (O(change))**, 11 Tree-Mutationen über `mutateActiveTree` (identisch zu unserem Katalog 01!).
- **PanelRail** (Explorer/Framework/Selectors/Dependencies/Agent), Explorer mit Tabs **Layers/Site/Code/Media**, Site-Explorer (Pages/Templates/Components/Styles/Scripts, Ordner, Homepage-Pin), Properties-Panel, **Cmd+K-Spotlight** überall, **URL-Deep-Links** (`?page=`, `?table=&row=`).

### Modul-System (≈ unser Section-SDK)
`ModuleDefinition`: `id`, **`PropertySchema` → generiert das Properties-Panel** (Controls: text/textarea/number/toggle/select/color/url/image/media/svg/group; `condition` für bedingte Sichtbarkeit), **pure `render(props, children) → {html, css, js?}`** (CSS-Dedupe per moduleId), optionale **React-Editor-Komponente mit Paritätspflicht** (shared-leaf-Muster gegen Canvas/Publish-Drift), `canHaveChildren`, `publishBehavior`, `dynamic` + `staticPlaceholder`, Dependencies (Import-Map). Basis-Module: body/container/text/button/link/image/svg/video/list/loop/form/VC-ref/slots/outlet.

### Visual Components (≈ Sektionen mit Props)
`NodeTree` + **typisierte Params** (string/number/boolean/url/enum/color/image/richText/slot), **Slots = `slot-outlet` im VC-Tree**, beim Konsumenten als **materialisierte `slot-instance`-Kinder**, `propBindings` (Prop → Param-ID), `syncSlotInstances` (Rename-bewahrend), Cycle-Guard, Deletion-Impact, **Componentize** (Subtree → VC per Rechtsklick), VC-Modus via Virtual-Page.

### Klassen-System (Kontrast zu unserem Tailwind-Entscheid)
`StyleRule`-Registry: **class / ambient / scoped** Regeln, `contextStyles` für Breakpoints + **custom Conditions** (@media/@container/@supports), State-Pseudos mit **Forced-State-Preview**, Usage-Tracking, Selector-Picker (nach Specificity sortiert), framework-generierte Utility-Klassen. Nutzer stylen frei per Klassen.

### Weiteres
Branches (logical/physical IDs), Yjs-**Echtzeit-Co-Editing** (ein Doc pro Row, kontinuierliche Persistenz, **kein Save-Button**), Audit-Log, Spotlight, Editor-Preferences.

## 4. Agenten-/MCP-Schicht

- Eigener **MCP-Server** (`/_instatic/mcp`): **OAuth 2.1** (DCR, PKCE S256, Rotation, 90-Tage-Grant) + **PAT** (`imcp_pat_…`, gehasht, Scopes, Step-Up bei Erstellung).
- **Tool-Modell:** server-resolved Reads + `media_upload` + `site_publish`; **Browser-Tools über Live-Bridge** zum **offenen Workspace des Connector-Owners** — bewusst **KEIN headless Page-Tree-Write** („a second DB mutation path would desynchronize node state")! Idle-Lease 120 s für Streams, Writes = Draft, Publish explizit.
- Site-Scope 35 Tools / Content-Scope 15 Tools; Capability-Filter je Verbindung.
- Kollaboration: Store-Mutationen → Yjs-Relay (kontinuierlich); headless Reads/Publish flushen den Relay vorher → nie stale.

## 5. Engineering-Praktiken (übernehmen)

TypeBox an jeder Grenze (Schemas = Source of Truth, `zod` gebannt) · Architektur-Regeln als **Tests** (80+ Gates) · PG/SQLite-Migrationsparität, **additive** Migrationen · pure render + CSS-Dedupe · DOMPurify + CSS-Value-Sanitizer · Worker-Pools · `prewarmedLazy`-Chunks · Docs-Tracking-Pflicht.

## 6. Delta zu Senify (Was ändert sich durch dieses Deep-Dive?)

| Bereich | Instatic | Senify-Beschluss bisher | Konsequenz |
|---|---|---|---|
| Collections/Entries | First-class (v1) | war v2 (Out of scope) | **Scope-Update → Ticket 22** (Content-Kern) |
| Entry-Templates/Bindings/Loops | First-class | nicht vorgesehen | **Ticket 23** |
| Content-Body (Markdown/Tiptap) | Content-Workspace | nur Page-NodeTree | in 22 definieren |
| Editor-Muster | Frames side-by-side, Live-Modus, Inline-Edit, Explorer, Spotlight | Puck, Toggle, kein Inline-Edit | **Ticket 24** (Alignment) |
| Styling | Klassen-Registry/Contexts/Selector-Panel | Tailwind + Tokens + Style-Props | bleibt (kuratierte Sektionen); Delta nur wo nötig |
| Media | Ordner/Smart/Tags/Replace/Trash, Ladder 64–2048, sizes-Resolver | Basis-Pipeline | **Ticket 25** (Erweiterung) |
| Forms | nativ + Submissions | „extern" | Entscheidung (Ticket 26) |
| MCP | Live-Bridge, kein Headless-Tree-Write; Yjs-Collab | headless `apply_mutations` + optimistic Locking | **bleibt**: headless ist für Agenten richtig (kein offener Browser); Live-Bridge/Yjs als spätere Option notiert |
| Patch-Undo, 11 Mutationen, NodeTree | — | identisch | ✅ bestätigt |

## 7. Übernahme-Liste (→ Tickets)

**22 Content-Kern:** Collections/Entries + Feldsystem (inkl. relation/repeater/media) + Workflow + Content-Workspace (Markdown-Body).
**23 Templates/Loops:** Entry-Templates, dynamische Bindings (`{ "$entry": … }`), Loop-Sektion, Prefetch im Bake.
**24 Editor-Delta:** Design/Live-Modi, Breakpoint-Frames nebeneinander, Inline-Text-Editing, Explorer-Tabs, Spotlight, URL-Deep-Links, Media-Panel (Puck-Gap-Analyse).
**25 Media-Delta:** Ordner, Smart Folders, Tags, Replace, Trash, Ladder 64–2048 + Intrinsic, sizes-Resolver.
**26 Forms (offen):** native Formulare + Submissions.
