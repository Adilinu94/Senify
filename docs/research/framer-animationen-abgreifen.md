# Wie man an Framer-Animationsdaten kommt — und wie sie 1:1 eingebaut werden

> **Dokumenttyp:** Rechercheergebnis mit Messungen, 26.10.2026.
> **Frage:** Wie kommt man an den Code der Framer-Animationen, und wie baut man sie exakt nach?
> **Antwort in einem Satz:** Nicht durch Dekompilieren — durch **Abgreifen am laufenden Browser**. Framer muss jede Animation der Browser-API übergeben; dort ist sie vollständig und in CSS-Werten lesbar.

**Nachtrag 26.10.2026, nach dem Bau:** Der Weg ist gebaut und gemessen. Der
Abschnitt „Was gebaut ist" am Ende nennt die Belege; die Abschnitte 1–7 sind der
Recherchestand davor und bleiben als Begründung stehen.

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

> **Nachtrag 26.10.2026:** Sackgasse für die *Seiten*konfiguration — aber nicht
> für die **Feder**. Jede Framer-Seite bringt `var animator = {…}` mit (hier:
> 11 KB, vier Methoden), und `spring()` darin ist der Rechner, der aus
> `stiffness`/`damping`/`mass` die Kurve baut. In Node geladen und gegen die live
> gemessene Kurve gehalten: Abweichung 0,0000. Der Rechenkern ist also lesbar,
> nur die Absicht pro Element nicht. Eingebaut in `packages/framer-import/src/spring.ts`
> (siehe `docs/fahrplan-framer-import.md`, U5e).

### Weg A2: Der Code-Export von Framer — **geht nicht ohne Abo (geprüft)**

Das Unframer-MCP bietet `exportReactComponents`: es gibt einen CLI-Befehl aus, der
die Komponenten als React-Code herunterlädt. Framer selbst bietet keinen
Code-Export an. **Geprüft am 26.10.2026** gegen das Projekt `437ca015ad378ce5`:
der Aufruf antwortet

> „No active React Export subscription found. […] please purchase a subscription"

Ein Abo des Plugins ist also Voraussetzung. Damit ist der Weg für dieses Projekt
zu, ohne dass er technisch falsch wäre. (Der `animator`-Weg oben braucht kein Abo.)

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

## 7. Was gebaut ist — mit Belegen

Alle vier Schritte sind gebaut und gemessen. Die Zahlen stammen aus einem
Import von `rare-works-510047` gegen die lokale Payload-Vorschau (Port 4174),
Stand 26.10.2026.

### Der Abgriff

`instrumentMotion()` in `probes/motion-probe.mjs` schreibt jede Animation mit,
die die Seite startet, und liest sie **nach** dem Settle aus. Zwei Wege:

| Weg | Was er sieht |
|---|---|
| `Element.prototype.animate` (Wrapper) | Motion/`whileInView`, Framer-Komponenten |
| `window.animator` (Property-Falle) | Framers vorgesampelte Entry-Frames |

Im Wrapper steht **nur** `log.push({el, keyframes, options})` — kein Lesen, kein
JSON, kein DOM-Walk. Das war die Lehre aus sieben Fehlschlägen.

### Die Zuordnung

Die Sonde nimmt den IR-Schlüssel, den `senifyStampKeys()` auf das Element
schreibt (`n4`), sonst den `nth-child`-Pfad. Gemessen: **376 von 376**
aufgezeichneten Animationen tragen einen Schlüssel.

**Der Stempel-Zeitpunkt ist entscheidend.** Beim `load`-Ereignis hat Framer die
Seite noch nicht gebaut:

| Wartezeit vor dem Stempeln | gestempelte Knoten | mit Schlüssel |
|---|---|---|
| **0 ms** (nach `load`) | **3** | **0** |
| 500 ms | 3072 | 376 |
| 3000 ms | 3128 | 376 |

Der Capture scrollt deshalb erst durch die Seite, wartet, und stempelt dann.
Ohne diese Reihenfolge hatte jede gemessene Animation ihr Ziel verloren
(376 aufgezeichnet, 0 zugeordnet).

### Die gemessenen Einblendungen als CSS

`appearSpecsOfProbe()` übersetzt die gemessenen Frames in den Appear-Kanal —
dieselbe Form, die das statische JSON liefert. Der Compiler baut daraus
`@keyframes`. Gemessen: **67 Regeln** mit der echten `linear()`-Kurve.

Eine gebackene Regel, wörtlich:

