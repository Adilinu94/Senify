# Übergabe: Editor v2 (Senify) — Stand 19.09.2026 (Nachtrag: Ticket 13 vollständig, Klassen am DOM, Motion M0–M5)

Diese Datei ersetzt die Abend-Fassung vom 17.09. und den ersten 18.09.-Stand. Sie beschreibt den
Arbeitsbaum so, dass eine Person oder ein Agent ohne Vorwissen weiterarbeiten kann: was entschieden
ist, was gebaut ist, was offen ist, wie man startet und prüft, welche Fallen lauern.

**Wichtigster Satz vorab:** Der Arbeitsbaum enthält **uncommitteten Produktcode** (Style-Rules,
Ticket 13 Rest) **und uncommittete Planungsdokumente** (Motion-Papierpaket, §2.5). Der Handoff
beschreibt den Arbeitsbaum, **nicht `HEAD`** (letzter Commit: `e2783da`). Wer `git status` liest,
sieht deshalb mehr als die letzten Commits hergeben.

---

## 1. Was am 18./19.09. geschah (in Reihenfolge)

1. **Entscheidung O13 — offenes CSS statt Whitelist.** Der Stilwert-Raum ist offen; die
   Property-Tabelle (`STYLE_PROPERTIES`) beschreibt ab jetzt die **Oberfläche** (welches
   Bedienelement), nicht die Erlaubnis. Festgehalten in **ADR-0005**
   (`docs/adr/0005-offenes-css-statt-whitelist.md`), in `map.md` als O13, im Ledger.
2. **Fünf Tickets neu gefasst:** 07 (kanonisches Modell statt engem B1-Entwurf), 10 (Tor
   abschaffen statt Liste verlängern), 13 (realer Stand: Server fertig, Editor-Anbindung offen),
   18 (`authoredBy` statt `origin`, Wert-Ebene-Fence), 02 (Punkt 1 als erledigt markiert).
3. **O14 eröffnet:** Templates + Outlet fehlen im editor-v2-Plan (Präzisierung: der v1-Kern hat
   sie bereits, die Lücke ist editor-v2-seitig und bei VC-Templates).
4. **Reihenfolge im Ledger neu gefasst:** die **Wert-Grammatik** ist Vorbedingung; erst wenn ihre
   Umgehungs-Tests grün sind, darf `assertStyleProp` fallen.
5. **Fehlerdurchlauf über die Abend-Dokumente:** Zahlen (33 statt 30), 12 kaputte Pfade,
   Widersprüche zwischen Ticket 13 und seinem Korrekturblock, Ticket 18/07 (`origin`),
   Ticket 10/ADR (`assertKnownProp`), veraltete Ledger-Notizen, O14-Prämisse — alle korrigiert.
6. **Vorgefunden (nicht von dieser Runde):** der Server-Teil der Style-Rule-Registry lag
   uncommittet im Arbeitsbaum; ein zweiter Strang baute O13/Ticket 10 im Compiler um.
7. **Ticket 13 Rest gebaut:** der **Bake-Renderpfad** (`bakePages` liest die Registry,
   `styleRulesCss` schreibt `assets/style-rules.css` in `@layer user-authored`, nach der
   Widget-Basis gelinkt) und die **Klassen-Transportlücke** (v1-Knoten trägt `classes`,
   `updateNodeMeta` kann setzen/ergänzen/entfernen, neue Editor-Mutation `setNodeMeta`,
   Pipeline sendet die Patches). Ein echter Fund dabei: der **Layout-Splice rekeyt Knoten-IDs** —
   class-Regeln wandern mit, `scoped` verliert seine Draft-ID im Release (benannt, eigenes Ticket).
8. **Motion: Recherche, Papierpaket, Ticket 19.** Der v1-Motion-Stack (ADR-0003: GSAP +
   ScrollTrigger + Lenis, MotionSpec, 24 Presets) existiert im Kern, aber der v2-Umbau hat ihn
   verloren (`migration.ts` kopiert `motion` nicht — der Kommentar dort behauptet fälschlich, nur
   `hidden` falle weg). Externe Recherche (GSAP ist seit Webflow 100 % frei inkl. Commercial;
   Lenis MIT; CSS Scroll-Driven Animations weiter nicht Baseline) und die Analyse des
   Elementor-Plugins `wp-gsap-heading-reveal` sind abgeschlossen; das Papierpaket liegt unter
   `.scratch/motion-v2/` (7 Dokumente), Ticket 19 ist angelegt. **Kein Motion-Code geschrieben.**
9. **Verifikation dieser Runde:** Der gemeldete Ticket-13-Rest-Stand wurde gegen den Arbeitsbaum
   geprüft — Zahlen und Behauptungen bestätigt (§2.4). Eine Abweichung in der Meldung: der
   `style-rules.css`-Link liegt in `Page.astro:80` (Body nach `<Section>`), nicht bei `:66`.
10. **Motion M0 + M1 umgesetzt (Ticket 19):** ADR-0006 angenommen
    (`docs/adr/0006-motion-authoring.md`); das Modell steht — Preset-Registry (24, mit Flags)
    in `section-sdk`, `EditorNode.motion`, Ops `setMotion`/`clearMotion` mit Validierung,
    Transport, Bridge auf die v1-Ops, Consistency-Guardrails, Migration trägt Motion,
    Canvas-Adapter reicht sie durch.
