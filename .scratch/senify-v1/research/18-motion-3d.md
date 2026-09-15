# Research 18 — Motion/3D-Patterns

> **Stand:** 14. September 2026
> **Ticket:** `.scratch/senify-v1/issues/18-research-motion-3d.md`
> **Auftrag:** Wie erzeugen Agenten reproduzierbar hochwertige Motion-/3D-Sektionen (Framer-Niveau als Minimum, Awwwards als Ziel)?
> **Ergebnis:** Musterkatalog, Machbarkeitsgrenzen, Stack-Empfehlung. Alle Quellen sind im Fließtext verlinkt; Primärquellen (offizielle Docs, Repos) wurden bevorzugt. Sekundärquellen sind als solche markiert.

---

## Executive Summary

1. **Der Markt hat 2025/2026 auf Agenten umgeschwenkt.** GreenSock liefert mit [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (15,3k Stars) offizielle Agent-Skills für GSAP, Motion verkauft mit dem [Motion AI Kit](https://motion.dev/ai-kit) MCP + `/motion`-Skill. Das Beste ist frei verfügbar: GSAP ist seit der Webflow-Übernahme **zu 100 % kostenlos inkl. aller Plugins** (SplitText, MorphSVG, …) und wird über das öffentliche `gsap`-Paket installiert ([gsap-skills README](https://github.com/greensock/gsap-skills), [Codrops-Demoartikel 2025](https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/)).
2. **GSAP + ScrollTrigger ist die stärkste Basis für "Presets"**, weil Scroll-Sequenzen (Pinning, Scrub, Timelines) dort deterministisch und dokumentiert sind und die offiziellen Skills die typischen Fehler (refresh, cleanup, containerAnimation) bereits als Guardrails mitliefern ([ScrollTrigger-Skill](https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-scrolltrigger/SKILL.md)).
3. **Motion (ex Framer Motion) ist der bessere Baustein für zustandsbasierte UI-Motion** (Entry, Hover, Layout-Übergänge, Varianten-Orchestrierung mit `delayChildren`/`stagger`) und hat mit seiner `variants`-API eine der LLM-freundlichsten DSLs ([Motion Transitions Docs](https://motion.dev/docs/react-transitions)).
4. **Lenis ist der pragmatische Smooth-Scroll-Layer**: native Scroll-Semantik (Sticky, Anker, A11y bleiben intakt), `respectReducedMotion: true` per Default, offizielle ScrollTrigger-Integration ([Lenis README](https://github.com/darkroomengineering/lenis)). Es hat aber harte Limits (kein Scroll-Snap ohne Zusatzpaket, Safari 60-fps-Cap, iframe-Brüche).
5. **Native CSS Scroll-Driven Animations** (`animation-timeline: view()/scroll()`, `animation-range`) sind 2026 der sauberste Baseline-Weg für einfache Reveals und Progressbars — aber Firefox fehlt weiterhin, also nur progressive Enhancement ([Josh Comeau, Apr 2026](https://www.joshwcomeau.com/animation/scroll-driven-animations/), [caniuse](https://caniuse.com/wf-scroll-driven-animations)).
6. **View Transitions (cross-document) sind seit 2026 produktionsreif für Chromium + Safari 18.2+, Firefox fehlt.** Wichtig: Opt-in per CSS (`@view-transition { navigation: auto; }`), 4-Sekunden-Timeout killt Transitions still, und Bilder brauchen `object-fit: cover` auf den Pseudo-Elementen ([CSS-Tricks, Mai 2026](https://css-tricks.com/cross-document-view-transitions-part-1/)).
7. **3D/WebGL ist isolierbar, aber nicht "preset-fähig wie CSS".** Der bewährte Architektur-Ansatz ist ein einziger globaler Canvas + DOM-Proxy-Tracking (`ScrollScene`) via [r3f-scroll-rig](https://github.com/14islands/r3f-scroll-rig); R3F liefert Performance-Werkzeuge (`frameloop="demand"`, `PerformanceMonitor`, DPR-Regression) out of the box ([R3F Scaling Performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)).
8. **Performance-Grenzen sind quantifiziert:** LCP ≤ 2,5 s, INP ≤ 200 ms, CLS < 0,1 ([web.dev LCP](https://web.dev/articles/lcp), [web.dev INP](https://web.dev/articles/inp)). Motion darf nur `transform`/`opacity` animieren, `will-change` sparsam, maximal ~2 Parallax-Layer pro Viewport (Anti-Pattern-Katalog: [awwwards-motion](https://github.com/awwwards-motion)-Skill).
9. **`prefers-reduced-motion` ist keine Option, sondern WCAG-Pflicht** (Technik [C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39); Interaktions-Animationen sind AAA-relevant: [WCAG 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions)); Lenis, Motion (`useReducedMotion`) und die Preset-Skills liefern dafür fertige Mechanismen.
10. **"Taste as Code" existiert bereits als Vorbild:** Der lokale `design-taste-frontend`-Skill kodiert Motion über **Dials** (`MOTION_INTENSITY` 1–10), **canonical skeletons** (Sticky-Stack, Horizontal-Pan, Reveal-Stagger) und **verbotene Patterns**; der lokale `awwwards-motion`-Skill kodiert Pipeline (Audit → Choreografie → Build → Motion Diff), Easing-Palette (CSS-`linear()`-Springs), Coverage-Mandat und Anti-Patterns. Genau dieses Format ist die Vorlage für Senifys Motion-Preset-Schema.
11. **Empfehlung (Details in §8):** GSAP + ScrollTrigger als **Choreografie-Kern**, CSS-Reveals + native `animation-timeline` als **Baseline**, Motion für **React-Komponenten-Motion** (falls React-Renderer), Lenis optional als Smooth-Layer, R3F **nur als isolierte, lazy geladene 3D-Sektion** mit Pflicht-Fallback. Presets werden als **typisierte Motion-Specs (JSON) auf Sektionen** angewendet — kein freies Animations-Code-Generieren.
12. **Größte Unsicherheiten:** keine publizierten Evals, ob Agenten mit den Skills reproduzierbar "Framer-Qualität" erzeugen; WebGPU-/Three.js-Reifegrad stützt sich teils auf Sekundärquellen; "Awwwards-Level" ist Geschmacksurteil und bleibt auf absehbare Zeit review-pflichtig.

---

## 1. Definitionen: Was heißt "Framer-Niveau" vs. "Awwwards-Level"?

**Framer-Niveau (Minimum)** — laut Framer selbst und der Projekt-Analyse (RESEARCH.md):
- Komponenten mit **Varianten** (Zustands-Setups) und **spring-basierten Transitions** ([Framer Dictionary: Variant](https://www.framer.com/dictionary/variant)).
- Einfache Entry-/Hover-/State-Motion flächendeckend, konsistent, mit sauberem Easing — nicht einzelne Show-Effekte.
- Framework-Matrix des awwwards-motion-Skills nennt als Framer-Äquivalent: `motion/react` für React, View Transitions API für Page-Übergänge, Springs als Default-Easing.

**Awwwards-Level (Ziel)** — destilliert aus Codrops-Tutorials und den beiden Motion-Skills:
- **Scroll-Choreografie**: gepinnte Sektionen, gescrubbte Timelines, horizontale Pans, Sticky-Stacks ([GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [Codrops Cinematic 3D Scroll](https://github.com/JosephASG/codrops-cinematic-scroll-animations)).
- **WebGL/Shader-Szenen**, scroll-synchron zum DOM ([Codrops WebGL-Gallery Feb 2026](https://tympanus.net/codrops/2026/02/02/building-a-scroll-revealed-webgl-gallery-with-gsap-three-js-astro-and-barba-js/)).
- **Kinetic Type** mit Masken (SplitText `mask: "lines"`).
- **Experimentelle Layouts**, die ohne Motion nicht funktionieren (Pinning, Sticky, Overlap).
- Wichtig: "Awwwards-Level" ist ein **menschliches Geschmacksurteil**; kein Tool und kein Benchmark misst es objektiv. Reproduzierbarkeit heißt hier: dieselben *Muster* zuverlässig, konsistent und performance-sicher ausliefern — nicht dasselbe "Gefühl".

---

## 2. Preset-/Pattern-Architekturen (Frage 1)

### 2.1 GSAP + ScrollTrigger — Choreografie-Engine

**Status 2026:** GSAP ist nach der Webflow-Übernahme komplett kostenlos, inklusive aller früheren Club-Plugins ([gsap-skills README](https://github.com/greensock/gsap-skills); bestätigt durch [Codrops 2025](https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/)). GreenSock pflegt ein offizielles Agent-Skill-Paket mit 8 Skills (core, timeline, scrolltrigger, plugins, utils, react, performance, frameworks), installierbar via `npx skills add https://github.com/greensock/gsap-skills` ([Repo](https://github.com/greensock/gsap-skills)). Das README empfiehlt Agenten ausdrücklich GSAP für Timelines und Scroll-getriebene Animation, wenn keine andere Library vorgegeben ist.

**Für ein Preset-System relevant** (aus dem [ScrollTrigger-Skill](https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-scrolltrigger/SKILL.md)):
- Deklaratives Config-Objekt: `trigger`, `start`/`end` (`"top top"`, `"+=300"`, Funktionen, `clamp()`), `scrub` (boolean | Sekunden-Nachlauf), `toggleActions`, `pin` + `pinSpacing`, `snap`, `containerAnimation`, `refreshPriority`.
- **Pinning-Regel:** nicht das gepinnte Element selbst animieren, sondern Kinder (sonst brechen die Messungen) — dieselbe Warnung in der [offiziellen ScrollTrigger-Doku](https://gsap.com/docs/v3/Plugins/ScrollTrigger/).
- **Fake-Horizontal-Scroll:** Pinning + `containerAnimation`, horizontales Tween zwingend mit `ease: "none"`, sonst bricht die 1:1-Zuordnung von Scroll zu Position.
- **Lifecycle:** `ScrollTrigger.refresh()` nach Layout-Änderungen; in React `useGSAP()` + Scope + Cleanup; Kill bei SPA-Wechseln. Refresh-Reihenfolge top-to-bottom via `refreshPriority`.
- Harte Verbote: ScrollTrigger nie auf Child-Tweens einer Timeline, nie in Parent-Timelines verschachteln, `scrub` und `toggleActions` nicht mischen, `markers: true` nicht in Produktion.

**SplitText (kinetic type):** `SplitText.create(el, { type: "lines, words, chars", mask: "lines", autoSplit: true, aria: true })`; Animationen für responsive Re-Splits in `onSplit()` aufbauen; Segment-Config je Granularität (Beispiel aus Codrops: lines 0.8 s/Stagger 0.08, words 0.6/0.06, chars 0.4/0.008). `aria: true` ist inzwischen Default und verbessert die Screenreader-Situation gegenüber älteren Split-Text-Lösungen ([SplitText Docs](https://gsap.com/docs/v3/Plugins/SplitText/), [Codrops](https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/)).

**Performance-Leitlinien** (aus [gsap-performance-Skill](https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-performance/SKILL.md)): nur `transform`/`opacity` (x/y/scale/rotation statt left/top/width/height), `will-change` nur auf tatsächlich animierten Elementen, `stagger` statt vieler Einzel-Tweens, `gsap.quickTo()` für hochfrequente Updates (Maus-Follower), Off-Screen-Animationen pausieren/killen, `pin: true` promoviert das Element (sparsam einsetzen).

### 2.2 Motion (ex Framer Motion) — Varianten- und State-Motion

**Rolle:** React/Vue/JS-Animation mit erstklassigem **Varianten-System**. Variants sind benannte Zielzustände; orchestriert wird über Parent-Varianten mit `delayChildren`, `staggerChildren`-Äquivalent (`stagger()`-Funktion) und `when: "beforeChildren" | "afterChildren"` ([Motion Transitions Docs](https://motion.dev/docs/react-transitions)).

**Kernbausteine für Presets:**
- Transitions: `type: "tween" | "spring" | "inertia"`, Springs physikalisch (`stiffness`/`damping`/`mass`, `velocity`) oder visuell (`visualDuration` + `bounce`), Wert-spezifische Transitions (`default` + Overrides), `inherit`, Defaults via `MotionConfig`.
- Scroll: `whileInView` (mit `viewport: { once, amount }`), `useScroll` + `useTransform` + `useSpring` für gescrubbte Werte und Parallax, `useMotionValueEvent` für Richtungslogik; Beispiele für Hero-Scale/Blur, Clip-Path-Vorhang, horizontale Galerie (Sticky + x-Translate), Progress (Motion-Docs: [Scroll animations](https://motion.dev/docs/react-scroll-animations)).
- Accessibility: `useReducedMotion()` liefert den User-Preference-Status; degradiert auf statisch.
- Layout-Morphing: `layout`/`layoutId` für Reordering, Modals, Shared Elements (in [design-taste-frontend §5.D] als erlaubtes, aber kostenpflichtiges Pattern markiert — Messarbeit).

**Agent-Tooling:** Das [Motion AI Kit](https://motion.dev/ai-kit) (Teil des kostenpflichtigen Motion+) installiert via `npx motion-ai` einen MCP + `/motion`-Skill in Claude Code, Cursor, Amp, OpenCode, Gemini CLI und Copilot; geboten werden „MotionScore for Agents“, CSS-Spring-Generierung und 550+ AI-ready examples. Marktsignal: Agent-Freundlichkeit ist bei Motion ein Bezahlprodukt, bei GSAP kostenlos (Stand Sept 2026).

**Bewertung:** Motion ist ideal für zustands-/gestenbasierte Micro-Motion und React-nativ, aber **Scroll-Pinning/gescrubbte Sequenzen sind GSAP-territorium** — die Motion-Docs decken Scrubbing ab, Pinning-Szenen bleiben GSAP-Stärke (Framework-Matrix im `awwwards-motion`-Skill: „When to reach for GSAP“).

### 2.3 Lenis (Smooth Scroll) und ScrollSmoother

**Lenis** ([Repo](https://github.com/darkroomengineering/lenis), 15,8k Stars):
- Wrappt **den nativen Scroll** (keine transformierte Fake-Scrollbar) → `position: sticky`, Ankerlinks, Accessibility bleiben funktionsfähig; explizit als Designziel genannt.
- **`respectReducedMotion: true` per Default:** bei `prefers-reduced-motion: reduce` wird Smoothing aus (`lerp` → 1), programmatische Scrolls springen sofort; Lenis läuft weiter, damit DOM/WebGL-Sync intakt bleibt. Live umschaltbar ohne Reload.
- Offizielle GSAP-ScrollTrigger-Integration: `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(...)`, `gsap.ticker.lagSmoothing(0)`.
- **Ehrliche Limit-Liste im README:** kein CSS Scroll-Snap (nur via `lenis/snap`), Safari auf 60 fps gedeckelt (30 fps im Low-Power-Modus), iframes brechen Smooth-Scroll, nested-scroll-Auto-Erkennung kostet DOM-Checks pro Scroll-Event, `syncTouch` instabil auf iOS < 16.

**Alternative:** GSAPs eigener **ScrollSmoother** (jetzt gratis) nutzt ebenfalls nativen Scroll und ist in ScrollTrigger integriert ([Doku](https://gsap.com/docs/v3/Plugins/ScrollSmoother/)); Vorteil: ein Hersteller, ein Support-Pfad. Nachteil: zusätzliches Plugin statt einer schlanken, fokussierten Library. **Entscheidung offen (§9).**

**Kritik:** Smooth Scroll bleibt eine der umstrittensten Motion-Techniken (Scroll-Hijacking/Accessibility-Diskussionen, z. B. [Edoardo Lunardi 2025](https://www.edoardolunardi.dev/blog/building-smooth-scroll-in-2025-with-lenis) zu transform-basierten Alt-Ansätzen). Für Senify: default **aus**, pro Site/Template optional, immer mit Reduced-Motion-Gate.

### 2.4 React Three Fiber / Three.js — 3D-Sektionen

**Eignung:** R3F ist der produktive React-Weg; drei liefert Helfer. Wichtige Architektur-Patterns aus den [R3F Scaling-Performance-Docs](https://r3f.docs.pmnd.rs/advanced/scaling-performance):

| Technik | Nutzen |
|---|---|
| `<Canvas frameloop="demand">` + `invalidate()` | Rendert nur bei Bedarf; spart Akku/Fans, ideal für statische Szenen |
| Geometries/Materials wiederverwenden; `useLoader` cached automatisch | Weniger GPU-Overhead |
| Instancing (`<instancedMesh>`) | Eine Draw-Call für tausende Objekte; Faustregel: **max. ~1000 Draw-Calls, optimal wenige Hundert** |
| `<Detailed>` (LOD) + Nested Suspense | Low-Detail zuerst, High-Detail nachladen |
| `PerformanceMonitor` (drei) + DPR-Scaling + `regress()` | Adaptive Qualität: bei Framerate-Einbruch DPR/Effekte senken |
| `startTransition` (React 18) | Benchmarks: verteilte teure Geometrie-Erzeugung hält ~60 fps vs. ~5 fps bei at-once (three.js vanilla) |

**Scroll-Sync-Architektur:** [r3f-scroll-rig](https://github.com/14islands/r3f-scroll-rig) (14islands) — ein **einziger globaler Canvas**, DOM-Elemente dienen als „Proxies“ (`ScrollScene`/`ViewportScrollScene`/`useTracker`), Objekte werden an deren Position/Scale gerendert; Lenis als Scroll-Layer; `getBoundingClientRect()` einmal beim Mount + `IntersectionObserver`/`ResizeObserver` statt Scroll-Polling. Im README selbst: *„Consider disabling SmoothScrollbar and all scrolling WebGL elements on mobile — it is usually laggy“* und *„Use CSS animations whenever possible instead of JS“*. Das ist die ehrlichste verfügbare Kosten-Nutzen-Quelle für 3D-Sektionen.

**WebGPU:** Laut Sekundärquellen (Stand Frühjahr 2026) ist WebGPU in allen großen Browsern shipping (u. a. [LinkedIn-Post Apr 2026](https://www.linkedin.com/posts/sressler_threejs-webgpu-webgl-activity-7452706565939367937-SzE2), [vr.org Mai 2026](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default), [Medium Mai 2026](https://altersquare.medium.com/three-js-vs-webgpu-in-2026-what-changed-for-large-scale-construction-viewers-79a7ed8b0b34)) und der Three.js-WebGPU-Renderer produktionsreif. **Unsicherheit:** Diese Angaben sind nicht aus der Three.js-Release-Notes-Chronologie verifiziert; vor Architektur-Entscheidung gegen offizielle Three.js-Release-Notes prüfen.

**Spline:** Code-Export (inkl. experimentellem R3F-Export) existiert ([Spline Docs](https://docs.spline.design/exporting-your-scene/web/exporting-as-code), [react-spline](https://github.com/splinetool/react-spline)); als Agenten-Baustein aber weniger kontrollierbar (Runtime-Bundle des Editors, Qualitätsverlust-Beschwerden). Für v1: handgebaute R3F-Presets statt Design-Tool-Exporte.

**Lottie/Rive:** Lottie = lineare Vektor-Loops (State Machines inzwischen auch bei [LottieFiles](https://www.youtube.com/watch?v=d5ngkWU2TY8)); Rive = State-Machine-Interaktivität ([Rive-Vergleich](https://rive.app/blog/rive-as-a-lottie-alternative), [LottieFiles 2026](https://lottiefiles.com/blog/lottie-animations/lottiefiles-or-rive)). Für agenten-generierte Sektionen sind beide **sekundär**: proprietäre Authoring-Tools, keine Preset-Semantik; höchstens als Medien-Assets (Media-Pipeline-Ticket 15), nicht als Motion-Engine.

### 2.5 View Transitions API — Page-/State-Übergänge

Aus [CSS-Tricks, „Cross-Document View Transitions: The Gotchas Nobody Mentions“ (Mai 2026)](https://css-tricks.com/cross-document-view-transitions-part-1/) und [MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API):
- **Opt-in ist CSS, nicht Meta-Tag:** `@view-transition { navigation: auto; }` in beiden Seiten. Das alte `<meta name="view-transition">` ist tot (nie final ausgeliefert) — die halbe Tutorial-Landschaft ist falsch.
- **Media-Query-fähig:** z. B. nur unter `@media (prefers-reduced-motion: no-preference)` und nur ab Desktop-Breite aktivieren.
- **4-Sekunden-Timeout:** lädt die Zielseite nicht rechtzeitig „renderable“, stirbt die Transition **still** (`TimeoutError` nur über `pagereveal`-Listener sichtbar). Das Timeout ist damit ein Performance-Kanarienvogel (TTFB zählt mit).
- **Bilder „wie Taffy“:** snapshots werden gestreckt; Fix ist `::view-transition-old/new(...) { object-fit: cover; }`.
- **Lifecycle-Hooks:** `pageswap` (alte Seite, u. a. `event.activation.entry.url`) und `pagereveal` (neue Seite) — für Just-in-Time-`view-transition-name`s; `finished`-Promise für Cleanup.
- **Support 2026:** Chromium + Safari 18.2+, Firefox in Arbeit ([caniuse](https://caniuse.com/cross-document-view-transitions)). Same-document (SPA) hat breitere Unterstützung; cross-document ist der MPA-Fall (Astro & Co.).

**Für Senify:** ideal als Preset `page-transition: fade | slide` in MPA-Renderern (Astro), degradiert ohne Support zu Instant-Navigation. Keine Grundlage für Scroll-Choreografie.

### 2.6 Native CSS Scroll-Driven Animations — kostenlose Baseline

[Josh Comeau, Apr 2026](https://www.joshwcomeau.com/animation/scroll-driven-animations/): `animation-timeline: view()` bindet Keyframes an die Element-Position im Viewport, `scroll()` an den Gesamtfortschritt; `animation-range: cover | contain | entry | exit` (+ Prozentwerte) steuert Start/Ende; `view-timeline` + `timeline-scope` erlauben **verknüpfte Timelines** (Element A steuert Animation von Element B); Springs via `linear()`-Timing-Funktion. Kein JS nötig.
**Grenzen:** Firefox fehlt weiterhin ([Mozilla-Idea-Thread](https://connect.mozilla.org/t5/ideas/implement-css-scroll-driven-animations-animation-timeline/idi-p/116931), [caniuse](https://caniuse.com/wf-scroll-driven-animations)); kein Pinning, keine Timeline-Sequenzierung im GSAP-Sinn. **Rolle im Stack:** progressive Enhancement für Reveals/Progress — nie exklusiv.

### 2.7 Copy-in-Ökosysteme (shadcn-Muster) als Pattern-Quelle

- **shadcn Registry** ([Docs](https://ui.shadcn.com/docs/registry)): Standardmechanismus, um Komponenten als **Code** (nicht npm-Paket) über `registry.json` + CLI zu verteilen — genau die Distribution, die Senify für Presets braucht (Versionierung eigener Registries möglich).
- **Motion Primitives** ([ibelick](https://github.com/ibelick/motion-primitives), [Site](https://motion-primitives.com/)): 50+ animierte Komponenten auf Basis Motion + Tailwind, Copy-in, Beta.
- **Aceternity UI** ([Site](https://ui.aceternity.com/)): 200+ Copy-Paste-Komponenten, veröffentlicht eine shadcn-Registry; Marketing nennt explizit „copy a prompt for your agent“ ([21st.dev-Eintrag](https://21st.dev/@manuarora700/library/aceternity-ui)).
- **React Bits** ([Repo](https://github.com/DavidHDev/react-bits)): 165+ animierte React-Komponenten, ~47k Stars; breite Text-/Background-/UI-Motion-Sammlung.

**Bewertung:** als **Inspirations- und Referenzquelle** wertvoll, als Produktions-Substrat riskant (Qualität/Maintenance/Lizenz uneinheitlich, kaum Semantik, keine Reduced-Motion-Garantien über alle Komponenten). Senify sollte kuratierte, eigene Presets bauen und diese Repos als Pattern-Steinbruch nutzen.

### 2.8 Vergleichstabelle: Eignung als "Preset-Bibliothek"

| Technologie | Preset-Fähigkeit | Agent-Freundlichkeit | Kosten/Risiko | Rolle im Senify-Stack |
|---|---|---|---|---|
| GSAP + ScrollTrigger | **Sehr hoch** (deklaratives Config, deterministisch) | Offizielle Skills, llms.txt, frei | Keine Lizenzkosten; Ökosystem-Wechsel Webflow-Risiko gering | **Kern (Choreografie)** |
| Motion | Hoch (Varianten + Transitions) | Gute API intuitiv; AI Kit nur bezahlt | Motion+ Paywall für Agent-Tooling | React-Motion-Layer (bedingt, s. §8) |
| Lenis | Mittel (globaler Layer, kein Preset) | Einfache API, Doku | Safari-Caps, iframe-Ecken | Optionaler Smooth-Layer |
| R3F/Three.js | Niedrig-mittel (Szenen sind Sonderfälle) | Doku stark; Agenten brauchen Budgets | Bundle, Mobile-Lags, GPU-Varianz | Isolierte 3D-Sektionen (lazy) |
| View Transitions API | Mittel (page-transition-Preset) | Nativ, kein Code-Framework | 4s-Timeout, Firefox-Fehlteil | Page-Transitions (MPA) |
| CSS Scroll-Driven Animations | Mittel (einfache Reveals) | Pure CSS, sehr LLM-freundlich | Firefox fehlt | Baseline-Reveals |
| Copy-in-Libraries | Niedrig (Konsistenz unklar) | „Copy prompt“-Flow vorhanden | Wartung/Lizenz/Qualität | Pattern-Quelle, kein Kern |

---

## 3. Musterkatalog (Frage 2)

Kategorien A–G, ~22 Muster. Spalte „Default“ = empfohlener Startwert; Intensität skaliert über Motion-Dials bzw. Preset-Parameter. Reduced-Motion-Fallback ist für jedes Muster Pflicht.

### A. Entry / Page Load
| # | Muster | Was animiert | Default-Timing/Easing | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| A1 | Fade-up | opacity + translateY(12–24px) | 0,5–0,7 s; `--spring-snappy` bzw. `cubic-bezier(0.16,1,0.3,1)` | opacity-only, 0,2 s | design-taste §5.C; awwwards-motion |
| A2 | Fade-up-deblur | + blur(8→0) | 0,6–0,8 s | opacity-only | awwwards-motion (Reveal-Default) |
| A3 | Masked Line Reveal | Zeilen aus Clip-Maske (yPercent 110→0) | lines 0.8/0.08, words 0.6/0.06 | einfache Fade | SplitText/Codrops |
| A4 | Scale-in + Fade | scale 0.96→1 | 0,5 s spring | opacity-only | Motion patterns |
| A5 | Stagger-Cascade (Liste/Grid) | Kinder sequenziell | 60–100 ms Stagger (Apple 80–120) | alle gleichzeitig, opacity | Motion `stagger()`; awwwards-motion |

### B. Scroll-linked
| # | Muster | Was animiert | Default | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| B1 | Scroll Reveal (`whileInView`) | opacity/y, `once: true` | 0,6 s; viewport amount 0.3 | statisch sichtbar | Motion Docs |
| B2 | Scrub-Timeline (gepinnt) | Timeline-Progress = Scroll-Progress | `scrub: 1`, `pin: true`, end `+=100%` | kein Pin, statische Sektion | GSAP Skill |
| B3 | Sticky-Stack (Cards) | Cards pinnen + Vorgänger schrumpft/faded | scale 0.92, opacity 0.55, an Next-Card gekoppelt | gestapelt, statisch | design-taste §5.A |
| B4 | Horizontal-Pan | x von Track, Wrapper gepinnt | `end: +=distance`, `scrub: 1`, `ease: none` | vertikale Liste | design-taste §5.B; GSAP `containerAnimation` |
| B5 | Parallax (max 2 Layer!) | y-Versatz Hintergrund/Vordergrund | Faktor 0.1–0.3, `useScroll`+`useTransform` | deaktiviert | awwwards-motion (Anti-Pattern „Parallax Soup“) |
| B6 | Scroll-Progress-Bar | scaleX 0→1 | linear, `animation-timeline: scroll()` | weiterhin ok (Informationsfunktion) | Josh Comeau |
| B7 | Native View-Reveal | opacity/translate per `view()` | `animation-range: entry 0% cover 40%` | media-query-gated | Josh Comeau |

### C. Text / Kinetic Type
| # | Muster | Was animiert | Default | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| C1 | Line/Word/Char-Reveal | Masken-Translate je Einheit | s. A3 | Fade | SplitText |
| C2 | Counter (Stats) | Zahl 0→Target | 1–1,5 s, ease-out | Zielwert sofort | awwwards-motion Map |
| C3 | Ticker/Marquee | Endlos-x | linear, 20–40 s | pausiert | Motion-Docs (Ticker) |
| C4 | Char-Split (Signature) | 1× pro Seite max | 0,5–0,8 s | Fade | awwwards-motion („Text Disassembly“ verbietet mehr) |

### D. Hover / Interaktion
| # | Muster | Was animiert | Default | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| D1 | Lift + Shadow | translateY(-2–4px) + shadow | 0,2–0,3 s; `--ease-snap` | nur Farbwechsel | awwwards-motion |
| D2 | Magnetic Button | x/y folgt Cursor (quickTo) | Radius ~80px, 0,4 s Rückfederung | deaktiviert | GSAP performance (quickTo) |
| D3 | 3D-Tilt-Card | rotateX/Y an Cursor | max 6–8° | deaktiviert | awwwards-motion |
| D4 | Cursor-Glow/Dot-Grid | radial glow/Inertia-Push | Inertia + elastic return | deaktiviert | Codrops Inertia-Demo |

### E. State / Page
| # | Muster | Was animiert | Default | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| E1 | Layout-Morph (`layoutId`) | geteilte Elemente | spring, `visualDuration` 0,3–0,5 | instant swap | Motion Docs |
| E2 | Accordion/Tabs | height/indicator + Crossfade | 0,3 s | instant | Motion + CSS |
| E3 | Modal/Dialog | backdrop fade + scale-in | 0,25–0,35 s spring | opacity-only | awwwards-motion |
| E4 | Page Transition | cross-fade/slide via `@view-transition` | 0,3–0,5 s | gated via media query | CSS-Tricks |
| E5 | Preloader | Progress + Reveal | **max 2,5 s**, nie künstlich verlängern | sofort zeigen | awwwards-motion („Infinite Preloader“) |

### F. Ambient
| # | Muster | Was animiert | Default | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| F1 | Floating Shapes/Gradient | langsame Loops (transform) | 8–20 s, `mirror` | deaktiviert | awwwards-motion |
| F2 | Grain/Noise | fixed, pointer-events none | statisch/leicht | deaktiviert | design-taste §6.E (nie auf Scroll-Containern) |

### G. 3D / WebGL
| # | Muster | Was animiert | Default | Reduced-Motion | Quelle |
|---|---|---|---|---|---|
| G1 | WebGL-Scroll-Szene | Mesh folgt DOM-Proxy | scroll-rig, Lenis-Sync | statisches Poster/Bild | r3f-scroll-rig |
| G2 | ViewportScene (eigene Cam/Lights) | Rendering in DOM-Slot | on-demand | statisches Bild | r3f-scroll-rig |
| G3 | Shader-Reveal (Galerie) | Scroll-gesteuerte Shader-Uniforms | scrub-gekoppelt | Fade | Codrops Feb 2026 |
| G4 | Produkt-/Modell-Showcase | Rotation/LOD/Instancing | `frameloop="demand"` + PerformanceMonitor | statisches Render/Image | R3F Docs |

---

## 4. Detail-Findings (mit Quellen)

### 4.1 Scroll-Sequenzen & Pinning (GSAP)
- `start`/`end`-Format `"triggerPosition viewportPosition"`, relative Werte (`"+=300"`) und `clamp()`; `endTrigger` für abweichende End-Elemente ([Skill](https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-scrolltrigger/SKILL.md)).
- Pin: nie das gepinnte Element selbst animieren; `pinSpacing: false` nur, wenn Layout anderweitig abgesichert ist ([GSAP Docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)).
- `containerAnimation` (Fake-Horizontal): horizontales Tween **muss** `ease: "none"` haben; Pinning und Snapping sind darin nicht verfügbar.
- `ScrollTrigger.batch()` als performante Alternative zu vielen einzelnen Reveal-Triggern (Batch-Callbacks mit Stagger).
- Refresh/Ordering: `refreshPriority` bei nicht-top-to-bottom erzeugten Triggern; Refresh läuft in Erzeugungsreihenfolge.
- **Kritisch für Agenten:** Fast alle bekannten Fehlerquellen sind im offiziellen Skill als „Do Not“-Liste kodiert — das ist der Grund, warum Agenten mit GSAP *reliabler* arbeiten als mit freiem Scroll-JS.

### 4.2 Stagger & Orchestrierung (Motion)
- Parent-Variante steuert: `delayChildren`, `stagger(0.1)`, `stagger(0.1, { from: "last" | "center" | index })`; zusätzlich `when: "beforeChildren"/"afterChildren"`.
- Wichtig: `staggerChildren` funktioniert nur über Variants; Parent und Children müssen im selben Client-Component-Tree leben (design-taste §5.D).
- Empfehlung für Listen: Motion `whileInView` + Delay-Stagger (leichter, kein ScrollTrigger); GSAP nur für echte Pin/Scrub-Arbeit (dieselbe Abgrenzung in design-taste §5.C).
- Apple-Maßstab: 80–120 ms Stagger-Präzision (awwwards-motion, „Apple-Level Motion Standards“).

### 4.3 Easing & Springs
- **CSS `linear()`-Springs** sind der neue Qualitätsstandard (Apple/Material-3-Expressive-Nähe); drei Kurven (snappy/smooth/bouncy) + M3-Emphasized als Fallback sind im awwwards-motion-Skill als produktionsreife Palette hinterlegt (u. a. `--spring-snappy: linear(...)`, Default-Dauer 0,55 s).
- Material 3 Expressive: `cubic-bezier(0.05, 0.7, 0.1, 1.0)` als Minimum für Container-Transitions.
- Motion: Springs physikalisch oder `visualDuration` + `bounce`; Springs übernehmen Velocity aus Gesten/Animationen.
- **Design-Token-Anschluss:** Die W3C-DTCG-Spezifikation (Design Tokens Format Module 2025.10) enthält u. a. die Typen `duration` und `cubicBezier` ([Spec](https://www.designtokens.org/tr/drafts/format/), [Typ-Übersicht](https://www.dembrandt.com/validator)) — Motion-Timing kann damit im selben Token-Format wie Farben/Typo ausgeliefert werden.

### 4.4 Kinetic Type
- SplitText-Optionen: `type`, `mask`, `autoSplit`, `aria: true`, `onSplit` (Animationen dort neu aufbauen), `linesClass`/`wordsClass`/`charsClass` für CSS-Hooks.
- Granularitäts-abhängige Timings (Codrops): lines 0.8/0.08 → words 0.6/0.06 → chars 0.4/0.008; bei Masken: Container mit `overflow: clip` und `yPercent`-Animation.
- Fonts: erst nach `document.fonts.ready` splitten, sonst falsche Zeilenumbrüche.
- Qualitätsregel: maximal **eine** Char-Split-Animation pro Seite (awwwards-motion Anti-Pattern „Text Disassembly“).

### 4.5 3D/WebGL-Szenen
- **Ein Canvas, DOM-Proxies, main-thread-sync** (r3f-scroll-rig): verhindert Context-Limits mehrerer Canvasse und synchronisiert WebGL exakt mit dem Scroll ([README](https://github.com/14islands/r3f-scroll-rig)).
- CLS: alle Proxy-Elemente/Bilder mit fixer Aspect-Ratio; `ResizeObserver`/`reflow()` bei Font-/Layout-Änderungen.
- Qualitätsstufen statt Full-3D-only: Detecting via Media Query/`PerformanceMonitor`; mobile Default = statisches Bild (explizite Empfehlung des Scroll-Rig-Autors).
- Codrops-Referenz-Tutorial (Feb 2026) für „scroll-revealed WebGL gallery“ (GSAP + Three.js + Astro + Barba) zeigt den State of the Art der MPA-Variante ([Link](https://tympanus.net/codrops/2026/02/02/building-a-scroll-revealed-webgl-gallery-with-gsap-three-js-astro-and-barba-js/)).

### 4.6 Page Transitions
- Cross-document: siehe §2.5 — beide Seiten opt-in, 4s-Timeout, `object-fit: cover`-Fix, `pagereveal`/`pageswap`.
- Astro hat View Transitions „built-in“ (Framework-Matrix awwwards-motion; Astro-Doku) — relevant für Renderer-Ticket 02/17.
- Same-document (SPA): `document.startViewTransition()` für DOM-Swaps; Motion `AnimatePresence`/`layoutId` als React-Alternative.

### 4.7 Reduced Motion
- WCAG-Technik C39: `@media (prefers-reduced-motion)` respektieren; `no-preference` als Gate für Animationen ([W3C](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)).
- WCAG 2.3.3 (AAA): „Animation from Interactions“ — Nutzer müssen bewegungsauslösende Interaktions-Animationen deaktivieren können; Begründung: vestibuläre Störungen, Symptome u. a. Übelkeit, Migräne ([W3C Understanding](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions)).
- Google-Best-Practices ([web.dev](https://web.dev/articles/prefers-reduced-motion)): nicht nur „an/aus“ denken — reduzierte Variante statt Totalausfall (z. B. schnellere, opacity-only Varianten).
- Umsetzung in Presets: **jedes** Muster hat ein definiertes reduced-motion-Verhalten (Katalog §3); Lenis, Motion und die Skills liefern Mechanik (`useReducedMotion`, `respectReducedMotion`, Media-Query-Gates).
- Kritische Regel aus den Skills: unter `reduce` keine Transforms, keine Parallax, keine Scroll-gekoppelten Sequenzen, keine Spring-Overshoots; Fades erlaubt (awwwards-motion; design-taste §6.B).

---

## 5. Agent-freundliche Libraries / Repos / „Taste as Code“ (Frage 3)

### 5.1 Offizielle Agent-Skills
- **GSAP** (frei): `skills/` mit llms.txt-Index, AGENTS.md, `.claude-plugin`/`.cursor-plugin`, Copilot-Instructions; Installation via `npx skills add` in 40+ Agenten ([Repo](https://github.com/greensock/gsap-skills)). Enthält exakt die Guardrails, die Agenten sonst falsch machen.
- **Motion AI Kit** (Motion+, kostenpflichtig): `npx motion-ai` → MCP + `/motion`-Skill + MotionScore + CSS-Spring-Generator ([Produktseite](https://motion.dev/ai-kit)).

### 5.2 „Taste as Code“ — die zwei stärksten existierenden Vorbilder
**`design-taste-frontend` (lokal; upstream Leonxlnx/taste-skill, u. a. gelistet auf [agenticskills.io](https://agenticskills.io/skills/taste-skill))**:
- **Drei Dials**: `DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY` (je 1–10) — inkl. konkretem Verhalten pro Stufe. `MOTION_INTENSITY` 1–3 statisch, 4–7 Fluid-CSS (`transition: all 0.3s cubic-bezier(0.16,1,0.3,1)`), 8–10 „Advanced Choreography“ mit **hartem Verbot** von `window.addEventListener("scroll")`.
- **Canonical Skeletons**: Sticky-Stack, Horizontal-Pan, Scroll-Reveal-Stagger mit korrektem GSAP/Motion-Einsatz, Cleanup und `useReducedMotion`.
- **Performance-/A11y-Guardrails**: nur `transform`/`opacity`; `prefers-reduced-motion` Pflicht ab Intensität > 3; CWV-Ziele (LCP < 2,5 s, INP < 200 ms, CLS < 0,1); Grain nur auf fixed Pseudo-Elementen.

**`awwwards-motion` (lokal)**:
- **4-Phasen-Pipeline** mit Quality Gates: Motion Audit → Choreography (Easing-Palette, Timing Sheet, Stagger) → Build (Layer 1–10: Entry, Scroll, Hover, Text, Transitions, Smooth Scroll, Ambient, States, Preloader, Signature) → Motion Diff (Coverage/Feel/Easing/Performance/Accessibility/Technical/Composition Checks).
- **Coverage-Mandat**: Tabellenpflicht „jedes sichtbare Element bekommt Motion“ — plus Warnung vor dem häufigsten Agentenfehler: Hero animieren, Rest statisch lassen.
- **Anti-Pattern-Katalog mit Fixes**: Slow Reveal (>800 ms), Scroll Carnival, Hover Disco, Parallax Soup (max 2 Layer), Text Disassembly (1× Char-Split), Infinite Preloader (max 2,5 s), Missing Reduced Motion, Layout Animator.
- **Framework Decision Matrix** und Apple-Level-Standards (Springs Pflicht, Restraint, 60 fps).

**Einordnung:** Das sind die konkretesten „Motion-Specs für LLMs“, die es frei gibt. Sie kodieren Motion als **Regeln + Dials + Skeletons + Verbote**, nicht als Freitext-Beschreibung. Genau dieses Format sollte Senify als Preset-Katalog übernehmen (siehe §6).

### 5.3 Registry-/Verteilmechanik
- **shadcn Registry** ist der De-facto-Standard für Copy-in-Verteilung von React-Code (registry.json + CLI, eigene Registries möglich, [Docs](https://ui.shadcn.com/docs/registry)).
- Motion Primitives / Aceternity / React Bits zeigen, dass der Markt Copy-in + Agent-Prompts kombiniert („copy a prompt for your agent“). Für Senify relevant als **Referenz, wie Presets dem Agenten zugespielt werden** (Code-Snippet + Semantik + Beispiele), nicht als Abhängigkeit.

### 5.4 Lücken
- Kein öffentlicher **Benchmark/Eval**, der zeigt, dass Agenten mit diesen Skills reproduzierbar „Framer-Qualität“ erzeugen (nur Anekdoten/Blogs, z. B. [ritnerdigital Apr 2026](https://www.ritnerdigital.com/blog/will-ai-coding-enable-more-advanced-animations-on-websites-with-less-code)).
- Keine standardisierte Sprache für Motion-Specs über Tools hinweg (Varianten-Modelle unterscheiden sich: Framer Variants, Motion Variants, GSAP-Konfig). DTCG bringt nur Tokens (`duration`, `cubicBezier`), keine Choreografie.
- `prefers-reduced-motion`-Handling ist in Copy-in-Libraries uneinheitlich — Senify muss es im Preset-Vertrag erzwingen.

---

## 6. Motion-Spezifikation für LLMs (Frage 5)

### 6.1 Designprinzip
Agenten scheitern nicht an fehlendem Animations-Code, sondern an **fehlender Semantik und Guardrails** (RESEARCH.md §3.2: „AI-Websites sehen generisch aus, weil Modelle ohne Identität + ohne strikte Systeme generieren“). Deshalb:
1. **Keine freie Motion-Codegenerierung.** Agent wählt ein **Preset** + Parameter; der Preset-Code ist kuratiert, getestet, versioniert.
2. **Motion-Spec als typisierte Props** auf jeder Sektion (wie Framer-Varianten, aber JSON).
3. **Dials statt Zahlenwust**: `motionIntensity` (1–10) mappt auf konkrete Preset-Parameter (analog design-taste `MOTION_INTENSITY`).
4. **Pflichtfelder**: Trigger, Ziel, Timing/Easing-Token, Reduced-Motion-Verhalten, Performance-Budget.
5. **Verbote als Validierungsregeln** (max. 1 Pinned Section/Page, max. 2 Parallax-Layer, keine Scroll-Listener, Char-Split max. 1×).

### 6.2 Vorschlag: Motion-Spec-Schema (Beispiel)

```json
{
  "section": "features",
  "motion": {
    "preset": "sticky-stack",
    "intensity": 6,
    "trigger": { "type": "scroll-pin", "start": "top top", "scrub": 1 },
    "tokens": { "ease": "spring-snappy", "durationScale": 1.0, "stagger": 0.08 },
    "reducedMotion": "static",
    "budget": { "pinnedSectionsPerPage": 1, "maxDrawCalls": 200 }
  }
}
```

Übersetzt der Renderer deterministisch in GSAP-Config (oder Motion-Variants / CSS), bleibt die Agenten-Oberfläche klein und die Qualität reproduzierbar. Die Preset-Bibliothek = 12–18 Rezepte aus §3, jedes mit: Props-Schema, Code, Reduced-Motion-Variante, visuelles Beispiel, Anti-Pattern-Notiz.

### 6.3 Warum Varianten/Props statt Prompt-Beschreibung
- Motion-Varianten sind bereits eine **Zustands-DSL** (Parent steuert Kinder, `when`, `stagger`) — LLMs können sie zuverlässig füllen, weil sie deklarativ und typisiert ist (Motion Docs).
- GSAP-Konfigs sind **deklarative Objekte** (`scrollTrigger: {...}`, `ease`, `stagger`) — der offizielle Skill liefert dazu ein kanonisches Muster („Canonical GSAP pattern to suggest or generate“, [README](https://github.com/greensock/gsap-skills)).
- Framer verkauft dasselbe Prinzip visuell: „Variants keep related options organized and enable smooth transitions between states“ ([Framer](https://www.framer.com/dictionary/variant)).

### 6.4 Konkrete Umsetzungshinweise für Senify
- **Skills als Teil des Produkts**: Das GSAP-skill-Repo als Blaupause für ein eigenes `senify-motion`-Skillpaket (llms.txt, SKILL.md pro Preset, Do/Don't-Listen, copy-paste-bare Skeletons).
- **Docs agent-first**: Jedes Preset mit Kanonical-Code, Props-Tabelle, Reduced-Motion-Verhalten, Budget — nach dem Vorbild von gsap-skills.
- **Eval**: Golden-Outputs + visuelle Diff-Checks pro Preset (Screenshot + Timing-Review), bevor Presets freigegeben werden.

---

## 7. Performance-Grenzen (Frage 4)

### 7.1 Core Web Vitals — Schwellen und Fallstricke
| Metrik | Ziel | Fallstrick mit Motion/3D |
|---|---|---|
| **LCP** | ≤ 2,5 s (75. Perzentil) | LCP-Kandidaten sind Bilder/Textblöcke/Videos; **Elemente mit `opacity: 0` werden von Chromium-Heuristiken ignoriert** — Entry-Animationen, die das Hero per Fade einblenden, können den LCP-Kandidaten verzögern oder disqualifizieren. Hero-Bild vorladen/`priority`, Text nicht hinter JS hängen ([web.dev LCP](https://web.dev/articles/lcp)). |
| **INP** | ≤ 200 ms (75. Perzentil) | INP misst nur Klick/Tap/Key — **Scroll und Hover zählen nicht direkt**. Aber lange Main-Thread-Tasks (schwere Scroll-Loops, WebGL-Render, JS-Ticker) erzeugen Input-Delay und verschlechtern Klicks messbar ([web.dev INP](https://web.dev/articles/inp)). Konsequenz: Scroll-/Hover-Motion darf den Main-Thread nicht füllen; `transform`/`opacity` + Compositor, `requestAnimationFrame`-Loops meiden bzw. über Motion Values entkoppeln. |
| **CLS** | < 0,1 | Pinning mit `pinSpacing`, nachladende Fonts/Bilder, Scroll-Rig-Proxies: Aspect-Ratios reservieren; `reflow()` nach Layout-Änderungen (r3f-scroll-rig). Keine `height`/`top`-Animationen (Layout Animator). |

### 7.2 Motion-Kosten: was erlaubt, was verboten
- Nur `transform`/`opacity` animieren; `will-change` sparsam (GSAP-Performance-Skill; design-taste §6.A; awwwards-motion).
- `window.addEventListener("scroll")`, Scroll-Progress in React-State, RAF-Loops mit State-Updates: **hart verboten** (design-taste §5.D). Alternativen: `useScroll`, `ScrollTrigger`, IntersectionObserver, `animation-timeline`.
- Stagger statt vieler Einzel-Tweens; `quickTo` für Frequenz-Updates; Off-Screen killen (GSAP-Performance-Skill).
- Reveals < 800 ms; Preloader ≤ 2,5 s; Parallax ≤ 2 Layer/Viewport; ein Char-Split pro Seite (awwwards-motion Anti-Patterns).

### 7.3 3D-Kosten & Budgets
- Draw-Calls: max. ~1000, besser wenige Hundert; Instancing/LOD/Reuse (R3F Docs).
- `frameloop="demand"` + `invalidate()` für ruhende Szenen; `PerformanceMonitor` + DPR-Scaling als Standard; Concurrency via `startTransition` (R3F Docs).
- Mobile: „WebGL + Smooth Scroll auf Mobile meist laggy“ → Default **statisches Fallback** (r3f-scroll-rig README). Pro Sektion: ein Canvas, lazy (`Suspense`/Dynamic Import), Poster-Bild bis Load.
- WebGL-Canvas-Inhalt ist für Crawler unsichtbar (SEO!): 3D nie als alleiniger Content-Träger ([utsubo, Mai 2026](https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide) — Sekundärquelle).

### 7.4 View-Transition-Timeout als Budget-Signal
- 4 s bis „renderable“, sonst stille Degradierung ([CSS-Tricks](https://css-tricks.com/cross-document-view-transitions-part-1/)). Heißt: Page-Transitions erfordern schnelle Zielseiten (SSG/CDN) — passt zu Senifys SSG/ISR-Renderer-Annahme.

### 7.5 Reduced Motion & Barrierefreiheit
- Siehe §4.7. Zusätzlich: Lenis respektiert die Präferenz per Default; Motion bietet `useReducedMotion()`; CSS-Gates sind Standard.
- Praxis-Check: „opacity-only, kürzere Dauer“ ist der definierte Fallback — nicht „alles aus“.

### 7.6 Messlücken
- Lighthouse/PSI messen **Feel** und Scroll-Qualität nicht; INP-Lab-Tests ohne Interaktion liefern oft keinen Wert (web.dev INP). Für Senify nötig: eigene Perf-Budgets pro Preset + RUM (später Performance-Ticket 14) und ein Motion-Review-Schritt (Motion Diff) im Approval-Flow (Ticket 06).

---

## 8. Empfehlung: Kern-Stack

**Dies sollte der Kern sein:**

1. **Choreografie-Engine: GSAP + ScrollTrigger** (zusammen mit useGSAP in React bzw. Vanilla in Astro).
   - Begründung: deterministische, deklarative Configs; offizielle Agent-Skills mit Guardrails; alle Plugins kostenlos; stärkste Abdeckung für Pin/Scrub/Sequenzen; größtes Wissen in Modellen (verbreitetste Animations-Library).
2. **Baseline-Layer: CSS-Transitions + native Scroll-Driven Animations** (`animation-timeline`), wo möglich.
   - Begründung: null JS, LLM-freundlich (reines CSS), progressive Enhancement ohne Risiko. Deckt A1/A4/B6/B7/E2 ab.
3. **React-Motion-Layer: Motion**, **nur falls der Renderer React-basiert ist** (Ticket 02/17 hängt zusammen): Entry/Exit, Gesten, Layout-Morphing, Varianten-Orchestrierung in UI-nahen Komponenten (Nav, Modals, Tabs, Karten-Grids).
   - Abgrenzung verbindlich: Motion für Zustands-Motion, GSAP für Scroll-Choreografie.
4. **Smooth Scroll: optional pro Template** (Lenis default; ScrollSmoother als GSAP-eigene Alternative evaluieren). Default: aus; wenn an, dann mit Reduced-Motion-Default und Mobile-Off.
5. **3D: isolierte Leaf-Sektionen** auf R3F-Basis mit dem Scroll-Rig-Architekturmuster (ein Canvas, DOM-Proxies), `frameloop="demand"`, `PerformanceMonitor`, mobile statisches Fallback. 3D ist ein Premium-Preset, nicht Grundrauschen.
6. **Page Transitions: View Transitions API** in MPA-Renderern; in SPA Motion-Äquivalent.

**Preset-Katalog v1 (Vorschlag, 12):** `fade-up` · `fade-up-deblur` · `masked-headline` · `stagger-grid` · `sticky-stack` · `horizontal-pan` · `parallax-subtle` (max 2 Layer) · `counter` · `hover-lift` · `page-fade` (VT) · `webgl-scene` (3D) · `preloader-light`.

**Guardrails (maschinenlesbar, aus den Quellen abgeleitet):**
- Nur `transform`/`opacity` (+ bestimmte `filter`); keine Scroll-Listener; kein State pro Scroll-Frame.
- Max. 1 Pin-Section und 2 Parallax-Layer pro Page; Reveals < 800 ms; 1 Char-Split/Page; Preloader ≤ 2,5 s.
- Jedes Preset: Reduced-Motion-Variante + Budget (INP/LCP/CLS-Notes) + Mobile-Fallback.
- 3D: lazy, ein Canvas, DPR-adaptiv, statisches Poster auf Mobile/Reduce.
- Anti-Pattern-Liste aus awwwards-motion als **Hard-Fail-Checks** in der Quality-Gate-Pipeline (Ticket 13).

**Was der Kern nicht sein sollte:** freie, agentengenerierte GSAP-/Three.js-Codeschnipsel ohne Preset-Vertrag; mehrere WebGL-Canvasse; Motion in Schleifen über hundert DOM-Knoten; Smooth Scroll als Pflicht; 3D als LCP-Träger.

---

## 9. Offene Fragen / Unsicherheiten

1. **Renderer-Abhängigkeit:** Motion (React) vs. GSAP+CSS (framework-agnostisch) hängt am Renderer-Entscheid (Tickets 02/17). Die Empfehlung ist bewusst zweigleisig.
2. **Lenis vs. ScrollSmoother:** Beide gratis; Kriterien: Bundle, Support-Konsistenz, ScrollTrigger-Integration, Safari-Verhalten. Braucht einen Messvergleich (INP/jank) auf Referenzgeräten.
3. **CSS Scroll-Driven Animations als Default?** Wegen Firefox-Lücke nur Enhancement. Zu prüfen: Anteil der Zielnutzer + Fallback-Strategie (Polyfill? JS-Fallback per Preset?).
4. **Motion AI Kit vs. eigene Skills:** Kostenpflichtiges MCP mit MotionScore vs. Self-built-Skills. Für Senify vermutlich: eigene Skills + GSAP-Skills (frei) als Basis; Motion-AI-Kit optional zukaufen.
5. **3D-Asset-Pipeline & Budgets:** GLB-Größen, Draw-Call-Budgets, Poster-Erzeugung, LOD-Stufen — Querschnitt zu Ticket 15 (Media-Pipeline).
6. **„Awwwards-Level“-Messbarkeit:** Es gibt keinen öffentlichen Qualitäts-Eval für Agenten-Motion. Nötig: Senify-interne Golden-Sections + Review-Gate (Ticket 06/13).
7. **View Transitions in Firefox:** Timing offen; Presets müssen ohne VT genauso sauber degradieren. Ferner: iframe-Probleme (Kommentare bei CSS-Tricks) — in Vorschau-/Editor-Kontexten relevant.
8. **WebGPU-Verifikation:** Sekundärquellen behaupten universellen Support + Three.js-Produktionsreife (r171+). Vor Investition: offizielle Three.js-Notes/Browser-Supportdaten prüfen; für v1 ist WebGL ohnehin der sichere Default.
9. **DTCG-Motion-Tokens:** `duration`/`cubicBezier` existieren im Spec — wie elegant lassen sich Springs (die nicht als cubic-bezier darstellbar sind) als Token abbilden? Eigene Erweiterung oder `linear()`-String als Token-Wert nötig.

---

## 10. Quellenverzeichnis

**Offizielle Docs / Repos (Primär):**
1. GSAP ScrollTrigger Docs — https://gsap.com/docs/v3/Plugins/ScrollTrigger/
2. GSAP ScrollSmoother Docs — https://gsap.com/docs/v3/Plugins/ScrollSmoother/
3. GSAP SplitText Docs — https://gsap.com/docs/v3/Plugins/SplitText/
4. greensock/gsap-skills (offizielle Agent-Skills) — https://github.com/greensock/gsap-skills
5. GSAP ScrollTrigger Skill (Rohfassung) — https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-scrolltrigger/SKILL.md
6. GSAP Performance Skill (Rohfassung) — https://raw.githubusercontent.com/greensock/gsap-skills/main/skills/gsap-performance/SKILL.md
7. Motion — Startseite — https://motion.dev/
8. Motion Transitions Docs (Springs, Stagger, Orchestrierung) — https://motion.dev/docs/react-transitions
9. Motion Scroll Animations (Beispiele) — https://motion.dev/docs/react-scroll-animations
10. Motion AI Kit — https://motion.dev/ai-kit
11. Lenis README — https://github.com/darkroomengineering/lenis
12. Lenis Website — https://lenis.dev/
13. React Three Fiber — Scaling Performance — https://r3f.docs.pmnd.rs/advanced/scaling-performance
14. 14islands/r3f-scroll-rig — https://github.com/14islands/r3f-scroll-rig
15. MDN View Transition API — https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
16. Chrome for Developers — Cross-document view transitions — https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
17. shadcn/ui Registry Docs — https://ui.shadcn.com/docs/registry
18. W3C WCAG Technik C39 — https://www.w3.org/WAI/WCAG22/Techniques/css/C39
19. W3C Understanding WCAG 2.3.3 (Animation from Interactions) — https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions
20. DTCG Design Tokens Format Module 2025.10 — https://www.designtokens.org/tr/drafts/format/

**Vertiefende Artikel/Quellen (sekundär):**
21. CSS-Tricks — Cross-Document View Transitions: The Gotchas Nobody Mentions (Mai 2026) — https://css-tricks.com/cross-document-view-transitions-part-1/
22. Josh Comeau — Scroll-Driven Animations (Apr/Jun 2026) — https://www.joshwcomeau.com/animation/scroll-driven-animations/
23. web.dev — Interaction to Next Paint (INP) — https://web.dev/articles/inp
24. web.dev — Largest Contentful Paint (LCP) — https://web.dev/articles/lcp
25. web.dev — prefers-reduced-motion — https://web.dev/articles/prefers-reduced-motion
26. caniuse — Cross-document View Transitions — https://caniuse.com/cross-document-view-transitions
27. caniuse — Scroll-driven Animations — https://caniuse.com/wf-scroll-driven-animations
28. Mozilla Connect — Feature Request CSS Scroll-Driven Animations — https://connect.mozilla.org/t5/ideas/implement-css-scroll-driven-animations-animation-timeline/idi-p/116931
29. Codrops — From SplitText to MorphSVG (Mai 2025) — https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/
30. Codrops — Scroll-Revealed WebGL Gallery mit GSAP/Three.js/Astro/Barba (Feb 2026) — https://tympanus.net/codrops/2026/02/02/building-a-scroll-revealed-webgl-gallery-with-gsap-three-js-astro-and-barba-js/
31. JosephASG/codrops-cinematic-scroll-animations — https://github.com/JosephASG/codrops-cinematic-scroll-animations
32. ibelick/motion-primitives — https://github.com/ibelick/motion-primitives
33. Aceternity UI — https://ui.aceternity.com/
34. DavidHDev/react-bits — https://github.com/DavidHDev/react-bits
35. Framer Dictionary — Variant — https://www.framer.com/dictionary/variant
36. agenticskills.io — Taste Skill (design-taste-frontend) — https://agenticskills.io/skills/taste-skill
37. Lokale Skills (Referenz-Spezifikationen): `C:\Users\adini\.agents\skills\design-taste-frontend\SKILL.md`, `C:\Users\adini\.agents\skills\awwwards-motion\SKILL.md`
38. Spline — Exporting as Code — https://docs.spline.design/exporting-your-scene/web/exporting-as-code
39. Rive — Rive vs Lottie — https://rive.app/blog/rive-as-a-lottie-alternative
40. LottieFiles — LottieFiles or Rive (Mär 2026) — https://lottiefiles.com/blog/lottie-animations/lottiefiles-or-rive
41. Utsubo — WebGL & Three.js Site SEO (Mai 2026) — https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide
42. altersquare (Medium) — Three.js vs WebGPU 2026 (Mai 2026) — https://altersquare.medium.com/three-js-vs-webgpu-in-2026-what-changed-for-large-scale-construction-viewers-79a7ed8b0b34
43. vr.org — WebGPU Baseline 2026 / Three.js (Mai 2026) — https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default
