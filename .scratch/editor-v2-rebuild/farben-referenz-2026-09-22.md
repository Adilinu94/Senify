# Farb-Referenz „Permitly" — gemessen, nicht geschätzt

Quelle (vom Nutzer vorgegeben, Vorbild für die Farbwelt von Senify):

- `C:/Users/adini/projects/nick-portal/HSzxw_Sb0AARFwe.png` — Portfolio-Übersicht, 2466 × 3051
- `C:/Users/adini/projects/nick-portal/HSzxv9UaIAAOXbw.jpeg` — Projekt-Dashboard, 2466 × 3051

Verfahren: `.scratch/editor-v2-rebuild/farb-analyse.ps1` liest die Bilder über
`System.Drawing` (LockBits), tastet jedes dritte Pixel ab, quantisiert auf 5 Bit je
Kanal und gibt je Farbfamilie den **Mittelwert der echten Pixel**, den Flächenanteil
und den **Schwerpunkt** aus. Aus der Lage ergibt sich die Rolle der Farbe, aus dem
Mittelwert der echte Wert. Rund 836 000 Stichproben je Bild.

> Rohwerte sind gerundet wie gemessen. Wo ein Wert eine Rolle trägt, ist er unten
> als Token benannt.

---

## 1. Bild 1 — Portfolio

