# Motion im Editor v2 — Umsetzungsplan

> Grundlage: `research.md` (externer Stand + Codebase-Befund) + `plugin-analyse.md`
> (Adoptionen aus dem Elementor-Plugin `wp-gsap-heading-reveal`). Stand 18.09.2026.
> **Papierpaket (18.09.):** `preset-matrix.md` (Contract + Abdeckung), `payload-spec.md`
> (`motion-data` v2), `freeze-spec.md` (Paritaet); die Entscheidungen liegen als **ADR-0006**
> (`docs/adr/0006-motion-authoring.md`), der Entwurf bleibt als Protokoll im Ordner.
> Kurzfassung: v1-Motion-Stack in das v2-Dokument wiedereingliedern, Editor-Authoring
> (Inspektor + Canvas) bauen, Bake/Paritaet anbinden — Preset-basiert, kein freier Code.
>
> **Entschieden 18.09.2026:** Start nach dem Ticket-13-Rest (Bake steht); Authoring
> Presets + Intensity (keine freie Timeline); Canvas Live-Modus + Play-Button;
> Verankerung als **Ticket 19** (`issues/19-motion-authoring.md`) + ADR-0006.
> **Stand 18.09.:** M0–M2 umgesetzt (Modell/Datenpfad + self-hosted Runtime/Bake
> mit `motion-data` v2, FOUC-Pending und Freeze-Kill-Switch).

## 1. Zielbild

Der Editor soll Seiten ermoeglichen, die auf Framer-Niveau animieren — mit denselben
Prinzipien, die Senify schon hat:

1. **Agent-native:** Agenten und Nutzer waehlen **typisierte Motion-Specs** (Preset +
   Intensity-Dial + Tokens). Kein freier Motion-Code.
2. **Baseline-Qualitaet ohne Motion:** Jede Sektion sieht ohne Animation vollwertig aus;
   Motion ist Eskalation (v1-Prinzip, `artifacts/03-motion-3d.md:94`).
3. **Eine Quelle, zwei Ansichten:** Dieselbe Motion-Spec speist Canvas-Preview und Bake;
   Paritaet bleibt messbar (Freeze-Protokoll).
4. **Barrierefreiheit ist Gate, nicht Option:** Reduced-Motion-Variante pro Preset ist
   Pflicht (WCAG 2.3.3 / C39).

## 2. Architektur

### 2.1 Drei Ebenen (bleibt wie ADR-0003)

| Ebene | Technik | Rolle | v2-Stand |
|---|---|---|---|
| 0 — Statisch | CSS: Style-Rules, States, `transition`, `@keyframes` | Hover/Focus/Active, einfache Reveals, JS-freie Baseline | Modell da (rawCss, states, offenes CSS), Schreib-Ops/UI fehlen (Ticket 02) |
| 1 — Scroll-Choreografie | **GSAP + ScrollTrigger + Lenis** | Pin, Scrub, Parallax, Reveals, SplitText | v1-Runtime vorhanden, v2-Modell fehlt |
| 2 — Interaktion/State | Islands (Vanilla), Motion (nur Editor-UI) | Accordion, Modal, Slider, Menue | Islands vorhanden; Motion bleibt Editor-Sache |

### 2.2 Datenfluss (Ziel)

```
Inspektor / MCP
      |  setMotion / clearMotion  (EditorMutation, validiert)
      v
EditorStore ── DocumentPatch (EditorNode.motion) ── History/Undo
      |  persist (Transport, nodeSpec)
      v
Engine editor-bridge ──► v1 NodeTree (Node.motion)     [bestehende Route]
      |
      ├──► Canvas: motionConfigsForTree → Preview-Runtime im iframe
      └──► Bake: bakeSite → motion-data JSON + page.js → Release/Preview
```

Kern: **Die Bridge muss Motion durchreichen** (anders als Style-Rule-Ops, die sie bewusst
ablehnt — `editor-bridge.ts:61-72`). v1 kennt `Node.motion` bereits; die Uebersetzung ist
ein Feld-Mapping, kein neuer Kanal.

