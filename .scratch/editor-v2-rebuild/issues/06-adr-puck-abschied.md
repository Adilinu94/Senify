# Editor v2 - ADR Puck-Abschied und Widget-Engine

Status: **erledigt (20.09.)** — ADR-0007 geschrieben, Puck-Code und Peer-Dependency entfernt.
Abhaengig von: 01-widget-engine-canvas (zur Entlastung vor Phase 1 schreiben)

## Ergebnis (20.09., umgesetzt)

ADR `docs/adr/0007-puck-abschied.md` (accepted): Entscheidung, Optionen und Konsequenzen.
Entfernt: `packages/editor/src/adapter.ts`, `packages/editor/src/puck.ts`, deren Exporte in
`src/index.ts`, die Tests `adapter.test.ts`/`puck-regression.test.ts`, die optionale
Peer-Dependency `@puckeditor/core` (Lockfile aktualisiert). Stale Puck-Kommentare in
`mount.ts` auf den heutigen `FrameRenderer`-Seam umgeschrieben. Kein Laufzeit-Code und
keine App-Stelle importierte Puck (nachgeprueft); die v1-Altdaten laufen weiter ueber
`migrateV1ToV2`.

## Entscheidung

Der Editor v2 baut auf einer eigenen Widget-Engine auf; Puck wird entfernt.

## Kontext

- packages/editor/src/adapter.ts + puck.ts (~450 Zeilen) mappen NodeTree auf
  Puck-kompatible Content-Arrays. Puck denkt in Content-Arrays, nicht in styled Trees.
- Der Neubau (Widget-Engine, Style-Registry, Kaskade) hat keine Entsprechung im
  Puck-Datenmodell. Der Adapter wird zum Rein-Raus-Uebersetzer ohne Mehrwert.
- HANDOFF notiert bereits: "Puck ist nur ein optionales Peer-Dependency".

## Konsequenzen

- adapter.ts, puck.ts und die Puck-Typen werden mit Phase 1 entfernt (kein Legacy-Shim).
- Neuer Vertrag: WidgetDefinition + NodeTree-v2 + Mutations-v2 (siehe Ticket 01).
- Der Editor bleibt headless testbar (Store + Compiler ohne Browser, Instatic-Muster).
- ADR-Nummer: naechste freie Nummer in docs/adr/.