| Anteil | Hex | Ort x/y % | Rolle |
|---:|---|---|---|
| 30,17 % | `#ffffff` | 33 / 63 | Karte (Fläche) |
| 20,97 % | `#e2e2e2` | 73 / 31 | Grund hinter den Karten |
| 16,58 % | `#f4f4f8` | 46 / 39 | versenkte Fläche (Spur, Chip) |
| 11,86 % | `#111116` | 59 / 53 | dunkle Karte, dunkle Knöpfe |
| 10,30 % | `#eeedf4` | 50 / 39 | versenkte Leiste, Segment-Spur |
| 6,96 % | `#c9f24c` | 57 / 78 | Akzent (Limette) |
| 0,50 % | `#fcefd8` | 27 / 89 | Hinweis-Fläche (helles Amber) |
| 0,35 % | `#e1543a` | 26 / 70 | Alarm („High"-Chip) |
| 0,33 % | `#141805` | 57 / 79 | Schrift **auf** Limette |
| 0,28 % | `#e3e2ec` | 24 / 79 | Kante auf Karte |
| 0,24 % | `#55545f` | 22 / 70 | gedämpfte Schrift |
| 0,20 % | `#8a8996` | 47 / 40 | feine Schrift (Meta) |
| 0,15 % | `#ceced1` | 59 / 58 | Kante (Trennlinie) |
| 0,04 % | `#8a5a05` | 26 / 89 | Schrift auf Hinweis-Fläche |
| 0,04 % | `#2e2e33` | 48 / 46 | Schrift zweiter Rang |
| — | `#eda122` | 49 / 63 | Statuspunkt (Amber) |

## 2. Bild 2 — Dashboard

| Anteil | Hex | Ort x/y % | Rolle |
|---:|---|---|---|
| 52,05 % | `#ffffff` | 55 / 62 | Karte, Seitenleiste |
| 21,46 % | `#e2e2e2` | 27 / 31 | Grund hinter den Karten |
| 8,74 % | `#efeef4` | 55 / 35 | versenkte Fläche, Zähler-Badge |
| 4,01 % | `#f4f3f8` | 67 / 53 | versenkte Fläche (Tabellenkopf) |
| 1,71 % | `#121115` | 43 / 36 | aktive Navigations-Pille |
| 1,30 % | `#c9f24c` | 42 / 78 | Akzent (Limette) |
| 0,35 % | `#e4e3ea` | 71 / 74 | Kante auf versenkter Fläche |
| 0,16 % | `#55545b` | 33 / 52 | gedämpfte Schrift |
| 0,15 % | `#eca122` | 87 / 22 | Status-Chip „Under review" |
| 0,11 % | `#8c8b93` | 53 / 52 | Bereichs-Label (Versalien) |
| 0,10 % | `#030303` | 88 / 32 | Schrift **auf** Amber-Chip |

**Nicht Palette, sondern Bildinhalt:** die Blautöne `#c5e1fd`, `#bcdcfb`, `#c3dffb`
(0,8–1,0 %) liegen alle bei y = 20–28 % und x = 58–71 % — das ist das Solarfoto
(Himmel und Glas). Im Werkzeug-Anzug kommt **kein Blau** vor.

---

## 3. Beide Bilder sind ein System

Die Schnittmenge ist nicht „ähnlich", sondern **identisch**:

| | Bild 1 | Bild 2 |
|---|---|---|
| Grund | `#e2e2e2` | `#e2e2e2` |
| Karte | `#ffffff` | `#ffffff` |
| versenkt | `#f4f4f8` / `#eeedf4` | `#efeef4` / `#f4f3f8` |
| dunkel | `#111116` | `#121115` |
| Akzent | `#c9f24c` | `#c9f24c` |
| Hinweis | `#eda122` / `#8a5a05` | `#eca122` |
| gedämpfte Schrift | `#55545f` | `#55545b` |

Daraus die Leiter (das ist die Vorlage für unsere Rohwerte):

```
Grund        canvas        #e2e2e2
Fläche       surface       #ffffff
versenkt 1   surface-sunk  #f4f4f8
versenkt 2   surface-well  #eeedf4
versenkt 3   surface-deep  #e4e3ea
Kante 1      line-hair     #e3e2ec
Kante 2      line          #d9d9df
Kante 3      line-strong   #ceced1
Tinte 1      ink           #111116
Tinte 2      ink-2         #2e2e33
Tinte 3      ink-muted     #55545f
Tinte 4      ink-soft      #6a6973
Tinte 5      ink-faint     #8a8996
Tinte 6      ink-faintest  #94939b
Akzent       accent        #c9f24c
auf Akzent   on-accent     #141805
Hinweis      warn          #eca122
Hinweis-Fl.  warn-surface  #fcefd8
auf Hinweis  warn-ink      #8a5a05
Alarm        danger        #e1543a
```

## 4. Was diese Palette über sich selbst verrät

1. **Neutralleiter, nicht Buntton-Leiter.** Der gesamte Anzug ist unbunt
   (`#e2e2e2`, `#ffffff`, `#f4f4f8` — R = G = B). Die Tints kippen minimal ins
   Blauviolett (`#f4f4f8`, `#eeedf4`, `#e3e2ec` — B rund 4–10 Stufen höher), die
   Tinte ebenfalls (`#111116`, `#55545f`). Das ist ein kalter, sauberer Neutralsatz.

2. **Schwarz ist die zweite Fläche, nicht ein Farbton.** `#111116` trägt
   hervorgehobene Karten, die aktive Navigations-Pille, den Hauptknopf („New
   project"), die aktive Segment-Option und die dunkle KI-Karte. Es ist keine
   Textfarbe, die auch mal als Fläche auftaucht, sondern eine eigene Ebene.

3. **Limette trägt genau eine Bedeutung: „hier zählt es jetzt".** Belege:
   „`⌘K`"-Taste, Chip „Ranked by Permit AI", Knopf „Review risks", die aktive
   Stufe im Pipeline-Balken, das Zulassungs-Messgerät, die kleinen Statuspunkte
   der KI-Karte — und in Bild 2 die KI-Karte samt Chip „7 projects need attention".
   Alles KI, Aufmerksamkeit oder aktueller Stand. Nicht Dekoration: keine
   Kopfleisten-Unterkante, kein Fokusring-Grundton, kein Auswahlrahmen.

4. **Amber und Rot sind Status, niemals Fläche.** Amber (`#eca122`) ist immer
   klein: Chip, Punkt. Rot (`#e1543a`) kommt in beiden Bildern einmal vor.

5. **Kein Verlauf, kein Schatten als Hierarchie.** Höhe entsteht durch
   Flächenwechsel (Grund → Karte) plus 1 px Kante. Nur das Solarfoto hat Verlauf.

6. **Große Radien, gepillte Kleinigkeiten.** Das äußere Panel ist stark gerundet,
   Karten ebenfalls, Chips und Knöpfe sind voll gepillt.

## 5. Kontrast gemessen (WCAG, gegen die Fläche, auf der sie stehen)

| Paar | Verhältnis | Urteil |
|---|---|---|
| `#111116` auf `#ffffff` | 18,8 : 1 | sehr gut |
| `#55545f` auf `#ffffff` | 7,45 : 1 | gut (AAA) |
| `#6a6973` auf `#ffffff` | 5,41 : 1 | gut (AA) |
| `#8a8996` auf `#ffffff` | 3,44 : 1 | **nur für Großschrift / Nicht-Text** |
| `#141805` auf `#c9f24c` | 14,0 : 1 | sehr gut |
| `#030303` auf `#eca122` | 8,3 : 1 | sehr gut |
| `#8a5a05` auf `#fcefd8` | 5,21 : 1 | gut (AA) |
| `#ffffff` auf `#e1543a` | 3,80 : 1 | **fehlt AA für Kleintext** |

Zwei Befunde, die wir für Senify korrigieren müssen, statt sie zu übernehmen:

- `#8a8996` ist im Vorbild als 13–14 px-Meta eingesetzt und liegt unter AA.
  Bei uns gehört diese Stufe auf Nicht-Text (Trennzeichen, inaktive Symbole) oder
  ab 18 px.
- Weiß auf `#e1543a` erreicht nur 3,80 : 1. Für den Alarm-Chip entweder Rot eine
  Stufe dunkler (Ziel ≤ L 0,183 ≈ `#cf4529`) oder dunkle Schrift auf heller
  Alarm-Fläche, wie es das Vorbild beim Amber schon macht.

## 6. Übertragung auf Senify — was das für die drei Oberflächen heißt

| Heute | Nach der Vorlage |
|---|---|
| Programm-Shell violett/indigo | Grund `#e2e2e2`, Karten `#ffffff`, Tinte `#111116`, Akzent Limette |
| Editor-Anzug Navy `#024364` + Limette | Navy entfällt: dunkle Flächen werden `#111116` |
| Limette als Publish **und** Tab-Kante **und** Fokus **und** Auswahlrahmen | Limette nur als „jetzt zählt das"-Signal |
| Canvas roh, hellgrau | Grund `#e2e2e2`, Blätter `#ffffff`, Kante `#d9d9df` |
| drei Token-Sätze nebeneinander | eine Leiter (Abschnitt 3) |

Damit beantwortet die Vorlage auch die offene Frage hell/dunkel: der Grundzustand
ist **hell** (grauer Grund, weiße Flächen, fast schwarze Tinte). Der dunkle Modus
ist dieselbe Leiter invertiert — so, wie frappe und Vvveb es belegen (gleiche
Struktur, invertierte Neutralleiter).

---

## 7. Die gebaute Farbschicht

Entschieden: Farben **plus** Neutralleiter hell/dunkel von Anfang an, die zwei
Kontraststellen **korrigiert**.

| Datei | Rolle |
|---|---|
| `design-system/farben.css` | die eine Quelle. Rohwerte → Semantik hell → Semantik dunkel |
| `pruef-kontrast.mjs` | rechnet jedes geforderte Paar in beiden Modi nach; Rückgabe 1 bei Verstoß |
| `farb-analyse.ps1` | das Messwerkzeug für die Bilder (Abschnitte 1 und 2) |

Aufbau der CSS-Datei in zwei Schichten: Rohwerte (`--ui-neutral-*` 13 Stufen,
`--ui-dark-*` 15 Stufen, `--ui-hue-*` elf Bunttöne) und darüber die Semantik
(`--ui-surface-*`, `--ui-line-*`, `--ui-ink-*`, `--ui-signal-*`, `--ui-fill-*`,
`--ui-focus-*`, `--ui-shadow-*`). Eine Rolle wird nie neu erfunden, nur neu
gebunden.

Ergebnis des Nachweises: **37 farbtragende Rollen**, davon in beiden Modi
verschieden — bis auf genau vier, und die sind Absicht: Limette, ihr Gegenenton,
Amber und der Fokus auf Limette. Diese vier tragen eine Aussage und sind kein
Grund. Die Auswahl (`--ui-signal-select`, `--ui-fill-select`) steht bewusst
**nicht** in dieser Liste: sie zeigt auf `--ui-surface-emphasis` und folgt dem
Modus dadurch von selbst.

Drei Stellen weichen vom Vorbild ab — jede mit Grund, jede nachgerechnet:

| Stelle | Vorbild | Bei uns | Grund |
|---|---|---|---|
| Meta-Tinte | `#8a8996` | `#75747f` | 3,44:1 → 4,60:1. Original bleibt als `--ui-ink-ghost` für Nicht-Text |
| Alarm | `#e1543a` | `#cf4529` | Weiß darauf 3,80:1 → 4,63:1 |
| Alarm, Schrift auf Alarmfläche | — | `#b03c20` | dieselbe Zweiteilung, die das Vorbild beim Hinweis schon vormacht |

Dazu ein Zusatz, den das Vorbild nicht hat: `--ui-line-control`. Das Vorbild
umrandet keine Felder, es füllt sie (`#f4f4f8` auf `#ffffff` sind 1,07:1). Für
dichte Inspektoren ist die gefüllte Variante richtig und bleibt der Normalfall;
wo die Füllung die Grenze nicht erkennbar macht, trägt diese Kante sie mit
mindestens 3,15:1. Folge: sie ist zwangsläufig so dunkel wie die blasseste
Schrift — vollständig umrandete Masken wirken deshalb schwer.

## 8. Übernahme — Zuordnung der heutigen Namen

Noch **nicht** umgesetzt; die laufende Oberfläche ist unverändert. Zuordnung für
den späteren Zug:

| Heute | Neu |
|---|---|
| `--ed-surface-canvas` (#01283c) | `--ui-surface-canvas` |
| `--ed-surface-panel` (#083247) | `--ui-surface-panel` |
| `--ed-surface-raised` (#024364) | `--ui-surface-raised` |
| `--ed-surface-inset` (#042c40) | `--ui-surface-inset` |
| `--ed-ink-strong` | `--ui-ink-strong` |
| `--ed-ink-base` | `--ui-ink` |
| `--ed-ink-muted` | `--ui-ink-muted` |
| `--ed-ink-faint` (Nicht-Text) | `--ui-ink-ghost` (Nicht-Text) |
| `--ed-ink-on-lime` | `--ui-ink-on-accent` |
| `--ed-line-hairline` / `-control` / `-strong` | `--ui-line-hairline` / `-control` / `-strong` |
| `--ed-signal-accent` / `-select` / `-danger` / `-danger-ink` / `-success` / `-warning` | `--ui-signal-*` (gleiche Namen) |
| `--ed-fill-hover` / `-select` / `-danger` | `--ui-fill-hover` / `-select` / `-danger` |
| `--ed-focus` / `--ed-focus-on-accent` | `--ui-focus` / `--ui-focus-on-accent` |
| `--ed-scrim` | `--ui-scrim` |
| `--ed-shadow-float` / `-dialog` | `--ui-shadow-float` / `-dialog` |
| `--ed-lime`, `--ed-brand-900…300` | entfallen → `--ui-hue-lime`; Tiefwasser wird `--ui-surface-emphasis` |
| `--bg-base`, `--fg-base`, `--line`, `--accent`, `--accent-ink` | `--ui-surface-panel`, `--ui-ink`, `--ui-line`, `--ui-signal-accent`, `--ui-ink-on-accent` |

Neu hinzu, ohne Gegenstück: `--ui-surface-emphasis` (die zweite Fläche),
`--ui-surface-track`, `--ui-ink-ghost`, `--ui-signal-danger-ink`,
`--ui-signal-{warning,danger,success}-surface`, `--ui-line`.

Ohne Gegenstück in der neuen Welt: `--ed-edge-hairline`, `--ed-edge-top`,
`--ed-edge-select`. Sie malen Lichtkanten auf dunkle Flächen — eine Technik, die
es im hellen Grundzustand nicht gibt, weil dort die Fläche selbst die Höhe
trägt. Für den dunklen Modus bleiben `--ui-shadow-float` / `-dialog`.

Unberührt bleiben Maß, Radius, Typografie, Bewegung und die Canvas-Hilfen: sie
wechseln nur ihre Farbwerte.
