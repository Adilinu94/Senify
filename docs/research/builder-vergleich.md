# Builder-Vergleich: Revyme, Plasmic, Silex, Frappe Builder

**Stand:** 22.09.2026
**Historisch:** Recherche zum damaligen Zeitpunkt. Die Verweise am Ende der Datei zeigen auf Pfade, die seit dem 27.09.2026 unter `docs/history/` liegen; sie beschreiben den Stand, aus dem heraus geschrieben wurde.
**Zweck:** Recherche für die anstehende UI-Überarbeitung und für Feature-Übernahmen in Senify.
**Auftrag (Nutzer):** „Welche Funktionen wären sinnvoll, dass wir diese übernehmen, was können wir von diesen lernen. Besonders die UI muss auch noch komplett überarbeitet werden. Schaue dir auch Screenshots an."

---

## 0. Methodik und ein Vorbehalt

- **Screenshots:** Das ausführende Modell kann **keine Bilder ansehen** (Bild-Eingabe nicht unterstützt). Ersatz: Die Screenshots der Repos wurden per **Windows-OCR** (Windows.Media.Ocr) ausgelesen — dadurch sind die echten Panel-Beschriftungen, Feldnamen und Strukturen bekannt. Die visuelle Gestaltung (Farben, Feinlayout, Stimmung) konnte **nicht** beurteilt werden.
- **Code:** Drei Repos wurden als **Sparse-Klone** lokal analysiert: Revyme (`src/`, Stand 21.09.2026), Frappe Builder (`frontend/` + `builder/`, Stand 21.09.2026), Silex (`editor/`, `grapesjs-plugins/`, `common/`, `server/`, Commit `8171bc57`, 22.09.2026). Plasmic ist zu groß für einen Voll-Klon; dort wurden README und fünf Doku-Seiten (technical-overview, artboards, components, variants, interactions, tokens) ausgewertet.
- **Aussagen über Senify** beziehen sich auf den Stand des Arbeitsbaums (Editor v2, HANDOFF §2.26) und wurden punktuell am Code geprüft.
- **Keine Spekulation:** Wo etwas in den Quellen nicht stand, ist das im Dokument so markiert.

---

## 1. Überblick

| | **Revyme** | **Frappe Builder** | **Silex** | **Plasmic** |
|---|---|---|---|---|
| Was | Open-Source-Framer-Alternative, Next.js-Export | Low-Code-Website-Builder auf Frappe | GrapesJS-Builder für statische Seiten | Visueller Builder für React-Codebasen |
| Repo | `revyme-web/builder` | `frappe/builder` | `silexlabs/Silex` | `plasmicapp/plasmic` |
| Stars / Forks | 131 / 16 | 2.4k / 542 | 3.0k / 679 | 7.0k / 720 |
| Lizenz | AGPL-3.0 + kommerzielle Option (NOTICE, Marken) | **MIT** (Juli 2026 von AGPL umlizenziert) | AGPL-3.0 | **MIT** außerhalb `platform/`; `platform/` = AGPL |
| Stack | Vite, React, TypeScript, Tailwind 4, Babel-AST | Vue 3 + frappe-ui, Python (Frappe) | GrapesJS, TypeScript 63 % / Rust 16 %, Tauri | TypeScript/React (88,6 % TS), Gatsby-Doku |
| Output | echtes Next.js-Projekt (JSX) | Frappe-Seiten (JSON-Blöcke) | statisches HTML + 11ty | React-Code oder Headless-API |
| Editor-Ports / Besonderheit | 3333 Editor, 5174 Canvas-Sandbox, 5175 Preview | eine Canvas je Breakpoint, Solo-Modus | 13 eigene GrapesJS-Plugins, 28 Pseudo-States | Artboards, Variants, Token-Targets |
| KI/Agent | `src/ai/` (MCP-Spuren) | **„Bob"** Chat-Agent mit Approval + Revert | **MCP-Server** (Port 6807) + Capability-Registry | kein Agent |

---

## 2. Revyme — die mutigste Architektur

### 2.1 Was es ist

„Design websites with pixel-perfect control. Ship real code you own." Ein visueller Builder, dessen Ausgabe ein lesbares Next.js-Projekt ist (Ordner `app/`, `components/`, `cms/`). Kein proprietäres Format, kein Export-Schritt. Zielgruppe: Designer, Entwickler, Agenturen — „Leute, die einen gehosteten Builder verlassen".

### 2.2 Architektur (belegt im Code)

