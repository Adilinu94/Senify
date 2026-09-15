# Astro als Site-Renderer (Next.js als dokumentierter Fallback)

Status: accepted · 14.09.2026

Sites werden als strukturierte JSON-Bäume aus Sektionen gerendert — motion-/3D-lastig, mit hohem Qualitätsanspruch und agentischen Build-/Preview-Schleifen. **Entscheidung:** Astro 7 ist der Site-Renderer (SSG-first, Islands); Sektionen sind React-Komponenten aus einem framework-agnostischen Section-SDK; vollstatischer Bake pro Release. Next.js 16 bleibt bewusst als Fallback dokumentiert — Umschwenk-Kriterien: app-artige Seiten (Auth/State/viele Widgets), Wunsch nach einem einzigen React-Tree, oder zwingendes Draft-Rendering ohne Build.

**Betrachtete Optionen:**
- *Next.js 16* — ein React-Tree, RSC/ISR/Draft Mode nativ; aber ~55 KB Baseline-JS, komplexeres Self-Hosting/Caching, deutlich niedrigere Entwicklerzufriedenheit.
- *Eigener React-Renderer* — maximale Kontrolle, aber man besitzt Routing, Hydration, Caching, Preview und Editor-Glue selbst (Webstudio/Builder.io zeigen den Preis); für v1 verworfen.

**Konsequenzen:**
- Motion läuft als Page-Script-Layer (GSAP/ScrollTrigger/Lenis) ohne React-Hydration; nur echte Interaktion/3D hydratisiert.
- Sektionen dürfen keinen Astro-spezifischen Code enthalten — ein späterer Renderer-Wechsel bleibt ohne Sektions-Rewrite möglich.
- Referenz: `.scratch/senify-v1/artifacts/02-renderer.md` (Renderer-Architektur, Risiken, Fallback-Kriterien).
