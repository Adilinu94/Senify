# Wie man an Framer-Animationsdaten kommt — und wie sie 1:1 eingebaut werden

> **Dokumenttyp:** Rechercheergebnis mit Messungen, 26.10.2026.
> **Frage:** Wie kommt man an den Code der Framer-Animationen, und wie baut man sie exakt nach?
> **Antwort in einem Satz:** Nicht durch Dekompilieren — durch **Abgreifen am laufenden Browser**. Framer muss jede Animation der Browser-API übergeben; dort ist sie vollständig und in CSS-Werten lesbar.

---

## 1. Was ich zuerst falsch angenommen hatte

Ich hatte behauptet, die Seite habe „228 Scroll-Reveals, alle nur `opacity` + `blur` + `transform`". Zwei Fehler darin:

1. Die Zahl stammte aus einer Messung gegen **unseren Payload** (Port 4174), nicht gegen die echte Quelle.
2. Ich hatte `getAnimations()` nach 4 Sekunden gezählt — da sind die Animationen längst fertig (**0**). Die 333 waren eine Momentaufnahme bei 1,5 Sekunden.

**Richtig gemessen** (gleiche Methode, realistisches Scrollen mit 60-px-Schritten):

| | Quelle | Unser Payload |
|---|---|---|
| `element.animate()` beim Laden | **119** | 105 |
| nach dem Scrollen | **391** | 377 |
| davon beim Scrollen ausgelöst | **272** | 272 |
| unsichtbare Elemente danach | 191 | 191 |
| mit Weichzeichner danach | 1 | 1 |

**Quelle und Payload verhalten sich identisch.** Die Animationen sind also nicht „im Payload versteckt", sie laufen in beiden Fällen — nur unser **Baum** (Port 4188) hat sie nicht.

---

## 2. Die drei Wege, an die Daten zu kommen — geprüft

### Weg A: Das Bundle lesen — **funktioniert nicht**

Der Payload ist **eine 2,97-MB-Datei**, ohne Sourcemap. Was darin steht:

| Marker | Treffer |
|---|---|
| `layoutId` | 1.133 |
| `transition` | 696 |
| `spring` | 218 |
| `bounce` | 201 |
| `delay` | 231 |
| `stiffness`+`damping` als Paar | **6** |
| `{type:"spring"…}`-Objekte | **12** |

Die 12 Transition-Objekte sind **Bibliotheks-Defaults**, keine Seitenkonfiguration. Die tatsächlich pro Element eingestellten Werte stehen **nicht** als lesbare Objekte im Bundle — sie werden aus Komponenten-Props zusammengesetzt, und nach dem Minifizieren ist `{stiffness:100,damping:10}` von `{a:100,b:10}` nicht mehr zu unterscheiden.

**Fazit: Weg A ist eine Sackgasse.** Man kann nicht „den Animationscode heraussuchen", weil er dort nicht als Code steht.

> **Nachtrag 26.10.2026:** Sackgasse fuer die *Seiten*konfiguration — aber nicht
> fuer die **Feder**. Jede Framer-Seite bringt `var animator = {…}` mit (hier:
> 11 KB, vier Methoden), und `spring()` darin ist der Rechner, der aus
> `stiffness`/`damping`/`mass` die Kurve baut. In Node geladen und gegen die live
> gemessene Kurve gehalten: Abweichung 0,0000. Der Rechenkern ist also lesbar,
> nur die Absicht pro Element nicht. Eingebaut in `packages/framer-import/src/spring.ts`
> (siehe `docs/fahrplan-framer-import.md`, U5e).

### Weg A2: Der Code-Export von Framer — **geht nicht (kostenpflichtig)**

Das Unframer-MCP bietet `exportReactComponents`: es gibt einen CLI-Befehl aus, der
die Komponenten als React-Code herunterlädt. Framer selbst bietet keinen
Code-Export an. **Geprüft am 26.10.2026** gegen das Projekt
`437ca015ad378ce5`: der Aufruf antwortet

> „No active React Export subscription found. […] please purchase a subscription"

Ein Abo des Plugins ist also Voraussetzung. Damit ist der Weg fuer dieses Projekt
zu, ohne dass er technisch falsch waere. (Der `animator`-Weg oben braucht kein Abo.)

### Weg B: Das statische JSON (`__framer__appearAnimationsContent`) — **nur die Hälfte**

Das ist der Weg, den unser Import schon geht. Er liefert die **Entry-Animationen** (8 auf dieser Seite), aber:

- **Scroll-Reveals stehen nicht darin.** Das bestätigt auch `Niranjan266/unframer` in seiner README ausdrücklich: *„Only entry animations are declarative. Scroll reveals, hover variants, tickers and accordions live inside the compiled React bundle."*
- **Hover, Accordion, Karussell, Parallax** ebenfalls nicht.

