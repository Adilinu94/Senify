# Senify — Designsystem

Fassung vom 22.09.2026. Gilt für alle drei Oberflächen: **Programm-Shell**,
**Editor-Anzug**, **Canvas**.

Umsetzbare Quelle: `senify.css` (dieselbe Datei, aus der auch die Nachweise
rechnen). Dieses Dokument erklärt sie; es führt keine zweite Wahrheit ein.

---

## 0. Wie dieses Dokument zu lesen ist

Jeder Satz hier ist eine von drei Sorten. Sie sind gekennzeichnet, weil der
Unterschied zählt:

| Zeichen | Bedeutung |
|---|---|
| **gemessen** | aus den Referenzbildern ermittelt. Verfahren und Streubreite stehen im Messprotokoll `../farben-referenz-2026-09-22.md`. |
| **gesetzt** | unsere Entscheidung. Sie darf sich ändern, ohne dass die Belege falsch werden. |
| **übernommen** | aus dem Bestand des Projekts (`packages/editor/src/ui/tokens.ts`, `CONTEXT.md`). Gilt weiter, bis jemand sie ausdrücklich ablöst. |

Zahlen ohne Kennzeichnung sind gesetzt und stehen so in `senify.css`.

**Was hier bewusst NICHT steht:** erfundene Werte. Wo eine Größe nicht messbar
war — Schriftgrade lassen sich aus Bildhöhen nicht ablesen —, steht das dabei.

---

## 1. Die Ordnung

### 1.1 Drei Oberflächen, eine Quelle

Heute stehen vier Farbsätze nebeneinander: Plattform/Shell, Editor alte Haut,
Editor neue Haut (116 Tokens), Canvas. Sie sind der Grund, warum dasselbe
Produkt an drei Stellen aussieht wie drei Produkte. Ab hier gibt es **eine**
Leiter, und alle drei Oberflächen holen daraus. **gesetzt**

### 1.2 Höhe entsteht durch Fläche, nicht durch Schatten

Ebenen sind Flächenwechsel plus 1 px Kante. Ein Schatten ist **nur** für
schwebende Platten erlaubt: Menü, Dialog, Toast, Popover. Struktur bekommt
keinen. Gemessen an der Vorlage: kein einziger Verlauf im Anzug, kein Schatten
als Hierarchie. **gemessen**

### 1.3 Ein Akzent, und er hat genau eine Bedeutung

Limette heißt „hier zählt es jetzt": aktueller Stand, Hinweis der Maschine,
Handlung, die als Nächstes dran ist. Sie ist **kein** Zustand und **keine**
Kennzeichnung von Auswahl, Fokus, Reiter oder Rahmen. Gemessen an der Vorlage
über zwölf Vorkommen, alle nach dieser Regel. **gemessen**

### 1.4 Die zweite Fläche ist keine Farbe, sondern die Tinte

`--ui-surface-emphasis` ist im hellen Modus fast schwarz und trägt
hervorgehobene Karten, Hauptknöpfe, die aktive Zeile. Im dunklen Modus wird sie
fast weiß. Kein Buntton als zweite Ebene. **gemessen** (frappe invertiert seinen
Publish-Knopf genauso)

### 1.5 Ein Grundzustand, ein Umschalter

Hell ist der Grundzustand: grauer Grund, weiße Flächen, fast schwarze Tinte.
Dunkel ist dieselbe Leiter invertiert — nicht ein zweiter Satz. **gemessen**
(frappe und Vvveb liegen beide als hell/dunkel-Paar vor; die Struktur ist Pixel
für Pixel dieselbe)

---

## 2. Farbe

### 2.1 Rohwerte

Zwei Leitern und vier Bedeutungen. Mehr Bunttöne gibt es nicht.

**Helle Leiter** — unbunt (R = G = B) bis auf einen Stich ins Blauviolette bei
den Tints. **gemessen**

| Token | Wert | Rolle |
|---|---|---|
| `--ui-neutral-000` | `#ffffff` | Karte, Panel, Blatt |
| `--ui-neutral-050` | `#f4f4f8` | eingelassen 1: Feld-Innenraum |
| `--ui-neutral-100` | `#eeedf4` | eingelassen 2: Spur, Chip, Tabellenkopf |
| `--ui-neutral-150` | `#e3e2ec` | Haarlineal auf Weiß |
| `--ui-neutral-200` | `#e2e2e2` | Grund hinter den Karten |
| `--ui-neutral-250` | `#d9d9df` | Trenner |
| `--ui-neutral-300` | `#ceced1` | Trenner, kräftig |
| `--ui-neutral-400` | `#94939b` | Geist: nur Nicht-Text |
| `--ui-neutral-450` | `#75747f` | Meta; zugleich die tragende Kante |
| `--ui-neutral-500` | `#6a6973` | weich |
| `--ui-neutral-600` | `#55545f` | gedämpft |
| `--ui-neutral-700` | `#2e2e33` | Tinte, zweiter Rang |
| `--ui-neutral-900` | `#111116` | Tinte; zugleich die zweite Fläche |

**Dunkle Leiter** — dieselbe Rampe, invertiert. Der tiefste Ton ist `#0a0a0d`,
nicht `#000000`: sonst franst die Kante an den Radien. **gesetzt**

`--ui-dark-000` `#0a0a0d` · `050` `#0d0d10` · `100` `#111116` · `150` `#15151a` ·
`200` `#1a1a1f` · `250` `#1f1f25` · `300` `#2a2a31` · `350` `#35353d` ·
`400` `#45454e` · `450` `#6e6d78` · `500` `#82818c` · `550` `#94939d` ·
`600` `#a9a8b3` · `700` `#dcdce1` · `900` `#f5f5f7`

