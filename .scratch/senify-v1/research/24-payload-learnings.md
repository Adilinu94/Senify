# Research 24 — Payload Deep-Dive (Learnings für Senify)

> Stand 15.09.2026. Quelle: geklonte Repo `payloadcms/payload` (Shallow-Clone), Pfade relativ zu Repos/payload.
> Gelesen: `packages/payload/src/{fields,collections,versions,queues,auth,preferences,utilities}`, `packages/ui/src/{fields,forms,views,elements,providers}`, `packages/plugin-mcp/src`, `packages/live-preview/src`, `packages/db-postgres`, `docs/{fields,versions,access-control,local-api,jobs-queue,rich-text}`, `pnpm-workspace.yaml`.
> Version im Clone: **Payload 4.0.0-canary.14** (React 19.2, Zod 4, TS 7 native), 44 Packages, pnpm-Monorepo.

---

## 1. Was Payload ist (Architektur & Module)

**Modell:** Config-as-Code-CMS. Die gesamte Anwendung (Schema, Access, Admin, Jobs, Editor) wird in typisierten TS-Configs deklariert (`buildConfig`); daraus generiert Payload Runtime-Objekte, DB-Schema, Admin-UI, REST/GraphQL-APIs und TS-Typen.

**Monorepo-Kern** (Auswahl aus 44 Packages):

| Package | Rolle | Für Senify relevant |
|---|---|---|
| `packages/payload` | Kern: Config, Fields, Collections, Versions, Queues, Auth, Local API, JSON-Schema-Gen | ja (Muster) |
| `packages/ui` | Admin-Panel (React, Field-Controls, Views, Providers, Form-State) | ja (Muster) |
| `packages/plugin-mcp` | offizielles MCP-Plugin (HTTP+stdio, CRUD-/Schema-Tools) | **hoch** (Blaupause MCP) |
| `packages/db-postgres`, `db-mongodb`, `db-sqlite`, `drizzle` | DB-Adapter; SQL-Schema wird aus Config generiert | nein (JSONB-Ansatz bleibt) |
| `packages/richtext-lexical` | Lexical-basierter Rich-Text (Feature-Registry) | nur Modell-Idee |
| `packages/live-preview{,-react,-vue}` | postMessage-Live-Preview für Frontends | optional |
| `packages/next`, `tanstack-start` | Integrationen (Admin + API eingebettet in Host-Framework) | nein (Desktop eigener Host) |
| `packages/translations` | i18n-Layer (`getTranslation`, Label-Funktionen) | ja (klein) |
| `packages/plugin-{seo,search,redirects,nested-docs,multi-tenant,ecommerce,form-builder,...}` | Feature-Marktplatz | punktuell |
| `app/`, `examples/`, `templates/`, `test/` | Playground, Beispiele, Test-Suite | nein |

**Schichten (wichtigstes Architektur-Learning):** Alle Operationen existieren einmal als Kern (`packages/payload/src/<entity>/operations/*`) und werden von drei Zugängen geteilt — REST-Endpoints, GraphQL-Resolvern und der **Local API** (`payload.create/update/find/...`). Der Admin nutzt primär die Local API bzw. Server-Functions; Hooks/Access/Validierung laufen in *jedem* Zugang identisch (siehe `docs/local-api/overview.mdx`, `packages/payload/src/auth/getAccessResults.ts`).

**Admin-Shell:** React-SPA (`packages/ui/src/views/{Dashboard,List,Edit,Versions,...}`), Server-Rendering einzelner Feld-Slots über React Server Components + `importMap` (`packages/ui/src/elements/RenderServerComponent`), Styling eigenes SCSS-System, Preferences pro User/Nutzer (`packages/payload/src/preferences`).

