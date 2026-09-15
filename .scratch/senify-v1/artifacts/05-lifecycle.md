# Artefakt 05: Versionierung & Lifecycle (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Versionierung & Lifecycle".
> Grundlagen: `artifacts/01-datenmodell.md`, `artifacts/02-renderer.md`, `artifacts/04-mcp-betrieb.md`, `research/20-referenzprojekte.md` (Instatic: site_snapshots, „drafts never leak").

## Entscheidungen (Wizard, 6/6)

1. **Revision-Granularität:** Revisionen pro Page (immutable), **Release bündelt** alle Seiten-Revisionen + Theme-Snapshot.
2. **Release-Modell:** vollständiger Site-Zustand („Commit") — Rollback = eine ID, keine gemischten Zustände.
3. **Previews:** echte Draft-Builds, eingefroren als **immutable Snapshot mit Token-URL + TTL (30 Tage)**.
4. **Semantik append-only:** Restore → neuer Draft; Rollback → neues Release; nichts wird umgeschrieben.
5. **Draft:** lebender Baum + Undo/Redo aus Patch-Historie; **keine Draft-Versionskette** in v1.
6. **Publish-Policy:** Agent = Draft/Preview (`write`), **Mensch = Publish**; `publish`-Scope (Artefakt 04) + Andockung an Approval-Queue (Ticket 06).

## Zustandsmodell (Datenstruktur)

```ts
type Page = {
  id: PageId; siteId: SiteId; path: string; title: string
  draft: NodeTree                 // lebender Baum
  publishedRevisionId?: RevisionId
}

type Revision = {                 // immutable
  id: RevisionId; pageId: PageId; tree: NodeTree
  createdAt: string; author: Author; note?: string
}

type Release = {
  id: ReleaseId; siteId: SiteId
  pageRevisions: { pageId: PageId; revisionId: RevisionId }[]   // ALLE Seiten
  themeSnapshotId: ThemeSnapshotId                              // Theme zum Zeitpunkt
  createdAt: string; author: Author; note?: string
  basisReleaseId?: ReleaseId      // gesetzt bei Rollback → Quelle nachvollziehbar
}

type Preview = {
  id: PreviewId; siteId: SiteId
  buildRef: string                // Artefakt-/Deployment-Referenz des Draft-Builds
  tokenUrl: string                // signierter, teilbarer Link
  expiresAt: string               // TTL 30 Tage (Löschjob)
  createdAt: string; createdBy: Author
  status: "ready" | "failed" | "expired"
}

type Site = { id: SiteId; /* … */ activeReleaseId?: ReleaseId }
```

**Regeln:**
- **Publish** = neues Release + Bake + atomarer Swap (Artefakt 02) + `activeReleaseId` setzen — nie überschreiben.
- **Rollback** = neues Release mit dem Zustand eines älteren Releases (referenziert dessen `pageRevisions` + `themeSnapshotId`), `basisReleaseId` dokumentiert die Quelle.
- **Restore (Page)** = alte Revision → als neuer Draft; der nächste Publish erzeugt eine neue Revision.
- **Previews** sind Wegwerf-Artefakte (TTL, löschbar); Approval referenziert die Preview-ID — Drafts selbst leaken nie.
- **Page-Status** ist abgeleitet: draft-only / published / draft-ahead (draft ≠ publishedRevision).

## Flows

```
Edit    → Mutationen (01) auf Draft · Undo aus Patch-Historie · Audit (04)
Preview → „Preview erstellen" (write) → echter Draft-Build → Snapshot + Token-URL (30 Tage)
Publish → Release-Assembly (alle Seiten + Theme) → Hard-Guardrails (03/13) → Bake → Swap → Audit
History → Page-Revisionsliste + JSON-Tree-Diff · Release-Historie · „Restore as Draft" / „Re-Rollout"
```

## Datenmodell-Anforderungen (Kern der Ticket-Frage)

- Revisionen: immutable Rows (JSONB-Tree) — je Page adressierbar.
- Release: eigene Row, referenziert Revision-IDs + Theme-Snapshot; `Site.activeReleaseId`.
- Preview: eigene Row mit `buildRef`, Token, TTL + Lösch-Lauf.
- Audit-Verknüpfung (04): Mutation → Undo-Patch; Publish/Rollback → Release-ID.
- Keine Draft-Versionskette → kein zusätzlicher Storage-/Komplexitäts-Aufwand.

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Approval referenziert Preview-IDs; Freigabe erzeugt Release | 06 |
| Editor: History-Panel, Diffs, Restore | 09 |
| Tools: `create_preview` · `publish_release` · `rollback_release` · `restore_revision` (+ Scopes) | 10 |
| Deploy: Swap/Redeploy, Preview-Hosting + TTL-Infra | 14 |
| Checks: Hard-Guardrails blockieren Release, Metriken informieren | 13 |
