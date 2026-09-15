# Research: Motion/3D-Patterns

Type: research
Status: resolved

## Question

Wie erzeugen Agenten reproduzierbar hochwertige Motion-/3D-Sektionen (Framer-Niveau als Minimum, Awwwards als Ziel): Preset-/Pattern-Architekturen mit GSAP/Motion/Lenis/R3F, Choreografie-Muster, Performance-Grenzen, reduced-motion.

Ergebnis: Musterkatalog + Machbarkeitsgrenzen.

## Answer

Kernbefund: Reproduzierbare Motion-Qualität entsteht nicht durch frei generierten Animations-Code, sondern durch ein kuratiertes Preset-System mit typisierten Motion-Specs (Preset + Intensity-Dial + Token-basiertes Timing/Easing + Pflicht-Fallback). GSAP + ScrollTrigger ist 2026 die beste Choreografie-Basis (alle Plugins gratis, offizielle Agent-Skills mit Guardrails); Motion (ex framer-motion) deckt React-State-Motion ab; native CSS Scroll-Driven Animations und View Transitions bilden die Baseline (Firefox-Lücken beachten); R3F-3D nur als isolierte, lazy geladene Sektion mit Mobile-Fallback.

Top-3-Empfehlungen:
1. GSAP + ScrollTrigger als Kern-Engine für Pin/Scrub/Sequenzen; Presets als 12–18 getestete Rezepte mit Reduced-Motion-Variante und Anti-Pattern-Validierung.
2. Motion-Spec-Schema pro Sektion (Dials statt Freitext), Skillpaket nach Vorbild `gsap-skills` und der lokalen Skills `design-taste-frontend`/`awwwards-motion`.
3. Harte Performance-Guardrails: nur transform/opacity, LCP ≤ 2,5 s / INP ≤ 200 ms / CLS < 0,1, max. 1 Pin-Section + 2 Parallax-Layer/Page, ein WebGL-Canvas, mobile statisch.

Details: `.scratch/senify-v1/research/18-motion-3d.md` (Musterkatalog, Quellen, offene Fragen).
