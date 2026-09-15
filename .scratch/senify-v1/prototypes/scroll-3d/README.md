# PROTOTYPE — Scroll-gekoppelte 3D-Choreografie (Senify, Ticket 20)

> **WEGWERF-CODE.** Beantwortet genau eine Frage: *Wie orchestrieren wir scroll-gekoppelte
> 3D-Szenen auf Astro sauber — ein persistenter Canvas, ScrollTrigger↔R3F-Bridge,
> Shared-Store — und was bricht?*
> Ergebnis-Erkenntnisse wandern ins Ticket `20-prototype-scroll-3d-choreografie.md`
> und in die Artefakte 02 (Renderer) + 03 (Motion & 3D). Nicht für Produktion.

## Starten

```bash
npm install
npm run dev        # → http://localhost:4321
```

## Was der Prototyp zeigt

- **Ein Canvas, ganze Seite:** fixiertes R3F-Canvas hinter normalem HTML-Flow (Sektionen bleiben DOM).
- **Page-Script-Layer:** Lenis (Smooth Scroll) + GSAP/ScrollTrigger in **einem** rAF-Loop
  (`gsap.ticker` treibt `lenis.raf`, `ScrollTrigger.update` am Lenis-Scroll).
- **Shared Store:** window-gebundener Singleton (`scroll-store.ts`) überbrückt Page-Script
  und React-Island zuverlässig — auch wenn Astro beide getrennt bündelt.
- **Pinning:** Sektion 2 ist gepinnt; ihr Fortschritt fließt live in Kamera + Objekt-Morph.
- **Fallback:** `prefers-reduced-motion` → statische Pose, kein Lenis, keine Reveals.

## Beobachten / Prüfen (HUD oben rechts zeigt den Zustand)

1. Scrollen → Reveals feuern korrekt? (Bug-Klasse „ScrollTrigger feuert nie" — Lenis-Sync)
2. Pin-Sektion → ruckelt nichts? Kamera/Object morphen scrub-gekoppelt?
3. HUD: `progress`, `pin`, `section`, `velocity`, `fps` plausibel?
4. DevTools → Rendering → „Emulate prefers-reduced-motion" → Reload: alles statisch, nichts versteckt?
5. DevTools Mobile-Emulation + Performance-Tab: FPS? (Ziel: 60 auf Desktop, ≥30 mobil)
6. Klick auf Links außerhalb: nichts blockiert? (dekorative Canvas-Layer: `pointer-events: none`)

## Bekannte, bewusst eingebaute Muster (aus Research)

- Ein rAF-Loop: `lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker.add(lenis.raf)` + `lagSmoothing(0)`
- Kein `scroll-behavior: smooth` in CSS
- Decoratives Canvas + HUD: `pointer-events: none`
- Damping frame-rate-unabhängig: `1 - exp(-dt * k)`
