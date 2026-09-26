# T18 Live-Bau-Mitverfolgung

Status: **erledigt (21.09., über editor-v2 Ticket 05)** — Ereignis-Kanal (`GET /api/events`), Live-Follow mit Blitz, Bau-Protokoll und Vorschau-Follow sind im editor-v2 umgesetzt; der Puck-Editor aus T13/T17 ist mit ADR-0007 abgelöst.
Abhaengig von: T02 (Mutationen), T13 (visueller Editor), T17 (Elementor-Editor)

## Problem

Der Editor zeigt Aenderungen nur nach manuellem Neuladen. Es gibt keinen
Ereignis-Kanal von der Engine zum Editor (kein SSE, kein WebSocket, kein
Nachladen, geprueft in `packages/editor/src` und `packages/engine/src`).
Baut ein Agent ueber die API eine Seite, kann der Nutzer nicht zusehen.

## Umfang

1. **Ereignis-Kanal der Engine** (`GET /api/events?site=...`, Server-Sent
   Events). Ereignisse bei `create_page`, `apply_mutations`, `upload_asset`,
   `publish_release`. Inhalt je Ereignis: Site, Seite, Knoten-Ids, Aktion,
   Akteur (Tokenname oder "Editor"), Zeitpunkt.
2. **Editor folgt live**: Kanal abonnieren, betroffene Seite nachladen, neu
   eingefuegte oder geaenderte Bausteine kurz hervorheben (Lime-Rahmen,
   sanftes Einblenden, 1200ms, Precious Board).
3. **Bau-Protokoll im Programm**: laufende Liste "was der Agent gerade tut",
   mit Baustein, Aktion, Akteur und Zeit. Die Mutationen liegen bereits in der
   Datenbank, es fehlen Kanal und Anzeige.
4. **Vorschau folgt mit**: Vorschau laedt bei Aenderung automatisch neu, damit
   die Optik waechst, nicht nur die Struktur.

## Abnahme

- Ereignis trifft innerhalb einer Sekunde ein, ohne Neuladen.
- Ein neuer Baustein erscheint im Editor hervorgehoben.
- Protokoll nennt Akteur, Baustein und Zeit.
- Ohne Verbindung faellt alles auf manuelles Neuladen zurueck, nichts bricht.
- Test: Agent baut waehrend der Nutzer die Seite offen hat und sieht jede
  Aenderung mitwachsen.
