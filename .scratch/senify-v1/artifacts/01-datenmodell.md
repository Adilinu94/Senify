# Artefakt 01: Kanonisches Datenmodell (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Datenmodell & Schema-System".
> Grundlagen: `RESEARCH.md`, `research/20-referenzprojekte.md` (Instatic-/OpenPage-Muster aus `research/20`).
> Status: **entschieden** — abhängige Tickets bauen hierauf auf (05, 07, 08, 09, 10).

## 1. Entitäten (schlanker Kern)

| Entität | Zweck | Kernfelder |
|---|---|---|
| **Site** | Ein Kunden-Projekt | `id`, `name`, `slug`, `themeId`, `profile` (clean/standard/showcase — Ticket 21), Zeitstempel |
| **Page** | Adressierbares Dokument | `id`, `siteId`, `path`, `title`, `meta` (SEO/AEO: title/description/ogImage — Ticket 13), `draft` (NodeTree), `publishedRevisionId?` |
| **Node** | Instanz einer Section im Baum | `id`, `type`, `variant?`, `props`, `children?`, `slots?`, `overrides?`, `motion?`, `locked?`, `hidden?` |
| **SectionDefinition** | Registry-Eintrag (Bautyp) | `type`, `version`, `title`, `description`, Props-Schema, Varianten, `allowedChildren`, `slots`, `motionPresets?` |
| **Asset** | Mediendatei | `id`, `kind`, `storageRef`, `width`/`height`/`durationMs?`, `alt?`, `hash` |
| **Theme** | Design-Tokens pro Site | `id`, `name`, `tokens { primitive, semantic }` |
| **Revision** | Unveränderlicher Page-Snapshot | `id`, `pageId`, `tree`, `createdAt`, `author`, `note?` |
| **Release** | Bündel veröffentlichter Revisionen | `id`, `siteId`, `revisionIds[]`, `publishedAt` (Details → Ticket 05) |

Bewusst **nicht** in v1: Collections/Post-Types, Formular-Datenhaltung, Nutzer-/Rollen-Modell (intern, single-operator) — alles v2.

## 2. Baum-Format: flacher NodeTree

```ts
type NodeTree = {
  rootNodeId: NodeId
  nodes: Record<NodeId, Node>
}

type Node = {
  id: NodeId
  type: string                     // Registry-Schlüssel, z. B. "hero"
  variant?: string                 // kuratiertes Preset, z. B. "split"
  props: Record<string, PropValue>
  children?: NodeId[]              // nur wenn `allowedChildren` es erlaubt
  slots?: Record<string, NodeId[]> // benannte Einschübe
  overrides?: { tablet?: NodeOverride; mobile?: NodeOverride }
  motion?: MotionSpec              // zentrales Motion-Feld
  locked?: boolean                 // Editor-Schutz (z. B. nach Agentenänderung)
  hidden?: boolean
}

type NodeOverride = {
  props?: Record<string, PropValue>
  hidden?: boolean
}

type MotionSpec = {
  preset: string                   // aus dem kuratierten Preset-Katalog (Ticket 03)
  intensity?: number               // 0..1
  trigger?: "load" | "scroll" | "viewport" | "hover"
  delay?: number
}
```

Regeln:
- Verschachtelung ist **registry-reguliert**: erlaubte Kinder/Slots kommen aus der `SectionDefinition`; der Validator lehnt Verstöße ab.
- Referenzen zeigen auf IDs; **gebrochene Referenzen werden markiert, nie automatisch gelöscht**.
- Reihenfolge = Array-Ordnung in `children` / `slots`.

## 3. Prop-Typen (Komfort-Set, v1)

| Typ | Form |
|---|---|
| `text` | `string` |
| `richtext` | strukturierte Inline-Runs (bold/italic/link/code); Markdown wird an der MCP-Grenze akzeptiert und konvertiert |
| `number` / `boolean` / `enum` | Skalar |
| `color` | Token-Ref `{ "$token": "color.accent" }` **oder** Literal (`#hex`, `rgb()`) — Tokens bevorzugt, Validator warnt bei Literal |
| `assetRef` | `{ assetId, focal?: { x, y } }` (Crop-Details → Ticket 15) |
| `link` | `{ pageId }` (intern) oder `{ url, newTab? }` (extern) |
| `list` | Array von Items nach Item-Schema (z. B. Feature-Karten) |
| `slot` | benannter Einschub (siehe `slots`) |

