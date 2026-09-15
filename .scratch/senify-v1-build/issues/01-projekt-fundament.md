# 01: Projekt-Fundament

**What to build:** Das baubare Gerüst für Senify v1 — Monorepo (pnpm-Workspaces, TypeScript strict, Lint/Format, Test-Runner), Paket-Landkarte nach Spec (engine · section-sdk/registry · renderer · editor · app · mcp · analysis-worker · docs-portal · skills), das TypeBox-basierte Schema-System als Single Source, ein Registry-Skelett (SectionDefinition + Golden-Feld) und das Test-Gerüst für die drei Prüfstellen (Engine-API als Black-Box, Bake-Artefakte, MCP-Workflows). Am Ende ist eine Beispiel-Sektion registrierbar, validierbar und die Test-Harness für alle drei Prüfstellen läuft.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Monorepo baut, Typecheck + Lint + Tests laufen grün (ein Befehl)
- [ ] Schema-System validiert eine SectionDefinition inkl. Props, Varianten, Slots und Golden-Beispiel (TypeBox als Single Source)
- [ ] Registry-Skelett registriert die Beispiel-Sektion; unbekannte Props/Nesting werden abgelehnt
- [ ] Test-Gerüst existiert für alle 3 Prüfstellen: Engine-API (HTTP-Black-Box), Bake-Output (Artefakt-Assertions), MCP-Workflow (E2E)
- [ ] `senify`-CLI-Skelett zeigt Befehle (`start`, `setup`, `mcp configure`, `tokens`) als Stubs
- [ ] Lokale Postgres-Anbindung startet reproduzierbar (Compose/embedded) und ist im Test-Harness nutzbar

Quellen: `artifacts/01`, `artifacts/08`, Spec „Modul-Landkarte" + „Testing Decisions".
