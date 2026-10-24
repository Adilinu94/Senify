# Bauplan: Framer-Seiten exakt und einfach in den Editor aufnehmen

> **Dokumenttyp:** Arbeitsplan (Vorhaben), keine Ist-Beschreibung.
> **Stand:** 21.10.2026 · **Basis:** `master` `d14880e` (PR #81 gemergt)
> **Geltung:** Dieser Plan beschreibt Bauarbeit. Was heute schon steht, steht in
> `docs/current/stand.md`; Messzahlen in `docs/current/qualitaet.md`.

## 1. Das Ziel in einem Satz

Eine beliebige veröffentlichte Framer-Seite soll mit **einem Klick** in den
Editor kommen, dort **auf allen Breiten wie das Original aussehen** und
**vollständig bearbeitbar** sein — ohne dass jemand den Import nachbessert.

## 2. Was heute belegt ist

Gemessen an zehn fremden, veröffentlichten Framer-Seiten (nicht aus unseren
Fixtures, nicht die Earn-Vorlage), Import → Backen → Pixel-Differenz:

| Seite | Desktop | Tablet | Mobil | Bewertung |
|---|---|---|---|---|
| wedge | 0,46 % | 0,70 % | 0,86 % | brauchbar |
| notes-template | 0,59 % | 0,26 % | 0,55 % | brauchbar |
| refined | 1,48 % | 2,20 % | 5,46 % | brauchbar (Mobil grenzwertig) |
| Earn (Referenz) | 0,98 % | 1,54 % | 2,23 % | brauchbar |
| receivio | 8,59 % | 12,22 % | 18,08 % | unbrauchbar |
| unifiersofjapan | 13,08 % | 17,87 % | 25,28 % | unbrauchbar |
| meeko-template | 23,06 % | 21,91 % | 13,02 % | unbrauchbar |
| donutshop | 32,10 % | 32,10 % | 33,29 % | unbrauchbar |
| last-studio | 64,83 % | 56,43 % | 58,71 % | unbrauchbar |

Dazu die drei Fixtures (eigene Exporte): easier-train 1,7 %, fluffy-rectangle
0,5 %, stupendous-football 0,2 % (Desktop).

**Also: vier von elf Seiten sind brauchbar, sieben nicht.** Für „viele Framer-
Seiten einfach" ist das der Ausgangspunkt, nicht das Ergebnis.

## 3. Die Ursachen, nach Belegkraft sortiert

### U1 · Die Geräte-Faltung greift nicht — zwei Kopien stehen im Fluss (der größte Hebel)

**Belegt bis auf die Breite.** Die Kette ist vollständig gemessen, und sie ist
anders als zuerst vermutet — nicht die Breite, sondern **ein Kind zu viel**:

1. Das äußere Grid `fi271` hat **2 Spalten à 640 px**; die Zelle `fi295` liegt
   auf `span 1` und ist im Import **640 px breit — richtig**.
2. Die Zelle hat im Import aber **zwei** Kinder: `fi296` (375 px hoch) und
   `fi308` (559 px hoch). Beide sind `display:grid` und stehen **untereinander**:
   375 + 559 = **935 px** statt **375 px**.
3. Grund: Die Zelle selbst ist `display:block`, nicht `grid`. In der Quelle
   liegen die beiden Grids **übereinander im selben Feld** (ein Kartenstapel,
   der per Scroll-Effekt durchgeblättert wird), im Import sind es zwei
   Geschwister im Fluss.
4. Nach oben setzt sich das fort: Das äußere Grid wird **4565 statt 2407 px**
   hoch, die Seite **17378 statt 9354 px**.

**Was ausgeschlossen ist** (jeweils gemessen, damit niemand es erneut prüft):

- **Grid-Übersetzung:** Ein minimaler Nachbau (Grid, `span 4/2/6`,
  verschachtelt, `height:min-content`, `aspect-ratio`) erzeugt korrektes CSS.
- **`grid-column`:** Die Deklaration kommt an — **32 Vorkommen** im CSS des
  Bakes, und die 25 Container-Knoten tragen den **richtigen** Wert
  (`span 1`, `span 4`, `span 6`). Framer schreibt die Platzierung als
  `grid-column: var(--1q1styz)` und setzt die Variable inline
  (`style="--1q1styz:span 1;--1xlim7f:span 1"`); der Import löst sie korrekt auf.
- **`display:contents`:** bleibt erhalten (eigener Nachbau geprüft).
- **Die Zellbreite:** ist mit 640 px korrekt.
- **`aspect-ratio`:** ist mit `1.33111` vorhanden und rechnet richtig — nur mit
  der falschen Höhe darüber.

**Damit ist der Fehler eingekreist und belegt:** Nicht die Platzierung ist
kaputt, sondern die **Geräte-Faltung**. Framer schreibt den Kartenstapel als
zwei `ssr-variant`-Kopien unter einem Container:

```
<div class="framer-1mtoid5-container" style="--1q1styz:span 1;--1xlim7f:span 1">
  <div class="ssr-variant hidden-1ebocfq">    ← Kopie A (Desktop/Tablet)
    <a class="… framer-lgegzf …" data-framer-name="Large">…</a>
  </div>
  <div class="ssr-variant hidden-tq1gxe hidden-72rtr7">  ← Kopie B (Handy)
    <a class="… framer-lgegzf …" data-framer-name="Large Mobile">…</a>
  </div>
</div>
```

Beide Kopien sind **nie gleichzeitig sichtbar** (`hiddenAt` schließt sich aus).
Der Capture löst den `ssr-variant`-Wrapper auf und hängt die `hidden`-Hashes an
das Kind (das ist richtig so), aber der **Mapper faltet die beiden Kinder nicht
zu einem Knoten**: Sie tragen dieselben Basisklassen, werden aber als zwei
Geschwister im Fluss geführt. Ergebnis: 375 + 559 = 935 px statt 375.

**Der `ssr-variant`-Wrapper wird aufgelöst, aber die Faltung greift nicht** —
das ist der Fehler. 5 solcher Container gibt es in der Work-Sektion, ebenso
viele Stellen in den übrigen Abschnitten.

**Warum das die Fixtures nicht zeigen:** Dort sind die Kopien oft strukturell
verschieden genug, dass sie ohnehin als getrennte Knoten mit `visibleDevices`
landen. Erst wenn beide Kopien denselben Aufbau haben und sich nur in
`hidden`-Hashes unterscheiden, entsteht der Doppelknoten.

**Warum die Fixtures grün sind:** Sie nutzen kaum Platzierungen (`grid-column`
0- bis 8-mal), die fremden Seiten 4- bis 26-mal. Unser Gate hat den Fall nie
gesehen.

### U2 · Inhalte, die erst im Browser entstehen

**Belegt.** Die fünf Bewertungssterne der Earn-Seite stehen nicht im SSR; ihr
Container hält fünf leere `display:contents`-Platzhalter. `viewBox="0 0 256 256"`
kommt im Server-HTML 0-mal vor, im gerenderten DOM 5-mal. Das ist mit dem
SSR-Weg **grundsätzlich** nicht erreichbar.

### U3 · `-webkit-`-Präfixe fallen weg

**Belegt, Auswirkung unklar.** Der Normalizer wirft jede Deklaration mit
`-webkit-`/`-moz-` weg (`normalize.ts`). Bei `last-studio` sind das 4121 von
7602 Deklarationen — über die Hälfte. Wie viel davon sichtbar ist (die meisten
sind Präfix-Dubletten), ist **nicht gemessen**.

### U4 · Der Messapparat selbst ist eine Fehlerquelle

**Belegt.** Zwei Seiten (wynn, atlas) ließen sich nicht messen, weil mein
Skript Bilder unterschiedlicher Höhe verglich. Ein Messfehler sieht aus wie ein
Import-Fehler. Das kostet Vertrauen und Zeit.

### U5 · Animationen: nur ein Bruchteil kommt an, und der falsche Zeitmaßstab

**Gemessen an zehn fremden Seiten** (`report.motion` = gefunden / auf Preset
abgebildet / nur Befund):

| Seite | gefunden | auf Preset | nur Befund |
|---|---|---|---|
| wedge | 7 | 7 | 0 |
| notes-template | 6 | 6 | 0 |
| refined | 5 | 5 | 0 |
| unifiersofjapan | 5 | 4 | 1 |
| receivio | 17 | 14 | 3 |
| wynn-template | 14 | 13 | 1 |
| last-studio | **0** | 0 | 0 |
| meeko-template | **0** | 0 | 0 |
| donutshop | **0** | 0 | 0 |
| atlas-studio | **0** | 0 | 0 |

Vier Ursachen, jede mit Beleg:

**(a) Der Zeitmaßstab ist um Faktor ~47 falsch.** Die Quelle animiert
`duration: 1.4` (Sekunden, gemessen im Roh-Sample von `wedge`). Der Mapper
rechnet `1.4 / 300` und klemmt auf `0.1` (`motion-mapping.ts`); der Renderer
multipliziert mit `baseDurationMs = 300`. Ergebnis im gebackenen CSS:
`animation: 30ms` — statt 1400 ms. Im Browser bestätigt (`dauerMs: 30`).
Die Einblendung ist damit ein Blitz, keine Bewegung.

**(b) Vier Seiten haben Elemente mit `data-framer-appear-id`, aber keinen
`appearAnimationsContent`-Kanal.** Bei `donutshop` sind das **51 Elemente**,
bei `last-studio`, `meeko-template` und `atlas-studio` je eines. Der Startzustand
wird korrekt entfernt (0 Knoten mit `opacity <= 0.01` im Aussehen), aber es wird
**keine Animation angelegt** — die Elemente erscheinen einfach. Das ist eine
stille Lücke: nichts ist kaputt, aber der Effekt fehlt.

**(c) Nur Einblendungen von unten sind abbildbar.** `appearPreset` akzeptiert
nur `x = 0`, `scale = 1`, `y >= 0`. Alles andere (seitlich, Skalierung,
Rotation) bleibt Befund. Gemessen sind das 5 von 54 Samples (9 %). Die
`raw`-Daten der Quelle enthalten mehr, als das Preset nutzt: `rotateX: 12`,
`rotateY: 12`, `transformPerspective: 1200` — eine 3D-Kippung, die verloren geht.

**(d) Hover und Scroll-Trigger kommen nicht aus dem SSR.** Die Seiten haben
50–51 `:hover`-Vorkommen und bis zu 131 `will-change: transform`. Der Import
liest Hover nur als *Stilzustand* (was funktioniert), nicht als *Bewegung*.
Scroll-Effekte (`data-framer-scroll`) gibt es im SSR-HTML dieser Seiten nicht —
sie entstehen wie die Sterne erst im Browser.

**Nicht geprüft:** Ob die abgebildeten Einblendungen (nach Fix (a)) im Bake
tatsächlich so aussehen wie in der Quelle. Dafür braucht es einen
Bild-Vergleich über die Zeit, nicht nur einen Stand.

## 4. Der Plan

Jeder Schritt hat ein Gate. Ein Schritt gilt erst als fertig, wenn sein Gate
grün ist — und zwar auf **allen elf Seiten**, nicht nur auf einer.

### Schritt 1 · ~~Den Stapel im SSR belegen~~ — **erledigt am 21.10.2026**

Die Frage ist beantwortet, das Ergebnis steht in U1: Framer schreibt den
Doppelknoten als zwei `ssr-variant`-Kopien unter einem Container, die sich
gegenseitig per `hidden`-Hashes ausschließen. Der Capture löst den Wrapper auf
(richtig), der Mapper faltet die beiden Kinder nicht (der Fehler).

**Gate (erreicht):** Ein Satz mit Belegstelle — die SSR-Struktur des Containers
`framer-1mtoid5-container` und die `hiddenAt`-Listen der beiden Kopien
(`["1ebocfq"]` gegen `["tq1gxe","72rtr7"]`).

### Schritt 2 · Die Geräte-Faltung reparieren

**Ziel:** Zwei `ssr-variant`-Kopien, die sich gegenseitig ausschließen, werden
**ein** Knoten mit `visibleDevices` — nicht zwei Geschwister.

- Der Mapper hat dafür bereits den Weg (`mergeSiblingVariants`,
  `visibleDevicesOf`); er greift hier nicht. Warum, ist zu belegen, bevor
  gebaut wird: Liegt es an unterschiedlichen Basisklassen (Large gegen Large
  Mobile), an der Tiefe (die Kopien sind Enkel, nicht Kinder), oder an der
  Reihenfolge?
- Nach dem Fix: prüfen, ob die `visibleDevices`-Rechnung (die seit dem 20.10.
  als „nicht belegt" im Fahrplan steht) jetzt belegt ist — dieser Fall ist ihr
  erster echter Zeuge.

**Gate:** `last-studio` unter 5 % auf allen drei Breiten; die vier heute
brauchbaren Seiten dürfen sich **nicht** verschlechtern (Ratsche). Ein Testfall,
der ohne den Fix rot ist.

### Schritt 3 · Den Messapparat härten (parallel zu 2)

**Ziel:** Eine Zahl, der man glauben kann.

- Der Vergleich muss unterschiedlich hohe Bilder vergleichen können, statt
  abzubrechen (auf die kleinere Höhe schneiden, wie es die Earn-Messung schon
  tut).
- Jede Messung schreibt ihre Zahlen als Datei, damit ein Lauf nachvollziehbar
  ist.
- Die zehn fremden Seiten werden als **zweite Fixture-Gruppe** aufgenommen
  (nur SSR-HTML + CSS, keine Binärdateien — dieselbe Regel wie bei den drei
  bestehenden Fixtures).

**Gate:** Elf Seiten, ein Lauf, eine Tabelle. Kein Abbruch mehr.

### Schritt 4 · Die Präfix-Frage klären

**Ziel:** Wissen, ob U3 sichtbar ist.

- Zählen, welche `-webkit-`-Deklarationen **ohne** unpräfigiertes Gegenstück
  vorkommen. Nur die können fehlen.
- Für die verbleibenden: aufnehmen oder als Befund melden.

**Gate:** Eine Zahl statt einer Vermutung; danach entscheiden, ob gebaut wird.

### Schritt 5 · Animationen auf den richtigen Zeitmaßstab bringen

**Ziel:** Eine Einblendung von 1,4 s dauert 1,4 s, nicht 30 ms.

- **Ursache (a)** ist belegt und klein: Der Mapper rechnet Sekunden gegen
  Millisekunden (`duration / 300`). Die Einheit muss stimmen — `duration` kommt
  in Sekunden, `baseDurationMs` in Millisekunden.
- **Ursache (b)** ist der größere Hebel: Fehlt der `appearAnimationsContent`-
  Kanal, liegt der Startzustand trotzdem am Element. Aus ihm lässt sich die
  Bewegung ableiten (Start-Transform, Start-Deckkraft) — oder es wird
  wenigstens ein Befund, statt still nichts zu tun.
- **Ursache (d)**: Hover als Bewegung ist ein eigenes Vorhaben; hier nur
  entscheiden, ob es im Umfang ist.

**Gate:** Im gebackenen CSS steht die Dauer der Quelle (1,4 s → 1400 ms), und
`donutshop` hat Motion-Samples statt 0. Ein Testfall, der ohne den Fix rot ist.

### Schritt 6 · Die Grenze der SSR-Quelle schließen (Produktentscheidung)

**Ziel:** Inhalte, die erst im Browser entstehen (U2), kommen mit.

Zwei Wege, beide teuer:

- **(a) Zweite Quelle:** Unframer-MCP (`getProjectXml`) liefert die
  Projektstruktur statt der gerenderten Wirkung. Löst Komponenten, CMS und
  Code-Inhalte. Braucht einen zweiten Pfad im Dialog und eine eigene Anleitung.
- **(b) Browser-Capture:** Die Seite im Browser rendern und das **fertige** DOM
  aufnehmen. Löst die Sterne, verliert aber die SSR-Vorteile (Geschwindigkeit,
  Reproduzierbarkeit) und braucht dieselbe Adressprüfung wie der Analyse-Worker
  (ADR-0022).

**Gate:** Eine Entscheidung mit Begründung als ADR, **bevor** gebaut wird. Kein
Code in diesem Schritt.

### Schritt 7 · Den Editor-Weg durchgängig belegen

**Ziel:** Nicht nur „das Dokument ist gültig", sondern „ein Mensch kann es
bearbeiten".

- Der Fall aus `packages/app/test/framer-fit-text-editor-browser.test.ts` wird
  auf die elf Seiten ausgeweitet: importieren, einen Text ändern, ein Bild
  tauschen, speichern, Vorschau prüfen.
- Gemessen wird je Seite, ob die Änderung im gespeicherten Entwurf ankommt und
  die Gestaltungsregel überlebt.

**Gate:** Elf Seiten, je ein Bearbeitungsfall grün.

### Schritt 8 · Die Anleitung auf den Stand bringen

**Ziel:** Wer importiert, weiß vorher, was geht.

- `packages/docs-portal/content/docs/framer-import.md`: die gemessenen Grenzen,
  die Zahl der brauchbaren Seiten, die neuen Fixtures.
- `docs/current/stand.md` und `docs/current/qualitaet.md` mit den Zahlen aus
  Schritt 3.

**Gate:** Doku-Tests grün; die Zahlen im Dokument stammen aus einem Lauf.

## 5. Reihenfolge und Abhängigkeiten

```
Schritt 3 (Messung)  ──►  (alle Messungen)
Schritt 2 (Faltung)  ──►  Schritt 7 (Editor)
Schritt 5 (Zeitmaßstab) ── unabhängig, klein
Schritt 4 (Präfixe)   ── unabhängig
Schritt 6 (Quelle)    ── Entscheidung, dann eigener Strang
Schritt 8 (Doku)      ── nach 2, 3, 5, 7
```

**Schritt 3 zuerst bauen, dann 2.** Die Ursache ist belegt (U1), aber ohne eine
Messung, die nicht abbricht, lässt sich der Erfolg von Schritt 2 nicht prüfen —
zwei der elf Seiten sind heute nicht messbar.

**Schritt 5 (a) ist der kleinste Hebel im ganzen Plan:** eine Einheit
(`duration / 300` statt `duration * 1000`). Er ist unabhängig und kann sofort
gemacht werden.

## 6. Woran wir Erfolg messen

Nicht an einer Seite, sondern am Feld:

| Stufe | Kriterium |
|---|---|
| **Heute** | 4 von 11 Seiten unter 5 % (Desktop) |
| **Nach Schritt 2** | 8 von 11 unter 5 %, keine Verschlechterung der vier |
| **Nach Schritt 4** | 10 von 11 unter 5 % |
| **Ziel** | 11 von 11 unter 3 % auf allen drei Breiten, jede im Editor bearbeitbar |

Die letzte Zeile ist die Zielmarke, nicht die Zusage. Wenn eine Seite sie
verfehlt, steht im Bericht, warum.

## 7. Was dieser Plan bewusst nicht verspricht

- **Keine Pixelgleichheit.** Kanten-Antialiasing und Fremd-Widgets (der „Made in
  Framer"-Badge) bleiben. Was zählt: gleiche Höhe, gleiche Textboxen, gleiche
  Umbrüche.
- **Kein CMS-Inhalt.** Framer-CMS-Sammlungen werden als Befund gemeldet, nicht
  importiert.
- **Kein Framer-Code.** Code-Komponenten und Shader bleiben Platzhalter; das ist
  eine eigene Entscheidung (Island-Payload).
- **Keine Zusage ohne Messung.** Jede Zahl in diesem Plan stammt aus einem
  ausgeführten Lauf; geschätzte Zahlen stehen ausdrücklich als offen markiert.

## 8. Definition of Ready für jeden Schritt

1. Der vorherige Schritt hat sein Gate grün.
2. `git status --short` ist sauber.
3. Der Testfall, der den Ausgangsfehler zeigt, existiert und ist rot.
4. Die betroffenen Dateien und Schnittstellen sind benannt.

## 9. Definition of Done für jeden Schritt

1. Gate ausgeführt und grün, auf allen elf Seiten.
2. Jede Aussage „umgesetzt" hat einen Code- oder Testbeleg.
3. Zahlen nur in `docs/current/qualitaet.md`.
4. Keine Verschlechterung einer Seite, die vorher brauchbar war.