## 4. Schema-System (TypeBox)

- **TypeBox** ist die Quelle: Schemas SIND JSON Schema → dienen gleichzeitig als Validatoren UND als MCP-Tool-Verträge (kein Konverter, keine doppelte Wahrheit).
- Jede `SectionDefinition` trägt `version` (schemaVersion): Änderungen **additiv-first**; Entfernen läuft über das **Deprecation-Muster** (ReadOnly → Hidden → Deprecated); Migrationspfade stehen in der Registry (`type` + `version` → migrate).
- `description` je Section ist **agentenlesbar** gestaltet (Tool-/Prompt-Qualität).
- Validierung an jeder ungetypten Grenze: MCP-Inputs, Server-Handler, Editor-Mutationen, Renderer-Build.

## 5. Mutations-Vertrag (kanonisch)

Jede Schreiboperation auf Page-Bäumen ist eine **benannte, typisierte Mutation** — die einzige öffentliche Schreib-API für Editor, MCP und Agenten:

- `insertNode(parentRef | slotRef, index, nodeSpec)`
- `deleteNode(id)`
- `duplicateNode(id, target?, index?)`
- `moveNode(id, target, index)`
- `wrapNode(id, wrapperType)`
- `updateNodeProps(id, patch)`
- `updateNodeMeta(id, { variant?, locked?, hidden? })`
- `setBreakpointOverride(id, breakpoint, override)` / `clearBreakpointOverride(id, breakpoint)`
- `setMotion(id, spec)` / `clearMotion(id)`
- `updatePageMeta(pageId, { title?, path? })`

Regeln:
- Jede Mutation: validiert (Registry + TypeBox) → erzeugt **Undo-Patch** (O(Change)) → ist deterministisch.
- Theme-/Token-Operationen: eigener Katalog (Ticket 07). Asset-Operationen: Upload/Ersetzen (Ticket 15).
- Interne Migrationen/Importe dürfen **direkt schreiben** (Escape-Hatch außerhalb der öffentlichen API).

## 6. Lifecycle-Träger (Policy → Ticket 05)

- Page hat einen **lebenden Draft-Baum**; Publish erzeugt eine **unveränderliche Revision** (Snapshot des Baums).
- **Release** bündelt Revisionen mehrerer Seiten zu einem Site-Publish (Rollback, Preview-Mechanik, Freigabe-Flows → Tickets 05/06).
- Status einer Page ist **abgeleitet** (draft-only / published / draft-ahead), nicht gespeichert.

## 7. Persistenz & Identität

- **Postgres**: Entitäten relational, NodeTrees als **JSONB**; Revisionen immutable Rows.
- **IDs**: kurze, URL-sichere `nanoid`s (Nodes ~10 Zeichen, Entitäten ~12–14); Pages zusätzlich `path`.
- **Author** an Revisionen/Mutationen: `{ kind: "human" | "agent", id, label }` (Audit → Ticket 06).
- Konkrete Tabellen/Indizes/Backups → Fog/Spec („Persistenz-Details").

## 8. Offene Anschlüsse

| Bereich | Ticket |
|---|---|
| Releases, Rollback, Preview-Mechanik | 05 Versionierung & Lifecycle |
| Token-Ebenen/Skalen, Theme-Operationen | 07 Design-Token & Theme |
| Registry-Detailformat, Varianten, `allowedChildren` konkret | 08 Section-Library |
| Editor-Ops / Undo-Integration | 09 Visueller Editor |
| Mutationen als MCP-Tools | 10 MCP-Tool-Katalog |
| Asset-Felder (Focal/Crop, Transforms) | 15 Media-Pipeline |
| Motion-Preset-Katalog | 03 Motion & 3D |