**Bedeutungen.** Zwei davon sind in beiden Modi gleich (Limette und Amber, samt
ihrer Gegentöne) — sie tragen eine Aussage, nicht einen Grund.

| Token | hell | dunkel |
|---|---|---|
| `--ui-hue-lime` | `#c9f24c` | `#c9f24c` |
| `--ui-hue-on-lime` | `#141805` | `#141805` |
| `--ui-hue-amber` | `#eca122` | `#eca122` |
| `--ui-hue-on-amber` | `#141805` | `#141805` |
| `--ui-hue-amber-surface` | `#fcefd8` | `#33260c` |
| `--ui-hue-amber-ink` | `#8a5a05` | `#f0bd5e` |
| `--ui-hue-danger` | `#cf4529` | `#ff7a5c` |
| `--ui-hue-danger-ink` | `#b03c20` | `#ffb3a1` |
| `--ui-hue-danger-surface` | `#fbe7e2` | `#3a1a12` |
| `--ui-hue-success` | `#3f6f1e` | `#b7e35c` |
| `--ui-hue-success-surface` | `#eef7da` | `#22300f` |

### 2.2 Die semantische Schicht

Sechs Familien. Eine Rolle wird **nie neu erfunden**, nur neu gebunden.

| Familie | Rollen | Zweck |
|---|---|---|
| `--ui-surface-*` | canvas, panel, raised, inset, track, emphasis | Flächen. Die einzige Quelle für Höhe |
| `--ui-line-*` | hairline, line, strong, control | Kanten und Trenner |
| `--ui-ink-*` | strong, ink, muted, soft, faint, ghost, on-emphasis, on-accent | Schrift |
| `--ui-signal-*` | accent, select, warning, warning-ink, warning-surface, danger, danger-ink, danger-surface, success, success-surface | Aussagen |
| `--ui-fill-*` | hover, active, select, select-ink, danger | Zustandsflächen |
| `--ui-focus-*` | focus, focus-on-accent, focus-on-emphasis | Fokusring |

**Zuordnung hell** **gemessen**

| Rolle | Wert | Wofür |
|---|---|---|
| `--ui-surface-canvas` | `#e2e2e2` | Grund um Karten, Blätter, Bühne |
| `--ui-surface-panel` | `#ffffff` | Panel, Karte, Seitenleiste, Kopfleiste |
| `--ui-surface-raised` | `#ffffff` | Menü, Dialog, Toast (+ Schatten) |
| `--ui-surface-inset` | `#f4f4f8` | Feld-Innenraum, eingelassene Fläche |
| `--ui-surface-track` | `#eeedf4` | Spur, Chip, Tabellenkopf |
| `--ui-surface-emphasis` | `#111116` | hervorgehobene Karte, Hauptknopf, aktive Zeile |
| `--ui-line-hairline` | `#e3e2ec` | dekorative Trennung, 1,3:1 |
| `--ui-line` | `#d9d9df` | Zeilentrenner in Tabellen und Listen |
| `--ui-line-strong` | `#ceced1` | kräftige Trennung, Führungslinien |
| `--ui-line-control` | `#75747f` | Kante, die eine Grenze tragen muss (≥ 3,15:1) |
| `--ui-ink-strong` | `#111116` | Titel, Überschrift |
| `--ui-ink` | `#2e2e33` | Grundtext |
| `--ui-ink-muted` | `#55545f` | Sekundärtext, Beschriftung |
| `--ui-ink-soft` | `#6a6973` | Nebentext |
| `--ui-ink-faint` | `#75747f` | Meta, Fußnote |
| `--ui-ink-ghost` | `#94939b` | **nur** Symbol, Trenner, inaktives Zeichen |
| `--ui-ink-on-emphasis` | `#ffffff` | Schrift auf der zweiten Fläche |
| `--ui-ink-on-accent` | `#141805` | Schrift auf Limette |
| `--ui-signal-select` | `#111116` | Auswahl = zweite Fläche |
| `--ui-fill-hover` | `rgb(17 17 22 / 5%)` | Zeiger über einer Zeile |
| `--ui-fill-active` | `rgb(17 17 22 / 8%)` | gedrückt |
| `--ui-focus` | `#111116` | Fokusring |

### 2.3 Die Regeln, die die Farbe tragen

1. **Limette ist Fläche, nie Marke.** Auf Weiß hat sie 1,3:1 und ist damit
   unsichtbar. Sie funktioniert als gefüllte Fläche mit `--ui-ink-on-accent`
   (14,0:1) oder auf der zweiten Fläche (14,6:1). Nie als Unterstreichung, Ring,
   Punkt oder 1-px-Kante auf hellem Grund. **gemessen**
2. **Der Fokusring ist die Tinte, nicht der Akzent.** Limette ist eine Aussage,
   kein Zustand. Die Tinte hat den höchsten erreichbaren Kontrast in beiden
   Modi (18,8:1). **gesetzt**
3. **Auswahl füllt mit der zweiten Fläche**, nicht mit einem Farbstich. Das
   Vorbild macht es so; der Stich-Versuch (frappes hellblau) braucht zusätzlich
   eine Kante, um zu wirken. **gemessen**
4. **Amber und Rot sind Status, nie Fläche.** Amber ist immer klein (Chip,
   Punkt). Rot kommt pro Bildschirm einmal vor. **gemessen**
5. **Hinweis und Alarm haben je zwei Stufen**: eine Füllung (`warning`,
   `danger`) und eine eigene Schrift auf der getönten Fläche
   (`warning-ink`, `danger-ink`). Eine Stufe kann nicht beides: sie müsste
   sonst gleichzeitig weiße Schrift tragen und auf Weiß lesbar sein.
   **gesetzt**
