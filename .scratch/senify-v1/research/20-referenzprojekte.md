# Referenzprojekte: OpenPage, Instatic, OpenDesign

> Recherche vom 14.09.2026 (Auftrag: Learnings & konkreter Nutzen für Senify).
> Quellen: Repo-READMEs, `CLAUDE.md`, `AGENTS.md`, `docs/architecture.md`, Website-Vergleichsseite.

## TL;DR

- Alle drei validieren Senifys Grundrichtung: **JSON-first, Agent + Mensch auf demselben Datenmodell, self-hosted, offene Lizenz, kein Codegen**.
- **Keiner** bietet die Kombination, die Senify anzielt: **MCP-first + Motion-/Awwwards-Qualität + Sektion-Registry mit Motion-Presets + Approval/AEO**.
- **Instatic** (8.6k★, MIT) ist die reichhaltigste Muster-Quelle (Datenmodell, Mutationen, Publisher, Validierung). **OpenPage** (66★, MIT) ist der nächste architektonische Zwilling und ein Fork-Kandidat für den Editor. **OpenDesign** (96k★, Apache-2.0) ist der Nachbar im Agent-Design-Layer mit vorbildlicher Skill-/Brand-Paketierung.

---

## 1) OpenPage — „JSON as single source of truth"

**Was:** Open-Source-Website-Builder (MIT): visueller Drag&Drop-Editor + AI-Generierung; Website = ein typisiertes JSON-Dokument. Selbstpositionierung: „Self-hosted alternative to Framer, Lovable, v0" — explizit **nicht** Codegen. React 19 + TS + Vite + Tailwind v4 + Zustand/Immer + dnd-kit. 19 Block-Typen, 42 Varianten, 10 Theme-Presets, Gemini-Endpoint, Standalone-HTML-Export.

**Architektur (verifiziert aus `CLAUDE.md`):**
- `SiteConfig = { name, theme{…}, blocks[{ id, type, variant, props }] }` — Blöcke referenzieren nur `type` + `variant` + `props`.
- **`configStore`** (Zustand + Immer): Site-JSON + kompletter Undo/Redo-Stack.
- **Block-Registry**: `registry.tsx` mappt `type → React-Komponente`; `renderBlock(config)` löst auf.
- **`BlockWrapper`**: geteiltes Selection-/Hover-/Type-Tag-UI im Editor-Modus (Chrome getrennt von Komponenten).
- Right-Sidebar mit dynamischen Property-Inputs pro Blocktyp; `JsonDrawer`, `VersionHistory`, `AgentPanel`.

**Learnings:**
1. `{id, type, variant, props}` ist als v1-Blockformat ausreichend und agentenfreundlich (klein, diffbar).
2. Editor UND Agent schreiben exakt dasselbe JSON → ein Interface, zwei Nutzer.
3. Registry + Wrapper kapseln Editor-Chrome, ohne Komponenten zu verschmutzen.
4. Zustand + Immer liefert Undo/Redo fast geschenkt (v1-tauglich).
5. **Grenzen:** kein MCP (nur ein HTTP-Generate-Endpoint), kein Motion/3D, statischer HTML-Export (Tailwind per CDN), an einen LLM-Anbieter gebunden, Projekt sehr früh (66★, 58 Commits).
6. **Für Senify:** Katalog-Größenordnung als Messlatte, Editor-Patterns als Referenz — und ein **Fork-Kandidat fürs Editor-Ticket 09** (MIT, JSON-first, gleiche Idee).

---

## 2) Instatic — „open-source alternative to Webflow, Framer and WordPress"

**Was:** MIT, 8.6k★, vom **Motion.page- & Core-Framework-Team** (WordPress-Welt). Self-hosted agentisches Visual-CMS: Editor, Content-Engine, Publisher in einem Bun-Server (SQLite/Postgres). Output: bewusst **sauberes statisches HTML/CSS ohne Framework-Runtime**. Version 0.0.x, „early on purpose".

