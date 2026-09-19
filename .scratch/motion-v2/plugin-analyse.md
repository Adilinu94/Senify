# Adoptionen aus dem Elementor-Plugin `wp-gsap-heading-reveal`

> Analyse vom 18.09.2026. Quelle: `C:\Users\adini\Local Sites\hcm\app\public\wp-content\plugins\wp-gsap-heading-reveal`
> Ziel: Was uebernehmen wir in den Motion-Plan (`.scratch/motion-v2/plan.md`, Ticket 19, M1-M5)?
> Vorgehen: Drei parallele Analysen (PHP-Architektur, JS-Runtime, Doku/Tests), Belege als Datei:Zeile.

## 1. Kurzprofil

- **~30 GSAP-Effekte** in vier Gruppen: Text (15), Bild (7), Container/Scroll (6), Interaktion (2),
  dazu 6 eigene Widgets (Marquee, SplitHero, StackingCards, Odometer, FlipGallery, ScrollSequence).
- **GSAP 3.15.0 self-hosted** (`includes/Assets.php:27`), bedarfsgenaues Laden pro Effekt
  (`gsap_plugins()` → `request_plugins()`), Konflikt-Reconciliation fuer fremdes GSAP
  (`Assets.php:392-524`).
- **Dreischichtige Vanilla-JS-Runtime**: `core.js` (Engine: Registry, matchMedia, Trigger,
  Bookkeeping, Teardown), `helpers.js` (Widgets, Loop-Helfer, Compositor-Hints),
  `effects-*.js` (reine Runner).
- **Versionierte JSON-Payload pro Element als Liste** (`data-wpghr`, `v=4`), mehrere Effekte
  pro Element sind der Normalfall (`Renderer.php:234-275`, `core.js:150-162`).
- **Doku als Hauptwert**: `PLAN.md` (62 KB), `VERBESSERUNGEN.md` (111 KB), `tests/README.md` (27 KB)
  mit gemessenen Begruendungen fuer fast jede Entscheidung; Testsuite aus PHP-Harness (5.845 Z.)
  und 11 Puppeteer-Skripten.

**Wichtigste Einsicht:** Der wertvollste Teil ist nicht der Code, sondern die dokumentierte
Fehler- und Testgeschichte — jede der folgenden Uebernahmen hat dort einen belegten Schmerz.

## 2. Was ich uebernehmen wuerde (priorisiert)

### P0-1 Preset-Contract mit Faehigkeits-Flags

**Fund:** `Effect` (`includes/Effects/Effect.php:30-190`) deklariert pro Effekt Identitaet
(`id/label/group`), GSAP-Bedarf (`gsap_plugins()`), Parameter (`controls()`, `payload()`,
`responsive_values()`) und **Faehigkeits-Flags** (`splits/staggers/scrubbable/hides/loops/interactive`),
aus denen `triggers()` abgeleitet wird (`:105-114`). `Registry` beantwortet der UI alle
Mengenfragen (`ids_where/ids_with_trigger`, `Registry.php:246-303`) — keine Switch-Statements.

**Uebernahme:** Genau das fehlt Senifys `MotionSpecV2`: eine **Preset-Registry als einzige Quelle**
mit Flags. Editor-UI (welche Controls zeigen?), Validierung (`assertMotionSpec`) und Bake lesen
dieselben Flags; `consistency.ts`-Regeln (pin-excess, char-split) werden daraus abgeleitet statt
hart kodiert. `triggers()`-Ableitung verhindert ungueltige Kombinationen (z.B. `scrub` fuer
nicht-scrubbare Presets) — das Plugin warnt dafuer im Panel (`Controls.php:207-271`).
→ **M1, ersetzt/erweitert die bisherige Preset-Whitelist.**

### P0-2 Server-Timing + Slim: eine Ableitung fuer Canvas und Bake