- **JSX ist die Quelle der Wahrheit.** `code/parsing/parser.ts` parst die Seite mit `@babel/parser`/`traverse` in eine `Map<id, CanvasNode>` (Styles, Style-Variablen, Attribute, Text, `translationKey`, `componentFile`); Nodes hängen an `data-id`.
- **Ein Schreibpfad:** Die UI ruft `queueMutation(...)` (`code/mutation/mutation-queue.ts`); die Queue batched und ruft pure Generatoren `(code, …) => code` aus `code/generation/` (`generator-crud.ts` mit Fast-String-Pfad + AST-Fallback). Einziger Projekt-Writer: `code/project/modify-file.ts` auf `ProjectFS`.
- **Imperativ vs. kanonisch:** Während eines Drags wird der Canvas direkt gepatcht (60 fps), die Quelle erst beim Loslassen einmal neu geschrieben.
- **Sandbox:** Canvas-Inhalt lebt in einem sandboxed iframe (Port 5174). Host→iframe über Comlink (`canvas-sandbox/bridge-host.ts`), iframe→Host als rohe `postMessage` (`canvas-sandbox/protocol.ts`). **Geometrie-Caches** (`rectCache`, `computedCache`, `cornersCache`) machen `findNodeRect`/`findNodeComputedStyle` synchron lesbar — deshalb Drag ohne Roundtrip.
- **Vanilla-Stores außerhalb von React:** `drag-state-store.ts`, `camera-move-store.ts` (per `useSyncExternalStore`), weil die Writer außerhalb des React-Trees liegen.
- **Undo:** `code/mutation/history.ts` snapshottet ProjectFS-Diffs (debounced/coalesced, inkl. Selection + UI-Location).
- **Persistenz:** `backend/local-backend.ts` (localStorage `revyme-project-<id>`), Autosave 2 s (`backend/autosave.ts`), Cloud-Pfad `revyme-backend.ts`.
- **Plugin-SDK:** Manifest-Parse/Validate (`plugins/manifest.ts`), Permission-Gate, gespiegeltes Protokoll, sandboxed Runtime-Fenster (`PluginRuntimeWindow.tsx` + `sdk-impl/*` für Canvas, CMS, Pages, Assets, Secrets), Tier-2-Editor über Monaco.
- **Regeln im Code:** Layout-Brackets `layout::` (`shared/flex-helpers.ts`), Varianten (`code/variants/`), Komponenten (`code/components/`), responsive Overrides werden zur Renderzeit von `@media` zu `@container` (mit `vpId`/`vpPrefix`). Ein **AI-Gate** (`code/oracle/check-file.ts`, Tier 1 Syntax / 2 Dialekt / 3 Resolve) prüft generierte Dateien.

### 2.3 UI (OCR-Befunde + Code)

- **Shell:** `App.tsx` komponiert LeftHeader/RightHeader, `LeftMenu`/`LeftPanel`, `Canvas`, `RightSidebar` (Properties bzw. Comments), `BottomToolbar`, Command-Palette, Onboarding-Tutorial und Overlays (Translations, CMS, CMS-Editor, Component-Editor, Code-Editor, Settings, Plugin-Runtime).
- **Glas-Slabs:** `ChromeIslands.tsx` malt links ein Rail (52 px) + Panel (256 px) und rechts 260 px als Platten mit **Cut-Corner-Clip-Paths**.
- **Panel-IDs als Erweiterungspunkt:** `LeftMenu.tsx` listet vibe, layers, library, presets, media, locale, cms, code; Pages und Layers teilen ein Panel mit Segmented-Tabs (`PagesLayersPanel.tsx`).
- **Layer-Baum:** flach pro **(Viewport, Node)** mit präfixierter ID (`"desktop:features"`), Viewport-/Variant-Header-Zeilen, CMS-Icons; Suche = Treffer ∪ Ancestors (`LayersPanel/search.ts`); visuelle Sortierung `sortChildrenByVisualOrder`.
- **Canvas:** Breakpoint-Header (36 px, drag, Snap, Add-Button) via `ViewportHeaderManager.ts`; Device-Presets in `AddViewportMenu.tsx`; Zoom/Pan RAF-gebatcht (`TransformManager.ts`): Wheel = Pan, Ctrl/Cmd+Wheel = Zoom am Cursor, Middle-Mouse/Hand-Tool; `CameraCommands`/`CameraAnimator`/`camera-persist.ts`; Selection/Resize/Rotate in `canvas/selection/*`, `canvas/resize/ResizeManager.ts`.
- **OCR aus dem Editor-Screenshot:** „Finatech / Home", „1440 Desktop · 1440 Tablet · 768 Mobile", links „Layers / Search layers…" mit Einträgen wie „Desktop Header / div / Hero / Hero Background / Hero Gradient / Spacer / Hero Content / Bottom Row / Testimonial … / Section Weaving Waves / Cards Row / FAQ / CTA Section / Footer / Tablet 768"; rechts „Settings" mit „INTERACTIONS · NAVIGATION (Link to) · POSITION · Type · DIMENSIONS (Width, Height) · ANIMATION · LAYOUT · OVERLAYS", dazu „Export" und „Publish".
- **OCR Motion-Screenshot:** „Transition Instant Ease Duration Delay", „Custom Spring 0.3", „Scroll Speed / Scroll Transform / Scroll Variant", „Hover Tap Scroll Loop", „Text Preset", „Content / Color / Fill", „Appear".
- **OCR CMS-Screenshot:** Collection „Blog" mit „Fields / Items / + New Item / Search items…", Feldern „Title, Content, Date, Image, Read time, Category", Meta „Slug, Status, Created, Updated", Buttons „Save / Export / Publish / Cancel / Settings".