### 2.3 MotionSpec v2 (Vorschlag, auf v1 aufbauend)

```ts
type MotionSpecV2 = {
  preset: string;              // Whitelist der Preset-Registry (A–G), Schema-validiert
  intensity?: number;          // 1–10, Default 5 (Dial, nicht Zahlenwust)
  trigger?: "load" | "scroll" | "viewport" | "hover";   // Default "viewport"
  delay?: number;              // ms, >= 0
  tokens?: {                   // referenziert Motion-Tokens des Themes
    ease?: string;
    durationScale?: number;
    stagger?: number;
  };
  reducedMotion?: "static" | "fade" | "off";  // Default "static" (Pflicht)
  enabled?: boolean;           // Editor-Schalter: aus ohne loeschen
  authoredBy?: "user" | "agent" | "preset";   // Agent-Fence, konsistent mit StyleRule
};
```

Aenderungen gegenueber v1 (`section-sdk/src/schema.ts:110-132`): `reducedMotion`, `enabled`,
`authoredBy` ergaenzt; `preset` wird gegen eine Registry validiert statt nur `minLength: 1`.

### 2.4 Wo das Modell lebt

- **Schema + Preset-Registry:** `section-sdk` bleibt Quelle (wird vom Renderer gebraucht);
  die v2-Validierung (Whitelist, Intensity, RM) sitzt zusaetzlich im Editor-Write-Path
  (`operations.ts`, `consistency.ts`) und auf der Engine-Seite (`store.ts`).
- **Knotenfeld:** `EditorNode.motion?: MotionSpecV2` (`document.ts`), analog zu `states`.
- **Kein zweites Regel-Register.** Wiederverwendung kommt ueber Slots/VCs/Templates
  (Phase 4), nicht ueber ein Motion-Register. Site-weite Settings (Lenis an/aus,
  Intensity-Cap, 3D) sind **Site-/Theme-Ebene** (v1 Ticket 21 → v2 Site-Settings).

## 3. Empfohlene Entscheidungen

| # | Frage | Empfehlung | Begruendung |
|---|---|---|---|
| E1 | Runtime | GSAP 3.13 + ScrollTrigger + SplitText + Lenis, **self-hosted** statt CDN | GSAP frei inkl. Commercial; keine externen Requests/DSGVO; Version im Bake eingefroren |
| E2 | Authoring | **Presets + Intensity + Tokens** (v1-Linie), keine freie Timeline | agent-native, deterministisch, entspricht Webflow/Framer-Praxis |
| E3 | Modellort | Motion pro Knoten (`EditorNode.motion`), Site-Profile separat | einfachste Migration, Agenten denken knotenbezogen |
| E4 | Ausfuehrung | Bestehende v1-Runtime + Bake-Pipeline weiterverwenden | halbe Mauer steht; Risiko klein |
| E5 | Canvas | Design-Modus standardmaessig **ruhend**; Play explizit; Live-Modus echt | Editierbarkeit + Performance |
| E6 | RM | `reducedMotion` Pflichtfeld mit Default `"static"`; hartes Gate | WCAG, v1-Zusage |
| E7 | Freeze | Paritaets-Tor friert Motion ein (Scroll 0, Lenis aus, Timelines `progress: 1`) | deterministische Screenshots |

## 3a. Adoptionen aus dem Elementor-Plugin (18.09.2026)

Quelle: `plugin-analyse.md` (Analyse des Plugins `wp-gsap-heading-reveal`). Die wichtigsten
Uebernahmen, eingearbeitet in die Phasen:

