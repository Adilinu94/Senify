# Editor v2 - Visual Components und Sections-Migration (Phase 4)

Status: **Scheibe 1 erledigt (20.09.)**, **Scheibe 2 Teil 1 erledigt (20.09., committet `7f7ccd6`/`2c64aaf`)** — Component-Kern, Engine-Aufnahme, Bake-Rekey/Multi-Instanz-Remap, Overrides (Modell, Editor-Op, Inspektor). Offen: Sections als VCs (Punkt 2), Multi-Widget-VCs (Punkt 3), Publish-Versionen, Slot-Restriktionen, Komponenten-Tab, MCP-Fassade.
Abhaengig von: 03-editor-chrome

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
