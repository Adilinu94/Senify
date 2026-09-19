# Editor v2 - Bridge für Style-Rule-Ops persistieren (B10)

Status: **Erledigt (18.09.) — Server, Transport, Save-Pipeline, Bake-Renderpfad und
Slot-/Collection-Transport gebaut; scoped-Rekey mit Ticket 22, Klassen/Scope am DOM mit
Ticket 21 geschlossen.** Benannt bleibt: die Slot-/Collection-Ops sind transportseitig fertig,
aber im Editor erst nutzbar, wenn die Katalog-Namen in der Engine registriert sind (E2-Cutover,
Phase 4) — heute adressiert der Editor Katalog-Primitive (`collection`), die Engine kennt die
v1-Section (`collection-list`); die Schnittmenge entsteht erst mit dem Cutover.

**Nachtrag 18.09. (Tickets 21/22): scoped-Rekey geschlossen, Klassen am DOM.**
- Der Layout-Splice gibt jetzt die Draft→komponiert-ID-Map mit aus (`composePageTree.idMap`); der
  Bake reicht sie pro Route als `nodeIdMap` an die Renderer-Page, `styleRulesCss` remappt
  scoped-Regeln darauf (kanonisch neu gebaut, dedupliziert je Regel+Ziel). Jede komponierte
  Auspraegung bekommt ihren eigenen Selektor (Startseite + jede Eintrags-Route).
- Der zweite Teil des Fundes: `node.classes` und die generierte Scope-Klasse erreichten **nie**
  das DOM — `class`- und `scoped`-Regeln waren damit tote Selektoren. `SectionShell`,
  `PrimitiveNode` und der Unbekannt-Platzhalter tragen sie jetzt am Wurzelelement
  (`nodeRootClasses`).
- Belege: `engine/test/bake.test.ts` (scoped ueber Layout-Splice, Klasse am Element),
  `renderer/test/style-rules-css.test.ts` (+2), `engine/test/templates.test.ts` (+3),
  `registry/test/components.test.ts` (+2). Zahlen danach 1165/2/131.

**Nachtrag 18.09. (Nachtrag 2): Bake-Renderpfad und Klassen-Transport gebaut.**
- **Bake:** `bakePages` liest `store.listStyleRules(siteId)` und reicht die Registry an
  `bakeSite`; `styleRulesCss` (`renderer/src/style-css.ts`) kompiliert sie nach
  `assets/style-rules.css` — class-Regeln am tragenden Knoten (`node.classes`), `ambient`
  verbatim, `scoped` am Knoten, `rawCss` (@keyframes) — in `@layer user-authored`, im
  Template **nach** der Widget-Basis gelinkt (Reihenfolge wie im Canvas-Frame).
  `styleRuleToClassRule` ist die eine Abbildung Registry -> Compiler fuer alle Kinds;
  der Editor (`classRules`) nutzt sie ebenso. Tests: `renderer/test/style-rules-css.test.ts`
  (4, inkl. echtem Bake), Engine-Bake-Test mit Registry-Regel.
- **Klassen-Transport:** v1-Knoten traegt `classes`; `updateNodeMeta` kann setzen
  (`classes`), ergaenzen (`addClasses`), entfernen (`removeClasses`), `null` loescht
  `hidden`/`locked`. Neue Editor-Mutation `setNodeMeta`; die Bridge uebersetzt sie 1:1 und
  `assignClass`/`removeClass` ueber die Diff-Form. Die Save-Pipeline sendet die
  `setNodeFields`-Patches als `setNodeMeta`; `unsupported` bleibt nur fuer Slots/Sammlungen.
- **Echter Fund (benannt, mit Ticket 22 geschlossen):** der Layout-Splice rekeyt die
  Page-Knoten (`templates.ts` `rekeyChildren`). Class-Regeln wandern am Knoten mit und bleiben
  korrekt; eine `scoped`-Regel verlor ihre Draft-ID im Release. Gelöst ueber die ID-Map pro
  komponierter Route (`composePageTree.idMap` → `BakePageInput.nodeIdMap` →
  `styleRulesCss`-Remap). Dazu gehoert Ticket 21: ohne Klassen/Scope am DOM waeren die
  Anker-Selektoren auch nach dem Remap tot gewesen.
- **Zahlen:** `pnpm test` 1121 gruen / 2 uebersprungen / 127 Dateien, typecheck 0, lint 0.

