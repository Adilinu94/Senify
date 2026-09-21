# Editor v2 - Visual Components und Sections-Migration (Phase 4)

Status: **Scheibe 1 erledigt (20.09.)**, **Scheibe 2 Teil 1 erledigt (20.09., committet `7f7ccd6`/`2c64aaf`)**, **Scheibe 2 Teil 2 erledigt (21.09.)**, **MCP-Fassade erledigt (21.09.)**, **Scheibe 2 Teil 3 erledigt (21.09.)**, **Scheibe 3 erledigt (21.09.)** — Component-Kern, Engine-Aufnahme, Bake-Rekey/Multi-Instanz-Remap, Overrides (Modell, Editor-Op, Inspektor), Komponenten-Tab und Kontextmenü, MCP-Tools (`list_components`, `get_component`, `set_component_override`), Versionen mit Drift und Slot-Regeln (`allowedTypes`/`max`), Styles je Instanz mit Geräteebenen für Overrides. Offen: Sections als VCs (Punkt 2), Multi-Widget-VCs (Punkt 3), Publish-Versionen site-weit, Varianten.
Abhaengig von: 03-editor-chrome

## Ergebnis Scheibe 3 (21.09., umgesetzt) - Styles je Instanz + Geraetestufen fuer Overrides

Ein Override ist jetzt ein echter Stil-Schreibvorgang: die Instanz kann eigene Regeln und
Klassen tragen, und Override-Props haben Geräteebenen wie jeder andere Prop.

- **Inliner (`section-sdk/src/components.ts`):** die Instanz mappt auf ihre Root-Kopie
  (`nodeIdMap`/`copies`), ihre Klassen wandern auf die Root-Kopie — nur so matcht eine
  Klassenregel am gerenderten Element (Canvas wie Bake).
- **Canvas (`editor/src/canvas/rules.ts` `withComponentCopies`):** der Override-Beutel wird in
  die Copy-CssNode gemergt (ein übersteuerter Stil-Prop muss in den Compiler, nicht nur in den
  gerenderten Baum); scoped Rules der Instanz (oder eines Definition-Parts) werden je Kopie mit
  neuem Namen/Selektor dupliziert und die Original-Regel entfällt — dieselbe Ersetzung wie das
  Bake-Remap, damit Canvas und Release denselben Anker lesen.
- **Geräteebenen (`editor/src/inspector/model.ts` + `inspector.ts`):** `markOverride` löst je
  Breakpoint auf (`deviceKey`, `resolveDeviceValue`), `overrideDevices` kommen aus den
  Suffix-Keys; Commit/Clear schreiben `deviceKey(key, breakpoint)`; die Gerätepunkte gelten auch
  für Override-Felder.
- **Compiler (`widget-engine/src/legacy.ts`):** `STRUCTURAL_PROP_KEYS` zentral, der offene
  CSS-Pass schließt sie aus (sonst stünde `component-id: …` im Stylesheet).
- **Tests:** section-sdk +1, Engine +1, Editor-Rules +1, Inspector +1.

**Zahlen:** fokussiert 399 grün / 28 Dateien; gesamt 1372 grün / 2 übersprungen / 151 Dateien
(Log `.scratch/testlauf-21-09-t04s3.log`; ein bekannter Ephemeral-Port-Flake in
`editor-browser`, in Isolation grün), typecheck 0, lint in den eigenen Bereichen 0.

## Ergebnis Scheibe 2 Teil 3 (21.09., umgesetzt) - Versionen und Slot-Regeln

Eine Definition trägt eine Version (`props.version`, Default 1), jede Instanz pinnt die Version
ihrer Platzierung (`props.componentVersion`, Default 1). Alte Versionen werden **nicht**
gespeichert - der Pin ist das Drift-Signal, der Release-Snapshot friert die Seite ein.

- **Modell (`section-sdk/src/components.ts`):** `ComponentSlotSpec` (`allowedTypes`, leer = alles;
  `max`, null = unbegrenzt) über `readSlotSpec`; `instanceVersion`, `componentDrift(tree)`;
  `ComponentDefinition.version` und `collectSlots` mit Specs.
