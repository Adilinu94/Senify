# Editor v2 - Motion-Authoring (Motion-Spec v2, Inspektor, Canvas)

Status: **M0-M5 + M4 Stufe 1 + M6 Scrub umgesetzt** (M0-M5 am 18.09., M4 Stufe 1 am 20.09.,
M6 Scrub am 21.09.) - Modell, Runtime/Bake, Inspektor, Play-Preview, Live-Modus, Guardrails
und der Scrub-Regler stehen; vom M6-Ausbau bewusst offen: freie Timeline, Page Transitions,
3D-Preset, Motion an VCs/Templates (je eigenes Ticket).
Herkunft: Papierpaket in `.scratch/motion-v2/` — `research.md`, `plan.md`, `plugin-analyse.md`, `preset-matrix.md`, `payload-spec.md`, `freeze-spec.md`, `adr-0006-entwurf.md` (18.09.2026)
Abhaengig von: 07 (Dokument-Modell), 13 (Save-Pipeline/Bake), 02 (Inspektor), 03 (Live-Modus)
Entscheidungen: ADR-0003 gilt weiter; F1-F7 vom 18.09.2026 (siehe unten)

## Ziel

Der v2-Editor kann Motion wie v1 (und damit Framer-Niveau): typisierte Motion-Specs pro
Knoten (Preset + Intensity + Tokens), Preview im Canvas, Emission im Bake. Kein freier
Motion-Code. Die v1-Runtime (GSAP/ScrollTrigger/SplitText/Lenis) wird wiederverwendet;
der v2-Rebuild hat sie beim Migrieren verloren (`migration.ts:58-91`).

**Kernbefund der Recherche:** Der komplette Stack existiert in v1 (ADR-0003, MotionSpec
`section-sdk/src/schema.ts:110-132`, 24 Presets, `renderer/src/motion.ts`, Ops
`setMotion`/`clearMotion`, Bake-Anbindung) - es fehlt die Wiedereingliederung ins
v2-Dokument plus Editor-Authoring. Details: `.scratch/motion-v2/research.md`.

## Richtungsentscheidungen (18.09.2026)

- **F1 Start:** nach Ticket-13-Rest (Bake steht), dann M0-M5 aus `plan.md`.
- **F2 Authoring:** Presets + Intensity (v1-Linie); freie Timeline bleibt M6-Option.
- **F3 Canvas:** Live-Modus (Ticket 03) + Play-Button im Design-Modus; ruhend als Default.
- **F4 Verankerung:** dieses Ticket + **ADR-0006** als erster M0-Schritt.
- **F5 Hosting:** GSAP/ScrollTrigger/SplitText/Lenis **self-hosted** statt CDN (M2).
- **F6 Site-Profile:** v1-Tabelle 1:1 (`clean`/`standard`/`showcase`, Default `standard`,
  Caps 3/7/10, Lenis aus/an/an, Pin 0/1/1, 3D nein/nein/ja; 3D bleibt M6).
- **F7 Profil-Durchsetzung:** M2 Lenis (Bake), harte Caps/Preset-Klassen in M5,
  Profil im Editor erst mit Site-Settings-Ticket (vor M3).

## Umsetzung M1 (18.09.2026)

- **Registry:** `packages/section-sdk/src/motion.ts` (24 Presets mit Flags, GSAP-Bedarf,
  Coverage); `MotionSpecSchema` um `reducedMotion`/`enabled` erweitert.
- **Editor:** `EditorNode.motion`, Patch `setNodeMotion` (`null` loescht), Ops
  `setMotion`/`clearMotion` mit `assertMotionSpec`, Transport (`persist.ts`), Consistency
  (`motion-preset-unknown`, `motion-pin-excess`), Migration traegt Motion, Canvas-Adapter
  reicht sie durch.
