# Motion & Animation im Editor v2 — Recherche

> Auftrag: Wie lassen sich Framer-like Animationen bzw. GSAP/Lenis in den Editor aufnehmen?
> Stand: 18.09.2026 · Quellen: Web-Recherche + Codebase (Arbeitsbaum, uncommittet).
> Plan: siehe `plan.md` im selben Ordner.

## 1. Kurzbefund

**Die halbe Mauer steht schon.** Senify v1 hat den kompletten Motion-Stack gebaut und belegt:
ADR-0003 (GSAP + ScrollTrigger als Choreografie-Kern), MotionSpec, 24 Presets (Kategorien A–G),
die Runtime `renderPageScript` (GSAP/ScrollTrigger/SplitText/Lenis), Guardrails
(Pin-Budget, Char-Split-Budget) und die Bake-Anbindung (Motion-Configs als JSON + Page-Script).

Der Editor-v2-Umbau hat davon **nichts mitgenommen**: `migrateV1ToV2` verwirft `motion`
(`packages/editor/src/state/migration.ts:58-91`), `EditorNode` kennt kein Motion-Feld
(`packages/editor/src/state/document.ts:33-47`), und kein Ticket 01–18 behandelt das Thema
(`.scratch/editor-v2-rebuild/issues/`). Der Aufwand ist deshalb primär **Wiedereingliederung
plus Editor-Authoring** — keine Neuentwicklung der Engine.

## 2. Externer Stand

### 2.1 GSAP — frei, etabliert, bleibt die richtige Wahl