6. **Pale Tinte nie auf getönter Füllung.** Die helle Leiter hat nach unten nur
   bis Weiß Platz: auf `panel` tragen fünf Stufen, auf `inset` und `track` vier,
   auf `canvas` drei. Das ist der Grund, warum in der Vorlage fast aller Text
   auf weißen Karten liegt und die Chips dunkle Schrift haben. **gemessen**

### 2.4 Kontrast, nachgerechnet

`node ../pruef-kontrast.mjs` liest `senify.css`, löst die `var()`-Ketten auf und
rechnet jedes geforderte Paar in **beiden** Modi. Rückgabe 0 heißt: alles
erfüllt. Der Lauf ist Teil der Abnahme, nicht eine Empfehlung.

Auszug (hell → dunkel):

| Paar | hell | dunkel | Grenze |
|---|---|---|---|
| `ink-strong` auf `panel` | 18,8:1 | 15,9:1 | 4,5 |
| `ink-muted` auf `panel` | 7,5:1 | 7,4:1 | 4,5 |
| `ink-faint` auf `panel` | 4,6:1 | 4,5:1 | 4,5 |
| `ink-on-accent` auf `accent` | 14,0:1 | 14,0:1 | 4,5 |
| `warning-ink` auf `warning-surface` | 5,2:1 | 8,5:1 | 4,5 |
| `danger-ink` auf `danger-surface` | 5,0:1 | 9,1:1 | 4,5 |
| `line-control` auf `canvas` | 3,6:1 | 3,8:1 | 3,0 |
| `focus` auf `panel` | 18,8:1 | 15,9:1 | 3,0 |

**Vollständigkeit** ist der zweite Teil des Nachweises: das Skript meldet jede
Rolle, die in beiden Modi denselben Wert behält. Es sind genau vier — Limette,
ihr Gegenton, Amber und der Fokus auf Limette. Jede fünfte Zeile dort hieße:
diese Rolle wurde im dunklen Modus vergessen.

### 2.5 Die drei Abweichungen vom Vorbild

| Stelle | Vorbild | Wir | Grund |
|---|---|---|---|
| Meta-Tinte | `#8a8996` (3,44:1) | `#75747f` (4,60:1) | Das Vorbild setzt seine Meta-Stufe als 13–14 px und verfehlt damit AA. Unser Originalwert bleibt als `--ui-ink-ghost` erhalten, für Nicht-Text. |
| Alarm | `#e1543a` | `#cf4529` | Weiß darauf erreicht nur 3,80:1. `#cf4529` erreicht 4,63:1 und bleibt als Text auf hellem Grund lesbar. |
| Kante | keine | `--ui-line-control` | Das Vorbild umrandet keine Felder, es füllt sie (`#f4f4f8` auf `#ffffff` sind 1,07:1). Für dichte Inspektoren bleibt Füllen der Normalfall. Wo die Füllung die Grenze nicht erkennbar macht — Zelle im Raster, Feld im Feld — trägt diese Kante sie mit ≥ 3,15:1. |

Ein vierter, hier ausgeschriebener Punkt: **eine vollständig umrandete Maske
wirkt schwer.** Eine AA-feste Kante ist zwangsläufig so dunkel wie die blasseste
Schrift. Umranden ist deshalb die Ausnahme, nicht der Grundsatz. **gemessen**

---

## 3. Form

### 3.1 Abstand: 4-px-Takt

`0 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`

Kein Zwischenwert. Wo 4 px zu eng und 8 px zu weit wirken, ist die Anordnung
falsch, nicht das Maß. **übernommen** (die Theme-Skalen des Projekts folgen
demselben Takt)

### 3.2 Radius

Der Befund hat zwei Teile. **gemessen**

**Teil 1 — Klickziele sind runde Kanten.** Alles, was man trifft, hat
`--ui-radius-pill`. Unabhängig bestätigt an fünf Formen: Suchfeld (45 px hoch),
⌘K-Chip (39), Hinweis-Chip (39), dunkle Pille (48), Handlungs-Chip (38).
Dazu die aktive Navigationszeile (57 hoch, gemessener Radius 27).

**Teil 2 — Behälter tragen feste Radien.** Gemessen 33 und 34,5 bei Karten,
45 bis 47 bei großen Flächen und der App-Schale.

**Teil 3 — Spuren und Balken** liegen bei 12 bis 14.

Daraus die Skala:

| Token | Wert | Wofür |
|---|---|---|
| `--ui-radius-0` | `0` | Raster, Bühne, Blatt |
| `--ui-radius-xs` | `4px` | Werkzeug: Zeile, Reiter, Symbolknopf |
| `--ui-radius-sm` | `8px` | Werkzeug: Feld, Menü |
| `--ui-radius-md` | `12px` | Fortschrittsspur, Balken, kleine Platte |
| `--ui-radius-lg` | `16px` | kleine Karte, eingelassene Gruppe |
| `--ui-radius-xl` | `24px` | schwebende Platte |
| `--ui-radius-2xl` | `32px` | Karte — gemessen 33 bis 34,5 |
| `--ui-radius-3xl` | `48px` | Schale, große Fläche — gemessen 45 bis 47 |
| `--ui-radius-pill` | `9999px` | **jedes** Klickziel |

> **Offene Entscheidung.** Der Bestand sagt: *„Radius 0 ist die Regel (hartes
> Raster der Designsprache)"* — die neue Haut baut auf harten Ecken mit 4 px
> Körnung. Die Vorlage sagt das Gegenteil: alles ist gerundet, Klickziele sind
> Pillen, Karten 32, die Schale 48. Das ist die eine Stelle, an der sich
> „Werkzeug" und „Produkt" nicht auf einen Nenner bringen lassen, ohne dass
> eines von beiden nachgibt. Vorgabe hier: **das Werkzeug bleibt eckig
> (`0`/`4`/`8`), das Produkt wird rund (`32`/`48`/Pille).** Wenn das ganze
> Produkt die runde Sprache sprechen soll, ist das eine eigene Entscheidung —
> sie ändert jede Fläche im Editor. **gesetzt**