**Fund:** Breakpoint-Kaskade wird in PHP aufgeloest (`Support::inheritance_chain()`,
`PLAN.md:42-66`); die Runtime bekommt fertige Saetze pro Breakpoint. `slim_breakpoints()`
laesst identische Saetze weg („fehlend = wie Desktop"), Queries existieren einmal global
(`Support.php:142-183`, `Assets.php:239`). Ergebnis: **-54,8 % Payload** (`VERBESSERUNGEN.md:600-894`).

**Uebernahme:** Senifys Canvas/Bake-Drift-Risiko (research.md §4.2) wird genau so geschlossen:
Timing einmal serverseitig aufloesen, nur Abweichungen serialisieren, Breakpoint-Queries
zentral. Die Editor-Preview liest dieselbe Ableitung wie der Bake.
→ **M2, konkretisiert „eine Config-Ableitung" in plan.md:208.**

### P0-3 FOUC-Guard: Zaehler + Failsafe + noscript

**Fund:** `wpghr-pending`-Klasse nur bei `hides`-Effekten; die Runtime **zaehlt** mehrere
Hiding-Effekte herunter (`core.js:125-142`); Inline-Failsafe entfernt die Klasse nach 1600 ms
(`Assets.php:635-649`); `<noscript>`-Guard macht sie ohne JS sichtbar — die **einzige korrekte
`!important`-Stelle** (`VERBESSERUNGEN.md:510-596`, `PLAN.md:954-964`).

**Uebernahme:** Genau Senifys LCP-Gate (M5): Kein Above-fold-`opacity: 0` ohne Fallback.
Als Astro-Umsetzung: Server stempelt `pending` nur bei `hides`-Presets, Failsafe-Timer inline,
noscript-Style. Der Zaehler ist wichtig, weil ein Knoten mehrere Presets tragen kann (s. P0-5).
→ **M2 (Emission) + M5 (Gate).**

### P0-4 Reduced Motion: globales Preset statt Pro-Effekt-Option

**Fund:** Site-Setting `reduced_motion` mit `skip|fade|ignore` (Default `skip`),
Entscheidung faellt einmal beim Setup; `fade` nur bei `hides`-Effekten (`Settings.php:72-85`,
`core.js:688-692,623-640`). Widgets wechseln in einen **statischen Endzustand** — das
PHP-Markup ist bereits der Endzustand, die Runtime animiert nur davon weg
(`helpers.js:433-444`).

**Uebernahme:** Senifys `reducedMotion`-Feld wird zur dreistufigen Site-Policy (oder pro Spec
ueberschreibbar); der „Markup ist der Endzustand"-Kontrakt deckt sich exakt mit Senifys
Baseline-Prinzip und dem Astro-Bake. → **M1 (Schema) + M5 (Gate).**

### P0-5 Versionierte Payload als Liste + Validierungs-Reader

**Fund:** Ein Element traegt eine **Liste** von Effekt-Eintraegen mit `v: 4`; Basis-Payload,
die Effekt-Payloads mergen duerfen (`Renderer.php:234-275`). v3 wird weiter akzeptiert
(`core.js:150-162`). Jede Einstellung laeuft durch typisierte Reader mit Whitelist+Clamp
(`Values.php:58-128`, `Support.php:335-398`: `pick/num/int/bool/color/easing/to_seconds/clamp`).

**Uebernahme:** Senifys `motion-data`-Format: versioniert (`v`), Liste (Reveal + Hover auf
einem Knoten), Basis+Override. Die Reader sind die Vorlage fuer `assertMotionSpec` — nichts
Roh-Parsen, alles Whitelist/Clamp an der Grenze. → **M1 (Validierung) + M2 (Format).**

### P0-6 Self-hosted + per-Preset-Plugin-Bedarf + GSAP 3.15

**Fund:** Nur `splittext/scramble/observer/flip/draggable/inertia` werden bei Bedarf geladen
(`Assets.php:42-49`); fuenf nie angeforderte Plugins wurden entfernt, weil sie **jede
Editor-Sitzung 47 KB** kosteten (`PLAN.md:229-250`). GSAP-Stand im Plugin: **3.15.0**.

**Uebernahme:** Senifys M2-E1 (self-hosted) wird um „bedarfsgenau pro Preset" ergaenzt
(Preset-Flag `gsapPlugins`); GSAP-Version auf 3.15 statt 3.13 (SplitText-Rewrite, kleiner).
→ **M2, konkretisiert E1/Plan.**

### P0-7 Freeze-Protokoll konkret (E7)

**Fund:** Ein echtes Freeze gibt es im Plugin nicht, aber die Bausteine: `document.fonts.ready
→ ScrollTrigger.refresh()` (`core.js:707-714`), Messen bei **Scrollposition 0 direkt nach
Neuaufbau** (`leak.mjs:128-137`), `replay()` fuer deterministischen Neuaufbau.

**Uebernahme:** Senifys Freeze-Reihenfolge festzurren:
`fonts.ready → ScrollTrigger.refresh() → Timelines progress(1) → Lenis stop()/aus →
scrollTo(0) → 2 rAF warten → messen`. Ohne den Fonts-Schritt messen Splits falsch.
→ **M2, ersetzt die vage E7-Formulierung.**

### P0-8 Paritaets-Sonde: computed Styles, richtiger Knoten, Loop-Ausnahme

**Fund:** `container.mjs` pruefte `position:fixed` und war **falsch** — ScrollTrigger nutzt je
nach Kontext `transform`; geprueft wird Spacer + Stehenbleiben (`tests/README.md:286-296`).
Gemessen wird am **richtigen Knoten** (Items statt Track, Zeilen statt Headline) und
Loop-Effekte werden ueber ihr `loops`-Flag ausgenommen (`README.md:266-269,301-307`).

**Uebernahme:** Senifys Paritaets-Tor misst berechnete Styles/Zustaende am definierten
Zielknoten, nicht Implementierungsdetails; Loop-Presets werden vom Standbild-Vergleich
ausgenommen. → **M2/M5, ergaenzt das Paritaets-Tor.**

### P1-9 Tracking/Teardown — kritisch fuer den Editor

**Fund:** `records: WeakMap` pro Element (`core.js:221-233`), `resetTracked()` killt die alte
Generation vor jedem Rebuild (`:250-262`), `teardownEffect()` mit `split.revert()` und
Listener-Abbau (`:265-299`), `matchMedia`-Cleanup pro Breakpoint (`:694-705`). Alles, was in
`onSplit` entsteht, wird explizit getrackt (`:213-220`).

**Uebernahme:** Der Senify-Canvas baut staendig neu (Breakpoint, Editieren) — ohne diese
Disziplin leaken ScrollTrigger/Splits. Uebertragbar als Runtime-Pflicht: jede Preview-Runtime
hat `track/kill/reset` und `matchMedia`-Cleanup. → **M4.**

### P1-10 Editor-Replay-Pattern

**Fund:** `replay(wrapper)` baut ein Element aus frischem Payload neu; Preview forciert
`trigger:'load'` + `delay:0`, Scrub-Effekte behalten ihren Trigger (`core.js:737-782`);
`editor.js` schreibt bei Aenderungen das Attribut neu und ruft `replay`
(`editor.js:518-556`), inkl. Breakpoint-Wechsel (`:621-625`).

**Uebernahme:** Senifys Play-Button (M4) wird als **Replay pro Sektion** gebaut, nicht als
Iframe-Reload: Spec → Config → Runtime, altes Set teardown, neues Set spielen.
→ **M4, ersetzt die Stufe-2-Skizze durch ein bewaehrtes Muster.**

### P1-11 Testverfahren: Mutationsprobe + bidirektionale Abdeckung + Kosten-Gates

**Fund:** `mutate.mjs` bricht jede Pruefung **einmal absichtlich** (101 Mutationen, Suchtext
genau einmal, Vorher-gruen-Zwang, `tests/README.md:111-197`). `conflict.mjs` lief monatelang
gruen **aus dem falschen Grund** (`VERBESSERUNGEN.md:338-356`). Bidirektionale Abdeckung:
Preset↔Runner, Key↔Leser (`PLAN.md:702-766`). Kosten-Gates aus `perf.mjs:247-283`:
p95 ≤ 32 ms, ≤ 3 Frames > 50 ms, Canvas ≤ 32 MB, `stale will-change` = **harte 0**.

**Uebernahme:** Senifys M5-Guardrails bekommen je eine Gegenprobe (absichtlich brechen) und
Kosten-Gates als Zahlen statt Gefuehl; die Preset↔Runner-Abdeckung wird Test.
→ **M5, ersetzt „harte Gates" durch das konkrete Verfahren.**

### P1-12 will-change nur zustandsgebunden + IO

**Fund:** Hints nur im `armed`/`running`-Zustand, geschaltet per IntersectionObserver mit
`rootMargin: 100%` und `io.disconnect()` beim Teardown (`helpers.js:365-409`,
`frontend.css:106-116`). Ohne das: **2,7–13,9 MB tote Compositor-Ebenen** (`PLAN.md:831-852`).

**Uebernahme:** Runtime-Regel fuer alle Senify-Presets; als Utility (nicht pro Preset neu).
→ **M2/M4.**

### P1-13 Widget-/Preset-Vorlagen + Intensitaets-Buendel

**Fund:** Die Widgets sind die besten Vorlagen:
- **Marquee:** Seamless-Loop als Timeline-Zeit statt Tween-Kette (`helpers.js:89-298`),
  `userPaused`-Disziplin, WCAG-Pause-Button per JS (ohne JS keine Bewegung, kein toter
  Button), Fokus pausiert, Hover drosselt per `timeScale` (`marquee.js:76-236`).
- **StackingCards:** CSS `position: sticky` + GSAP nur fuer Transforms, **N-1-Segmente**
  (eins pro Uebergang), Perspective am Container (`stacking-cards.js:5-87`).
- **SplitHero:** Intensitaets-Presets `subtle/balanced/bold` **buendeln** Shift, Scale,
  Stagger, Gap, Ease, Duration-Scale (`split-hero.js:16-20`) — validiert Senifys Dial.
- **Odometer/ScrollSequence/FlipGallery:** explizite Stagger-Reihenfolge, Frame-Snap + DPR-Cap,
  Fokusfalle (`odometer.js:59-102`, `scroll-sequence.js:37-114`, `flip-gallery.js:149-238`).

**Uebernahme:** Senifys v1-Presets `marquee`/`sticky-stack`/`counter` werden durch diese
Implementierungen ersetzt/gehaertet; Intensitaets-Buendel als Muster fuer den Dial.
→ **M6/„Preset-Ausbau", aber schon in M3 als Referenz.**

### P2-14 Konfliktstrategie fremdes GSAP

**Fund:** Spaete Reconciliation (`Assets.php:392-524`): genau **ein** `window.gsap`; fremden
Core nur adoptieren wenn ≥ 3.13 und ScrollTrigger+SplitText daneben liegen; nie halb
adoptieren; verwaiste Consumer auf den ueberlebenden Core umhaengen; Deny-Liste nur fuer
Cores; „Markierung vs. Wirkung" als Testkriterium (`VERBESSERUNGEN.md:2179-2247`).

**Uebernahme:** Fuer Senify relevant, sobald Release-/Kundenseiten eigenes GSAP mitbringen
(Embed-Kontexte). Nicht in M1-M5 noetig, aber als Ticket-Notiz „ein Core, adoptieren statt
stilllegen". **Nicht** uebernehmen: ScrollSmoother (bleibt verworfen; zwei Smooth-Scrooler
sind ein garantierter Konflikt — Lenis bleibt der einzige).
→ **M6/Notiz.**