**Nachtrag 18.09. (spaet): Save-Pipeline gebaut und verdrahtet.**
Entschieden vom Nutzer: **Autosave, gebuendelt** (400 ms Ruhe, kein Cmd+S) und bei Konflikt
ein **Hinweis mit „Neu laden" / „Erneut versuchen"**. Umsetzung:
- `packages/editor/src/state/persist.ts` (`createSavePipeline`): sammelt die Store-Aktionen,
  uebersetzt sie in Requests (Struktur -> Seiten-Route, Regeln -> Site-Routen), fuehrt die
  Draft-Version, pausiert bei `409`, meldet `unsupported` statt zu schlucken.
  Undo/Redo werden mitpersistiert: die Store-Events tragen jetzt den History-Eintrag, dessen
  Patch-Listen `patchesToPending` zurueck in Mutationen uebersetzt.
- `packages/app/public/app.js`: der Canvas-Toolbar speichert automatisch; der Knopf bleibt als
  „jetzt speichern", bei Konflikt erscheinen „Neu laden" und „Erneut versuchen".
- Tests: `editor/test/state/persist.test.ts` (9) und
  `app/test/save-pipeline.test.ts` (echte Engine: Prop-Aenderung im Draft, Regel mit `states`
  in der Registry, `409` -> `retry` -> gespeichert). Der Browser-Test
  (`canvas-view-browser.test.ts`) laeuft auf Autosave umgestellt.

**Benannte Transport-Luecken (nicht still):** `assignClass`/`removeClass`, `hidden`/`locked`
und Slot-/Collection-Ops hatten keine Abschnitts-Repraesentation; die Pipeline meldete sie in
`state().unsupported`. **Erledigt (Nachtrag 2):** Klassen, `hidden` und `locked` reisen ueber
`setNodeMeta` -> `updateNodeMeta` (v1-Knoten traegt `classes`). Es bleiben nur Slot- und
Collection-Ops als benannte Luecke.

**Nachtrag 18.09. (abends):** Punkt 4 des Umfangs ist erledigt - `site-contract.ts` und der
Store tragen `states`, `statePriorities`, `stylePriorities`, `contextStylePriorities`,
`rawCss` und `authoredBy`; `#assertWritableRule` prueft `rawCss` als `@keyframes`; die
Roundtrip-Abnahme laeuft in `engine/test/style-rules.test.ts` (11 Tests, inkl. einer
kanonischen Dokument-Regel unveraendert durch die Route).

**Offen bleibt (Stand 19.09.):** nichts Transportseitiges.
1. ~~Save-Pipeline im Editor~~ **erledigt** (Autosave gebuendelt, Konflikt-UX, Undo/Redo).
2. ~~Bake-Renderpfad~~ **erledigt** (`styleRulesCss`, `assets/style-rules.css`, eine Quelle:
   die Registry). ~~Offen dabei: die `scoped`-Rekey-Luecke~~ **erledigt (Ticket 22)**.
3. ~~Slot-/Collection-Transport~~ **erledigt (18.09., Nachtrag 3)**: die v2-Ops
   `setSlotContent`/`createCollectionEntry`/`updateCollectionEntry` reisen als
   `insertNode`/`deleteNode`/`setNodeProp` (Slot-Parent) bzw. ueber die gleichnamigen
   Section-Ops; Bridge, Save-Pipeline und Engine-Apply inkl. Undo-Patches sind gebaut und
   getestet (`mutations.test.ts`, `editor-mutations.test.ts`, `persist.test.ts`).
   **Benannte Grenze:** Editor und Engine adressieren heute verschiedene Vokabulare
   (Katalog-`collection` vs. Section-`collection-list`), deshalb ist die UI-Nutzung erst mit
   dem E2-Cutover (Phase 4) durchgaengig; das ist die bekannte Strangler-Luecke, kein
   Transport-Rest.

**Nachtrag 19.09. (Ticket 14): Klassen-Emission global.** Die Form „class-Regeln am tragenden
Knoten" (Nachtrag 2) ist abgeloest: `compileCss` emittiert Klassenregeln einmalig je Klasse
(`.cls`, Dedupe ueber alle Traeger, Reihenfolge per `order`) — gemessen 4,2–8,2x weniger Bytes
(`.scratch/refs/klassen-emission.md`, `map.md` O15). Die regionale Form bleibt als Option
(`classEmission: "regional"`); Knoten-eigene Zustaende bleiben verankert
(`[data-node-id].cls:hover`). Die Bake-Abnahme dieses Tickets prueft jetzt die globale Regel
plus das Traeger-Element mit Klasse und `data-node-id`.

**Stand-Korrektur 18.09.** Der Umfang unten beschreibt einen Entwurf, der so nicht gebaut wurde.
Tatsaechlich vorhanden im Working Tree (uncommittet):
- `sites.style_rules_json` (`packages/engine/src/db.ts`) plus `jsonColumns`-Erweiterung fuer
  `ALTER TABLE`-Spalten,
