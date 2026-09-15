# 06: MCP-Kern & Agent-Setup

**What to build:** Die Agenten-Schnittstelle: lokaler stdio-MCP als Teil der Senify-CLI, scoped API-Tokens (`read`/`write`/`publish`, gehasht, revozierbar, letzte Nutzung), serverseitige Scope-Durchsetzung, Rate-Limits, volles Audit aller Calls. Der `apply_mutations`-Vertrag (Batch, atomar, `dry_run`, `baseDraftVersion`, strukturierte Fehler als Handlungsanweisungen) plus die Lesen-Tools (`whoami`, `list_sites`, `get_site`, `list_pages`, `get_page`-Outline, `get_nodes`, `list_sections`, `get_section`, `get_theme`) und die ersten Schreiben-Tools (`create_page`, `update_theme`, `restore_revision`). `senify setup` verbindet Claude Code/Cursor/opencode in einem Kommando; das Skillpaket (Knowledge-Router + Master-Flow „Site aus Brief") liegt als Basis vor.

**Blocked by:** 01 (Projekt-Fundament), 02 (Site & Pages + Mutations).

**Status:** ready-for-agent

- [ ] MCP-Client (stdio) verbindet; Tool-Katalog ist korrekt deklariert; Scope-Verstöße liefern agentenlesbare Fehler mit Token-Anlage-Hinweis
- [ ] `apply_mutations`: Batch atomar all-or-nothing; `dry_run` validiert ohne Schreiben; Konflikt → 409-ähnlicher Fehler mit Neu-Laden-Anweisung; Warnings kommen als `warnings[]`
- [ ] Tokens: anlegen (Secret einmal sichtbar, serverseitig nur Hash), widerrufen (wirkt sofort), Liste mit letzter Nutzung; Rate-Limits (60/min, Burst 20; destruktiv 10/min) mit `retry-after`
- [ ] Audit-Log: Zeit, Token/Client, Tool, Args-Kurzfassung (Secrets redigiert), Ergebnis, Entität, Dauer — append-only
- [ ] `senify setup` richtet MCP + Token + Skillpaket ein und endet mit Check (`whoami` + `list_sites` → „arbeitsfähig ✓"); `mcp configure` erkennt die Agenten-Clients
- [ ] MCP-Workflow-Test (Prüfstelle 3): „Seite anlegen → Sektionen einfügen → prüfen" läuft komplett über den MCP-Client

Quellen: `artifacts/04`, `artifacts/10`, `artifacts/11` (Skillpaket-Basis), Spec „MCP-Vertrag (Kern)".