- **Engine (`engine/src/mutations/apply.ts`):** die Slot-Regeln kommen aus dem Baum
  (`slotRulesFor`/`componentSlotSpecs`/`requireSlotRules`); `assertSlotPlacement`,
  `applySetSlotContent` und `applyCreateCollectionEntry` lehnen unbekannten Slot, nicht erlaubten
  Typ und Überfüllung ab. Test +1 in `engine/test/components.test.ts`.
- **Editor:** `editorSlotSpecs` als einzige Auflösung (Instanz → Definition, sonst Katalog);
  `operations.ts`, `canvas/insert.ts`, `canvas/dnd.ts`, `state/consistency.ts` umgestellt; neue
  Ops `bumpComponentVersion`, `updateComponentInstances` (ein Batch), `componentDriftOf/In`,
  `definitionVersionOf`, `instanceVersionOf`; `insertSlot` nimmt `allowedTypes`/`max`.
- **UI:** Drift-Badge `v1` am Instanz-Knoten, Menü `Version erhöhen` / `Instanzen aktualisieren`
  (letzteres nur bei Drift), Tab-Hinweis `v2 · 2 Instanzen · 1 alt`; Browser-Rundlauf mit
  Screenshot `10-komponente-version.png`.
- **MCP:** `bump_component_version`, `update_component_instances`; `list_components`/`get_component`
  liefern Version, Drift und je Instanz Pin/`outdated`.

**Zahlen:** `pnpm test` 1352 grün / 2 übersprungen / 149 Dateien (Log
`.scratch/testlauf-21-09-m4s2t4.log`), typecheck 0, lint in den eigenen Bereichen 0.

## Ergebnis MCP-Fassade (21.09., umgesetzt) - Komponenten für Agenten

Dieselben Fähigkeiten wie im Editor, über den bestehenden Mutations-Pfad: Definitionen liegen als
gewöhnliche Knoten im Seiten-Draft, die Tools lesen den Draft und schreiben Overrides über
`updateNodeProps` (Autor = Token-Name).

- **`list_components(pageId)`** (read): Definitionen mit Name, Part-Anzahl, Slot-Namen,
  Instanz-Anzahl und Instanz-Ids.
- **`get_component(pageId, componentId)`** (read): Parts (`id`, `type`, aktuelle Props - die
  Override-Schlüssel), Slot-Platzhalter (`id`, `name`) und Instanzen mit ihren Override-Beuteln.
- **`set_component_override(pageId, instanceId, partId, key, value, baseDraftVersion)`** (write):
  merged den Beutel wie die Editor-Op (leerer Beutel wird entfernt, `value: null` löscht den
  Schlüssel); die Definition bleibt unberührt. Guardrails: unbekannte Instanz, unbekannter Part
  (Vorschlag listet die gültigen Part-Ids) und fehlender `value` werden abgewiesen.

**Tests:** `packages/mcp/test/workflow.test.ts` +1 (Draft über `apply_mutations` aufbauen,
list/get, Override setzen und wieder löschen, `get_nodes` belegt den entfernten Beutel, drei
Guardrail-Fälle) und die Tool-Liste im Katalog-Test um die drei Namen erweitert.
`packages/skills` Router/Workflow nennen den Komponenten-Weg; `SERVER_INSTRUCTIONS` tragen ihn
als Leitlinie. **Zahlen:** `pnpm test` 1326 grün / 2 übersprungen / 147 Dateien (Log
`.scratch/testlauf-21-09-m4s2t3.log`, ohne Flake), typecheck 0, lint in den eigenen Bereichen 0.

## Ergebnis Scheibe 2 Teil 2 (21.09., umgesetzt) - im Editor bedienbar

Der Komponenten-Kern ist jetzt ohne Agenten benutzbar: anlegen, benennen, einsetzen, auflösen.