| Uebernahme | Phase | Kurz |
|---|---|---|
| Preset-Registry mit Faehigkeits-Flags (splits/staggers/scrubbable/hides/loops/interactive/gsapPlugins) | M1 | eine Quelle fuer UI, Validierung, Bake |
| RM-Policy `skip|fade|ignore` + Markup=Endzustand | M1/M5 | dreistufig statt boolesch |
| Typisierte Reader (Whitelist+Clamp) fuer `assertMotionSpec` | M1 | nichts roh parsen |
| Transport muss `motion` tragen, sonst stiller Verlust | M1 | bestaetigt Schritt 5 |
| Payload: Liste + `v` + Slim-Breakpoints, Queries zentral | M2 | -54,8 % Vorbild, Canvas=Bake |
| Per-Preset-GSAP-Plugins, GSAP 3.15 self-hosted | M2 | 47 KB/Session gespart |
| FOUC-Guard: Zaehler + 1,6-s-Failsafe + noscript | M2/M5 | LCP-Gate |
| Freeze: fonts.ready → refresh → progress(1) → Lenis aus → Scroll 0 → 2 rAF | M2 | E7 konkret |
| Paritaets-Sonde: computed Styles, Zielknoten, Loop-Ausnahme | M2/M5 | Messfehler vermeiden |
| Tracking/Teardown (WeakMap, resetTracked, split.revert, matchMedia-Cleanup) | M4 | Pflicht fuer Rebuilds |
| Editor-Replay statt Iframe-Reload (Preview-Trigger load) | M4 | Play-Button-Muster |
| Mutationsprobe + bidirektionale Abdeckung + Kosten-Gates (p95 ≤ 32 ms, stale will-change = 0) | M5 | Gegenprobe je Regel |
| Intensitaets-Buendel (subtle/balanced/bold) | M3 | Dial-Referenz |
| Konflikt: ein GSAP-Core, adoptieren statt stilllegen | M6/Notiz | fuer Embed-Kontexte |

Details, Belege und „bewusst nicht uebernehmen": `plugin-analyse.md`.

## 4. Umsetzung in Phasen

**Start nach Ticket-13-Rest** (Entscheidung F1): erst Save-Pipeline/Bake fertigstellen,
dann M0 → M1 → M2/M3 parallel → M4 → M5. M1 haengt nicht am Bake und koennte bei Bedarf
vorgezogen werden.

### M0 — Entscheidungen & Papier (0,5–1 Tag)

**Erledigt 18.09.:** ADR-0006 accepted (`docs/adr/0006-motion-authoring.md`), Ticket 19 angelegt.
**M1 ebenfalls erledigt** (Modell/Datenpfad, 1135/2/129 grün) — siehe Ticket 19.

- ADR-0006 „Motion-Authoring im Editor v2" (oder Nachtrag zu ADR-0003): Preset-Linie,
  MotionSpec v2, self-hosted, Freeze-Regel, RM-Pflicht.
- Ticket 19 im editor-v2-Tracker anlegen (Umfang = dieser Plan).
- Offene Entscheidungen aus §8 festziehen.
- **Abnahme:** ADR accepted, Ticket existiert, HANDOFF/map referenzieren beides.

### M1 — Modell & Datenpfad (2–4 Tage; parallel zu Ticket 07-Rest moeglich)

1. `MotionSpecV2` + Preset-Whitelist (section-sdk, v1-kompatibel erweitern).
2. `EditorNode.motion` + `createEditorNode` (`document.ts`).
3. Patches `setNodeMotion`/`clearNodeMotion` (`patches.ts`, inkl. `prune`).
4. Ops `setMotion`/`clearMotion` (`editor-contract.ts`, `operations.ts` nach Muster
   `applySetNodeProp:356`) + `assertMotionSpec` (Whitelist, Intensity, RM, Delay).
5. Persistenz: `nodeSpec`, `PAGE_OPS`, `patchesToPending` (`persist.ts`).
6. Engine-Bridge: v2-Motion → v1 `Node.motion` (durchreichen) + Store-Schreibpfad.
7. Consistency: `pin-excess` (max 1), `char-split-excess` (max 1 weich),
   `reduced-motion-missing` (hart), `motion-preset-unknown`.
