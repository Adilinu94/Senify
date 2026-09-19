# Editor v2 - Scoped-Regeln ueber den Layout-Splice retten (Rekey-ID-Map im Bake)

Status: **umgesetzt 18.09. (Ticket 22)** — `composePageTree` gibt die ID-Map mit aus, der Bake
reicht sie pro Route an `styleRulesCss`, scoped-Regeln werden auf die komponierten Knoten-IDs
remappt.

Abhaengig von: 13-bridge-style-rules (Bake-Renderpfad), 21-klassen-am-dom (Scope-Klasse im DOM)
Herkunft: benannte Rest-Luecke aus Ticket 13 (Nachtrag 2), `.scratch/editor-v2-rebuild/issues/13-bridge-style-rules.md`

## Befund

Der Layout-Splice vergibt beim Komponieren frische Knoten-IDs
(`engine/src/templates.ts` `rekeyChildren`). `class`-Regeln wandern am Knoten mit (die Klasse
steht am Element, der Compiler ankert auf der komponierten ID), `ambient`/`rawCss` sind ID-frei.
Eine `scoped`-Regel ist dagegen an die **Draft-ID** gebunden (`scope.nodeId`); im komponierten
Baum existiert sie nicht mehr und `compileCss` verwirft sie still („A scoped rule whose node is
gone is dead").

Zweiter Teil des Fundes: ohne die Scope-Klasse im DOM (Ticket 21) haette auch die gerettete
Regel nicht getroffen — beide Tickets zusammen stellen den Pfad end-to-end her.

## Entscheidung

1. **ID-Map aus dem Splice.** `rekeyChildren` fuellt eine optionale
   `Map<NodeId, NodeId>` (Draft-ID -> komponierte ID); `spliceOutlet` und `composePageTree`
   reichen sie durch. Kein Layout-Splice -> leere Map (Draft-IDs bleiben gueltig).
2. **Map pro Route in den Bake.** `buildBakeInput` legt je komponierter Route eine Map an und
   haengt sie als `nodeIdMap` an die `BakePageInput`s (Pagination-Varianten teilen die Map,
   weil sie denselben Baum teilen). Entry-Routen bekommen je Eintrag eine eigene Map — jedes
   Eintrags-Dokument hat eigene komponierte IDs.
3. **Remap im Renderer.** `styleRulesCss` (`renderer/src/style-css.ts`) erweitert scoped-Regeln
   ueber die Maps: pro (Regel, Ziel-Knoten) eine Kopie mit kanonisch neu gebautem
   `name`/`selector`/`scope.nodeId` (`scopeNameFor`/`scopeSelectorFor`), dedupliziert ueber
   Regel-ID + Ziel-ID. Ohne Map bleibt die Regel unveraendert (bisheriges Verhalten). Das
   Muster ist dasselbe wie `applyDuplicateNode` im Editor (dort wird die scoped-Regel beim
   Kopieren ebenfalls kanonisch neu gebaut).
4. **Kanonisch, nicht Suffix-Erhalt:** scoped-Regeln sind generiert (`createScopedRule`); eine
   gemappte Kopie wird deshalb vollstaendig aus der neuen ID gebaut. Ein synthetischer
   Custom-Suffix bleibt nur ohne Map erhalten.

## Abnahme

- `composePageTree` mit Layout: Map enthaelt die Draft-IDs der eingefuegten Seite/des Templates;
  der komponierte Baum enthaelt die Ziel-IDs.
- Bake des Blog-Szenarios: scoped-Regel auf einem Seiten-Knoten und auf einem Template-Knoten;
  `assets/style-rules.css` traegt `[data-node-id="<neu>"].__senify_scope_<neu>` je komponierter
  Auspraegung (Startseite + beide Eintrags-Routen), die HTML-Seiten tragen Knoten **und**
  Scope-Klasse.
- Kein Layout -> Verhalten unveraendert (bestehende Renderer-Tests).
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.
