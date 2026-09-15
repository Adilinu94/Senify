---
title: Getting Started
description: Senify in fünf Minuten einrichten: Engine, Token, MCP-Client und der erste Agentenlauf.
path: /getting-started
group: Getting Started
order: 1
---

## 1. Senify einrichten

```bash
pnpm install
senify setup
```

`senify setup` legt ein scoped Token an, schreibt die MCP-Config für erkannte Agenten-Clients (Claude Code, Cursor, opencode), kopiert das Skillpaket nach `~/.senify/skills` und endet mit dem Abschluss-Check `whoami` + `list_sites` → „arbeitsfähig ✓".

## 2. Agenten-Client verbinden

Nach `senify setup` den Agenten-Client einmal neu starten. Der MCP-Server läuft lokal als Teil der Senify-CLI:

```bash
senify mcp serve        # stdio-Server, wird normalerweise vom Client gestartet
senify mcp configure --print   # Config-Snippet anzeigen statt schreiben
```

Das Token liegt in der Client-Config — es wird serverseitig nur als Hash gespeichert und ist jederzeit widerrufbar:

```bash
senify tokens list
senify tokens create --name "Publish Agent" --scopes read,write,publish
senify tokens revoke <id>
```

## 3. Erste Schritte im Agenten

Danach genügt ein Brief im Chat:

> „Baue mir die Site für das Café Neuhaus aus diesem Brief …"

Der Agent folgt dem Master-Flow: Bestand prüfen, Seitenstruktur vorschlagen, Seite anlegen, Sektion für Sektion über `apply_mutations` einfügen, prüfen und zur Review übergeben.

## 4. Was der Agent darf

Scopes werden **serverseitig** durchgesetzt — der lokale MCP-Prozess ist nur ein Transport:

| Scope | Bedeutung |
| --- | --- |
| `read` | Kontext und Katalog lesen |
| `write` | Drafts ändern (drafts-first) |
| `publish` | Live schalten, zurücknehmen, löschen |

Scope-Verstöße kommen als agentenlesbare Fehler mit der Bitte zurück, ein Token mit dem nötigen Scope anzulegen.

## Weiterlesen

- [Tools](/reference/tools) — der komplette MCP-Katalog inklusive `apply_mutations`-Vertrag
- [Sektions-Katalog](/reference/sections) — die Bausteine mit Props und Golden Examples
- [Fehlercodes](/reference/errors) — das strukturierte Fehlerformat
- [Site aus Brief](/guides/site-aus-brief) — der komplette Master-Flow