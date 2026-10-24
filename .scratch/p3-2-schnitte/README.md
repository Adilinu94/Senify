# Werkzeuge für die P3-2-Schnitte (R12)

Diese drei Skripte beantworten die Frage, die bei jedem Schnitt aus
`http-routes-sites.ts` neu gestellt wird — und die ich beim ersten Anlauf
falsch beantwortet habe, weil ich sie aus dem Kopf geschätzt habe.

| Datei | Frage | Aufruf |
|---|---|---|
| `routenliste.mjs` | Welche Route steht in welcher Zeile? | `node .scratch/p3-2-schnitte/routenliste.mjs [datei]` |
| `messung-routen.mjs` | Welche Pfadgruppe braucht wie viele Import-Quellen? | `node .scratch/p3-2-schnitte/messung-routen.mjs` |
| `messung-block.mjs` | Was zieht genau dieser Kandidat mit, was bleibt? | `node .scratch/p3-2-schnitte/messung-block.mjs 16-21` |

## Warum die Messung und nicht das Auge

Der naheliegende Zuschnitt nach Pfadgruppe war in zwei Anläufen falsch:

1. **Die Gruppierung war kaputt.** `"([a-z-]+)"` übersieht `":siteId"`
   (Großbuchstabe) und `"theme.css"` (Punkt). Danach fällt das Segment weg,
   `slice(3)` ist leer, und 50 von 61 Routen landen scheinbar in einer
   Gruppe namens „(site selbst)". Die Zahl sieht plausibel aus und ist
   Unsinn.
2. **Die Import-Zählung war null.** Ein Import über mehrere Zeilen
   (`import {\n  A,\n  B,\n} from "x"`) wird von einer Zeilen-Regex nicht
   gesehen. Jede Gruppe sah danach aus, als brauche sie *nichts* — und
   „braucht nichts" ist genau die Antwort, die einen schlechten Schnitt
   freigibt.

Beides fiel nur auf, weil die Zahl gegen die offensichtliche Erwartung
sprach (eine 60-Zeilen-Gruppe ohne einen einzigen Import). Wer die
Ausgabe liest, muss sie deshalb gegen den Quelltext halten, nicht gegen
die eigene Erwartung.

## Der Vertrag, den ein Schnitt erfüllen muss

- `routenliste.mjs` vor und nach dem Schnitt: dieselbe Routenmenge, keine
  verschwundene Route.
- `pnpm route-matrix:check` und `pnpm module:check` grün.
- `manifest`-Diff null, wenn MCP-Werkzeuge betroffen sind.
- Die neue Datei in `http.ts` (`ROUTES`) eintragen, in `vitest.config.ts`
  (Include und Schwelle), in `docs/mcp-route-matrix.md` und — über den
  Generator — in `docs/current/module.md`.
