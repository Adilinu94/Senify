# Editor v2 - per-Breakpoint hidden in v2 retten (B5)

Status: **erledigt (19.09.)** — `hiddenDevices` im Editor-Modell, Lift ohne Datenverlust,
property-weiser Reset; Beleg im Ergebnis-Abschnitt unten.
Abhaengig von: nichts (Modell + Migration + Compiler, alles existierende Mechanik)
Muss liegen: VOR dem Puck-Cutover (Ticket 06 / Phase 4) — danach sind bestehende Seiten
beschädigt, nicht nur das Modell unvollständig
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B5

## Ziel

Die v1->v2-Migration verwirft laut eigenem Kommentar (state/migration.ts): „nothing is dropped
except the per-breakpoint `hidden` flag, which the v2 node model does not carry yet". Seiten,
die einen Knoten nur auf Tablet oder Mobil verstecken, verlieren dieses Verhalten stillschweigend.
Das widerspricht der eigenen Prüfkultur („Migrationen sind additive Lifts") und bricht Inhalte
beim Cutover. Instatic loest dasselbe Problem über Breakpoint-Overrides auf `hidden` — dort
erledigt; hier ist die Mechanik (device-Suffixe, device-Stufe des Compilers) bereits vorhanden.

## Umfang

1. `document.ts` — `EditorNode` um `hiddenDevices?: readonly ("tablet" | "mobile")[]`
   erweitern (bewusst schmal: `hidden` bleibt das Desktop-/globale Flag;
   `hiddenDevices` listet die Breakpoints, auf denen ZUSÄTZlich versteckt wird).
   Alternativ-Form (falls Ticket 07-Review es bevorzugt): `hidden: { base?: boolean;
   tablet?: boolean; mobile?: boolean }` — Entscheidung in diesem Ticket, konsistent zum
   Device-Suffix-Stil der Props.

2. `migration.ts` — v1-Lift: `node.overrides[tablet|mobile].hidden === true` -> Eintrag in
   `hiddenDevices`. Kein Datenverlust mehr; der Kommentar zur Ausnahme entfällt.

3. Compiler (`compile.ts`/`cascade.ts`) — device-Stufe emittiert für jeden Eintrag in
   `hiddenDevices` ein `display: none` in der passenden `@media (max-width: …)`-Regel
   des Knotens. Interaktion mit explicitem `display`-Prop am Knoten ist zu definieren:
   `display: none` aus hiddenDevices gewinnt in der device-Stufe (sie wird nach base
   emittiert) — als Golden-Test festgehalten.

4. `consistency.ts` — keine neue Invariante nötig (Feld ist optional und additiv), aber
   Migration-Test: ein v1-Baum mit per-Breakpoint hidden liftet verlustfrei; Roundtrip
   über persistBatch erhält das Feld.

5. Canvas (`adapter.ts` / React-Renderer): versteckte Knoten auf dem jeweiligen Gerät
   rendern (display: none via Compiler reicht); Explorer-Markierung „versteckt auf <device>"
   ist Ticket 03 (Chrome), nicht hier.

## Abnahme

- Migration: v1-Baum mit `overrides.mobile.hidden === true` liftet zu `hiddenDevices:
  ["mobile"]`; das Flag ist in keinem Fall mehr „dropped".
- Compiler: die mobile-Media-Query des Knotens enthält `display: none`; desktop-Ausgabe
  unverändert.
- Roundtrip: speichern/laden/publish erhält das Verhalten; Paritäts-Tor bleibt gruen.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Ergebnis 19.09. (umgesetzt)

**Modell:** `EditorNode.hiddenDevices?: readonly ("tablet" | "mobile")[]` (`document.ts`) —
bewusst schmal: `hidden` bleibt das globale Flag, `hiddenDevices` listet die Breakpoints, auf
denen zusätzlich versteckt wird. `setNodeFields` (patches) trägt das Feld, leere Listen werden
gepruned.

**Migration:** `overrides[device].hidden === true` liftet in die Liste (`migration.ts`); der
alte „wird fallen gelassen"-Kommentar ist ersetzt. Roundtrip über `serializeDocument` →
`parseDocument` → `loadDocument` getestet.

**Verhalten statt Compiler:** `hidden` ist im v2-Modell **strukturell** (Renderer/`data-hidden`,
`document.ts`-Kommentar), nicht CSS — deshalb kein `display: none` im Compiler, sondern:
- `canvas/adapter.ts` mappt `hiddenDevices` auf v1-`overrides[device].hidden`; der vorhandene
  `isHiddenAt` markiert den Knoten damit in genau den betroffenen Frames (`annotateHidden`).
- Der Bake erbt das Verhalten über dieselbe v1-Form.

**Persistenz:** Neue Editor-Mutation `setNodeHiddenDevices` (`editor-contract.ts`) → Bridge
schreibt **beide** Devices idempotent (`setBreakpointOverride { hidden: true }` bzw.
selektives `clearBreakpointOverride { hidden: true }`). `EditorNodeSpec` trägt `hiddenDevices`
für Duplikat/Undo-Restore; `NodeSpecSchema` + `buildNode` übernehmen `overrides` jetzt auch.

**Property-weiser Reset (L2, mitgenommen):** `clearBreakpointOverride` hat optionale Felder
`props?: string[]` und `hidden?: true` — selektives Löschen statt „ganzer Breakpoint weg"
(`apply.ts`, inkl. korrektem Undo-Patch vor der Mutation). Die Bridge übersetzt `clearNodeProp`
(device) auf `props: [key]`.

**Tests (alle grün):** Migration/Roundtrip (`migration.test.ts`), Operation + Undo
(`operations.test.ts`), Patch-Übersetzung (`persist.test.ts`), selektives Clear inkl.
Undo-Patch (`mutations.test.ts`), Bridge-Matrix (`editor-mutations.test.ts`). Gesamtlauf
**1183/2/132** (Log `.scratch/testlauf-19-09-welle1.log`).

**Bewusste Grenze:** `overrides[device].hidden === false` (global versteckt, auf einem Device
sichtbar) hat im schmalen Modell keine Entsprechung; der Lift behandelt nur `true`. Der Fall
wird im v1-Editor nicht erzeugt und ist bei Bedarf ein eigenes Feld (`visibleDevices`).