### 3.3 Höhen

Zwei Profile, ein Begriff. **gemessen** für das Produktprofil (Werte in
Klammern), **übernommen** für das Werkzeugprofil.

| Token | Wert | Werkzeug | Produkt |
|---|---|---|---|
| `--ui-h-24` | `24px` | Trefferfläche | — |
| `--ui-h-row` | `28px` | Zeile, Feld, kleiner Knopf | — |
| `--ui-h-32` | `32px` | Knopf, Menüzeile, Eigenschaftszeile | — |
| `--ui-h-36` | `36px` | Reiterreihe, Panelkopf | — |
| `--ui-h-chip` | `38px` | — | Chip (38) |
| `--ui-h-40` | `40px` | Werkzeugleiste, großer Knopf | — |
| `--ui-h-control` | `44px` | — | Feld, kleiner Knopf (44/45) |
| `--ui-h-48` | `48px` | Kopfleiste | Knopf (48) |
| `--ui-h-row-nav` | `56px` | — | Navigationszeile (57) |
| `--ui-h-60` | `60px` | — | Handlungsknopf (60) |
| `--ui-h-72` | `72px` | — | Hauptknopf (72) |

Dass es zwei Profile braucht, ist keine Beliebigkeit: ein Inspektor mit
72-px-Zeilen zeigt vier Eigenschaften statt zehn. **gesetzt**

### 3.4 Breiten

| Token | Wert | Herkunft |
|---|---|---|
| `--ui-w-nav` | `360px` | **gemessen** — auf beiden Bildern dieselbe |
| `--ui-w-explorer` | `264px` | übernommen |
| `--ui-w-inspector` | `320px` | übernommen |
| `--ui-w-spotlight` | `640px` | übernommen |
| `--ui-w-dialog` | `560px` | übernommen |
| `--ui-w-menu-min` / `-max` | `200 / 320px` | übernommen |
| `--ui-w-toast-max` | `360px` | übernommen |

### 3.5 Bühnenhilfen

Die Hilfen des Canvas sind Hilfen: keine trägt eine Aussage allein, deshalb
unterliegen sie nicht der 3:1-Anforderung aus WCAG 1.4.11. Die Einrastlinie ist
die Ausnahme — sie ist der Akzent, weil „das rastet jetzt ein“ ein Stand ist.
**gesetzt**

| Token | hell | dunkel |
|---|---|---|
| `--ui-grid-step` | `4px` | `4px` |
| `--ui-grid-help` | `rgb(17 17 22 / 8%)` | `rgb(255 255 255 / 10%)` |
| `--ui-marquee` | `rgb(17 17 22 / 8%)` | `rgb(255 255 255 / 10%)` |
| `--ui-snap-line` | Limette | Limette |
| `--ui-selection-edge` | `rgb(17 17 22 / 60%)` | `rgb(255 255 255 / 70%)` |
| `--ui-selection-inner` | `rgb(255 255 255 / 90%)` | `rgb(10 10 13 / 85%)` |
| `--ui-band-margin` | `rgb(207 69 41 / 12%)` | `rgb(255 122 92 / 14%)` |
| `--ui-band-padding` | `rgb(63 111 30 / 12%)` | `rgb(183 227 92 / 14%)` |

### 3.6 Die native Ebene

Drei Dinge malt der Browser selbst: die geöffnete Liste eines Auswahlfelds, den
Rand, den er einem `select` gibt, und die Systemfarbe seiner Fläche. Alle drei
lagen außerhalb der Leiter und fielen im dunklen Modus auf. **gemessen**

| Stelle | vorher | jetzt | Grund |
|---|---|---|---|
| `select`, Fläche | Systemfarbe `#ffffff` | `--ui-surface-inset` | Chromium malt `ButtonFace` auch ohne `appearance`. Im dunklen Modus stand `--ui-ink` `#dcdce1` auf weißem Feld: **1,37:1** — auf allen elf Auswahlfeldern des Inspektors. |
| `select`, Rand | 1 px Systemrand | `0` | Die Grenze trägt die Hülle (`.field`, `.p-input`). Der zweite Rand daneben war der „weiße Select neben grau gefülltem Zahlenfeld“. |
| `select`, Liste | hell, unabhängig vom Modus | folgt `color-scheme` | siehe unten |
| `input`, `textarea` | erbt die Systemfläche | `--ui-surface-inset` | dieselbe Ursache; die Hülle stellt ihr Kind auf `transparent` |

**Die Ansage, nicht der Wert.** `color-scheme` ist kein Farbwert, sondern die
Aussage, in welcher Leiter der Browser seine eigene Ebene malt — Liste,
Scrollbalken, Caret. Die Kette hat drei Stufen, jede mit Absicht:

```
:root               color-scheme: light   Grundzustand
[data-mode="dark"]  color-scheme: dark    Werkzeug im dunklen Modus
.site               color-scheme: light   ein Dokument ist hell, auch bei Nacht
```

**Das Dokument erbt nie.** Die Bühne ist Wahrheit: was dort steht, ist das
Ergebnis. Eine Basisschicht greift aber direkt am Element — `h1, h2, h3 …
{ color: var(--ui-ink-strong) }` schlägt jede Vererbung von der Dokumentwurzel.
Gemessen im dunklen Modus: `h1.site__h1` kam als `#f5f5f7` auf `#ffffff` an,
**1,09:1**, dazu `h2`, `h3` und das Blockzitat. Deshalb bindet die
Dokumentwurzel die acht Tintenrollen um, statt jede Überschrift einzeln zu
korrigieren. Jede Werkzeugregel, die in das Dokument greift, findet dort die
Werte des Dokuments vor.