**Modelle rein (`editor/src/explorer.ts`):** `editorNodeLabel` löst die reservierten Typen auf -
eine Definition heißt `Komponente · <name>`, eine Instanz liest den Namen der Definition über
`componentId` (fehlt sie, steht dort die Id), ein Slot `Slot · <name>`. `buildComponentList`
zählt je Definition die Instanzen (der Komponenten-Tab). `editorMenuItems` liefert das
Kontextmenü je Knotenart mit bereits aufgelösten Zustandslabels (`Ausblenden`/`Einblenden`):
`component-create` an einem gewöhnlichen Knoten, `component-detach` an einer Instanz,
`component-insert` an einer Definition; Wurzel und Slot-Platzhalter bieten keine der drei.
Die Modelle sind DOM-frei und damit im Node-Lauf geprüft; das Panel rendert nur.

**Panel (`editor/src/explorer/panel.ts`):** das Menü kommt aus dem Modell. Die drei Aktionen
laufen über `createComponent`/`detachComponent`/`instantiateComponent`; ein Fehler wird als
Statusmeldung berichtet statt still verloren. Nach dem Anlegen ist die **Definition** ausgewählt
(F2 benennt sie um - `textKeyOf` kennt `name` bei Definition und Slot; eine Instanz meldet, dass
sie den Namen ihrer Komponente trägt). Nach Auflösen/Einfügen ist der neue Knoten ausgewählt.

**Shell (`packages/app/public/app.js`):** vierter Explorer-Tab `Komponenten` mit Instanz-Zähler;
ein Klick fügt eine Instanz hinter der Auswahl ein und wählt sie.

**Tests:** `editor/test/explorer.test.ts` +3 (Labels inkl. Stale-Fallback, Liste und Zähler,
Menü je Knotenart samt Zustandslabels). `packages/app/test/canvas-view-browser.test.ts` führt den
ganzen Rundlauf im Browser: Kontextmenü legt die Definition an (der Hero bleibt als Instanz 1x im
Canvas), F2 benennt sie in `karte` um, der Tab listet `1 Instanz`, der Klick fügt die zweite
Instanz ein (Hero 2x), das Kontextmenü löst sie wieder in einen echten Teilbaum auf (die
Definition bleibt mit ihrer ersten Instanz). **Zahlen:** `pnpm test` 1325 grün / 2 übersprungen /
147 Dateien (Log `.scratch/testlauf-21-09-m4s2t2.log`, ohne Flake), typecheck 0, lint in den
eigenen Bereichen 0.

**Bewusste Grenzen (Scheibe 2 Rest):** Overrides sind basisweit (keine Geräteebenen) und
betreffen Props, keine Styles/Klassen je Instanz; Publish-Versionen (unveränderliche
Definitionen) fehlen; Slot-Restriktionen (`allowedComponents`/`max`) sind noch nicht am
Modell; die MCP-Fassade (`list_components`, `set_component_override`) folgt; die inhaltliche
Migration der 27 Sections (Punkte 2/3) steht weiter aus.

## Ergebnis Scheibe 2 Teil 1 (20.09., umgesetzt) — speicherbar, auflösbar, überschreibbar

Der Kern der Scheibe 1 war lokal korrekt, aber **nicht speicherbar**: die Engine kannte die
reservierten Typen nicht (`Unknown section type "__component"`), und der Bake verlor
Definitionen, die im gespleißten Baum lagen. Beides ist behoben, dazu die Overrides.

**Engine-Aufnahme (`section-sdk` + `registry` + `engine`):** `Registry.registerStructural`
kennt strukturelle Typen (`has`/`get`), ohne sie in `list()` zu zeigen — der Katalog der
Agenten und der Doku bleibt kuratiert. `allowedChildren` kennt jetzt `"any"` (wie der
Widget-Katalog seit Phase 0), `PropControl` kennt `"json"` (der Override-Beutel wird nicht
als CSS-Wert geprüft). `registry/src/sections/structural.ts` beschreibt Definition, Instanz
und Slot; `engine/src/mutations/apply.ts` lässt strukturelle Kinder überall zu (außer im
Slot-Platzhalter) und behandelt offene Container in Kind- und Slot-Prüfung.