- **GSAP ist seit der Webflow-Uebernahme (2024, Ankuendigung Apr 2025) zu 100 % kostenlos —
  inklusive aller Bonus-Plugins und kommerzieller Nutzung** (ScrollTrigger, SplitText,
  ScrollSmoother, MorphSVG, DrawSVG, MotionPath, …). Beleg: <https://gsap.com/pricing/>
  („GSAP is now 100% free for all users, thanks to Webflow's support"), Webflow-Blog,
  css-tricks (Mai 2025).
- Version 3.13; SplitText wurde Juni 2026 neu geschrieben (~50 % kleiner, Accessibility).
- **Konsequenz:** Die einzige verbleibende „Lizenz-Frage" bei GSAP ist beantwortet. Der
  CDN-Bezug in v1 (`packages/renderer/src/motion.ts:121-127`, jsdelivr) ist moeglich, aber
  **self-hosted** ist die bessere Wahl (keine externen Requests, DSGVO, Versionierung,
  Offline-Bake).

### 2.2 Lenis — Smooth Scroll, MIT, GSAP-Standardpattern

- MIT-lizenziert, ~10 KB, darkroomengineering/lenis. v1 nutzt Lenis 1.1.18 per CDN
  (`motion.ts:126-127`), Standard AN, Mobile aus (`artifacts/03-motion-3d.md:9`).
- Offizielles GSAP-Sync-Pattern (Lenis-README):

  ```js
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);
  ```

  v1 implementiert exakt dieses Muster (`motion.ts:129-135`).
- Grenzen (v1 dokumentiert, `artifacts/03-motion-3d.md:104`): kein CSS-Scroll-Snap,
  iframe-Wheel-Events werden nicht weitergegeben (relevant fuer Editor-Canvas!), Safari
  FPS-Cap, Mobile aus.

### 2.3 CSS Scroll-Driven Animations — noch nicht Baseline

- Chrome/Edge 115+ (Juli 2023), Safari 26 (Sept. 2025, Threading ab 26.4). **Firefox ist
  weiterhin nicht default** (Flag `layout.css.scroll-driven-animations.enabled`; Caniuse
  Stand 2026: Firefox 155–157 „Not supported"). Damit **nicht Baseline**, ~82–85 % globale
  Abdeckung. Quellen: caniuse.com `wf-scroll-driven-animations`, web.dev Interop 2026.
- Bedeutung fuer Senify: `animation-timeline: scroll()/view()` bleibt **progressives
  Enhancement**, nie exklusiv — genau die v1-Linie („Baseline-Qualitaet ohne Motion",
  `artifacts/03-motion-3d.md:94,102,127`).

### 2.4 Motion (React/Framer Motion) — nur fuer State-UI

- `motion.dev` (ehem. Framer Motion): React-first, ~119 KB min vs. GSAP ~69 KB min;
  Scroll-Pinning/Scrub bleibt GSAP-Territorium (eigener Vergleich: motion.dev/docs/gsap-vs-motion).
- ADR-0003 hat das bereits entschieden: **Motion fuer Zustand (Modals, Tabs, Accordion),
  GSAP fuer Scroll-Choreografie** (`docs/adr/0003-gsap-als-choreografie-kern.md:5`).
  Im ausgelieferten Bake gibt es ohnehin kein React fuer Content — Islands sind Vanilla-JS
  (`packages/renderer/src/motion.ts:269-378`).

### 2.5 Wie Framer und Webflow es machen (Authoring-Lehre)

- **Webflow Interactions (IX2):** Trigger (Page load, Scroll, Hover, Click, Viewport) +
  Actions/Timelines auf Ziel-Elemente; seit der GSAP-Uebernahme laufen die neuen
  „Interactions with GSAP" direkt auf GSAP. Kein freier Code im Designer.
- **Framer:** drei Bausteine — Appear Effects (Entry), Scroll Sections/Effects
  (scroll-gebunden), Variants + Component Transitions (State). Alles Preset-/Panel-basiert,
  kein Timeline-Code.
- **Lehre fuer Senify:** Das Preset-/Spec-Modell von v1 entspricht dem Industriestandard
  fuer Builder. „Framer-like" heisst nicht „freie Timeline", sondern **gute Presets +
  sofortige Vorschau + State-Kopplung**. Eine freie Timeline ist ein Ausbau, kein Muss.

## 3. Codebase-Befund

### 3.1 Was v1 hat (Fundstuecke, wiederverwendbar)

| Baustein | Ort | Zustand |
|---|---|---|
| Entscheidung | `docs/adr/0003-gsap-als-choreografie-kern.md` | accepted 14.09.2026 |
| Motion-Spec-Schema | `packages/section-sdk/src/schema.ts:110-132` (`preset`, `intensity` 1–10, `tokens`, `trigger`, `delay`) | vorhanden |
| Node-Feld | `packages/section-sdk/src/types.ts:36` (`Node.motion?`) | vorhanden |
| Preset-Katalog (24, A–G) | `.scratch/senify-v1/artifacts/03-motion-3d.md:16-47` | beschrieben |
| Config-Ableitung + Guardrails | `packages/renderer/src/motion.ts:58-119` (`motionConfigsForTree`, pin-excess, char-split-excess) | vorhanden |
| Runtime (GSAP/ST/SplitText/Lenis) | `packages/renderer/src/motion.ts:121-266` (`renderPageScript`) | vorhanden, CDN |
| Islands (Menue, Accordion, Slider, …) | `packages/renderer/src/motion.ts:269-378`, `islands.ts:16-59` | vorhanden |
| Engine-Ops | `packages/engine/src/mutations/contract.ts:224-239` (`setMotion`/`clearMotion`) | vorhanden |
| v1-Editor-Panel | `packages/editor/src/mount.ts:1210` (`buildMotionPanel`) | v1-Welt |
| Bake-Anbindung | `packages/renderer/astro-template/src/layouts/Page.astro:51-63` (`motion-data` + Skripte) | vorhanden |

### 3.2 Was v2 verloren hat

- **Migration:** `migration.ts:58-91` kopiert `props`, `children`, `slots`, `locked`, `hidden` —
  `motion` faellt weg. Bestands-Sites verlieren ihre Animationen beim v2-Umstieg.
- **Dokument-Modell:** `EditorNode` (`document.ts:33-47`) hat kein Motion-Feld; `DocumentPatch`
  (`patches.ts:23-49`) keinen Motion-Patch.
- **Transport:** `EditorNodeSpecSchema` (`packages/engine/src/mutations/editor-contract.ts:56-67`)
  und `nodeSpec` (`packages/editor/src/state/persist.ts:130-139`) tragen kein Motion.
- **Canvas:** Der v2-Adapter (`packages/editor/src/canvas/adapter.ts:19-40`) erzeugt
  SectionTree-Knoten ohne `motion`.
- **Plan:** Kein Ticket 01–18; der einzige vorbereitete Kanal ist O13/ADR-0005
  (`rawCss` nur `@keyframes`, offenes CSS fuer `transition`/`animation`).

### 3.3 Was v2 schon kann (Andockpunkte)

- **Pseudo-States:** `EditorNode.states` (`document.ts:41`), Compiler `compile.ts:422-445`,
  Forced-State-Preview im Canvas (`state-preview.ts`, `canvas.ts:85-91,189-202`). Schreib-Ops
  und UI fehlen (Ticket 02).
- **Keyframes:** `StyleRule.rawCss` (`style-rule.ts:93`), Pruefung `isSafeRawCss`
  (`value-grammar.ts:373`), Emission `compile.ts:554-559` — UI/Op fehlen.
- **Transitions/Animation als CSS-Properties:** `transition` in `STYLE_PROPERTIES`
  (`properties.ts:133`); alles Weitere laeuft durch den Open-Space-Pass
  (`properties.ts:492-535`).
- **Live-Modus geplant:** Ticket 03 (`issues/03-editor-chrome.md:21,33`, Design/Live-Toggle,
  nativer Scroll) — der natuerliche Ort fuer echte Motion-Vorschau.
- **UI-Plan hat die Inhalt-Animation schon skizziert:** `ui-plan.md:787-790`
  (Standard 600 ms, ms/s, Wiederholungsregeln) — aber in keinem Ticket verortet.

### 3.4 Zahlen

- `page.js` (Motion inkl. Lenis) heute: **6.444 B**; `islands.js` 3.669 B; `forms.js` 2.003 B
  (`renderer/bake.ts:436-448`). Prototyp-Messung v1: **129 KB** Motion-Bundle inkl. GSAP
  (`.scratch/senify-v1/issues/20-prototype-scroll-3d-choreografie.md:30-41`); Budget ≤ ~150 KB
  (`artifacts/03-motion-3d.md:86`).
- Editor-Bundle (~2,49 MB / 466 KiB gzip) ist vom Release getrennt — Motion-Runtime im
  Editor-Canvas belastet das Release nicht.
- v1-Runtime deckt **13 von 24** Presets im Page-Script ab (`PAGE_SCRIPT_PRESETS`,
  `motion.ts:3-17`); der Rest laeuft als Warnung `unimplemented-preset` oder ueber Islands.

## 4. Spannungen & Risiken

1. **Paritaets-Tor vs. Animation.** Der Pixelvergleich Canvas/Bake (Ticket 13) braucht
   deterministische Screenshots — laufende Animationen und Lenis machen sie flaky.
   v1 hat das Muster „Motion einfrieren" (`.scratch/senify-v1-build/issues/07`), v2 braucht
   ein explizites Freeze-Protokoll.
2. **Zwei Runtime-Orte.** Canvas-Preview und Bake duerfen nicht auseinanderdriften; die
   Config-Ableitung (`motionConfigsForTree`) und das Runtime-Modul muessen geteilt werden.
3. **Editor-Performance.** Drei Breakpoint-iframes; GSAP duerfte nur im Play-/Live-Modus
   laden, nur im aktiven Frame, ein rAF-Loop.
4. **Lenis im iframe.** Wheel-Events werden nicht weitergereicht (Lenis-Limit) — Lenis im
   Editor-Canvas deshalb aus, nur Release/Live.
5. **Firefox-Luecke.** CSS-Scroll-Timelines nie exklusiv; GSAP-Fallback bleibt Pflicht.
6. **Preset-Abdeckung.** 13/24 im Page-Script; D/E/F/G brauchen Islands/3D (separat).
7. **Reduced Motion.** ADR-0003/Artefakt verlangen RM-Pflicht (WCAG 2.3.3), der
   editor-v2-Plan klammert A11y bisher aus (E3) — RM muss hartes Gate werden, nicht Option.
8. **LCP.** Hero nie hinter `opacity: 0` ohne Fallback (Chromium disqualifiziert
   LCP-Kandidaten, `artifacts/03-motion-3d.md:83`).
9. **v1-Bestandsdaten.** Sites mit `motion` verlieren sie heute bei der Migration.

## 5. Quellen

- GSAP Pricing (frei, alle Plugins, Commercial): <https://gsap.com/pricing/>
- Webflow-Blog „GSAP becomes free": <https://webflow.com/blog/gsap-becomes-free>
- CSS-Tricks: <https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/>
- Lenis README (MIT, GSAP-Sync-Pattern): <https://github.com/darkroomengineering/lenis>
- Caniuse Scroll-Driven Animations: <https://caniuse.com/wf-scroll-driven-animations>
- MDN Scroll-driven animation timelines:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines>
- Motion vs. GSAP: <https://motion.dev/docs/gsap-vs-motion>
- Webflow Interactions (Trigger/Actions): Webflow Help „Actions and animations in
  Interactions with GSAP"; Klyra „What is IX2"
- Framer Scroll/Appear: <https://www.framer.com/academy/lessons/scroll-animations>
- Repo-intern: `docs/adr/0003-*.md`, `.scratch/senify-v1/artifacts/03-motion-3d.md`,
  `.scratch/senify-v1/issues/20-*.md`, `packages/renderer/src/motion.ts`,
  `packages/section-sdk/src/schema.ts`, `packages/editor/src/state/migration.ts`