- **Engine:** v2-Ops in `editor-contract.ts`; Bridge mappt 1:1 auf die v1-Ops
  `setMotion`/`clearMotion`; `NodeSpecSchema` + `buildNode` tragen Motion (Undo restauriert
  Subtrees inklusive Motion).
- **Tests:** `section-sdk/test/motion.test.ts`, `renderer/test/motion-presets.test.ts`
  (Drift-Guard), Editor-Operations/Consistency/Persist/Migration, Engine-Bridge + Route.
- **Zahlen:** `pnpm test` 1135 gruen / 2 uebersprungen / 129 Dateien, typecheck 0, lint 0.
  Kein Commit.
- **Naechster Schritt:** M2 (Bake/Runtime), siehe `plan.md`.

## Umsetzung M2 (18.09.2026)

- **Self-hosted Runtime:** `gsap@3.15.0` + `lenis@1.3.26` als Dependencies des
  Renderers; der Bake kopiert `gsap.min.js`, `ScrollTrigger.min.js`, `SplitText.min.js`,
  `lenis.min.js` nach `assets/vendor/` und verlinkt sie seitenweise nur bei Bedarf
  (per-Preset-`needs` aus der Registry). Kein CDN-Request mehr.
- **`motion-data` v2:** `motionDataFor` schreibt `{ v: 2, breakpoints, entries }`;
  Eintraege tragen `hides`/`needs`/`reducedMotion`; Breakpoint-Queries aus
  `mediaMaxWidth` (eine Quelle). Der Leser akzeptiert weiter die v1-Liste.
- **FOUC-Pending:** `motionPends` (section-sdk) markiert Hiding-Presets;
  `SectionShell`/`PrimitiveNode` stempeln `data-motion-pending`, `Page.astro` liefert
  CSS + `<noscript>`-Override + 1,6-s-Failsafe, die Runtime gibt frei, sobald sie
  uebernimmt. `enabled: false` unterdrueckt Marker und Eintrag.
- **Reduced Motion:** pro Eintrag (`static`/`fade`/`off`) statt globalem Ausstieg;
  Lenis startet nur ohne RM.
- **Freeze:** Kill-Switch `__SENIFY_MOTION__ = "off"` in der Runtime; `visual.ts`
  setzt ihn per `addInitScript` (Option `motion: "off" | "live"`, Default off),
  erzwingt `scroll-behavior: auto` und wartet 2 rAF; Browser-Gegenprobe in
  `analysis-worker/test/visual.test.ts`.
- **Tests:** `motion.test.ts` (v2-Envelope, Flags, Disabled, Kill-Switch),
  `bake.test.ts` (lokale Vendor-Pfade, per-Seite-Skripte, Pending-Markup,
  Budget ≤ 150 KB), `motion-presets.test.ts` (Drift), `visual.test.ts` (Counterproof).
- **Zahlen:** `pnpm test` 1144 gruen / 2 uebersprungen / 129 Dateien, typecheck 0, lint 0.
  Kein Commit.
- **Naechster Schritt:** M3 (Inspektor-Tab) bzw. vorher Site-Settings-Ticket fuer das Profil.

## Umsetzung M3 (18.09.2026) - Inspektor & Agenten

