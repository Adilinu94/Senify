# 06: MCP-Kern & Agent-Setup

**What to build:** Die Agenten-Schnittstelle: lokaler stdio-MCP als Teil der Senify-CLI, scoped API-Tokens (`read`/`write`/`publish`, gehasht, revozierbar, letzte Nutzung), serverseitige Scope-Durchsetzung, Rate-Limits, volles Audit aller Calls. Der `apply_mutations`-Vertrag (Batch, atomar, `dry_run`, `baseDraftVersion`, strukturierte Fehler als Handlungsanweisungen) plus die Lesen-Tools (`whoami`, `list_sites`, `get_site`, `list_pages`, `get_page`-Outline, `get_nodes`, `list_sections`, `get_section`, `get_theme`) und die ersten Schreiben-Tools (`create_page`, `update_theme`, `restore_revision`). `senify setup` verbindet Claude Code/Cursor/opencode in einem Kommando; das Skillpaket (Knowledge-Router + Master-Flow „Site aus Brief") liegt als Basis vor.

**Blocked by:** 01 (Projekt-Fundament), 02 (Site & Pages + Mutations).

**Status:** implemented (`pnpm verify` grün, 187 Tests + 2 skipped; zusätzlich E2E-Smoke über `senify mcp serve` als Subprozess)

- [x] MCP-Client (stdio) verbindet; Tool-Katalog ist korrekt deklariert; Scope-Verstöße liefern agentenlesbare Fehler mit Token-Anlage-Hinweis
- [x] `apply_mutations`: Batch atomar all-or-nothing; `dry_run` validiert ohne Schreiben; Konflikt → 409 mit Neu-Laden-Anweisung; Warnings kommen als `warnings[]`
- [x] Tokens: anlegen (Secret einmal sichtbar, serverseitig nur Hash), widerrufen (wirkt sofort), Liste mit letzter Nutzung; Rate-Limits (60/min, Burst 20; destruktiv 10/min) mit `retry-after`
- [x] Audit-Log: Zeit, Token/Client, Tool, Args-Kurzfassung (Secrets redigiert), Ergebnis, Entität, Dauer — append-only
- [x] `senify setup` richtet MCP + Token + Skillpaket ein und endet mit Check (`whoami` + `list_sites` → „arbeitsfähig ✓"); `mcp configure` erkennt die Agenten-Clients
- [x] Skill-Referenz `assets.md`: Beschaffungs-Workflow (Bilder generieren z. B. mit `image-use` oder lizenzfreie Stock-Quellen → `upload_asset`; Icons aus Open-Source-Sets), Lizenz-/Marken-Guardrails, Alt-Text-Pflicht (Grundlage: `research/32`)
- [x] MCP-Workflow-Test (Prüfstelle 3): „Seite anlegen → Sektionen einfügen → prüfen" läuft komplett über den MCP-Client

Quellen: `artifacts/04`, `artifacts/10`, `artifacts/11` (Skillpaket-Basis), Spec „MCP-Vertrag (Kern)".

## Comments

**15.09.2026 — Umsetzung.**
- **Engine:** `api_tokens` (SHA-256-Hash, Prefix, Ablauf, letzte Nutzung, Revoke) und `mcp_audit_entries` (append-only, keine Foreign Keys); Bearer-Middleware mit Scopes `read`/`write`/`publish`, 401 (fehlend/unbekannt/widerrufen/abgelaufen) vs. 403 (Scope fehlt) mit Handlungsanweisung; Rate-Limiter als Token-Bucket (60/min, Burst 20; destruktive Ops 10/min) → 429 + `retry-after`; neue Routen `POST/GET /api/tokens`, `DELETE /api/tokens/:id`, `GET /api/whoami`, `POST/GET /api/mcp/audit`. Token-Verwaltung ist eine lokale Operator-Fläche ohne Bearer-Token (Engine bindet standardmäßig an 127.0.0.1).
- **`mcp`:** stdio-Server über das offizielle SDK, Tool-Kern transport-agnostisch (JSON-Schema-Definitionen + Handler getrennt); dünner HTTP-Client (Token aus `SENIFY_API_URL`/`SENIFY_TOKEN` oder `~/.senify/config.json`); 12 Tools wie geplant. CLI: `tokens create|list|revoke`, `mcp serve`, `mcp configure [--print]` (Claude Code/Cursor/opencode), `setup` (Token + Skills nach `~/.senify/skills` + Client-Configs + Abschluss-Check „arbeitsfähig ✓").
- **`skills`:** Knowledge-Router, Master-Flow „Site aus Brief", `assets.md` (Beschaffung, Lizenzen/Marken, Alt-Text-Pflicht) als Markdown-Skillpaket.
- **Tests:** Engine-Auth/Scopes/Revoke/Expiry/Rate-Limit/Audit (7), MCP-Workflow inkl. `dry_run`, Outline/Nodes, Konflikt und Read-only-Token über den echten MCP-Client (4), CLI (5), Client-Konfiguration (3), Outline (2), Skills (4). Zusätzlich manueller E2E-Smoke: Engine + `senify mcp serve` als Subprozess, `listTools` → 12, `whoami`/`list_sites`/`create_page`/`apply_mutations`/`get_page` erfolgreich, alle Calls im Audit.
- **Bewusst offen:** `restore_revision` kommt mit T07 (Revisionen existieren noch nicht); `senify start` (Engine-Bootstrap + Browser) bleibt bei T12.

## Handoff für die ausführende Session (Stand 15.09.2026)

**Auftrag:** Dieses Ticket vollständig umsetzen (Kriterien oben), autonom, mit Tests und einem Commit.

**Anlaufpunkte:** `AGENTS.md`, `CONTEXT.md`, `spec.md` (Abschnitte „MCP-Vertrag (Kern)" und „Testing Decisions → Prüfstelle 3"), `artifacts/04` (Topologie, Scopes, Rate-Limits, Audit), `artifacts/10` (Tool-Katalog + `apply_mutations`-Vertrag), `artifacts/11` (Skillpaket-Basis), `research/30` (MCP-Spec-Stand).

**Ist-Stand:** T01–T05 und T16 sind committet, `pnpm verify` grün (164 Tests + 2 skipped). Vorhanden sind `engine` (HTTP-API, kanonische Mutations, Theme-API + Report, Audit-Tabelle), `section-sdk`, `registry` (25 Sektionen + React-Komponenten + Style-System), `tokens`, `renderer` (Astro-Bake). `mcp` ist ein CLI-Skelett ohne Funktion. **Es gibt noch keine Auth** — Tokens, Scopes, Rate-Limits und der MCP-Call-Audit entstehen in diesem Ticket.

**Vorgehen (Vorschlag):**
1. Engine: Token-Tabelle (`api_tokens`: id, name, scopes, token_hash, created_at, expires_at, last_used_at, revoked_at), Secret über `node:crypto` (hoch-entropisch, einmalig sichtbar, serverseitig nur Hash), Endpunkte anlegen/listen/revoke; Bearer-Middleware für `read`/`write`/`publish`; 401/403 im bestehenden Fehlerformat mit Handlungsanweisung („create a token with publish scope").
2. Rate-Limits pro Token (60/min, Burst 20; destruktive Ops 10/min) → 429 mit `retry-after`.
3. MCP-Call-Audit append-only (Zeit, Token/Client, Tool, Args-Kurzfassung mit redigierten Secrets, Ergebnis, Entität, Dauer).
4. `mcp`-Paket: offizielles MCP-SDK, **stdio**-Transport, Tool-Kern transport-agnostisch (Definition und Handler getrennt). Tools: `whoami`, `list_sites`, `get_site`, `list_pages`, `get_page` (Outline), `get_nodes`, `list_sections`, `get_section`, `get_theme`, `apply_mutations`, `create_page`, `update_theme`. `restore_revision` erst mit T07 (Revisionen existieren noch nicht) — weglassen und im Ticket-Kommentar vermerken.
5. CLI: `tokens create|list|revoke`, `mcp configure [--print]` (Claude Code/Cursor/opencode erkennen), `setup` (Token + MCP-Config + Skills; Abschluss-Check `whoami` + `list_sites` → „arbeitsfähig ✓").
6. `skills`-Paket: Knowledge-Router, Master-Flow „Site aus Brief", `assets.md` (Beschaffung: generieren mit `image-use` oder lizenzfreie Quellen → `upload_asset`; Icons aus Open-Source-Sets; Lizenz- und Marken-Guardrails; Alt-Text-Pflicht; Grundlage `research/32`).
7. Tests (Prüfstelle 3): Workflow „Seite anlegen → Sektionen einfügen → prüfen" komplett über den MCP-Client; dazu Token-/Scope-/Revoke-/Rate-Limit-Tests und Audit-Tests.

**Verträge, die schon existieren (nicht neu erfinden):**
- `apply_mutations`: Body/Response in `packages/engine/src/mutations/contract.ts` (`baseDraftVersion`, `author`, `dry_run`, `mutations[]` → `newDraftVersion`, `undoBatchId`, `warnings[]`, `results[]`).
- Fehlerformat `{ error: { category: "validation"|"guardrail"|"conflict"|"auth"|"not_found", message, opIndex?, field?, suggestion? } }`.
- `author { kind: "human"|"agent", id, label }` — MCP-Calls setzen `kind: "agent"`, `id` = Token-Name.
- Mutationen: `insertNode`, `deleteNode`, `duplicateNode`, `moveNode`, `wrapNode`, `updateNodeProps`, `updateNodeMeta`, `setBreakpointOverride`, `clearBreakpointOverride`, `setMotion`, `clearMotion`, `updatePageMeta`.
- Style-Werte sind Token-Ref (`{ "$token": "accent" }`) oder freier Wert; Rohwert-Warnungen kommen als `warnings[]`.
- Engine-Routen und Testmuster: `packages/engine/src/http.ts`, `packages/engine/test/`.

**Randbedingungen:**
- Keine Rückwärtskompatibilitäts-Hacks, keine ungenutzten Exporte, Kommentare sparsam.
- Postgres: Docker fehlt; Tests laufen standardmäßig gegen pg-mem (Warnung), `TEST_DATABASE_URL` für echten Postgres (Wegwerf-Schema, `options=-c search_path=…`). pg-mem-Eigenheiten: `rowCount` immer 0 (RETURNING nutzen), Top-Level-Arrays an jsonb werden entpackt (`toJsonParam`), `ROLLBACK` wird ignoriert.
- `pnpm verify` muss vor dem Commit grün sein; danach ein Commit `T06: MCP-Kern & Agent-Setup - …`; Ticket-Status und `## Comments` aktualisieren.
- Sprache: Deutsch mit englischen Fachbegriffen.