### 2.4 Übernehmbare Funktionen

1. **Panel-Architektur als Registry** (Rail + austauschbare Panels; Panel-ID = Erweiterungspunkt).
2. **Breakpoint-Header + Layer-Baum mit Viewport-Zeilen** — responsive Varianten im Baum sichtbar machen (wir zeigen 3 Frames, aber der Baum kennt die Ebenen-Varianten nicht so).
3. **Performance-Muster für Drag** (Geometrie-Caches, Vanilla-Stores außerhalb React, deferred Flush) — Blaupause für E18.
4. **Motion-Tiefe:** Scroll-Trigger, Scroll-Varianten, Text-Effekte (per Character), Spring-/Easing-Editor, Hover/Tap/Scroll/Loop — Ausbau von E10 nach den Presets.
5. **Plugin-SDK-Muster** (Manifest + Permission-Gate + Sandbox) als Option für spätere Erweiterbarkeit.
6. **Command-Palette + Onboarding-Tutorial** (wir haben Spotlight; Tutorial fehlt).
7. **CMS-Overlay im Canvas** (Items direkt im Kontext editieren) — für E13.
8. **Kamera-Komfort** (Wheel-Pan, Zoom am Cursor, Kamera-Animation + Persistenz) — bei uns existiert ein Zoom-Footer, aber nicht diese Bedienung.

### 2.5 UI-Lehren

- Ein Panel-System mit **Rail + Panel-ID** macht neue Werkzeuge (CMS, Locale, Code, KI) zu Einsteckteilen statt zu Umbauten.
- Der Layer-Baum darf **responsive Varianten als eigene Zeilen** führen — das ist der ehrlichste Weg, Overrides sichtbar zu machen.
- **Glas + Cut-Corner** ist Revymes Signatur. Senify hat mit Tiefwasser/Lime/Lichtkanten bereits eine eigene — nicht kopieren, sondern die eigene Signatur genauso konsequent durchziehen.

---

## 3. Frappe Builder — das reifste Editor-UX

### 3.1 Was es ist

„Craft beautiful websites effortlessly." Low-Code-Builder auf dem Frappe-Framework, MIT, mit Figma-ähnlichem Editor, KI-Agent „Bob", CMS, Scripting, One-Click-Publishing und Analytics. Frappe.io selbst läuft darauf.

### 3.2 Architektur (belegt im Code)

- **Block-Modell:** `frontend/src/block.ts` — Element, Kinder, `baseStyles`/`tabletStyles`/`mobileStyles`, Attribute, `classes`, `dataKey`, `dynamicValues`, `props`, `editorConfig`, `clientScript`, Custom-Attribute, Component-Referenzen. Serialisierung über `utils/helpers.ts`, Autosave als JSON (`pageStore.savePage()`).
- **Registries statt harter Verdrahtung:** `utils/createRegistry.ts` für Property-Sektionen, Left-Panel-Tabs, Toolbar-Items, Commands, Settings.
- **State:** Pinia-Stores `builderStore` (UI-Layout, Modus, Dark, readOnly, Realtime), `canvasStore` (aktive Canvas, Drop-Ziele, Fragmentmodus, Versionsvorschau), `pageStore`, `componentStore`, `blockTemplateStore`; dazu Composables (`useCanvasHistory`, `useCanvasDropZone`, `useCanvasMarqueeSelection`, `useBlockReorder`, `useBuildFollow`, `useBuilderEvents`, …).
- **Block-Typen** ergeben sich aus Element-Heuristiken in `block.ts` + Template-JSONs; Block-Vorlagen liegen als DB-Fixtures (`hero_1/2`, `navbar_1/2`, `footer_1`, `form_1–3`, `button`, `heading`, `quick_grid/stack`, `theme_switcher`, `youtube`).
- **Scripting/Daten:** Client Scripts als Doctypes, Block-/Component-Skripte als `clientScript {js,css}`, Ausführung im Editor über `utils/scriptSandbox.ts` (Restricted/Unrestricted Proxy-Sandbox, Setting `execute_block_scripts_in_editor`); Data Scripts sind Python (`builder_page.py` `execute_script` → `get_page_data` → `window.page_data`); Bindings über `dataKey`/`dynamicValues` mit Resolver für Attribute, Styles, innerHTML und Sichtbarkeit; Repeater über `DataLoaderBlock.vue`.
- **Publishing:** Publish/Staging (`promote_draft_blocks`, Snapshot, Preview-Bild), Versionen als `Builder Snapshot` + `VersionHistory.vue`; Analytics über DuckDB-Ingest (`builder_analytics.py`) und ECharts im Frontend.

### 3.3 UI (OCR-Befunde + Code)

