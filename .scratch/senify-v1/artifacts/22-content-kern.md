# Artefakt 22: Content-Kern — Collections & Entries (Senify v1)

> Entschieden am 15.09.2026 in Ticket „Content-Kern: Collections & Entries".
> Grundlagen: `artifacts/01` (Datenmodell), `05` (Lifecycle), `08` (Registry-/Feldsystem-Muster), `09` (Editor), `10` (MCP-Tools), `research/23` (Instatic), `research/24` (Payload), `research/25` (Emdash), `research/26` (Instatic-Delta).

## Entscheidungen (Wizard, 14/14)

1. **Datenmodell:** Dedizierte Entitäten `Collection` + `Entry` (additiv zu Artefakt 01) — **keine** Universal-Tabellen (Instatic); Entry-Zellen als **JSONB-`cells` keyed by Feld-ID**, `slug`/`status` denormalisiert.
2. **Feldsystem v1: 16 Typen** (s. u.).
3. **Body-Format:** **Markdown kanonisch** (+ Tiptap-Editor); Agenten lesen/schreiben Markdown direkt. (Props-`richtext` bleibt Runs-basiert, Artefakt 01.)
4. **Workflow:** voll, Instatic-Parität — `draft` / `published` / `unpublished` / `scheduled`; Version je Publish + „Restore as Draft"; Slug-Änderung → 301-Redirect; Soft-Delete (Trash).
5. **Schema-Mutation agentenfähig:** `create_collection` / `update_collection` / Feld-Operationen als MCP-Tools (additiv, validiert, Review-pflichtig wie Pages).
6. **Entry-Publish eigenständig** vom Page-Release; betroffene Routen/Listen werden per Re-Bake aktualisiert (Mechanik → Ticket 23).
7. **Content-Workspace v1:** Entry-Liste + Entry-Editor + Settings-Panel (kein Spreadsheet-Grid in v1).
8. **MCP-Tool-Umfang:** CRUD + Status + Suche; Konfliktschutz per `baseVersion` (analog `baseDraftVersion` der Pages — kein neues `_rev`-Vokabular).
9. **Relationen:** typisiert mit **Ziel-Whitelist** (1–n erlaubte Collections); gespeichert werden Entry-IDs.
10. **Repeater:** genau **1 Ebene**; Sub-Felder inkl. Relation, ohne verschachtelte Repeater/Meta-Felder.
11. **Editor-Speichern:** **Autosave in den Draft** (debounced, in-place — kein Versions-Flood) + explizites Publish.
12. **Publish-Policy:** wie Pages — Agent (`write`) schreibt Drafts, Publish via `publish`-Scope/Mensch (Artefakte 04/05/06).
13. **Suche:** Volltext via **Postgres FTS** (tsvector, gewichtet).
14. **Taxonomien:** kein Sondersystem — Kategorien = Collection + Relation; Tags = `multiSelect`.

## 1. Datenmodell (additiv zu Artefakt 01)

```ts
type Collection = {
  id: CollectionId
  siteId: SiteId
  name: string                     // Anzeigename (Plural)
  slug: string                     // Maschinen-ID (unique pro Site)
  fields: FieldDef[]               // geordnet; eingebettet (Payload-/Instatic-Muster)
  titleField: FieldId              // Listen-Titel (Emdash-Muster)
  dateField?: FieldId              // Sortier-/Datums-Spalte
  urlPattern?: string              // z. B. "/blog/{slug}" (für Entry-Templates, Ticket 23)
  supports: Supports[]             // Feature-Flags (Emdash-Muster), Default s. u.
  listColumns?: FieldId[]          // max 4 (Emdash-Muster)
  createdAt: string; updatedAt: string
}

type FieldDef = {
  id: FieldId                      // stabil, nie recycelt
  key: string                      // Technischer Name (unique in Collection)
  label: string
  type: FieldType                  // 16 Typen (s. u.)
  required?: boolean
  defaultValue?: CellValue
  unique?: boolean
  description?: string             // agentenlesbar (Tool-/Prompt-Qualität)
  // Typ-spezifisch:
  options?: { value: string; label: string }[]     // select / multiSelect
  targetCollections?: CollectionId[]               // relation / relationMulti (Whitelist, ≥1)
  subFields?: FieldDef[]                           // repeater (1 Ebene, ohne repeater)
  mediaKind?: "image" | "video" | "any"            // media / mediaMulti
}

type Entry = {
  id: EntryId
  siteId: SiteId
  collectionId: CollectionId
  slug: string                     // unique pro Collection; Auto aus Titel, editierbar
  status: "draft" | "published" | "unpublished" | "scheduled"
  cells: Record<FieldId, CellValue>   // JSONB; keyed by Feld-ID
  activeVersionId?: EntryVersionId    // gesetzt bei published (Instatic-Muster)
  version: number                  // monoton; baseVersion für Konfliktschutz
  author: Author                   // { kind: "human" | "agent", … } (Artefakt 01)
  createdAt: string; updatedAt: string
  publishedAt?: string; scheduledAt?: string
  deletedAt?: string               // Trash (Soft-Delete)
}

type EntryVersion = {              // immutable; Snapshot je Publish
  id: EntryVersionId
  entryId: EntryId
  versionNumber: number            // max+1 (Instatic-Invariant)
  cells: Record<FieldId, CellValue>
  slug: string
  createdAt: string; publishedBy: Author
}

type EntryRedirect = {             // Slug-Historie → 301
  id: string; collectionId: CollectionId
  fromSlug: string; toSlug: string; createdAt: string
}
```

