# Editor v2 - Live-Bau-Mitverfolgung und Polish (Phase 5)

Status: offen
Abhaengig von: 04-visual-components

## Ziel

T18 endlich schliessen: der Nutzer sieht, was der Agent baut. Plus Performance-Budget.

## Umfang

1. SSE-Kanal der Engine (GET /api/events?site=..., Server-Sent Events). Ereignisse bei
   create_page, apply_mutations, upload_asset, publish_release. Inhalt: Site, Seite,
   Knoten-Ids, Aktion, Akteur, Zeitpunkt.
2. Editor folgt live: Kanal abonnieren, betroffene Seite nachladen, neue/geaenderte Widgets
   kurz hervorheben (Lime-Rahmen, sanftes Einblenden, 1200ms). Der neue React-Store macht
   das Nachladen trivial (Store-Patch statt Full-Reload).
3. Bau-Protokoll im Programm: laufende Liste "was der Agent gerade tut" mit Widget, Aktion,
   Akteur und Zeit.
4. Vorschau folgt mit: Vorschau laedt bei Aenderung automatisch neu.
5. Agent-Preview-Modus: Agent baut, Nutzer sieht es im Canvas wachsen (T18-Abnahme).
6. Selektions-Pruning nach Projection: ein Undo oder Remote-Edit kann selektierte Nodes
   entfernen - Auswahl nach Tree-Membership beschneiden (pruneCanvasSelectionDraft-Muster).
7. Performance-Budget: erstes Paint < 1s, Insert < 16ms, RAF read/write-Split Pflicht,
   kein Layout-Thrashing. Messskript im Scratchpad.

## Abnahme

- Agent baut, Nutzer sieht jede Aenderung innerhalb einer Sekunde mitwachsen, ohne Neuladen
- Ein neuer Widget erscheint im Editor hervorgehoben
- Protokoll nennt Akteur, Widget und Zeit
- Ohne Verbindung faellt alles auf manuelles Neuladen zurueck, nichts bricht
