# Karten-Stapel auf Home überlappt auf Tablet/Mobil

Status: offen — Symptom belegt (12.11.2026), Ursache vermutet, noch nicht knotengenau gemessen
Label: ready-for-agent (erste Scheibe: Messung)
Type: task

## Befund

Die gestapelten Karten auf der Startseite („Potential collaborators“ /
„Insight“) liegen im Build **überlappend** statt verdeckt gestapelt; Text wird
abgeschnitten. Auf Desktop ist der Abschnitt unauffällig.

Schlechteste Abschnitte (`.scratch/choc-visual-2026-11-12/result.json`,
`abschnitte`):

| Seite | y | Differenz |
|---|---|---|
| `/` Mobil | 8775 | 26,585 % |
| `/` Mobil | 3375 | 24,722 % |
| `/` Mobil | 4050 | 23,569 % |
| `/` Tablet | 7371 | 23,153 % |
| `/` Tablet | 3276 | 22,354 % |

Alle Appear-Elemente in diesen Abschnitten sind sichtbar (`sichtbar` =
`appearImBild`), der Fade ist also **nicht** die Ursache.

## Ursache (vermutet, zu belegen)

Transform-/Positionierungs-Verlust der absolut positionierten Stapel-Karten
beim Import: Framer platziert den Stapel zur Laufzeit (Varianten/Transforms),
der statische Capture liest nur die Basisstile. Bisher nur aus den Bildpaaren
erschlossen, nicht knotengenau gemessen.

## Belege

- Bildpaare `.scratch/choc-visual-2026-11-12/start/tablet/{build,original}-abschnitt-9.png`
  und `start/mobil/{build,original}-abschnitt-13.png`.
- Messwerkzeug `.scratch/choc-tablet-probe.mts` (misst Box, Deckkraft,
  Sichtbarkeit und Verstecker je Element im Abschnitt, Original gegen Build;
  Ausgabe auf stdout, Aufruf: `node .scratch/choc-tablet-probe.mts <buildDir> <y> <breite>`).

## Scheiben

1. **Messung (ready-for-agent):** An den Karten des Stapels auf 768 und 390 px
   computed `transform`, `position`, `top/left`, `z-index`, `opacity` und
   `overflow` Original gegen Build vergleichen (Probe oben, Ausgabe als JSON
   sichern). Erst danach die Ursache festschreiben.
2. **Korrektur:** Je nach Messergebnis Capture/Mapper ergänzen (Transform am
   Knoten mitführen oder Stapel-Geometrie aus der Laufzeit messen). Roter Test
   mit Stapel-Fixture zuerst; Re-Import + visueller Wiederholungslauf.

## Grenzen

- Bis zur Messung ist „Transform-Verlust“ eine Hypothese, kein Befund.
- Bericht `.scratch/chocolate-importtest/bericht.md` (Befund 7) nennt diesen
  Befund als bewusst nicht in diesem Schritt behoben.
## Ergebnis 12.11.2026 (gelöst durch Ticket 05)

Die vermutete Ursache „Transform-Verlust" ist widerlegt. Nach den beiden
Paarungskorrekturen aus [05](05-geraetepaarung.md) und dem Warten auf Lazy-Bilder
im Messskript (`bilderFertig` nach jedem Scrollschritt in `.scratch/choc-visual.mts`)
fallen die genannten Abschnitte deutlich:

| Seite | y | vorher | jetzt |
|---|---|---|---|
| `/` Mobil | 8775 | 26,585 % | 4,82 % |
| `/` Mobil | 3375 | 24,722 % | 2,102 % |
| `/` Mobil | 4050 | 23,569 % | 1,78 % |
| `/` Tablet | 7371 | 23,153 % | 2,028 % |
| `/` Tablet | 3276 | 22,354 % | 1,002 % |

Beleg: `.scratch/framer-live-2026-11-09/choc-visual-2026-11-12d/result.json`.
Ein Teil der früheren Werte war ein Messartefakt. Das Halftone-Bild ist im Build
`loading="lazy"` und ohne `srcset` (volles 1600 × 1738-JPG) und wurde 350 ms nach
dem Scrollen noch nicht gezeigt.

Status: gelöst. Neues Thema statt dieses Tickets: fehlendes `srcset` für
importierte Bilder (Ladezeit, nicht Darstellung). Noch nicht als eigenes Ticket angelegt.