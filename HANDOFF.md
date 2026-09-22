# Übergabe: Editor v2 (Senify) — Stand 20.09.2026 (Runde 2: Tickets 16, 02, 03, 06 erledigt)

Diese Datei ersetzt die Abend-Fassung vom 17.09. und den ersten 18.09.-Stand. Sie beschreibt den
Arbeitsbaum so, dass eine Person oder ein Agent ohne Vorwissen weiterarbeiten kann: was entschieden
ist, was gebaut ist, was offen ist, wie man startet und prüft, welche Fallen lauern.

**Wichtigster Satz vorab:** Der Arbeitsbaum ist seit dem 19.09. **committet** (Baseline):
`e62fe1f` (Planung: Motion-Papierpaket, Ticket 18), `49bacbd` (Planung: Tickets 07–22, ADRs
0004–0006, Verbesserungsplan, HANDOFF), `d434ffc` (Produktcode: Motion, Style-Pipeline,
Live-Modus, Transport). Darauf liegen die Welle-1-Commits `5ad0d48`/`23f7885` (Teil 1:
Ticket 11, E17 S1, E4 S0), `824b9ba` (Teile 2+3: Ticket 18 komplett — Author-Resolver,
Idempotency-Keys, `authoredBy`-Fence) und `55593f1`/`c162251` (Teil 4: Pakete #5–#10 aus
§9). Darauf liegen `a4ec1c4` (M4 Stufe 1 + Ticket 03 Punkt 6: Live-Modus im Canvas,
Zoom-Footer, Labels, Dimming), `ab0abdc` (Doku dazu) und `8c67f56` (Doku-Nachtrag dazu).
Die **Runde 2+3 vom 20.09.** (Tickets 16, 02 Punkte 3–7, 03 Punkte 1/2/4/5/7, 06/ADR-0007
und Ticket 04 Scheibe 1) ist committet: Code `d25e4d0`, Doku `c0da522`. **Uncommittet**
bleibt nur noch der **zweite Strang** an der Referenz-Bibliothek/Redesign
(`eslint.config.mjs`; siehe §8) — dessen Code ist inzwischen committet (`ea113de` ff.).
Untracked bleiben die bewusst lokalen Artefakte (Test-Logs, Screenshots, `.backup-18-09/`,
Debug-Dateien in `.scratch/refs/`). Wer `git status` liest, sieht genau diese Restliste.

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
- Die 2 übersprungenen Tests brauchen echtes Postgres (`TEST_DATABASE_URL`); Port 5433 war am
  19.09. geschlossen (Docker nicht installiert) — vor Release-Themen nachholen.
- **Commit-Stand 19.09. (Baseline):** `d434ffc` (Produktcode: Motion M0–M5, Style-Pipeline,
  Live-Modus, Transport; 111 Dateien), `49bacbd` (Planung: Tickets 07–22, ADRs 0004–0006,
  Verbesserungsplan, HANDOFF), `e62fe1f` (Planung: Motion-Papierpaket, Ticket 18). Untracked
  bleiben bewusst: Test-Logs (`.scratch/testlauf*.log`, `vitest-browser.*`), Screenshots
  (`FireShot-*.jpg`, `refs/nick/`, `refs/aufnahmen/`), `.backup-18-09/` und Debug-Artefakte
  in `.scratch/refs/` (`*-mine.*`, `debug-*.ts`, `commit-msg.txt`).
- **Welle 1, Teil 1 (19.09., committet `5ad0d48`/`23f7885`):** Ticket 11 (`hiddenDevices` +
  property-weiser Reset, L2), E17 Scheibe 1 (Undo-Integritätsprüfung), E4 Scheibe 0
  (MCP-Annotations-Matrix + Server-Instructions). `pnpm test` **1183/2/132**
  (Log `.scratch/testlauf-19-09-welle1.log`), typecheck 0, lint 0.
- **Welle 1, Teil 2 (19.09., committet `824b9ba`): Ticket 18 Scheibe 1 — Author-Resolver.** Der
  Audit-Autor kommt **immer** aus dem Token (nie aus dem Body): additives Token-Feld
  `kind: "human" | "agent"` (DB-Spalte additiv per ALTER mit Fail-closed-Default `agent`,
  `whoami.kind`, `tokens create --kind`, `senify setup` → agent, Programm-Token human +
  In-place-Selbstheilung über `store.updateTokenKind`); `resolveAuthor(auth)` und alle 30
  Aufrufstellen in `http.ts` umgestellt; Body-`author` in allen 24 Vertrags-Schemas optional
  (Vorschlag, wird nie auditiert). `pnpm test` **1187/2/132** (Log
  `.scratch/testlauf-19-09-ticket18s1.log`), typecheck 0, lint 0.
- **Welle 1, Teil 3 (19.09., committet `824b9ba`): Ticket 18 Scheiben 2+3 — Idempotency-Keys +
  `authoredBy`-Fence.** Scheibe 2: optionales Body-Feld `idempotencyKey` auf `create_page`,
  `create_entry`, `upload-url`, `create_reference_collection`; Claim-first-Tabelle
  `idempotency_keys` (Fingerprint über die kanonisierte Body-JSON, TTL 24 h, Stale-Übernahme
  nach 2 min, Release nach Fehlversuch), Replay mit Header `idempotency-replayed: true`,
  MCP-Durchreiche; `idempotentHint` bleibt `false` (ohne Key nicht idempotent). Scheibe 3:
  `authoredBy` wird aus dem Token abgeleitet (Updates erhalten die Provenienz), Agenten
  brauchen für Farb-Literale ein passendes Theme-Token (sonst Freiheit), `ambient`/`rawCss`
  bleiben Mensch, rawCss max. 2.000 Zeichen + kein `url()`-Fremdhost, Reorder fremder Regeln
  wird audit-markiert. `pnpm test` **1210/2/134** (Log
  `.scratch/testlauf-19-09-ticket18s23.log`), typecheck 0, lint 0. **Ticket 18 damit
  vollständig; die Welle-1-Pakete #1–#4 sind erledigt** (Teile 1–3 committet).
- **Welle 1, Teil 4 (20.09., uncommittet): Pakete #5–#10 aus §9.** Ticket 02 Scheibe 1
  (Inspektor-Grundstock: Modell/UI/Tests, vier Tabs, Token↔Literal), E5 Scheibe 1
  (EditorSession + UI-State über localStorage), Ticket 03 Scheibe 1 (Explorer mit voller
  Tastatur, Kontextmenü, Spotlight/Ctrl+K), Ticket 12 (DnD, Plus-Punkte, Einfügelinie,
  `moveNode`-Index-Fix), Ticket 17 (O9-Vorhang, Publish über die Route, Paritäts-Tor gegen
  das Release, Rollback; Funde: `variant`-Durchreiche, Font-Auslieferung), E16 P0
  (Editor-Grundhaut, Focus-visible, Fremdfarben-Test) + E12 Scheibe 1 (`bake_jobs`-Outbox
  mit Claim/Lease/Backoff, Worker, Status-Route). Nachzug aus dem Gesamtlauf: O9-„Start
  unter h1" soft, Katalog-Streifen ganzzahlig (halber Pixel), `enqueueBakeJob` mit
  injizierbarer Zeit. `pnpm test` **1270/2/141**, typecheck 0, lint 0, build 0 (Log
  `.scratch/testlauf-20-09-welle1rest-4.log`). Code committet als `55593f1`, die Doku folgt
  mit dem Doku-Commit.