Nebenbefund aus demselben Lauf, hell wie dunkel: die Bildunterschrift der
Demo-Seite trug `#94939b` auf der Füllung `#f4f4f8` — **2,77:1**. Sie ist Text,
kein Nicht-Text, und steht jetzt auf `--ui-ink-soft` (**4,93:1** auf `inset`,
5,41:1 auf Weiß). Das ist die eigene Regel, angewandt: pale Tinte trägt auf
getönter Füllung keine Stufe so tief wie auf Weiß.

Der Nachweis läuft über zwölf Szenarien (sechs Ansichten × beide Modi) und
rechnet jede Textstelle des Dokuments gegen ihre wirksame Fläche sowie jedes
Auswahlfeld gegen seine eigene. Nicht aufnehmbar ist die aufklappende Liste
selbst — gemessen wird die Ansage des Feldes, an der die native Ebene hängt.

---

## 4. Schrift

Die Familien und die Werkzeuggrade sind **übernommen**; die Staffel für den
Produktbereich ist **gesetzt** — Schriftgrade lassen sich aus Bildhöhen nicht
ablesen, und wer sie schätzt, baut auf Sand.

**Familien**

```
--ui-font-display   "Inter Display", "Inter", system-ui, sans-serif
--ui-font-body      "Inter", system-ui, sans-serif
--ui-font-mono      "JetBrains Mono", ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace
```

**Grade**

| Bereich | Grade | Zeilenhöhe |
|---|---|---|
| Werkzeug | `10 · 11 · 12 · 13 · 15 · 17` | fest in px (14/15/16/18/20/22) |
| Produkt | `13 · 15 · 17 · 20 · 24 · 30 · 34` | `1,15` / `1,3` / `1,45` / `1,6` |

Der Editor ist ein Werkzeug: seine eigenen Beschriftungen dürfen **nicht** mit
der Fensterbreite fließen. Feste px-Werte. Die Fließskala gilt für den Inhalt
im Canvas, nicht für den Anzug. **übernommen**

**Gewichte** `400` / `500` / `600`. Kein `700`: im Werkzeug ist fette Schrift
kein Ausdrucksmittel, sondern Lärm. **gesetzt**

**Laufweite** `--ui-track-micro: 0.06em` für Aufschriften in Versalien (nur
Bereichs-Labels, keine Sätze), `--ui-track-display: -0.01em` für Titel.
**gemessen** (das Vorbild setzt „PERMITTING" und „WORKSPACE" in gesperrten
Versalien; die Titel laufen eng)

**Zahlen** in Tabellen, Kennzahlen und Maßfeldern stehen in Tabulatorziffern
(`font-variant-numeric: tabular-nums`), damit Spalten fluchten. **gemessen**
(die Kennzahlen der Vorlage 128/47/18/7 fluchten über vier Karten hinweg)

---

## 5. Bewegung

**übernommen**

| Token | Wert | Wofür |
|---|---|---|
| `--ui-t-0` | `0ms` | Zustandswechsel ohne Übergang (Farbe im Baum) |
| `--ui-t-1` | `120ms` | Hover, Fokus, Knopf |
| `--ui-t-2` | `160ms` | Menü, Popover, Panel auf/zu |
| `--ui-t-3` | `200ms` | Reiterwechsel, Zeile ein-/ausklappen |
| `--ui-t-4` | `240ms` | Schublade, Dialog |
| `--ui-t-brand` | `1200ms` | Erscheinen der Seite im Canvas, Wechsel Design/Live |

Werkzeugbewegung bleibt **unter 300 ms**. Wer einen Klick mit 1200 ms quittiert,
hat die Rückmeldung verloren. Die lange Dauer gehört dem Inhalt, nicht dem
Werkzeug.

**Kurven**

```
--ui-ease-out       cubic-bezier(0.23, 1, 0.32, 1)      Erscheinen, Hover
--ui-ease-in-out    cubic-bezier(0.77, 0, 0.175, 1)     Wechsel
--ui-ease-drawer    cubic-bezier(0.32, 0.72, 0, 1)      Schublade
--ui-ease-standard  cubic-bezier(0.16, 1, 0.3, 1)       Standard
```

**Bewegung ist eine Aussage, kein Schmuck.** Was sich bewegt, hat sich geändert.
`prefers-reduced-motion: reduce` ersetzt jede Dauer außer `--ui-t-0` durch `0ms`;
Zustände bleiben sichtbar, weil sie über Farbe und Kante laufen, nicht über
Bewegung. **gesetzt**

---

## 6. Höhe und Ebenen

Nur schwebende Platten bekommen einen Schatten. **gemessen**

| Token | Verwendung |
|---|---|
| `--ui-shadow-float` | Menü, Popover, Toast, schwebende Platte |
| `--ui-shadow-dialog` | Dialog |
| `--ui-scrim` | Abdunklung hinter Dialog und Schublade |

Ebenen: `canvas 0 · marker 10 · sticky 20 · dropdown 40 · scrim 50 · dialog 60 ·
toast 70`. Der **Canvas-Rahmen liegt über der Bühne, aber unter jedem Menü** —
ein Kontextmenü am unteren Blattrand darf nicht vom nächsten Blatt verdeckt
werden. **gesetzt**

---

## 7. Bausteine

Jeder Baustein nennt Anatomie, Zustände und Maße. Die Maße kommen aus den
Tokens in Kapitel 3 — hier stehen keine neuen Zahlen.

### 7.1 Knopf

**Anatomie** Fläche · Beschriftung · optionales Symbol links (16 px) ·
optionaler Zähler.

