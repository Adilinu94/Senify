# Payload-Spec `motion-data` v2

> Papierpaket zu Ticket 19 (M2). Stand 18.09.2026.
> **Umgesetzt (M2):** `motionDataFor` schreibt das v2-Envelope, der Leser akzeptiert
> beide Formen; `hides`/`needs`/`reducedMotion` kommen aus der Preset-Registry,
> der FOUC-Pending-Mechanismus liegt in `Page.astro` + `SectionShell`/`PrimitiveNode`.
> Heute: `motionConfigsForTree` (`packages/renderer/src/motion.ts:58-119`) erzeugt eine flache
> Config-Liste; `renderPageScript` liest sie aus `<script type="application/json" id="motion-data">`
> (`motion.ts:152-158`). Emission: `bake.ts:436-448` + `Page.astro:51-63`.
> Ziel: ein **versioniertes, schlankes, deterministisches** Format, das Canvas und Bake aus
> **einer** Ableitung speist (Plugin-Adoption P0-2/P0-5).

## 1. Format v2

```jsonc
{
  "v": 2,
  "breakpoints": {                      // einmal pro Seite, aus derselben Quelle wie die CSS-Breakpoints
    "tablet": "<query aus cascade.ts BREAKPOINTS>",
    "mobile": "<query aus cascade.ts BREAKPOINTS>"
  },
  "entries": [
    {
      "nodeId": "n_abc123",
      "preset": "fade-up",
      "intensity": 6,
      "trigger": "viewport",
      "delay": 0,
      "tokens": { "ease": "power2.out", "duration": 0.6, "stagger": 0.06 },
      "reducedMotion": "static",
      "hides": true,
      "needs": ["scrolltrigger"]
    }
  ]
}
```

## 2. Feldvertrag

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `v` | ja | Formatversion; Leser akzeptiert aeltere Versionen tolerant |
| `breakpoints` | ja | Breakpoint-Queries **zentral** (nicht pro Entry wiederholt) |
| `entries[]` | ja | Liste — ein Knoten kann (Ziel) mehrere Eintraege tragen |
| `nodeId` | ja | Ziel: `[data-node-id]` |
| `preset` | ja | ID aus der Preset-Registry (`preset-matrix.md`) |
| `intensity` | nein | 1–10, Default 5; ausserhalb → Clamp + Warnung (heute `motion.ts:81-89`) |
| `trigger` | nein | Default `viewport`; erlaubte Werte kommen aus den Preset-Flags |
| `delay` | nein | ms, ≥ 0 |
| `tokens` | nein | **aufgeloest** (Ease-Name, Sekunden, Stagger) — die Runtime rechnet nicht |
| `reducedMotion` | nein | `static`/`fade`/`off`; Default aus Site-Policy (Plugin `skip|fade|ignore`) |
| `hides` | nein | aus dem Preset-Flag; steuert den Pending-Zaehler der Runtime |
| `needs` | nein | benoetigte GSAP-Plugins; Runtime prueft `has.*` und degradiert (Plugin `HAS`-Flags) |
| `bp` | reserviert | pro Breakpoint abweichende Timing-Werte; **in M1/M2 nicht erzeugt** (keine responsiven Motion-Werte), Slim-Regel unten gilt dann |

**Slim-Regel (wenn `bp` kommt):** nur vom Desktop abweichende Saetze serialisieren;
„fehlend = wie Desktop" ist der Vertrag (Plugin: −54,8 % Payload, `Support.php:142-183`).

## 3. Emission (Server)

1. `motionConfigsForTree` bleibt die **einzige** Ableitung (Flags → Configs, Guardrail-Warnungen).
   Canvas-Preview und Bake lesen dieselbe Funktion — kein zweiter Pfad.
2. `Page.astro` schreibt das JSON als `<script type="application/json" id="motion-data">`
   (unveraendert), plus die Skripte (`page.js`).
