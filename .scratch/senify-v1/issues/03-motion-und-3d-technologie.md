# Motion- & 3D-Technologie

Type: grilling
Status: resolved

Input: `research/18-motion-3d.md`
Input: `artifacts/02-renderer.md`
Input: `prototypes/scroll-3d/README.md`

## Question

Welche Motion-/3D-Basis macht Framer-Niveau zum Minimum und Awwwards/3D zum erreichbaren Ziel: GSAP + ScrollTrigger, Motion, Lenis, React Three Fiber, Lottie?

Welche Preset-Kategorien (Reveal, Stagger, Parallax, Pinning, Choreografie, 3D-Szenen) definieren wir als agentenfähige Bausteine — mit Performance-Budget und reduced-motion-Regeln?

## Answer

Motion-/3D-Basis + Preset-System entschieden (7 Wizard-Antworten). Artefakt: [artifacts/03-motion-3d.md](../artifacts/03-motion-3d.md).

- **Stack (3-Layer):** GSAP + ScrollTrigger = Choreografie · CSS + native Scroll-Timeline = Baseline · Motion = React-State/UI-Motion. Abgrenzung verbindlich: Motion für Zustand, GSAP für Scroll.
- **Smooth Scroll:** Lenis Standard AN (Mobile automatisch aus; Reduced-Motion respektiert); pro Site abschaltbar.
- **Preset-Katalog v1: voller Katalog — 24 Presets (Kategorien A–G)**, inkl. kinetic type, marquee, magnetic, tilt, cursor-glow, ambient, grain, `webgl-scene` (Varianten intern).
- **Motion-Spec:** Preset + Intensity-Dial (1–10) + Tokens (ease/duration/stagger) + Trigger + reducedMotion + budget — deterministisch übersetzt in GSAP/CSS/Motion.
- **Guardrails teilweise hart:** HART (validiert): max 1 Pin-Preset/Seite, max 2 Parallax-Layer, keine Scroll-Listener/State-pro-Frame, Reduced-Motion-Variante PFLICHT (WCAG). WEICH: Reveals < 800 ms, max 1 Char-Split, Preloader ≤ 2,5 s, Mobile-Poster.
- **Budgets = Richtwerte (keine Gates):** LCP ≤ 2,5 s · INP ≤ 200 ms · CLS < 0,1 · Motion-JS ≤ ~150 KB (ohne 3D) · Lighthouse 80–90-Ziel; Checks informieren in Ticket 13.
- **3D:** Premium-Preset, genau 1 Canvas/Seite (prototyp-validiert), lazy + demand-Frameloop + DPR-adaptiv; Mobile/RM = Poster; nie LCP-Träger.

Bewusst nicht v1: Lottie/Rive (nur Medien-Assets → 15), WebGPU (beobachten), Layout-Morph (v2), ScrollSmoother (Alternative notiert).
Inputs verdrahtet: 06, 07, 08, 11, 13.

## Comments

- **14.09.2026 — Nachtrag (Nutzer):** „Es muss nicht immer eine aufwändige 3D-Webseite sein — eine schlichte, modern wirkende Seite soll genauso möglich sein." Als Prinzip festgehalten: **schlicht-modern = vollwertiger Default, Motion/3D = Optionsstufe**. Artefakt 03 um „Site-Profile & Intensität" ergänzt; Profil-Definition/Defaults → neues Ticket „Site-Profile & Intensitätsstufen" (21).
