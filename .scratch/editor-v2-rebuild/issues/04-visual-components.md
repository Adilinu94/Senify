# Editor v2 - Visual Components und Sections-Migration (Phase 4)

Status: **Scheibe 1 erledigt (20.09.)** — Component-Modell, Inliner, Canvas- und Bake-Anbindung, Editor-Ops. Offen: Sections als VCs (Punkt 2), Multi-Widget-VCs (Punkt 3), Overrides/Varianten/Versionen, Editor-UI (Komponenten-Tab), MCP/Skills (Punkt 5).
Abhaengig von: 03-editor-chrome

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
