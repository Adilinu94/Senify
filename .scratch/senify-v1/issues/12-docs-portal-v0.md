# Docs-Portal v0

Type: grilling
Status: resolved
Blocked by: 01

Input: artifacts/10-mcp-tools.md
Input: artifacts/11-agent-experience.md

## Question

Wie ist das Portal v0 strukturiert (IA: Getting Started, Platform-Guides, Reference, Changelog), welche Endpoints/Formate (llms.txt, `.md` je Seite, MCP-Doc-Tools), welche Suche (Pagefind/Orama, „Ask AI" ja/nein), welcher Tech-Stack (Next.js + Token-Layer)?

Ergebnis: Portal-Blueprint analog Sanity-Docs.

## Answer

Portal entschieden (5/5 Wizard). Artefakt: [artifacts/12-portal.md](../artifacts/12-portal.md).

- **IA:** Getting Started · Platform-Guides · Reference · Changelog — UI-Anatomie 1:1 nach Sanity (Masthead-„Search or Ask AI", Sidebar-Gruppen, On-this-page-TOC, Copy-Article, Last-Updated).
- **Stack:** Astro + MDX, statisch, Plattform-Tokens, minimales JS.
- **Inhalte:** Reference generiert (Pipeline aus 11), Guides kuratiert, Changelog datiert.
- **Suche:** Pagefind + „Ask AI" (BYOK, Antworten mit Quellenlinks; bewusst kein Plattform-AI-Feature).
- **Agenten-Exports:** `llms.txt` + `llms-full.txt` + `.md` je Seite + Banner; MCP-Docs-Tools (`search_docs`/`read_docs`) teilen dieselbe Quelle.

Inputs verdrahtet: 14.