### P2-15 Height-Reservation + Doku als getestetes Artefakt

**Fund:** Texteffekte, die Umbrueche aendern, reservieren `min-height` per WeakMap-Maximum,
sonst springt die Dokumenthoehe und alle ScrollTrigger darunter verschieben sich
(`PLAN.md:603-620`). Ausserdem: Doku-Zahlen nur mit Einheit und Messdatum; Doku-Drift als
eigener Fund (`VERBESSERUNGEN.md:1678-1752`).

**Uebernahme:** `reserveHeight(el, key, h)`-Utility fuer Split-Presets; HANDOFF/map/ADR-0006
referenzieren Zahlen mit Datum (machen wir bereits). → **M2/M5.**

## 3. Interessante Einzel-Fakten (fuer Doku und Agent-Skill)

- **Ein Schema, das das Feld nicht kennt, verwirft den Wert beim Speichern** — Atomic-Bridge
  musste `wpghr_effect` in **jedes** Schema injizieren (`Bridge.php:111-130`). Senify-Parallele:
  `nodeSpec`/Transport muessen `motion` tragen, sonst stiller Verlust (genau die Luecke aus
  M1.5). Bestaetigt die Prioritaet des Transport-Schritts.
- **`render_type=none`** nur noetig, weil Elementor bei Tastendruck neu rendert — Senify hat
  dieses Problem nicht (eigener Store), nicht uebernehmen.
