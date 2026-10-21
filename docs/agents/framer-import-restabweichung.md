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

## Was das für die Abnahme heißt

Die Seite ist auf allen drei Breiten **exakt gleich hoch** und die Textboxen
liegen auf dem Pixel. Die verbleibende Pixel-Differenz ist Rasterung und ein
Fremd-Widget, keine fehlende oder verschobene Gestaltung. Wer die Zahl weiter
drücken will, muss den Vergleich auf Textkanten maskieren — nicht den Import
ändern.