| Art | Fläche | Schrift | Kante |
|---|---|---|---|
| primär | `--ui-surface-emphasis` | `--ui-ink-on-emphasis` | keine |
| sekundär | `--ui-surface-panel` | `--ui-ink` | `--ui-line-control` |
| still | keine | `--ui-ink-muted` | keine |
| gefährlich | `--ui-signal-danger` | weiß | keine |

**Zustände** Ruhe · Hover (`--ui-fill-hover`, bei gefüllten Knöpfen eine Stufe
heller/dunkler) · gedrückt (`--ui-fill-active`) · deaktiviert (Fläche wie Ruhe,
Schrift `--ui-ink-ghost`, `cursor: not-allowed`) · wartend (Symbol dreht,
Beschriftung bleibt, Breite bleibt).

**Maße** Höhe 28/32/40 im Werkzeug, 44/60/72 im Produkt. Radius: Werkzeug 4,
Produkt Pille.

**Regel: pro Bildschirm ein primärer Knopf.** Alles andere ist sekundär oder
still. Zwei gefüllte Knöpfe in derselben Ansicht sind ein Fehler, kein
Gestaltungsspielraum. **gemessen** (Vvveb und frappe halten es beide so, unser
Editor nicht)

### 7.2 Symbolknopf

Quadratisch, 28 px im Werkzeug, Trefferfläche bleibt 24 px. **Ein** Symbol,
kein Text. Braucht `aria-label`. Zustände wie 7.1.

### 7.3 Feld

**Regel: Felder sind gefüllt, nicht umrandet.** `--ui-surface-inset` auf
`--ui-surface-panel`. Nur wo die Füllung die Grenze nicht trägt, kommt
`--ui-line-control` dazu. **gemessen**

**Anatomie** Beschriftung (über dem Feld, `--ui-ink-muted`, 11 px) ·
Feldkörper · Wert · optional Hinweis oder Fehler **unter** dem Feld ·
optional Einheit rechts im Feld.

**Zustände** Ruhe · Fokus (Ring in `--ui-focus`, 2 px, Außenabstand 1 px) ·
gefüllt · fehlerhaft (`--ui-line-control` wird `--ui-signal-danger`,
Hinweistext in `--ui-signal-danger-ink`) · gesperrt (`--ui-ink-ghost`, keine
Fläche).

**Maße** Höhe 28 (Werkzeug) / 44 (Produkt). Radius 8 (Werkzeug) / Pille
(Produkt).

### 7.4 Zeile

Die wichtigste Form im Werkzeug. **Ein** Muster für Baum, Liste, Tabelle,
Menüpunkt.

- Höhe 28 (Werkzeug) / 44–56 (Produkt).
- Trefferfläche über die volle Zeilenbreite, nicht nur über die Schrift.
- Hover `--ui-fill-hover`; **ausgewählt** füllt mit `--ui-surface-emphasis` und
  schaltet die Schrift auf `--ui-ink-on-emphasis`.
- Fokus: Ring **in** der Zeile, damit er an der Kante nicht abgeschnitten wird.
- Zähler rechts in `--ui-ink-ghost`, nicht in Klammern. **gemessen**

### 7.5 Baum-Zeile (Editor)

Zusätzlich zur Zeile: Einzug 16 px je Tiefe, Auf-/Zuklapp-Dreieck links,
Sichtbarkeits- und Sperrsymbol rechts, Klassenabzeichen.

**Regel: die Auswahl ist umrandet, nicht gefüllt, wenn der Baum auf einer
Fläche mit eigenem Kontrast liegt** — sonst verschwimmt die dunkle Füllung mit
der Spur. Auf weißem Panel dagegen füllt sie. **gesetzt**

### 7.6 Eigenschaftszeile (Inspektor)

**Zweispaltig.** Zwei Felder nebeneinander, je Label über dem Wert. Gemessen an
der Vorlage: das verdoppelt die Zahl der Eigenschaften pro Höhe gegenüber
unserer einspaltigen Lösung bei gleicher Panelbreite. **gemessen** (Vvveb)

**Progressive Disclosure ist die Grundordnung, kein Extra.** Offen stehen nur
die häufigsten Eigenschaften: Anzeige, Position, Größe, Typografie, Farben.
Geschlossen darunter: Abstand, Rahmen, Radius, Schatten, Bewegung, Interaktion.
Jeder Abschnitt ist ein Aufklapper mit Zähler, damit man sieht, wie viele
Eigenschaften gesetzt sind.

**Wertetyp ist ablesbar:** Zahl mit Einheit als Feld und Zieher, Farbe als
Farbfeld mit Hex, Auswahl als Menü, Schalter als Schalter, Text als Feld.
**gemessen** (revymes Inspector und sein CMS trennen Striche/Meta als Text von
echten Datenfeldern)

### 7.7 Reiter

Unterkante 2 px in `--ui-ink`, **nicht** in Limette: der Reiter ist ein Zustand.
Inaktiver Reiter in `--ui-ink-muted`, Hover mit `--ui-fill-hover`. Höhe 36.
**gesetzt** (weicht von unserem heutigen Stand ab, wo die Reiterkante Limette
trägt)

### 7.8 Chip und Abzeichen

Pille, Höhe 32–38, Schrift 13, `--ui-ink` auf `--ui-surface-track`.
Statusvarianten: Hinweis auf `--ui-signal-warning-surface` mit
`--ui-signal-warning-ink`, Alarm auf `--ui-signal-danger-surface` mit
`--ui-signal-danger-ink`, Erfolg entsprechend. **Der Akzent-Chip** trägt
`--ui-hue-lime` mit `--ui-ink-on-accent` und ist der einzige, der laut sein
darf — er sagt „hier zählt es jetzt". **gemessen**