- **Shell:** `PageBuilder.vue` komponiert zwei `BuilderCanvas`-Instanzen (Seite/Fragment), `BuilderLeftPanel` (Tabs: Insert/Blocks, Layers, Components, Code, Design-Tokens, Bob AI), `BuilderRightPanel` (VersionHistory ↔ BlockProperties), `BuilderToolbar` und Modals (PageList, Dialog, BlockContextMenu, CommandPalette, Shortcuts, Templates).
- **Properties-Panel:** Sektionen aus `BlockPropertySections/index.ts` — jede Property ist `{component, getProps, condition, searchKeyWords, usedStyleProperties}`; Controls in `components/Controls/` (`StylePropertyControl`, `BasePropertyControl`, `SplitPropertyControl`, `ColorInput`, `FontInput`, `CodeEditor`); Styles werden **inline** in drei Maps gespeichert (`Block.setStyle()` wählt anhand `activeCanvas.activeBreakpoint`); Zustände als `hover:`-Präfix; freie CSS-Properties über `MoreStylesPanel.vue`.
- **Canvas:** eine Canvas je Breakpoint (Desktop 1400, Tablet 800, Mobile 420) mit Umschaltung inkl. **Solo (Cmd)**; Pan/Zoom (`utils/panAndZoom.ts`), Snap-Guides, Drop-Indicator; Selection-Overlay per `teleport`; **`BoxResizer.vue` mit Padding-/Margin-/Border-Radius-/Rotations-Griffen** und `guidesTracker.ts`/`rotation.ts`/`useRotatedCursors.ts`; Marquee-Mehrfachauswahl; Reorder mit `dropGeometry.ts`; Panel→Canvas-DnD via vueuse `useDropZone`.
- **Dark Mode:** `builderStore.canvasDarkMode` → `scheme-dark`, Dark-Tokens und `darkSrc`-Bildtausch; Editor-Theme über `useDark({attribute:"data-theme"})`.
- **OCR aus dem Screenshot:** links Layer-Baum („svg, hero, content, container, p, rect, defs, pattern, use, image, svg, details"), Kopf „Lomography — pages/lomography", „Search properties"; rechts Sektionen „Link · Layout (Type, Grow, Shrink) · Typography (Family, Weight, Size, Height, Letter, Transform, Align) · Style (BG Color, Text Color, Border Color, BG Image) · Publish"; Werte wie „Poppins Bold 140px 148px -6px", „Stack Yes Yes", „Set Color #cccccc"; oben Breakpoint „Desktop".
- **KI „Bob":** Chat-Tab im linken Panel (`BuilderAIChatPanel.vue`, `AIChatController.ts`), Realtime-Events (`ai_chat_progress/stream/tool_batch/step/clarify/complete/error/refetch`), **Streaming direkt in die Canvas** (`acceptPageYamlChunk`), Tool-Dispatch (`ai/toolDispatch.ts`), betroffene Elemente (`AIAffectedItems.vue`), Turn-Timeline (`AITurnTimeline.vue`), **Approval** als `pending_action` mit Apply/Skip, **Revert pro Turn** (`revertSnapshot`/`revertTurn`, Backend `revert_to_message`/`snapshots.py`) — **kein Diff-Viewer**, nur Chips + Apply/Skip + Revert.
- **Weitere Muster:** Command-Palette mit Commands-Registry (`keys`, `condition`, `group`), Shortcut-Dialog, Panel-Resizer, Collapsible Sections, Editor-Demo-Modus, Templates-Dialog, Telemetry-Events, Realtime-Socket fürs Dashboard.

### 3.4 Übernehmbare Funktionen

1. **Box-Model-Griffe im Canvas** (Margin/Padding/Border-Radius/Rotation mit Guides) — größter Einzelgewinn für unsere Canvas-Bedienung.
2. **Solo-Breakpoint-Modus** als Ergänzung zu den drei Frames.
3. **Property-Suche/Keywords** über alle Controls im Inspektor.
4. **Version-History-Panel mit Vorschau** (wir haben Revisionen + Restore, aber kein Panel) → E17-Rest.
5. **Agent-Panel-Muster** (Chat + Approval + Turn-Revert) → E21/E22; unser Review-Diff ist der Vorsprung, den Frappe nicht hat.
6. **Command-Registry** mit Shortcuts/Conditions (Ausbau unseres Spotlights).
7. **Editor-Demo-Modus + Onboarding.**
8. **Analytics-Dashboard** (E15).
9. **Canvas-Dark-Preview** (Dark-Tokens + Bildtausch) — passt zu unseren Theme-Modes.

### 3.5 UI-Lehren

- **Registries** (Properties, Tabs, Commands, Settings) sind der Grund, warum der Editor erweiterbar bleibt.
- **Solo/Multi-Breakpoints** sind ein Bedienkomfort, den drei permanent sichtbare Frames nicht ersetzen.
- Der Agent ist **im Editor zuhause** (Chat, Streaming, Approval, Revert) — nicht nur über eine externe API.
- **Kein Diff** ist Bobs größte Schwäche — genau hier ist Senify voraus.

---

## 4. Silex — der Style-Manager-Profi

### 4.1 Was es ist

„The only open source alternative to Webflow." Freier visueller Builder für statische Seiten (AGPL), GrapesJS-basiert, mit CMS-/GraphQL-Anbindung, 11ty, Multi-Forge-Publishing, Tauri-Desktop-App und MCP-Server. Träger: Non-Profit Silex Labs, OW2-Projekt, NGI0-gefördert.

### 4.2 Architektur (belegt im Code)

- **Editor:** `editor/grapesjs/index.ts` (`getEditorConfig()`: `showDevices`, Layer-/Block-Manager in Container-Panels, eigener Storage-Connector, `selectorManager.custom`); Projektleiste `project-bar.ts`; Settings-Dialog mit erweiterbaren Sektionen.
- **13 eigene Plugins** (`grapesjs-plugins/`): `expression-input`, `advanced-selector` (visuelle Compound-Selektoren, Klassen umbenennen), `ai-capabilities` (Capability-Registry für MCP), `css-variables` (Custom-Properties-UI an Color-/Size-/Typo-Properties), `data-source` (GraphQL; Backends gitlab/wordpress/strapi/supabase/generic; States/Expressions/Query-Gen), `filter-styles` (Suche + „nur geänderte"), `fonts`, `keymaps-dialog`, `loading`, `notifications`, `storage-rate-limit`, `symbols`, `version-flow` (nicht aktiv).
- **Style Manager:** massiv erweitert in `editor/grapesjs/css-props.ts` — Display, Position, `container-type`, z-index, Transition, transform-origin, Columns, Scroll-Snap, Outline, Container-Query-Units; eigener `content`-Sektor nur für `::before/::after`; **28 Pseudo-Klassen**; Background-Image-Asset-Type öffnet den Asset-Manager.
- **Publishing:** `PublicationManager.ts` + `PublicationUi.ts` + `editor/publication-transformers.ts`; Server `server/api/publicationApi.ts`, Jobs `server/jobs.ts`; Connectoren `GitlabConnector`/`GitlabHostingConnector` (GitLab CI + Pages mit Job-Warten), `FtpConnector`, `DownloadConnector` (ZIP), `FsHosting`/`FsStorage`; 11ty-Build über `server/utils/buildPipeline.ts` (`ELEVENTY_VERSION = 3.1.6`). Forgejo/SourceHut liegen im Desktop (Rust, `desktop/src-tauri/src/integrations/`).
- **CMS/Daten:** `editor/grapesjs/cms/` (DataSource, Collection-Pages, States, Pagination, Liquid-Ausgabe, 11ty-Filter, Publikations-Transforms); versteckte readonly `EleventyDataSource`.
- **MCP/AI:** `grapesjs-ai-capabilities` exponiert `window.grapesjsAiCapabilities` + Event `ai-capabilities:ready`; Capabilities werden in `core-commands.ts`, `settings.ts`, `PublicationManager.ts`, `page-panel.ts` registriert; MCP-Server (Streamable HTTP, `http://localhost:6807/mcp`) liegt im Rust-Desktop-Teil.
- **Robustheit:** Storage-Connector mit Save-Queue und progressivem Laden (`editor/grapesjs/storage.ts`), Save-Rate-Limit-Plugin, Cross-Iframe-Drag-Patch für WebKit/Tauri (`index.ts`).

### 4.3 UI (OCR-Befunde + Code)

- **OCR aus dem Screenshot:** Kopf „silex.me 2024 · Page · Layers · Publish · Disconnect", Status „SILEX — Connected to GitLab.com — Publication success", „Your website is now live here", „Changes may take a few minutes to appear, follow deployment here", „Manage GitLab Pages settings · Logs"; links Layers-Baum („Body / Accessible me… / mobile-me… / MAIN / Modules / hero-word-slider / simple-hero / section-slideshow-up / special-heading / Section pattern-grid / rich-text / grid / cta-btn / … / FOOTER"); Panel „Classes" mit „max-1400", `.text-color-363063`, „Search…"; Style-Panel mit „General · Display · Position · Dimension · Typography (Font family, Font Color, Line height, Word break, White space, Text decoration, Text decoration color/thickness, Text transform, Text shadow) · Decorations (Background color, Border radius) · State · Visibility", Werte wie „#363063".
- Damit ist Silex der Beleg, dass ein Style Manager mit **offenem Property-Raum**, **Klassen-Verwaltung** und **State-Umschaltung** alltagstauglich ist.

### 4.4 Übernehmbare Funktionen

1. **State-Menü mit allen Pseudo-Klassen** (28 States) statt nur hover/focus/active/disabled — passt exakt zu unserem offenen CSS (ADR-0005) und fehlt als UI.
2. **Inline-Token-Buttons an jedem Control** (CSS-Variablen direkt anlegen/wählen).
3. **Style-Manager-Suche + „nur geänderte anzeigen"** — bei unserem offenen Property-Raum fast Pflicht.
4. **Advanced-Selector-UI** für `ambient`-Regeln (Compound-Selektoren visuell bauen).
5. **Publishing-Connectoren + Job-Status/Logs** (E14); Multi-Forge (GitLab/Forgejo/SourceHut) als Ziel-Ideen.
6. **MCP-Capability-Registry im Editor** (welche Aktionen der Agent ausführen kann) → E4-Parität.
7. **Save-Queue/Rate-Limit und der Cross-Iframe-Drag-Patch** (Robustheit in WebKit/Tauri).

### 4.5 UI-Lehren

- Ein **Style Manager ist ein Produkt für sich**: Suche, Filter, States und Variablen-Zugriff entscheiden über die tägliche Arbeit.
- **Klassen-Verwaltung** (ansehen, umbenennen, löschen) gehört sichtbar in die Oberfläche, nicht in ein Untermenü.
- **Deploy-Status mit Logs** macht Veröffentlichung vertrauenswürdig.

---

## 5. Plasmic — die Modell-Tiefe

### 5.1 Was es ist

„The open-source visual builder for your codebase." Visueller Builder für React; Studio ↔ Codebase über Headless-API (Loader) oder React-Codegen. Content-Management, Apps und Websites in einem Werkzeug. MIT außerhalb `platform/` (dort AGPL).

### 5.2 Architektur und Doku-Befunde

- **Integration:** Die Codebase holt und rendert Inhalte (Projekt-ID + Public API Tokens); Editoren bauen in Plasmic Studio und **publizieren direkt nach Produktion**; Plasmic hostet nicht selbst. Auslieferung build-time/SSR oder client-side (CloudFront). Alternative: React-Code generieren (Studio selbst ist damit gebaut). Code-Components lassen sich mit **Custom Controls** registrieren.
- **Artboards:** Ein Artboard ist ein **View eines Components**; mehrere Artboards = mehrere Varianten. Systemverwaltete vs. custom arenas; **Scratch-Artboard** (leer) → Component per Button in der rechten Sidebar; **Bound Artboard** = View des Masters; Master in-place editieren über **Spotlight Mode** (Doppelklick in eine Instanz).
- **Komponenten:** genau ein Root-Element; Erstellen über Kontextmenü (`Ctrl+Alt+K`), „+" in der Seiten-/Component-Liste oder Assets-Tab; Editieren in-place (`Ctrl+Enter`) oder Component-Seite (`Ctrl+Alt+Enter`); **Publishing-Einheit kann eine Component sein** (Hero, Ribbon, Modal statt ganzer Seite); Ordner per „/" im Namen.
- **Varianten:** Base + Overrides; Typen: Component-, Interaction-, Global-, Element- und Registered Variants. Gruppen (single-/multi-select) über „+" unter der Main-Canvas oder im Component-Data-Tab; aktive Variante = **rotes Artboard**, Änderung im rechten Panel = **roter Override-Punkt** (Hover zeigt den überschriebenen Wert, Right-click „Remove Style"); Interaction-Variants (Hovered/Pressed/Disabled/Focused) sind **kombinierbar** („Hovered and Not Disabled") und aktivieren im Preview-Mode; Kombinations-Artboards.
- **Interactions/State:** Interaktion = Sequenz von Actions, ausgelöst durch die Component (Trigger u. a. Click); State steuert Visibility, Props (z. B. Text-Input → Filter einer Product Collection), Variantenwechsel, Custom JavaScript.
- **Tokens:** Style Tokens (Farbe, Spacing, Typo) mit **Token-auf-Token-Referenzen**, Gruppen per „/", **Token-Library als importierbares Projekt** (Single Source of Truth, Overrides möglich), **Token-Targets** = Global Variants (Dark/Light, Rebranding, Länder) inkl. „copy style values between global variants", `registerToken`-API, `styleTokenOverridesProjectId`, Studio-Regel „Can override registered tokens?" (erlauben/verbieten).
- **Weiteres:** Content-Creator-Mode (eingeschränktes Editieren mit Design-Guardrails), Multiplayer/Branching/Cross-Project-Imports, Figma-Import (Vektor → DOM/CSS), End-User-Auth/RBAC.

### 5.3 Übernehmbare Funktionen

1. **Token-Targets als Modell für Dark Mode/Varianten** — unsere Theme-Modes sind der Anfang; die UI-Mechanik (Target wählen, Overrides anzeigen, Werte kopieren) ist der Ausbau.
2. **Override-Anzeige mit „Remove Style"** als Feinschliff unserer Override-Badges.
3. **Spotlight-Mode für Komponenten-Master** (Doppelklick in Instanz → Master editieren).
4. **Component-Data-Tab** (Props/Slots/Varianten zentral je Component) als Ergänzung unseres Komponenten-Tabs.
5. **Content-Creator-Mode** → für uns ein „Redaktionsmodus" im Review/Preview-Flow.
6. **Figma-Import** als Kandidat (unser Non-Ziel „Framer/Webflow-Import" ließe sich präzisieren).

### 5.4 UI-Lehren

- **Varianten brauchen eine sichtbare Grammatik:** Base, rote Overrides, kombinierbare States — man sieht immer, was wo überschrieben ist.
- **Tokens sind ein eigenes Panel** (Liste, Gruppen, Import/Export), nicht ein Farbwähler-Detail.
- **Eingeschränkte Modi** (Content Creator) sind ein Produktfeature, kein Rechtemodell-Anhang.

---

## 6. Querschnitt: die wichtigsten Lehren

1. **Der Agent gehört in den Editor.** Drei von vier haben ihn (Bob, Silex-MCP, Revyme-ai). Wir haben MCP + Live-Follow + Review-Diffs, aber kein Chat-Panel, keine Approval-Karten, keinen Turn-Revert. Das ist unsere größte UI-Lücke — und gleichzeitig unser Vorsprung, weil Frappes Bob keinen Diff hat.
2. **Panels und Commands als Registry.** Frappe (`createRegistry`) und Revyme (Panel-IDs) machen Erweiterbarkeit strukturell; wir haben feste Panels und eine Spotlight-Kommandoliste.
3. **Canvas-Bedienung ist das Produkt.** Box-Model-Griffe, Snap-Guides, Solo-Breakpoint, Kamera-Komfort (Wheel-Pan, Zoom am Cursor, Animation, Persistenz), Marquee — hier entscheidet sich „Framer-Gefühl".
4. **Style-Manager-Tiefe:** Suche, „nur geänderte", State-Menü, Token-Inline, Box-Model, Compound-Selektoren (Silex) + Override-Punkte/Targets (Plasmic) + Sections mit Keywords (Frappe).
5. **Motion-Tiefe** (Revyme) ist der nächste Schritt nach unseren Presets: Scroll-Trigger, Text-Effekte, Spring-Editor, Variants.
6. **Dark Mode + Tokens sind überall Standard** — inklusive Canvas-Dark-Preview (Frappe).
7. **Publishing/Deploy als Erlebnis:** Job-Status, Logs, Staging, Preview-Bild (Silex/Frappe).
8. **Onboarding/Demo** (Revyme-Tutorial, Frappe-Demo-Modus, Plasmic-Levels-Spiel) fehlt uns völlig.
9. **Performance-Muster** (Revyme: Geometrie-Caches, Vanilla-Stores, deferred Flush) sind die Blaupause für E18.
10. **Design-System-Disziplin:** Alle vier ziehen ihre Editor-Haut konsequent durch. Unser Tiefwasser/Lime-System mit Kontrastnachweisen ist stark — die Überarbeitung heißt: konsequent durchziehen, nicht neu erfinden.
11. **Historie/Versionen sichtbar machen** (Frappe VersionHistory, Plasmic Varianten-Overrides).
12. **Lizenzen beachten** (siehe §9): Muster und Ideen übernehmen, keinen Code kopieren.

---

## 7. Zielbild UI-Überarbeitung Senify

**Was wir schon haben** (Ausgangspunkt, nicht wegwerfen): dokumentiertes Editor-Designsystem mit Kontrastnachweisen (`packages/editor/src/ui/tokens.ts`), Topbar/Toolbar/Statusbar, drei Breakpoint-Frames + Live-Modus, Zoom-Footer + Frame-Labels + Dimming, Explorer mit Tastatur/Kontextmenü/Spotlight, Inline-Edit, Verlauf, Inspector mit vier Tabs + Forced States + Token-Picker + offener Property-Zeile, Komponenten (Overrides/Varianten/Versionen/Drift), Motion-Presets inkl. 3D, Marker-Overlay im Portal, Review-/Preview-/Release-Flow, MCP mit Teil-Parität, Referenz-Bibliothek.

**Vorschlag Zielbild:**

- **Shell:** Topbar 48 / Toolbar 40 / Statusbar 28 behalten; linke **Rail (48 px) + Panel-Registry** (Explorer, Insert/Blöcke, Komponenten, CMS, Medien, Referenzen, Agent), rechts Inspector 320 mit Tabs + **Suche/„nur geänderte"**; Panels resizable; Command-Palette als Command-Registry mit Shortcuts-Dialog.
- **Canvas:** Breakpoint-Header mit **Solo/Multi-Umschaltung** (3 Frames bleiben der Design-Modus), **Box-Model-Griffe + Guides**, Marquee, Kamera-Komfort (Wheel-Pan, Ctrl+Wheel-Zoom am Cursor, Kamera-Persistenz), konsistente Hover-/Auswahl-Ringe (Doppelkante haben wir).
- **Inspector:** Sections-Registry mit Keywords; State-Menü (alle Pseudo-Klassen + `::before/::after`-Content); Token-Inline-Buttons; Box-Model-Control; Gradient-/Shadow-Stacks; „Reset je Property" (haben wir) + „Remove Style" (Plasmic).
- **Agent:** Chat-Panel mit Streaming in die Canvas, Approval-Karten, Turn-Revert, **Diff-Ansicht** (unser Vorsprung) und Live-Follow (haben wir).
- **Designsystem:** Lichtkanten/Lime/Radius-0 als Signatur, Dark-only ok, Kontrast-Gate auf alle neuen Flächen ausweiten, Motion-Tokens unter 300 ms.
- **Onboarding:** Demo-Modus/Tutorial + leere Zustände.

---

## 8. Feature-Mapping auf Senify-Pakete

| Senify-Paket | Aus der Recherche |
|---|---|
| **E16-Rest** (UI-Modernisierung) | Silex-States, Plasmic-Targets/Overrides, Revyme-Panel-Registry, Frappe-Controls |
| **E6-Rest** (Inspektor) | Suche/Filter, State-Menü, Token-Inline, Box-Model (Silex/Frappe) |
| **E18** (Performance) | Revyme: Geometrie-Caches, Vanilla-Stores, deferred Flush |
| **E17-Rest** (Undo/History) | Frappe VersionHistory, Bob-Turn-Revert, Revyme-Diff-Historie |
| **E21/E22** (Agent Gate/Runs) | Frappe Bob (Approval, Revert), Silex Capability-Registry |
| **E10-Rest** (Motion) | Revyme: Scroll-Trigger, Text-Effekte, Spring-Editor |
| **E14** (Deploy) | Silex: Connectoren, Job-Status, Logs; Frappe: Staging |
| **E15** (Quality-Gates) | Frappe Analytics (DuckDB/ECharts) |
| **E24–E27** (Referenzen/Design) | Plasmic Token-Targets, Content-Creator-Mode, Figma-Import-Idee |
| **Neu (Kandidaten)** | Panel-/Command-Registry, Onboarding/Demo-Modus, Dark-Mode-Canvas, Box-Model-Griffe, Solo-Breakpoint, Redaktionsmodus |

---

## 9. Lizenzen

- **Revyme:** AGPL-3.0 mit zusätzlicher Notice-Preservation-Klausel + kommerzielle Option; Marken „Revyme" geschützt. Code-Übernahme in ein nicht-AGPL-Produkt wäre problematisch.
- **Silex:** AGPL-3.0 (OW2/NGI0-gefördert). Gleiche Vorsicht.
- **Frappe Builder:** **MIT** (seit Juli 2026) — Code-nahe Anleihen unkritisch.
- **Plasmic:** **MIT** außerhalb `platform/`; `platform/` ist AGPL. Für Muster in der UI-Schicht also meist unkritisch, für Plattform-Code nicht.

**Empfehlung:** In allen vier Fällen **Muster, Mechaniken und UX-Ideen** übernehmen (das ist nicht urheberrechtlich geschützt), aber **keinen Code wörtlich kopieren** — außer aus MIT-Teilen mit sauberem Hinweis.

---

## 10. Quellen

**Repos und Seiten**

- Revyme: <https://github.com/revyme-web/builder>, <https://revyme.com/>, README + `CLAUDE.md` (Architektur-Guide), lokaler Sparse-Klon `src/` (Stand 21.09.2026).
- Frappe Builder: <https://github.com/frappe/builder>, <https://frappe.io/builder>, <https://docs.frappe.io/builder>, README + `AGENTS.md`, lokaler Sparse-Klon `frontend/` + `builder/` (Stand 21.09.2026).
- Silex: <https://github.com/silexlabs/Silex>, <https://www.silex.me/>, <https://docs.silex.me/>, <https://roadmap.silex.me/>, README + `AGENTS.md`, lokaler Sparse-Klon `editor/`, `grapesjs-plugins/`, `common/`, `server/` (Commit `8171bc57`, 22.09.2026).
- Plasmic: <https://github.com/plasmicapp/plasmic>, <https://www.plasmic.app/>, <https://docs.plasmic.app/learn/> (intro, technical-overview, artboards, components, variants, interactions, tokens).

**Screenshots (per OCR ausgewertet)**

- Revyme: `docs/readme/builder-preview.webp`, `motion.webp`, `cms.webp`, `code-export.webp`, `localization.webp` (Repo).
- Frappe: README-Screenshot (`github.com/user-attachments/assets/d20cec8a-…`).
- Silex: `https://www.silex.me/img/HJKUdOfC5N-2400.webp`.
- Plasmic: README-Quickstart/-Showcase (`user-images.githubusercontent.com/…`).

**Senify-Bezug**

- `HANDOFF.md` (§2.26, §5, §6), `docs/verbesserungsplan.md` (E6, E10, E14–E18, E21–E27), `packages/editor/src/ui/tokens.ts`, `packages/editor/src/{canvas,inspector,explorer,spotlight,state,ui}`.
