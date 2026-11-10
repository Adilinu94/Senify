# Reduzierte Bewegung für Appear-Regeln

Status: ready-for-agent
Label: ready-for-agent

## Befund

`appearReducedMotionCss` in `packages/framer-import/src/appear-css.ts` erzeugt eine Regel für `prefers-reduced-motion: reduce`, wird aber nirgends aufgerufen. Der bestehende Test in `appear-bake.test.ts` sucht nur die Zeichenkette `prefers-reduced-motion` und wird vom Preset-Pfad im Renderer grün, nicht von dieser Funktion. Bei reduzierter Bewegung kann eine Appear-Regel im Startzustand hängen bleiben.

## Nächster Schritt

1. Die Funktion beim Anhängen der Appear-Regeln in den Seitenstil aufnehmen, mit den tatsächlich vergebenen Klassen.
2. Den Test auf `.fi-…-appear-…` und `animation:none` präzisieren, sodass der Preset-Pfad ihn nicht mehr fälschlich grün macht.
3. Gegenprobe: ohne den Aufruf ist der Test rot.

## Abnahme

Eine Seite mit Appear-Regeln liefert unter `prefers-reduced-motion: reduce` sichtbare, statische Elemente; der Test prüft die importierte Klasse, nicht nur das Media-Feature.