### 7.9 Panel und Panelkopf

Panel: `--ui-surface-panel`, Kante `--ui-line-hairline`, Radius 0 im Werkzeug
(24 als schwebende Platte). Kopf 36 px: Beschriftung in Versalien,
`--ui-track-micro`, 11 px, `--ui-ink-muted`; rechts die Werkzeuge des Panels.
**übernommen**

### 7.10 Menü und Kontextmenü

`--ui-surface-raised`, `--ui-radius-sm` (Werkzeug), `--ui-shadow-float`,
`--ui-line-strong` als Kante. Zeile 32, Kürselspalte 56 px rechtsbündig in
`--ui-ink-muted`. Trennlinie `--ui-line-hairline`. Ein gefährlicher Eintrag
steht **allein** am Ende, Schrift `--ui-signal-danger-ink`. **übernommen**

### 7.11 Spotlight (`Ctrl+K`)

Breite 640, oben im Fenster, `--ui-surface-raised`, Radius 24,
`--ui-shadow-dialog`, Abdunklung `--ui-scrim` dahinter. Trefferzeilen tragen
rechts ihr Ziel in `--ui-ink-ghost`. **übernommen**

### 7.12 Dialog

Breite 560, Radius 24, `--ui-shadow-dialog`, `--ui-scrim` dahinter. Kopf,
Inhalt, Fuß; der Fuß trägt die Handlung **rechts**, die stille Handlung links.
Fokus fällt beim Öffnen in den Dialog und kehrt beim Schließen zur auslösenden
Stelle zurück. **übernommen**

### 7.13 Toast

Rechts unten, Breite bis 360, `--ui-surface-raised`, `--ui-shadow-float`.
**Ein Toast informiert, er fragt nicht.** Was eine Antwort braucht, ist ein
Dialog. Erfolg trägt ein Erfolgszeichen, Fehler `--ui-signal-danger-ink`, und
der Fehler **bleibt stehen**, bis er gelesen wurde. **gesetzt**

### 7.14 Leerer Zustand

Drei Teile: was hier erscheint (Satz), warum es leer ist (Satz), was als
Nächstes zu tun ist (**ein** Knopf). Kein Symbol als Platzhalter für einen
fehlenden Satz. Der leere Zustand ist der erste Eindruck des Werkzeugs — er wird
gestaltet, nicht vergessen. **gesetzt**

### 7.15 Canvas-Marker (Editor)

- **Rahmen**: Doppelkante aus einer dunklen Außenlinie `--ui-selection-edge`
  und einer hellen Innenlinie `--ui-selection-inner`. Zwei Linien, weil eine
  allein auf keinem Inhalt gleichzeitig sichtbar ist — und beide drehen im
  dunklen Modus um. **übernommen**
