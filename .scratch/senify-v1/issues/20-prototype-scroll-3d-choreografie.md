# Prototype: Scroll-gekoppelte 3D-Choreografie

Type: prototype
Status: resolved

Input: research/18-motion-3d.md
Input: artifacts/02-renderer.md

## Question

Wie orchestrieren wir scroll-gekoppelte 3D-Szenen auf Astro sauber: **ein persistenter WebGL-Canvas pro Seite**, ScrollTrigger ↔ R3F-Bridge (Kamera folgt Scroll, Pinning, Szenenwechsel), Shared-Store zwischen Page-Script-Layer und Islands — was funktioniert, was bricht (Lenis-Sync, Hydration-Race, View-Transitions, Mobile-/Reduced-Motion-Fallback)?

Ergebnis: lauffähiger Throwaway-Prototyp + Erkenntnisse als verbindliche Muster für Ticket 03 (Motion & 3D) und Ticket 08 (Section-Library).

## Status (14.09.2026)

Prototyp gebaut: `.scratch/senify-v1/prototypes/scroll-3d/`.

- Build ✓ (11,9 s, 1 Seite) · Smoke-Test ✓ (HTTP 200, 5 Sektionen, Island-Platzhalter)
- Asset-Analyse: Page-Script- und Canvas-Bundle teilen einen **gemeinsamen `scroll-store`-Chunk** (Modul-Identität in Prod geteilt; window-Backing bleibt als Sicherheitsnetz für Dev/Mehrfach-Bundles)
- Dev-Server gestoppt, Port freigegeben
- **Nutzer-Validierung: ✅ bestätigt** („läuft rund — Muster bestätigt", 14.09.2026)

## Answer

**Verifiziert durch den Nutzer.** Prototyp: [prototypes/scroll-3d/](../prototypes/scroll-3d/) (README + Code; Build ✓, Smoke-Test ✓).

### Verbindliche Muster (→ Tickets 03 + 08)

1. **Ein persistenter Canvas hinter normalem DOM-Flow** (fixed, `z-index: 0`, `pointer-events: none`) + Sektionen im Flow — trägt Pinning & Szenen-Morph.
2. **Shared Store** (`window`-gebundener Singleton): überbrückt Page-Script ↔ Island zuverlässig; im Prod-Build teilen beide sogar einen gemeinsamen Chunk (Modul-Identität) — window-Backing bleibt Sicherheitsnetz.
3. **Ein rAF-Loop**: `gsap.ticker` treibt `lenis.raf`; `lenis.on('scroll', ScrollTrigger.update)`; `lagSmoothing(0)` — Reveals + Pin feuern zuverlässig.
4. **Pinning speist den Store**: ein ScrollTrigger-Pin (`+=160%`) liefert `pinProgress` live → Kamera-Arc + Objekt-Morph (scrub, kein Ruckeln).
5. **Frame-rate-unabhängiges Damping**: `1 - exp(-dt * k)` für Kamera-/LookAt-Lerp.
6. **Maus-Parallaxe via window-Listener** (Canvas ist `pointer-events: none`).
7. **Reduced-Motion-Pfad**: statische Pose, kein Lenis/Pin/Reveals.
8. **HUD via rAF + `textContent`** (kein React-Re-Render) — Zustand sichtbar machen.

### Asset-Befunde (verbindlich für 03/08/13)

- Page-Script-Bundle **129 KB** (GSAP + ScrollTrigger + Lenis) — läuft ohne React.
- Canvas-Bundle **879 KB** (three + R3F + drei) → **3D lazy & konditional laden** (nur wenn die Seite 3D-Sektionen enthält).
- `scroll-store` als gemeinsamer, minimaler Chunk.

### Nicht abgedeckt (bleibt offen für 03/08)

- View-Transitions-Cleanup (`astro:before-swap`) und Mehr-Szenen-Systeme (nur ein Zustands-Morph getestet).
- Mobile-Performance formell messen.

Capture: Beim ersten Commit als `prototype/scroll-3d`-Branch sichern (auf Wunsch).