- **M4 Stufe 1 + Ticket 03 Punkt 6 (20.09., committet `a4ec1c4`): Live-Modus im Canvas.** Der
  Design/Live-Toggle baut den Canvas auf **einen** Frame um (aktiver Breakpoint, echte
  Größe, nativer Scroll); die Editor-Chrome bleibt draußen (`canvasFrameRules({ chrome:
  false })`), die Release-Runtime wird injiziert — eine Quelle für v1 und Canvas
  (`editor/src/motion-inject.ts`). Dazu: Zoom-Footer (Strg/Cmd+0 = 100 %), Frame-Labels,
  Breakpoint-Dimming mit Klick-Aktivierung, `mode` im View-State (`ui-state.ts`,
  `session.setMode`), Spotlight-`set-mode` verdrahtet. Zwei Funde: ein Komma-Selektor in
  der Skin war nur halb gescoped (Test fing es), der Paper-Regex des Skin-Tests matchte
  `__frame-label`. `pnpm test` **1292/2/144** (Log `.scratch/testlauf-20-09-m4s1-2.log`),
  typecheck 0, build 0; lint in den eigenen Bereichen 0 (ein fremder Ein-Zeilen-Fehler im
  parallelen Strang, siehe §8).

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

### 2.7 Runde 2 (20.09., committet `d25e4d0`/`c0da522`): Tickets 16, 02 Punkte 3–7, 03 Punkte 1/2/4/5/7, 06

- **Ticket 16 — Marker-Overlay im Portal.** `editor/src/canvas/overlay.ts` (neu): reine
  Geometrie (`overlayRect`, `intersectsViewport`, `isOccluded`, `badgeTop`, 20 ms Drossel)
  plus Controller; Layer je Blatt im `senify-canvas__overlay` über der Bühne
  (`pointer-events: none`, Verdeckungsprobe via `elementFromPoint`), Ringe/Label/
  Größenpaar/4 Eckgriffe (8 px sichtbar, 24 × 24 Trefferfläche), Alt-Hover-Ladder
  (Option `parent`). `CANVAS_CHROME_CSS` trägt nur noch Cursor-Regeln; neuer Token
  `--ed-selection-edge` (Doppelkante außen) in `ui/tokens.ts`, `ui/skin.ts`,
  `plan-tokens.test.ts` und der UI-Vorschau. Tests `canvas/overlay.test.ts` (neu),
  `rules.test.ts`, Browser-Test (Portal, Geometrie, Hover über synthetisches `mousemove` —
  Playwright liefert über die iframe-Grenze ein spurious `mouseout`, §8).
- **Ticket 02 Punkte 3–7.** P4: Gerätepunkte an **jedem** responsive Control (Signal =
  Override, Ring = aktiv; Klick wechselt die Ansicht, Klick auf den aktiven Punkt schaltet
  den Override an/aus, Desktop bleibt Basis). P5: Zustandszeile im Style-Tab
  (Basis + 4 States), Werte liegen in der **scoped Rule** des Knotens
  (`upsertStyleRule`/`deleteStyleRule`, `deviceKey`-Suffixe), der Chip erzwingt die
  Canvas-Vorschau; **Transport-Fund:** `transportRule` schickte die `scope` nicht — die
  Create-Route will `nodeId` (PATCH behält den Scope), behoben + Test. P6: Token-Picker für
  spacing/radius/shadow/type (`renderTokenPanel`, `{ $token }`, Literal zurück), Zahlen-/
  Textfelder zeigen `{ref}`; **Fund:** das gemeinsame `paletteOpen` öffnete Panels unter
  jedem Farbfeld — jetzt per Feld-Key (ein Panel zur Zeit). P3: eigene Property-Zeile
  (`add-prop`) + Gruppe „Eigene Properties" mit Entfernen (offene Fläche, O13; auf
  Sektionen greift die E2-Grenze der v1-Bridge). P7: MCP `list_widgets`, `get_widget`,
  `set_styles` (scoped Rule, `device`/`state`, Merge), `create_style_rule`; Guardrail
  Style-Tabelle + Engine-Token-Fence; Katalog über Re-Export aus `@senify/registry`.
- **Ticket 03 Punkte 1/2/4/5/7.** P4: Inline-Text (`contenteditable="plaintext-only"`,
  `typingCoalesceKey`, Escape verbraucht den Eintrag, Caret-Schutz in `refresh()`; Renderer
  annotiert Katalog-Primitives); **Fund:** Plus-Punkte kurzer Knoten schluckten den
  Doppelklick (jetzt außerhalb + versteckt). P5: Verlauf (`store.restoreTo`, Blatt
  `history/dialog.ts`, Zeit/Label/`data-current`/`data-future`, Escape dokumentweit);
  Redo-Future fällt bei neuem Apply (Test insertet zweimal). P7: `shortcut()`-Schicht
  (Cmd+0/Z/Shift+Z/Y/D/C/V, Delete, Escape→Eltern, Enter→Kind), Tab-Block im Design-Frame,
  `DomEvent.defaultPrevented` als Schichten-Vertrag, Alt-Klick/-Hover. P2: `applyBatch`
  (mehrere Ops, **ein** History-Eintrag), `state/clipboard.ts` (Copy/Paste inkl.
  Scoped-Rules via `duplicateNode`, Wrap als Batch, kein neues Contract-Op). P1:
  Explorer-Drag (`resolveMoveDrop`, `data-drop`, Zyklus-Schutz sichtbar) + Site-/Media-Tabs
  (`options.tabs`, `insertAt`/`insert` mit `props`); Vorlagen/Komponenten bleiben O14.
- **Ticket 06 — ADR-0007 (Puck-Abschied).** `adapter.ts`/`puck.ts`, deren Exporte und die
  beiden Puck-Tests entfernt, optionale Peer-Dependency `@puckeditor/core` raus
  (Lockfile aktualisiert), stale Puck-Kommentare in `mount.ts` auf den
  `FrameRenderer`-Seam umgeschrieben. Kein Laufzeit-Import existierte.
