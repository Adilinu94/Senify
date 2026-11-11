# Ganzseitenvergleich bei laufenden Appear-Animationen

Status: resolved
Label: resolved

## Befund

Der Ganzseiten-Screenshot des animierten Builds zeigt Hero-Bild, Abschnittsbilder und Karten schwarz, obwohl sie im echten Scrollen sichtbar sind. Der erste Bildschirm stimmt (0,24 Prozent auf `/` Desktop), der Ganzseitenwert springt von 0,899 auf 9,011 Prozent. Ursache ist die Aufnahme: Beim Ganzseiten-Screenshot werden die laufenden Appear-Animationen erneut am Startzustand erwischt. Der alte Wert entstand auf einem Build, in dem `animation:none` alle Einblendungen unterdrückte und deshalb nichts zurückgesetzt werden konnte.

## Ergebnis 11.11.2026

Das Ganzseitenbild ist als Bewertungsgrundlage ersetzt. `.scratch/framer/visual-settle-2026-11-10.mts` scrollt die Seite echt durch, schließt vor jedem Bild alle endlichen Animationen ab (`animation.finish()`) und pausiert unendliche (`animation.pause()`). Verglichen werden Viewport-Abschnitte, nicht ein zusammengesetztes Ganzseitenbild.

Relay6 gegen die Live-Quelle, Lauf `visual-settle2-2026-11-10`:

- Build: 196 / 200 / 200 endliche Animationen abgeschlossen, 0 unendliche; Quelle: 0 / 1 / 1 endliche, je 10 unendliche pausiert (Desktop/Tablet/Mobil). Kein Abschluss ist fehlgeschlagen.
- Erster Bildschirm: 2,201 / 0,954 / 1,424 %; `/contact` 3,632 / 0,242 / 0,800 %.
- Abschnitte (Median, unter 1 %): `/` Desktop 0,346 % (11 von 15), Tablet 0,528 % (12 von 19), Mobil 1,476 % (7 von 21); `/contact` Desktop 2,660 % (1 von 4), Tablet 0,308 % (3 von 5), Mobil 1,771 % (3 von 6).
- Die Ausreißer sind Inhaltsunterschiede, keine Aufnahmeartefakte: `/contact` Mobil 28,640 % ist der benannte Calendly-Platzhalter; `/` Tablet 25,109 % und Mobil 18,866 % sind falsch skalierte Bilder (neues Issue 07 im Framer-Import-Tracker). Ein Teil der 7- bis 8-%-Werte sind laufende Marquee-Positionen der Quelle.

Jeder Abschnittsdatensatz nennt die sichtbaren `-appear-`-Elemente, ihre Deckkraft und ihre Animationsnamen. Die Bilder liegen je Abschnitt als `build-abschnitt-N.png` und `original-abschnitt-N.png` im Belegverzeichnis.

## Abnahme

Der visuelle Beleg nennt für jeden Abschnitt den Animationszustand und liefert reproduzierbare Bilder; ein animierter Build wird nicht gegen einen statischen Build gemessen.
