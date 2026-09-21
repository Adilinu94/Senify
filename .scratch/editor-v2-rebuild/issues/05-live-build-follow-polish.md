# Editor v2 - Live-Bau-Mitverfolgung und Polish (Phase 5)

Status: **Scheibe 1 erledigt (21.09.)** — SSE-Kanal, Live-Follow, Bau-Protokoll,
Auswahl-Pruning. Offen: Vorschau-Follow (Punkt 4), Agent-Preview-Modus (Punkt 5),
Performance-Budget (Punkt 7).
Abhaengig von: 04-visual-components

## Ergebnis Scheibe 1 (21.09., umgesetzt) - der Nutzer sieht, was der Agent baut

**Engine (`engine/src/events.ts`):** `EngineEvents` als Prozess-Bus; `openStream(res, siteId)`
schreibt den SSE-Strom (Site-Filter, `retry: 3000`, Heartbeat alle 15 s, Cleanup bei
`res`-`close`). Neue Route `GET /api/events?site=…` (Scope read; unbekannte Site = 404);
`RouteResult.stream` hält die Verbindung offen, der JSON-Pfad bleibt unberührt.
Publish-Punkte: `draft.changed` (nach erfolgreichem Persist, mit Seite, berührten Knoten-Ids,
erstem Op und Akteur aus dem Token), `page.created`, `asset.uploaded`, `release.published`;
`Engine.events` liegt am Engine-Objekt für Tests/Doubles.

**Programm (`app/public/app.js`):** die Canvas-Ansicht abonniert
`EventSource('/api/events?site=…')`. Fremde `draft.changed` laden die offene Seite per
Store-Patch nach (`session.replaceDocument` — die Auswahl wird dabei beschnitten, Punkt 6),
heben die geänderten Knoten 1200 ms hervor und schreiben ins **Bau-Protokoll** (Akteur, Aktion,
Uhrzeit; unten rechts über der Bühne). Eigene Schreibvorgänge (Programm-Token) werden ignoriert;
offene lokale Änderungen blockieren das Nachladen mit Hinweis statt Datenverlust; `pagehide`
schließt den Kanal.

**Editor (`canvas/overlay.ts`, `canvas/canvas.ts`):** `markers.flash(ids)` zeichnet Ringe mit
derselben Geometrie wie die Auswahl (Ring-Pool je Blatt, späte Nachzeichnung nach dem
React-Commit); `canvas.flashNodes(ids)` löst Dokument-Ids über die Copy-Map des letzten Renders
auf — eine Instanz oder ein Definitions-Part blitzt in **allen** sichtbaren Kopien auf
(`senify-flash`, 1200 ms).

**Proxy (`app/src/server.ts`):** der Engine-Proxy beendet den Upstream, wenn der Client geht —
ohne das hielten SSE-Verbindung und Shutdown ewig (der Browser-Test lief in einen Timeout).

**Tests:** `engine/test/events.test.ts` +3 (Header/Filter/Akteur, `page.created` mit
Fremd-Site-Ausschluss, 401/404); `canvas-browser.test.ts` prüft den Blitz direkt (sichtbar →
nach dem Fenster weg); `canvas-view-browser.test.ts` fährt den Rundlauf mit eigenem
Agenten-Token (Protokoll nennt `browser-agent`, Ringe erscheinen/verschwinden; Screenshot
`11-live-follow.png`). **Zahlen:** `pnpm test` 1362 grün / 2 übersprungen / 151 Dateien (Log
`.scratch/testlauf-21-09-t05s1.log`), typecheck 0, lint in den eigenen Bereichen 0.

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
