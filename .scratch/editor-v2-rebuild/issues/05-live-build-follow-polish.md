# Editor v2 - Live-Bau-Mitverfolgung und Polish (Phase 5)

Status: **erledigt (21.09.)** — Scheibe 1 (SSE-Kanal, Live-Follow, Bau-Protokoll,
Auswahl-Pruning) und Scheibe 2 (Vorschau-Follow, Agent-Vorschau, Leistungsbudget).
Abhaengig von: 04-visual-components

## Ergebnis Scheibe 2 (21.09., umgesetzt) - Vorschau folgt, Agent-Vorschau, Budget

**Punkt 4 - die Vorschau laedt bei Aenderung neu (Live-Modus).** Der Store-
Wechsel im Live-Modus baut die Frames neu auf (`rebuildFrames` statt Baum-Patch):
die echte Seite wird ersetzt, die Release-Runtime frisch injiziert. Der Blitz der
Fern-Aenderung wartet auf den frischen Frame (`pendingFlash`), weil das alte
Dokument gleich verschwindet. Der Marker-Paint laeuft dafuer auch im Live-Modus
(Viewport aus der echten Frame-Groesse) — Auswahl-Chrome bleibt aus, der Ring
nicht. Browser-Test: Dokument-Marker beweist den Reload, Banner erscheint, Ring
blitzt (`12-live-vorschau-follow.png`).

**Punkt 5 - Agent-Vorschau (seitenuebergreifend).** Ein Schalter in der
Werkzeugleiste (`data-action="canvas-follow"`, standardmaessig an, global
gespeichert) laesst die Ansicht dem Agenten folgen: `draft.changed` auf einer
anderen Seite wechselt dorthin, `page.created` zieht die Seitenliste nach
(Explorer) und oeffnet die neue Seite — aber nur ohne offene lokale Aenderungen.
Eine eigene Seitenwahl schaltet den Schalter aus (Nutzerabsicht). Der SSE-Kanal
wird beim Routenwechsel jetzt geschlossen (vorher leckte jede Navigation eine
Verbindung). Browser-Test: Agent legt Seite an, Ansicht folgt, Explorer listet
sie (`13-agent-vorschau.png`).

**Punkt 7 - Leistungsbudget und Messskript.** Neues Skript
`.scratch/editor-v2-rebuild/pruef-t05-performance.mjs` (fluechtige Instanz,
Teil A echtes Canvas, Teil B Harness mit CDP-Layoutzaehlern und rAF-Beobachter)
plus Zerlegung `pruef-t05-breakdown.mjs` (CPU-Profil). **Befund vorher:** Insert
29-48 ms. **Ursachen und Fixes:** (1) der CSS-Compiler lief je Blatt
(`canvasFrameRules` 3x je Refresh) — jetzt einmal je Refresh; (2) die
Nach-Render-Annotationen liefen je Knoten mit eigenem `querySelector` — jetzt
ein DOM-Durchlauf mit Schreib-Skip; (3) der Marker-Paint mass synchron nach den
DOM-Schreibvorgaengen — jetzt `flushNextFrame()` (rAF-Lesen/Schreiben getrennt);
(4) das React-Element wurde je Blatt gebaut — jetzt einmal je Refresh
(Element-Cache, JSX dominierte das Profil); (5) die Nebenschienen folgen einen
Frame spaeter (Write-Split, aktives Blatt synchron). **Ergebnis:** erstes Paint
620-850 ms (< 1 s), Insert-Median 12-13 ms (< 16 ms), p95 21-25 ms, 2,2-2,5
Layouts je Insert (kein Thrashing), ohne Konsolenfehler. Die Streuung im
Headless-Lauf ist hoch; das Skript urteilt ueber die zwei Ticket-Zahlen, die
rAF-/Layout-Werte stehen als Beleg im JSON.

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
4. Vorschau folgt mit: Vorschau laedt bei Aenderung automatisch neu. **(erledigt, Scheibe 2)**
5. Agent-Preview-Modus: Agent baut, Nutzer sieht es im Canvas wachsen (T18-Abnahme).
   **(erledigt, Scheibe 2 - Agent-Vorschau ueber Seitengrenzen)**
6. Selektions-Pruning nach Projection: ein Undo oder Remote-Edit kann selektierte Nodes
   entfernen - Auswahl nach Tree-Membership beschneiden (pruneCanvasSelectionDraft-Muster).
7. Performance-Budget: erstes Paint < 1s, Insert < 16ms, RAF read/write-Split Pflicht,
   kein Layout-Thrashing. Messskript im Scratchpad. **(erledigt, Scheibe 2 - Zahlen im
   Skriptkopf, Beleg `pruef-t05-performance.mjs` / `pruef-t05-breakdown.mjs`)**

## Abnahme

- Agent baut, Nutzer sieht jede Aenderung innerhalb einer Sekunde mitwachsen, ohne Neuladen
  **(belegt: Scheibe-1-Browser-Test + Agent-Vorschau-Test)**
- Ein neuer Widget erscheint im Editor hervorgehoben **(belegt: Ring in Design und Live)**
- Protokoll nennt Akteur, Widget und Zeit **(belegt)**
- Ohne Verbindung faellt alles auf manuelles Neuladen zurueck, nichts bricht **(Kanal
  optional; `reload`/`retry` bleiben der Rueckfallweg)**
