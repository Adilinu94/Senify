# Artefakt 04: MCP-Betrieb & Authentifizierung (Senify v1)

> Entschieden am 14.09.2026 in Ticket „MCP-Betrieb & Authentifizierung".
> Grundlagen: `research/20-referenzprojekte.md` (§2.3), MCP-/Auth-Recherche (Session 01), Muster von Sanity/Strapi/WordPress/OpenDesign.

## Entscheidungen (Wizard, 6/6)

1. **Topologie:** Lokaler **stdio-MCP als Teil der Senify-CLI**; Tool-Kern transport-agnostisch → Remote-HTTP später ohne Umbau möglich.
2. **Auth:** **Scoped API-Tokens** (pro Client/Zweck: Name + Scopes + Ablauf, revocierbar) statt OAuth.
3. **Scopes (3 Stufen):** `read` · `write` · `publish`.
4. **Client-Setup:** `senify mcp configure` (Auto-Detect Claude Code/Cursor/opencode) + Docs-Snippets als Fallback.
5. **Plattform-Zugang:** Single-Operator (ein Login + Tokens; Attribution human/agent; Rollen später).
6. **Limits & Logging:** Rate-Limits pro Token + **volles Audit-Log aller MCP-Calls**.

## Topologie & Transport

```
Claude Code / Cursor / opencode
        │  (stdio, lokal)
┌───────▼─────────┐     HTTPS + Token     ┌──────────────────┐
│ senify mcp      │ ────────────────────▶ │ Senify Platform  │
│ (CLI-Transport) │                       │ API/Engine       │
└─────────────────┘                       └──────────────────┘
```

- Der MCP-Prozess läuft lokal (Kind der Agent-Session); **die Autorität liegt serverseitig** (Tokens, Scopes, Validierung, Limits) — der lokale Prozess ist nur ein dünner Transport.
- Tool-Kern (Definitionen, Schemas, Fehlertexte) liegt in einem geteilten Paket → derselbe Katalog kann später als Remote-Endpoint (Streamable HTTP) ausgeliefert werden.

## Auth & Tokens

- **Erstellung:** CLI (`senify tokens create --name "Claude Code" --scopes read,write --expires 90d`) oder Dashboard; Secret wird **einmal** angezeigt, serverseitig nur **gehasht** gespeichert.
- **Revocation:** jederzeit, wirkt sofort; Token-Liste mit letzter Nutzung.
- **Client-Config:** Token liegt lokal in der Agent-Config — dokumentierter Trade-off; OS-Keychain-Integration als spätere Option.
- **Attribution:** jede Mutation trägt `author { kind: "agent", tokenName }` → Revisionen/Audit zeigen den verantwortlichen Client (nutzt die Author-Struktur aus Artefakt 01).
- **Kein OAuth in v1** (kein DCR/Consent/Sessions); OAuth bleibt der Standard-Pfad, falls der Server je remote geöffnet wird.

## Scope-Modell (3 Stufen)

| Scope | Deckt ab | Beispiel-Tools |
|---|---|---|
| `read` | Kontext, Queries, Schema-Lesen, Docs | `list_sections`, `get_page`, `query_documents`, `search_docs` |
| `write` | Entwürfe erstellen/ändern (drafts-first!) | `create_page`, `insert_node`, `update_node_props`, `set_motion` |
| `publish` | Live schalten & zurücknehmen, Löschen | `publish_release`, `rollback`, `delete_site` |

- **Default pro Client:** `read,write`; `publish` nur bewusst (z. B. „Publishing-Agent") oder über den Approval-Flow (Ticket 06).
- **Serverseitige Durchsetzung** am API-Gateway, nicht im lokalen Prozess; Fehlerantworten sind agentenlesbar („missing scope `publish` — create a token with publish scope").
- Verbindliche **Tool ↔ Scope**-Zuordnung pflegt der MCP-Tool-Katalog (Ticket 10).

## Client-Setup & Distribution

- `senify mcp configure` erkennt Claude Code / Cursor / opencode und schreibt die MCP-Config (Muster: `sanity mcp configure`, `od mcp install <agent>`); `--print` als Dry-Run.
- Portal-Docs (Ticket 12) enthalten pro Client JSON-Snippet + Troubleshooting (Token abgelaufen, Client-Neustart).
- Kein Hosted-Connector in v1 (das wäre die spätere öffentliche Stufe).

## Plattform-Zugang (intern)

- Ein Login (Passkey/Passwort) für dich; API-Tokens für Agenten; **keine Rollen-UI** in v1.
- Datenmodell bleibt rollenfähig (Author-Struktur, Token-Owner) — „Viewer/Editor"-Rollen später ohne Umbau möglich.

## Rate-Limits

- Pro Token, konservative Defaults: **60 Requests/Minute**, Burst 20; Publish-/destruktive Ops zusätzlich 10/Minute.
- `429` mit `retry-after` + agentenlesbarer Meldung.
- Serverseitig konfigurierbar; kein Client-Override.

## Audit-Log

- **Jeder MCP-Call** wird protokolliert: Zeit, Token/Client, Tool, Args-Kurzfassung, Ergebnis, betroffene Entität/Revision, Dauer.
- Append-only; Dashboard-Filter pro Client/Tool/Site.
- Verknüpfung mit Lifecycle (Ticket 05): Mutation → Undo-Patch/Revision → „wer hat das geändert?" immer beantwortbar. Grundlage für Approval (06) und Vertrauen in Agentenläufe.
- Secrets nie im Log (Args-Redaction).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Mutationen ↔ Revisionen ↔ Rollback (Audit-Verknüpfung) | 05 |
| Tool-Katalog inkl. Scope-Zuordnung je Tool | 10 |
| Onboarding-Doku & `configure`-Flow im Portal | 11/12 |
| Approval-Flow für `publish` | 06 |
| API-Hosting (wo läuft die Plattform-API) | 14 |

## Nachtrag 15.09.2026 (Technologie-Check → `research/30`)

- **MCP-Spec-RC 2026-07-28:** stateless Protocol-Core, Extensions, Tasks, MCP Apps, Authorization-Hardening, Deprecation-Policy; **Streamable HTTP** = etablierter Remote-Transport, **OAuth 2.1** = Remote-Auth-Standard.
- v1 unverändert (lokaler stdio + scoped API-Tokens, transport-agnostischer Kern); der spätere Remote-Pfad ist damit bestätigt: Streamable HTTP + OAuth 2.1.