- Store-CRUD `listStyleRules`/`getStyleRule`/`createStyleRule`/`updateStyleRule`/
  `deleteStyleRule`/`reorderStyleRule` mit Audit-Eintraegen (`packages/engine/src/store.ts`),
- Routen `GET|POST /api/sites/:siteId/style-rules`, `GET|PATCH|DELETE .../:ruleId`,
  `POST .../:ruleId/reorder` (`packages/engine/src/http.ts`, `site-contract.ts`),
- `editor-bridge.ts` lehnt Style-Rule-Ops im Seiten-Batch bewusst ab und zeigt auf die Site-Route
  (`siteWide()`), statt sie in den Section-Baum zu uebersetzen — Punkt 2 unten ist damit erfuellt,
- Tests: `packages/engine/test/style-rules.test.ts` (echte HTTP-Runde), `db-schema.test.ts`.

**Damit ist Punkt 3/4 des Umfangs anders geloest als geplant:** Style-Regeln liegen als eigene
Site-Ressource mit eigenen Routen (nicht als Teil des Seiten-Batches in einer Transaktion). Das ist
die Form der Vergleichsbasis (Registry am Site-Shell) und passt zu O13/ADR-0005.

**Was offen bleibt (der eigentliche Rest dieses Tickets):**
1. Editor-Anbindung: der Store ruft bei `upsertStyleRule`/`deleteStyleRule`/`reorderStyleRule`
   die Site-Routen (Adressierung per `ruleId`, siehe Ticket 07). **Erledigt** (Save-Pipeline).
2. Laden: beim Oeffnen einer Seite werden die Site-Regeln ins Dokument gespiegelt
   (`parseStyleRuleRegistry`). **Erledigt** (Save-Pipeline liest die Registry beim Start).
3. Renderpfad: `bakeSite` liest die Registry und emittiert die class-/ambient-/scoped-Stufe —
   eine Quelle, nicht zwei. **Erledigt** (class/ambient/rawCss; scoped mit benannter
   Rekey-Luecke).
4. Roundtrip-Abnahme unten (Regel anlegen → speichern → neu laden → Werte, states, Kontexte da).
   **Erledigt** (`engine/test/style-rules.test.ts`, `save-pipeline.test.ts`).
5. Transaktions-Frage neu bewerten: Struktur-Ops und Regel-Ops laufen jetzt ueber zwei Routen.
   Zu entscheiden ist, ob das reicht (Regeln sind site-weit und unabhaengig vom Draft-Version-Bump)
   oder ob ein gemeinsamer Batch noetig ist. Empfehlung: reicht — die Vergleichsbasis trennt
   genauso, und der Draft-Konflikt-Check betrifft den Seitenbaum, nicht die Registry.
   **Entschieden: zwei Routen genuegen** (siehe Umfang unten).

Abhaengig von: 07-style-rule-modell (Modell muss stehen)
Muss liegen: Innerhalb von Ticket 02 als Unterpunkt „1a", VOR dem Inspektor (Punkt 2/3)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B10

## Ziel

Der Bridge-Kommentar (editor-bridge.ts) sagt: „class and collection ops have no section
equivalent yet; they fail loudly instead of writing something the section store cannot express."
Und das Zustandsbuch (ledger.md, Offen): „Die Katalog-Namen sind in der Mutations-API der
Engine nicht registriert (Strangler, E2)." Genau diese Lücke ist der Punkt, an dem der
Neubau seine eigene Zweigleisigkeit riskiert: Der Inspektor funktioniert gegen das lokale
Dokument, der Save-Pfad wird zum Nachtrag. Dieser Ticket schließt die Lücke, BEVOR der
Inspektor gebaut wird.

## Umfang (neu gefasst 18.09. — der alte Umfang beschrieb einen Entwurf, der so nicht gebaut wurde)

### Erledigt (vorgefunden im Arbeitsbaum, uncommittet)