```css
.fi-8a5eda-appear-173 {
  animation: senify-appear-n4-default 0.88s linear(0 0%,0.0497 1.1236%,…,1 100%) 0s both;
}
@keyframes senify-appear-n4-default {
  from { opacity:0.001; transform:translateY(-16.98px) }
  to   { opacity:1;     transform:none }
}
```

**Ein Fehler auf dem Weg dorthin:** Die Sonde schnitt den `easing`-String bei
120 Zeichen ab. Eine Framer-Kurve hat 140 Stützstellen und ~1400 Zeichen; die
gekürzte Kurve endete bei 7,95 % statt bei 100 % — ein Wert, den CSS verwirft.
Alle 67 Deklarationen fielen als `invalid-value` weg. Ohne diese eine Zeile
bleibt jede gemessene Animation unsichtbar.

### Was noch offen ist: die Granularität

~~Die 68 **Wort**-Einblendungen der Überschriften fallen weiterhin auf ihren
nächsten Vorfahren (den Container), weil `inlineOf` die Wort-Spans zu
Inline-Markup faltet.~~ **Gebaut am 26.10.2026.** Die Wörter tragen jetzt ihre
eigene Klasse im Markup (`senify-inline-<id>`) und je eine eigene Animation mit
ihrem eigenen Delay. Gemessen an der gebackenen Seite, 300 ms nach dem Laden:

| Wort | Animation | Opacity bei 300 ms |
|---|---|---|
| Run | `senify-appear-derived-1-default` | 0.85 |
| Your | `senify-appear-derived-2-default` | 0.77 |
| Money | `senify-appear-derived-3-default` | 0.67 |
| From | `senify-appear-derived-4-default` | 0.52 |

Das ist die Kaskade der Quelle (50 ms Versatz, gemessen: `derived-2` läuft
`0.05s` später als `derived-1`). Vorher standen alle acht Wörter auf `1`.

**Drei Stellen mussten zusammenkommen:**

1. `inlineOf`/`attachInlineReveals` schreibt die Klasse auf den `<span>` im
   Markup — und lässt eine Überschrift aus Wort-Spans eine Überschrift bleiben
   (vorher wurde sie ein `body` und verlor Level und Staffelung).
2. Der Sanitizer (`inline-html.ts`) erlaubt genau diese eine Klasse. Ohne das
   fiel sie beim Rendern wieder heraus, und die Regel traf nichts.
3. Der Compiler (`compile.ts`) gibt eine Regel aus, deren Klasse nur im Markup
   steht und keinen Trägerknoten hat. Vorher verwarf er sie stillschweigend.

### Der Startzustand: der Zeitpunkt entscheidet

Framer schreibt den Startzustand jeder Einblendung ins HTML
(`opacity:0.001; filter:blur(12px); transform:translateY(28px)`) und animiert
ihn weg. Der Import leitet die Wort-Animation aus genau diesem Attribut ab.
Gemessen an der Seite:

| Zeitpunkt | Seite | Startzustände |
|---|---|---|
| direkt nach `load` | 5 KB Gerüst | 0 |
| 350 ms nach `load` | 1 MB, 93 Spans | **98** |
| nach dem Settle (3 s) | 1 MB | 0 (die Spans lesen `opacity:1`) |

Der Capture sammelt sie bei 350 ms ein und schreibt sie am Ende auf **dieselben
Elementobjekte** zurück. Ein IR-Schlüssel taugt dafür nicht: Framer tauscht beim
Hydratisieren Knoten aus — derselbe Span trug bei 350 ms `n100` und nach dem
Scrollen `n62` (gemessen). Eine direkte Referenz überlebt das.

### Der Unterschied, den es macht

| | vorher | nachher |
|---|---|---|
| Animations-Samples im IR | 1 (nur der IO-Hinweis) | **113** |
| davon mit Knoten | 0 | **112** |
| `@keyframes` mit gemessener Kurve | 0 | **67** |
| Wort-Einblendungen mit eigener Klasse | 0 | **90** |
| Icon-Glyphe | `rgb(0,0,0)` | `rgb(255,255,255)` |
| „One Panel" | `rgb(20,20,20)` | `rgb(0,102,255)` |
| Hero-Unterschied bei 1200 ms | 5,62 % | **0,01 %** |

Der Pixelwert im Ruhezustand bewegt sich kaum (1440 px: 10,25 % vorher,
10,29 % nachher) — im Ruhezustand sehen alle Einblendungen gleich aus. Der
Unterschied liegt in der Bewegung, und die ist jetzt da.
