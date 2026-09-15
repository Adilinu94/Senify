# Versionierung & Lifecycle

Type: grilling
Status: resolved
Blocked by: 01

Input: artifacts/01-datenmodell.md
Input: artifacts/04-mcp-betrieb.md

## Question

Wie funktionieren Draft → Preview → Publish → Rollback: Revisionen pro Seite/Site, Releases/Bundles, Preview-Snapshots, History und Restore?

Welche Granularität und welche Datenstruktur verlangt das vom Datenmodell?

## Answer

Lifecycle entschieden (6/6 Wizard). Artefakt: [artifacts/05-lifecycle.md](../artifacts/05-lifecycle.md).

- **Revisionen pro Page** (immutable NodeTree-Snapshots); **Release = vollständiger Site-Commit** (alle Seiten-Revisionen + Theme-Snapshot); `Site.activeReleaseId`.
- **Previews:** echte Draft-Builds als immutable Snapshot mit Token-URL + TTL (30 Tage); Approval/Screenshot referenziert die Preview-ID.
- **Append-only:** Restore erzeugt neuen Draft aus alter Revision; Rollback erzeugt neues Release (mit `basisReleaseId`) — nichts wird umgeschrieben.
- **Draft:** lebender Baum + Undo-Patches; keine Versionskette in v1.
- **Publish-Policy:** Agent = Draft/Preview (`write`), Mensch = Publish (`publish`-Scope), Andockung an Approval-Queue (06).
- **Datenstruktur-Anforderungen** definiert: Revision-/Release-/Preview-Rows, Audit-Verknüpfung, abgeleiteter Page-Status.

Inputs verdrahtet: 06, 09, 10, 14.
