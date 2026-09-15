# Research 29: site-clone (cth9191) — Learnings für die Referenzen-Pipeline

> Deep-Dive am 15.09.2026 · Repo: `Repos/site-clone` (Shallow-Clone, MIT — außer vendored Engine).
> Auftrag (Nutzer): „Kannst du diese Repo nutzen um die Referenzen zu erstellen: https://github.com/cth9191/site-clone — Bitte clonen und genau analysieren."
> Zweck: Konkrete Umsetzungsbasis für **T14 (Referenzen-Tab)** und Querschnitts-Anleihen für Screenshot-QA (T07), Token-/Theme-Ableitung (T04) und den Analyse-Worker (Spec `analysis-worker`).

## 1. Was das Repo ist

Eine **Skill-Suite für Claude Code** (4 Skills, `cp -r skills/* ~/.claude/skills/`), die eine Live-Website per Browser misst und daraus einen verifizierten Neuaufbau macht:

```
/clone-site <url>  →  verifizierter Klon  →  /remix-site <dir>  →  eigenes Re-Skin
     ├─ dom-clone       (DOM/CSS-Track, intern)
     └─ shader-extract  (GPU/WebGL-Track, intern; wraps web-shader-extractor MIT)
```

**Kernbehauptung des Repos — und für uns am wichtigsten:** Der Unterschied zwischen „pixel-perfect" und „AI slop" ist fast vollständig die Frage, ob Werte **gemessen** oder **geschätzt** wurden. Deshalb: Runtime-Objekte befragen (`ScrollTrigger.getAll()`, `getComputedStyle()`, `document.getAnimations()`), statt minifizierte Bundles zu paraphrasieren. „A minified GSAP config is unreadable as text; `ScrollTrigger.getAll()` hands you start/end/scrub/pin verbatim."

Zweiter Kern: **Routing nach Material** — eine moderne Site ist „two different materials welded together": DOM/CSS (misst `getComputedStyle`) und GPU-Canvas (dafür blind → eigener Track). Falsches Routing = leere Box, wo das Beste der Site war.

## 2. Die drei Probe-Scripts (das Herzstück — direkt für unseren `analysis-worker`)

### 2.1 `surface-map.js` — Material-Router