**Architektur-Highlights (aus `docs/architecture.md`):**
- **Ein Prozess**: `Bun.serve` + handgeschriebener Router; Plugin-Server-Code in QuickJS-WASM-Sandbox-Workern (crash-isoliert, capability-gated); sharp/BlurHash im Worker-Pool.
- **Universelles Content-Modell**: alles ist `data_tables` + `data_rows` (kinds: `postType`, `data`, `page`, `component`, `layout`). Keine separate `pages`-Tabelle; ein neuer „Post-Type" = neue Tabellen-Zeile mit Zellen-Schema.
- **Tree-Primitive**: `NodeTree<TNode> = { nodes: Record<id, TNode>, rootNodeId }` — flach, eine Form für Pages, Visual Components und Slot-Fills.
- **11 kanonische Tree-Mutationen** (`insertNode`, `deleteNode`, `updateNodeProps`, `moveNode`, `duplicateNode`, `wrapNode`, `renameNode`, `toggleNodeLocked`, `toggleNodeHidden`, `setBreakpointOverride`, `clearBreakpointOverride`) — genau eine Routing-Stelle (`mutateActiveTree`), per Architektur-Test abgesichert.
- **Undo/Redo**: patch-basiert, O(Change) pro Schritt.
- **Publisher, 3 Layer**: (A) Pages werden beim Publish als Dateien auf Disk „gebacken" und per **atomarem Two-Slot-Pointer-Swap** umgeschaltet (Windows-kompatibel, keine Symlink-Rechte nötig); (B) versionierter In-Memory-LRU mit `bumpPublishVersion()` + Lazy-Invalidierung + Single-Flight; (C) **auto-erkannte dynamische Nodes** als Server-Islands (`<instatic-hole>` + ~1,1 KB IntersectionObserver-Runtime). Autoren schalten nichts manuell — `findDynamicNodeIds` klassifiziert.
- **Versionierung**: `site_snapshots` einmal pro Publish; `data_row_versions.site_snapshot_id` verweist darauf → kanonischer Audit-Record. **Drafts leaken nie.**
- **Branches**: `branch_id` + `logical_id` pro Row (`physicalId(branchId, logicalId)`).
- **Validierung**: **TypeBox an jeder ungetypten Grenze** — TypeBox-Schemas SIND JSON Schema; `zod` repo-weit gebannt (per Test). Value-Level-CSS-Sanitizer blockt `expression()`, `javascript:`, `{}`-Breakout, `</`.
- **Design-System eingebaut (Core Framework)**: ein Brand-Color-Token → automatische Shade-Scale; fluide, mathematische Type-Scales; Spacing-Scales; **Utility-Class-Generator → eine kleine `framework.css`**; Admin-CSS darf kein Hex enthalten (Gate-Test).
- **Trust**: Rollen aus 38 Capabilities, TOTP, **append-only Audit-Log**; CRDT-Co-Editing (Yjs) über WebSocket.
- **Agent**: zwei Tool-Scopes (**35 Tools „Site"** / **15 Tools „Content"**), BYOK (Claude/OpenAI/OpenRouter/Ollama), Edits erzeugen **echte Nodes**; Import-Pipeline (HTML/Static-Site → Nodes + Styles + Tokens + Media).
- **Architektur-Regeln als Tests**: 81 Gate-Dateien (u. a. Migrations-Parität, „keine Tailwind-Klassen im Admin", „jede Farbe kommt aus einem Token", Plugin-Sandbox-Invarianten).
- `.agents/skills` + `AGENTS.md`/`CLAUDE.md` direkt im Produkt-Repo.

**Learnings für Senify:** wichtigste Muster-Quelle — flacher NodeTree, Mutationen als gemeinsames Vokabular für Editor + Agent + MCP, Publisher-Muster, TypeBox-Validierungsstrategie, Token-Engine, Audit-/Test-Disziplin.
**Grenzen/Abgrenzung:** Output philosophisch **ohne JS-Runtime** (Gegenpol zu Senifys Motion-/3D-Ziel); **kein MCP** (eigene Tool-API); kein visuelles Motion-System. Kein Fork sinnvoll, aber Vorbild auf Architektur-Ebene. Beweist zugleich die Positionierung — und ist ein Nachbar, der sich schnell bewegt.

---

## 3) OpenDesign — „design layer for coding agents"

**Was:** Apache-2.0, 96k★ (!), local-first Desktop-App + Daemon + CLI (`od`), BYOK; Open-Source-„Claude Design"-Alternative / „Figma alternative for the agent era". Erzeugt Prototypen, Dashboards, Decks, Bilder, Video (HyperFrames HTML→MP4) — **kein Website-Builder mit Hosting**.

**Kernkonzepte:**
- **`DESIGN.md` als Brand-Contract**: 151 Design-System-Pakete (legacy: nur `DESIGN.md`; neu: + `manifest.json`, `tokens.css`, Komponenten-Fixtures, Provenance) — jedes Rendering liest das aktive Paket.
- **Vier portable „Planes"**: Plugins (277), funktionale Skills (100+, nach `SKILL.md`-Konvention), Design-Templates (eigener Katalog), Design-Systems.
- **MCP-Distribution**: `od mcp install <agent>`-One-Liner für 25+ CLIs (inkl. opencode); stdio-MCP, **read-only by default**, Daemon nur auf 127.0.0.1, SSRF-Guards.
- **Artifact-Loop**: brief → plugin → direction → design system → artifact → handoff → memory (Screenshots/Fonts/Paletten werden zu Defaults für nächste Sessions).
- Prompts als Daten: 93 Prompt-Templates + Motion-Templates (HyperFrames: Agent schreibt HTML+CSS+GSAP → deterministisches MP4 via headless Chrome + FFmpeg).

