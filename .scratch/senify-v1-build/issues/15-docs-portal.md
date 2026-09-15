# 15: Docs-Portal

**What to build:** Das statische Docs-Portal: Astro + MDX mit IA (Getting Started · Platform · Reference · Guides · Changelog), gestylt mit denselben Plattform-Tokens. Referenz-Inhalte (Tools, Sektions-Katalog, Fehlercodes) **generiert** aus Registry/Tool-Katalog/Fehlercodes (dieselbe Pipeline wie das Skillpaket — nie Drift); Guides kuratiert. Suche per Pagefind + „Ask AI" (Ctrl+K, BYOK, Quellenlinks). Agenten-Exports: `/llms.txt`, `/llms-full.txt`, jede Seite als Markdown (`.md`-URL / `Accept: text/markdown`) + Agent-Hinweis-Banner; MCP-Docs-Tools `search_docs`/`read_docs` greifen auf dieselben Inhalte. Deploy als statische Dateien zusammen mit der Plattform.

**Blocked by:** 03 (Section-Library — Katalog-Doku), 06 (MCP-Kern — Tool-Referenz).

**Status:** Teil 1 umgesetzt (Generierungs-Pipeline + Agent-Exporte; `pnpm verify` grün, 239 Tests) - Astro-Site, Pagefind, Ask AI, Deploy-Pfad und `search_docs`/`read_docs` folgen als Teil 2

- [~] Portal baut statisch; Referenz-Seiten (Tools/Sektionen/Fehlercodes) entstehen aus den Quellen (keine Handpflege); Changelog + Guides kuratiert — Pipeline steht, Astro-Site folgt in Teil 2
- [~] Seite-nach-Seite-Markdown (`<seite>.md`) + `llms.txt` + `llms-full.txt` korrekt; `search_docs`/`read_docs` liefern dieselben Inhalte — Exporte stehen, MCP-Tools folgen in Teil 2
- [ ] Pagefind-Suche + „Ask AI" (eigener LLM-Key in der Portal-Config) mit Quellenlinks funktionieren
- [ ] Portal nutzt die Plattform-Tokens; Deploy-Pfad für statische Artefakte vorhanden

Quellen: `artifacts/12`, `artifacts/11` (Generierungs-Pipeline), Spec „Portal & Doku".

## Comments

**15.09.2026 — Teil 1: Generierungs-Pipeline + Agent-Exporte.**
- **`docs-portal` src:** `catalog.ts` liest die drei Single Sources — `createRegistry().list()` (25 Sektionen mit Props/Style-Props/Varianten/Slots/Golden), `TOOLS` aus `@senify/mcp` (Parameter aus den JSON-Schemas abgeleitet) und `ERROR_GUIDES` (als `Record<ErrorCategory, …>`: eine neue Kategorie in core erzwingt die Doku per Typecheck). `reference.ts` erzeugt daraus die Seiten `/reference/tools`, `/reference/sections` (+ eine Detailseite pro Sektion), `/reference/errors`. `exports.ts` erzeugt `llms.txt` (Index mit `.md`-Links), `llms-full.txt` (Gesamtkorpus) und `pageMarkdown` (Titel + Blockquote + Body) je Seite. `model.ts` definiert `DocsPage` (Pfad, Gruppe, Ordnung) für die spätere Astro-Site.
- **Tests (16):** Katalog-Spiegelung gegen Registry/`TOOLS`/Fehlerkategorien, Parameter-Ableitung (`apply_mutations` required/`array<object>`), Scope-Abdeckung, Referenz-Seiten-Vollständigkeit und Determinismus, Export-Formate.
- **Bewusst offen (Teil 2):** Astro-Site mit Plattform-Tokens, MDX-Guides + Changelog, Pagefind, „Ask AI" (BYOK), `Accept: text/markdown`-Endpoint, Deploy-Pfad, MCP-Tools `search_docs`/`read_docs`. Blockiert durch `pnpm-lock.yaml`-Koordination (neue Deps) — erst nach dem T08.2-Commit.

## Handoff Teil 2 (Stand 15.09.2026): Astro-Site + Suche + MCP-Docs-Tools

**Auftrag:** T15 Teil 2 umsetzen. Reihenfolge: (1) Deps + Astro-Site gegen die bestehende Pipeline, (2) `pagefind` + „Ask AI", (3) `search_docs`/`read_docs` in `packages/mcp/src/tools.ts`, (4) Deploy-Pfad + Tests.

**Ist-Stand:** Teil 1 committet; `referencePages()`, `llmsTxt()`, `llmsFullTxt()`, `pageMarkdown()` stehen und sind getestet. `docs-portal/src/index.ts` ist die öffentliche Fläche. Neue Deps nötig: `astro` (schon im Lockfile, via renderer), `@astrojs/mdx` und `pagefind` (neu) — deswegen **erst nach dem T08.2-Commit** `pnpm install` laufen lassen (gemeinsamer Tree!).

**Vorgaben:** IA und UI-Anatomie aus `artifacts/12` (Masthead, Sidebar-Gruppen, „On this page", Copy-Article, Prev/Next); Tokens aus `@senify/tokens` (gleiche Wahrheit wie die Plattform); Guides als MDX unter `docs-portal/src/content/docs/**`, generierte Referenz aus der Pipeline (nicht als Dateien einchecken — zur Build-Zeit erzeugen); `search_docs`/`read_docs` lesen dieselben Seiten (Pipeline-Output), nicht das HTML.

**Randbedingungen:** Sprache Deutsch mit englischen Fachbegriffen; keine ungenutzten Exporte; `pnpm verify` vor dem Commit grün; ein Commit `T15 (Teil 2): …`.