# Senify — Research & Projekt-Grundlage

> **Stand:** 14. September 2026
> **Status:** Projekt-Gründung. Research abgeschlossen (Phase 0).
> **Entscheidung #1 (festgelegt):** Greenfield-Plattform, unabhängig von WordPress.
> WordPress ist aus dem Kern-Scope. Höchstens später optionaler Import-/Export-Kanal — nicht priorisiert, nicht Teil der Architektur.

**Vision:** Senify ist das „WordPress für KI-Agenten" — eine agent-native Plattform, mit der KI-Agenten (Claude Code, Cursor, eigene Builder) moderne Websites auf Framer-/Webflow-Niveau erstellen, pflegen und deployen. Plus ein Docs-/Developer-Portal nach Sanity-Vorbild.

---

## 1. Referenz-Analyse: Sanity.io Docs-Portal

### 1.1 UI-Anatomie (aus Live-HTML verifiziert, Sept 2026)

| Zone | Details |
|---|---|
| **Masthead** (sticky) | Logo + „Documentation", **Search-Feld „Search or Ask AI… CTRL K"** (öffnet Dialog mit KI-Antworten), „Login" + „Get started" |
| **Hauptnavigation** | 6 Dropdown-Menüs (Radix): Getting started · Platform · Apps · Integrations · Reference · Resources |
| **Linke Sidebar** | 260px, einklappbar, sticky mit Fade. Struktur: Abschnittstitel → Themengruppen (Labels) → Einträge. Aktiver Eintrag: Farbbalken links + Brand-Color |
| **Artikel-Tabs** | „Article" / „Changelog" (mit „New"-Badge) |
| **Rechte Spalte** | „On this page"-TOC mit verschachtelten Ankerlinks + Scroll-Tracking; auf md–xl als Floating-Sidebar |
| **Content-Kopf** | Breadcrumb (Sektionsname) + „Last updated <Datum>", H1, **„Copy article"-Button + Actions-Menü** |
| **Inhalte** | Framework-Tabs (Next.js/Astro/Nuxt/React Router), Code-Blöcke mit Copy, Callouts, Prev/Next, „Related changelog entries" |
| **Startseite** | Hero, Popular-Destinations-Karten, Sektionen für Platform/Apps/Reference/Resources |

**Tech:** Next.js (App Router), Radix UI, striktes Token-System (`bg-bg-base`, `text-fg-dim`, `--masthead-height`), keine Hex-Werte im UI-Code.
**Umfang:** ~600+ Seiten in ~32 Sektionen.

### 1.2 Agent-Readiness (Goldstandard, übernehmen!)

- **`/docs/llms.txt`**: kompakter Index aller Sektionen; zusätzlich `llms/{section}.txt` pro Bereich + `llms-full.txt` (Gesamtdoku)
- **Jede Seite als Markdown**: URL + `.md` oder HTTP-Header `Accept: text/markdown`
- **Agent-Hinweis als erster Satz** jeder Seite
- **MCP-Doku-Tools**: `search_docs` + `read_docs` — Agenten konsumieren Doku über MCP
- **Changelog-Einträge als `.md` verlinkt** (Agent prüft, ob Fix live ist)

### 1.3 Sanitys Plattform-Architektur (Blaupause)

- **Content Lake**: Echtzeit-Structured-Content-DB · GROQ-Query-Sprache · Perspectives (draft/published) · **Releases** (versionierte Content-Bundles) · Embeddings + semantische Suche
- **Apps**: Studio (anpassbares CMS) · Canvas (AI-Writing) · Media Library · Dashboard · App SDK · Content Agent (Chat mit Inhalten)
- **Agent-Layer:**
  - **MCP-Server** (`mcp.sanity.io`, remote, OAuth + Tokens): 40+ Tools — Schema deployen, Dokumente drafts-first anlegen/patchen/publizieren, Releases, GROQ, Semantik-Suche, Bild-Generierung, Projekte/Datasets, CLI, **`give_feedback`**-Tool
  - **Sanity Context**: bewusst **read-only** MCP für Content (Modi: Live-GROQ oder „Knowledge Bases"), initial context, Conversation-Insights
  - **Agent Actions**: schema-bewusste APIs Generate / Transform / Translate / Prompt (Feld-Targeting, Instruction-Params, conditional paths)
  - **Functions** (Event-getrieben, GROQ-Delta: `before()/after()`, `delta::changedOnly()`) + **Blueprints** (Infrastructure-as-Code)
  - **Agent Skills** (`npx skills add sanity-io/agent-toolkit`) + **AGENTS.md „Knowledge Router"** (Thema → Referenzdatei)
- **Agenten-Quickstarts**: Guide *für Agenten geschrieben*; Connectoren für **v0, Bolt, Lovable, Replit**
- **Sicherheit:** Agenten arbeiten immer auf **Drafts**; explizite Publish-Schritte; scoped Tokens; OAuth

---

## 2. Wettbewerbs- & Referenzlandschaft

### 2.1 Moderne Websites (Framer/Webflow-Niveau)

| Plattform | Architektur | Lernpunkt für Senify |
|---|---|---|
| **Framer** | React; Components mit **Varianten + Breakpoint-Varianten**; Motion first-class; CMS; AI-Canvas-Agent erzeugt editierbare Layer | Qualität entsteht durch **Komponenten + Varianten + Motion-Regeln**, nicht durch Freitext-Code |
| **Webflow** | Elements → Styles → **Classes** (base/combo/global); AI-Assistant; Positionierung „agentic web platform" | Strenges **Klassensystem** = konsistenter Agenten-Output |
| **Builder.io** | **Component Registry** (Props-Schema) + Visual Editor + **Fusion-Agent** baut & registriert Komponenten; Figma→Code; eigene `builder-agent-skills` | **Registry + Schema = Guardrails**: Agenten nutzen nur erlaubte Bausteine |
| **v0 / Lovable / Bolt / Replit** | Prompt → Code/App; MCP-Connectoren (Sanity als Backend) | Generieren **Code statt strukturierter Seiten** → Wartbarkeit & Design-Konsistenz brechen bei Skalierung |

### 2.2 CMS & MCP-Landschaft

- **Strapi**: MCP-Server **GA** (v5.49, Sept 2026) — auto-generierte CRUD-Tools pro Content-Type; **gescopte Admin-Tokens mit Owner-Permission-Ceiling**; opt-in. Gutes Berechtigungsmodell.
- **Payload / Directus / Storyblok / Contentful**: alle mit MCP-Ambitionen. Trend: *Headless CMS wird Governance-Layer für AI-Content* (Audit, Permissions, MCP).
- **Puck**: Open-Source-React-Visual-Editor, jetzt „**agentic visual editor**" — Referenz/Unterbau für den visuellen Editor.
- **Plasmic / Onlook / Easyblocks**: visuelle Builder für React; Onlook schreibt Edits in Code zurück.

### 2.3 Docs-Tooling

- Mintlify / Fumadocs / Starlight / Docusaurus: Mintlify generiert automatisch `llms.txt` + `llms-full.txt` — **AI-Readability ist 2026 Differenzierungsmerkmal**.
- Kapa.ai / Inkeep: Docs-AI-Assistenten als Fremdprodukte — Sanity baut das selbst („Search or Ask AI").

---

## 3. Architektur-Blaupause: Senify

### 3.1 Die 8 Kernbausteine

1. **Schema-/Content-Model-System** — typisiert, deploybar, versioniert; Agenten lesen *und* erweitern Schemas (`get_schema` / `deploy_schema`-Muster)
2. **Component Registry + Section-Library** — jede Sektion (Hero, Features, Pricing, Testimonials, FAQ, Footer, …) als registrierte Komponente mit **Props-Schema + Slots + Preview + erlaubten Parent/Children**. Seite = JSON-Tree `{ component: "hero", props: {…}, tokens, responsive }`. **Kein freies HTML** — wichtigster Qualitäts-Hebel
3. **Design-System-Layer** — Tokens (Farbe/Typo/Spacing/Radius/Shadows/**Motion-Presets**), Global Classes, Breakpoint-Varianten
4. **Motion first-class** — Presets (Scroll-Reveal, Parallax, Stagger, Kinetic Type) via Motion/GSAP, per Prop aktivierbar. Ohne Motion kein Framer-Feeling
5. **Agent-Surface** — Remote-MCP-Server: `create_site`, `create_page`, `list_sections`, `add_section`, `update_content`, `publish`, `create_preview`, `rollback`, `search_docs`, `read_docs`, `give_feedback`; OAuth + scoped Tokens; **Drafts-first**; getrennter read-only-Context-Endpoint. Plus `AGENTS.md` (Knowledge Router) + Skills-Pakete
6. **Lifecycle & Trust** — Draft → Preview-URL → Approval → Publish; Releases/Versionen, Diff, **Rollback**; Audit-Log (wer/was/Quelle/Policy); Guardrails: destruktive Aktionen nur mit Freigabe
7. **Rendering & Hosting** — SSG/ISR-Renderer (Astro/Next), per-Site-Preview-Deploys, CDN, Performance-Budgets; Mandanten: Org → Project → Workspace
8. **Quality Gates** — automatisch: Responsive-, Lighthouse-, A11y-/Kontrast-Checks; **SEO + AEO** (llms.txt + Structured Data pro Website!); Visual-Regression

### 3.2 „Framer-Qualität" systematisch erzeugen

Erkenntnis: AI-Websites sehen generisch aus, weil Modelle **ohne Identität + ohne strikte Systeme** generieren. Lösung:
- Komponenten + Varianten statt Freiform (Framer-Muster)
- Tokens statt Hex-Werte, Klassensystem statt Inline-CSS (Webflow-Muster)
- Motion-Presets statt willkürlicher Animationen
- Layout-Archetypen mit bewusster Variation (asymmetrische Grids, Größen-Sprünge, Whitespace-Regeln)
- „Taste as Code": vorhandene Design-Skills (awwwards-hero, awwwards-motion, design-taste, gpt-taste, high-end-visual-design) als **Skills + Rules für die Senify-Agenten** verpacken

---

## 4. Sinnvolle Ergänzungen (Differenzierung)

1. **WebMCP für generierte Sites** — Kunden-Websites exponieren Funktionen (Buchen, Kontakt, Suche) als Browser-Agent-Tools (`navigator.modelContext`). „Agent-ready by default" — hat kein Wettbewerber.
2. **AEO/llms.txt-Automation** — llms.txt, `.md`-Endpoints, Structured Data automatisch pro Website; AEO-Dashboard.
3. **Approval-Queue für Nicht-Devs** — Agentenänderungen mit Screenshot-Diff + „Übernehmen/Verwerfen"; Ein-Klick-Rollback.
4. **Brand→Tokens-Import** — Logo/Farben/Fonts (oder URL) → Design-System in Sekunden.
5. **Importe als Lead-Magnet** — Framer-/Webflow-/WP-Import für Migrationen (WXR, Framer-Export-Formate).
6. **Agency-Features** — Multi-Client-Workspaces, White-Label, Vorlagen-Marktplatz, Kunden-Onboarding.
7. **Content ohne Site** — Blog/CMS-Funktionen (Sanity-Stärke) gleich mitdenken.
8. **Agent-Insights** — Analytics: Welche Tools nutzen Agenten? Wo scheitern sie? (Selbstverbesserung, Conversation-Insights-Muster.)
9. **DSGVO/Compliance als Feature** — EU-Hosting-Option, Audit-Logs, Datenexporte (DE-Markt).
10. **Distribution** — MCP-Registry, Connectoren in Claude/Cursor/v0/Lovable (Sanitys Wachstumsmotor).

## 5. UI/UX-Blueprint Portal

- **Layout 1:1 nach Sanity-Muster**: Masthead (Search/Ask AI + Login + CTA) · 5–7 Kategorien mit Dropdowns · linke Sidebar (260px, Gruppen-Labels, Active-Bar) · rechte „On this page"-TOC · Article/Changelog-Tabs · Breadcrumb + Last-Updated · Copy-Article
- **Agent-Canvas ab Tag 1**: `llms.txt` + `.md`-Endpoints + MCP `search_docs`/`read_docs`
- **„Ask AI"** im CTRL-K (RAG über eigene Doku)
- **Stack-Vorschlag**: Next.js + Radix/shadcn + Tailwind + Token-Layer; **Content im eigenen Produkt** (Dogfooding); Search: Orama/Pagefind + Ask AI
- Sprache: Englisch primär (Dev-Publikum), Deutsch optional

## 6. Offene Entscheidungen (Input für den Flow)

1. ~~WordPress?~~ → **entschieden: Greenfield, WP-frei** ✅
2. **Zielgruppe v1**: Agenten-Entwickler (Dev-first) vs. Agenturen/Non-Tech mit Claude/Cursor?
3. **Design-Anspruch**: „solide modern" vs. Awwwards-Level-Motion?
4. **Business-Modell**: SaaS · Open-Core/Self-hosted · Agentur-Tool-intern zuerst?
5. **MVP-Schnitt**: welche 10–15 Sections + welcher MCP-Tool-Umfang für v1?
6. **Rendering/Hosting**: Astro vs. Next als Renderer; eigenes Hosting vs. Vercel-ähnlich?
7. **Editor-Strategie**: Puck als Basis? Eigenbau? Agent-only (Visual Editor später)?

## 7. Quellen (Auswahl)

- Sanity Docs: `https://www.sanity.io/docs` · `llms.txt` · MCP-Server-Doku · Sanity Context · Agent Actions · Agent Skills · `github.com/sanity-io/agent-toolkit`
- WordPress Abilities/MCP (Referenz für Standards): `developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/`
- Strapi MCP GA: `strapi.io/blog/the-strapi-mcp-server-is-now-ga`
- Builder.io Fusion + Agent Skills: `builder.io/c/docs/fusion-sub-agent-for-publish` · `github.com/BuilderIO/builder-agent-skills`
- Puck: `puckeditor.com` · WebMCP: `developer.chrome.com/docs/ai/webmcp`
- Framer AI: `framer.com/ai` · Webflow AI-Builder-Blog 2026
- llms.txt: `llmstxt.org` · Agent Skills Format: `agentskills.io`