8. Migration: `motion` uebernehmen statt verwerfen (`migration.ts:58-91`).
9. Canvas-Adapter: `motion` in SectionTree-Knoten durchreichen (`adapter.ts`).
10. Tests: `operations.test`, `consistency`, `migration`, Bridge-Roundtrip.
- **Abnahme:** `setMotion` → speichern → neu laden → Spec identisch; v1-Bestandsdokument
  migriert mit Motion; Undo/Redo funktioniert; `pnpm test/typecheck/lint` gruen.

### M2 — Runtime & Bake (2–3 Tage; haengt an Ticket 13 Punkt 3 „Renderpfad")

**Erledigt 18.09.** — self-hosted Vendor (GSAP 3.15, ScrollTrigger, SplitText, Lenis),
`motion-data` v2 aus `motionConfigsForTree`, per-Preset-`needs` (Skripte nur wo noetig),
FOUC-Pending (Marker + noscript + 1,6-s-Failsafe + Runtime-Freigabe), Freeze-Kill-Switch
in Runtime und `visual.ts` (inkl. Gegenprobe). Zahlen: 1144/2/129, typecheck/lint 0.

1. GSAP/ScrollTrigger/SplitText/Lenis als **self-hosted Assets** im Bake
   (`bake.ts`, `Page.astro`); CDN-Konstanten ersetzt. ✔
2. `bakeSite` emittiert `motion-data` aus der v2-Quelle (eine Quelle). ✔
3. Freeze-Protokoll fuers Paritaets-Tor: Motion aus + Endzustand; Screenshot-Harness
   erweitern. ✔
4. Golden-Tests: `motion-data` JSON + `page.js` deterministisch; Bundle-Messung ≤ 150 KB. ✔
- **Abnahme:** Gebackene Seite animiert identisch zu Canvas-Configs; Paritaets-Tor stabil
  mit Freeze; Bundle-Budget eingehalten. (Browser-Paritaet mit laufender Motion folgt mit
  M4/M5, wenn der Canvas Motion ausfuehrt.)

### M3 — Inspektor-Panel (3–5 Tage; Teil von Ticket 02)

**Erledigt 18.09.** — Panel vollstaendig (Preset/Intensity-Cap/Trigger/Delay/Easing/Dauer/
Stagger/RM/Aktiv), Motion-Badge, MCP `set_motion`/`clear_motion`, `senify-motion`-Skill und
Portal-Guide; Profil kommt aus dem Site-Settings-Ticket 20 (Topbar-Select).

1. Eigener Tab/Abschnitt **„Motion"**: Preset-Picker (Kategorien A–G, mit Mini-Loop),
   Intensity-Dial, Trigger, Delay, Tokens (Ease/Duration/Stagger), RM-Variante,
   Enabled-Schalter. ✔
2. Live-Write per `setMotion` (Undo-faehig); Warnungen aus `consistency` inline. ✔
3. Motion-Badge am Knoten (Explorer/Canvas-Marker), damit Motion sichtbar ist. ✔ (Explorer)
4. MCP: `set_motion`/`clear_motion`; Agenten bekommen dieselben Faehigkeiten. ✔
5. Folge: `senify-motion`-Skillpaket (Presets + Guardrails, nach gsap-skills-Vorbild). ✔
- **Abnahme:** Eine Sektion erhaelt per Inspektor `fade-up` + Intensity + RM; Publish
  zeigt es; Agent kann dasselbe per MCP. ✔ (Browser-Test deckt Panel + Play ab)

### M4 — Canvas-Preview (3–5 Tage; haengt an Ticket 03 Live-Modus)

**Stufe 2 erledigt 18.09.** — Play-Schalter im Design-Modus: injiziert `motion-data` +
per-Preset-Vendor + Runtime in den aktiven Frame (Lenis aus, Kill-Switch-frei); Stoppen
setzt die Frames zurueck. Vendor kommt ueber `GET /api/motion-vendor/:name`.
**Offen:** Stufe 1 (Live-Modus mit echter Seite, Ticket 03); Stufe 3 (Scrub) bleibt M6.

