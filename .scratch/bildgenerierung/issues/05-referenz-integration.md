# Bildgenerierung 05 — Referenz-Integration „Bildrezept → Asset" (S5, I10)

Status: ready-for-agent
Quelle: `.scratch/bildgenerierung/spec.md` (Scheibe S5), Verbesserungsplan I10.
Blocked by: 02

## Kontext

`get_reference_brief` liefert bereits einen fertigen Bild-Prompt (`buildImagePrompt` aus
`imageRecipe`/`collection.imageStyle`). Dieses Ticket schließt den Kreis: Die Generierung nimmt
`referenceId` entgegen und nutzt genau diesen Prompt — der geplante Punkt I10 („Bildrezept →
Asset") ist damit erledigt.

## Aufgabe

1. `referenceId`-Pfad vollständig verdrahten (Route + MCP-Tool): Prompt kommt aus
   `buildImagePrompt(reference)`; fehlt ein Rezept, `validation`-Fehler mit Hinweis auf
   `get_reference_brief`.
2. Optional: Batch aus dem Redesign-Paket (mehrere Motive in einem Aufruf) — nur wenn ohne
   Sonderweg machbar; sonst als Folge-Ticket notieren.
3. Verbesserungsplan I10 auf erledigt setzen (Status-Notiz mit Verweis auf dieses Ticket).

## Akzeptanz

- `get_reference_brief` → `generate_image(referenceId)` → Asset; ein Test belegt, dass der Prompt
  aus `buildImagePrompt` stammt.
- I10 im Verbesserungsplan aktualisiert.
- `pnpm verify` grün.

## Referenzen

- `.scratch/bildgenerierung/spec.md` (S5)
- `packages/engine/src/references-brief.ts` (`buildImagePrompt`),
  `packages/engine/src/http.ts`, `docs/verbesserungsplan.md` (I10)
