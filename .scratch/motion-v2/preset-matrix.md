# Preset-Matrix v2 — Contract, Abdeckung, Luecken

> Papierpaket zu Ticket 19 (M1). Stand 18.09.2026.
> Quellen: `.scratch/senify-v1/artifacts/03-motion-3d.md` (Katalog), `packages/renderer/src/motion.ts`
> (Runtime heute), `plugin-analyse.md` (Contract-Vorbild), `packages/editor/src/state/migration.ts`.
> Zweck: Die 24 v1-Presets in den **Preset-Contract** (Flags) ueberfuehren und die
> Abdeckung heute vs. Ziel festhalten — Grundlage fuer die Preset-Registry in M1.

## 1. Contract (Vorbild `Effect.php` aus dem Elementor-Plugin)

Jedes Preset deklariert in der Registry:

| Feld | Bedeutung | Nutzer |
|---|---|---|
| `id` | stabile Maschinen-ID (zugleich Runner-Key) | Editor, Runtime, Tests |
| `label`, `group` | Anzeige, Kategorie A–G | Inspektor |
| `flags` | `splits`, `staggers`, `scrubbable`, `hides`, `loops`, `interactive`, `pins` | UI (welche Controls?), Validierung, Runtime |
| `gsapPlugins` | benoetigte Plugins (`scrolltrigger`, `splittext`, `observer`, …) | Asset-Bedarf pro Seite (M2) |
| `triggers` | erlaubte Trigger, abgeleitet aus Flags | Inspektor-Dropdown, Validierung |
| `guardrails` | harte/weiche Regeln (Pin-Budget, Parallax-Layer, Char-Split, RM) | `consistency.ts`, Publish-Gates |

Ableitungsregel (aus dem Plugin uebernommen): `interactive` → nur `hover`;
`loops` → `load`/`viewport`; `scrubbable` → `scroll`; sonst `viewport`/`load`.

## 2. Die 24 Presets (Contract + Abdeckung heute)

Legende Heute: **page.js** = im Page-Script implementiert (`PAGE_SCRIPT_PRESETS`,
`motion.ts:3-17`, Switch `:187-263`); **CSS** = `cssOnly`; **Island** = eigener Vanilla-Island;
**offen** = nicht implementiert (Runtime warnt `unimplemented-preset`, `motion.ts:69-78`).