- **Stufe 1:** Live-Modus zeigt die echte Seite (Ticket 03) → echte Motion ohne Extra-Code.
- **Stufe 2:** Design-Modus: Play-Button pro Sektion/Seite; Runtime laedt in den aktiven
  Frame, Timelines `paused`, Lenis aus; ein rAF-Loop; drei Frames nie gleichzeitig. ✔ (Seite)
- **Stufe 3 (optional):** Scrub-Slider fuer Pin-/Scrub-Presets.
- **Abnahme:** Play zeigt dieselbe Animation wie der Release; Editieren bleibt ohne
  Dauer-Animation moeglich; kein Performance-Einbruch der Arbeitsflaeche. (teilweise;
  vollstaendig mit Stufe 1)

### M5 — Guardrails, Paritaet, Agent-Experience (2–3 Tage)

**Erledigt 18.09.** — Profil-Gates in Schreib-/Submit-/Publish-Pfad, weicher
`reveal-too-long`-Hinweis, Skill/Guide, Freeze-Baseline + Gegenprobe; Motion-Sampling
bleibt M6.

- Harte Publish-Gates: max 1 Pin/Seite, max 2 Parallax-Layer, RM-Pflicht,
  Preset-Whitelist, LCP-Schutz (kein Above-fold-`opacity: 0` ohne Fallback). ✔
- Weiche Review-Hinweise: Reveals < 800 ms, 1 Char-Split/Seite, Preloader ≤ 2,5 s,
  Anti-Pattern-Katalog. ✔ (Reveal + Char-Split; Preloader ist `planned`)
- Paritaets-Tor mit Freeze endgueltig; Doku (Skill, HANDOFF, map). ✔
- **Abnahme:** Verstoss blockiert Publish nachweislich; Review zeigt weiche Hinweise. ✔

### M6 — Ausbau (spaeter, je eigenes Ticket)

- Freie Timeline/Scrub-Editor — **gestrichen** (Nutzerentscheidung 22.09.): die
  Presets decken die Faelle ab, F2 hatte sie nur als Option notiert.
- Page Transitions (View Transitions, degradiert ohne Support) als Preset. ✔ (22.09.,
  `page-fade` = `document`-Runtime: Head-CSS `@view-transition`, Intensity-Dauer,
  RM-Gate; kein Seiten-Skript)
- 3D-Preset (WebGL, genau 1 Canvas/Seite) — v1 vorbereitet. **Runtime-Entscheidung
  (22.09.): three.js direkt** (self-hosted, kein React im Release); Umsetzung offen.
- Motion an VCs/Templates (Phase 4); Site-Profile (Lenis, Intensity-Cap). ✔ (22.09.)
- Kleine Presets (D/E/F) ✔ (22.09.): `hover-lift`, `ambient-float`, `grain` als
  Head-CSS mit `data-motion`; `magnetic-button`, `tilt-card`, `cursor-glow` im
  page.js (canHover, quickTo, RM); `preloader-light` als Markup-Curtain (≤ 2,5 s);
  `modal` als Island-Medien-Lightbox (`<dialog>`).

**Aufwand gesamt M0–M5: ~2–3 Wochen fokussiert**, verteilt auf Phase 2/3; M1 kann sofort
parallel zum Ticket-13-Rest laufen.

## 5. Editor-UX im Detail

- **Ruhe als Default:** Beim Oeffnen/Editieren laeuft keine Animation. Motion wird per
  Play-Button (Sektion) oder Live-Modus erlebt. Das schuetzt Konzentration und
  Screenshot-Tools.
- **Preset-Auswahl:** Karten mit Namen, Kategorie, Mini-Loop (reduziert, nur sichtbarer
  Bereich), Beschreibung „was passiert". Intensity als Dial mit drei Ankerpunkten
  (subtil/standard/ausdrucksstark — v1-Mapping 1–3/4–7/8–10).