**Regeln:**
- **Entry-Status ist gespeichert** (echte Zustände: scheduled/unpublished) — anders als der abgeleitete Page-Status; die Anzeige „draft-ahead" wird weiterhin abgeleitet (`draft ≠ activeVersion`).
- **Versionen entstehen nur bei Publish** (Snapshot `cells` + `slug`); Autosave/Draft-Writes erzeugen **nie** Versionen. Retention: Limit pro Entry (Default 50, Payload-Muster „maxPerDoc").
- **Restore** kopiert eine Version in den **Draft** (veröffentlicht nichts) — append-only wie Artefakt 05.
- **Slug:** Auto-Normalisierung aus Titel; Änderung an einem *published* Entry schreibt beim Publish einen `EntryRedirect` (301, Instatic-Muster).
- **Trash:** Delete = Soft-Delete (`deletedAt`); Restore möglich; **Purge** (endgültig) nur mit `publish`-Scope.
- **Zellen validieren** gegen `FieldDef` (TypeBox, additiv; Feld-Entfernung nur über Deprecation-Muster wie Registry 01/08).

### Feldsystem v1 (16 Typen)

| Typ | Zellen-Form | Editor-Control |
|---|---|---|
| `text` | `string` | Input |
| `longText` | `string` | Textarea |
| `richtext` | Markdown-String (kanonisch) | Tiptap (Body-Konventionen: H1 für Titel reserviert, Media-Nodes, Slash-Commands) |
| `number` | `number` | Number-Input (min/max/step) |
| `boolean` | `boolean` | Switch |
| `date` | ISO-Datum | Date-Picker |
| `dateTime` | ISO-Datetime | DateTime-Picker |
| `select` | `string` | Select (Optionen aus `options`) |
| `multiSelect` | `string[]` | Multi-Select |
| `url` | `string` | Input + URL-Validierung |
| `email` | `string` | Input + E-Mail-Validierung |
| `media` | `{ assetId, focal? }` | AssetPicker (Library, Artefakt 15) |
| `mediaMulti` | `{ assetId, focal? }[]` | Multi-AssetPicker |
| `relation` | `EntryId \| null` | RelationPickerDialog (Ziel-Whitelist) |
| `relationMulti` | `EntryId[]` | RelationPickerDialog (multi) |
| `repeater` | `{ id, cells }[]` (stabile Item-IDs) | Repeater-Editor (Add/Remove/Move, Collapse) — 1 Ebene |

### Built-ins je Collection

- **Immer:** `title` (Text) + `slug` (abgeleitet, editierbar) — Instatic-Muster.
- **Optional per `supports`:** `body` (richtext/Markdown), `featuredMedia` (media), `seoTitle`, `seoDescription`.
- **Feature-Flags `supports`:** Default `["drafts","versions","scheduling","seo","search"]`; abwählbar (z. B. einfache Datenlisten ohne Draft-Workflow — Emdash-Muster).

### Kollektionen von Kategorien/Tags (Entscheidung 14)

- **Kategorien** = eigene Collection + `relation`-Felder auf Inhalts-Collections (Dogfooding des Content-Kerns).
- **Tags** = `multiSelect`-Feld mit gepflegten Optionen.

## 2. Workflow & Lifecycle

```
draft ──publish──▶ published ──unpublish──▶ unpublished
  ▲                    │                        │
  └── restore ◀── EntryVersion ◀── publish      └─ schedule → scheduled ─(Job)─▶ published
Trash: delete ⇒ deletedAt (Restore möglich; Purge nur publish-Scope)
Slug-Wechsel bei published: ⇒ EntryRedirect (301)
```

- **Publish (Entry):** validiert (Pflichtfelder, unique, Slug-Kollision → 409) → schreibt `EntryVersion` → setzt `status=published`, `activeVersionId`, `publishedAt` → feuert `content.entry.published` → **Re-Bake-Trigger** (betroffene Routen/Listen; Mechanik → Ticket 23).
- **Unpublish:** Artefakt zurückziehen (`status=unpublished`); Route liefert 404/Redirect-Regel.
- **Scheduled:** Job-Tick (Task/Queue-Muster aus Research 24); Fehler → zurück auf `draft` (Instatic-Detail); Abbrechen möglich.
- **Konfliktschutz:** jeder Write verlangt `baseVersion` (monoton +1); Mismatch → 409 „Entry hat sich geändert — neu laden" (Fehlerformat aus Artefakt 10).
- **Audit:** jeder Entry-Write über den Service-Kern mit `Author` (Artefakt 01/04); Publish/Restore/Trash als Audit-Events.
- **Policy:** Agent (`write`) → Drafts; Publish/Unpublish/Purge via `publish`-Scope bzw. Review (Artefakte 04/05/06) — gilt identisch für Entries.

## 3. Content-Workspace (v1)

```
Content-Workspace
├─ Entry-Liste      Suche (FTS) · Status-Filter · Sortierung (dateField) · Seiten-Cursor
│                    Bulk-light (Publish/Unpublish/Trash) · Zeilen: Titel · Slug · Status · Datum
├─ Entry-Editor     Markdown-Body (Tiptap) + Custom-Felder (zentraler Cell-Editor, context="detail")
├─ Settings-Panel   Slug · Status · SEO-Felder · Featured Media · Relationen (PickerDialog)
└─ Versionen        Timeline + Diff + „Restore as Draft" (Payload-Muster)
```

- **Ein zentraler Cell-Editor-Renderer** für alle Feldtypen (Instatic-Muster: derselbe Renderer, kein UI-Drift); `richtext`-Body ist die Tiptap-Sonderform.
- **Autosave:** debounced, in-place („letzte Autosave überschreiben"), Save-/Publish-Requests **serialisiert**; 409-Recovery (Emdash-Muster); Save-State-Maschine `entryOp` (Permission → pending → apply → done).
- **Draft-State lokal** + Merge beim Speichern (Instatic `useContentEntryDraft`-Muster); Dirty-Tracking je Feld.
- **Relation-Anzeige:** gebatchte Auflösung je Ziel-Collection (ein Fetch pro Ziel), Fallback rohe ID (Instatic-Delta).
- **Live-Modus** (Entry im echten Template) → **Ticket 23** (braucht Entry-Templates).
- **Kein Spreadsheet-Grid** in v1 (später, falls Bulk-Bedarf entsteht).

## 4. Suche (Postgres FTS)

- `tsvector` je Entry (gewichtet: `title` A, `slug` B, `body` C), gepflegt bei Entry-Write.
- Sprachkonfiguration pro Collection (`simple` als sprachneutraler Default; `german`/`english` optional).
- Programm-Suche + MCP `search_entries` nutzen denselben Index; Highlighting im Editor optional (später).

## 5. MCP-Surface (Delta zu Artefakt 10)

| Tool | Scope | Zweck |
|---|---|---|
| `list_collections` / `get_collection` | `read` | Schema + Metadaten lesen (agentenlesbar, `description` je Feld) |
| `create_collection` / `update_collection` | `write` | Collection anlegen/ändern (additiv); Review-pflichtig |
| `add_field` / `update_field` | `write` | Felder ergänzen/ändern (Deprecation statt Löschen) |
| `list_entries` / `get_entry` | `read` | Queries (Filter/Sortierung/Pagination), Detail inkl. `version` |
| `create_entry` / `update_entry` | `write` | Draft-Writes; `baseVersion` Pflicht; Markdown an der Grenze |
| `publish_entry` / `unpublish_entry` | `publish` | Statuswechsel; Version + Events + Re-Bake |
| `delete_entry` | `publish` | Soft-Delete (Trash); Purge separat |
| `restore_entry_version` | `write` | Version → Draft (append-only) |
| `search_entries` | `read` | FTS |

- Fehlerformat, `dry_run`-Prinzipien und Hard-Guardrails übernommen aus Artefakt 10.
- Feld-`description` und Collection-Beschreibungen sind agentenlesbar gestaltet (Tool-/Prompt-Qualität wie 08).

## 6. Betriebsdetails

- **Re-Bake:** Entry-Publish/Unpublish enqueued einen Job („betroffene Routen + Listen neu backen") — exakte Mechanik (Template-Chain, Prefetch) in Ticket 23; Job-Infrastruktur nach Payload-Task-Muster (Research 24).
- **Events:** `content.entry.created|updated|published|unpublished|deleted` — Audit + Preview-/Bake-Trigger (Hook-Schicht, Research 24 §5.4).
- **Medien:** `media`/`mediaMulti` referenzieren die zentrale Library (Artefakt 15); Alt-Pflicht-Check gilt; Erweiterungen → Ticket 25.
- **Persistenz:** Postgres; `cells` als JSONB; Indizes auf `(collectionId, slug)`, `(collectionId, status, publishedAt)`, FTS-GIN.

## 7. Anschlüsse

| Bereich | Ticket |
|---|---|
| Entry-Templates, `urlPattern`-Routing, Bindings (`{ "$entry": … }`), Loops, Re-Bake, Live-Modus | 23 |
| Editor-Alignment (Puck-Welt; Entry-Workspace bleibt eigener Bereich) | 24 |
| Media-Picker/Folders/`sizes`-Resolver für `media`-Felder | 25 |
| Forms: Submissions als Entries in Ziel-Collections (Instatic-Muster) | 26 |
| Programm-Shell: Content-Workspace-Navigation, Review im Projekt | 27 |
| Skill-Referenz `content.md` generieren (Feldsystem, Tools, Fehler) | 11 |
| Checks: SEO-Felder/Links/Alt für Entries in der Check-Pipeline | 13 |
