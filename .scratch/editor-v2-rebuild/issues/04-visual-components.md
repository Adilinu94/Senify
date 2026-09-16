# Editor v2 - Visual Components und Sections-Migration (Phase 4)

Status: offen
Abhaengig von: 03-editor-chrome

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
