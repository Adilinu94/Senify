# 15: Docs-Portal

**What to build:** Das statische Docs-Portal: Astro + MDX mit IA (Getting Started · Platform · Reference · Guides · Changelog), gestylt mit denselben Plattform-Tokens. Referenz-Inhalte (Tools, Sektions-Katalog, Fehlercodes) **generiert** aus Registry/Tool-Katalog/Fehlercodes (dieselbe Pipeline wie das Skillpaket — nie Drift); Guides kuratiert. Suche per Pagefind + „Ask AI" (Ctrl+K, BYOK, Quellenlinks). Agenten-Exports: `/llms.txt`, `/llms-full.txt`, jede Seite als Markdown (`.md`-URL / `Accept: text/markdown`) + Agent-Hinweis-Banner; MCP-Docs-Tools `search_docs`/`read_docs` greifen auf dieselben Inhalte. Deploy als statische Dateien zusammen mit der Plattform.

**Blocked by:** 03 (Section-Library — Katalog-Doku), 06 (MCP-Kern — Tool-Referenz).

**Status:** ready-for-agent

- [ ] Portal baut statisch; Referenz-Seiten (Tools/Sektionen/Fehlercodes) entstehen aus den Quellen (keine Handpflege); Changelog + Guides kuratiert
- [ ] Seite-nach-Seite-Markdown (`<seite>.md`) + `llms.txt` + `llms-full.txt` korrekt; `search_docs`/`read_docs` liefern dieselben Inhalte
- [ ] Pagefind-Suche + „Ask AI" (eigener LLM-Key in der Portal-Config) mit Quellenlinks funktionieren
- [ ] Portal nutzt die Plattform-Tokens; Deploy-Pfad für statische Artefakte vorhanden

Quellen: `artifacts/12`, `artifacts/11` (Generierungs-Pipeline), Spec „Portal & Doku".