- **RM-Variante** mit Empfehlung vorbelegt (`static`), Warnung bei `off`.
- **Reduced-Motion-Toggle** im Editor (System + Override) — Vorschau der RM-Variante.
- **Freeze-Hinweis** im Paritaets-Report, wenn Motion eingefroren wurde.

## 6. Guardrails & Barrierefreiheit

| Regel | Haerte | Durchsetzung |
|---|---|---|
| max 1 Pin-Preset/Seite (`scrub-pin`, `sticky-stack`, `horizontal-pan`) | hart | `consistency.ts`, Publish-Gate |
| max 2 Parallax-Layer/Viewport | hart | `consistency.ts` |
| Reduced-Motion-Variante vorhanden (Default `static`) | hart | Schema + Gate |
| Preset-Whitelist, Intensity 1–10, Delay ≥ 0 | hart | Schema/`assertMotionSpec` |
| Keine Scroll-Listener-Muster | hart (Architektur) | Runtime erzwingt (nur ScrollTrigger) |
| Reveals < 800 ms, 1 Char-Split, Preloader ≤ 2,5 s | weich | Review-Hinweis |
| Hero nie `opacity: 0` ohne Fallback (LCP) | hart | Gate in Bake/Review |

## 7. Risiken & Gegenmassnahmen

1. **Paritaets-Flakiness** → Freeze-Protokoll (E7), Screenshot erst nach `fonts.ready`
   und Timeline-`progress: 1`.
2. **Runtime-Drift Canvas/Bake** → eine Config-Ableitung (`motionConfigsForTree`) und ein
   Runtime-Modul; Golden-Tests auf beiden Seiten.
3. **Editor-Performance** → Runtime nur Play/Live, ein Loop, Lenis aus.
4. **Lenis im iframe** → nie im Editor-Canvas aktiv; nur Release/Live.
5. **Firefox-Luecke** → CSS-Scroll-Timelines nur als Enhancement; GSAP-Fallback Pflicht.
6. **Preset-Abdeckung 13/24** → Abdeckungsmatrix im Ticket; D/E/F ueber Islands, G separat;
   klare Warnung statt stillem Nichtstun.
7. **v1-Bestandsdaten** → Migration in M1, Test mit Bestandsbaum.
8. **Umfang** → M6 strikt spaeter; M0–M5 liefern Framer-Niveau fuer die Kern-Presets.

## 8. Entschiedene Richtungen (18.09.2026)

- **F1 Zeitpunkt:** Start nach Ticket-13-Rest (Save-Pipeline/Bake steht).
- **F2 Authoring:** Presets + Intensity; freie Timeline bleibt M6-Option.
- **F3 Canvas-Playback:** Live-Modus + Play-Button (Stufen 1+2), Scrub optional in M6.
- **F4 Ticket-Form:** neues Ticket 19 (`issues/19-motion-authoring.md`) + ADR-0006.
- **F5 Hosting:** self-hosted (bestaetigt, M2).
- **F6 Site-Profile:** v1-Tabelle 1:1 uebernehmen (`clean` · `standard` · `showcase`,
  Default `standard`, Caps 3/7/10, Lenis aus/an/an, Pin 0/1/1, 3D nein/nein/ja;
  3D-Umsetzung bleibt M6).
- **F7 Profil-Durchsetzung:** M2 nutzt das Profil, wo der Bake es kennt (Lenis);
  harte Caps/Preset-Klassen in M5; Profil in den Editor erst mit eigenem
  Site-Settings-Ticket (vor M3).

## 9. Nicht-Ziele (v1 dieses Plans)

- Kein freier Motion-Code durch Agenten.
- Kein Motion-Register als zweites Regel-System.
- Keine SPA-artigen Layout-Morphs/Page-Transitions in M0–M5 (M6).
- Kein WebGPU/3D-Umbau (v1 WebGL-Vorbereitung bleibt).
- Keine Aenderung an ADR-0003 (GSAP-Kern bleibt; wird nur auf v2 angewandt).
