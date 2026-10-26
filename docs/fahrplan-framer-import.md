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

### U1 · Die Geräte-Faltung greift nicht — **geschlossen 22.10.2026**

**Der Befund war richtig, die Ursache war eine andere.** Der Plan vermutete, der
Mapper falte die beiden `ssr-variant`-Kopien nicht. Gemessen ist die Kette
länger: **drei** Fehler zusammen, und jeder allein hätte nicht gereicht.

**1. Die Seite kennt ihre Breakpoints nicht.** `last-studio` liefert **keinen**
`__framer__breakpoints`-Kanal — die Hashes `wexuja`, `v38e2x`, `1bs076l` stehen
nur in einem `<style data-framer-breakpoint-css>`-Block. Der Capture las aber
ausschließlich den Kanal, also war die Breakpoint-Karte **leer**, und
`visibleDevicesOf` konnte keinen Hash einem Gerät zuordnen. Die Kopien galten
alle als "überall sichtbar" und stapelten sich: **9354 → 17378 px (+8024)**.

**2. Der `hidden-`-Marker wurde zu weit vererbt.** Ein `ssr-variant`-Wrapper
versteckt **ein** Element, nicht seinen Teilbaum. Nachdem ich die Liste an die
Kinder weiterreichte, erbte bei `refined` jedes Kind das Gerät seines Elternteils
—— Tablet **2,4 → 16,9 %**.

**3. Das Universe war zu klein.** `visibleDevicesOf` fragte "welche Geräte gibt
es?" nur bei den **Geschwistern**. Bei verschachtelten Kopien (Elternteil nennt
die Hashes, das Kind nennt keine) blieb die Menge leer und **397 von 824 Knoten**
standen auf "auf keinem Gerät sichtbar". Jetzt zählt, was die **Seite** an
Breakpoints deklariert.

**Die Messung (Blindtest, Desktop / Tablet / Mobil):**

| Seite | vorher | nachher |
|---|---|---|
| last-studio | 80,21 / 78,66 / 83,74 % | **24,85 / 23,30 / 15,34 %** || donutshop | 45,28 / 44,36 / 44,52 % | **11,81 / 10,12 / 20,51 %** |
| refined | 1,69 / 2,42 / 5,77 % | 1,66 / 2,40 / 5,64 % (unverändert) |
| wedge | 0,46 / 0,69 / 0,86 % | 0,92 / 1,35 / 0,86 % (Höhe exakt) |

**Nebenbefund, der eine zweite Seite erklärt:** `donutshop` schreibt seine
`hidden`-Regeln unter einen Komponenten-Vorfahren (`.framer-BsqgT .hidden-72rtr7`)
und benutzt ein **600/1200**-Paar statt 810/1200. Beides wird jetzt gelesen.

**Was weiter offen ist:** `notes` (27,95 / 34,23 / 36,64 %) und
`unifiersofjapan` (21,61 / 24,09 / 26,68 %) verlieren weiter Fläche — dort ist
es **nicht** die Faltung. Das braucht eine eigene Messung, keine weitere
Vermutung.

**Belege:** `packages/framer-import/test/device-fold.test.ts` (7 Fälle; **5 davon
rot** ohne den Fix: Breakpoint-Lesung, Vorfahren-Selektor, Kanal-Vorrang,
Faltung, keine leere Sichtbarkeit, keine Vererbung) und der Blindtest
(`packages/framer-import/scripts/blindtest.ts`).

### U1b · `hidden-<hash>` am Element wurde zur Darstellung — **geschlossen 26.10.2026**

**Der Befund:** Auf Mobil fehlten **13 eindeutige Textzeilen** — die gesamte
Produktkarte (`BERRY BLISS`, `ORDER NOW`, `$7.50 USD`, `CHOCO RING` …). Der
Inhalt war im Baum vorhanden (im HTML nachweisbar), wurde aber nicht gerendert.
Desktop war vollständig (87 von 87 eindeutigen Zeilen, Höhe exakt 17 656).

**Die Ursache war eine Verwechslung von Sichtbarkeit und Darstellung, an zwei
Stellen:**

1. **Der Hash stand am Element, nicht am Wrapper.** Framer schreibt seine
   Geräte-Hashes auch direkt auf das Element — gemessen an
   `concerned-circumstances-187935`: der mobil-only Slider-Container trägt
   `hidden-72rtr7 hidden-bq06c3` an seinem eigenen `<div>`. Der Capture las die
   Hashes nur am `ssr-variant`-Wrapper. Sie blieben in `baseClasses`, die
   `.hidden-x{display:none!important}`-Regel traf die Desktop-Kaskade, und weil
   Desktop 1440 in der Tablet-Range liegt, stand `display:none` im
   **Basis-Zustand**. Die Mobil-Kaskade kennt die Eigenschaft nicht — sie erbte
   sie. Die Karte verschwand auf genau dem Gerät, auf dem sie ihr Zuhause hatte.

