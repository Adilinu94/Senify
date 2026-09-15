# MCP-Betrieb & Authentifizierung

Type: grilling
Status: resolved

## Question

Wie wird der MCP-Server betrieben und abgesichert: remote (HTTP) oder lokal (stdio)? OAuth 2.1 oder Tokens, welche Scopes, welche Client-Setups (Claude Code, Cursor, …) unterstützen wir in v1? Wie sieht der (interne) Plattform-Zugang aus — single-operator oder Rollen?

Ergebnis: Betriebs- und Auth-Modell inkl. Rate-Limits und Logging.

## Answer

Betriebs- & Auth-Modell entschieden (6/6 Wizard). Artefakt: [artifacts/04-mcp-betrieb.md](../artifacts/04-mcp-betrieb.md).

- **Topologie:** lokaler stdio-MCP als Teil der Senify-CLI; Tool-Kern transport-agnostisch (Remote-HTTP später ohne Umbau).
- **Auth:** scoped API-Tokens pro Client (Name/Scopes/Ablauf, revocierbar, serverseitig gehasht); kein OAuth in v1.
- **Scopes:** `read` · `write` · `publish` — serverseitig durchgesetzt; Default `read,write`; Publish bewusst oder über Approval (Ticket 06).
- **Setup:** `senify mcp configure` (Claude Code/Cursor/opencode) + Docs-Snippets; kein Hosted-Connector.
- **Plattform-Zugang:** Single-Operator (Login + Tokens; Attribution human/agent; rollenfähig).
- **Limits & Audit:** 60 req/min pro Token (Publish stricter) + volles Append-only-Audit aller MCP-Calls (Dashboard-Filter).

Inputs verdrahtet: 05, 06, 10, 11.
