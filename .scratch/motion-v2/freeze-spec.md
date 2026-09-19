# Freeze-Spec — Motion und das Paritaets-Tor

> Papierpaket zu Ticket 19 (M2, E7). Stand 18.09.2026.
> **Umgesetzt (M2):** Kill-Switch in der Runtime, `visual.ts` mit
> `motion: "off" | "live"` (Default off), `scroll-behavior: auto` + 2 rAF im
> Settle, Gegenprobe als Browser-Test (`visual.test.ts`).
> Bestand: `packages/analysis-worker/src/visual.ts` (T07/T14-Harness) und
> `packages/app/test/widget-slice-browser.test.ts` (Paritaets-Tor Phase 1, O8).
> Ziel: Motion deterministisch machen, ohne die bestehenden Tore zu schwaecchen.

## 1. Bestand (verifiziert)

**Visual-Harness (`visual.ts`):**
- Freeze heute: Browser-Kontext mit `reducedMotion: "reduce"` (`:136`) + `FREEZE_CSS`
  (`animation: none !important; transition: none !important`, `:74-75`).
- `settle()` (`:109-123`): FREEZE_CSS injizieren → Seite in Viewport-Schritten scrollen
  (Lazy Media, Sticky setzen) → `scrollTo(0,0)` → 80 ms → `document.fonts.ready`.
- `diffScreenshots` (`:162-280`): per-Pixel-Diff mit Threshold (Default 24) + Bounding-Box.
- `recordMotion` (`:285-330`): Scroll-Durchlauf als `.webm` (Review-Artefakt) — **ohne** RM-Emulation.

**Paritaets-Tor (`widget-slice-browser.test.ts`):**
- Canvas vs. Release: gleiche Maße, numerischer Computed-Style-Vergleich (`:281-304`),
  Pixel-Diff mit `PARITY_RATIO = 0.01` und `threshold: 24` (`:46`, `:343-365`),
  Ueberlauf-Check.
- **Gegenprobe existiert bereits** (`:367-389`): Release ohne Grund-CSS muss die Toleranz
  verlassen — das Muster „jede Pruefung einmal absichtlich brechen" ist also etabliert.

**Warum der Freeze heute funktioniert:** `page.js` steigt bei `prefers-reduced-motion: reduce`
komplett aus (`motion.ts:146`) und initialisiert auch Lenis nicht. Der Release rendert damit
den Baseline-Zustand — genau das, was der Canvas (ohne Motion-Runtime) ohnehin zeigt.

## 2. Grundsatz-Entscheidung

**Das Paritaets-Tor vergleicht den Baseline-Zustand (Motion aus). Motion wird separat geprueft.**
Begruendung: Der Canvas rendert keine Motion-Runtime; ein Release mit laufender Animation waere
prinzipiell nicht pixelgleich. Der Vergleich „Baseline vs. Baseline" ist ehrlich und deterministisch;
die Qualitaet der Animation wird ueber Video/Sampling und Endzustands-Checks bewertet (Abschnitt 5).

## 3. Motion-Kill-Switch (neu)

- `window.__SENIFY_MOTION__ = "off"` — per Playwright `addInitScript` **vor** dem Laden setzen
  (kein Query-Param noetig, keine sichtbare URL-Aenderung).
- Runtime-Vertrag (siehe `payload-spec.md` §4): bei `"off"` → Pending aufloesen, `return`.
  Lenis/GSAP werden nie initialisiert; es entstehen keine Pin-Spacer, keine Inline-Transforms.
- Der Canvas braucht nichts: er laedt `page.js` nicht.

## 4. Standbild-Reihenfolge (verbindlich)

1. `addInitScript`: `window.__SENIFY_MOTION__ = "off"`.
2. Kontext `reducedMotion: "reduce"` (doppelte Sicherung; deckt Fremd-CSS-Animationen).
3. `FREEZE_CSS` injizieren (`animation/transition: none`, `caret-color: transparent`).
4. `page.goto(..., { waitUntil: "load" })`.
5. Scroll-Durchlauf (Lazy Media, Sticky), dann `scrollTo(0, 0)`.
6. `document.fonts.ready` abwarten (SplitText-Metriken; Plugin-Lehre `core.js:707-714`).
7. **2 × `requestAnimationFrame`** warten (Layout-Settle nach Fonts/Scroll).
8. Optional `settleMs` (Default 150 ms) — erst dann Screenshot.

**Zusaetzlich fuer Motion-Seiten:** `scroll-behavior: auto` erzwingen (Plugin-Lehre
`disableSmoothScroll` — sonst misst man 2 px statt 140 px Fahrweg) und sicherstellen, dass
die Runtime `off` respektiert, **bevor** sie irgendetwas versteckt (Pending-Zaehler).

## 5. Was je Preset-Klasse gilt

| Klasse | Standbild (Paritaet) | Motion-Pruefung (separat) |
|---|---|---|
| `hides` (Entry) | Baseline sichtbar; kein `pending`-Rest nach Freeze | Endzustands-Check: nach Unfreeze/Play ist `opacity 1`, kein `pending` |
| `scrubbable`/`pins` | kein Pin-Spacer, kein Transform (Motion aus) | Sampling entlang der Scrollstrecke; Spacer vorhanden, Pin steht |
| `loops` | ausgenommen (still) — nie im Standbild vergleichen | Video-Artefakt + `loops`-Flag-Ausnahme im Vergleich (Plugin-Lehre) |
| `interactive` | ausgenommen (Pointer-Events im Standbild nicht ausloesbar) | separater Pointer-Pass (echte Koordinaten im Rect) |
| `marquee` (CSS) | FREEZE_CSS stoppt die CSS-Animation — deterministisch | Video-Artefakt; WCAG-Pause-Test (M6) |

## 6. Gegenproben (Pflicht, Muster aus Phase 1)

1. **Ohne Freeze:** dieselbe Motion-Seite zweimal ohne Kill-Switch aufnehmen → Diff **muss**
   die Toleranz verlassen (sonst ist der Freeze nicht wirksam, bzw. es gibt keine Motion).
2. **Mit Freeze:** zweimal aufnehmen → Diff **muss** 0 sein (oder unter Toleranz).
3. **Baseline vs. RM:** Release mit `off` und Release mit `reducedMotion: reduce` (Policy `skip`)
   muessen denselben Zustand zeigen.
4. **Kontrolle wie bisher:** Grund-CSS entfernen → Toleranz muss verlassen werden (existiert).

## 7. Integration (M2-Arbeit)

- `visual.ts`: `CaptureOptions` um `motion?: "off"` (Default `"off"`) erweitern; `settle()`
  um Kill-Switch-Init, `scroll-behavior:auto` und 2-rAF ergaenzen.
- `widget-slice-browser.test.ts`: unveraendert — der Freeze greift transparent, sobald
  Motion-Seiten existieren; die Gegenprobe (1) kommt als eigener Test dazu.
- Review-Pipeline: `recordMotion` bleibt das Motion-Artefakt; es laeuft bewusst **ohne**
  Kill-Switch und ohne RM-Emulation.

## 8. Offene Punkte

- **Motion-Sampling** (Frames bei definierten Scroll-/Timeline-Positionen) ist M6; v1 hatte
  dazu ein Ticket (Motion-Sampling) — nicht in M2 noetig.
- **Editor-Canvas (M4):** Play-Vorschau braucht denselben Kill-Switch-Mechanismus fuer
  Screenshots der Arbeitsflaeche; wird mit M4 spezifiziert.
