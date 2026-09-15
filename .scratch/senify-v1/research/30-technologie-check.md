# Research 30: Technologie-Check (15.09.2026)

> Anlass: Vor `/implement` wurden die risikoreichsten Baustellen-Entscheidungen gegen den aktuellen Stand (September 2026) verifiziert — Dinge, die seit den Recherchen/Entscheidungen veraltet sein könnten.
> Methode: Web-Recherche + direkte Quell-Checks (GitHub-Issues, Specs). Ergebnis-Klassen: ✅ bestätigt · ⚠️ präzisiert/geändert · 🔭 beobachten.

## Kurzfassung

**Nichts hiervon bricht die Route.** Die 15 Tickets bleiben gültig; es gibt 4 konkrete Anpassungen (SplitText echt nutzen, Puck-Bug-Workarounds, Cloudflare als nächste Deploy-Priorität, AEO ohne SEO-Claims) und 3 Beobachtungspunkte (WebMCP/llms.txt-v2, WebGPU, MCP-RC).

## 1. GSAP — ✅ bestätigt (100 % frei inkl. SplitText-Major-Rewrite)

- **3.13 (29.04.2025):** GSAP ist dank Webflow **100 % kostenlos, inklusive aller Bonus-Plugins** (SplitText, MorphSVG, ScrollSmoother …); kommerzielle Nutzung frei.
- **Juni 2026:** Webflow kündigt weiteres **SplitText-Major-Upgrade** (≈ 50 % kleinere Datei, eingebaute Accessibility).
- **Konsequenz:** Unsere Notiz aus Artefakt 03 ist korrekt — jetzt mit Version belegt. Konkret: `masked-headline`/`char-split` nutzen **echtes SplitText** statt Eigenbau (der Stolperstein „Club GSAP" aus `research/18` ist Geschichte). **ScrollSmoother** ist verfügbar, bleibt aber ungenutzt — Lenis bleibt (prototyp-validiert, Mobile-aus-Regel). → Nachtrag in `artifacts/03`.

## 2. Puck — ⚠️ präzisiert (0.23 aktuell; beide gepinnten Bugs OPEN)

- **Versionen:** 0.21 (Jan 2026, AI-Beta/Rich-Text/Plugin-Rail, **mit Breaking Changes**), 0.22 (Jun 2026, Styling-Refresh, ohne Breaking), **0.23 (Aug 2026: DnD-Verbesserungen, draggable Outline, Dictionary/Localization API)** — unsere Gap-Analyse (`research/28`, Puck v0.23.0) ist auf dem aktuellen Stand. Upgrade-Guides pro Version vorhanden (gut fürs Pinnen).
- **Bug #1829 (OPEN, Sep 4 2026, kein Fix/Assignee):** In 0.23.0 mountet das **Canvas-Overlay** (Duplicate/Delete, `overrides.actionBar`) nie — Store-Status korrekt, aber `startTransition`-gewrapptes `setIsVisible` committed nicht (React 18). → **Konsequenz: Wir stützen uns nicht auf Puck-Default-Overlays** — unser Frame-Manager + Eigenbau-Toolbar/Rings (Ticket 13) umgehen das Problem ohnehin; im Ticket als Workaround dokumentiert.
- **Bug #1794 (OPEN, Assignee gesetzt, Label „ready", Fix-PR #1793 in Arbeit):** Inline-Fields funktionieren **im Root** nicht (`contentEditable`; Root rendert nur über Slot-/User-Transforms). → **Konsequenz: Root-Inline-Editing als bekannte Lücke einplanen** (Inline-Text für Kinder funktioniert OOB), PR #1793 / nächstes Release verfolgen. → Ticket-13-Ergänzung.
- Puck AI (Loops/BYOK/Design-Mode) wächst — bleibt außen vor (Entscheidung 09/24 unverändert).

## 3. Firefox CSS Scroll-Driven Animations — ✅ Baseline-Regel bestätigt

- Firefox ist **weiterhin der einzige Major-Browser ohne Default-Support** (Mozilla-Idee offen, „development in progress, not enabled by default"; Chrome/Edge 115+, Safari mit Support).
- **Konsequenz:** Unsere Regel „CSS Scroll-Timelines nur als Progressive Enhancement, nie exklusiv" (03/02) bleibt zwingend. Keine Änderung.

## 4. llms.txt & AEO — ⚠️ präzisiert (agenten-relevant, SEO-neutral)

- **Google (15.06.2026):** llms.txt hat **keinen Einfluss auf Search-Rankings** (weder positiv noch negativ) — klar kommuniziert im AI-Optimization-Guide.
- **Agenten-Adoption ist real:** llms.txt gilt als „first widely-adopted B2A standard"; IDE-Agenten (Cursor, Windsurf, Claude Code, GitHub Copilot, Cline) fetchen es routinemäßig.
- **llms.txt v2-Proposal (Aug 2026):** definiert **Discovery-Link-Relations** (Maschinen finden die Datei deklariert); daneben entstehen WebMCP, SDF, CAP als weitere Agent-Web-Standards.
- **Konsequenz:** AEO-Set (13) bleibt richtig — aber **ohne SEO-Versprechen** formulieren („agent-ready by default", nicht „bessere Rankings"). Die v2-Discovery-Link-Relations als Mini-Ergänzung aufnehmen (billig, zukunftssicher). WebMCP als v2-Beobachtung. → Nachtrag in `artifacts/13`.

## 5. Astro & Cloudflare — ⚠️ geändert (Übernahme)

- **16.01.2026: Cloudflare übernimmt The Astro Technology Company** (Team wechselt zu Cloudflare; **Framework bleibt MIT-lizenziert**; Cloudflare-Integration wird deutlich vertieft).
- **Astro 7.3.2** ist aktuell (Sep 2026; Rust-Tooling, schnellere Builds) — unsere Astro-7-Entscheidung ist korrekt und aktuell.
- **Konsequenz:** Renderer-Entscheidung unberührt (MIT + statische Artefakte = kein Lock-in). Für Deploy: **Cloudflare Pages wird die nächste Adapter-Priorität** neben Vercel/Netlify (die Akquisition macht Cloudflare+Astro zum natürlichen ersten Pfad; unser Adapter-Interface bleibt). Vendor-Beobachtung: MIT-Lizenz + Multi-Adapter schützen. → Nachtrag in `artifacts/14`.

## 6. MCP-Spezifikation — ⚠️ aktualisiert (RC 2026-07-28)

- **Spec-Release-Candidate 2026-07-28:** stateless Protocol-Core, **Extensions-Framework, Tasks, MCP Apps**, Authorization-Hardening, formale Deprecation-Policy. **Streamable HTTP** ist der etablierte Remote-Transport; **OAuth 2.1** der Standard für Remote-Auth (Streamable HTTP ersetzte SSE).
- **Konsequenz:** v1-Kern (lokaler stdio + scoped API-Tokens, transport-agnostischer Tool-Kern) bleibt unverändert und passt. Remote-Ausbau (später) = Streamable HTTP + OAuth 2.1 — genau wie in Artefakt 04 notiert. Extensions/Tasks sind für v1 nicht relevant. → Nachtrag in `artifacts/04`.

## 7. WebGPU — ⚠️ reif (Baseline erreicht)

- **Alle Major-Browser shippen WebGPU by default** (Chrome 113+, Edge, Firefox 141+, Safari 26 auf macOS Tahoe/iOS 26) — „WebGPU Hits Critical Mass" (Dez 2025/Mai 2026).
- **three.js:** WebGPU-Renderer **production-ready seit r171** (Sep 2025) — Import ohne Konfiguration, **automatischer WebGL2-Fallback**, TSL-Shader; Migration ist im Kern ein Renderer-Swap.
- **Konsequenz:** v1-3D (`webgl-scene`) bleibt bei **WebGL** (Prototyp validiert, Budgets gemessen, Risiko minimal). Aber: Sektion über eine **schmale Renderer-Abstraktion** bauen (WebGPURenderer als Option), damit der Wechsel in v1.5/v2 ein Config-Schritt ist. → Nachtrag in `artifacts/03`.

## 8. Tailwind CSS v4 — ✅ bestätigt

- v4 seit Jan 2025 stabil (CSS-first Engine, kein `tailwind.config.js`); unsere Wahl (07) korrekt; Greenfield umgeht die Upgrade-Schmerzen. Keine Änderung.

## 9. Gesamt-Konsequenzen (was jetzt geändert wurde)

| Ort | Nachtrag |
|---|---|
| `artifacts/03` | SplitText echt nutzbar (3.13+/Rewrite); Firefox-Regel bestätigt; WebGPU-Reife + Renderer-Abstraktion |
| `artifacts/04` | MCP-Spec-RC 2026-07-28 (Remote-Pfad Streamable HTTP + OAuth 2.1) |
| `artifacts/13` | llms.txt: SEO-neutral (Google) + Agenten-Adoption; v2-Discovery-Relations; WebMCP beobachten |
| `artifacts/14` | Cloudflare/Astro-Übernahme → Cloudflare-Pages als nächste Adapter-Priorität |
| Ticket 13 | Bug-Workarounds #1829 (Eigenbau-Overlays) + #1794 (Root-Inline-Lücke, PR #1793 verfolgen) |
| `spec.md` | Further-Notes-Eintrag „Technologie-Check 15.09.2026" mit Verweis hierauf |

## Quellen (Auswahl)

- gsap.com/blog/3-13 · webflow.com/blog/gsap-becomes-free · css-tricks.com (GSAP free)
- puckeditor.com/blog/puck-023 · puckeditor.com/blog/upgrading-to-puck-022 · github.com/puckeditor/puck/issues/1829 · /1794 (+ PR #1793)
- web-platform-dx.github.io/web-features-explorer (scroll-driven animations, Firefox) · caniuse.com/wf-scroll-driven-animations
- digitalapplied.com (Google llms.txt, 15.06.2026) · limy.ai (llms.txt 2026) · llmtxt.info (v2 discovery relations) · platinum.ai (agent-standards)
- cloudflare.com/press (Astro-Akquisition 16.01.2026) · blog.cloudflare.com/astro-joins-cloudflare · github.com/withastro/astro/releases (7.3.2)
- modelcontextprotocol.io/specification/2026-07-28 · blog.modelcontextprotocol.io (RC)
- caniuse.com/webgpu · webgpu.com (critical mass) · utsubo.com (three.js WebGPU r171+)