- **Panel:** Der bestehende Motion-Abschnitt ist vollstaendig: Preset, Intensity (mit
  Profil-Cap als `max` + Hinweiszeile), Trigger, Delay, Easing (Theme-Eintraege),
  Dauer-Faktor, Stagger-Faktor, Reduced-Motion-Variante, Aktiv-Schalter; Presets ausserhalb
  des Profils sind markiert („· gesperrt"). Engine-Warnungen der Motion-Writes erscheinen
  inline (`motionNotice`).
- **Badge:** Explorer-Zeilen mit Motion-Spec tragen ein `M`-Badge.
- **Site-Profil:** Topbar-Select (Ticket 20) mit Wechsel-Validierung; `buildMotionPanel`
  liefert Profil + Cap + erlaubte Presets.
- **MCP:** neue Tools `set_motion` / `clear_motion` (eigene Tools, gleicher
  Mutations-Pfad wie `apply_mutations`).
- **Skill:** `packages/skills/skills/motion.md` (+ Router-Zeile) und der Portal-Guide
  `/guides/motion` (Presets, Spec, Profile, Guardrails, Workflow).
- **Tests:** Panels (+1), section-sdk (+2), Editor-Consistency (+1), Engine-Route (+3),
  MCP-Katalog, Skills/Guides, Browser (Panel-Controls + Profil-Select).
- **Zahlen:** `pnpm test` 1155 gruen / 2 uebersprungen / 130 Dateien, typecheck 0, lint 0.

## Umsetzung M4 Stufe 2 (18.09.2026) - Play-Preview im Canvas

- **Engine:** `GET /api/motion-vendor/:name` liefert die self-hosted Runtime-Dateien
  (dieselben wie der Bake; das lokale Programm proxyt `/api/` mit Operator-Token).
- **Editor:** Topbar-Schalter „Motion" (nur Design-Modus) injiziert in den aktiven Frame
  `motion-data` (aus `motionConfigsForTree` + `motionDataFor`), per-Preset-Vendor
  (GSAP/ScrollTrigger/SplitText) und die Runtime (`renderPageScript`, **Lenis aus**);
  Stoppen erzeugt die Frames neu und stellt den Baseline-Zustand her.
  `@senify/renderer/motion` ist der browser-sichere Export dafuer.
- **Tests:** Engine-Route (+2), Browser-Test (Play → Runtime-Script im Frame, `window.gsap`
  geladen, Stopp entfernt es).
- **Offen (Stufe 1):** Live-Modus mit echter Seite (Ticket 03) - dann laeuft die Release-
  Runtime ohne Extra-Code; Scrub-Slider bleibt M6.

## Umsetzung M4 Stufe 1 (20.09.2026) - Live-Modus im Umbau-Canvas

- **Live = die echte Seite:** Der Design/Live-Toggle (Ticket 03 Punkt 6) baut den Canvas
  auf **einen** Frame um: aktiver Breakpoint, echte Groesse (100 %), nativer Scroll,
  Editor-Chrome aus (`canvasFrameRules({ chrome: false })`), Klicks behalten das
  Seitenverhalten. Die Runtime wird beim Live-Mount injiziert - derselbe Vertrag wie im
  Bake, Lenis nach Site-Profil (F6/F7).
- **Eine Quelle:** `editor/src/motion-inject.ts` (neu) traegt `motion-data` v2, die
  self-hosted Vendor-Dateien und `renderPageScript`; der v1-Editor (`mount.ts`, Play +
  Live) und der Canvas rufen dieselbe Funktion, der Marker-Guard verhindert doppelte
  Injektion.
- **Tests:** `canvas/device.test.ts` (Live-Spec), `canvas/rules.test.ts` (Chrome aus),
  Browser-Test: Live-Klick → ein Frame mit `window.gsap` + `motion-data` + Runtime-Script,
  zurueck zu drei Blaettern. Zahlen im Ledger (20.09.).

## Umsetzung M5 (18.09.2026) - Guardrails & Agent-Experience

- **Harte Gates:** `hardGuardrailsForTree(tree, profile)` prueft zusaetzlich Intensity-Cap,
  Preset-Klassen, Pin-Budget und 3D; der Schreibpfad und `runChecks` (Submit/Publish)
  uebergeben das Site-Profil. Ohne Profil bleibt die generische Pin-Regel.
- **Weiche Hinweise:** `reveal-too-long` (> 0,8 s) als Bake-Warnung; `char-split-excess`
  wie bisher. LCP-Schutz strukturell ueber den Pending-Failsafe.
- **Paritaet:** Freeze-Baseline (M2) + Gegenprobe bleiben das Tor; Motion-Sampling ist M6.
- **Doku:** `senify-motion`-Skillpaket + Portal-Guide (siehe M3), ADR-0006 aktualisiert.
- **Tests:** Engine-Guardrails (+2), Renderer-Motion (+1).
- **Zahlen:** `pnpm test` 1155 gruen / 2 uebersprungen / 130 Dateien, typecheck 0, lint 0.

## Umsetzung M6 Scrub (21.09.2026) - Scrub-Regler im Live-Modus

- **Kern:** Der Live-Modus zeigt die echte Seite mit der Release-Runtime; ein Regler im Fuss
  (`input[data-action="scrub"]`) faehrt ihre Scroll-Position an — ScrollTrigger reagiert auf
  das ausgeloeste Scroll-Event, Pin-/Scrub-Presets sind ohne Mausrad pruefbar. Der Rueckweg
  fuehrt den Regler nach (Scroll-Listener je Frame in `bindFrame`); im Design-Modus ist er aus.
- **Mathematik:** `editor/src/canvas/scrub.ts` (`scrubOffset`/`scrubProgress`, begrenzt,
  NaN-fest); `dom.ts` kennt `documentElement`/`scrollHeight`/`clientHeight` (optional).
- **Tests:** `scrub.test.ts` +2; Browser-Rundlauf (Regler auf 100 % -> `scrollTop > 0`,
  Rueckweg auf 0, Design disabled).
- **Zahlen:** gesamt 1386 gruen / 2 uebersprungen / 152 Dateien, EXIT 0
  (`.scratch/testlauf-21-09-m6scrub.log`), typecheck 0, lint 0.
- **M6-Rest:** freie Timeline, Page Transitions, 3D-Preset, Motion an VCs/Templates — je
  eigenes Ticket.

## Umfang (Phasen aus plan.md)

- **M0 Papier:** ADR-0006 (Preset-Linie, MotionSpec v2, self-hosted, Freeze-Regel,
  RM-Pflicht).
- **M1 Modell:** `MotionSpecV2` (section-sdk, v1-kompatibel), `EditorNode.motion`,
  Patches/Ops `setMotion`/`clearMotion` + `assertMotionSpec`, Persistenz, Bridge v2->v1
  (durchreichen statt ablehnen), Consistency (`pin-excess`, `reduced-motion-missing`,
  `motion-preset-unknown`), Migration rettet `motion`, Canvas-Adapter.
- **M2 Runtime/Bake:** self-hosted Assets, `motion-data` aus einer Quelle,
  Freeze-Protokoll fuers Paritaets-Tor, Golden-Tests, Bundle <= 150 KB.
- **M3 Inspektor:** Motion-Tab (Preset-Picker A-G, Intensity-Dial, Trigger, Tokens,
  RM-Variante), Motion-Badge am Knoten, MCP `set_motion`/`clear_motion`,
  `senify-motion`-Skillpaket.
- **M4 Canvas:** Live-Modus echt; Play-Button (Stufe 2); Scrub-Slider optional (Stufe 3);
  Lenis im Editor-Canvas aus.
- **M5 Guardrails:** harte Publish-Gates (max 1 Pin/Seite, max 2 Parallax-Layer,
  RM-Pflicht, LCP-Schutz), weiche Review-Hinweise.

## Abnahme (Kurzform; Details in `plan.md`)

- Sektion per Inspektor animieren -> Publish zeigt identische Animation (Freeze-Paritaet).
- Agent kann dasselbe per MCP (`set_motion`).
- v1-Bestandsdokument migriert mit `motion` statt es zu verlieren.
- Guardrail-Verstoss blockiert Publish nachweislich; RM-Variante ist Pflichtfeld.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Nicht-Ziele

- Kein freier Motion-Code, kein zweites Regel-Register, keine SPA-Morphs/Page-Transitions
  (M6), kein 3D-Umbau.
