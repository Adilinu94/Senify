# Editor v2 - Klassen am DOM (class + Scope)

Status: **umgesetzt 18.09. (Ticket 21)** — `node.classes` und die generierte Scope-Klasse stehen
am Wurzelelement; damit treffen `class`- und `scoped`-Regeln in Canvas **und** Release.

Abhaengig von: 07-style-rule-modell (Klassenmodell), 13-bridge-style-rules (Transport/Bake)
Herkunft: eigener Fund beim Bau der scoped-Rekey-Loesung (Ticket 22)

## Befund

Das Modell (Ticket 07/13) und der Compiler emittieren Klassenregeln **am Knoten verankert**:
`class`-Regeln als `[data-node-id="x"].accent`, `scoped`-Regeln als
`[data-node-id="x"].__senify_scope_x` (`widget-engine/src/css/compile.ts`, `cascade.ts`,
ADR-0005/O1). Beide Selektorformen brauchen das `class`-Attribut im DOM. Es gab **keinen
Konsumenten** von `node.classes`:

- `SectionShell` (`packages/registry/src/components/shared.tsx`) rendert `className` nur aus dem
  Prop der Section-Komponente;
- `PrimitiveNode`/`reactAttrs` (`packages/registry/src/components/primitives.tsx`) rendert
  `spec.classes` (Katalog-eigene Klassen wie `w-heading`), nie `node.classes`;
- die Scope-Klasse (`scopeNameFor(nodeId)`) wurde nirgends ans Element geschrieben.

Folge: `class`- und `scoped`-Regeln waren **tote Selektoren** — in beiden Renderpfaden
(Canvas und Bake nutzen dieselben Komponenten). Die Engine-Bake-Abnahme aus Ticket 13 pruefte
nur, dass der Knoten im HTML existiert, nicht dass die Klasse am Element steht.

Die Vergleichsbasis loest es explizit: `classNamesForClassIds(classIds, registry)` +
`injectNodeClassIds(html, node, site)` schreiben die Klassennamen ins `class=`-Attribut
(`Repos/instatic/docs/reference/css-class-registry.md`, Z124/Z320).

## Entscheidung

1. **User-Klassen ans Wurzelelement.** Das Element, das `data-node-id` traegt, bekommt
   `node.classes` zusaetzlich zu seinen Komponenten-Klassen. Sections: `SectionShell`;
   Katalog-Primitive: `reactAttrs` nur fuer `spec.root === true`; unbekannte Sections in
   `map.tsx` ebenfalls.
2. **Scope-Klasse deterministisch immer.** Jedes Wurzelelement traegt
   `__senify_scope_<nodeId>` (`scopeNameFor`). Sie ist aus der Knoten-ID ableitbar, deshalb
   braucht der Renderer **keine Regel-Registry**: Der Compiler emittiert genau dann
   `[data-node-id].__senify_scope_<id>`, wenn eine scoped-Regel existiert; die Klasse ist sonst
   inert. Die Referenz holt die Klasse ueber die `classIds`-Referenz (Regel-ID am Knoten);
   Senify v2 referenziert Klassen per **Name** (Ticket 07), deshalb der deterministische Weg
   ohne zweite Datenquelle.
3. **Warum nicht nur bei vorhandener scoped-Regel:** Canvas und Bake muessten dafuer die
   Regel-Liste in den Renderkontext durchreichen (SectionTree -> SectionShell/PrimitiveNode).
   Das waere eine zweite Wahrheit neben dem Compiler; die immer gesetzte Klasse haelt DOM und
   Selektor trivial deckungsgleich. Kosten: ein Klassenattribut pro Knoten (~30 Byte).

## Abnahme

- `SectionShell`, `reactAttrs` und der Unbekannt-Platzhalter setzen User-Klassen + Scope-Klasse;
  `class`-Attribut steht nur am Wurzelelement, nie an Kind-Elementen.
- Ein Knoten mit `classes: ["accent"]` traegt `accent` im Release-HTML; der Compiler-Selektor
  `[data-node-id="x"].accent` trifft ihn.
- Ein Knoten mit scoped-Regel traegt `__senify_scope_<id>`; der Selektor
  `[data-node-id="x"].__senify_scope_<id>` trifft ihn (Canvas und Bake).
- Bestehende Registry-Tests, die exakte `class="w-..."`-Attribute erwarten, sind angepasst.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Nachtrag 19.09. (Ticket 14)

Die Klassen-Emission ist auf **global** umgestellt (`.accent` einmal je Klasse, `map.md` O15):
Die Anker-Form fuer `class`-Regeln ist damit nicht mehr der Emissionsweg, aber die Klassen am
DOM bleiben noetig — das Element traegt weiterhin `node.classes`, sonst traefe die globale Regel
nicht. Die **Scope-Klasse bleibt verankert** (`[data-node-id].__senify_scope_<id>`), ebenso die
Kombination mit Knoten-eigenen Zustaenden (`[data-node-id].accent:hover`); Befund und
Entscheidung oben bleiben als Zeitstand gueltig.
