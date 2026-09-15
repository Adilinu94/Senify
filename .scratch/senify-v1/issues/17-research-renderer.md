# Research: Renderer

Type: research
Status: resolved

## Question

Astro vs. Next.js vs. eigener Renderer für motion-/3D-lastige, agent-generierte Marketing-Sites (Stand 2026): Build-/Preview-Zeiten, Islands vs. Full-React, GSAP-/R3F-Integration, SSG/ISR, Deploy-Modelle.

Ergebnis: Vergleich + Empfehlung.

## Answer

Kernbefund: Astro 7 und Next.js 16 sind 2026 keine direkten Konkurrenten — Astro ist SSG-first mit Islands (0-KB-JS-Baseline, 15–61 % schnellere Builds, Agent-Features, Cloudflare-Backing, höchste Framework-Zufriedenheit), Next.js ist Full-React mit RSC/ISR/PPR (größtes Ökosystem, aber mehr Baseline-JS, komplexeres Self-Hosting, Satisfaction-Knick). Motion (GSAP/ScrollTrigger/Lenis) läuft in Astro als Page-Script ohne React-Hydration; R3F als `client:only`-Island — Cross-Island-Choreografie und statische `client:*`-Direktiven sind die zwei bekannten Stolpersteine (Dispatcher-Pattern/Nanostores). Ein eigener React-Renderer ist machbar (Webstudio, vinext), aber für v1 reine Scope-Verschwendung.

Top-3-Empfehlungen: (1) **Astro 7 als Renderer** der Sites, React-Sektionen statisch + selektive Islands; Motion-Runtime framework-agnostisch kapseln. (2) **Section-SDK + State-Dispatcher** als einzige Stelle für JSON→Komponenten und Hydration-Entscheidungen bauen. (3) **Next.js 16 als dokumentierter Fallback** halten (app-artige Szenarien, ein React-Tree, Vercel-Preview zwingend) — Entscheidung in Ticket 02; Details, Tabellen, Quellen und offene Fragen: `research/17-renderer.md`.