- **Instrumentierter Modus:** `instrumentGetContext()` als **Init-Script vor den Page-Scripts** patcht `HTMLCanvasElement.prototype.getContext` → zeichnet auf, welcher Kontext-Typ **tatsächlich angefordert** wurde (Grundwahrheit). Auch `transferControlToOffscreen` wird geflaggt.
- **Post-hoc-Modus:** Probe webgl2 → webgl → webgpu → 2d in dieser Reihenfolge (getContext gibt bei passendem Typ den **bestehenden** Kontext zurück, sonst null → clobbert nicht). WebGL2 **vor** WebGL, weil WebGL2RenderingContext kein instanceof von WebGLRenderingContext ist. Cross-Realm-Fallback über Constructor-Name (Iframes!).
- Erkennt: Canvas-Surfaces (mit `coveragePct`, `fullscreenHero`, `zIndex`, `pointerEvents`), **Video-Surfaces** („looks generative may just be a looping muted video" → re-embed statt nachbauen), iframe-Canvas (same-origin rekursiv mit Offset; cross-origin als `IFRAME_OPAQUE` markiert — bewusst nicht stillschweigend leer), **animierte SVGs** (SMIL/`animate`) — sollen nicht als Standbild eingefroren werden.
- **Scroll-Fingerprints:** Lenis/Locomotive-Marker, CSS-Scroll-Timeline-Erkennung, Scroll-Snap.
- **Lazy-GPU-Warnung:** Plattform-Global (three/Unicorn/Spline/Rive) ohne lebende GPU-Canvas ⇒ „likely lazy/interaction-gated — scroll/interact und neu scannen", NICHT „pure DOM" schlussfolgern.
- `isCanvasAnimating(selector, ms)`: Pixel-Hash-Vergleich über ~500 ms → unterscheidet laufenden Shader von einmaligem Paint (Readback-Block meldet sich als `unknown-readback-blocked`).

### 2.2 `motion-probe.js` — Motion-Runtime-Extraktor

- **Instrumentiert** (`instrumentMotion()` preload): IntersectionObserver-Registrierungen (sonst nicht enumerierbar!) + beobachtete Targets, rAF-Zähler, echte globale Listener (scroll/wheel/mousemove/pointermove/touchmove/resize/mouseenter/mouseleave/keydown) auf window/document, MutationObserver-Zähler.
- **Post-hoc:** GSAP-Global → alle Tweens/Timelines der `globalTimeline` (Targets, duration, delay, repeat, vars — serialisiert mit DOM-Node-/Funktions-Schutz) + **`ScrollTrigger.getAll()`** komplett (trigger, pin, start, end, scrub, markers, snap, toggleActions, pinSpacing, animationTargets, progress).
- **Bundled-GSAP-Fall** (Next/Vite): kein `window.gsap`, aber `window.gsapVersions` + `_gsap`-Stamps auf Elementen + `.pin-spacer`-Anzahl → wenigstens „was wird animiert + wie viele Pins" (mit Hinweis: Params per Instrumentierung/Bundle-Grep).
- WAAPI: `document.getAnimations()` mit Keyframes; **Timeline-Typ** erkannt (ScrollTimeline/ViewTimeline = scroll-driven). CSSOM: `@keyframes`-Inventar + scroll-timeline-Regeln. Transitions-Inventar (Property/Duration/Easing + Beispiel-Selektor + Zählung, Top 40).
- Lenis/Locomotive-Optionen verbatim; Slider-Params (Swiper/Splide/Flickity/Embla + CSS-Marquee-Fallback); SplitText-Wrapper (`.char/.word/.line` → Container).
- **Library-/Plattform-Fingerprints:** GSAP, Lenis, Swiper, THREE, lottie, Rive, AOS, jQuery + Frameworks: React/Vue/Webflow/**Framer**/WordPress/Unicorn Studio/Spline — plus `summary.animationStack` (Ein-Zeiler „was bewegt diese Seite") und `inputDrivers` + `ioCount`.
- `motionSummary()`: konsole-sichere Kurzfassung (<4 KB) für den ersten Blick; Voll-JSON immer auf Platte („never dump it into the conversation").

### 2.3 `tokens-probe.js` — Design-System aus Computed Styles

- **Frequenz-gerankt** (min 2 Vorkommen, Top 40): „A CSS file has every value the site ever declared; the computed DOM has the values that actually paint. **Frequency separates the system from the one-offs.**" ← Unser Extraktions-Prinzip in einem Satz.
- Erfasst: Farben (Text nur auf Text-Elementen gezählt; bg/border getrennt), Gradients, Fonts (family+weight), **Type-Scale** (size/line-height/weight als Tupel), Line-Heights, Letter-Spacing, Spacing-Rhythmus (paddings/margins/gaps einzeln), Radii, Shadows, Filters/Backdrop-Filters, Blend-Modes, zIndex+position, Max-Widths; Body-/Heading-/(h1–p)-Ankerwerte; Button- und Link-Inventar (dedupte Signatur, max 8).
- **@font-face-Quellen + geladene Fonts** (`document.fonts`) + `fontLinks` (Google/Typekit/Bunny) + Breakpoints aus Media-Rules; **`:root`-Custom-Props** (eigenes Token-Vokabular der Site!); Section-Map (Selektor, top, height, background) + Fixed/Sticky-Chrome.
- Läuft **pro Breakpoint** (1440/768/390) — „the type scale and spacing change; the palette usually doesn't".
- `data-where`: bis zu 3 Beispiel-Selektoren je Wert (Belegstellen!).

## 3. Evidenz-System & TEARDOWN (Vorlage für unser Design-Profil)

- Jede Behauptung trägt **CONFIRMED** (aus Runtime-Objekt/Computed Style gelesen) · **OBSERVED** (im Sweep gesehen, Mechanismus nicht exponiert) · **INFERRED** (aus Markup/Klassen geraten).
- **Regel: „Never upgrade a tag."** Ein Klon auf CONFIRMED-Werten braucht den Diff-Pass nur gegen Tippfehler; einer auf INFERRED muss erst beweisen.
- TEARDOWN.md-Struktur: Stack (Tabelle mit Evidenz-Spalte) · Design-System (Palette/Type-Scale/Spacing/Radii/Shadows/Breakpoints/Custom-Props) · Effects-Tabelle (je Effekt: Mechanismus + Tag + Komplexität) · Reveals im Detail („What it looks like / What it is / Exact params / Rebuild note") · Assets (mit Tier-Labels) · Build-Plan.
- **Common-Reveals-Cheat-Sheet (15 Muster):** Image-Sequence on scroll/mouse · SplitText · Parallax-Layer · Scrub · Pinned Section · CSS-var-driven · Smooth Scroll (Lenis lerp) · Page-Transitions (barba/Swup) · Grain · Custom Cursor · Marquee · Magnetic Button · Reveal-on-scroll (IO) · Theme-Flip · Scramble/Counter. → **Mappen 1:1 auf unseren Preset-Katalog (03):** SplitText→`masked-headline`, Pinned→`scrub-pin`/`sticky-stack`, Marquee→`marquee`, Magnetic→`magnetic-button`, Cursor→`cursor-glow`, Grain→`grain`, Reveal→`scroll-reveal`/`fade-up`, Counter→`counter`, Smooth Scroll→Lenis-Detection, Theme-Flip → außerhalb v1-Katalog (notieren).

## 4. Tokenize & Theme-Ableitung (`remix-site` Phase 0)

- `tokenize-css.js`: misst Tokens → schreibt Stylesheet-Literale auf `var(--rx-<role>, <original>)` um. **Verifiziert mit 0.000 % Round-Trip-Diff** („jeder Knopf ist gratis").
- Detail-Lektionen: Farb-Normalisierung über alle Schreibweisen (hex kurz/lang, rgb()/rgba(), Komma **und** Space-Syntax, case-insensitiv); Rewrite **nur in Deklarationsblöcken — nie in Selektoren** (Tailwind-arbitrary-value-Klassen tragen dasselbe Literal im Selektor!); `url()` und `@font-face` **geschützt**; site-eigene Custom-Props werden **nicht** überschrieben, sondern unter eigenem Namen als Knobs geführt („keep the site's vocabulary"); Rollen-Heuristik (Body-Fg → `--rx-color-text`, Body-Bg → `--rx-color-bg`, Rest gerankt).
- Motion/Shader ebenfalls über Config hoisten (`window.__remix.motion` / `.shaders`) — „the one code change; everything after is data".
- Knob-Liste (`knobs.json`: id, group, type, default, min/max/step, uses, where/native) → Basis für Directions + Tweak-Panel.

## 5. Re-Skin & Directions (Schutzregeln-Material)

- **Re-Skin ist Pflicht, bevor etwas „fertig" ist** („no remix leaves with the original's logo, copy, people, product imagery, or licensed fonts").
- Copy: Form behalten (±20 % Headline-Länge, sonst reflowt das Layout); Brand in die Slots; **dekorative Assets** dürfen generiert werden (Komposition als Brief — Aspekt, Platzierung, Mood), **Identität nie** (Logo/People/Product-Shots → ersetzen); **Lizenz-Fonts → metrik-kompatible Open-Paare** („the clone will happily download them for local study; that is not a license to redistribute"); Analytics/Endpoints scrubbed.
- Directions: genau **3** Richtungen („five converge; three deliberately different forks give a real choice"), jede muss auf **≥3 Forks** abweichen (Palette-Mood, Type-Pairing, Hero-Treatment, Density, Motion-Personality, Surface); jede Richtung ist **Daten + optionaler Patch** unter `:root[data-rx="<slug>"]` (additiv & scoped — nie die Basis editieren); Galerie mit **echten Iframes nebeneinander**, Click-through, Pick-Button; Tweak-Panel: **10–15** relevante Knobs, Permalink über `#rx=`, dev-only.
- Für uns: Directions sind v1 **nicht** Scope, aber die **Overrides-Datei-Idee** ist das saubere Muster für unsere Skalen-Zuordnung (pro Skala eine Referenz → gescopte Overrides) und ein naheliegender v2-Kandidat („3 Richtungen vorschlagen").

## 6. QA-Harness (`examples/qa-diff.mjs`) — für Approval-Screenshots & Checks

- Playwright + pixelmatch; **1440/768/390**; GPU-Canvases **maskiert**; Diff **per Viewport-Slice (900 px)** → „the report says *where* it's wrong (`y=19800 16%`), not just that it is" + **Section-Höhen zuerst vergleichen** (Null-Delta lokalisiert Rest-Diff auf Verhalten, nicht Layout).
- **Motion einfrieren per CSS-Injection** (`animation-play-state: paused`, `transition: none`), **nicht** per `reducedMotion: 'reduce'` — das ändert das JS-Verhalten des Originals → Phantom-Diffs.
- Lazy-Content-Settle: einmal durchscrollen, zurück, warten. Thresholds statt Null-Diff (`threshold: 0.2`, `includeAA: false`).
- README-Lektionen: `networkidle` hängt gegen Vite (HMR); Init-Scripts sind in Playwright function-scoped → Probes **auf `window` exportieren** (`build-bundle.js` macht das); Scroll-Trigger werden stale bei Lazy-Image-Layout-Shifts → bei Document-Height-Änderung refreshen; SPA rendert nur den aktiven Tab → durchklicken; CSS-Variable-Driver (`color-mix(... var(--progress))`) prüfen, bevor man Class-Toggles annimmt; konditionale Effect-Wrapper → Mount muss visuell inert sein, sonst leere Box.

## 7. Übernahme-Tabelle für Senify

| site-clone-Baustein | Senify-Ziel | Übernahme-Art |
|---|---|---|
| `tokens-probe.js` (+ `build-bundle.js`-Injection) | `analysis-worker` → Design-Profil `profile.tokens` | **Adaptieren** (MIT; 810 statt 768 als Tablet-Breite; Daten in unser Profil-JSON überführen) |
| `motion-probe.js` (+ `instrumentMotion`) | `analysis-worker` → Motion-Sampling + Preset-Mapping (Common-Reveals → 03-Katalog) | **Adaptieren** |
| `surface-map.js` (+ `instrumentGetContext`) | `analysis-worker` → GPU-Erkennung (`webgl-scene`-Hinweise), Video/SVG-Handling | **Adaptieren** |
| Evidenz-Tags CONFIRMED/OBSERVED/INFERRED + „never upgrade" | Design-Profil `evidence[].confidence` (statt generischem Prozent) | **1:1 übernehmen** (konzeptionell) |
| TEARDOWN-Struktur + Common-Reveals-Cheat-Sheet | Stil-Blatt (`styleBrief`) + `rules/constants/never` + Motion-Rezepte für `get_reference` | **Als Vorlage** |
| `tokenize-css.js` (Rollen, Frequenz, Selektoren-Schutz, 0-%-Round-Trip) | Theme-Ableitung Profil → Senify-Theme (07) + QA „Theme anwenden ändert nichts" | **Als Referenz** (unsere Skalen-Engine generiert; Verify-Prinzip übernehmen) |
| `qa-diff.mjs` (Slices, Masken, CSS-Freeze, Section-Heights-first) | Approval-Screenshots (06/07) + Publish-Checks (13) | **Adaptieren** |
| Re-Skin-Guardrails (Fonts-Lizenz, Identity, ±20 % Copy) | Schutzregeln (28 §5) + Skill-Repair-Hinweise (11) | **Schärfen** (Lizenz-Font-Swap explizit aufnehmen) |
| Directions/Overrides-Muster (`:root[data-rx]`, gescopte Patches) | Skalen-Zuordnung (28 §3); v2-Kandidat „3 Richtungen" | **Anleihe** |

**Was wir NICHT übernehmen:** Fidelity-Fast-Path (HTML+CSS kopieren) und Component-Rebuild als Klon-Ziele — Senify baut kuratierte Sektionen, keine Vollklone. Der Referenzen-Tab übernimmt **Analyse → Profil → Stil**, nicht den Rebuild. Rebuild-Artefakte (TEARDOWN) dienen uns nur als Analyse-Format.

## 8. Erkenntnis-Deltas zu Artefakt 28 (Referenzen-Tab)

1. **Evidence-Stufen konkretisieren:** `evidence[].confidence` = `confirmed | observed | inferred` (statt vager Skala), plus „never upgrade"-Regel im Profil-Datenmodell.
2. **Motion-Rezepte ergänzen:** Das Profil liefert nicht nur Tokens/Komponenten/Regeln, sondern ein **Reveal-/Effekt-Inventar mit exakten Runtime-Params** und mappt es auf unsere Presets (Cluster → Empfehlung für `motion.preset`/Intensity). `get_reference` gibt das als maschinenlesbaren Brief.
3. **Token-Extraktion = Frequenz-Prinzip + Belegstellen:** Jeder Wert im Profil trägt `uses` (Häufigkeit) + Beispiel-Selektoren — deckt sich mit unserem `evidence[]`-Anspruch und macht „Warum dieser Wert?" beantwortbar.
4. **`:root`-Custom-Props der Referenz behalten:** Wenn die Referenz eigene Token-Namen hat, übernehmen wir ihre Struktur als Mapping-Hinweis (nicht Namen übernehmen, aber die Rollen erkennen).
5. **Fallback-Ausbau:** Blockierte Seiten → nicht nur Screenshot-Upload, auch der Post-hoc-Modus (ohne Preload) bleibt brauchbar (dokumentieren, was fehlt: IO/Listener-Inventar).
6. **QA-Querschnitt:** Der Screenshot-Diff im Approval (06) bekommt Slices + Section-Heights-first + CSS-Freeze-Injection; das ist konkret implementierbar statt nur beschrieben.

## 9. Quellen im Repo

- `skills/clone-site/SKILL.md` · `scripts/{surface-map,motion-probe,tokens-probe,build-bundle}.js` · `references/teardown.md`, `visual-qa.md`, `fidelity-fast-path.md`, `compositing.md`, `playwright-cli-recipes.md`
- `skills/dom-clone/SKILL.md` · `references/asset-resolution.md`, `interaction-fingerprints.md`
- `skills/remix-site/SKILL.md` · `scripts/{tokenize-css,apply-overrides,gallery,tweak-panel}.js` · `references/{reskin,directions,tweak-panel}.md`
- `skills/shader-extract/` (vendored `web-shader-extractor`, MIT) · `examples/qa-diff.mjs`, `examples/*-teardown.md`
- Lizenz: MIT (Repo) — Adaption mit Attribution möglich.

## 10. Anschlüsse

| Bereich | Ticket/Datei |
|---|---|
| Referenzen-Tab (Pipeline, Profil, Evidenz) | T14 (`/to-tickets`) · `artifacts/28` |
| Approval-/Check-Screenshot-Harness | T07 · `artifacts/06`, `artifacts/13` |
| Theme-Ableitung + Round-Trip-Verifikation | T04 · `artifacts/07` |
| Skillpaket-Material (Reveals, Maintenance-Hinweise) | T06/T15 · `artifacts/11` |
| v2-Kandidat „3 Richtungen" (Directions-Muster) | Map „Out of scope"-Nachtrag |