2. **Die Regel wurde als Gestaltung gelesen.** `.hidden-<hash>{display:none}` ist
   Framers Schalter, nicht sein Aussehen. Als Stil gelesen wurde sie zur
   dauerhaften `display`-Eigenschaft.

**Der Fix** trennt beide Ebenen: `hidden-*` fliegt aus `baseClasses`, wandert in
`hiddenAt` und wird über `visibleDevices` zu exakten Breitenbereichen
(`capture-html.ts`, `toIrNode`). Der `ssr-variant`-Weg bleibt unverändert.

**Die Messung (Payload-Probe, echte Seite, alle Breiten):**

| Pfad | vorher | nachher |
|---|---|---|
| Mobil 390 | 63,96 % | **10,12 %** |
| Mobil Höhe | 13 336 (Original 14 637) | **14 664** |
| Desktop 1440 | 4,07 % | 4,07 % (unverändert) |
| Release mit Payload | 1,30 / 0,46 / 0,47 % | 1,31 / 0,45 / 0,53 % (unverändert) |

**Der Inhalt ist zurück:** Mobil 13 fehlende Zeilen → **0 inhaltliche Verluste**.
Übrig sind nur die zwei Framer-Werbezeilen („Create a free website with Framer",
„Powered by Webflow"), die zu Recht fehlen. Der Baum zeigt auf Mobil jetzt **84**
eindeutige Zeilen gegen **81** im Original.

**Belege:** `packages/framer-import/test/device-visibility.test.ts` (4 Fälle;
**1 davon rot** ohne den Fix: `expected 'none' not to be 'none'`) und die
Payload-Probe (`import-payload-probe.test.ts`) gegen die echte Seite.

**Was der Fix NICHT löst:** Die verbleibenden 10,12 % auf Mobil sind keine
fehlenden Inhalte mehr, sondern Darstellung (fehlende Hover/Fokus-Regeln,
CMS-Runtime-Inhalte). Sie brauchen eine eigene Messung.

### U2 · Inhalte, die erst im Browser entstehen

**Belegt.** Die fünf Bewertungssterne der Earn-Seite stehen nicht im SSR; ihr
Container hält fünf leere `display:contents`-Platzhalter. `viewBox="0 0 256 256"`
kommt im Server-HTML 0-mal vor, im gerenderten DOM 5-mal. Das ist mit dem
SSR-Weg **grundsätzlich** nicht erreichbar.

### U2b · Die Texte der Quelle sind im Import unsichtbar — **geschlossen 22.10.2026**
**Belegt und gemessen.** Framer misst die Wörter: der Kasten einer
Textkomponente trägt `font-size: 0` (und `line-height: 0`), die Wörter selbst
bekommen ihre Größe von der Klasse. Der Import nahm den **Messwert** als
Größe — die Wörter waren unsichtbar (Höhe 0). An `notes.framer.website` war die
Überschrift „Writing" im Import 0 px hoch (in der Quelle 22 px), und die Seite
verlor 242 px Höhe.

**Zwei Ursachen, beide behoben:** (1) Der Import gibt dem Kasten die Größe der
Wörter statt des Messwerts. (2) Der geliftete Typografie-Block lief **nach**
dem Fit-Text-Block und überschrieb ihn wieder mit der Null des Kastens — die
Reihenfolge ist jetzt: Lift zuerst, Fit-Text danach.

Dazu ein dritter Fund derselben Messung: der seitenweite Payload-Träger rendert
ohne gelieferten Payload **kein Poster und keine Platte** mehr (die Struktur
steht ja) — das allein waren 96 px und rund 5 Prozentpunkte.

**Gemessen (Blindtest, Desktop / Tablet / Mobil): 27,95 / 34,23 / 36,64 % →
1,46 / 2,23 / 6,19 %**, Höhe +6 / +6 / −45 px (vorher −242 / −241 / −503).

**Beleg:** `packages/framer-import/test/fit-text.test.ts` (2 Fälle, 1 rot
ohne den Fix).

### U6 · Grid und Breite: die zwei Seiten über 20 % — **gemessen, nicht gelöst (22.10.2026)**

**Der Befund.** `unifiersofjapan` (20,45 / 24,19 / 26,69 %) und `last-studio`
(25,02 / 23,25 / 15,34 %) sind die zwei Seiten, die der Blindtest noch über
20 % misst. Die Abschnittsmessung (`scripts/sections.ts`) zeigt bei
`unifiersofjapan` **+260 px pro Karte**, dreimal hintereinander — es ist ein
wiederkehrendes Element, kein Einzelfall.

**Zwei Ursachen, beide gemessen:**

1. **Der Import kennt kein Grid.** Framer schreibt das Layout einer Karte in die
   Klassenregel (`display:grid; grid-template-columns:repeat(2,minmax(50px,1fr))`),
   der Capture liest nur das **Inline-Style** und sieht deshalb `flex`. Der
   Mapper hat einen Grid-Zweig, der nie greift (`layout.columns` wird nie
   gesetzt). Die Karten stapeln sich, das Grid wird zur Liste.
2. **`width: 8%` ist ein Platzhalter, kein Maß.** 16 Knoten tragen im Import
   `width: 8%`; in der Quelle ist der 8-%-Träger ein Spacer, der den Inhalt
   eines absolut positionierten Nachbarn rahmt. Der Import macht ihn zum
   Inhaltscontainer — der Inhalt erbt 8 % und bricht um.

**Was ich gebaut und wieder verworfen habe.** Ein Grid-Zweig im Capture
(`layoutOfVisual`, Klassenregeln lesen `display`, `grid-template-columns`,
`flex-direction`, `align-items`, `justify-content`) plus die Geräte-Spalten im
Mapper. Ergebnis: **`unifiersofjapan` unverändert** (der Desktop-Zustand ist
dort wirklich `flex`), aber die **Fixture-Gates wurden rot** —
`framer-easier-train` **29,0 %** statt 8 %, Höhe 13283 → 16816 px;
`framer-fluffy-rectangle` **46,2 %** statt 5 %. Die Änderung ist
**zurückgenommen**; die Gates sind wieder grün (3/3).

**Die Lehre:** Der Grid-Zweig allein ist nicht die Lösung — er verschiebt die
Fehler, weil (2) ungelöst bleibt: solange ein 8-%-Spacer den Inhalt trägt,
hilft dem Layout kein `display:grid`. Der nächste Schritt ist die
**Spacer-Erkennung** (ein Träger ohne eigenen Inhalt, dessen Nachbar
`position:absolute` ist, gehört nicht in den Textfluss), nicht der Grid-Zweig.
Die Fixture-Gates sind das Maß, an dem der nächste Versuch gemessen wird —
der Blindtest allein reicht nicht.

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

> **Stand 21.10.2026: dieser Abschnitt ist der Befund, nicht mehr der Zustand.**
> (a) und (b) sind geschlossen, (c) ist überholt. Die Belege stehen in
> `docs/fahrplan-framer-1zu1.md` (Schritt 4, 4b, 5) und in `docs/current/stand.md`.
> Der Abschnitt bleibt als Beweis stehen, warum die Arbeit nötig war — die Zahlen
> sind die Messung vom Anfang, nicht der heutige Stand.

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

### Schritt 5 · Animationen auf den richtigen Zeitmaßstab bringen — **umgesetzt 21.10.2026**

**Ziel:** Eine Einblendung von 1,4 s dauert 1,4 s, nicht 30 ms.

**Erledigt, mit Beleg** (Details in `docs/fahrplan-framer-1zu1.md`, Schritt 4 und 4b):

- **Ursache (a)** — behoben. Die Einheit ist Teil des Samples (`durationUnit`);
  `durationScale` wird gegen die echte Basis-Dauer des Themes gerechnet. Im
  gebackenen CSS: **1400 ms**. Beleg: `motion-bake-timing.test.ts`.
- **Ursache (b)** — behoben. Fehlt der Kanal, wird die Einblendung aus dem
  Startzustand **abgeleitet** (Bewegung stimmt), und die Dauer ist eine genannte
  Annahme im Bericht; ohne Startzustand bleibt eine Warnung. `donutshop`:
  **39 abgeleitete Effekte** statt 0. Beleg: `appear-derived.test.ts`.
- **Ursache (c)** ist überholt: Effekte ohne Preset werden jetzt zu CSS kompiliert
  und laufen im Release. Beleg: `appear-bake.test.ts`.
- **Ursache (d)** — Hover als Bewegung und Scroll-Trigger bleiben offen; sie
  brauchen die Framer-Runtime als Payload (`docs/fahrplan-framer-1zu1.md`, Schritt 2).

**Gate (erfüllt):** Im gebackenen CSS steht die Dauer der Quelle (1,4 s → 1400 ms),
und `donutshop` hat Effekte statt 0. Beide Tests sind ohne den Fix rot.

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