- **92× Renderer-Kosten** durch `apply_filters()` pro Element → Index einmal pro Request
  (`VERBESSERUNGEN.md:1057-1150`). Senify-Parallele: Motion-Config-Ableitung pro Seite cachen,
  nicht pro Knoten neu berechnen.
- **`serialize_precision=-1`** fuer kurze Floats (0.7 statt 0.69999…) — im `finally`
  zuruecksetzen, sonst aendert man JSON anderer (`VERBESSERUNGEN.md:600-894`).
- **`document.fonts.ready → ScrollTrigger.refresh()`** ist Pflicht, sonst messen Splits falsch
  (`core.js:707-714`).
- **Scrub-Disziplin:** `ease:'none'` zwingend, `invalidateOnRefresh:true`, Pins
  `refreshPriority:1`, Travel messen statt schaetzen (`effects-scroll.js:224-237`).
- **Pointer:** `gsap.quickTo()` + `(hover:hover) and (pointer:fine)`-Gate + passives
  `pointermove` (`effects-interaction.js:19-68`).
- **SplitText:** echtes Plugin, `autoSplit:true`, `aria:'auto'`, `revertOnFinish` Default an —
  Screenreader sehen nach Abschluss wieder den Originaltext (`core.js:515-538`,
  `effects-text.js:143-145`).
