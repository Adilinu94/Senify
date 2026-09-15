---
title: Changelog
description: Was bislang gebaut wurde — vom Fundament bis zum Docs-Portal.
path: /changelog
group: Changelog
order: 1
---

## Teil 1 — Fundament und Werkzeuge

- **T01 Projekt-Fundament** — Monorepo, Schema-System, Registry, CLI-Skelett.
- **T02 Site & Pages + Mutations** — Engine-HTTP-API, Store, 12 kanonische Mutationen, Undo-Patches, Audit.
- **T03 Section-Library** — 25 Sektionen mit Varianten, Goldens und Motion-Presets.
- **T04 Theme & Design-Tokens** — Skalen-Engine (OKLCH), Theme-API und Kontrast-Report.
- **T05 Renderer & Bake** — Astro-SSG-Bake, AEO-Set (Markdown, `llms.txt`, Sitemap, FAQ-JSON-LD), Motion A–C und Islands.
- **T06 MCP-Kern & Agent-Setup** — scoped Tokens, Rate-Limits, MCP-Audit, stdio-MCP mit Tool-Katalog, Skillpaket.
- **T07 Lifecycle, Review & Checks** — Revisionen, Releases, Previews, Review-Items, Hard-Guardrails, Check-Pipeline.
- **T08 Media-Pipeline** — signierter Upload, Dedupe, Bibliothek, Replace mit Historie, Varianten-Ladder (AVIF/WebP), Blurhash und `<picture>`/`srcset`.

## Teil 2 — Individualisierung und Doku

- **T16 Voll-Individualisierung** — Standard-Style-Set je Sektion, Innenteile (Parts) und Layout-Regler; Werte als Token-Ref oder frei.
- **T15 Docs-Portal** — diese Seite: Referenz-Inhalte generiert aus Registry, Tool-Katalog und Fehlerkategorien; Agenten-Exporte (`llms.txt`, `llms-full.txt`, `.md` je Seite).