11. **Motion M2 umgesetzt (Ticket 19):** Runtime/Bake steht — GSAP 3.15 + ScrollTrigger +
    SplitText + Lenis **self-hosted** als Renderer-Dependencies (kein CDN), `motion-data` v2
    aus `motionConfigsForTree` (Breakpoints zentral, `hides`/`needs`/`reducedMotion` aus der
    Registry, `enabled: false` übersprungen), per-Preset-Skripte, FOUC-Pending
    (`data-motion-pending` + `<noscript>` + 1,6-s-Failsafe), Reduced-Motion-Policies pro
    Eintrag, Freeze-Kill-Switch `__SENIFY_MOTION__` in Runtime und `visual.ts` inkl.
    Browser-Gegenprobe. Site-Profile 1:1 entschieden (F6/F7).
12. **Ticket 20 + Motion M3–M5 umgesetzt (18.09.):** Site-Profil erreicht den Editor
    (`PATCH /api/sites/:id` mit `profile`, Topbar-Select, Wechsel-Validierung über
    `profileIssues`; `SiteProfile`/`SITE_PROFILES` aus section-sdk). Inspektor vollständig
    (Cap, Easing, Dauer/Stagger, RM, Aktiv, gesperrte Presets markiert, Warnungen inline),
    Explorer-Badge, MCP `set_motion`/`clear_motion`, Skill `motion.md` + Portal-Guide.
    **M4 Stufe 2:** Play-Schalter im Design-Modus injiziert `motion-data` + Vendor
    (`GET /api/motion-vendor/:name`) + Runtime in den aktiven Frame (Lenis aus); Stoppen
    setzt die Frames zurück. **M5:** `hardGuardrailsForTree(tree, profile)` in Schreib-,
    Submit- und Publish-Pfad; weicher `reveal-too-long`-Hinweis. **Ticket 15:** PG-Dialekt-
     Gate (`dialect-gate.test.ts`, Gegenprobe inklusive). Offen: M4 Stufe 1
     (Live-Modus, Ticket 03), Scrub (M6).
13. **Tickets 21 + 22 umgesetzt (18.09.): Klassen am DOM + scoped-Rekey im Bake.** Beim Bau der
    Rekey-Loesung gefunden: `node.classes` und die generierte Scope-Klasse erreichten nie das
    DOM — der Compiler ankert `class`-Regeln als `[data-node-id].name` und scoped-Regeln als
    `[data-node-id].__senify_scope_<id>`, beide waren tote Regeln. Jetzt tragen
    `SectionShell`/`PrimitiveNode`/Unbekannt-Platzhalter die Klassen am Wurzelelement
    (`nodeRootClasses`). Die ID-Map des Layout-Splices reist als `nodeIdMap` pro Route in den
    Bake, `styleRulesCss` remappt scoped-Regeln auf die komponierten Knoten (eine Kopie je
    Auspraegung). Verifiziert: 1165/2/131, typecheck 0, lint 0.
14. **Slot-/Collection-Transport abgeschlossen und verifiziert (19.09.).** Ein **paralleler
    Strang** hatte den Arbeitsbaum nach dem letzten Gesamtlauf (18.09. 22:04) geaendert:
    `setSlotContent`/`createCollectionEntry`/`updateCollectionEntry` sind jetzt durchgaengig
    (Section-Contract + Apply + Bridge + Save-Pipeline), aber ein Bridge-Test erwartete noch die
    alte Ablehnung und der `default`-Zweig der Bridge war durch die vollstaendige Fallabdeckung
    ein Typfehler. Beides behoben, Engine-Abdeckung ergaenzt (Validierung, Undo-Roundtrip) →
    **1168/2/131**, typecheck 0, lint 0. Grenze (benannt): Editor adressiert Katalog-
    `collection`, die Engine `collection-list`; die UI-Nutzung faellt mit dem E2-Cutover.
