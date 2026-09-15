# Artefakt 03: Motion- & 3D-Technologie (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Motion- & 3D-Technologie".
> Grundlagen: `research/18-motion-3d.md` (43 Quellen), `artifacts/02-renderer.md`, `prototypes/scroll-3d/` (validiert).

## Entscheidungen (Wizard)

1. **Motion-Stack: 3-Layer** — GSAP + ScrollTrigger (Choreografie) · CSS + native Scroll-Timeline (Baseline) · Motion (React-State/UI). Abgrenzung verbindlich: **Motion für Zustand, GSAP für Scroll-Choreografie**.
2. **Smooth Scroll: Lenis Standard AN** (native Scroll-Semantik, `respectReducedMotion` per Default); **Mobile automatisch aus**; pro Site abschaltbar.
3. **Preset-Katalog v1: voller Katalog (24 Presets, Kategorien A–G)**.
4. **Motion-Spec:** `preset` + **Intensity-Dial (1–10)** + `tokens` (ease/duration/stagger) + `trigger` + `reducedMotion` + `budget` — deterministisch übersetzt in GSAP-/CSS-/Motion-Code.
5. **Guardrails teilweise hart** (siehe unten): performance-kritische Regeln werden validiert, Rest ist Empfehlung.
6. **Performance-Budgets: Richtwerte ohne Gates** — Checks informieren (Ticket 13), blockieren nicht.
7. **3D: Premium-Preset, genau 1 Canvas pro Seite** (prototyp-validiert), lazy, `frameloop="demand"` für ruhende Szenen, DPR-adaptiv; Mobile & Reduced-Motion = statisches Poster; **3D nie LCP-Träger** (SEO).

## Preset-Katalog v1 (24)

Jedes Preset hat: Props-Schema, Implementierung (kanonisch), Reduced-Motion-Variante, Intensitäts-Dial-Mapping, Budget-Notiz.

| # | Kategorie | Preset | Wirkung / Kern |
|---|---|---|---|
| 1 | A Entry | `fade-up` | opacity + y (Dial: 16→40 px) |
| 2 | A | `fade-up-deblur` | + blur 8→0 |
| 3 | A | `masked-headline` | Zeilen aus Clip-Maske (SplitText, nach `fonts.ready`); Lines/Words-Granularität |
| 4 | A | `stagger-cascade` | Kinder sequenziell (60–120 ms, Apple-Maßstab) |
| 5 | B Scroll | `scroll-reveal` | `whileInView`/CSS `view()`, `once: true` |
| 6 | B | `scrub-pin` | Timeline-Progress = Scroll (`scrub: 1`, `pin: true`) — **hart: max 1 Pin-Preset/Seite** |
| 7 | B | `sticky-stack` | Cards pinnen, Vorgänger schrumpft/faded |
| 8 | B | `horizontal-pan` | Track-x, `ease: "none"`, `containerAnimation` |
| 9 | B | `parallax-subtle` | max **2 Layer/Viewport**, Faktor 0,1–0,3 |
| 10 | B | `scroll-progress` | Fortschrittsbalken (CSS `animation-timeline: scroll()` zuerst) |
| 11 | C Text | `counter` | Zahl 0→Ziel, ease-out |
| 12 | C | `marquee` | Endlos-Ticker (linear; pausiert bei RM) |
| 13 | C | `char-split` | Signature; **weich: max 1×/Seite** |
| 14 | D Hover | `hover-lift` | translateY + Shadow |
| 15 | D | `magnetic-button` | Cursor-Folge (`quickTo`), Rückfederung |
| 16 | D | `tilt-card` | rotateX/Y an Cursor (max 6–8°) |
| 17 | D | `cursor-glow` | radialer Glow/Inertia-Push |
| 18 | E State | `page-fade` | View Transitions (MPA, CSS opt-in); degradiert ohne Support |
| 19 | E | `preloader-light` | **weich: ≤ 2,5 s** |
| 20 | E | `accordion` | Höhe/Indicator + Crossfade (Motion) |
| 21 | E | `modal` | Backdrop-Fade + Scale-in (Motion) |
| 22 | F Ambient | `ambient-float` | langsame Loops (8–20 s, `mirror`) |
| 23 | F | `grain` | Noise auf `pointer-events: none`-Layer |
| 24 | G 3D | `webgl-scene` | ein Canvas/Seite; interne Varianten: Scroll-Szene · Viewport-Szene · Shader-Reveal · Modell-Showcase |

**Bewusst nicht in v1:** `layout-morph` (E1, braucht SPA-artige State-Muster → v2), scale-in (als `fade-up`-Param), native view-reveals (implizit in Baseline).

## Motion-Spec-Schema

```json
{
  "preset": "sticky-stack",
  "intensity": 6,
  "trigger": { "type": "scroll-pin", "scrub": 1 },
  "tokens": { "ease": "spring-snappy", "durationScale": 1.0, "stagger": 0.08 },
  "reducedMotion": "static",
  "budget": { "pinCount": 1, "maxDrawCalls": 200 }
}
```

- **Intensity 1–10** mappt pro Preset auf konkrete Parameter (Beispiel `fade-up`: 1–3 → 16 px/0,45 s · 4–7 → 24 px/0,6 s · 8–10 → 40 px/0,8 s + optionaler Deblur). Dials statt Zahlenwust — die agentenfreundlichste Form (Research §6).
- `tokens` referenzieren das Motion-Token-Set des Themes (→ Ticket 07): `ease`, `duration`, `stagger`.
- Der Renderer übersetzt deterministisch → GSAP-Config / Motion-Variants / CSS. **Kein freier Motion-Code durch Agenten.**

## Guardrails

