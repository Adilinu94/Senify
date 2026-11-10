# Ganzseitenvergleich bei laufenden Appear-Animationen

Status: ready-for-agent
Label: ready-for-agent

## Befund

Der Ganzseiten-Screenshot des animierten Builds zeigt Hero-Bild, Abschnittsbilder und Karten schwarz, obwohl sie im echten Scrollen sichtbar sind. Der erste Bildschirm stimmt (0,24 Prozent auf `/` Desktop), der Ganzseitenwert springt von 0,899 auf 9,011 Prozent. Ursache ist die Aufnahme: Beim Ganzseiten-Screenshot werden die laufenden Appear-Animationen erneut am Startzustand erwischt. Der alte Wert entstand auf einem Build, in dem `animation:none` alle Einblendungen unterdrückte und deshalb nichts zurückgesetzt werden konnte.

## Nächster Schritt

1. Vor dem Ganzseiten-Screenshot alle endlichen Animationen beenden und unendliche Animationen getrennt behandeln.
2. Oder den Vergleich aus mehreren Viewport-Aufnahmen nach echtem Scrollen zusammensetzen.
3. Den ersten Bildschirm und die gescrollten Abschnitte getrennt ausweisen, statt eine Ganzseitenzahl zu vermischen.
4. Gegenprobe: Der neue Lauf findet die Bilder und Karten, die der aktuelle Ganzseiten-Screenshot verliert.

## Abnahme

Der visuelle Beleg nennt für jeden Abschnitt den Animationszustand und liefert reproduzierbare Bilder; ein animierter Build wird nicht gegen einen statischen Build gemessen.