15. **Ticket 14 umgesetzt (19.09.): Klassen-Emission gemessen und auf global umgestellt.**
    Messung (`pruef-klassen-emission.mjs`, Bericht `.scratch/refs/klassen-emission.md`):
    regional gegen global **8,2x / 6,57x / 4,23x** Ersparnis (Dokumente a/b/c),
    Korrektheitsprobe gruen — das Ticket-Kriterium („bei b mehr als ~2x") ist deutlich erfuellt.
    `compileCss`-Default ist jetzt `classEmission: "global"` (`.cls` einmalig je Klasse, Dedupe
    ueber alle Traeger, Reihenfolge aus der Regel-`order`); `"regional"` bleibt als Option und
    Rueckweg. Knoten-eigene Zustaende bleiben verankert (`[data-node-id].cls:hover`), weil `.cls`
    (0,1,0) gegen `[data-node-id]:hover` (0,2,0) sonst verloere (O1). Golden-Snapshots und
    betroffene Tests nachgezogen, neue Testdatei `css-class-emission.test.ts`. Nebenbefund im
    selben Lauf: der Live-Modus-Klick des Browser-Tests traf den Banner-Link (`/kontakt`) und
    navigierte den Frame weg (404) — Klick geht jetzt auf den linkfreien Divider (per
    Stash-Gegenprobe belegt, dass es nicht an dieser Runde lag). Verifiziert: **1176/2/132**,
    typecheck 0, lint 0.

**Kein Commit in dieser Runde.**

---

## 2. Der Code-Stand im Arbeitsbaum (uncommittet, ehrlich)

### 2.1 Fertig: Style-Rule-Registry, Server-Seite

- `sites.style_rules_json` additiv (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `db.ts`);
  `jsonColumns()` erkennt jetzt auch per `ALTER` ergänzte jsonb-Spalten (sonst übergäbe ein
  Restore ein Objekt statt JSON-Text).
- Kanonisches Modell `packages/widget-engine/src/css/style-rule.ts`: `id`, `name`,
  `kind class|ambient|scoped`, freier `selector`, `order`, `styles`, `stylePriorities`,
  `contextStyles`, `contextStylePriorities`, `rawCss`, `scope`, `origin` (Import-Herkunft),
  mit TypeBox-Schema, tolerantem Parser, Konstruktoren und Compiler-Brücke.
- Store-CRUD mit Audit (`store.ts`): `listStyleRules`, `getStyleRule`, `createStyleRule`,
  `updateStyleRule`, `deleteStyleRule`, `reorderStyleRule` (`order` wird auf die Array-Position
  normalisiert).
- Routen: `GET|POST /api/sites/:siteId/style-rules`, `GET|PATCH|DELETE …/:ruleId`,
  `POST …/:ruleId/reorder` (read / write / publish).
- `editor-bridge.ts` lehnt Style-Rule-Ops im Seiten-Batch bewusst ab (`siteWide()`) und nennt die
  Site-Route.
- Tests: `engine/test/style-rules.test.ts` (echte HTTP-Runde), `engine/test/db-schema.test.ts`,
  `widget-engine/test/style-rule.test.ts`.

### 2.2 Erledigt am 18.09.: Ticket 07 (Stufen 0-6), Wert-Grammatik, Schreibtor, vierter State

- **Ticket 09:** `disabled` als vierter Pseudo-State in `cascade.ts` (nach `active`) und
  `canvas.ts` (`PREVIEW_STATES`); Tests in `css-cascade.test.ts`.
- **Ticket 07 Stufe 0 (das Sicherheits-Gate):** neue Datei
  `packages/widget-engine/src/css/value-grammar.ts` — Normalisierung (Escapes, Kommentare,
  Schreibweisen) plus Allowlist-Parser; `value-grammar.test.ts` mit 94 Tests (23 Umgehungs-,
  50+ Durchlassfälle).
- **Compiler verdrahtet:** Text-Werte (`boxShadow`, `transform`, `filter`, …) werden geprüft,
  unsichere Werte verworfen — `css-injection.test.ts` (9 Tests) belegt es. Das hat ein
  **echtes, bis dahin offenes Loch geschlossen**: `boxShadow: "red; } body {"` wurde vorher
  ungeprüft ins Stylesheet geschrieben.
- **Schreibpfad:** `assertStyleProp` entfernt; `assertSafeValue`/`assertStyleDeclaration`
  prüfen Knoten-Props und Stilregeln und werfen `SenifyError` mit Feldpfad.
- **Ticket 10 (bis auf die Inspektor-Anzeige):** unbekannte Properties werden durchgereicht
  (sortiert, baseline-fähig — kein Wiederholen in schmaleren Device-Blöcken), `styleGroups`
  entsperrt, `canonicalStyleKey` löst `borderRadius`/`border-radius` auf dieselbe Deklaration
  auf, neue `layout`-Gruppe plus 25 Layout-Einträge als Bedienelement-Beschreibung.
  `css-open-space.test.ts` (10 Tests). Goldens und Katalog-Tests nachgezogen.
- **Zweiter echter Fund:** Katalog-Controls (`text`, `level`, `striped`, `dropCap`) sind
  Verhaltens-Props, kein CSS — der offene Durchreich-Pfad schließt sie aus, sonst stünde
  `text: Hallo` im Stylesheet.

### 2.3 Style-Pipeline: Bake-Renderpfad, Klassen-Transport, Klassen-Emission (Nachtrag)

- **Bake liest die Registry:** `bakePages` (`engine/src/bake.ts:351`) lädt
  `store.listStyleRules(siteId)` und reicht sie an `bakeSite` (`:397`);
  `styleRulesCss` (`renderer/src/style-css.ts:75`) kompiliert sie in `assets/style-rules.css`
  (class-Regeln global `.cls` seit Ticket 14, `ambient` verbatim, `scoped` am Knoten, `rawCss`
  als geprüftes `@keyframes`). Eine Quelle: die Registry — nicht Dokument *und* Spalte.
- **Layer-Reihenfolge:** `style-rules.css` wird im Template **im Body nach** der Widget-Basis
  gelinkt (`Page.astro:80`, nach `<Section>`), damit `@layer user-authored` in derselben Ordnung
  entsteht wie im Canvas-Frame (Basis schwächer, authored Regeln danach).
- **`styleRuleToClassRule`** ist die eine Abbildung Registry -> Compiler für alle drei
  Kinds; der Editor (`classRules`, `document.ts:205`) nutzt sie ebenfalls (vorher baute er sie nach).
- **Klassen-Transport:** `Node.classes` (section-sdk), `updateNodeMeta` mit `classes`
  (setzen), `addClasses`/`removeClasses` (Diff) und `null`-Löschung für `hidden`/`locked`
  (undo-fähig, `apply.ts:593-617`); neue Editor-Mutation `setNodeMeta`
  (`editor-contract.ts:111-127`); Bridge und Save-Pipeline übersetzen sie
  (`editor-bridge.ts:136-165`, `persist.ts:239-252`). Die Slot-/Collection-Ops sind seit dem
  Nachtrag vom 18.09. (22:04) ebenfalls durchgängig (`setSlotContent`,
  `createCollectionEntry`, `updateCollectionEntry`; Bridge + Apply + Undo-Patches);
  die UI-Nutzung fällt mit dem E2-Cutover (Katalog-Namen in der Engine).
- **Echter Fund (mit Ticket 22 geschlossen):** `templates.ts` `rekeyChildren` (`:114-150`) vergibt
  beim Layout-Splice frische Knoten-IDs. Class-Regeln wandern am Knoten mit und bleiben korrekt;
  eine `scoped`-Regel (gebunden an die Draft-ID) verlor im Release ihren Knoten. Gelöst: der
  Splice füllt eine Draft→komponiert-Map, der Bake reicht sie pro Route als `nodeIdMap` durch,
  `styleRulesCss` remappt die scoped-Regeln darauf (eine Kopie je komponierter Ausprägung).
- **Zweiter Fund (Ticket 21):** `node.classes` und die Scope-Klasse standen nie im DOM — damit
  waren `class`- und `scoped`-Regeln auch ohne Splice tote Selektoren (Canvas und Bake teilen die
  Komponenten). `SectionShell`/`PrimitiveNode`/Unbekannt-Platzhalter setzen jetzt User-Klassen +
  deterministische Scope-Klasse (`nodeRootClasses`, `shared.tsx`).
- **Tests:** `renderer/test/style-rules-css.test.ts` (4, inkl. echtem Bake),
  `engine/test/bake.test.ts` (Registry-Regel im Output), `mutations.test.ts` (Klassen-Diff +
  Undo), `editor-mutations.test.ts` (Bridge + Route), `save-pipeline.test.ts`
  (Klassen-Roundtrip inkl. Undo gegen die echte Engine).
- **Klassen-Emission global (Ticket 14, 19.09.):** `compileCss` emittiert `class`-Regeln
  einmalig je Klasse (`.cls`, Dedupe über alle Träger, Reihenfolge aus der Regel-`order`);
  die regionale Form (`[data-node-id].cls` je Träger) bleibt als Option
  (`classEmission: "regional"`, Default ist `"global"`). Gemessen: 4,2–8,2x weniger Bytes
  (`.scratch/refs/klassen-emission.md`). Knoten-eigene Zustände bleiben verankert
  (`[data-node-id].cls:hover`), weil `.cls` (0,1,0) gegen `[data-node-id]:hover` (0,2,0)
  sonst verlöre. Beleg-Test `widget-engine/test/css-class-emission.test.ts`.

### 2.4 Gemessener Stand (19.09., dieser Arbeitsbaum)

- `pnpm test`: **1176 grün / 2 übersprungen / 132 Dateien** (19.09., ~10:25, 143 s, Log
  `.scratch/testlauf-19-09-ticket14.log`), `pnpm typecheck`: Exit 0, `pnpm lint`: Exit 0.
  Vorherige Stände: 1168/2/131 (Slot-/Collection-Transport), 1165/2/131 (Tickets 21/22),
  1157/2/131 (Ticket 15), 1155/2/130 (Ticket 20 + M3–M5), 1144/2/129 (Motion M2),
  1135/2/129 (Motion M1), 1121/2/127 (Ticket 13 Rest), 1073/2/123 davor.
- Ein **Zwischenstand** um 13:49 war rot (1045/17/122, Log `.scratch/testlauf-18-09.log`):
  die Golden-Snapshots stammten noch aus der Zeit vor der Öffnung. Sie sind inzwischen
  nachgezogen; der Eintrag bleibt als Beleg, dass die Reihenfolge (erst Grammatik, dann Tor)
  eingehalten wurde.
- Die 2 übersprungenen Tests brauchen echtes Postgres (`TEST_DATABASE_URL`).
- **Kein Commit** — weder für die vorgefundene Engine-Runde noch für Ticket 13 Rest noch für
  Motion M0–M2 noch für Tickets 21/22 noch für den Slot-/Collection-Transport noch für
  Ticket 14. `git status`: 97 geänderte, 73 neue Dateien (HEAD `e2783da`).

### 2.5 Motion: M0–M5 + Site-Profil (18.09.)

- **M0:** ADR-0006 accepted; Papierpaket in `.scratch/motion-v2/` — `research.md` (externer
  Stand + Codebase-Befund), `plan.md` (M0–M5), `plugin-analyse.md` (Elementor-Plugin
  `wp-gsap-heading-reveal`), `preset-matrix.md` (Contract + Abdeckung), `payload-spec.md`
  (`motion-data` v2), `freeze-spec.md` (Parität/Freeze), `adr-0006-entwurf.md` (Protokoll).
- **M1 (uncommittet):** `section-sdk/src/motion.ts` (Preset-Registry, 24 Einträge mit
  Flags/GSAP-Bedarf/Coverage), `MotionSpec` um `reducedMotion`/`enabled` erweitert,
  `EditorNode.motion` + Patch `setNodeMotion` + Ops `setMotion`/`clearMotion` (mit
  `assertMotionSpec`), Transport in `persist.ts`, Bridge 1:1 auf die v1-Ops, Consistency
  (`motion-preset-unknown`, `motion-pin-excess`), Migration trägt Motion, Canvas-Adapter.
- **M2 (uncommittet):** `gsap@3.15.0`/`lenis@1.3.26` in `packages/renderer`; Bake kopiert
  `assets/vendor/*.min.js` und verlinkt seitenweise nur die nötigen Skripte; `motionDataFor`
  (v2-Envelope, Breakpoints aus `mediaMaxWidth`); `motionPends` + `data-motion-pending` in
  `SectionShell`/`PrimitiveNode`, Pending-CSS/noscript/Failsafe in `Page.astro`; RM-Policies
  pro Eintrag; `visual.ts` mit Kill-Switch, `scroll-behavior:auto`, 2 rAF.
- **M3 (uncommittet):** Motion-Panel vollständig (Cap-Hinweis, Easing, Dauer-/Stagger-
  Faktor, RM-Variante, Aktiv-Schalter, „gesperrt"-Markierung, Engine-Warnungen inline),
  Explorer-Badge, MCP `set_motion`/`clear_motion`, `senify-motion`-Skill + Portal-Guide.
- **M4 Stufe 2 (uncommittet):** `GET /api/motion-vendor/:name` serviert die Runtime-Dateien;
  der Topbar-Schalter „Motion" injiziert `motion-data` + per-Preset-Vendor + Runtime in den
  aktiven Frame (Lenis aus); Stoppen erzeugt die Frames neu. Stufe 1 offen (Ticket 03).
- **M5 (uncommittet):** `hardGuardrailsForTree(tree, profile)` + `runChecks` + Schreibpfad
  prüfen Cap/Klassen/Pins/3D; weicher `reveal-too-long`-Hinweis im Bake.
- **Ticket 20 (uncommittet):** `PATCH /api/sites/:siteId` mit `name`/`profile`
  (`UpdateSiteBodySchema`, Audit `update_site_profile`), `Store.updateSiteProfile`,
  `SiteProfile`/`SITE_PROFILES` aus section-sdk, `profileIssues` im Editor,
  Topbar-Select + Wechsel-Validierung, App lädt das Profil in `pageView`.
- Tests: section-sdk/renderer/registry/Bake (Budget ≤ 150 KB), Engine (Profil-Route,
  Vendor-Route, Gates), Editor (Consistency, Panels), MCP/Skills/Guides, Visual-Gegenprobe,
  Browser (Profil-Select, Play → `window.gsap` im Frame).

### 2.6 Klassen am DOM + scoped-Rekey (Tickets 21/22, 18.09.)

- **Ticket 21 (eigener Fund):** `nodeRootClasses(node)` in `registry/src/components/shared.tsx`
  liefert `node.classes` + `__senify_scope_<id>`; `SectionShell`, `reactAttrs` (nur
  `spec.root === true`) und der Unbekannt-Platzhalter in `map.tsx` setzen sie. Die Scope-Klasse
  ist deterministisch, deshalb braucht der Renderer keine Regel-Registry; sie ist inert, solange
  keine scoped-Regel existiert.
- **Ticket 22 (Rest aus 13):** `rekeyChildren`/`spliceOutlet`/`composePageTree` füllen eine
  `Map<NodeId, NodeId>`; `buildBakeInput` hängt sie pro Route als `nodeIdMap` an die
  `BakePageInput`s (Pagination-Varianten teilen sie); `BakePageInput`/`StyleCssPage` tragen das
  Feld; `styleRulesCss` baut scoped-Regeln kanonisch auf die Ziel-ID um (`scopeNameFor`/
  `scopeSelectorFor`), dedupliziert je Regel+Ziel, eine Kopie pro komponierter Ausprägung.
- Tests: `engine/test/bake.test.ts` (scoped über den Layout-Splice + Klasse am Element),
  `renderer/test/style-rules-css.test.ts` (+2 Remap/Dedupe), `engine/test/templates.test.ts`
  (+3 Map), `registry/test/components.test.ts` (+2 DOM-Klassen); exakte
  `class="w-…"`-Erwartungen in `registry`/`renderer`/`app`-Tests angepasst.
- Zahlen: 1165/2/131 (§2.4).

---

## 3. Phasenstand

| Phase | Inhalt | Zustand | Beleg |
|---|---|---|---|
| −1 | Auslieferungsfehler behoben | ✅ | Commit `7c521e0` |
| 0 | Fundament: Widget-Katalog, CSS-Compiler, Store, Canvas | ✅ | Commit `862d795` |
| 1 | Markup-Beschreiber, Grund-CSS in beiden Pfaden, Durchstich mit Paritäts-Tor | ✅ | Commit `a53f583` |
| — | Analyse-Runde: B1–B12, Tickets 07–18, O10–O12, ADR-0004 | ✅ | `research/`, `issues/07–18` |
| — | 18.09.: O13/ADR-0005, Tickets 07/10/13/18/02 neu, O14, Wert-Grammatik | ✅ | `docs/adr/0005`, `issues/`, `ledger.md` |
| — | 18.09.: Ticket 13 Rest (Bake + Klassen-Transport + scoped-Rekey) + Klassen am DOM + Motion M0–M5 + Ticket 20; 19.09.: Slot-/Collection-Transport verifiziert | ✅ | `issues/13`, `issues/19`–`22`, `docs/adr/0006`, `.scratch/motion-v2/` |
| 2 | Style-Rule-Registry (Server ✅), Wert-Grammatik ✅, Editor-Modell ✅, Inspektor | 🔄 | `issues/07`, `10`, `13`, `02` |
| 3 | Chrome: Explorer, Kontextmenü, Spotlight, DnD, Inline-Edit, Undo-UI, Keyboard | ❌ | `issues/03` + 12/16 |
| 4 | Visual Components, Sections als VCs, Puck-Cutover | ❌ | `issues/04` + 11 (vorher) + 17 (vorher) |
| 5 | SSE-Kanal, Live-Mitverfolgung, Leistungsbudget | ❌ | `issues/05` |

---

## 4. Entscheidungen, die gelten

**Aus früheren Runden unverändert:** E1 (voller Neubau), E2 (Strangler mit Puck bis zum
Paritäts-Tor), E3 (ausgeklammert: Rollen, Mehrsprachigkeit, Hosting, A11y, Versionierung,
Gleichzeitigkeit), E4 (kein Freigabe-Gate; O9-Pflichtprüfung), D1–D12, O1–O9.

**17.09.:** O10 drei Gerätestationen (desktop 1440 / tablet 1024 / mobile 390; freie Breite ist
Ansichtssache), O11 vier Pseudo-States inkl. `disabled`, O12 PG-only bis Phase 5 (**ADR-0004**).

**18.09.:**
- **O13 — offenes CSS (ADR-0005).** Vier Regeln: (1) kein Property-Verbot im Schreibpfad,
  (2) `styleGroups` ist Sortierung, kein Verbot, (3) drei Freiheits-Ventile gehören zum Modell
  (freie `ambient`-Selektoren inkl. Pseudo-Elemente, `rawCss` für `@keyframes`, `contextStyles`
  für eigene Bedingungen), (4) die Grenze ist **Sicherheit** — und zwar als **Allowlist auf der
  Wert-Grammatik** mit Normalisierung vor der Prüfung, nicht als Denylist auf Zeichenketten.
  **Die Grammatik ist Vorbedingung:** solange ihre Umgehungs-Tests nicht grün sind, bleibt
  `assertStyleProp` stehen. **Nur das Style-Tor fällt:** `assertKnownProp` (Knoten-Props gegen
  den Katalog, Tippfehler-Erkennung) bleibt.
- **O14 — Templates + Outlet fehlen im editor-v2-Plan** (offen). Präzisierung: `page_templates`
  und `templates.ts` existieren im v1-Kern; die Lücke ist editor-v2-seitig und bei VC-Templates.
- **Zwei-Ebenen-Fence:** ADR-0005 öffnet die **Property-Ebene** für Menschen. Die **Wert-Ebene**
  bleibt für Agenten eingehegt (Ticket 18: Token-Zwang statt Roh-Hex), verortet im Schreibpfad des
  Stores, abhängig von `authoredBy`.
- **Motion (Ticket 19):** F1 Start **nach Ticket-13-Rest** (erfüllt); F2 Authoring **Presets +
  Intensity** (keine freie Timeline — bleibt M6); F3 Canvas **Live-Modus + Play-Button**, ruhend
  als Default; F4 Verankerung als **Ticket 19 + ADR-0006**; F5 Runtime **self-hosted**
  (GSAP 3.15 + ScrollTrigger + SplitText + Lenis, kein ScrollSmoother); **F6 Site-Profile 1:1
  aus v1** (`clean`/`standard`/`showcase`, Default `standard`, Caps 3/7/10, Lenis aus/an/an,
  Pin 0/1/1, 3D nein/nein/ja — 3D bleibt M6); **F7 Durchsetzung gestaffelt** (M2 Lenis, M5
  harte Gates, Profil im Editor über Ticket 20).
  M0–M5 sind umgesetzt (§2.5); M4 Stufe 1 (Live-Modus mit echter Seite) hängt an Ticket 03.

---

## 5. Die Tickets 01–19

Alle unter `.scratch/editor-v2-rebuild/issues/`. Stand:

| Ticket | Kern | Stand |
|---|---|---|
| 01-widget-engine-canvas | Phase 0/1: Fundament, Primitive, Canvas, DnD | Fundament ✅, Punkt 7 (DnD) offen → Ticket 12 |
| 02-style-engine-inspector | Inspektor, volle CSS-Fähigkeiten, MCP-Style-Tools | Punkt 1 erledigt (Server); Punkte 2–7 offen |
| 03-editor-chrome | Phase 3: Explorer, Kontextmenü, Spotlight, Inline-Edit, Tastatur | offen |
| 04-visual-components | Phase 4: VCs, Sections als VCs, Cutover | offen |
| 05-live-build-follow-polish | Phase 5: SSE, Live-Mitverfolgung | offen |
| 06-adr-puck-abschied | ADR-06 (Puck-Abschied) | offen |
| 07-style-rule-modell | Kanonisches Modell im Editor-Dokument + Wert-Grammatik + `states`/`authoredBy` | **erledigt (Stufen 0–6)** |
| 08-geraetestationen | Drei Stationen | **erledigt** (O10; ui-plan/aufgaben korrigiert) |
| 09-pseudo-state-disabled | `disabled` als vierter State | **erledigt** (O11) |
| 10-layout-vokabular | Tor abschaffen, Layout als Oberflächen-Beschreibung, CSS-Namen | **erledigt** bis auf die Inspektor-Anzeige |
| 11-hidden-devices-migration | per-Breakpoint `hidden` retten | offen, **vor Cutover** |
| 12-dnd-vorziehen | DnD/Plus-Punkte/Einfügelinie | offen, parallel |
| 13-bridge-style-rules | Editor-Anbindung, Bake, `states` im Transport | **erledigt** (Server, Transport, Save-Pipeline, Bake, scoped-Rekey mit 22, Slot-/Collection-Transport); UI-Nutzung der Slot-Ops mit dem E2-Cutover |
| 14-klassen-emission-messen | Klassen-Emission regional vs. global messen | **erledigt (19.09.)**: global umgestellt (4,2–8,2x), regional als Option |
| 15-dialekt-entscheidung | ADR-0004 + grep-Gate-Test | **erledigt** (18.09.) |
| 16-marker-overlay-portal | Marker-Overlay im Portal (Alt-Palette beenden) | offen |
| 17-releases-cutover | Publish über `POST /api/releases`, Paritäts-Tor als CI-Blocker | offen |
| 18-agent-style-gate | Wert-Ebene-Fence als Tests (`authoredBy`) | offen |
| 19-motion-authoring | Motion-Spec v2 im Editor: Modell/Bridge, Inspektor, Canvas (Play), Guardrails | **M0–M5 umgesetzt** (18.09.); offen: M4 Stufe 1 (Ticket 03) |
| 20-site-settings-profile | Site-Profil im Editor: Kanal, Anzeige, Wechsel-Validierung, Profil-Gates | **umgesetzt** (18.09.) |
| 21-klassen-am-dom | User-Klassen + Scope-Klasse am Wurzelelement (Anker-Selektoren treffen in Canvas und Bake) | **umgesetzt** (18.09.) |
| 22-scoped-rekey-bake | ID-Map aus dem Layout-Splice, `nodeIdMap` pro Route, scoped-Remap in `styleRulesCss` | **umgesetzt** (18.09.) |

---

## 6. Nächste Schritte (Reihenfolge aus `ledger.md`)

**Erledigt am 18.09.:** Ticket 09, die Wert-Grammatik (Ticket 07 Stufe 0), Ticket 10
bis auf die Inspektor-Anzeige, Ticket 13 komplett (Transport, Save-Pipeline,
Bake-Renderpfad, scoped-Rekey), Klassen am DOM (Ticket 21), Motion M0–M5 (Ticket 19),
Ticket 20 (Site-Profil) und Ticket 15 (PG-Dialekt-Gate). **Am 19.09.:** Slot-/Collection-
Transport verifiziert und abgeschlossen (Nachtrag eines parallelen Strangs), Ticket 14
(Klassen-Emission gemessen, auf global umgestellt). Der Testlauf ist grün (1176/2/132).

**Als Nächstes:**

1. **M4 Stufe 1** (Ticket 19): Live-Modus zeigt die echte Seite (Ticket 03) → echte Motion
   ohne Extra-Code; Scrub-Stufe bleibt M6. Danach ist Motion fachlich abgeschlossen.
2. **Ticket 03 (Editor-Chrome):** Explorer/Kontextmenü/Spotlight/Inline-Edit/Tastatur —
   enthält den Live-Modus, auf dem M4 Stufe 1 aufsetzt.
3. **Parallel:** 12 (DnD), 18 (Agent-Style-Gate).
4. **Ende Phase 2/Anfang 3:** 16 (Marker-Overlay), 17 (Releases-Cutover).
5. **Vor dem Cutover:** 11. **Erledigt:** 14 (Emission), 15 (PG-Dialekt-Gate), 21 (Klassen am
   DOM), 22 (scoped-Rekey), 13 vollständig (18./19.09.).

**Strategischer Rahmen (19.09.):** `docs/verbesserungsplan.md` — Zielbild Framer/Webflow-Niveau,
Lücken L1–L33 (P0–P3), 16 Epics (E1–E16) mit Akzeptanzkriterien, Roadmap Phase A–D, Gates und die
nächsten 10 Arbeitspakete. Aus sechs Audits (Technik, UX, KI/MCP, Produktreife, Benchmark, UI),
Kernbehauptungen am Code verifiziert.

---

## 7. Starten und prüfen

- Node.js 24+, pnpm 10, Postgres (Docker `docker compose up -d` auf Port 5433 oder eigene
  Instanz; URL als `SENIFY_DATABASE_URL` oder in `~/.senify/config.json`).
- `pnpm install && pnpm start` (oder `-- --no-open`); Programm `http://localhost:4322`,
  Engine `http://localhost:4321`.
- Editor: `…/pages/<page-id>?view=editor`, Canvas: `?view=canvas`.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm verify` (das Gate).
- Die zwei übersprungenen Tests brauchen echtes Postgres (`TEST_DATABASE_URL`).
- Für Messungen: flüchtige Instanz (`startProgram`, `appPort: 0`/`enginePort: 0`) statt der
  festen Dienste — so tun es die Browser-Tests und die `pruef-*.mjs`.

---

## 8. Fallen und Erfahrungen

**Aus früheren Runden weiter gültig:** Dienste nach Codeänderungen neu starten (Bundles werden im
Speicher gehalten); für Messungen eine flüchtige Instanz; Namensdublette `divider`/`embed` bleibt
bei der Section; Bildvergleich nur mit Toleranz; Sonderzeichen in Commit-Nachrichten über eine
Datei; CLI über `tsx`; `pg-mem` verdeckt Rollback; React-`key` nie über einen Spread;
Tailwind-`@source` nach dem Staging neu schreiben; `display: grid` ist kein Designwert;
`--ed-ink-faint` ist kein Textwert; Lazy-Bilder erst nach `scrollIntoViewIfNeeded()`; vor jedem
Commit `git status` prüfen und nach Pfaden stagen, nie `git add -A`.

**Neu am 18.09.:**

- **Die Dokumente beschreiben den Arbeitsbaum, nicht `HEAD`.** Mehrere Stellen sagen „liegt
  uncommittet im Arbeitsbaum, nicht in HEAD". Wer eine Behauptung prüft, prüft zuerst `git grep
  … HEAD` — die Spalte `style_rules_json` etwa war nie in einem Commit.
- **Parallele Stränge arbeiten im selben Baum.** Am 18.09. 22:04 änderte eine zweite Sitzung
  `contract.ts`/`apply.ts`/`editor-bridge.ts`/`persist.ts` **nach** dem letzten grünen
  Gesamtlauf; zurück blieben ein stale Bridge-Test (erwartete die alte Ablehnung) und ein
  Typfehler im jetzt unerreichbaren `default`-Zweig. Ein grüner Lauf gilt nur für den Stand,
  auf dem er lief: vor dem Weiterarbeiten `git status` **und Dateizeiten** prüfen, nach fremden
  Änderungen erst `pnpm test` + `pnpm typecheck` + `pnpm lint`, dann dokumentieren.
- **DB ist PG-only by decision (ADR-0004).** Keine `::`-Casts, kein `now()` in DML, JSON nur über
  die `db.ts`-Helfer, `ALTER … ADD COLUMN IF NOT EXISTS` nur in `db.ts`. Der grep-Gate-Test dazu
  ist Ticket 15.
- **Das offene CSS hat Golden-Snapshots geändert.** Wer `styleGroups` entsperrt oder Properties
  durchreicht, muss die Snapshots nachziehen (am 18.09. geschehen; der rote Zwischenstand mit
  15 `css-golden`-Fällen ist im Log als Beleg, kein Regressionsbefund).
- **Die Wert-Grammatik ist die Sicherheitsgrenze.** Eine Denylist auf Teilstrings (`javascript:`,
  `expression(`, `@import`) ist umgehbar (`url(jav\61 script:…)`, `u\72 l(…)`, `expr/**/ession(…)`,
  `URL( JAVASCRIPT:… )`). Geprüft wird die **normalisierte** Form, emittiert wird dieselbe.
- **`origin` hat zwei Bedeutungen, die nicht vermischt werden dürfen:** Import-Herkunft
  (`{ source, ordinal }`, kanonisches Modell) und Autor-Herkunft (`authoredBy`, Ticket 18).
- **Ticket 08 war scheinbar offen, weil ein grep „Acht-Stationen-Pfad" als Treffer zählte.** Die
  Plan-Dokumente sind korrigiert; die Abnahme ist erfüllt.
- **Bekannt flaky:** `packages/engine/test/theme.test.ts` (Ephemeral-Port + undici; in Isolation
  grün) und der Playwright-Klick in `entry-preview-browser.test.ts` (Timeout, Neulauf).
- **Der Bake rekeyt Knoten-IDs beim Layout-Splice** (`engine/src/templates.ts`
  `rekeyChildren`). Seit Ticket 22 gibt `composePageTree` die Draft→komponiert-Map mit aus
  (`idMap`), der Bake reicht sie als `nodeIdMap` durch und `styleRulesCss` remappt scoped-Regeln
  darauf. Wer komponiert und Regeln an Draft-IDs bindet, muss die Map mitziehen — sonst fällt die
  Regel im Release still weg. `class`-Regeln hängen am Knoten und wandern mit;
  `ambient`/`rawCss` sind ID-frei.
- **Anker-Selektoren brauchen die Klasse im DOM** (Ticket 21): `class`-Regeln werden als
  `[data-node-id].name`, scoped als `[data-node-id].__senify_scope_<id>` emittiert. Das
  Wurzelelement trägt beides über `nodeRootClasses` (User-Klassen + deterministische
  Scope-Klasse). Wer eine neue Renderstelle für Knoten baut, muss sie ebenfalls setzen, sonst
  sind die Regeln dort tote Selektoren.
- **Motion überlebt die v1→v2-Migration jetzt** (M1, 18.09.): `migration.ts` kopiert `motion`
  mit; der frühere stille Verlust und der falsche Kommentar („nur `hidden` fällt weg") sind
  behoben und getestet.
- **Der Freeze ist implementiert (M2):** `analysis-worker/src/visual.ts` setzt
  `__SENIFY_MOTION__ = "off"` per `addInitScript` (Option `motion: "off" | "live"`, Default
  off), erzwingt `scroll-behavior: auto` und wartet 2 rAF; die Runtime respektiert den
  Kill-Switch und gibt Pending frei. Gegenprobe als Browser-Test (`visual.test.ts`); das
  Paritäts-Tor selbst (`widget-slice-browser.test.ts`) bleibt unverändert.

---

## 9. Verweise

- Entscheidungen: `docs/adr/0001–0006` (0004 PG-only, 0005 offenes CSS, 0006 Motion-Authoring).
- Planung: `.scratch/editor-v2-rebuild/` — `map.md` (E/D/O-Entscheidungen, Tickets 01–22),
  `ledger.md` (Zustandsbuch + nächste Schritte), `ui-plan.md`, `ui-design.md`, `ui-aufgaben.md`,
  `ui-elementor.md`, `ui-preview/index.html`, `issues/01–22`.
- Motion: `docs/adr/0006-motion-authoring.md` + `.scratch/motion-v2/` — `research.md`, `plan.md`,
  `plugin-analyse.md`, `preset-matrix.md`, `payload-spec.md`, `freeze-spec.md`
  (`adr-0006-entwurf.md` bleibt als Protokoll); Plugin-Quelle:
  `C:\Users\adini\Local Sites\hcm\app\public\wp-content\plugins\wp-gsap-heading-reveal`.
- Analyse: `.scratch/editor-v2-rebuild/research/` (`01-analyse.md`, `02-bauplan-aenderungen.md`,
  `03-strategische-ueberholspuren.md`, `README.md`).
- Vergleichsbasis: `Repos/instatic` (Clone) + `Repos/instatic/research/instatic/` (21 Dokumente);
  Bauplan-Quellen `Repos/elementor-main`, `Repos/emdash` (nur Lektüre, nichts kopiert).
- Belege: `.scratch/testlauf-18-09.log` (roter Zwischenstand), `.scratch/refs/nick/ui/`,
  `pruef-*.mjs`-Skripte.
- Fachmodell/Arbeitsweise: `CONTEXT.md`, `AGENTS.md`, `docs/agents/`, `README.md`.
