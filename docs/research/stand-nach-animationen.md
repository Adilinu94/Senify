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

Framer löst eine Variante **pro Breite** auf. Das ist mehr als ein anderer
Wert: die Produktkarte trägt bei 1440 px `framer-v-kmiuhn` (`padding: 48px`,
`gap: 14px`) und bei 390 px `framer-v-1f9jezn` (`padding: 30px`, `gap: 10px`).
Ein Ladevorgang kann deshalb nie eine zweite Breite beschreiben — die Variante
ist aufgelöst, bevor die Werte gelesen werden.

Der Import lädt die Seite jetzt dreimal (1440 / 900 / 390 px) und gibt jedem
Aufbau seinen Gerätezustand. Drei Details waren nötig, jedes gemessen:

1. **Der Zustand, den der Aufbau an SEINER Breite rendert** — nicht sein
   Basis-Zustand. Beide Aufbauten tragen `88px` als Basis (der Desktop-Wert
   dieses Aufbaus) und `42px` im eigenen Mobile-Zustand. Die Basis zu nehmen
   ließ das Telefon 88 px rendern: Hero 1171 → 2158 px, Seite 20648 → 23996.
2. **Die Signatur enthält die HTML-id.** Ohne sie konnte ein Abschnitt, den
   der andere Aufbau nicht enthält, mit seinem Nachbarn gepaart werden und
   dessen Werte übernehmen.
3. **Die stehengebliebenen `hidden`-Hashes werden gelöscht.** Der
   Desktop-State nannte den Telefon-Hash aus einem Aufbau, der das Element nie
   gerendert hat; der Mapper las das als „auf dem Telefon versteckt" — die
   Workspace-Karte verschwand, der Abschnitt fiel von 919 auf 176 px.

Dazu ein zweiter Fehler: wo nur der Tablet-Bereich einen Wert setzt, schrieb
der Mapper `unset` als Telefon-Wert. Senifys Tablet-Regeln sind `max-width`
und erfassen das Telefon mit, Framer's Tablet-Query endet darüber. `unset`
nimmt den Tablet-Wert zurück und lässt erben — bei der Hero-Überschrift
(88 / 64 / 42 px aus einer Preset-Klasse) fiel sie damit auf den Body-Wert
(16 px). Jetzt steht dort der Desktop-Wert.

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

Höhen bei den anderen beiden Breiten:

| Breite | Quelle | Baum | Rest |
|---|---|---|---|
| 1440 px | 17508 | 17508 | 0 px |
| 900 px | 20162 | 20224 | 62 px |
| 390 px | 20648 | 20648 | 0 px |

## Die Messung

Median aus je drei Aufnahmen, weil die Quelle einen Endlos-Ticker hat:

| Breite | Diff | Höhen |
|---|---|---|
| 1440 px | **7,76 %** (7,76 / 7,76 / 7,76) | 17508 / 17508 |
| 900 px | **8,22 %** (8,22 / 8,22 / 8,22) | 20162 / 20224 |
| 390 px | **7,75 %** (7,75 / 7,75 / 7,75) | 20648 / 20648 |

Der 1440er Wert war vor dieser Runde 7,93 %, der 900er 9,70 %, der 390er
13,79 %. Die 900er Höhe fehlt um 62 px, die 390er um 0.

Die Streuung ist echt: in späteren Läufen standen für 1440 px auch 7,89 und
10,69 %. Die 10,69 entstehen, wenn der Endlos-Ticker der Quelle im
Screenshot-Moment eine andere Phase hat — nicht durch den Baum. Deshalb steht
hier der Median aus drei Aufnahmen und keine Punktzahl.

## Was offen ist

1. **Die Scroll-Bewegung ist nicht übernommen.** Die Quelle bewegt Inhalt mit
   der Scrollposition; das ist gemessen, aber (noch) nicht nachgebaut.

   Beispiel Workspace-Abschnitt: das Panel (`framer-16wav6c`, 1040×640) springt
   bei Scroll 10.836 von `translateX(640px)` auf 0 und schwingt in rund 2,8 s
   aus (640 → 73 → 10 → 1,5 → 0,2 → 0). Das ist eine **ausgelöste Feder**, keine
   scroll-gekoppelte Bewegung: derselbe Scrollstand ergibt nach dem Einschwingen
   immer denselben Wert.

   Echt scroll-gekoppelt sind die Karten-Drehungen (viele Zwischenwerte über
   den Scrollweg).

   Ein Versuch, beides automatisch zu übernehmen, ist **zurückgenommen**:
   der Sensor erkannte das schmale Umschaltfenster (4 px) nicht zuverlässig
   (in drei von vier Läufen fehlte das Panel), und die Laufzeit stieg auf
   151–244 s pro Import. Ohne verlässliche Messung ist ein Nachbau Glücksspiel.

2. **Die Navigation** tauscht beim ersten Scrollen ihre Variante:
   `framer-v-1is6x80` („Desktop", 778 px) → `framer-v-1vbcxfg`
   („Desktop Compact", 292 px). Das ist ein Auslöser (Scroll), kein Breakpoint —
   der Geräte-Merge hilft hier nicht.

3. **Die Karten-Neigung** im Cards-Abschnitt: die Quelle dreht die Karten
   unterschiedlich, der Baum weniger.

4. **Die 62 px bei 900 px** sitzen im Footer: dort rendert der Baum 16 px
   Grundschrift, die Quelle 12 px (gemessen an `footer` und der Produktspalte).
   Alle 15 Sections sind auf jeder Breite exakt.

## Was diese Runde gebracht hat

- **Jede Breite lädt die Seite selbst** (1440 / 900 / 390): Framer löst pro
  Breite eine andere *Variante* auf, nicht nur andere Werte. Die Produktkarte
  trägt `framer-v-kmiuhn` (`padding: 48px`) bzw. `framer-v-1f9jezn` (`30px`).
  Wirkung: 390 px 13,79 % → 7,75 %, 900 px 9,70 % → 8,22 %.
- **Die Gerätezustände stimmen jetzt**: 2749 Knoten mit Tablet-, 2611 mit
  Telefonwerten; die Hero-Überschrift 88 / 64 / 42 px statt 88 überall.
- **`animation-timeline: view()` / `scroll()`** sind im Wert-Grammatik erlaubt
  (vorher `invalid-value`). Damit ist der Weg für Scroll-Effekte offen — die
  Messung dafür fehlt noch.

## Belege

- 443 Tests in `packages/framer-import`, 1029 in framer-import + renderer +
  widget-engine, `pnpm typecheck`, `pnpm lint`.
- Neue Testdateien: `appear-measured.test.ts` (4), `appear-inline-words.test.ts`
  (3), `appear-loader.test.ts` (3), `device-variants.test.ts` (4),
  `device-steps.test.ts` (4), `scroll-timeline.test.ts` (3),
  `capture-browser-motion.test.ts` (+1), `inline-html.test.ts` (+1),
  `style-rules-css.test.ts` (+1), `svg-markup.test.ts` (+4).
- CI grün für `7a5b838`, `539b533`, `e82f4f9`, `f1cd66e`, `dcf3de4`, `90ffa4d`.
- Die Recherche mit allen Messwerten und den sieben Fehlschlägen:
  `docs/research/framer-animationen-abgreifen.md`.
- Der zurückgenommene Scroll-Versuch mit allen Messwerten steht im Verlauf
  dieses Dokuments (Abschnitt „Was offen ist", Punkt 1).