| # | Kat | Preset | Flags | GSAP | Trigger | Heute | Luecke / Anmerkung |
|---|---|---|---|---|---|---|---|
| 1 | A | `fade-up` | hides | — | viewport/load | page.js | — |
| 2 | A | `fade-up-deblur` | hides | — | viewport/load | page.js | Filter-Blur; `will-change` erst im armed-State |
| 3 | A | `masked-headline` | splits, staggers, hides | splittext | viewport/load | page.js (Eigenbau-Wort-Split) | auf echtes SplitText + `aria:'auto'` umstellen |
| 4 | A | `stagger-cascade` | staggers, hides | — | viewport/load | page.js | — |
| 5 | B | `scroll-reveal` | hides | scrolltrigger | viewport | page.js | deckt sich fast mit `fade-up`; Zusammenlegen pruefen |
| 6 | B | `scrub-pin` | scrubbable, pins | scrolltrigger | scroll | page.js | **hart max 1 Pin/Seite** |
| 7 | B | `sticky-stack` | scrubbable, pins | scrolltrigger | scroll | page.js (Basis) | Plugin-Vorlage: N-1-Segmente, CSS-sticky + nur Transforms (M6) |
| 8 | B | `horizontal-pan` | scrubbable, pins, hides | scrolltrigger | scroll | page.js | braucht `.pan-track`; Travel messen statt schaetzen |
| 9 | B | `parallax-subtle` | scrubbable | scrolltrigger | scroll | page.js | **hart max 2 Layer/Viewport** |
| 10 | B | `scroll-progress` | scrubbable | scrolltrigger | scroll | page.js (erzeugt Balken) | CSS `animation-timeline` als Enhancement (nie exklusiv) |
| 11 | C | `counter` | — | — | viewport/load | page.js (`data-count`) | — |
| 12 | C | `marquee` | loops | — | load | **CSS** (`cssOnly`) | WCAG-Pause-Button + `userPaused`-Disziplin fehlen (Plugin-Vorlage) |
| 13 | C | `char-split` | splits, staggers, hides | splittext | viewport/load | page.js (Eigenbau-Char-Split) | **weich max 1/Seite**; SplitText + Revert |
| 14 | D | `hover-lift` | interactive | — | hover | **offen** | als CSS-Transition machbar (Style-Rules) |
| 15 | D | `magnetic-button` | interactive | — (quickTo) | hover | **offen** | `canHover`-Gate, passives `pointermove` |
| 16 | D | `tilt-card` | interactive | — (Observer/Pointer) | hover | **offen** | max 6–8°; Touch ueberspringen |
| 17 | D | `cursor-glow` | interactive | — (quickTo) | hover | **offen** | Inertia; `pointer-events:none`-Layer |
| 18 | E | `page-fade` | — | — (View Transitions) | load/Navigation | **offen** | CSS `@view-transition`; degradiert ohne Support |
| 19 | E | `preloader-light` | hides, loops | — | load | **offen** | **weich ≤ 2,5 s**; RM statisch |
| 20 | E | `accordion` | — | — | click | **Island** (details-Fade) | Basis vorhanden; Motion-Variante offen |
| 21 | E | `modal` | — | — | click | **offen** | Vanilla-Island noetig (Motion nur Editor-UI) |
| 22 | F | `ambient-float` | loops | — | load | **offen** | CSS-Loop (8–20 s, mirror) |
| 23 | F | `grain` | loops | — | load | **offen** | `pointer-events:none`; RM statisch |
| 24 | G | `webgl-scene` | loops | (3D) | load/viewport | **Stub-Island** (`motion.ts:361-365`) | eigenes Ticket; 1 Canvas/Seite, lazy, Poster |

**Abdeckung heute:** 12 × page.js + 1 × CSS (`marquee`) = 13 (`PAGE_SCRIPT_PRESETS`),
1 × Island (`accordion`), **10 offen** (D 14–17, E 18/19/21, F 22/23, G 24).

## 3. Guardrails je Flag

| Flag | Regel | Haerte |
|---|---|---|
| `pins` | max 1 Pin-Preset/Seite (`scrub-pin`, `sticky-stack`, `horizontal-pan`) | hart |
| `scrubbable` (Parallax) | max 2 Layer/Viewport | hart |
| `splits` | max 1 `char-split`/Seite | weich |
| `hides` | FOUC-Guard (Pending-Zaehler + 1,6-s-Failsafe + noscript); kein Above-fold-`opacity:0` ohne Fallback | hart (LCP) |
| `loops` | RM-Variante statisch Pflicht; Pause-Mechanik bei Marquee | hart (WCAG) |
| `interactive` | `(hover:hover) and (pointer:fine)`-Gate; Touch ueberspringt | hart (Verhalten) |

## 4. Was M1 daraus baut

1. `PRESETS`-Registry (section-sdk oder widget-engine) mit obigen Flags + `gsapPlugins`;
   `PAGE_SCRIPT_PRESETS`/`PIN_PRESETS` werden daraus abgeleitet, nicht mehr parallel gepflegt.
2. `MotionSpecV2.preset` wird gegen die Registry validiert (statt `minLength: 1`).
3. `consistency.ts` liest die Flags (pin-excess, char-split-excess, RM-Pflicht) statt eigener Listen.
4. Der Runtime-Switch (`runPreset`) bleibt die Ausfuehrung; die Registry beschreibt ihn nur.
5. **Offene Design-Frage:** Ein Knoten, eine Spec (M1, v1-Migration) oder Liste (Plugin-Normalfall
   „Reveal + Hover")? Empfehlung: M1 einzeln, Payload-Format schon als Liste (siehe `payload-spec.md`),
   Mehrfach-Spec = M6.
