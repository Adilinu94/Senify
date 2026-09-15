# MCP-Tool-Katalog v1

Type: grilling
Status: resolved
Blocked by: 01, 05

Input: research/20-referenzprojekte.md
Input: artifacts/01-datenmodell.md
Input: artifacts/04-mcp-betrieb.md
Input: artifacts/05-lifecycle.md
Input: artifacts/06-approval.md
Input: artifacts/07-tokens.md
Input: artifacts/08-section-library.md
Input: artifacts/09-editor.md

## Question

Welche MCP-Tools bietet v1 (Site/Page/Section-CRUD, Content-Updates, Preview/Publish, Rollback, Suche, Docs) — mit welchen Eingaben/Ausgaben, Fehlermeldungen und Guardrails?

Ergebnis: der vollständige Tool-Vertrag als Grundlage für Agent-Skills und Docs-Referenz.

## Answer

Tool-Vertrag entschieden (5/5 Wizard). Artefakt: [artifacts/10-mcp-tools.md](../artifacts/10-mcp-tools.md).

- **Hybrid:** High-Level-Verben + EIN `apply_mutations`-Batch (kanonische Mutationen, **atomar**, `dry_run`).
- **Read:** Outline-first (`get_page` → `get_nodes`) — token-effizient.
- **24 Tools:** Kern · Lifecycle (Preview/Submit/Publish/Rollback/Restore) · Review-Feedback · Theme · Media-minimal · Docs; Scope-Zuordnung `read`/`write`/`publish` je Tool.
- **Fehler strukturiert:** Kategorie + Op-Index + Feld + **Vorschlag** (Handlungsanweisung für Agenten).
- **Guardrails:** Hard-Checks sofort beim Schreiben UND beim Submit; Warnings nicht-blockend.
- Optimistisches Locking über `baseDraftVersion` (09) im Tool-Vertrag verankert.

Inputs verdrahtet: 11, 12.