**HART (validiert, Verstoß blockiert Publish):**
- Max **1 Pin-Preset** pro Seite (`scrub-pin`/`sticky-stack`/`horizontal-pan`)
- Max **2 Parallax-Layer** pro Viewport
- **Keine** `window.addEventListener('scroll')`-Muster, kein State-Update pro Scroll-Frame
- **Reduced-Motion-Variante pro Preset ist Pflicht** (WCAG C39 / 2.3.3 — Compliance, keine Produktoption)

**WEICH (Empfehlung, Review-Hinweis):**
- Reveals < 800 ms · max 1 Char-Split/Seite · Preloader ≤ 2,5 s
- Anti-Pattern-Liste (Parallax Soup, Hover Disco, Scroll Carnival, Text Disassembly …) als Review-Katalog
- Mobile: Smooth Scroll + 3D aus, statische Fallbacks

## Performance-Budgets (Richtwerte, KEINE Gates)

| Metrik | Richtwert | Fallstrick |
|---|---|---|
| LCP | ≤ 2,5 s | Hero nicht hinter `opacity: 0`-Entry verstecken (Chromium disqualifiziert LCP-Kandidaten) |
| INP | ≤ 200 ms | Schwere Scroll-Loops/WebGL erzeugen Input-Delay — transform/opacity-only, Off-Screen killen |
| CLS | < 0,1 | `pinSpacing`, Aspect-Ratios für Proxies/Bilder, keine height/top-Animationen |
| Motion-JS | ≤ ~150 KB (ohne 3D) | Page-Script-Bundle 129 KB (prototyp-gemessen) |
| 3D | lazy, DPR [1–1.75], Draw-Calls < ~1000 (Ziel: wenige Hundert) | 879-KB-Chunk bestätigt → konditional laden |
| Lighthouse | **80–90 bei echter Motion = Ziel** | 100 wäre unredlich; Motion-Qualität wird per Review bewertet (Ticket 06), nicht per Score |

## Site-Profile & Intensität (Nachtrag 14.09.2026)

Sites müssen **nicht** aufwändig sein: Eine schlichte, moderne Seite ist ein **vollwertiger Default**, kein Kompromiss. Daraus folgt:

- **Sektionen müssen ohne Motion vollwertig aussehen** (Baseline-Qualität); Motion ist Eskalation. → Anforderung an Ticket 08.
- Der **Intensity-Dial** (1–10) ist die Feinsteuerung: „schlicht" = niedrige Intensität, keine Pins, kein 3D, Baseline-Reveals.
- **Lighthouse-Erwartung skaliert:** Schlichte Seiten zielen 95+; die 80–90-Kalibrierung gilt nur für Motion-/3D-schwere Seiten.
- **Site-Profile** (z. B. `clean` · `standard` · `showcase`) mit Defaults pro Profil (Lenis, erlaubte Presets, 3D) sind eine offene Entscheidung → **Ticket 21**.

## Technische Basis (vollständig)

- **GSAP** komplett kostenlos inkl. aller Plugins (Webflow-Übernahme) + offizielle Agent-Skills (`npx skills add greensock/gsap-skills`) als Guardrail-Quelle.
- **Native CSS Scroll-Driven Animations** als progressive Enhancement (Firefox-Lücke → nie exklusiv).
- **View Transitions** cross-document (Chromium/Safari 18.2+): `@view-transition { navigation: auto; }`, 4-s-Timeout = stilles Degradieren, `object-fit: cover`-Fix.
- **Lenis-Limits dokumentiert:** kein CSS-Scroll-Snap, Safari 60-fps-Cap, iframe-Brüche → Mobile aus.
- **WebGL (nicht WebGPU)** für v1; WebGPU beobachten (Research-Unsicherheit, kein v1-Bedarf).

## Bewusste Nicht-Entscheidungen

- **Lottie/Rive:** nur als Medien-Assets (Ticket 15), nicht als Motion-Engine (keine Preset-Semantik).
- **ScrollSmoother** als GSAP-eigene Lenis-Alternative: notiert, nicht gewählt (Lenis prototyp-validiert).
- **Layout-Morph (`layoutId`)** und SPA-artige Übergänge: v2.
- **Evals/Golden-Sections:** Motion-Qualität ist Geschmacksurteil → Motion-Diff-Review im Approval-Flow (Ticket 06/13).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Motion-Tokens (duration/cubicBezier/`linear()`-Springs) | 07 Design-Token & Theme |
| Preset-Registry-Format im Section-SDK | 08 Section-Library |
| `senify-motion`-Skillpaket (nach gsap-skills-Vorbild) | 11 Agent-Experience |
| Check-Pipeline: harte Guardrails + weiche Metriken | 13 AEO & Output-Qualität |
| Motion-Review im Approval (Coverage/Easing/Feel) | 06 Approval-Queue |

## Nachtrag 15.09.2026 (Technologie-Check → `research/30`)

- **GSAP-Bonus-Plugins 100 % frei** (3.13, Apr 2025; SplitText-Major-Rewrite Juni 2026, ~50 % kleiner + Accessibility): `masked-headline`/`char-split` nutzen **echtes SplitText** statt Eigenbau; ScrollSmoother verfügbar, bleibt ungenutzt (Lenis prototyp-validiert).
- **Firefox scroll-driven animations:** weiterhin NICHT default → „CSS Scroll-Timelines nie exklusiv" bleibt Pflicht.
- **WebGPU reif** (alle Major-Browser default; three.js-WebGPU production-ready seit r171 mit WebGL2-Fallback): v1 bleibt WebGL, aber `webgl-scene` über eine schmale **Renderer-Abstraktion** bauen (WebGPURenderer als Option) → späterer Wechsel = Config-Schritt.