**Konsequenz für Senify:** Der Local-API-Gedanke („ein Kern, drei Adapter") ist exakt die richtige Struktur für „MCP + Desktop + HTTP". Payloads Preis dafür: alles ist an Next/RSC koppelbar, aber nicht kopplungspflichtig — der Kern selbst ist framework-neutral, nur die UI-Distribution ist es nicht.

---

## 2. Feldsystem & Admin-UI-Generierung

### 2.1 Feldmodell
`packages/payload/src/fields/config/types.ts`:

- **Diskriminierte Union** `Field` (Z. 1799ff) mit gemeinsamer Basis (`FieldBase`: `name`, `type`, `label`, `required`, `defaultValue`, `localized`, `unique`, `index`, `validate`, `hooks`, `access`, `admin`, `custom`) plus typ-spezifischen Options (z. B. `TextField` Z. 611: `minLength/maxLength/hasMany`; `SelectField` Z. 1145: `options/hasMany`; `RelationshipField` Z. 1285: `relationTo/hasMany/filterOptions`).
- **Drei Kategorien** (docs/fields/overview.mdx): Data-Fields (speichern), Presentational-Fields (`row`, `collapsible`, unnamed `tabs`/`group` — nur Layout, `name`-los), Virtual-Fields (`join`; generisch `virtual: true` + `afterRead`-Hook).
- **UI-Metadaten am Schema** — `FieldAdmin` (Z. 366–401): `description` (string *oder Funktion* → JSDoc + UI), `condition` (Skript-Hook `({ data, siblingData, user }) => boolean`, läuft **Server und Client**), `position: 'main' | 'sidebar'`, `width`, `hidden`, `readOnly`, `disabled` (auch granular `{ field, column, filter, groupBy, bulkEdit }`), `style`, `className` und **`components`** (`Cell`, `Description`, `Diff`, `Field`, `Filter` → austauschbare React-/Server-Komponenten).
- **Validierung:** eingebaute Default-Validatoren pro Typ in `packages/payload/src/fields/validations.ts` (`text` Z. 46: required/`minLength`/`maxLength`/hasMany-rows; `blocks` Z. 619: min/maxRows + `invalidBlockSlugs`; `relationship` Z. 889 usw.) — **plus** Custom-`validate(value, options)` mit reichem Kontext (`siblingData`, `path`, `schemaPath`, `previousValue`, `operation`, `t`). Dieselbe Funktion läuft im Browser (Live-Feedback) und auf dem Server (Teil von `beforeValidate`).
- **Feld-Hooks:** `beforeValidate`, `beforeChange`, `afterChange`, `afterRead`, `beforeDuplicate` (`FieldHookArgs` Z. 172–238: `siblingData`, `siblingFields`, `path`/`schemaPath` (mit/ohne Indizes!), `previousValue`, `req`, `operation`, …).
- **Feld-Access:** eigene Lese-/Schreibrechte pro Feld (`SharedFieldAccessArgs` Z. 244ff) — wirkt nicht nur zur Laufzeit, sondern filtert auch den **Admin-Form-State** und das **MCP-Input-Schema** (`utilities/entityInputSchema/filterFieldsByAccess.ts`).

### 2.2 Schema → JSON Schema (eine Quelle für Typen UND MCP)
`packages/payload/src/utilities/configToJSONSchema.ts`:

- `variant: 'input' | 'output'` — getrennte Read-/Write-Shapes. Auf `input` werden virtuelle/join-Felder ausgeschlossen (`fieldIsInputExcluded` Z. 24) und Felder mit Default dürfen weggelassen werden (Z. 460). Named-Interfaces werden als `$defs` registriert, bei Abweichung mit `Input`-Suffix (Z. 434–446).
- **Blocks als `oneOf` mit Diskriminator**: pro Block ein Objekt-Schema mit `blockType: { const: '<slug>' }` und `required: ['blockType', ...]` (Z. 498–551, Z. 1623ff).
- Relationship/Upload auf `input` = ID-Referenzen; `relationship` mit Polymorphie als Objekt mit `relationTo`.
- Dieselbe Datei speist TS-Typgenerierung, GraphQL und das MCP-Plugin (`getCollectionInputSchema` in `utilities/entityInputSchema/getEntityInputSchema.ts` Z. 17–44 — access-gefiltert!).

### 2.3 „Schema → Editor-UI": die Rendering-Pipeline (das wichtigste Muster)
1. **Config-Sanitization:** `config/sanitize.ts` → Runtime-Config; Z. 471: `collection.flattenedFields = flattenAllFields({ fields })` — einmal geflattete Feldliste als stabile Validierungs-/Schema-Grundlage.
2. **Server: Form-State-Bau** — `packages/ui/src/forms/fieldSchemasToFormState/index.tsx` + `addFieldStatePromise.ts` (Z. 114ff): erzeugt einen **flachen State `path → FieldState`** (`value`, `initialValue`, `valid`, `errorMessage`, `rows` mit `blockType`/`id` für Arrays/Blocks, `customComponents`, `passesCondition`, optional `fieldSchema`). Inklusive: Default-Berechnung, Validierung (auch live bei jedem Field-Request), Condition-Auswertung, Rechte, Layout-Relevanz.
3. **Server: Custom-Components je Feld** — `forms/fieldSchemasToFormState/renderField.tsx` (Z. 27–401): pro Feld werden `admin.components.{Label,Description,Error,BeforeInput,AfterInput,Field}` und Rich-Text-/UI-Sonderfälle als RSC in den State geschrieben; `label`-Funktionen werden serverseitig ausgewertet. `WatchCondition` (Z. 255) macht bedingte Felder reaktiv ohne Full-Reload.
4. **Client: Typ → Control-Mapping an EINER Stelle** — `packages/ui/src/forms/RenderFields/RenderField.tsx` (Z. 82–151): ein `switch (clientFieldConfig.type)` mit 1:1-Mapping auf die 24 Field-Komponenten (`../../fields/{Text,Blocks,Array,Relationship,RichText,...}`). Jede Control ist gleich gebaut: `useField()` (Bindung an Form-State: `value`, `setValue`, `showError`, `disabled`, `customComponents`), `withCondition()` (Condition-Gate), `mergeFieldStyles()`, plus `Input.tsx` als Presentational-Shell.
5. **Custom-Component-Escape-Hatch:** `fields?.[path]?.customComponents?.Field` überschreibt das Control komplett (RenderField.tsx Z. 55–73); selbiges auf Server-Seite. D. h. **jede Feld-Cell ist ersetzbar, ohne das Datenmodell anzufassen** — genau die Entkopplung, die eine Registry-Plattform braucht.

### 2.4 Was davon trägt für Senify
- Das **Control-Mapping als einzige Tabelle** (Typ → Komponente) ist genau das, was Senifys „Registry → Editor-UI-Generierung" (Artefakt 09) beschreibt — Senify sollte dieselbe Ein-Karten-Stelle bauen, keine verstreuten Implementierungen.
- **UI-Metadaten gehören ins Schema** (Senify-Artefakt 08 hat das bereits: Control + Metadaten in der SectionDefinition). Payload zeigt die konkrete Ausprägung: `condition`, `description`, `position`, `width`, Gruppierung über Feldverschachtelung (Tabs/Row/Collapsible) statt separater Panel-Konfiguration.
- **Warnung:** Payloads `condition`/`description`/`label` sind **Funktionen**, die im Server-Runtime-Kontext leben. Für Senify ist der Registry-Katalog serialisierbar (TypeBox/JSON) und MCP-exportierbar — Condition-Funktionen wären ein Bruch. Übernehmen als **deklarative Conditions** (z. B. `{ prop: 'variant', equals: 'split' }`), nie als Code.
- Feld-Hooks/Validierung: Senify hat Validierung im TypeBox-Schema. Payloads Trennung „Default-Validatoren pro Typ + Custom-Validate mit Kontext" ist die richtige Schichtung auch für uns (Registry-Validator + sektionsspezifische Validierung).

---

## 3. Blocks-Field & JSON-Modelle

### 3.1 Konfiguration
- `Block` (types.ts Z. 1483–1570): `slug` (⇒ wird als `blockType` gespeichert), `fields[]`, `labels`, `interfaceName`, `dbName` (SQL-Tabellenname), `jsx`/`admin.jsx` (Preview-Komponente), und Admin: `group` (Gruppierung im Auswahl-Drawer), **`images.{icon,thumbnail}`** (20×20 / 3:2 fürs Auswahl-Raster), `disableBlockName`, `components.{Block,Label}`, `custom`.
- `BlocksField` (Z. 1578–1632): `blocks: (Block | BlockSlug)[]` (inline ODER Referenz auf global registrierte Blocks in `config.blocks`), `minRows`/`maxRows`, `isSortable`, `initCollapsed`, und **`filterOptions`** (Z. 1598–1626): erlaubte Block-Slugs dynamisch aus `siblingData` — Re-Evaluierung bei jeder Datenänderung; verbotene, aber vorhandene Blocks ⇒ Validierungsfehler.

### 3.2 Datenmodell (JSON)
Ein Blocks-Feld speichert ein **Array von Objekten**:

```json
[
  { "id": "…24-char…", "blockType": "hero", "blockName": "Optionaler Name", "…block-eigene Felder…" },
  { "id": "…", "blockType": "pricing", "…": "…" }
]
```

- Reihenfolge = Array-Ordnung (Sortierung per dnd-kit in der UI, `DraggableSortable`).
- Verschachtelung beliebig: Blocks in Blocks, Arrays in Blocks etc. — jeder Ebene bekommt einen eigenen Form-State-Pfad (`rows[i]…`) und (bei SQL) eigene Tabellen.
- `blockType` ist der Diskriminator; Validierung gegen `block.slug` passiert in `fields/hooks/beforeValidate/promise.ts` (Z. 417ff) und `beforeChange/promise.ts` (Z. 222ff, `invalidBlockSlugs`).
- Duplizieren regeneriert IDs (`beforeDuplicate/promise.ts` Z. 189ff).
- **Persistenz:** Mongo = eingebettet; SQL-Adapter = pro Block(feld) eigene Tabellen (`Block.dbName`; docs/fields/blocks.mdx Z. 204) mit `_order`-Spalten (config/sanitize.ts Z. 441ff).
- JSON Schema: s. o. (`oneOf` + `blockType.const`).

### 3.3 Block-Auswahl-UI (Vorbild für Senifys Section-Picker)
- `packages/ui/src/fields/Blocks/BlocksDrawer/index.tsx` + `BlockSelector/index.tsx`: Drawer mit Suche, Gruppen (`admin.group`), Karten/Thumbnails (`images`), Doppelklick = Insert; `RowLabel` erlaubt lesbare Zeilentitel.
- Row-Aktionen (`RowActions.tsx`): duplicate, remove, copy/paste — Clipboard via `localStorage._payloadClipboard` inkl. Schema-Kompatibilitätsprüfung im Zielfeld und ID-Regeneration (docs/fields/blocks.mdx Z. 146–181).
- `initCollapsed`, `CollapseAllToggle` für lange Bäume.

### 3.4 Vergleich zu Senifys NodeTree — kritisch
| Aspekt | Payload Blocks | Senify NodeTree (01) |
|---|---|---|
| Struktur | verschachtelte Arrays im Dokument; Feld-Rewrite pro Save | **flach** `nodes: Record<Id, Node>` + `children`/`slots` |
| Diskriminator | `blockType` (const im JSON-Schema) | `type` (Registry-Key, TypeBox-Union) — **gleich gut, gleiche Idee** |
| Regeln Eltern/Kind | nur „welche Blocks in *diesem* Feld erlaubt" (`blocks` + `filterOptions`) | **registry-reguliert** (`allowedChildren`, Slots) — stärker |
| Slots | existiert nicht (alles ist ein Array) | benannte `slots` — Payload fehlt das Konzept |
| Schreibgranularität | ganzes Blocks-Feld als Wert (Vollreplace) | kanonische Mutationen (`insertNode` …) mit Undo-Patch |
| Sichtbarkeit | `admin.condition`, `filterOptions` | `hidden`, Varianten — `filterOptions`-Idee fehlt uns: **dynamisch erlaubte Sektionen je Kontext** (z. B. „im Testimonial-Kontext nur Quote/Slider") ist ein sauberer Guardrail **innerhalb** des Slot-Konzepts |
| Auswahl-UX | Drawer + Suche + Gruppen + Thumbnails | Sektionen brauchen genau das (Artefakt 08: Thumbnail/Beispiel je Sektion) |

**Fazit:** Payload bestätigt das Blocks-Grundmodell (Diskriminator + Array-Ordnung + Schema-validiert), aber Senifys flacher Baum mit IDs, Mutationen und Slots ist für Diff/Undo/Agenten klar überlegen. Konkret übernehmen: **Section-Picker-Drawer**, **Gruppen**, **Thumbnails**, **`filterOptions`-Guardrail**, **`blockName`-Pattern** (optionaler Anzeigename je Instanz), **Collapse-Verhalten**.

---

## 4. Drafts/Versionen/Lifecycle

### 4.1 Modell
- Versions sind **Default an** (`maxPerDoc: 100`, `versions: false` = opt-out); Drafts sind opt-in über `versions.drafts { autosave, schedulePublish, validate }` (`packages/payload/src/versions/types.ts`).
- **Speicherung:** eigene Version-Collection/Table `_<slug>_versions`; jede Version = `{ parent, version (VOLLSTÄNDIGE Dokument-Kopie), autosave, createdAt, updatedAt, latest? }` (`docs/versions/overview.mdx` Z. 104–128; `versions/types.ts` `TypeWithVersion`).
- **Draft-Flag `_status`:** Payload injiziert ein Select-Feld `_status: 'draft' | 'published'` (Default `draft`, indexed, im Formular versteckt via `components.Field: false`) — `versions/baseFields.ts` Z. 15–31.

### 4.2 Schreib-/Publish-Semantik (docs/versions/drafts.mdx Z. 77–130)
- `draft: true` ⇒ **nur** Versions-Tabelle wird geschrieben, Main-Document bleibt unangetastet; Required-Validierung aus.
- `draft: false`/omitted ⇒ Main-Collection **und** Version.
- `_status: 'published'` in `data` publiziert und **überschreibt** `draft: true`.
- Erstes Create landet immer in der Main-Collection (`_status` default `draft`).
- `restoreVersion` erzeugt einen neuen Stand aus einer alten Version (`versions/saveVersion.ts` Z. 102: `operation: 'restoreVersion'` → `createdAt` wird mitgeführt) — **kein Rewrite**, append-Semantik.

### 4.3 Autosave (starkes Detail)
- UI-debounced (`elements/Autosave/index.tsx`: `useDebounce(formState, interval)`, Default 800 ms aus `getAutosaveInterval`) und rendert die Änderungen als `draft: true`-PATCH.
- Server: `saveVersion()` ruft bei `autosave` zuerst **`updateLatestVersion`** mit Guard `shouldUpdate = v => v.autosave === true` (`versions/saveVersion.ts` Z. 83–94): **die letzte Autosave-Version wird in-place überschrieben statt eine neue anzulegen** — verhindert Versions-Flood. Inklusive Concurrency-Absicherung (bei Update-Konflikt wird die frische Version geprüft, `updateLatestVersion.ts` Z. 95–136).
- Retention: `enforceMaxVersions` löscht alles jenseits `maxPerDoc`, sortiert nach `updatedAt` (`versions/enforceMaxVersions.ts`).
- Scheduled Publish/Unpublish läuft über die Jobs-Queue (`versions/schedule/job.ts`).

### 4.4 UI-Statusableitung — identisch zu Senify
Drei angezeigte Zustände (docs/versions/drafts.mdx Z. 34–42):
1. **Draft** (nie publiziert), 2. **Published** (keine neueren Drafts), 3. **Changed** (= publiziert, aber neuere Drafts).
Senifys abgeleiteter Page-Status (`draft-only / published / draft-ahead`, Artefakt 05) ist dieselbe Denkfigur — gutes Validierungssignal. Payload berechnet ihn aus `_status` + Versions-Metadaten, Senify aus `draft ≠ publishedRevision` — letzteres ist billiger.

### 4.5 Was Payload NICHT hat (Lücke = Senify-Eigenbau bleibt)
- **Kein Release-/Bündel-Konzept**: jedes Dokument wird einzeln publiziert; kein atomarer Site-Commit, kein Site-weiter Rollback, keine „alle Seiten + Theme"-Bündelung. Senifys Release (Artefakt 05) ist Sanity-inspiriert und bleibt richtig.
- Keine Preview-*Artefakte* mit TTL/Token-URL (Payload-Preview ist Live-URL/Iframe, kein eingefrorener Build).
- Vollkopie-Versionen pro Save wären für Senifys Page-Revisionen unnötig teuer — Senify: Draft als lebende Struktur + Revision nur bei Publish (so schon entschieden), zusätzlich übernehmen: (a) **Autosave-Merge-Pattern** („letzte Draft-Save überschreiben"), (b) **max-Retention**, (c) **`_status`-Hidden-Feld** als internes Metadatum.

---

## 5. Access Control, Local API, Jobs (+ MCP)

### 5.1 Access Control
- **Pro Operation**: `CollectionAccess` = `{ create, read, update, delete, readVersions, unlock, admin }`, `GlobalAccess` analog (`collections/config/types.ts` Z. 536ff). Jede Funktion bekommt `{ req: { payload, user }, id?, data?, doc?, siblingData?, blockData? }`.
- **Rückgabe boolean ODER `Where`-Query** — Where wird als Row-Level-Filter in Reads/Updates gemerged (z. B. „nur eigene Orders"). Das ist elegant: Rechte sind nicht nur Gate, sondern **Query-Constraint**.
- **Feld-Level-Access** existiert parallel (create/read/update) und wird in Admin-Form-State, Local-Reads **und MCP-Input-Schemas** respektiert (`filterFieldsByAccess.ts`).
- **`baseAccess`** (config-weit): zusätzliche Bedingung, per `AND` mit der Entity-Access verknüpft; kann Operationen früh ablehnen (docs/access-control/overview.mdx Z. 55–95).
- **Permissions-Reflection für die UI**: `getAccessResults` (`auth/getAccessResults.ts`) berechnet beim Login für *alle* Collections/Globals/Felder, was der User darf (`canAccessAdmin`, je Operation + Feld-Level via `getEntityPermissions` + `sanitizePermissions`); der Admin blendet Unerlaubtes aus; eigener Endpoint `auth/operations/access.ts`. Access-Funktionen werden dabei ohne Dokument-Kontext aufgerufen (id/data `undefined`) — deshalb müssen Funktionen defensiv sein (docs-Banner Z. 103–112).
- Default: nur User der `admin.user`-Collection dürfen rein (`defaultAccess`), alles andere ist zu.

### 5.2 Local API
- Alle Operationen (`create/find/findByID/update/delete/count/...` + Versions + Jobs) direkt in Node, ohne HTTP (`docs/local-api/overview.mdx`).
- **Wichtigste Semantik:** `overrideAccess` ist **default `true`** (Access komplett aus!) — „Server hat Vollmacht", Opt-in zum Prüfen mit `user`-Objekt. `req` sollte durchgereicht werden (Transaktionen, Hooks, Context). Weitere Local-only Optionen: `depth`/`populate`/`select`, `showHiddenFields`, `disableTransaction`, `context` (Hook-Kanal), `disableErrors`.
- Fehlerverhalten: `disableErrors: true` → `null`/leer statt Throw (findByID/find).

### 5.3 MCP-Plugin (`packages/plugin-mcp`) — die Blaupause für Senifys Agenten-Surface
- **Transport:** `buildMcpServer` baut denselben Server für HTTP- und stdio-Betrieb (`mcp/buildMcpServer.ts`, `stdio.ts`, `bin.js`). Server-Kern transport-agnostisch — deckt sich mit Senify-Artefakt 04 („transport-agnostischer Kern").
- **Tool-Katalog:** pro Collection/Global je CRUD-/Query-Tool (`collections/createTool.ts`, `updateTool.ts`, `findTool.ts`, `deleteTool.ts`, `countTool.ts`, `findDistinctTool.ts`, `duplicateTool.ts`) + Versions-Tools (`findVersionsTool`, `restoreVersionTool`, `countVersionsTool`) + Introspektion (`getCollectionSchemaTool`, `getGlobalSchemaTool`, `getConfigInfoTool`). Genau Senifys geplante Kategorie „High-Level-Verben + Schema-Tool".
- **Tool-Input = Feld-Schema:** `updateDocumentInputSchema`/`getCollectionInputSchema` (Input-Variante, access-gefiltert) → `slug` + `data` + Operations-Optionen (`draft`, `locale`, `where`, `select`, `depth`…); zusätzlich pro Tool `fileInputSchema` (Uploads: externalURL/base64/uploadReference).
- **Access doppelt abgesichert:** globale Plugin-Access (`defaultAccess = Boolean(req.user)`, `defaultAccess.ts`) **und** per-Item-Match in `authorizedMCP.items` inkl. Permissions-Check (`updateTool.ts` Z. 23–24; `buildMcpServer.ts` Z. 103–122) → Defense-in-Depth, „Tool nicht verfügbar" als klare Fehlermeldung.
- **Agenten-Fehlerführung:** bei Write-Fehlern wird das (access-gefilterte) Input-Schema an die Antwort gehängt (`updateTool.ts` Z. 141–160) — der Agent kann sich selbst korrigieren. `structuredContent` + Text-Block parallel. Genau das, was Senifys Fehler-Katalog („strukturierte Fehler mit Handlungsanweisung") verspricht.
- **Annotations:** `{ title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint }` an jedem Tool (`updateTool.ts` Z. 25–31) — maschinenlesbare Governance für Agenten.
- **Validierung vor Ausführung:** `validateCollectionData` (Kern-Validatoren, `partial: true` für Updates) → Fehler mit Schema-Response; `stripVirtualFields` + Point-Transform als Datenaufbereitung.
- **Response-Hygiene:** interner `doc`-Wert wird vor dem Versand entfernt, `overrideResponse`-Hook + `afterToolCall`-Plugin-Hooks (`buildMcpServer.ts` Z. 53–70) — anpassbar, ohne Handler zu ändern.

### 5.4 Jobs/Queue & Hooks
- **Konzepte** (`docs/jobs-queue/overview.mdx`, `queues/config/types/taskTypes.ts`): *Task* (slug, typisierter `input`/`output`, `handler({ req, input, job, tasks })`, Retry/Backoff, `schedule: [{ cron, queue }]`, onSuccess/onFail) · *Workflow* (Tasks in Reihenfolge, Retry ab Fehlerpunkt, `taskStatus` pro Schritt) · *Job* (Instanz eines Tasks/Workflows, persistiert in der internen `payload-jobs`-Collection, `waitUntil` für Zeitsteuerung) · *Queue* (benannte Gruppe, `concurrency`).
- **Ausführungswege:** Bin-Script (`jobs:run`/`jobs:handle-schedules`) für Dedicated Server, `autoRun`-Config (Next-intern), HTTP-Endpoints für Serverless-Cron, oder manuell `payload.jobs.run()` (`queues/localAPI.ts`). Heartbeat + Concurrency pro Queue.
- **Hooks (Lifecycle):** Collection `beforeValidate | beforeChange | afterChange | beforeRead | afterRead | beforeDelete | afterDelete | afterOperation | beforeDuplicate | me`; Field- und Global-Pendants (`collections/config/types.ts` Z. 547–569). `req.context` reicht Metadaten von außen in Hooks (z. B. „source: agent").
- **Für Senify:** Task-Modell passt 1:1 auf Screenshot-Capture/Build/Preview-TTL-Cleanup; `queue`-Trennung (interaktiv vs. batch), `waitUntil` (Preview-Ablauf), exponential/fixed Backoff (Build-Retries) übernehmen. Jobs-Collection auch als **Audit-Oberfläche** nutzbar (Payload verbirgt sie standardmäßig: `admin.hidden`, Access eingeschränkt — gutes Muster für interne Runs).

---

## 6. Admin-UX & Programm-Shell-Learnings

### 6.1 Views (Vorbild Content-Workspace + Shell)
- **Dashboard** (`views/Dashboard`): konfigurierbare Widgets, drag Layout (`useDashboardLayout`, `collisionDetection`), pro-User persistiert. → Desktop: „Projekte/Referenzen"-Tab mit Karten/Layouts statt fixem Grid.
- **List View** (`views/List`): Spalten konfigurierbar (`admin.defaultColumns`) **und** pro User über `Preferences`/`TableColumns` gespeichert; `ListWhereBuilder` (Filter-Builder), `GroupBy`, Sortierung, Pagination + `PerPage`, Bulk (`SelectMany`, `EditMany`, `DeleteMany`), Suche, `ColumnSelection`. → direkt die Blaupause für Senifys Entry-Listen (Content-Kern).
- **Edit View** (`views/Edit/index.tsx`): zentraler `DocumentInfo`-Provider (Dokument, Permissions, Preferences, Lock-State); `DocumentControls` mit Save / SaveDraft / Publish / Unpublish / SchedulePublish / Preview / Status / Duplicate / Delete; Felder mit `position: sidebar` landen in der Meta-Leiste; `StepNav`-Breadcrumb; `LeaveWithoutSaving`-Guard; Autosave-Indikator (`minimumAnimationTime` verhindert Flackern); Stale-Data-Detection (`DocumentStaleData`), Multi-Tab-Events (`DocumentEvents`), Locked-Banner + `DocumentTakeOver`.
- **Versions-View** (`views/Versions`): Versions-Timeline + Diff-Ansicht (`FieldDiffContainer`, `HTMLDiff`) + Restore.
- **Auth/Account/API-Keys**: komplettes Flow-Set inkl. `CreateFirstUser` — für Senify-Scope nicht nötig (Single-Operator), aber API-Key-UX als Referenz für Tokens (Artefakt 04).

### 6.2 Wiederkehrende Shell-Elemente (direkt für Desktop-Tabs übertragbar)
- **Nav mit Gruppen** (`elements/Nav`, `NavGroup`; `admin.group`, `admin.hidden` per Funktion) → Tab-/Sidebar-Struktur „Referenzen/Projekte/Editor/Einstellungen" mit derselben Gruppierungs-/Hidden-Logik (z. B. Entwicklungs-Tools je Umgebung ausblenden).
- **Command Palette** (`elements/CommandPalette`, Cmd+K), Toasts (`ToastContainer`), `StepNav`, `Localizer` (Locale-Wechsel), `Status`-Pills, `PillSelector` (z. B. Status-Filter).
- **Preferences-Layer** (`packages/payload/src/preferences/{findOne,update,delete}.ts` + `keys.ts`): generische Key-Value-UI-Zustände pro User **und** pro Dokument (Spalten, collapsed Rows, Dashboard-Layout). → Desktop: Fenster-/Tab-Layout, Spaltenbreiten, zuletzt geöffnete Seiten, Review-Einstellungen.
- **Locking:** eigene Collection `payload-locked-documents` (Felder `document`, `globalSlug`, `user`; `locked-documents/config.ts`) mit Pessimistik-Lock + Take-over-UI. Senifys Entscheidung ist optimistisches Locking (`baseDraftVersion`) — für Single-Operator richtig; das **Take-over-Muster** („X bearbeitet gerade, übernehmen?") als v2-Notiz.
- **Trash:** Soft-Delete + Papierkorb-View + Restore (`docs/trash`) — Kandidat für Entry-Deletes (statt Hard-Delete) im Content-Kern.

### 6.3 Live Preview (optional relevant)
- Protokoll: Admin-Iframe/Popup ↔ Frontend über `postMessage` (`payload-live-preview`-Typ), `ready`/`subscribe`/`unsubscribe` (`packages/live-preview/src/*`); Daten-Refresh über `mergeData` (POST mit `X-Payload-HTTP-Method-Override: GET`, Liefert `depth`/`locale` mit) — das Frontend mergt und re-rendert.
- Senify-Editor hat Canvas + echte Build-Preview (Artefakt 09). Das Live-Preview-Muster wäre der **dritte Modus** („echte Seite im iframe mit Live-Daten") — lohnt später; das `mergeData`-Muster (Server entscheidet über Population) ist auch für den Preview-Build nützlich.

---

## 7. Übernahme-Tabelle

| Bereich | Payload-Muster | Empfehlung für Senify | Quelle (Dateipfad) |
|---|---|---|---|
| Field-Typmodell | Diskriminierte Union + Base + typ-spezifische Options | Übernehmen als Vorbild für Props-Schema-Definitionen der Registry (einheitliche Basis, typ-spezifische Felder) | `packages/payload/src/fields/config/types.ts` (Z. 563–1799) |
| Control-Mapping | Ein zentrales `switch(type)` → UI-Komponente | **Übernehmen**: genau EINE Mapping-Tabelle in Editor/Desktop (Registry-Control → Komponente) | `packages/ui/src/forms/RenderFields/RenderField.tsx` |
| UI-Metadaten am Schema | `admin.{description,condition,position,width,hidden,disabled}` | Übernehmen in `SectionDefinition.ui`, aber **deklarativ/serialisierbar** (keine Funktionen — MCP-Export!) | `fields/config/types.ts` (Z. 366–401) |
| Bedingte Sichtbarkeit | `condition` + `WatchCondition` (Server-ausgewertet, Client reaktiv) | Übernehmen als declarative Conditions; Editor wertet lokal aus, Server validiert | `renderField.tsx` (Z. 255), `fields/config/types.ts` (Z. 284) |
| Custom-Component-Slots | `Label/Description/Error/BeforeInput/AfterInput/Field` austauschbar | Übernehmen als kuratierten Escape-Hatch (Plattform-Sektionen, nicht pro Site-Code) | `renderField.tsx` (Z. 305–400) |
| Form-State-Schicht | Server baut flachen `path→state` (Defaults + Validierung + Rechte), Client rendert | Muster übernehmen für Entry-Editor/Props-Panels (Server liefert Zustand) — Implementierung eigen (kein RSC) | `packages/ui/src/forms/fieldSchemasToFormState/*` |
| Section-Picker | Blocks-Drawer: Suche + `admin.group` + Thumbnails; Doppelklick-Insert | Übernehmen für „Sektion hinzufügen" (Artefakt 08: Thumbnail + Golden-Beispiel) | `packages/ui/src/fields/Blocks/BlocksDrawer/*`, `BlockSelector/*` |
| Kontext-Guardrails | `filterOptions` (dynamisch erlaubte Blocks je Kontext) | Übernehmen als Ergänzung zu `allowedChildren`: kontextabhängig erlaubte Sektionen (z. B. in Testimonial-Slot) | `fields/config/types.ts` (Z. 1598–1626) |
| Blocks-JSON-Schema | `oneOf` + `blockType.const` Diskriminator | Übernehmen für NodeTree-Validierung/-JSON-Schema (Agenten-Tool-Inputs) | `utilities/configToJSONSchema.ts` (Z. 498–551) |
| Instanz-Namen/Collapse | optionales `blockName`, `initCollapsed`, Collapse-All | Übernehmen (Outline-UX im Editor/Agent-Reads) | `fields/config/types.ts` (Z. 1504), `Blocks/index.tsx` |
| Draft-Autosave | letzte Autosave-Version in-place überschreiben; Retention-Limit | Übernehmen: Draft-Patches kollabieren (kein Versions-Flood); Revisions-Retention konfigurieren | `versions/updateLatestVersion.ts`, `versions/saveVersion.ts`, `versions/enforceMaxVersions.ts` |
| Status-Ableitung | draft / published / **changed** aus Metadaten | Bestätigt: Senify draft-only / published / draft-ahead ist dasselbe Modell | `docs/versions/drafts.mdx` (Z. 34–42) |
| Restore-Semantik | `restoreVersion` = neuer Stand (append-only) | Bestätigt Artefakt 05 (Restore → neuer Draft; Rollback → neues Release) | `versions/saveVersion.ts` (Z. 102) |
| Access-Modell | Operations-Funktionen; Boolean **oder Where-Query**; `baseAccess` AND; Reflection für UI | Teilweise: Row-Filter-Idee für Entry-Zugriffe notieren; Senify bleibt bei Scopes read/write/publish (einfacher, ausreichend) | `collections/config/types.ts` (Z. 536ff), `auth/getAccessResults.ts` |
| Local-API-Architektur | ein Operations-Kern, drei Adapter (REST/GraphQL/Local) | **Übernehmen**: Senify-Kern als Service-Layer; MCP, Desktop, HTTP sind dünne Adapter | `docs/local-api/overview.mdx` |
| MCP-Tools | CRUD + Schema + Versions-Tools pro Entity; Input aus Feld-Schema (Input-Variante, access-gefiltert); Fehler enthalten Schema; Annotations | **Direkt als Blaupause** für Senify-MCP-Tool-Katalog (Artefakt 10) | `packages/plugin-mcp/src/**` |
| Jobs | Task/Workflow/Queue, Retry+Backoff, `waitUntil`, Cron-Schedules, Jobs-Collection | Übernehmen für Builds/Screenshots/Previews/TTL-Cleanup (Artefakt 14/19) | `queues/config/types/taskTypes.ts`, `docs/jobs-queue/overview.mdx` |
| Lifecycle-Hooks | `beforeChange/afterChange/afterOperation` + `req.context` | Übernehmen: Audit + Trigger (Preview-Build, Screenshot) | `collections/config/types.ts` (Z. 547–569) |
| Listen-View | `defaultColumns` + User-Preferences + Filter-Builder + GroupBy + Bulk | Übernehmen für Entry-Listen (Content-Kern) | `views/List/*`, `packages/payload/src/preferences/*` |
| Shell/Preferences | Nav-Gruppen, Command Palette, per-User UI-State | Übernehmen für Desktop-Tabs (Referenzen/Projekte/Editor/Einstellungen) | `elements/{Nav,CommandPalette}`, `preferences/*` |
| Trash | Soft-Delete + Restore-View | Prüfen für Entries (Papierkorb statt Hard-Delete) | `docs/trash` |
| Locking | pesimistisch (`payload-locked-documents`) + Take-over | Nicht v1 (optimistisch bleibt); Take-over als v2-Notiz | `locked-documents/config.ts` |
| Live-Preview | postMessage + `mergeData`-Refresh im Frontend | Optional später: dritter Preview-Modus; Refresh-Muster für Build-Preview nutzbar | `packages/live-preview/src/*` |

---

## 8. Nicht übernehmen (und warum)

1. **Next.js/RSC-Kopplung der Admin-UI** (`packages/next`, `RenderServerComponent`, importMap, Server-Functions): Senify-Desktop ist ein eigenes Programm; nur die React-Muster (Provider-Struktur, Form-State, Control-Mapping) übernehmen, nicht die Rendering-Infrastruktur.
2. **Feld → DB-Spalten-Ableitung** (SQL-Adapter, `drizzle`, Migrationen pro Feldänderung): Senify persistiert NodeTrees als JSONB und validiert zur Laufzeit mit TypeBox. Ein neues Prop darf **kein** Migrations-Event sein; `dbName`/Block-Tabellen sind genau der Ballast, den Senify vermeidet.
3. **Versions als Vollkopien pro Save** (Payload): Senify hat lebenden Draft + Revision pro Publish + Release-Bündel — sparsamer und für Diff/Rollback granularer. Nur die Autosave-Merge- und Retention-Technik übernehmen.
4. **Kein Release-Konzept bei Payload**: Payload publiziert pro Dokument; atomare Site-Releases, `activeReleaseId`, Preview-TTL bleiben Senify-Eigenbau (bestätigt Artefakt 05, kein Vorbild vorhanden).
5. **`overrideAccess: true` als Local-API-Default**: Für ein Single-Operator-Tool bequem, aber als Muster gefährlich. Senify setzt Scopes serverseitig durch (Artefakt 04), unabhängig vom Transport. Payloads Default nicht kopieren.
6. **GraphQL-Layer**: Für Senifys Ziele (MCP, Desktop, HTTP) kein Nutzen — nur Komplexität.
7. **Lexical als Rich-Text-Stack**: Feature-/Node-/RSC-Registry ist ein eigenes Produkt. Senify-`richtext` bleibt strukturierte Inline-Runs; von Lexical nur die Idee „serialisierter JSON-State als kanonisches Format" übernehmen.
8. **Payload-Doc-Modell (Row pro Dokument mit Feldspalten) für den Site-Baum**: Für Entries (Content-Kern) ist es das richtige Modell — für Pages bleibt der JSONB-NodeTree richtig. Keine Vermischung.
9. **Plugins wie ecommerce/form-builder/stripe/multi-tenant/Cloud**: Nicht im Scope; form-builder nur als Idee für v3+.
10. **`payload-types.ts`-Generierung**: Build-Zeit-Typgenerierung aus Config entfällt — TypeBox liefert `Static<T>` zur Laufzeit und als Typ.
11. **Payloads `condition`/`label`/`validate` als Runtime-Funktionen im Schema**: Bricht Serialisierbarkeit (Registry muss für MCP/Agenten als JSON lesbar sein). Wenn Dynamik nötig: deklarative Mini-DSL evaluieren.
12. **Payloads Blocks als tief verschachtelte Wertbäume mit Vollrewrite**: Bestätigt Senifys flachen, mutationsbasierten NodeTree (Artefakt 01) als überlegene Wahl für Undo, Diff, Agenten-Schreibpfade und Concurrent-Editing.

---

## Kompakte Learnings (Zusammenfassung)

1. **Ein Kern, viele Adapter**: Payloads Local API (ohne HTTP, mit `req`-Kontext, Transaktionen) ist die Blaupause für Senify — MCP, Desktop und HTTP sprechen denselben Operations-Kern.
2. **Schema → UI an genau einer Mapping-Stelle**: `RenderField.tsx` (Typ → Control) plus UI-Metadaten am Feld (`admin.condition/description/position/components`) — so generiert Senify Props-Panels aus der Registry.
3. **Form-State serverseitig vorberechnen**: flacher `path→state` (Wert, Fehler, Rows, Custom-Components); der Client rendert nur — spart Duplikation zwischen Editor, Validierung und Agenten.
4. **Blocks-Muster bestätigt**: Diskriminator (`blockType`/`type`) + `oneOf`-JSON-Schema + Picker-Drawer mit Gruppen/Thumbnails; Senifys flacher Tree + Slots + Mutationen ist die stärkere Variante.
5. **Von Blocks zusätzlich übernehmen**: `filterOptions` (kontextabhängig erlaubte Sektionen), optionaler Instanz-Name (`blockName`), Collapse-Verhalten, Copy/Paste mit ID-Regeneration.
6. **Drafts≠Versionen**: `draft:true` schreibt nur in die Versions-Tabelle („Drafts leaken nie"); Status draft/published/changed = Senify draft-only/published/draft-ahead.
7. **Autosave clever**: letzte Autosave-Version in-place überschreiben + Max-Retention — verhindert Versions-Flood; für Senifys lebenden Draft direkt übertragbar.
8. **Payload hat kein Release-Bündel**: Für Site-Atomik/Rollback fehlt das Vorbild — Senifys Release-Modell bleibt Eigenbau (Lücke ≠ Fehler).
9. **Access ist Query-fähig**: Where-Rückgabe als Row-Filter + Permissions-Reflection fürs UI; Senify vereinfacht zu Scopes, übernimmt aber die Idee access-gefilterter Schemas.
10. **MCP-Plugin als Blaupause**: Input-Schemas direkt aus Feld-Schemas (Input-Variante, access-gefiltert), Fehlerantworten mit Schema zur Selbstkorrektur, Tool-Annotations (`readOnlyHint` etc.), HTTP+stdio aus einem Kern.
11. **Jobs/Queue**: Task/Workflow/Queue mit Retry+Backoff, `waitUntil`, Cron — perfekt für Builds, Screenshots, Preview-TTL; Jobs-Collection als interner Audit-Trail.
12. **Desktop-Shell**: Preferences pro User (Spalten/Layout), Nav-Gruppen, Command Palette, Soft-Delete/Trash und Live-Preview-Muster sind die direkt übertragbaren UX-Bausteine.