3. **FOUC/Pending (neu, Plugin-Adoption P0-3):** Wenn mindestens ein Entry `hides` traegt,
   stempelt der Bake die Klasse `data-motion-pending` (oder Klasse `motion-pending`) an die
   betroffenen Knoten. Die Runtime **zaehlt** mehrere Hiding-Presets herunter; Inline-Failsafe
   entfernt die Klasse nach 1600 ms; `<noscript>` macht sie sichtbar (einzige korrekte
   `!important`-Stelle). Ohne JS/bei Runtime-Fehler ist der Inhalt garantiert sichtbar.
   **CSS-Einlauf oberhalb der Falz:** `fade-up`, `fade-up-deblur` und `scroll-reveal` (reine
   Opacity-plus-Weg-Reveals) warten dort nicht auf das Skript. `cssEntryNodeIds`
   (`registry/components/map.tsx`) waehlt die Knoten: die zulaessigen Reveals des ersten
   Bildschirms (Kopf-Chrome plus die ersten zwei Inhalts-Sektionen, dieselbe Strecke wie das
   LCP-Bild) und jeder zulaessige Knoten mit `trigger: "load"`. Sie tragen `data-motion-enter`
   statt `data-motion-pending`, landen als `MotionCssEntry` (nicht als Payload-Entry) in
   `motionConfigsForTree` und werden von `motionEntryCss` als Keyframes plus Regel je Knoten in
   den Seitenkopf geschrieben (`backwards`-Fuellung, Reduced-Motion nach Policy). Eine Seite,
   deren einzige Motion so einlaeuft, liefert kein Skript und keinen Failsafe. Der Editor
   (Canvas, Live-Modus) uebergibt keine Auswahl und laesst jeden Reveal vom Skript laufen.
   Messung (Chromium, Slow-4G + 4x CPU, Median): Hero-`fade-up` LCP 1100 -> 780 ms
   (Seite ohne Motion: 520 ms); `masked-headline` bleibt beim Skript (ca. 1200 ms).
4. **Motion-off (Freeze, siehe `freeze-spec.md`):** `window.__SENIFY_MOTION__ = "off"`
   (per `addInitScript` in Tests) laesst die Runtime sofort aussteigen und den Pending-Zaehler
   aufloesen — der Release rendert dann exakt den Baseline-Zustand wie der Canvas.

## 4. Runtime-Vertrag

- Einstieg heute: `motion.ts:146` steigt bei `prefers-reduced-motion: reduce` komplett aus;
  **neu:** zusaetzlich `__SENIFY_MOTION__ === "off"` → Pending aufloesen, dann `return`.
- Reduced Motion nach Policy: `skip` = wie heute (aussteigen, Endzustand steht im Markup);
  `fade` = nur `hides`-Presets bekommen einen 0,4-s-Fade; `ignore` = volle Animation.
- Lenis wird nur initialisiert, wenn nicht RM und nicht `off` (heute schon so, `motion.ts:132-137`).
- Jeder Runner prueft `needs` gegen vorhandene Plugins und faellt auf den Block-Zustand zurueck.

## 5. Versionierung & Migration

- `v1` = heutige flache Liste (`MotionConfig[]`). Der Leser akzeptiert beide Formen;
  `v2` ist Ziel. Der Sprung v1→v2 ist rein additiv (`v`, `breakpoints`, `hides`, `needs`).
- **Editor-Dokument:** `Node.motion` (v1) → `EditorNode.motion` (v2) — die Migration
  (`migration.ts:58-91`) kopiert `motion` kuenftig mit. **Achtung Doku-Fehler:** der Kommentar
  dort behauptet, nur `hidden` falle weg — tatsaechlich faellt `motion` still mit weg.
- Motion-Regeln werden **nicht** ueber die Style-Rule-Registry gespiegelt; sie reisen im
  Seitenbaum (Node-Feld), die Payload entsteht beim Bake/Preview.

## 6. Offene Punkte

- **Mehrfach-Spec pro Knoten:** Format ist Liste (forward-compatible), Modell in M1 einzeln;
  Mehrfach (Reveal + Hover) = M6-Erweiterung des Modells.
- **Responsive Motion-Werte** (`bp`): erst wenn der Inspektor sie anbietet; Feld ist reserviert.
- **Breakpoint-Queries:** exakte Werte aus `packages/widget-engine/src/css/cascade.ts`
  (`BREAKPOINTS`) uebernehmen — hier bewusst nicht dupliziert.