- **Lenis kommt im Plugin nicht vor** (0 Treffer); Smooth-Scroll ist allein ScrollTrigger.
  Fuer Senify: Lenis bleibt, aber nie zusaetzlich ScrollSmoother.
- **Tests, die aus dem falschen Grund gruen sind**, sind schlimmer als keine — der teuerste
  Einzelfund (`conflict.mjs` monatelang ohne Gegenstand).
- **Jede Pruefung einmal absichtlich brechen** ist das Gegenmittel (`mutate.mjs`).

## 4. Was wir bewusst nicht uebernehmen

- **Elementor-Interna** (Panel-Controls, `render_type`, Atomic-Bridge, Kit-Settings-API):
  Senify hat eigene Engine und eigene Settings; nur die Konzepte (Flags, Reader, RM-Policy)
  sind uebertragbar.
- **Widgets 1:1:** stark an Elementor-Markup (`.e-con-inner`) gekoppelt — nur als Vorlage.
- **ScrollSmoother/kein Lenis:** Senify behaelt Lenis (v1 validiert).
- **30 Effekte sofort:** Senifys 24er-Katalog bleibt; Ergaenzungen (Glitch, LiquidWave,
  LetterFlip, Typewriter, Scramble, Focus, Highlight, Gradient, KenBurns, Desaturate, Blinds,
  ClipReveal, Tilt, Magnetic, Shimmer, VelocitySkew/Blur) sind M6-Kandidaten.

## 5. Aenderungen am Plan (M1-M5)

| Phase | Ergaenzung aus dem Plugin |
|---|---|
| M1 | Preset-Registry mit Faehigkeits-Flags (P0-1); RM-Policy `skip|fade|ignore` (P0-4); Reader-Validierung (P0-5); Transport-Schritt als P0 (still er Verlust, §3) |
| M2 | Payload-Format Liste+`v`+Slim (P0-2/5); per-Preset-Plugins, GSAP 3.15 (P0-6); FOUC-Guard (P0-3); Freeze-Reihenfolge (P0-7); Paritaets-Sonde (P0-8); Scrub-Disziplin + Height-Reservation (P2-15) |
| M3 | Intensitaets-Buendel als Dial-Referenz (P1-13) |
| M4 | Tracking/Teardown (P1-9); Editor-Replay (P1-10); will-change/IO (P1-12) |
| M5 | Mutationsprobe + bidirektionale Abdeckung + Kosten-Gates (P1-11); Paritaets-Sonde; Doku mit Messdatum (P2-15) |

## 6. Beleg-Index (Auswahl)

- `includes/Effects/Effect.php:30-190` — Preset-Contract mit Flags
- `includes/Registry.php:246-303` — Mengenfragen-API
- `includes/Assets.php:27,42-49,392-524,635-649` — GSAP 3.15, per-Effekt-Plugins, Reconciliation, Failsafe
- `includes/Renderer.php:133-155,234-275` — bedarfsgenaue Assets, FOUC, Payload-Liste
- `includes/Support.php:142-183,335-398` — Slim-Breakpoints, Validierungs-Reader
- `includes/Settings.php:72-85` — RM-Policy `skip|fade|ignore`
- `assets/js/core.js:150-162,221-299,515-538,623-715,737-782` — Payload, Tracking/Teardown, SplitText, RM, matchMedia, Replay
- `assets/js/helpers.js:89-298,365-409,433-444` — Loop, IO-Hints, statischer Endzustand
- `assets/js/widgets/marquee.js:76-236` — Seamless-Loop + WCAG-Pause
- `PLAN.md:42-66,229-250,603-620,831-852` — Server-Kaskade, tote Plugins, Height-Reservation, will-change
- `VERBESSERUNGEN.md:510-596,600-894,2179-2247` — noscript, Payload-Reduktion, Markierung vs. Wirkung
- `tests/README.md:111-197,286-296` — Mutationsprobe, Paritaets-Messfehler
- `tests/perf.mjs:247-283`, `tests/leak.mjs:128-137`, `tests/conflict.mjs:155-205` — Kosten-Gates, Scroll-0-Messung, Konflikt-Zusagen