- **Abzeichen** oben links am Rahmen: `tag .klasse`. **gemessen** (frappe zeigt
  „H2 h2-5")
- **Griffe**: 8 px sichtbar, Trefferfläche 24 px. Vier Ecken plus vier Kanten.
- **Plus-Griff** an der Unterkante: „hier danach einfügen". **gemessen**
- **Schwebende Aktionsleiste** am Rahmen: greifen, ↑, ↓, ←, →, Duplizieren,
  Löschen. **gemessen**
- **Abstandsbänder** außen in Rot bei 12 %, innen in Grün bei 12 %.
- **Einrastlinie** in Limette — der Akzent heißt hier „das rastet jetzt ein",
  das ist ein Stand, keine Zierde. **gesetzt**

### 7.16 Statusleiste

Höhe 28, `--ui-surface-canvas`, Schrift 11 in `--ui-font-mono`. Zeigt
**`tag .klasse`**, den Zoomwert, den Pausenstatus und die Zahl der offenen
Aufträge. Der Wert in der Mitte ist der wichtigste: man muss jederzeit wissen,
welche Regel man gerade anfasst. **gemessen** (Vvveb und revyme zeigen beide den
Selektor)

### 7.17 Fortschritt

Spur `--ui-surface-track`, Radius 12, Füllung **in der Bedeutung, nicht im
Akzent**: laufend `--ui-ink`, abgeschlossen `--ui-signal-success`, gescheitert
`--ui-signal-danger`. Limette nur, wenn der Fortschritt die aktuelle Stufe
markiert. **gemessen** (die Vorlage färbt genau die aktive Stufe der Pipeline)

---

## 8. Zustände und Rückmeldung

| Zustand | Kennzeichnung | Verboten |
|---|---|---|
| Hover | `--ui-fill-hover` | Layoutänderung, Größenänderung |
| Fokus | Ring `--ui-focus`, 2 px, 1 px Abstand | Ring abschneiden, Ring in Limette |
| Gedrückt | `--ui-fill-active` | Verschiebung um mehr als 1 px |
| Ausgewählt | Füllung `--ui-surface-emphasis` | zweite Auswahlfarbe |
| Gesperrt | Schrift `--ui-ink-ghost`, `cursor: not-allowed` | gesperrte Dinge verstecken |
| Wartend | Symbol dreht, Breite bleibt | Text durch „…" ersetzen |
| Fehler | `--ui-signal-danger`, Text darunter | nur roter Rahmen ohne Satz |
| Leer | siehe 7.14 | Symbol ohne Satz |

**Jede Rückmeldung braucht einen Satz oder eine Zahl.** „Fehler" ist keine
Rückmeldung. „Der Rahmen ist kein Block" ist eine. **gesetzt**

---

## 9. Tastatur und Zugänglichkeit

- **Trefferfläche mindestens 24 × 24 px** (WCAG 2.5.8). Sichtbare Griffe dürfen
  kleiner sein, ihre Fläche nicht.
- **Fokus sichtbar** an jedem bedienbaren Element, auch am Canvas-Rahmen und an
  den Griffen (WCAG 2.4.11).
- **Kontrast**: Text 4,5:1, Nicht-Text 3:1 — nachgerechnet, nicht geschätzt
  (Kapitel 2.4).
- **Farbe ist nie die einzige Kennzeichnung.** Ein Hinweis trägt Text, ein
  Fehler trägt Text, ein ausgewähltes Element trägt Form oder Symbol.
- **Tastenkürzel sind sichtbar**: in Menüs rechtsbündig in der Kürselspalte, in
  der Spotlight-Suche als Hinweis. Ein Kürzel, das nur in der Dokumentation
  steht, gibt es nicht.
- **Reihenfolge folgt der Bedeutung**, nicht der Zeichenreihenfolge im DOM. Der
  Inspektor wird von oben nach unten bedient, nicht kreuz und quer.

---

## 10. Schreibregeln für die Oberfläche

**gesetzt**

- **Deutsch mit englischen Fachbegriffen.** „Layout" bleibt „Layout", „Release"
  bleibt „Release". Keine halbübersetzten Mischwörter.
- **Satzbruch statt Substantivkette.** „Bild einsetzen" statt
  „Bildeinfügung".
- **Knöpfe benennen die Handlung**, nicht den Zustand: „Veröffentlichen", nicht
  „Veröffentlichung".
- **Keine Ausrufezeichen, keine Verniedlichung, kein „Bitte".** Ein Werkzeug
  bittet nicht.
- **Zahlen mit Einheit**, ohne Leerzeichen vor dem Prozentzeichen: `8 px`,
  `50%`, `1,5 rem`. Das Dezimaltrennzeichen ist das Komma.
- **Versalien nur für Bereichs-Labels** (bis drei Wörter). Nie für Sätze,
  nie für Knöpfe.

---

## 11. Verbote

Die Liste dessen, was den Anzug billig macht. Jeder Punkt ist an der Vorlage
oder am eigenen Werkzeug belegt. **gemessen**

1. **Limette als Zustand.** Nicht als Fokusring, nicht als Reiterkante, nicht
   als Auswahlrahmen, nicht als Plus-Punkt. Vier Verwendungen in unserem
   heutigen Editor, alle falsch.
2. **Mehr als ein lauter Knopf pro Ansicht.**
3. **Zwei Flächen in derselben Farbe im selben Bild.**
4. **Ein Schatten als Hierarchie.** Struktur bekommt Fläche und Kante.
5. **Verläufe.** Nicht im Anzug.
6. **Buntton als zweite Fläche.** Die zweite Fläche ist die Tinte.
7. **Pale Schrift auf getönter Füllung.**
8. **Gesperrte Bedienelemente verstecken.** Sie bleiben sichtbar und erklären.
9. **Symbole ohne Text als einzige Erklärung** eines Bedienelements, das keine
   Konvention hat.
10. **Ein leerer Zustand ohne Satz.**
11. **Nachgebaute Attrappen.** Ein Knopf, der nichts tut, ist ein Fehler, kein
    Platzhalter.

---

## 12. Übernahme

**Im Produkt ist nichts davon umgesetzt** — die laufende Oberfläche unter
`packages/` ist unverändert. Der Prototyp unter `../ui-preview/` setzt alles
vor: er ist Beweisstück, nicht das Produkt. Die Zuordnung der heutigen Namen
steht in `../farben-referenz-2026-09-22.md`, Abschnitt 8.

Reihenfolge für den Zug:

1. **Farbschicht einziehen.** `senify.css` löst die heutigen `--ed-*`-Namen ab.
   Kein Layout ändert sich, nur Farbe. Danach ist der Anzug in beiden Modi
   prüfbar.
2. **Maß und Form nachziehen.** Höhen und Radien auf die Skala, Panelbreiten
   unverändert.
3. **Die drei Fehlverwendungen entfernen:** Limette als Reiterkante, Limette als
   Fokusring, Limette an mehr als einer Stelle pro Ansicht.
4. **Zustände nachziehen:** Hover, Fokus, Auswahl, gesperrt, wartend, leer.
   Vorher gibt es keine Zustandsprobe, die den Namen verdient.
5. **Bausteine 7.4 bis 7.6** (Zeile, Baum-Zeile, Eigenschaftszeile) — das sind
   die drei Formen, die den Editor ausmachen.
6. **Erst danach** die Sollbild-Seite als Beweisstück.

Nach jedem Schritt: `node ../pruef-kontrast.mjs` muss mit 0 zurückkommen.

---

## 13. Nachweise

| Datei | Rolle | Aufruf |
|---|---|---|
| `senify.css` | die eine Quelle | — |
| `../pruef-kontrast.mjs` | rechnet jedes Kontrastpaar in beiden Modi nach, prüft die Vollständigkeit der Leiter | `node ../pruef-kontrast.mjs` |
| `../pruef-dunkelmodus.mjs` | Dokumenttinte der Bühne und native Auswahllisten, sechs Ansichten in beiden Modi | `node ../pruef-dunkelmodus.mjs` |
| `../farb-analyse.ps1` | Farbfamilien eines Bildes mit Flächenanteil und Ort | `powershell -File ../farb-analyse.ps1 -Paths <bild>` |
| `../mess-masse.ps1` | findet Formen in einem Bild selbst und misst Höhe, Breite, Radius | `powershell -File ../mess-masse.ps1` |
| `../masse-bericht.txt` | der letzte Messlauf | — |
| `../farben-referenz-2026-09-22.md` | Messprotokoll, Abweichungen, Zuordnung | — |

Der Kontrastnachweis ist Teil der Abnahme. Ein Wert, der nur in diesem Dokument
steht und nirgends nachgerechnet wird, gilt nicht als belegt.
