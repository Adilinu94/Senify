# 15: Docs-Portal

**What to build:** Das statische Docs-Portal: Astro + MDX mit IA (Getting Started · Platform · Reference · Guides · Changelog), gestylt mit denselben Plattform-Tokens. Referenz-Inhalte (Tools, Sektions-Katalog, Fehlercodes) **generiert** aus Registry/Tool-Katalog/Fehlercodes (dieselbe Pipeline wie das Skillpaket — nie Drift); Guides kuratiert. Suche per Pagefind + „Ask AI" (Ctrl+K, BYOK, Quellenlinks). Agenten-Exports: `/llms.txt`, `/llms-full.txt`, jede Seite als Markdown (`.md`-URL / `Accept: text/markdown`) + Agent-Hinweis-Banner; MCP-Docs-Tools `search_docs`/`read_docs` greifen auf dieselben Inhalte. Deploy als statische Dateien zusammen mit der Plattform.

**Blocked by:** 03 (Section-Library — Katalog-Doku), 06 (MCP-Kern — Tool-Referenz).

**Status:** umgesetzt (`pnpm verify` grün; Portal baut statisch mit 34 Seiten, Pagefind-Index, Agent-Exporten und MCP-Docs-Tools)

- [x] Portal baut statisch; Referenz-Seiten (Tools/Sektionen/Fehlercodes) entstehen aus den Quellen (keine Handpflege); Changelog + Guides kuratiert
- [x] Seite-nach-Seite-Markdown (`<seite>.md`) + `llms.txt` + `llms-full.txt` korrekt; `search_docs`/`read_docs` liefern dieselben Inhalte
- [x] Pagefind-Suche + „Ask AI" (eigener LLM-Key in der Portal-Config) mit Quellenlinks funktionieren
- [x] Portal nutzt die Plattform-Tokens; Deploy-Pfad für statische Artefakte vorhanden

Quellen: `artifacts/12`, `artifacts/11` (Generierungs-Pipeline), Spec „Portal & Doku".

## Comments

**15.09.2026 — Teil 1: Generierungs-Pipeline + Agent-Exporte.**
- **`docs-portal` src:** `catalog.ts` liest die drei Single Sources — `createRegistry().list()` (25 Sektionen mit Props/Style-Props/Varianten/Slots/Golden), `TOOLS` aus `@senify/mcp` (Parameter aus den JSON-Schemas abgeleitet) und `ERROR_GUIDES` (als `Record<ErrorCategory, …>`: eine neue Kategorie in core erzwingt die Doku per Typecheck). `reference.ts` erzeugt daraus die Seiten `/reference/tools`, `/reference/sections` (+ eine Detailseite pro Sektion), `/reference/errors`. `exports.ts` erzeugt `llms.txt` (Index mit `.md`-Links), `llms-full.txt` (Gesamtkorpus) und `pageMarkdown` (Titel + Blockquote + Body) je Seite. `model.ts` definiert `DocsPage` (Pfad, Gruppe, Ordnung) für die spätere Astro-Site.
- **Tests (16):** Katalog-Spiegelung gegen Registry/`TOOLS`/Fehlerkategorien, Parameter-Ableitung (`apply_mutations` required/`array<object>`), Scope-Abdeckung, Referenz-Seiten-Vollständigkeit und Determinismus, Export-Formate.

**15.09.2026 — Teil 2: Astro-Site, Suche, Ask AI, Docs-Tools.**
- **Site:** Astro 7 (statisch, `dist/`), Layout mit Masthead/Sidebar/TOC/Agent-Banner, gestylt über `emitCss(resolveTheme(defaultTheme()))` aus `@senify/tokens` (eine Token-Wahrheit mit der Plattform) + `public/portal.css`. Seiten: `index` (Redirect), `[...path].astro`, `[...path].md.ts` (Markdown-Twins), `llms.txt.ts`, `llms-full.txt.ts`. Build-Skript `pnpm --filter @senify/docs-portal build` = `astro build && pagefind --site dist`.
- **Inhalte:** 5 kuratierte Guides als Markdown mit Frontmatter (`content/docs/`: Getting Started, Sites & Pages, Site aus Brief, Assets, Changelog); Referenz-Seiten komplett generiert. `guides.ts`/`portal.ts` laden beide Quellen zu einer `portalPages()`-Liste — dieselbe Liste speist Site, Exporte und Tools.
- **Suche & Ask AI:** Pagefind (33 Seiten indexiert) mit UI im Ctrl+K-Dialog; „Ask AI" ist BYOK (`public/portal-config.json`, Beispiel: `portal-config.example.json`, gitignored), nutzt Pagefind-Treffer als Quellen und `askAiRequest()` (OpenAI-kompatibel) mit Quellen-Pfaden.
- **MCP:** `search_docs` (gewichtete Treffer, Snippets) und `read_docs` (Markdown je Pfad, `not_found` mit Hinweis auf `llms.txt`) — 27 Tools; Lazy-Import von `@senify/docs-portal` bricht den Paket-Zyklus (Docs-Katalog liest `TOOLS` aus `@senify/mcp`).
- **Tests (18 neu):** Guides-Parser (Frontmatter, Fehlerfälle), Rendering (Heading-IDs, TOC, Entitäten), Suche (Ranking/Snippets/Grenzfälle), Ask-AI-Request, Build-Test (Astro + Pagefind → Seiten, `.md`-Twins, `llms*.txt`, Client-Bundle) und der MCP-Fall über den echten Client.
- **Bewusst offen / Abweichungen:** Guides sind reines Markdown + `marked` statt MDX (so bleiben Site, `.md`-Export und Docs-Tools wortgleich — kein zweiter Renderpfad); `Accept: text/markdown`-Content-Negotiation entfällt bei statischem Deploy (die `.md`-URLs erfüllen den Export-Anspruch, Negotiation käme mit dem Hosting-Layer/T14); Deploy = statischer `dist/`-Ordner (Auslieferung übernimmt T14).