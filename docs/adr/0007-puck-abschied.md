# Puck-Abschied: eigene Widget-Engine statt Content-Array-Builder

Status: accepted · 20.09.2026
Bezug: Ticket 06 (`issues/06-adr-puck-abschied.md`), Ticket 01 (Widget-Engine), ADR-0001 (JSON-first),
ADR-0005 (offenes CSS).

Der Editor v2 ist mit dem Rebuild auf eine **eigene Widget-Engine** umgestiegen: Der Baum ist ein
**styled NodeTree v2** (Knoten mit `primitive`, `props` inkl. Geräte-Suffixen, `states`, `motion`,
`classes`), die Kaskade ein **Style-Rule-Modell** (class/ambient/scoped, ADR-0005) und der Schreibpfad
eine **Mutations-v2-Sprache** (`setNodeProp`, `upsertStyleRule`, `insertNode`, …). Puck denkt dagegen
in **Content-Arrays** mit Komponenten-Slots, nicht in styled Trees; für Style-Registry, Kaskade,
Geräte-Overrides und Pseudo-States hat sein Datenmodell keine Entsprechung.

**Entscheidung:** Puck wird **entfernt**, kein Legacy-Shim. Am 20.09. gelöscht: `adapter.ts`
(`toPuckData`/`fromPuckData`), `puck.ts` (Puck-Config, Field-Mapping, Known-Issues, `loadPuck`),
beide Testdateien (`adapter.test.ts`, `puck-regression.test.ts`) und die optionale
Peer-Dependency `@puckeditor/core`. Der Adapter war zuletzt ein Rein-Raus-Übersetzer ohne
Mehrwert: kein Laufzeit-Code importierte ihn, nur die eigenen Tests; die App lädt Puck nicht
(nachgeprüft in `packages/app/public`). Der Renderer-Seam bleibt bestehen und ist heute
renderer-agnostisch: `FrameRenderer` wird von der Shell injiziert (React-Renderer bzw. Stub in
Tests).

**Betrachtete Optionen:**
- *Puck behalten, Adapter pflegen* — verworfen: zwei Datenmodelle, doppelte Pflege, keine
  Entsprechung für Styles/Kaskade; der Adapter würde mit jedem v2-Feature teurer.
- *Puck-Datenmodell übernehmen (Content-Arrays)* — verworfen: widerspricht ADR-0001
  (JSON-first, eigener Baum) und der offenen CSS-Fläche (ADR-0005).
- *Legacy-Shim für Altdaten* — verworfen: Altdaten werden über `migrateV1ToV2` in den
  NodeTree überführt, nicht über Puck-Content; kein Bestand braucht Puck.

**Konsequenzen:**
- Neuer Vertrag: `WidgetDefinition` + NodeTree v2 + Mutations v2 (Ticket 01) — eine Quelle für
  Editor, Canvas, Bake und MCP.
- Der Editor bleibt headless testbar (Store + Compiler ohne Browser, Instatic-Muster).
- `@puckeditor/core` verschwindet aus `packages/editor` (Package + Peer-Dependency); ein
  `pnpm install` räumt Lockfile/Store auf.
- Kein Puck-Wissen mehr in Kommentaren: der Renderer-Seam heißt `FrameRenderer`, der Rahmen
  ist eigener Code.
- Sollte je ein visueller Builder von außen angebunden werden, geschieht das wie heute über
  den `FrameRenderer`-Seam bzw. die Mutations — nicht über ein zweites Datenmodell.

**Referenz:** `packages/editor/src/mount.ts` (`FrameRenderer`), `packages/editor/src/react-renderer.tsx`,
`packages/editor/src/state/operations.ts` (Mutations v2), `packages/widget-engine/src/catalog.ts`
(WidgetDefinition), `.scratch/editor-v2-rebuild/issues/01-widget-engine-canvas.md`.