- **Zahlen:** `pnpm test` **1289 grün / 2 übersprungen / 144 Dateien**, typecheck 0,
  build 0, lint in den eigenen Bereichen 0. Erster Gesamtlauf mit zwei Browser-Flakes
  (`submissions-browser.test.ts`: Klick auf „Fällige Jobs jetzt senden"; fremder Strang),
  Wiederholungslauf vollständig grün. Logs `.scratch/testlauf-20-09-runde2-*.log`.

### 2.8 Ticket 04 Scheibe 1 (20.09., committet `d25e4d0`/`c0da522`): Component-Kern

- **Modell (`section-sdk/src/components.ts`, rein):** Eine Komponente lebt im Baum —
  reservierte Typen `__component` (Definition, ein Wurzelkind), `__component_slot`
  (Füllplatz), `__component_instance` (`componentId`, Slots füllen). `inlineComponents`
  ist die eine Ableitung für Canvas und Bake (Definitionen raus, Instanzen expandiert,
  Slots gefüllt, deterministische Ids, `nodeIdMap`/`copies`); Probleme (unbekannt,
  Zyklus, mehrere Wurzeln) enden im Stub. `wouldCreateCycle`, `unfilledSlots`.
- **Canvas:** `canvas/adapter.ts` inlined vor dem Rendern (`canvasNodeTreeWithCopies`);
  `canvas/rules.ts` emittiert die Knotenregeln der Definition je Kopie.
- **Bake:** `engine/src/templates.ts` (`composePageTree`) inlined nach der Komposition
  und blockiert mit Fehler bei Problemen; die Kopien wandern in die bestehende
  Draft→komponiert-Map (Ticket 22, erste Kopie je Knoten).
- **Editor-Ops:** `createComponent`, `insertSlot`, `instantiateComponent`,
  `detachComponent` — je ein `applyBatch` (ein Undo, bestehender Speicherpfad).
- **Tests:** `section-sdk/test/components.test.ts` (8), `editor/test/state/components.test.ts`
  (5). **Zahlen:** `pnpm test` 1301/2/146 (der eine rote Lauf war der bekannte
  Ephemeral-Port-Flake), typecheck 0, build 0, lint 0.
- **Offen (Scheibe 2):** Overrides/Varianten/Publish-Versionen, Multi-Instanz-Remap,
  Slot-Restriktionen, Komponenten-Tab im Editor, MCP/Skills, Sections-Migration.

### 2.9 Ticket 04 Scheibe 2 Teil 1 (20.09., committet `7f7ccd6`/`2c64aaf`): speicherbar, Bake-Rekey, Overrides

- **Der Fund zuerst:** Scheibe 1 war lokal korrekt, aber **nicht speicherbar** — die Engine
  kannte die reservierten Typen nicht (`Unknown section type "__component"` beim ersten
  Speichern). Und der Bake verlor Definitionen aus gespleißten Bäumen: der Layout-Splice
  rekeyt Knoten, aber `componentId` blieb die Draft-Id (`Component "…" is not defined`).
- **Engine-Aufnahme:** `Registry.registerStructural` (structural types sind `has`/`get`,
  aber nicht in `list()` — Katalog/Doku bleiben kuratiert); `allowedChildren` kennt `"any"`,
  `PropControl` kennt `"json"`; `registry/src/sections/structural.ts` beschreibt Definition,
  Instanz und Slot; `apply.ts` lässt strukturelle Kinder überall zu (außer im Slot) und
  behandelt offene Container in Kind-, Slot- und Wrap-Prüfung.
- **Bake:** `remapComponentRefs` schreibt `componentId` vor dem Inlining um (copy-on-write);
  die Draft→komponiert-Map trägt **Listen** (`Map<NodeId, NodeId[]>`), Kopien werden
  expandiert — scoped Regeln folgen jetzt **allen** Instanzen (`remapScopedRules` je Kopie
  ein Selektor). `bake.ts`/`renderer` reichen `Record<string, string[]>` durch.
- **Overrides:** `props.overrides` auf der Instanz (`{ partId: { key: Wert } }`, Part-Ids
  sind die stabilen Knoten-Ids der Definition). `inlineComponents` mischt in die Kopie (die
  Definition bleibt unberührt; verschachtelte Instanzen inkl. Swap über `componentId`),
  `componentParts`/`staleOverrides` als Register/Prüfung. Editor: `setComponentOverride`
  (leerer Beutel wird gepruned), `detachComponent` materialisiert Overrides (zwei Batches,
  **ein** Coalesce-Key = ein Undo). Inspektor: je Teil eine Content-Gruppe,
  `commit.kind: "override"`, `base` = Definitionswert für den Reset. Canvas: `origins`
  (Kopie → Instanz + Teil) — Klick in eine Instanz wählt die Instanz.
- **Tests:** `section-sdk/test/components.test.ts` (13), Registry (+2),
  `engine/test/components.test.ts` (6, neu: HTTP-Speicherpfad, Splice-Rekey, zwei Instanzen,
  Overrides), Renderer (+1 Kopie-Selektoren), Editor (8) + Inspektor (16) + Canvas (8).
- **Zahlen:** `pnpm test` **1322 grün / 2 übersprungen / 147 Dateien** (Log `.scratch/testlauf-20-09-m4s2t1.log`; der eine rote Lauf war der bekannte Browser-Flake `submissions-browser.test.ts`, in Isolation grün), typecheck 0, lint
  (eigene Bereiche) 0. **Commit:** Code `7f7ccd6`, Doku `2c64aaf`.
- **Grenzen (Scheibe 2 Rest):** Overrides sind basisweit und betreffen Props (keine Styles
  je Instanz, keine Geräteebenen); Publish-Versionen, Slot-Restriktionen, Varianten,
  Komponenten-Tab, MCP-Fassade und die Sections-Migration fehlen.

### 2.10 Ticket 04 Scheibe 2 Teil 2 (21.09., committet cb640d2): Komponenten im Editor bedienbar

- **Modelle rein (`editor/src/explorer.ts`):** `editorNodeLabel` löst die reservierten Typen auf
  (Definition `Komponente · name`, Instanz liest den Namen der Definition über `componentId` -
  fehlt sie, steht dort die Id; Slot `Slot · name`). `buildComponentList` zählt je Definition die
  Instanzen. `editorMenuItems` liefert das Kontextmenü je Knotenart mit aufgelösten
  Zustandslabels: `component-create` an einem gewöhnlichen Knoten, `component-detach` an einer
  Instanz, `component-insert` an einer Definition; Wurzel und Slot-Platzhalter bieten keine der
  drei. DOM-frei und im Node-Lauf geprüft.
- **Panel (`explorer/panel.ts`):** das Menü kommt aus dem Modell; die drei Aktionen laufen über
  `createComponent`/`detachComponent`/`instantiateComponent`, ein Fehler wird als Statusmeldung
  berichtet statt still verloren. Nach dem Anlegen ist die **Definition** ausgewählt (F2 benennt
  sie um - `textKeyOf` kennt `name` bei Definition und Slot; eine Instanz meldet, dass sie den
  Namen ihrer Komponente trägt).
- **Shell (`packages/app/public/app.js`):** vierter Explorer-Tab `Komponenten` mit
  Instanz-Zähler; ein Klick fügt eine Instanz hinter der Auswahl ein und wählt sie.
- **Tests:** `editor/test/explorer.test.ts` +3 (Labels inkl. Stale-Fallback, Liste/Zähler, Menü je
  Knotenart + Zustandslabels); `app/test/canvas-view-browser.test.ts` fährt den Rundlauf im
  Browser (anlegen → F2 `karte` → Tab `1 Instanz` → Instanz einfügen (Hero 2x) → auflösen;
  Screenshots `08-komponente-angelegt.png`/`09-komponenten-tab.png`).
- **Zahlen:** `pnpm test` **1325 grün / 2 übersprungen / 147 Dateien** (Log
  `.scratch/testlauf-21-09-m4s2t2.log`, ohne Flake), typecheck 0, lint (eigene Bereiche) 0.
- **Grenzen:** wie 2.9 (Overrides basisweit, keine Publish-Versionen/Slot-Regeln/Varianten,
  MCP-Fassade und Sections-Migration offen).

### 2.11 Ticket 04 MCP-Fassade (21.09., committet 781112c): Komponenten für Agenten

- **Drei Tools (`mcp/src/tools.ts`):** `list_components(pageId)` (Name, Part-Anzahl, Slot-Namen,
  Instanz-Zähler und -Ids), `get_component(pageId, componentId)` (Parts mit Id/Typ/Props als
  Override-Schlüssel, Slot-Platzhalter, Instanzen mit Beuteln), `set_component_override(pageId,
  instanceId, partId, key, value, baseDraftVersion)` (merged wie die Editor-Op, `value: null`
  löscht, leerer Beutel wird entfernt, Definition bleibt unberührt). Die Helfer spiegeln
  `componentParts`/`editorOverrides`, ohne Editor-Pakete zu importieren.
- **Guardrails:** unbekannte Instanz/Definition/Part (Vorschlag listet die gültigen Part-Ids),
  fehlender `value`; geschrieben wird über `updateNodeProps` (Autor = Token-Name).
- **Skills:** `packages/skills` Router + Master-Flow nennen den Weg, `SERVER_INSTRUCTIONS` eine
  Leitlinie.
- **Tests:** `mcp/test/workflow.test.ts` +1 (Aufbau per `apply_mutations`, list/get, Override
  setzen/löschen, `get_nodes`-Beleg, drei Guardrails), Katalog-Test um drei Namen erweitert.
- **Zahlen:** `pnpm test` **1326 grün / 2 übersprungen / 147 Dateien** (Log
  `.scratch/testlauf-21-09-m4s2t3.log`, ohne Flake), typecheck 0, lint (eigene Bereiche) 0.

### 2.12 Ticket 04 Scheibe 2 Teil 3 (21.09., committet cb640d2): Versionen und Slot-Regeln

- **Modell (`section-sdk/src/components.ts`):** `ComponentSlotSpec` mit `allowedTypes` (leer =
  alles) und `max` (null = unbegrenzt), gelesen über `readSlotSpec` (malformed wird ignoriert);
  `ComponentDefinition.version` (`props.version`, Default 1); `instanceVersion` (`props.
  componentVersion`, Default 1 - der **Pin**, kein Lookup-Schlüssel: alte Versionen werden nicht
  gespeichert, der Release-Snapshot friert die Seite); `componentDrift(tree)` listet Instanzen,
  deren Pin hinter der Definition liegt; `collectSlots` liefert die Specs.
- **Registry (`registry/src/sections/structural.ts`):** Definition trägt `version`, Instanz
  `componentVersion`, Slot `allowedTypes` (list) und `max` (number) - sichtbar als strukturelle
  Props.
- **Engine (`engine/src/mutations/apply.ts`):** `slotRulesFor`/`componentSlotSpecs` lesen die
  Regeln aus dem Baum (WorkingTree, kein Definitions-Lookup über `componentDefinition`),
  `requireSlotRules` ersetzt `requireSlotSpec`; `assertSlotPlacement`, `applySetSlotContent` und
  `applyCreateCollectionEntry` prüfen unbekannten Slot, nicht erlaubten Typ und `max`. Test +1
  (leeren → Regeln setzen → füllen → max/divider/unbekannter Slot abgelehnt), 7 grün.
- **Editor:** `editorSlotSpecs` (`state/document.ts`) ist die **einzige** Auflösung (Instanz →
  Definitions-Slots, sonst Widget-Katalog); `operations.ts` (`targetList`, `applySetSlotContent`,
  `STRUCTURAL_PROPS`, `assertKnownProp`-Ausnahme), `canvas/insert.ts` (dokumentbasierte
  Slot-Ablehnung, Instanz als Slot-Container), `canvas/dnd.ts` (`takesChildren`),
  `state/consistency.ts` (slot-unknown/-not-allowed/-full, fehlende Definition toleriert).
  Neue Ops in `state/components.ts`: `definitionVersionOf`, `instanceVersionOf`,
  `componentDriftOf`/`componentDriftIn`, `bumpComponentVersion`, `updateComponentInstances`
  (ein Batch = ein Undo); `createComponent` setzt v1/Pin v1, `instantiateComponent` pinnt die
  aktuelle Version, `insertSlot` nimmt `allowedTypes`/`max` entgegen.
- **UI:** Drift-Badge `v1` am Instanz-Knoten (title `Version 1 · Definition ist v2`), Menü an der
  Definition um `Version erhöhen` (v1 → v2) und - nur bei Drift - `Instanzen aktualisieren`
  erweitert; Tab-Hinweis `v2 · 2 Instanzen · 1 alt`. Browser-Rundlauf im
  `canvas-view-browser.test.ts` (bump → Badge sichtbar → update → Badge weg; Screenshot
  `10-komponente-version.png`).
- **MCP:** `list_components` liefert `version`/`outdated`, `get_component` zusätzlich `drift` und
  je Instanz `componentVersion`/`outdated`; zwei neue Tools `bump_component_version` und
  `update_component_instances` (idempotent: ohne Drift `updated: 0`, kein Schreibzugriff),
  SERVER_INSTRUCTIONS und Skills (Router + Master-Flow) nennen den Weg.
- **Tests:** section-sdk 15, engine components 7, editor components 10, explorer 14, mcp 18,
  Browser-Rundlauf grün.
- **Zahlen:** `pnpm test` **1352 grün / 2 übersprungen / 149 Dateien** (Log
  `.scratch/testlauf-21-09-m4s2t4.log`), typecheck 0, lint (eigene Bereiche) 0.
- **Grenzen:** Drift ist ein Signal im Editor/MCP, kein automatisches Nachziehen beim Publish;
  Varianten, Styles je Instanz, Geräteebenen für Overrides und Publish-Versionen site-weit
  bleiben offen.

### 2.13 Ticket 05 Scheibe 1 (21.09., committet dfff706): SSE-Kanal, Live-Mitverfolgung, Bau-Protokoll

- **Engine (`engine/src/events.ts`, neu):** `EngineEvents` als Prozess-Bus (`publish`/`subscribe`),
  `openStream(res, siteId)` schreibt einen SSE-Strom (Filter je Site, `retry: 3000`, Heartbeat
  alle 15 s, Cleanup bei `res`-`close`). Neue Route `GET /api/events?site=…` (Scope read; ein
  unbekannter Site-Wert ist 404 statt leerer Strom). `RouteResult` kennt jetzt `stream`
  (Content-Type + Opener); der Dispatcher hält die Verbindung offen.
- **Publish-Punkte:** `applyMutationsToPage` (nach erfolgreichem Persist: `draft.changed` mit
  Seite, berührten Knoten-Ids, erster Op als Aktion, Akteur aus dem Token), `POST …/pages`
  (`page.created`), Asset-Upload (`asset.uploaded`), `POST …/releases` (`release.published`).
  `Engine.events` liegt am Engine-Objekt (Tests/Doubles können direkt subscriben).
- **Programm (`app/public/app.js`):** die Canvas-Ansicht abonniert `EventSource('/api/events')`.
  Fremde `draft.changed` laden die offene Seite per Store-Patch nach
  (`session.replaceDocument`, Auswahl wird beschnitten — Ticket-05-Punkt 6), heben die
  geänderten Knoten mit einem Lime-Ring hervor (1200 ms) und schreiben ins **Bau-Protokoll**
  (Akteur, Aktion, Uhrzeit, unten rechts über der Bühne). Eigene Schreibvorgänge (Programm-Token)
  werden ignoriert; offene lokale Änderungen blockieren das Nachladen mit Hinweis statt
  Datenverlust. `pagehide` schließt den Kanal.
- **Editor (`editor/src/canvas/overlay.ts`, `canvas.ts`):** `markers.flash(ids)` zeichnet
  Ringe mit derselben Geometrie wie die Auswahl (Pool je Blatt, späte Nachzeichnung nach dem
  React-Commit); `canvas.flashNodes(ids)` löst Dokument-Ids über die Copy-Map des letzten
  Renders auf — eine Instanz und ein Definitions-Part blitzen damit in **allen** sichtbaren
  Kopien auf. Styling in `canvas/styles.ts` (`senify-flash`, 1200 ms).
- **Proxy (`app/src/server.ts`):** der Engine-Proxy beendet den Upstream-Request, wenn der
  Client geht (`res`-`close`) — ohne das hielten SSE-Verbindung und Shutdown ewig.
- **Tests:** `engine/test/events.test.ts` +3 (Stream-Header/Filter/Akteur, `page.created` mit
  Fremd-Site-Ausschluss, 401/404); `canvas-browser.test.ts` prüft den Blitz direkt (Ring
  sichtbar → nach dem Fenster weg); `canvas-view-browser.test.ts` fährt den Rundlauf mit einem
  eigenen Agenten-Token (Protokoll nennt `browser-agent`, Ringe erscheinen und verschwinden;
  Screenshot `11-live-follow.png`).
- **Zahlen:** `pnpm test` **1362 grün / 2 übersprungen / 151 Dateien** (Log
  `.scratch/testlauf-21-09-t05s1.log`; ein Lauf zuvor hatte 4 bekannte Parallel-Flakes —
  `backup-restore`, `settings-browser`, `startup`, `submissions-browser` —, alle in Isolation
  grün), typecheck 0, lint (eigene Bereiche) 0.
- **Grenzen (Ticket 05 Rest):** Punkt 4 (Vorschau folgt) und Punkt 5 (Agent-Preview-Modus im
  Live-Modus) sind noch nicht verdrahtet; Punkt 7 (Performance-Budget/Messskript) steht aus.

### 2.14 Ticket 05 Scheibe 2 (21.09., uncommittet): Vorschau-Follow, Agent-Vorschau, Leistungsbudget

- **Vorschau-Follow (Punkt 4):** Im Live-Modus baut ein Store-Wechsel die Frames neu
  (`rebuildFrames` statt Baum-Patch) — die echte Seite wird ersetzt und die Release-Runtime
  frisch injiziert. Der Fern-Blitz wartet auf den frischen Frame (`pendingFlash`, weil das alte
  Dokument gleich verschwindet); der Marker-Paint laeuft auch im Live-Modus (Viewport aus der
  echten Frame-Groesse, Auswahl-Chrome bleibt aus). Browser-Test: Dokument-Marker beweist den
  Reload, Banner erscheint, Ring blitzt (`12-live-vorschau-follow.png`).
- **Agent-Vorschau (Punkt 5):** Schalter in der Werkzeugleiste (`data-action="canvas-follow"`,
  standardmaessig an, global in `localStorage`); `draft.changed` auf einer anderen Seite
  wechselt dorthin, `page.created` zieht die Seitenliste nach (Explorer) und oeffnet die neue
  Seite — nur ohne offene lokale Aenderungen. Eigene Seitenwahl schaltet den Schalter aus.
  Der SSE-Kanal wird beim Routenwechsel geschlossen (`activeLiveStream`, vorher leckte jede
  Navigation eine Verbindung). Browser-Test: `13-agent-vorschau.png`.
- **Leistungsbudget (Punkt 7):** Neues Skript
  `.scratch/editor-v2-rebuild/pruef-t05-performance.mjs` (fluechtige Instanz; Teil A echtes
  Canvas — erstes Paint; Teil B Harness — Insert-Serie, CDP-Layoutzaehler, rAF-Beobachter) und
  `pruef-t05-breakdown.mjs` (Zerlegung + CPU-Profil). **Fixes:** CSS-Regeln einmal je Refresh
  statt je Blatt; Annotationen in einem DOM-Durchlauf; Marker-Paint per `flushNextFrame()`
  (rAF-Lesen/Schreiben getrennt); React-Element einmal je Refresh (Cache, JSX war der
  Profil-Spitzenreiter); Nebenschienen einen Frame spaeter (Write-Split, aktives Blatt
  synchron). **Zahlen:** erstes Paint 620-850 ms (< 1 s), Insert-Median 12-13 ms (< 16 ms),
  p95 21-25 ms, 2,2-2,5 Layouts je Insert, ohne Konsolenfehler; Streuung im Headless-Lauf hoch,
  Urteil ueber die zwei Ticket-Zahlen (`.scratch/refs/nick/perf/t05-performance.json`).
- **Tests:** `canvas-view-browser.test.ts` erweitert (Live-Reload + Ring, Agent-Vorschau,
  erwarteter SSE-Abbruch beim Routenwechsel); Editor-Suite unveraendert gruen.

### 2.15 Dublette `divider`/`embed` aufgeloest (21.09., uncommittet): Zwillings-Bruecke

- **Befund:** Die zwei Namen leben bewusst in beiden Vokabularen (laufende Section +
  Katalog-Primitive); die Section gewinnt beim Rendern. Der Store validierte aber gegen das
  Primitive (`Value for "spacing" must be a number`) und der Inspektor zeigte die
  Primitive-Controls (style/thickness) — tote Schreibvorgaenge.
- **Auflösung:** `SECTION_PRIMITIVE_TWINS`/`isSectionPrimitiveTwin` (`widget-engine/legacy.ts`)
  pinnen die Liste (Guard-Test), `sectionTwinControls` (`catalog.ts`) liefert die
  Section-Props als Oberflaeche (divider: `spacing`-Enum; embed: `url`/`aspect`/`title`),
  `sectionToPrimitiveProps` (`mapping.ts`) ist die Cutover-Migration (Enum → px,
  Variante → style/provider). Store (`requirePrimitive`), Inspektor und MCP
  (`list_widgets`/`get_widget` mit `sectionTwin`) nutzen die Section-Flaeche.
- **Tests:** `widget-engine/test/mapping.test.ts` +4 (Kollisions-Guard, Controls, beide
  Prop-Bruecken), `editor/test/inspector.test.ts` +1. **Zahlen:** 1163 gruen / 2 uebersprungen
  / 106 Dateien (betroffene Pakete), typecheck 0.

### 2.16 Paritaets-Tor als CI-Blocker (21.09., uncommittet)

- **Gate-Schritt:** `pnpm verify:parity` (`scripts/verify-parity.mjs`) fuehrt
  `release-cutover-browser.test.ts` mit `SENIFY_REQUIRE_BROWSER=1` aus. Fehlt der Browser,
  wird das Tor **rot statt uebersprungen** (`browserSkip`/`browserRequired` in
  `packages/app/test/support.ts`, klare Meldung im Test).
- **Fund:** Ein direkter `node node_modules/vitest/vitest.mjs`-Start scheitert im Astro-Bake
  an `Can't resolve 'tailwindcss'` (Stage-Verzeichnis ohne pnpm-Modulpfade); der Gate-Lauf
  startet deshalb ueber `pnpm exec vitest`.
- **CI:** `.github/workflows/verify.yml` — install, `playwright install --with-deps chromium`,
  `pnpm verify`, `pnpm verify:parity`. README + §7 nennen den Schritt.
- **Beleg:** Gate gruen (26,6 s, Kopf-Diff 0, Sektion 0,00088 < 0,01); Fehlpfad rot mit
  klarer Meldung (4,8 s, `PLAYWRIGHT_BROWSERS_PATH` auf leeres Verzeichnis gesetzt).

### 2.17 Ticket 04 Scheibe 3 (21.09., uncommittet): Styles je Instanz + Geraetestufen fuer Overrides

- **Kern:** Ein Override der Instanz ist jetzt ein echter Stil-Schreibvorgang — die Instanz
  traegt eine eigene scoped Rule und Geraetestufen, beides landet auf ihren Kopien.
- **Inliner (`section-sdk/components.ts`):** Die Instanz mappt auf ihre Root-Kopie
  (`nodeIdMap.set(instance.id, copyId)`, `copies.set(instance.id, [copyId])`); die Klassen der
  Instanz wandern auf die Root-Kopie (sonst findet keine Klassenregel das gerenderte Element).
  Damit traegt die Kopie denselben Anker, den Canvas und Bake lesen.
- **Canvas (`editor/canvas/rules.ts` `withComponentCopies`):** Der Override-Beutel der Instanz
  wird in die Copy-CssNode gemergt (`editorOverrides` + `origins` — ein uebersteuerter
  Stil-Prop muss in den Compiler, nicht nur in den gerenderten Baum); scoped Rules werden je
  Kopie mit neu gebautem Namen/Selektor dupliziert (`scopeNameFor`/`scopeSelectorFor`) und die
  Original-Regel entfaellt, wenn Kopien existieren — dieselbe Ersetzung wie das Bake-Remap.
- **Geraetestufen (`inspector/model.ts`, `inspector/inspector.ts`):** `markOverride` ist
  geraetebewusst (`deviceKey`, `resolveDeviceValue` je Breakpoint, `overrideDevices` aus den
  Suffix-Keys); Commit/Clear schreiben `deviceKey(key, breakpoint)`; die Geraetepunkte gelten
  jetzt auch fuer Override-Felder (vorher ausgenommen).
- **Compiler-Rand:** `STRUCTURAL_PROP_KEYS` (Overrides, componentId, name, ...) lebt jetzt in
  `widget-engine/legacy.ts` und wird vom offenen CSS-Pass ausgeschlossen — sonst emittiert der
  Compiler `component-id: ...` als Deklaration; der Editor-Store nutzt dieselbe Liste.
- **Tests:** `section-sdk` +1 (Instanz→Root-Kopie + Klassen), `engine/test/components.test.ts`
  +1 (idMap-Eintrag der Instanz), `editor/test/canvas/rules.test.ts` +1 (scoped Rule + Tablet-
  Override auf der Kopie, kein `component-id`), `editor/test/inspector.test.ts` +1
  (Override-Feld mit Geraetestufen). **Zahlen:** fokussiert 399 gruen / 28 Dateien,
  Gesamtlauf 1372 gruen / 2 uebersprungen / 151 Dateien (ein bekannter Ephemeral-Port-Flake
  `editor-browser`, in Isolation gruen), typecheck 0, lint 0.

### 2.18 Publish-Versionen site-weit (21.09., uncommittet): Drift blockiert das Release

- **Entscheidung (Nutzer, 21.09.):** Der Pin wird ein Vertrag — der Release-Publish bricht ab,
  solange eine Instanz eine aeltere Definitionsversion pinnt (site-weit ueber alle Seiten);
  kein stiller Fallback auf die neuere Definition. (Die Alternative „alte Versionen
  speichern, Bake gegen den Pin rendern" wurde verworfen — der Release-Snapshot friert die
  Seite weiterhin ein, der Pin ist das Signal.)
- **Check (`engine/src/checks.ts`):** `checkComponentDrift(pages, severity)` laeuft ueber
  `componentDrift` (section-sdk) — `stage: "publish"` hart, `stage: "submit"` weich (der
  Review soll den Drift sehen, bevor er aufgeloest wird). Die Meldung nennt Instanz, Pin und
  aktuelle Version, die Empfehlung den Weg (`update_component_instances` bzw. das
  Kontextmenue „Instanzen aktualisieren").
- **Wirkung:** `publishRelease` bricht mit `guardrail`/422 ab (`Hard checks failed during
  publish: Instance … pins component version 1, but the definition is at version 2`);
  `rebakeActiveRelease` bleibt bewusst unberuehrt (Content-Pfad, kein Release) — als Grenze
  dokumentiert.
- **Tests:** `guardrails.test.ts` +1 (publish hart, submit weich, ohne Drift frei),
  `lifecycle.test.ts` +1 (HTTP: Publish 422 → Instanz-Update → 201). **Zahlen:** Gesamtlauf
  **1375 gruen / 2 uebersprungen / 151 Dateien, EXIT 0** (Log
  `.scratch/testlauf-21-09-t04publish.log`), typecheck 0, lint 0.

### 2.19 Varianten (21.09., uncommittet): kombinierbare Property-Sets

- **Entscheidung (Nutzer, 21.09.):** Kombinierbare Property-Sets — die Definition erklaert
  benannte Varianten, jede ein Props-Overlay auf ihre Teile; die Instanz aktiviert beliebig
  viele gleichzeitig. Keine Achsen-Matrix, keine Kombinatorik-Explosion.
- **Modell (`section-sdk/components.ts`):** Definition `props.variants` =
  `{ name: { partId: props } }`, Instanz `props.variants` = Namensliste (ein String zaehlt als
  einer). `definitionVariants`, `instanceVariants`, `activeVariantProps` (Merge in
  Definitionsreihenfolge), `unknownVariants` (gemeldet, nie still geloescht);
  `ComponentDefinition.variants` traegt die geparste Form. Der Inliner merged die aktiven
  Overlays **vor** den Instanz-Overrides — der Variant-Swap behaelt sie, weil sie per Part-Id
  adressiert sind; ein Varianten-Patch auf einer verschachtelten Instanz ist ein Swap.
- **Canvas (`editor/canvas/rules.ts`):** der Varianten-Patch landet wie der Override in der
  Copy-CssNode (sonst driftet das Canvas-Styling vom Bake).
- **Inspektor (`inspector/model.ts`, `inspector.ts`):** eine Gruppe „Varianten" mit einem
  Switch je deklarierter Variante (`commit.kind: "variant"`); Commit/Clear schreiben die
  Instanzliste (`setComponentVariants`, Definition-Reihenfolge, unbekannte Namen abgelehnt).
- **MCP:** `list_components`/`get_component` zeigen Varianten (Definition: Namen/Overlays,
  Instanz: aktive); neues Tool `set_component_variant` (aktivieren/deaktivieren, idempotent);
  Registry (`structural.ts`) kennt `variants` an Definition und Instanz; Skills (Router +
  Master-Flow) nennen den Weg.
- **Tests:** section-sdk +5 (Lesehelfer, Merge, Swap behaelt Overrides, Nested-Swap,
  unbekannte Namen), Editor +3 (Op, Inspektor-Gruppe, Canvas-Copy), Engine +1 (Komposition),
  MCP-Workflow erweitert, Browser-Rundlauf (Variante per API, Switch im Inspektor, Canvas
  zeigt den Overlay-Text; `14-komponente-variante.png`).
- **Zahlen:** Gesamtlauf **1384 gruen / 2 uebersprungen / 151 Dateien, EXIT 0** (Log
  `.scratch/testlauf-21-09-varianten.log`; ein erster Lauf hing an einer Windows-Dateisperre
  im Bake-Stage, in Isolation gruen), typecheck 0, lint 0.
- **Grenze:** Varianten **anlegen** (Overlay schreiben) laeuft ueber `apply_mutations`
  (`updateNodeProps` auf die Definition, Agenten-Weg); der Editor aktiviert sie nur. Ein
  Editor-Menue zum Anlegen bleibt offen.

### 2.20 Ticket 19 M6 (21.09., uncommittet): Scrub-Regler im Live-Modus

- **Kern:** Der Live-Modus zeigt die echte Seite mit der Release-Runtime; ein Regler im Fuss
  faehrt jetzt ihre Scroll-Position an — Pin-/Scrub-Presets sind ohne Mausrad pruefbar
  (ScrollTrigger reagiert auf das ausgeloeste Scroll-Event). Der Rueckweg fuehrt den Regler
  nach: Scrollen im Frame schreibt den Fortschritt zurueck.
- **Mathematik (`editor/src/canvas/scrub.ts`, neu):** `scrubOffset(progress, maxScroll)` und
  `scrubProgress(scrollTop, maxScroll)` — begrenzt, NaN-fest, ohne DOM.
- **Canvas (`canvas.ts`):** Regler `input[data-action="scrub"]` in der Fuss-Gruppe, nur im
  Live-Modus aktiv (Design disabled); `bindFrame` haengt den Scroll-Listener an jedes
  Frame-Dokument. `dom.ts` kennt dafuer `documentElement`/`scrollHeight`/`clientHeight`
  (optional, Test-Doubles bleiben gueltig). Styles in `canvas/styles.ts` (`--ed-ink-muted`,
  `--ed-signal-accent`).
- **Tests:** `editor/test/canvas/scrub.test.ts` +2 (beide Richtungen, Grenzen);
  Browser-Rundlauf: Live-Modus → Regler auf 100 % → `scrollTop > 0`, manuelles Scrollen
  fuehrt den Regler auf 0, im Design ist er aus. **Zahlen:** Gesamtlauf **1386 gruen /
  2 uebersprungen / 152 Dateien, EXIT 0** (Log `.scratch/testlauf-21-09-m6scrub.log`),
  typecheck 0, lint 0.
- **M6-Rest (bewusst offen, je eigenes Ticket):** freie Timeline, Page Transitions,
  3D-Preset, Motion an VCs/Templates.

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
| 2 | Style-Rule-Registry (Server ✅), Wert-Grammatik ✅, Editor-Modell ✅, Inspektor ✅ (20.09.) | ✅ | `issues/07`, `10`, `13`, `02` |
| 3 | Chrome: Explorer/Kontextmenü/Spotlight ✅, DnD ✅, Design/Live ✅, Inline-Edit ✅, Undo-UI ✅, Keyboard ✅, Drag + Tabs ✅ (20.09.) | ✅ | `issues/03` + 12/16 |
| 4 | Visual Components: Scheibe 1 (Component-Kern) ✅ + Scheibe 2 Teil 1 (speicherbar, Bake-Rekey, Overrides) ✅ (20.09.) + Teil 2 (Komponenten-Tab, Kontextmenü) ✅ (21.09.) + Scheibe 3 (Styles je Instanz, Gerätestufen) ✅ (21.09.); Sections-Migration offen | 🔄 | `issues/04` |
| 5 | SSE-Kanal, Live-Mitverfolgung, Leistungsbudget | ✅ (21.09.) | `issues/05`, `pruef-t05-performance.mjs` |

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
- **Zwei-Ebenen-Fence (umgesetzt, Ticket 18):** ADR-0005 öffnet die **Property-Ebene** für
  Menschen. Die **Wert-Ebene** ist für Agenten eingehegt: `authoredBy` kommt aus dem Token
  (Updates erhalten die Provenienz), Farb-Literale brauchen ein passendes Theme-Token,
  `ambient`/`rawCss` bleiben Mensch — verortet im Schreibpfad des Stores
  (`engine/src/style-fence.ts`).
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
| 02-style-engine-inspector | Inspektor, volle CSS-Fähigkeiten, MCP-Style-Tools | **erledigt (20.09.)** — Punkte 3–7: Override-UX, Forced States (scoped Rule + Transport), Token-Picker, offene Property-Zeile, MCP-Tools |
| 03-editor-chrome | Phase 3: Explorer, Kontextmenü, Spotlight, Inline-Edit, Tastatur | **erledigt (20.09.)** — inkl. Inline-Edit, Verlauf, Keyboard, Explorer-Drag, Site-/Media-Tabs, Copy/Paste/Wrap |
| 04-visual-components | Phase 4: VCs, Sections als VCs, Cutover | **Scheibe 1 + Scheibe 2 Teil 1/2/3 + MCP-Fassade erledigt (20./21.09.)** — Kern, Engine-Aufnahme, Bake-Rekey/Multi-Instanz-Remap, Overrides (Modell/Editor/Inspektor/Canvas), Komponenten-Tab + Kontextmenü, Versionen mit Drift, Slot-Regeln (`allowedTypes`/`max`), MCP `list_components`/`get_component`/`set_component_override`/`bump_component_version`/`update_component_instances`; offen: Publish-Versionen site-weit, Varianten, Sections-Migration |
| 05-live-build-follow-polish | Phase 5: SSE, Live-Mitverfolgung | **erledigt (21.09., committet `dfff706`/`12de0aa`, Scheibe 2 uncommittet)** — SSE-Kanal, Live-Follow mit Store-Patch + Blitz, Bau-Protokoll, Auswahl-Pruning, Vorschau-Follow im Live-Modus, Agent-Vorschau ueber Seitengrenzen, Leistungsbudget mit Messskript (Insert-Median 12-13 ms) |
| 06-adr-puck-abschied | ADR-07 (Puck-Abschied) | **erledigt (20.09.)** — ADR-0007, Puck-Code + Peer-Dependency entfernt |
| 07-style-rule-modell | Kanonisches Modell im Editor-Dokument + Wert-Grammatik + `states`/`authoredBy` | **erledigt (Stufen 0–6)** |
| 08-geraetestationen | Drei Stationen | **erledigt** (O10; ui-plan/aufgaben korrigiert) |
| 09-pseudo-state-disabled | `disabled` als vierter State | **erledigt** (O11) |
| 10-layout-vokabular | Tor abschaffen, Layout als Oberflächen-Beschreibung, CSS-Namen | **erledigt** bis auf die Inspektor-Anzeige |
| 11-hidden-devices-migration | per-Breakpoint `hidden` retten | offen, **vor Cutover** |
| 12-dnd-vorziehen | DnD/Plus-Punkte/Einfügelinie | **erledigt (20.09.)** — ein Zug = ein Undo-Eintrag, `moveNode`-Index-Fix |
| 13-bridge-style-rules | Editor-Anbindung, Bake, `states` im Transport | **erledigt** (Server, Transport, Save-Pipeline, Bake, scoped-Rekey mit 22, Slot-/Collection-Transport); UI-Nutzung der Slot-Ops mit dem E2-Cutover |
| 14-klassen-emission-messen | Klassen-Emission regional vs. global messen | **erledigt (19.09.)**: global umgestellt (4,2–8,2x), regional als Option |
| 15-dialekt-entscheidung | ADR-0004 + grep-Gate-Test | **erledigt** (18.09.) |
| 16-marker-overlay-portal | Marker-Overlay im Portal (Alt-Palette beenden) | **erledigt (20.09.)** — Portal-DOM, Token-Doppelkante, Geometrie-Tests |
| 17-releases-cutover | Publish über `POST /api/releases`, Paritäts-Tor als CI-Blocker | **erledigt (20.09./21.09.)** — O9-Vorhang, Route-Publish, Paritäts-Tor gegen das Release, Rollback, `pnpm verify:parity` + CI-Workflow; Funde: `variant`, Font-Auslieferung |
| 18-agent-style-gate | Wert-Ebene-Fence als Tests (`authoredBy`) | **erledigt (19.09.)** — Author-Resolver, Idempotency-Keys, Fence; `idempotentHint` bleibt opt-in |
| 19-motion-authoring | Motion-Spec v2 im Editor: Modell/Bridge, Inspektor, Canvas (Play), Guardrails | **M0–M5 + M4 Stufe 1 + M6 Scrub umgesetzt** (20./21.09.); M6-Rest (freie Timeline, Page Transitions, 3D, Motion an VCs) bewusst offen |
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
(Klassen-Emission gemessen, auf global umgestellt), Welle 1 Teil 1 (Ticket 11, E17 S1,
E4 S0 — committet) sowie Ticket 18 komplett (Author-Resolver, Idempotency-Keys,
`authoredBy`-Fence — committet `824b9ba`). **Am 20.09.:** Welle 1 Teil 4 — Pakete #5–#10
(Inspektor S1, EditorSession, Chrome S1, DnD, Release-Cutover, E16 P0 + E12 S1; Code
committet `55593f1`). Der Testlauf ist grün (**1270/2/141**, Log
`.scratch/testlauf-20-09-welle1rest-4.log`). Danach **M4 Stufe 1 + Ticket 03 Punkt 6**
(Live-Modus im Canvas, Zoom-Footer, Frame-Labels, Breakpoint-Dimming; **1292/2/144**, Log
`.scratch/testlauf-20-09-m4s1-2.log`; committet `a4ec1c4`, §2.4).

**Als Nächstes:**

1. **Runde 2 + Ticket 04 Scheibe 1 (20.09.): erledigt, committet** (`d25e4d0`/`c0da522`/
   `619c5d8`) - siehe §2.7/§2.8. **Ticket 04 Scheibe 2 Teil 1 (20.09.): erledigt, committet**
   (`7f7ccd6`/`2c64aaf`/`41a2ddb`) - siehe §2.9. **Teil 2 (21.09.): erledigt, uncommittet**
   (Komponenten-Tab, Kontextmenü, Namen im Baum) - siehe §2.10. **MCP-Fassade (21.09.):
   erledigt, uncommittet** (`list_components`, `get_component`, `set_component_override`) -
   siehe §2.11. **Teil 3 (21.09.): erledigt, uncommittet** (Versionen mit Drift, Slot-Regeln,
   `bump_component_version`/`update_component_instances`) - siehe §2.12. **Ticket 05 Scheibe 1
   (21.09.): erledigt, committet** (`dfff706`/`12de0aa`) - siehe §2.13. **Ticket 05 Scheibe 2
   (21.09.): erledigt, uncommittet** (Vorschau-Follow, Agent-Vorschau, Leistungsbudget) - siehe
   §2.14. Damit sind die Phasen 2, 3 und 5 fachlich abgeschlossen; offen sind **Ticket 04
   Scheibe 2 Rest** (Publish-Versionen site-weit, Varianten, Sections-Migration) und **Ticket 19
   M6** (optionale Scrub-Stufe).
2. **Vor dem E2-Cutover (Ticket 04):** Katalog-Namen in der Engine registrieren (Strangler) —
   **die strukturellen Typen sind jetzt registriert** (§2.9), **die Dublette `divider`/`embed`
   ist aufgeloest** (§2.15, Zwillings-Bruecke + Guard); noch offen: Paritäts-Tor als
   CI-Blocker scharf schalten. Ticket 11 ist erledigt (19.09., `hiddenDevices`).
3. **Danach:** Ticket 04 Scheibe 2 Rest (Publish-Versionen, Varianten, Override-Ebenen,
   Sections-Migration), Ticket 19 M6 (Scrub) und die offenen E-Pakete aus
   `docs/verbesserungsplan.md` (E18 inkrementelles Rendering hat mit §2.14 jetzt Zahlen).

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
- `pnpm verify:parity` — das Paritäts-Tor als blockierender Schritt (Browser
  Pflicht, `SENIFY_REQUIRE_BROWSER=1`; fehlt Chromium, wird das Tor rot statt
  übersprungen). In CI: `.github/workflows/verify.yml` (verify + verify:parity).
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

**Neu am 21.09.:**

- **Die UI-Entscheidung gehört ins Modell, nicht ins DOM.** Das Panel ist im Node-Lauf nicht
  prüfbar; welcher Menüeintrag für welchen Knoten gilt (und wie Zustandslabels heißen), liegt
  deshalb als reine Funktion in `explorer.ts` (`editorMenuItems`, `buildComponentList`,
  `editorNodeLabel`) — das Panel rendert nur. Muster für die nächsten UI-Slices.
- **Der v1-Deep-Link (`?view=editor`) prüft nur die Hülle:** `app.js` reicht
  `currentTree = fresh.draft` (v2-Dokument) an `mountEditor`, das ihn als v1-`NodeTree` liest
  (`node.type` statt `primitive`); der Browser-Test zählt nur die drei iframes. Der Alt-Pfad ist
  damit schon vor dem Cutover außerhalb seines Vertrags — Kandidat für Ticket 04/E2.
- **Definitionen und Slots tragen ihren Anzeigenamen in `name`:** F2 schreibt dort (die
  Wert-Grammatik lässt strukturelle Props aus); eine Instanz hat keinen eigenen Namen, ihr Label
  kommt aus der Definition über `componentId` (Fallback Id).
- **Eine Definition hat genau ein Wurzelkind** — ein Slot-Platzhalter gehört *in* dieses Kind,
  nicht als zweites Kind der Definition; sonst meldet der Inliner „mehr als eine Wurzel". Die
  Engine erlaubt strukturelle Kinder auch in Sektionen mit `allowedChildren: "none"`
  (Indirektion), das Modell bleibt trotzdem eines.
- **Die Produktions-Registry kennt `container`/`block` nicht** (Test-Sektionen aus
  `engine/test/helpers.ts`); MCP-/Engine-Tests bauen Definitionen aus kuratierten Typen
  (`hero`, `divider`, …). Die MCP-Komponenten-Tools spiegeln die Editor-Logik als eigene
  Helfer, importieren aber keine Editor-Pakete (Dependency-Richtung bleibt mcp → registry).
- **Slot-Regeln kommen aus dem Baum, nicht aus einem Register:** Engine (`slotRulesFor`) und
  Editor (`editorSlotSpecs`) lösen Instanz → Definition im jeweils eigenen Baum auf; so gelten
  die Regeln auch für Definitionen, die erst im selben Draft/Bake entstehen.
  `componentDefinition(tree)` (section-sdk) bleibt der Lesepfad für Modell-Nutzer.
- **`version`/`componentVersion` sind strukturelle Props:** die Registry deklariert sie nur
  (`version`, `componentVersion`, `allowedTypes`, `max`), der Editor nimmt sie in
  `STRUCTURAL_PROPS` von der Bekannt-Prüfung aus; ein Bump schreibt genau `props.version`.
- **Drift ist ein Signal, kein Automatismus:** `bumpComponentVersion` lässt jede Instanz auf
  ihrem Pin; erst `updateComponentInstances` zieht alle in **einem** Batch nach (ein Undo).
  Der Release-Snapshot friert die Seite weiter ein — alte Versionen werden nicht gespeichert.
- **Im Browser-Test nach dem Umbenennen neu lokalisieren:** ein Locator mit
  `hasText: "Komponente · hero"` matcht nach F2 (`karte`) nichts mehr; der Timeout schlug im
  `click` zu, nicht am Badge. Nach jeder Umbenennung einen frischen Locator bauen.

**Neu am 20.09.:**
- **Ein zweiter Strang arbeitet im selben Baum** (Referenz-Bibliothek/Redesign:
  `references-*`, `redesign-package.*`, app.js/app.css). Seine unfertigen Stellen sind
  nicht vom Editor-Umbau: `pnpm lint` meldet `plainId` in
  `packages/engine/test/redesign-package.test.ts`, und ein Gesamtlauf kollidierte beim
  docs-portal-Build (`dist`), der in Isolation 4/4 grün ist. Vor dem eigenen Commit den
  Baum erneut prüfen und fremde Änderungen mitnehmen.
- **Der Koordinaten-Klick über die iframe-Grenze bleibt unzuverlässig:** im
  Canvas-Browser-Test kommt der Playwright-Klick in das weit rechts liegende Tablet-Blatt
  nicht an — der Test klickt programmatisch (`element.click()`) und prüft denselben Handler.
- **Live-Modus im Canvas ist 100 % und ohne Chrome:** Zoom- und Forced-State-Schalter sind
  dort deaktiviert, die Bühne hat kein Padding, der Frame scrollt selbst
  (`data-mode="live"`); die Runtime kommt aus `motion-inject.ts` (eine Quelle mit dem
  v1-Editor), Lenis folgt dem Site-Profil.
- **Playwright liefert über die iframe-Grenze ein spurious `mouseout`:** Ein gestufter
  `mouse.move` auf ein Element im Frame löst `mousemove` **und** direkt danach `mouseout`
  (relatedTarget `null`) aus — Hover-Zustände flackern weg. Der Canvas-Browser-Test
  dispatcht für den Hover-Ring deshalb synthetisch eine bubbelnde `MouseEvent` im Frame
  (derselbe Handler).
- **Ein Panel zur Zeit:** Paletten/Token-Panels des Inspektors hängen an einem Feld-Key
  (`paletteKey`/`tokenPanelKey`), nicht an einem Boolean — ein gemeinsames Flag öffnete das
  Panel unter **jedem** passenden Feld.
- **Scoped-Regeln im Transport:** Die Create-Route (`POST /api/sites/:id/style-rules`)
  erwartet `nodeId` und leitet Name/Selector daraus ab; das PATCH-Schema hat kein `scope`
  (der Server behält es). `scope` im Create-Body würde am geschlossenen Schema scheitern.
- **Die v1-Bridge ist die Grenze für Katalog-Features:** `setNodeProp` auf einer Sektion
  akzeptiert nur deren Props (`Unknown prop "borderRadius" for section "divider"`, HTTP 400).
  Der Browser-Test für die offene CSS-Fläche nutzt deshalb eine Sektions-Property
  (`textColor`); freie Properties sind im Modelltest belegt und bleiben dem E2-Cutover
  (Ticket 04) vorbehalten.
- **Strukturelle Knoten brauchen die Engine-Registry, nicht nur den Editor:** Die
  reservierten Typen waren nur im Widget-Katalog bekannt; jeder Speicherversuch endete in
  `Unknown section type "__component"`. `registerStructural` hält sie aus `list()` heraus
  (Katalog/Doku bleiben kuratiert) und `allowedChildren: "any"` ist die Form für offene
  Container (der Widget-Katalog kennt sie seit Phase 0).
- **Der Layout-Splice rekeyt Knoten, keine String-Referenzen:** `componentId` zeigte nach
  dem Splice auf eine Draft-Id, die es im komponierten Baum nicht mehr gibt — der Bake
  brach mit `Component "…" is not defined` ab. `remapComponentRefs` (copy-on-write) schreibt
  vor dem Inlining um; die Canvas ist nie betroffen (sie splict nicht), der Fehler war
  bake-only.
- **Eine Draft-Id, mehrere komponierte Ziele:** Die Draft→komponiert-Map (Ticket 22) trägt
  seit Ticket 04 **Listen** (`Map<NodeId, NodeId[]>`). Vorher folgte eine scoped Regel nur
  der ersten Kopie; jetzt bekommt jede Instanz ihren Selektor.
- **Overrides gehören auf die Instanz, nicht in die Definition:** Der Beutel
  (`props.overrides`, Part-Ids = Knoten-Ids) wird beim Inlining in die Kopie gemischt. Beim
  Detach müssen die Werte in echte Props materialisiert werden (zwei `applyBatch`-Schritte,
  aber ein gemeinsamer Coalesce-Key = ein Undo).
- **Ein Klick in eine Instanz trifft eine Kopie:** Die Kopie-Id existiert nicht im Dokument;
  `inlineComponents.origins` (Kopie → Instanz + Teil) macht daraus die Instanz-Auswahl —
  ohne die Map wäre die Instanz nur über den Explorer erreichbar.

---

## 9. Verweise

- Entscheidungen: `docs/adr/0001–0007` (0004 PG-only, 0005 offenes CSS, 0006 Motion-Authoring, 0007 Puck-Abschied).
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
