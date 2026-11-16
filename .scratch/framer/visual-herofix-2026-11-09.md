# Visueller Lauf nach der allgemeinen Varianten-Ergänzung

Datum: 09.11.2026
Zweck: Darstellung nach `restoreIdLessDeviceVariants` messen. Kein Paritätsnachweis.
Rohdaten: `.scratch/framer-live-2026-11-09/visual-herofix3-2026-11-09/result.json`

## Aufbau

- Build: `.scratch/framer-live-2026-11-09/structure-herofix2-2026-11-09/chocolate/before`
- Quelle: `https://chocolate-attributes-385353.framer.app`
- Breiten: 1440 × 900, 768 × 1024, 390 × 844; Chromium, Scrollposition 0
- Vergleich: `pixelmatch`, Schwelle 0.12, erste Ansicht und ganze Seite
- Hinweis: Die Vorbereitung lief in allen sechs Paaren in die 20-s-Grenze.
  Die Screenshots wurden trotzdem nach `load` genommen; die Höhen passen zur
  Quelle, ein Scroll-Nachweis fehlt aber.

## Ergebnis

| Seite | Breite | Höhe Build/Quelle | Ganzseite | Erster Bildschirm |
|---|---|---|---|---|
| `/` | Desktop | 8966 / 8966 | 0.899 % | 0.251 % |
| `/` | Tablet | 11209 / 11206 | 6.457 % | 5.560 % |
| `/` | Mobil | 12698 / 12790 | 7.222 % | 8.043 % |
| `/about` | Desktop | 5537 / 5537 | 1.229 % | 0.364 % |
| `/about` | Tablet | 7174 / 7205 | 5.228 % | 13.057 % |
| `/about` | Mobil | 7965 / 8032 | 7.208 % | 11.185 % |

## Was der Varianten-Fix gezeigt hat

Die Quelle hat je Breakpoint eigene Hero-Texte: Desktop „Fewer tools.",
Tablet „Hire managers and do work". Das ist keine A/B-Fassung, sondern
eine Gerätevariante. Der Build enthält jetzt beide Fassungen; auf Tablet
sind Überschrift und Absatz sichtbar, die Höhen stimmen mit der Quelle
überein. Die vorherige Annahme einer A/B-Fassung war falsch.

Offen bleibt der Hero-Button „Get started": Er steht als Link im HTML,
hat aber auf Tablet und Mobil keine sichtbare Fläche. Die Quelle zeigt ihn
unter dem Absatz. Der erste Bildschirm bleibt deshalb bei 13.057/11.185 %.
Der Fall liegt als Issue 04.

## Grenzen

- Nur Scrollposition 0, kein Hover, keine Bewegung, keine echte Editoränderung.
- Die Vorbereitung (Fonts, Bilder, Scrollen) lief in die Zeitgrenze.
- Pixelabweichung ist kein semantischer Vergleich.
- Der Build ist `structure`; ein Original-Payload-Lauf ist nicht Teil dieses Belegs.