**Bake-Rekey + Multi-Instanz-Remap (`engine/src/templates.ts`, `bake.ts`,
`renderer/src/{bake,style-css}.ts`):** Der Splice rekeyt Knoten, nicht die String-Referenzen
in den Props — `remapComponentRefs` schreibt `componentId` vor dem Inlining auf die
komponierte Id um (copy-on-write, damit der Draft unberührt bleibt). Die
Draft→komponiert-Map trägt jetzt **Listen**: ein Definitionsteil mit zwei Instanzen bekommt
zwei Ziele, `remapScopedRules` emittiert je Kopie einen Selektor. Damit folgen scoped Regeln
allen Instanzen statt nur der ersten.

**Overrides (Modell, Editor, Inspektor):** Die Instanz trägt `props.overrides` als
`{ partId: { propKey: Wert } }`; Part-Ids sind die stabilen Knoten-Ids der Definition (nie
aus Labels abgeleitet). `inlineComponents` mischt sie beim Kopieren in die Kopie (die
Definition bleibt unberührt), auch für verschachtelte Instanzen (Instanz-Swap über
`componentId`). `componentParts` ist das deklarierte Register, `staleOverrides` meldet
verwaiste Einträge (sie werden ignoriert, nicht gelöscht). Editor: `setComponentOverride`
(ein `applyBatch`, leerer Beutel wird gepruned), `detachComponent` materialisiert Overrides
in die Kopie (zwei Batches, ein Coalesce-Key = ein Undo), `componentPartsIn`/`overridesOf`
als Lesehelfer. Inspektor: eine Instanz zeigt im Content-Tab je Teil eine Gruppe, die Felder
schreiben den Override-Beutel (`commit.kind: "override"`, `base` = Definitionswert für den
Reset, keine Gerätepunkte — Overrides sind vorerst basisweit).

**Canvas:** `inlineComponents` liefert `origins` (Kopie → Instanz + Teil); der Klick in eine
Instanz wählt über die Map die Instanz (statt einer Id, die im Dokument nicht existiert).

**Tests:** `section-sdk/test/components.test.ts` (13: Overrides, Swap, Parts, stale),
`section-sdk/test/registry.test.ts` (+2 strukturell/offen), `engine/test/components.test.ts`
(6, neu: Speicherpfad über HTTP, Splice-Rekey, Multi-Instanz-Map, Overrides),
`renderer/test/style-rules-css.test.ts` (+1 Kopie-Selektoren), `editor/test/state/components.test.ts`
(8), `editor/test/inspector.test.ts` (16), `editor/test/canvas/selection.test.ts` (+1).
**Zahlen:** `pnpm test` 1322/2/147 (Log `.scratch/testlauf-20-09-m4s2t1.log`; ein roter Lauf = bekannter Browser-Flake, in Isolation grün), typecheck 0, lint in den eigenen Bereichen 0.

**Bewusste Grenzen (Scheibe 2 Rest):** Overrides sind basisweit (keine Geräteebenen) und
betreffen Props, keine Styles/Klassen je Instanz; Publish-Versionen (unveränderliche
Definitionen) fehlen; Slot-Restriktionen (`allowedComponents`/`max`) sind noch nicht am
Modell; Komponenten-Tab/Kontextmenü im Explorer und die MCP-Fassade (`list_components`,
`set_component_override`) folgen; die inhaltliche Migration der 27 Sections (Punkte 2/3)
steht weiter aus.

## Ergebnis Scheibe 1 (20.09., umgesetzt) — Component-Kern

