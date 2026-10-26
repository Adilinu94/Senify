# Stand nach der Animations-Runde — 26.10.2026

> **Dokumenttyp:** Arbeitsstand mit Messungen. Kein Versprechen, kein Plan.
> Alle Zahlen sind an der lokalen Payload-Vorschau (Port 4174) als Quelle und
> am gebackenen Struktur-Baum (Port 4188) gemessen.

## Was jetzt anders ist

### Die Animationen

| | vorher | nachher |
|---|---|---|
| Animations-Samples im IR | 1 (nur der IO-Hinweis) | **113** |
| davon mit Zielknoten | 0 | **112** |
| `@keyframes` mit gemessener `linear()`-Kurve | 0 | **67** |
| Wort-Einblendungen mit eigener Klasse | 0 | **90** |
| `linear()`-Kurven in `animation`-Deklarationen | 0 | **67** |

Der Hero bei 1200 ms: **5,62 % → 0,01 %** Unterschied. Die Wörter laufen
gestaffelt (50 ms Takt), gemessen 300 ms nach dem Laden:

| Wort | Animation | Opacity |
|---|---|---|
| Run | `senify-appear-derived-1-default` | 0.85 |
| Your | `senify-appear-derived-2-default` | 0.77 |
| Money | `senify-appear-derived-3-default` | 0.67 |
| From | `senify-appear-derived-4-default` | 0.52 |

### Die Icons und die Farben

| | vorher | nachher |
|---|---|---|
| Icon-Glyphe | `rgb(0,0,0)` | `rgb(255,255,255)` |
| `--21h8s6` | leer | `#fff` |
| „One Panel" | `rgb(20,20,20)` | `rgb(0,102,255)` |
| `:root`-Definitionen im CSS | 0 | 34 |

Ursache war eine einzige: die Seite benutzt 1379-mal `var(--token-…)`, aber im
gebackenen CSS stand keine einzige Definition. Jeder `var()` fiel auf den Wert
im Fallback zurück — und der ist bei Framer der Stand vom letzten Speichern.

### Der Page Loader

Der gebackene Baum zeigte nur einen weissen Splash (8 KB Screenshot bei
1440×900). Framer blendet den Loader **aus**; der Import las seinen
Startzustand als Einblendung und spielte sie rückwärts — `opacity:0 → 1`, und
der Loader (fixed, 1440×900, z-index 10) legte sich über die Seite.

Jetzt: Screenshot 141 KB, die Seite ist sichtbar.

### Die Geräte-Varianten

Framer baut **eine** Breite pro Ladevorgang. Der Capture bei 1440 px sah die
Telefon-Abschnitte nie und hielt sie für „nur Desktop". Der Import lädt die
Seite jetzt ein zweites Mal bei 390 px und übernimmt daraus die Varianten.

Desktop-Höhen, alle 15 Sections:

| | Quelle | Baum |
|---|---|---|
| hero | 1132 | 1132 |
| products | 349 | 349 |
| statement | 637 | 637 |
| features | 883 | 883 |
| Suite | 1544 | 1544 |
| ai | 816 | 816 |
| automations | 752 | 752 |
| payouts | 752 | 752 |
| tour | 3622 | 3622 |
| workspace | 1900 | 1900 |
| cards | 1076 | 1076 |
| testimonials | 978 | 978 |
| blog | 813 | 813 |
| faq | 918 | 918 |
| contact | 835 | 835 |
| **gesamt** | **17508** | **17508** |

## Die Messung

Median aus je drei Aufnahmen, weil die Quelle einen Endlos-Ticker hat:

| Breite | Diff | Höhen |
|---|---|---|
| 1440 px | **7,93 %** (7,93 / 7,92 / 7,95) | 17508 / 17508 |
| 900 px | 9,70 % | 20162 / 18945 |
| 390 px | 12,14 % | 20648 / 19464 |

Der 1440er Wert war vor dieser Runde 10,29 %. Die 900er Höhe fehlt um 1217 px,
die 390er um 1184 px (vorher 2680).

## Was offen ist

1. **Die Framer-Varianten pro Breakpoint.** Framer setzt bei manchen Elementen
   nicht nur andere Werte, sondern eine andere VARIANTE: die Produktkarte trägt
   auf dem Desktop `framer-v-kmiuhn` (`padding: 48px`, `gap: 14px`), auf dem
   Telefon `framer-v-1f9jezn` (`padding: 30px`, `gap: 10px`). Der Import kennt
   nur eine davon. Seine Werte stimmen deshalb auf dem Desktop exakt und auf
   dem Telefon gar nicht — gemessen: die Produktkarten sind 347 statt 233 px
   hoch, die Section 713 statt 522. Das braucht beide Varianten im Baum plus
   den Auslöser; es ist ein eigener Arbeitsblock, kein Einzeiler.

2. **Die Navigation** tauscht beim ersten Scrollen ebenfalls ihre VARIANTE:
   `framer-v-1is6x80` („Desktop", 778 px) → `framer-v-1vbcxfg`
   („Desktop Compact", 292 px). Gemessen: der Capture sieht danach nur noch die
   Compact-Variante (`n5`, `variantClasses: ["framer-v-1vbcxfg"]`), rendert sie
   aber mit der Breite der Ausgangsvariante.

3. **Die Karten-Neigung** im Cards-Abschnitt: die Quelle dreht die Karten
   unterschiedlich, der Baum weniger.

## Belege

- 442 Tests in `packages/framer-import`, 1010 in framer-import + renderer +
  widget-engine, `pnpm typecheck`, `pnpm lint`.
- Neue Testdateien: `appear-measured.test.ts` (4), `appear-inline-words.test.ts`
  (3), `appear-loader.test.ts` (3), `device-variants.test.ts` (4),
  `capture-browser-motion.test.ts` (+1), `inline-html.test.ts` (+1),
  `style-rules-css.test.ts` (+1), `svg-markup.test.ts` (+4).
- CI grün für `7a5b838`, `539b533`, `e82f4f9`, `f1cd66e`.
- Die Recherche mit allen Messwerten und den sieben Fehlschlägen:
  `docs/research/framer-animationen-abgreifen.md`.
