# Artefakt 12: Docs-Portal v0 (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Docs-Portal v0".
> Grundlagen: `RESEARCH.md` §1 (Sanity-Docs-Anatomie), `artifacts/10` (Tools), `artifacts/11` (Generierungs-Pipeline).

## Entscheidungen (Wizard, 5/5)

1. **IA (Sanity v0):** Getting Started · Platform-Guides · Reference · Changelog.
2. **Stack:** Astro + MDX (statisch, Plattform-Tokens).
3. **Inhalte:** Referenz generiert + Guides kuratiert.
4. **Suche:** Pagefind + „Ask AI" (BYOK).
5. **Agenten-Exports:** voller Sanity-Satz (`llms.txt`, `llms-full.txt`, `.md` je Seite, Banner) + MCP-Docs-Tools.

## IA & UI-Anatomie (Sanity-Muster)

- **Masthead:** Logo „Documentation" · **„Search or Ask AI … CTRL K"** · Login/„Open Dashboard".
- **Hauptnav:** Getting Started · Platform · Reference · Guides · Changelog.
- **Linke Sidebar:** Gruppen (Getting Started / Platform: Sites · Sektionen · Motion · Tokens · Workflow / Reference: Tools · Sektions-Katalog · Fehlercodes); aktiver Eintrag mit Brand-Bar.
- **Rechte Spalte:** „On this page"-TOC mit Scroll-Tracking.
- **Seitenkopf:** Breadcrumb + „Last updated <Datum>" · H1 · „Copy article"-Button (+ `.md`-Link).
- **Inhalte:** Code-Blöcke mit Copy, Callouts, Prev/Next; Reference-Seiten mit generierten Tabellen.
- Styling: **dieselben Design-Tokens wie die Plattform** — eine Token-Wahrheit, Wiedererkennung.

## Stack & Struktur

```
docs-portal/ (Astro + MDX, statisch)
├── src/content/docs/**           # kuratierte Guides (MDX)
├── src/content/generated/        # GENERIERT: tools/ · sections/ · errors/
├── public/llms.txt · llms-full.txt
└── Endpoints: /<seite>.md · Accept: text/markdown
```

- Deploy: statische Dateien zusammen mit der Plattform (Ticket 14); Pagefind-Index im Build.

## Suche & „Ask AI"

- **Pagefind:** Client-seitige Keyword-Suche (kein Backend).
- **„Ask AI" (Ctrl+K):** beantwortet Fragen über den Doku-Index, **mit Quellenlinks**; **BYOK** (eigener LLM-Key in der Portal-Config) — bewusst kein Plattform-AI-Feature (v1-Scope).
- Agenten nutzen parallel `search_docs`/`read_docs` (MCP) — dieselben Inhalte, andere Oberfläche.

## Agenten-Exports

- `/llms.txt` (Index), `/llms-full.txt` (Gesamtdoku), jede Seite als Markdown (`.md` an der URL oder `Accept: text/markdown`), Agent-Hinweis-Banner auf jeder Seite.
- Referenz-Inhalte aus **einer** Quelle (Registry / Tool-Katalog / Fehlercodes) → Portal und Skillpaket können nie auseinanderlaufen.

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Gleiche Generierungs-Pipeline wie das Skillpaket | 11 |
| Deploy zusammen mit der Plattform | 14 |