- **E1 — Kein Abschnitts-Baum-Umweg.** `editorMutationsToSection` uebersetzt Style-Rule-Ops
  **nicht**, sondern lehnt sie mit `siteWide()` ab und nennt die Site-Route in der `suggestion`.
  Der v1-Baum lernt sie nie — Strangler-Sinn erfuellt. Beleg: `editor-bridge.ts` Z61-72, Z147-151;
  Test `engine/test/editor-mutations.test.ts` („points a style rule op at the site-wide route").
- **E2 — Persistenz.** Spalte `sites.style_rules_json` (`db.ts`) **uncommittet im Arbeitsbaum,
  nicht in HEAD**; `jsonColumns()` erkennt jetzt auch per `ALTER TABLE` ergaenzte jsonb-Spalten
  (sonst haette ein Restore ein Objekt statt JSON-Text uebergeben).
- **E3 — Store-CRUD.** `listStyleRules`, `getStyleRule`, `createStyleRule`, `updateStyleRule`,
  `deleteStyleRule`, `reorderStyleRule` — tolerantes Lesen (`parseStyleRuleRegistry`), hartes
  Schreiben (`styleRuleErrors`), `order` per `normalizeRuleOrder` auf die Array-Position
  normalisiert, Audit-Eintrag je Schreibvorgang (`create_style_rule` usw.).
- **E4 — Routen.** `GET|POST /api/sites/:siteId/style-rules`,
  `GET|PATCH|DELETE .../:ruleId`, `POST .../:ruleId/reorder` (Leserecht `read`, Schreiben `write`,
  Loeschen `publish` + `destructive`). Tests: `engine/test/style-rules.test.ts`.

### Offen (der eigentliche Rest dieses Tickets)

1. **Editor-Anbindung (Schreibrichtung).** Der Editor-Store ruft bei `upsertStyleRule` /
   `deleteStyleRule` / `reorderStyleRule` die Site-Routen. **Adressierung per `ruleId`**, nicht
   per Name — so sind die Routen gebaut, und Ticket 07 fuehrt die stabile `id` im Dokument.
   Fehler bleiben `SenifyError` mit dotted field path (`rule.styles.<prop>`).
2. **Editor-Anbindung (Leserichtung).** Beim Oeffnen einer Seite werden die Site-Regeln ins
   Dokument gespiegelt (`parseStyleRuleRegistry`, tolerant). Eine Quelle: die Site-Registry ist
   die Wahrheit, das Dokument haelt eine Kopie fuer die Canvas-Darstellung.
3. **Renderpfad.** `bakeSite` liest die Registry und emittiert die class-, ambient- und
   scoped-Stufe. **Eine** Quelle — nicht Dokument *und* Spalte.
4. **`states` im Transport.** `site-contract.ts` (`CreateStyleRuleBodySchema`,
   `UpdateStyleRuleBodySchema`) und der Store tragen `states`/`statePriorities` aus Ticket 07 mit,
   sonst verliert ein Speichern die Pseudo-Zustaende stillschweigend.
5. **Transaktions-Frage — entschieden: zwei Routen genuegen.** Der alte Umfang forderte einen
   gemeinsamen Batch mit `withTransaction` und einem `draft_version`-Bump. Das ist nicht mehr
   richtig: Regeln sind **site-weit** und stehen bewusst neben dem Seiten-Draft. Der
   Konflikt-Check (`baseDraftVersion`) betrifft den Seitenbaum; eine Regel-Aenderung darf ihn nicht
   auslösen, sonst kollidieren zwei Bearbeiter an verschiedenen Seiten ueber eine gemeinsame Klasse.
   Die Vergleichsbasis trennt genauso (Registry am Site-Shell). **Preis dieser Entscheidung,
   benannt:** ein Batch, der Struktur *und* Regeln aendert, ist nicht mehr atomar — schlaegt die
   Regel-Route fehl, bleibt die Struktur-Aenderung stehen. Das ist zumutbar, weil beide Seiten
   unabhaengig gueltig sind (eine Regel ohne Zuweisung ist harmlos, eine Zuweisung auf eine fehlende
   Regel faengt `undefined-class` in der Konsistenzpruefung).

## Abnahme (der entscheidende Roundtrip)

- **Roundtrip:** Regel headless anlegen -> speichern -> Seite neu laden: Werte, `states`,
  `contextStyles`, `order` und `id` wieder da (`origin` nur, wenn importiert).
- **Reihenfolge:** `reorderStyleRule` aendert die Emissionsreihenfolge im publizierten CSS
  nachweisbar (Golden-Vergleich der CSS-Strings).
- **Zwei-Routen-Verhalten belegt:** ein fehlschlagender Regel-Aufruf laesst eine zuvor
  geschriebene Struktur-Aenderung unberuehrt, und die Konsistenzpruefung meldet keinen Schaden.
- **Kein Draft-Konflikt durch Regeln:** zwei Seiten gleichzeitig offen, Regel geaendert — keine
  `409`-Antwort auf der Seiten-Route.
- **Paritaets-Tor:** Canvas-CSS vs. Release-CSS bleibt innerhalb der Toleranz.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.
