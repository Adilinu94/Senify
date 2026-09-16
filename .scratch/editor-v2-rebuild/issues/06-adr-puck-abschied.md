# Editor v2 - ADR Puck-Abschied und Widget-Engine

Status: offen
Abhaengig von: 01-widget-engine-canvas (zur Entlastung vor Phase 1 schreiben)

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
