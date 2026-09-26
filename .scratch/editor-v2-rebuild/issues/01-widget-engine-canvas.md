# Editor v2 - Widget-Engine und Canvas (Phase 0-1)

Status: **erledigt (20.09.)** — Fundament, Primitive und Canvas stehen; Punkt 7 (DnD, Plus-Punkte, Einfuegelinie) ist ueber Ticket 12 erledigt.
Abhaengig von: nichts (Startticket)

## Ziel

Neubau des Editors auf drei Schichten (Widget-Engine / Style-Engine / Canvas-UI).
Dieses Ticket deckt Phase 0 (Fundament) und Phase 1 (Widget-Engine + Canvas) ab.

## Umfang

### Phase 0 - Fundament

1. packages/widget-engine anlegen:
   - WidgetDefinition (id, name, category, icon, version, trusted, canHaveChildren,
     allowedChildren, defaults, propsSchema, schema, component, render, css, inlineText)
   - NodeTree-v2: Node erweitert um parentId (denormalisierter O(1)-Cache, children bleibt
     Wahrheit, re-indexiert bei Eintritt, nie vertraut), classIds: string[], inlineStyles, label
   - StyleRule-Typen: kind class|ambient|scoped, contextStyles pro Breakpoint/Condition
   - Registry-Singleton nach Instatic-Muster (registerOrReplace fuer first-party)
2. Editor-Store: Zustand + Mutative (zustand-mutative), Slices site/selection/canvas/ui/
   style/clipboard/inlineEdit/history. mutateActiveTree als einzige mode-aware Funktion.
   Patch-basierte Undo-History (O(Change), nicht O(Site)).
3. CSS-Compiler: styleBag -> CSS. Kaskade widget-defaults < class < scoped < inline.
   contextStyles als Media-Queries. Token-Resolution ({ $token: accent }).
   Gleicher Compiler fuer Publish und Canvas.

### Phase 1 - Widget-Engine und Canvas

4. 17 Primitiv-Widgets (component + pure render):
   Layout: base.container (Flexbox + display flex/grid/block), base.grid, base.divider, base.spacer
   Basis: base.text (h1-h6/p/span, Tag-Coercion), base.richtext, base.button, base.link, base.list
   Media: base.image (srcset/Variants/Focal - Media-Pipeline T08), base.video, base.svg, base.icon
   Form: base.form, base.field (Forms-Pipeline T11)
   Erweitert: base.loop (Collections, T10), base.outlet, base.slot-outlet/base.slot-instance,
   base.embed, base.html (sandboxed)
5. Iframe-per-Breakpoint-Canvas: IframeFrameSurface (sentinel-tagged srcDoc, createPortal
   in iframe-body), CanvasTransformLayer (Pan/Zoom, Start 0.5), Design- und Live-Modus.
   Style-Injector fester Reihenfolge: Editor-Chrome unlayered, Author-CSS @layer user-authored.
6. Selection-/Hover-Ringe als Overlay im Canvas-Root (1px bleibt 1px bei jedem Zoom),
   RAF read/write-Split, nur bei Overlay-Arbeit. Plus-Punkte, blaue Einfuegelinie, Handles.
7. DnD (@dnd-kit/core): resolveInsertLocation (Container-Target = letztes Kind, sonst
   sibling-after), Wrap-to-Container ueber Kontextmenue, Widget-Panel-Katalog mit Kategorien
   und Suche.

## Mutationen v2 (additiv in mutations/contract.ts)

- setNodeStyles (inlineStyles-Bag patchen, camelCase, Werte als Token-Refs oder Literale)
- assignClasses (classIds setzen/reorden)
- createStyleRule / updateStyleRule / deleteStyleRule / reorderStyleRule
- setContextStyles (rule + contextId + bag)

## Abnahme

- NodeTree-v2 roundtript durch Engine-Store (Migration additiv, alte Trees validieren weiter)
- Undo/Redo patch-basiert, Tipp-Burst = 1 Eintrag
- Widget ziehen laesst es erscheinen, Klick selektiert, drei Breakpoints zeigen denselben Tree
- Selection-Ring bleibt 1px bei jedem Zoom
- pnpm verify gruen, die 506 Bestandstests laufen weiter