**Modell (`section-sdk/src/components.ts`, rein):** Eine Komponente lebt **im Baum** — kein
zweites Register, keine neue Spalte, der bestehende Transport trägt sie. Reservierte Typen
(`widget-engine/legacy.ts`): `__component` (Definition, `props.name`, genau **ein**
Wurzelkind), `__component_slot` (Füllplatz, `props.name`), `__component_instance`
(`props.componentId`, Slots füllen die Platzhalter). `inlineComponents(tree)` ist die
**eine Ableitung** für beide Renderpfade: Definitionen raus, Instanzen expandiert,
Slots gefüllt, deterministische frische Ids (`instance + original`, `nodeIdMap` +
`copies` für Style-Remaps); Probleme (unbekannte Komponente, Zyklus, mehrere Wurzeln)
enden in einem **Stub** statt im Absturz. `wouldCreateCycle` und `unfilledSlots` sind die
Prüfungen für Editor/UI.

**Canvas:** `canvas/adapter.ts` inlined vor dem Rendern (`canvasNodeTreeWithCopies`);
`canvas/rules.ts` emittiert die Knotenregeln der Definition **je Kopie** (sonst verlöre
eine Instanz das Styling der Definition und Canvas/Bake drifteten).

**Bake:** `engine/src/templates.ts` (`composePageTree`) inlined als letzten Schritt der
Komposition (Layout/Template/Seite zusammen) und **blockiert mit Fehler** bei Problemen —
kein stiller Fallback. Die `copies` wandern in die bestehende Draft→komponiert-Map
(Ticket 22), damit scoped Regeln der Definition der ersten Kopie folgen.

**Editor-Ops (`editor/src/state/components.ts`):** `createComponent` (Knoten wird
Definition, Instanz nimmt seinen Platz ein), `insertSlot`, `instantiateComponent`,
`detachComponent` (Instanz wird wieder echter Teilbaum, `duplicateNode` inkl. Scoped-Rules)
— jede Aktion ein `applyBatch`, also **ein** Undo-Eintrag und der bestehende Speicherpfad.

**Tests:** `section-sdk/test/components.test.ts` (8: Slots, Füllen, doppelte Instanzen,
Stub, Zyklus, unveränderter Baum), `editor/test/state/components.test.ts` (5: Anlegen,
Listen, Slot, Auflösen, Canvas-Inlining == zweiter Lauf).

**Bewusste Grenzen (Scheibe 2):** Overrides/Varianten/Versionen (Plan E11:
Definition/Instanz-Trennung mit unveränderlichen Publish-Versionen), Multi-Instanz-Remap
für scoped Regeln (heute folgt die erste Kopie), Slot-Restriktionen (`allowedComponents`/
`max`), Editor-UI (Komponenten-Tab im Explorer, Kontextmenü), MCP-Tools/Skills, und die
inhaltliche Migration der 27 Sections (Punkte 2/3).

## Ziel

Die 27 kuratierten Sections werden als Visual Components reimplementiert. Der Nutzer kann
jede kuratierte Section duplizieren, auseinandernehmen und umstylen - der Anti-Baukasten-Hebel.

## Umfang

1. VC-Engine: Subtree + Parameter + Slots (slot-outlet ist der Slot), Zyklen-Schutz
   (wouldCreateCycle), Publish-Inlining, Slot-Sync beim Einfuegen (syncSlotInstances-Muster).
2. Sections als VCs reimplementieren: Golden-Trees -> Parameter-Mapping (heading, variant...).
   get_section/list_sections bleiben als MCP-Fassade ueber VCs, Agenten-Flow bricht nicht.
3. Multi-Widgets als VCs aus Primitiven: marquee, gallery, testimonial, pricing, faq,
   features, team, timeline, stats, logo-cloud.
4. Parallelbetrieb (Variante B): Sections und VCs koexistieren einen Release lang,
   dann Cutover. Bestehende Sites validieren weiter (additive Migration).
5. Skills router.md/workflow.md auf VC-Begriffe erweitern (widget, component, slot),
   Bestandswissen (get_section) bleibt gueltig.

## Abnahme

- Bestehende Agenten-Workflows funktionieren ohne Breaking Change
- Jede kuratierte Section ist im Editor auseinandernehmbar und umstylbar
- VC-Instanz mit gefuelltem Slot rendert identisch im Canvas und im Bake
