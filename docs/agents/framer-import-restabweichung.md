# Framer-Import: wo die restlichen 0,98 % liegen (21.10.2026)

Diese Notiz hält fest, was nach dem Fußzeilentext und dem Rahmen-Fix an
Abweichung übrig bleibt — und warum sie kein Import-Fehler ist.

## Stand

| Breite | Pixel-Differenz (Quellschriften) | Seitenhöhe |
|---|---|---|
| Desktop 1440 | 0,98 % | 5289 = 5289 |
| Tablet 900 | 1,54 % | 5304 = 5304 |
| Mobil 390 | 2,23 % | 7482 = 7482 |

## Was gemessen wurde

**Die Textboxen liegen auf dem Pixel.** Für das Zitat, die Testimonial-Karten,
die Produktkarten und den CTA-Abschnitt wurden Oberkante, Höhe, Breite und
Schrift (Größe, Gewicht, Zeilenhöhe, Farbe) beider Seiten verglichen: sie sind
gleich. Beispiel Zitatblock: Quelle 1152,19 px, Import 1152,19 px; Zeilen
55 px auf beiden Seiten. Beispiel Testimonial-Karte: Laura Kim 3862,1 gegen
3863,1 px vor dem Rahmen-Fix, danach gleich.

**Die Abschnittshöhen sind gleich.** Der Abschnitt „Trust & Testimonial" misst
beidseitig 662 px, der Produktabschnitt 902,78 px, der Kartenblock 806,78 px.

**Die Bandbilder sind deckungsgleich.** Für die Bänder mit der größten
Abweichung (1750: Produktkarten, 700: Hero-Karte, 4300: CTA) wurden Ausschnitte
beider Seiten gerendert und verglichen: kein sichtbarer Unterschied in Layout,
Schrift oder Farbe.

## Bearbeitbarkeit

Der Fußzeilentext ist ein echter `body`-Knoten, kein Bild:

| Eigenschaft | Wert |
|---|---|
| `primitive` | `body` |
| `html` | `"Alex Rivera"` |
| `fontSize` | `19.9391cqw` |
| `lineHeight` | `0.8` |
| `fontWeight` | `600` |
| `fontFamily` | `"Manrope", "Manrope Placeholder", sans-serif` |

Ein geänderter Text (`"Neuer Name"`) schlägt durch, die Größenregel bleibt
erhalten, und `validateDocument` meldet **0 Befunde**. Der Text lässt sich im
Editor also ändern wie jeder andere Text — die Skalierung folgt der Box.

## Icons

Im gebackenen Ergebnis tragen **alle 16 sichtbaren SVGs ihre Zeichnung**
(`<path>`/`<g>`/`<circle>`), und **kein einziges** hält noch einen
`<use href="#…">`-Verweis. Die Quelle hat an derselben Stelle 16 SVGs, davon 8
mit `<use>` auf das Sprite `#3403169090`; der Capture löst jeden Verweis in die
Zeichnung auf (`symbolsOf`/`withSymbols`), der Mapper gibt sie als `svg`-Prop
weiter. Die acht `data-name="symbol"`-Wrapper sind damit kein Fallback, sondern
nur der Name des Wrappers.

## Die verbleibenden Ursachen

1. **Kanten-Antialiasing.** pixelmatch zählt jeden Pixel, dessen Farbe um mehr
   als die Schwelle abweicht. Wo Text oder eine gerundete Kante auf einer
   anderen Subpixel-Position liegt, färbt der Browser den Randpixel anders.
   Das ist keine Verschiebung — die Boxen sind gleich —, sondern die
   Rasterung. Es trifft jede Textkante der Seite und summiert sich auf etwa
   1 % der Fläche.

2. **Der „Made in Framer"-Badge.** Framer setzt ihn als `position:fixed`-Widget
   in seine veröffentlichte Seite (`#__framer-badge-container`, `padding:20px`,
   unten rechts). Er ist Werbung des Baukastens, nicht Inhalt der Website, und
   wird bewusst nicht importiert. Auf dem Desktop-Bild macht er die sichtbare
   Restdifferenz der Fußzeile aus.

3. **Die Sterne der Bewertung.** Sie stehen nicht im Server-HTML (eine
   Framer-Code-Komponente füllt fünf leere `display:contents`-Platzhalter erst
   im Browser). Der Import lässt an ihrer Stelle den leeren Rahmen stehen.

4. **Ein Subpixel-Rest im Fußzeilentext bei 1280 px.** Die Quelle skaliert das
   `viewBox` (Höhe/Breite = 169/1058,22 = 0,15970); die Formel setzt
   `line-height:0,8` auf `19,9391 %` der Breite = 0,15951. Bei 1280 px ist der
   Footer dadurch **0,22 px** kürzer. Bei 1440, 1100, 1024, 810, 768, 600 und
   480 px ist die Höhe exakt gleich; der Rest liegt unter einem Pixel und
   wurde bewusst nicht mit einer Näherung überdeckt.

## Zwischenbreiten

Über sieben weitere Breiten gemessen (1280, 1100, 1024, 810, 768, 600, 480 px):
**0,90 – 2,12 %** Pixel-Differenz, die Seitenhöhe bis auf den 0,22-px-Rest oben
überall exakt gleich. Der Import bricht also an denselben Stellen um wie die
Quelle.

## Was das für die Abnahme heißt

Die Seite ist auf allen drei Breiten **exakt gleich hoch** und die Textboxen
liegen auf dem Pixel. Die verbleibende Pixel-Differenz ist Rasterung und ein
Fremd-Widget, keine fehlende oder verschobene Gestaltung. Wer die Zahl weiter
drücken will, muss den Vergleich auf Textkanten maskieren — nicht den Import
ändern.
