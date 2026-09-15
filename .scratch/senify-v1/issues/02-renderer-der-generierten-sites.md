# Renderer der generierten Sites

Type: grilling
Status: resolved

Input: `research/17-renderer.md`
Input: `research/20-referenzprojekte.md`

## Question

Womit werden kundentaugliche, motion-/3D-lastige Sites gerendert: Astro (Islands), Next.js oder ein eigener React-Renderer? Statisch, ISR oder dynamisch? Wie fließen Sektionen und Tokens aus dem Datenmodell in Build und Preview?

Entscheidung inkl. Begründung und Auswirkungen auf Deploy/Preview (Ticket „Hosting & Deploy der Sites").

## Answer

Renderer-Architektur entschieden (7 Wizard-Antworten; 3D bewusst ambitioniert: geteilter Scroll-/3D-State). Artefakt: [artifacts/02-renderer.md](../artifacts/02-renderer.md).

- **Astro 7** als Site-Renderer (0-KB-Baseline, schnellste Builds, Agent-Features); Next.js 16 = dokumentierter Fallback (Kriterien im Artefakt).
- **Vollstatisch pro Release:** Bake + atomarer Swap; Rollback = Re-Deploy einer Revision (→ Ticket 14).
- **Sektionen:** React-Komponenten aus dem agnostischen Section-SDK; Markup-first; Motion deklarativ via `node.motion` über den Page-Script-Layer (GSAP/ScrollTrigger/Lenis); Hydration nur für Interaktion/3D (Dispatcher-Pattern).
- **3D:** ein persistenter Canvas pro Seite, scroll-gekoppelt mit Shared-State → neues Prototype-Ticket „Scroll-gekoppelte 3D-Choreografie" (Issue 20) de-riskt.
- **Previews:** echte Draft-Builds (Parität Preview = Publish); Approval auf Build-Screenshots.
- **Editor:** separat (Puck-Basis), renderer-neutral, geteiltes Section-SDK.

Neues Ticket: 20 (Prototype). Inputs verdrahtet: 03, 08, 09, 13, 14.