**Fazit: Weg B ist nötig, aber nicht hinreichend** — genau deshalb fehlen unserem Baum die 91 Wort-Einblendungen.

### Weg C: Am laufenden Browser abgreifen — **funktioniert vollständig**

Der Browser bekommt jede Animation über eine von zwei APIs. Beide lassen sich abfangen:

| API | Wer nutzt sie | Was sie liefert |
|---|---|---|
| `Element.prototype.animate(kf, opts)` | Motion/`whileInView`, Komponenten-Animationen | Keyframes **und** Timing |
| `animator.startOptimizedAppearAnimation(el, prop, frames, opts)` | Framers optimierte Entry-Animation | **vorgesampelte** Frames (101 Stück je Eigenschaft) |

Zusätzlich ist `window.animator` greifbar, sobald die Runtime läuft — mit genau vier Methoden:

```
animateAppearEffects · getActiveVariantHash · spring · startOptimizedAppearAnimation
```

**Das ist der Schlüssel.** Framer rechnet die Spring-Kurve selbst aus und übergibt dem Browser **fertige Zwischenwerte als CSS-Strings**. Man muss keine Physik nachbauen, keine Feder lösen, nichts raten.

---

## 3. Was der Abgriff liefert — die echten Daten

**391 Animationen**, davon 272 beim Scrollen. Nach dem Entfernen der Geräte-Kopien (Framer schreibt jede Breakpoint-Variante ins DOM und versteckt sie): **98 animierte Elemente**.

Eine vollständige Wort-Einblendung, wörtlich aus dem Abgriff:

```json
{
  "tag": "SPAN", "text": "Run",
  "duration": 1100, "delay": 200,
  "easing": "linear(0, 0.0034, 0.0128, 0.0273, 0.0459, …)",
  "frames": {
    "filter":    ["blur(12px)", "blur(0px)"],
    "opacity":   [0.001, 1],
    "transform": ["translateX(0px) translateY(28px) scale(1) rotate(0deg) skewX(0deg) skewY(0deg)",
                  "translateX(0px) translateY(0px) scale(1) rotate(0deg) skewX(0deg) skewY(0deg)"]
  }
}
```

Drei Dinge daran sind entscheidend:

1. **Die Werte sind bereits CSS.** Keine Übersetzung nötig — `blur(12px)` geht direkt in `@keyframes`.
2. **Das Easing ist eine fertige CSS-`linear()`-Kurve.** Framer hat die Feder schon gelöst und als Kurve abgetastet. `linear()` ist seit 2023 in allen grossen Browsern. 283 von 299 Kurven liegen so vor; nur 5 sind `cubic-bezier`, 11 sind blankes `linear`.
3. **Der Versatz ist messbar:** Delays in **50-ms-Schritten** (50, 100, 150, … 700). Das ist die Staffelung der Wörter.

### Wie stabil ist der Abgriff?

Der Abgriff brauchte **sieben Anläufe**, und jeder Fehlschlag hatte dieselbe Ursache: **man darf im Wrapper nichts lesen.** Nicht den Pfad, nicht `getComputedStyle`, nicht einmal einen JSON-Rundlauf. Die Runtime ist mitten im Rendern; jede Leseoperation kann den Abgriff komplett verstummen lassen (gemessen: 0 statt 119 Einträge).

Was funktioniert:

```ts
Element.prototype.animate = function (keyframes, options) {
  log.push({ el: this, keyframes, options });   // NUR das
  return original.call(this, keyframes, options);
};
```

Alles andere wird **nach** dem Abgriff in einem Durchgang gelesen. Damit: 391 von 391, stabil über mehrere Läufe.

---

## 4. Der Beweis, dass es 1:1 geht — und wo er noch scheitert

Ich habe aus den 98 abgegriffenen Elementen **98 `@keyframes`-Blöcke (56 KB CSS)** gebaut. Die Übersetzung ist mechanisch:

```css
@keyframes framer-0 {
  0%   { filter:blur(12px); opacity:0.001; transform:translateY(28px); }
  50%  { … }
  100% { filter:blur(0px);  opacity:1;     transform:none; }
}
[data-senify-framer="0"] {
  animation: framer-0 1100ms linear(0, 0.0034, 0.0128, …) 200ms both;
}
```

**Der Test im Ruhezustand zeigt keinen Unterschied** — und das ist richtig so: im Ruhezustand sieht jede Einblendung gleich aus (`opacity:1`, kein Blur). Animationen kann man nur **mitten in der Bewegung** vergleichen.

Der Vergleich bei 700 ms nach dem Laden zeigt den echten Unterschied:

| | Quelle | Baum heute |
|---|---|---|
| Opacity der 8 Wörter | `0.87, 0.82, 0.75, 0.66, 0.55, 1, 0.42, 0.27` | `1, 1, 1, 1, 1, 1, 1, 1` |
| animierte Elemente | 0 (CSS), 119 (WAAPI) | 209 |
| Pixel-Unterschied Hero | — | **5,08 %** |

**Die Quelle blendet jedes Wort einzeln ein. Unser Baum blendet den ganzen Container als Block ein.** Das ist der Grund, warum die Bewegung fehlt — nicht die Dauer, nicht das Easing: die **Granularität** ist falsch.

### Warum das so ist

Unser Import faltet die Wort-Spans zu **Inline-Markup** (`inlineOf` in `mapper.ts`): aus `<h1><span>Run</span><span>Your</span>…</h1>` wird `props.html = "<span>Run</span> …"`. Der Knoten verschwindet, und mit ihm sein Animationsziel. Im vorigen Schritt habe ich die Bewegung deshalb auf den **nächsten gemappten Vorfahren** gehängt (den `h1`) — richtig als Notlösung, aber es ist genau der falsche Effekt: eine Einblendung statt acht.

**Die Struktur ist übrigens da:** der gebackene `h1` enthält **8 Spans**, genau wie die Quelle. Sie sind nur nicht als Knoten adressierbar.

---

## 5. Der Weg, der jetzt zu bauen ist

Drei Bausteine, jeder einzeln belegt:

**1. Abgriff als Import-Option (`capture: "browser"` + Motion-Sonde).**
Die Sonde existiert im Repo (`packages/framer-import/probes/motion-probe.mjs`), sie sammelt WAAPI bereits ein — aber `samplesOfProbe` verwirft alles ausser Loops und Scroll-Timelines. Das ist die Zeile, die 391 Animationen wegwirft. Sie muss die vollständigen Keyframes behalten.

**2. Zuordnung Element → Knoten.**
Nicht über die Reihenfolge (scheitert an den Geräte-Kopien und an zwei Animationen je Element), sondern über den **DOM-Pfad** (`nth-child`-Kette) plus einen **Sichtbarkeitsfilter** nach dem Abgriff. Gemessen: 391 → 386 sichtbar → 98 Elemente.

**3. Wort-Spans als Knoten erhalten.**
Der eigentliche Hebel. Solange `inlineOf` die Wörter verschluckt, kann keine Wort-Einblendung greifen. Zwei Möglichkeiten:
- **a)** Ein `span` mit eigenem Startzustand wird **nicht** gefaltet, sondern bleibt ein Kind-Knoten mit `display:inline`.
- **b)** Der Baum behält die Inline-Form, aber die Animation läuft über `:nth-child` auf den Spans im `html`-Prop.

**(a)** ist der saubere Weg und passt zum Editor (jedes Wort wäre anwählbar). Es ist aber ein Eingriff in den Mapper, der die Textdarstellung anfasst — dort liegt der grösste Teil der bestehenden Tests. **(b)** ist billiger, aber die Animation hängt dann an Markup, das der Editor nicht kennt.

---

## 6. Ehrliche Grenzen

- **Was der Abgriff nicht kann:** Er braucht einen Browser und eine erreichbare Seite. Für einen reinen SSR-Import ohne Netz bleibt es beim statischen JSON.
- **Hover-Zustände** erscheinen nur, wenn man sie auslöst. Der Abgriff müsste die Seite zusätzlich durchfahren (jedes `a`, jeder `button`).
- **`linear()`-Easing** braucht einen modernen Browser (seit 2023). Ältere zeigen den Effekt ohne die Feinheit der Feder — nicht kaputt, nur gröber.
- **Der Abgriff ist eine Messung, keine Kopie des Quellcodes.** Er liefert das Verhalten, nicht die Absicht. Wer die Dauer später im Editor ändert, ändert eine Zahl, die aus einer Messung stammt — das steht dann im Bericht.

---

## 7. Was ich als Nächstes baue

In dieser Reihenfolge, jeder Schritt mit Messung:

1. `samplesOfProbe` so erweitern, dass vollständige Keyframes mitkommen (nicht nur Loops).
2. Die Wort-Spans als Knoten erhalten (Weg **a**), damit 91 Einblendungen ein Ziel haben.
3. Den Abgriff in den Import hängen und die 98 Keyframe-Blöcke backen.
4. Messen: Hero bei 700 ms und 1200 ms, Wort-Opacities gegen die Quelle.

**Erwartung, ehrlich:** Der Hero sollte von „alle Wörter sofort auf 1" auf die gestaffelte Kurve der Quelle kommen. Ob die Pixel-Differenz insgesamt sinkt, ist offen — sie wird an anderen Stellen (Icons, Navigation) dominiert. Der **sichtbare** Gewinn ist die Bewegung selbst, und die ist mit diesem Weg erreichbar.