**Learnings für Senify:** `DESIGN.md`-Muster (Brand als versionierte Datei, die jeder Skill respektiert) → Tickets 07/11; Skill-Protokoll + strikte Katalog-Trennung; MCP-Install-DX als Wachstums-/Onboarding-Motor; „confirmed artifacts accumulate as defaults" (Taste-Lernen); HyperFrames als Referenz für deterministische Motion-Ausgabe.

---

## 4) Übernahme-Matrix (→ Senify-Tickets)

| # | Ticket | Übernahme | Quelle |
|---|--------|-----------|--------|
| 01 | Datenmodell | Flacher `NodeTree{nodes,rootNodeId}`; 11 kanonische Mutationen inkl. Breakpoint-Overrides; universelles Content-Modell (eine Store-Form); TypeBox statt zod (Schemas = JSON Schema → direkt MCP-tauglich); Snapshots als kanonischer Record | Instatic |
| 02 | Renderer | Publish-Pipeline-Muster: Static-Bake + atomarer Pointer-Swap, `publishVersion` + Lazy-Invalidierung, pure render function (kein Host-I/O), Auto-Erkennung dynamischer Teile | Instatic |
| 05 | Versionierung | `site_snapshots` + Versions-Referenzen; Branch-Konzept (logical/physical id) | Instatic |
| 06 | Approval | Append-only Audit-Log; Capability-Modell; „Drafts leaken nie" | Instatic |
| 07 | Tokens | Core-Framework-Prinzipien: ein Color-Token → Shade-Scale, fluide Type-/Spacing-Scales, Utility-Generator → EINE `framework.css`; value-level CSS-Sanitizer; `DESIGN.md`-Paket (+ manifest + tokens.css) | Instatic + OpenDesign |
| 08 | Library | 19 Blöcke/42 Varianten als v1-Messlatte; `{id,type,variant,props}`-Format; Visual-Components-Muster (typed params, named slots, Rekursions-Guard) | OpenPage + Instatic |
| 09 | Editor | Registry + BlockWrapper + configStore (Zustand/Immer-Undo); **OpenPage als Fork-Kandidat prüfen** (MIT); patch-basiertes Undo (Instatic); Breakpoint-Frames nebeneinander | OpenPage + Instatic |
| 10 | MCP-Tools | Zwei-Tool-Scopes-Konzept (Site vs. Content) → MCP-Tool-Presets/Namespaces; BYOK-Driver-Muster | Instatic |
| 11 | Agent-Experience | `mcp install <agent>`-One-Liner; `DESIGN.md` als Brand-Contract; `SKILL.md`-Protokoll; Skills im Produkt-Repo (`.agents/skills`) | OpenDesign + Instatic |
| 14 | Hosting/Deploy | Atomarer Publish (Pointer-Swap), inkrementeller Row-Publish (tmp+rename), Update = Redeploy, Backup = DB + Uploads | Instatic |

---

## 5) Strategische Einordnung

**Validierung.** OpenPages Pitch ist Senifys Pitch (JSON-first, „not another code generator", agent-editable). Instatics 8,6k★ zeigen die Nachfrage nach offenen Builder-Alternativen; OpenDesigns 96k★ zeigen die Explosion agenten-nativer Design-Tools.

**Differenzierung bleibt scharf:**
1. **MCP-first:** Keines der Projekte bietet einen MCP-Server für den *Builder* (Instatic: eigene Tool-API; OpenDesign: MCP nur für Design-Artefakte).
2. **Motion/3D/Awwwards:** Instatic liefert bewusst 0 JS-Runtime; OpenPage statisches Tailwind-HTML. Senifys Motion-Preset-System hat hier kein Gegenstück.
3. **Sektion-Registry + Motion-Presets + Approval/AEO** als Paket.

**Risiken:** Alle drei bewegen sich schnell; OpenDesign könnte Richtung vollständige Websites + Hosting expandieren, Instatic könnte MCP nachrüsten. Unser Vorsprung: Motion-Qualität, MCP-DX und die interne Nutzung als Härtetest.

**Chance:** Muster-Übernahme spart Wochen (Mutationen, Publisher, Token-Engine, Validierungsstrategie) — ohne Abhängigkeit, da primär Konzepte übernommen werden (bei MIT/Apache teils auch Code denkbar).

---

## Quellen

- OpenPage: `github.com/buildingopen/openpage` (+ `CLAUDE.md`, `docs/`)
- Instatic: `github.com/CoreBunch/Instatic` (+ `docs/architecture.md`, `AGENTS.md`, `docs/features/publisher.md`)
- OpenDesign: `github.com/nexu-io/open-design`, `open-design.ai/alternatives/framer/`
- Verwandt: Puck (`puckeditor.com`), Core Framework (`coreframework.com`), Motion.page, HyperFrames (`github.com/heygen-com/hyperframes`)
