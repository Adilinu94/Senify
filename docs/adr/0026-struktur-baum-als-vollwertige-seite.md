# Der Struktur-Baum ist die vollwertige Seite, der Payload nur eine Zugabe

Status: angenommen · 25.10.2026
Bezug: ADR-0010 (Island-Payload), ADR-0025 (CMS-Daten als Handover-Skript),
`packages/framer-import/src/capture-html.ts`, `packages/renderer/src/bake.ts`

**Problem.** Zwei Zusagen stehen nebeneinander, und bis heute schlossen sie sich aus:

1. Die importierte Seite sieht aus **wie das Original** — dafür sorgt der Payload (ADR-0010).
2. Man kann die Seite **im Editor ändern** — dafür braucht es den Struktur-Baum.

Der Payload gewinnt. `renderTreeOf` in `packages/renderer/src/bake.ts` ersetzt den
Struktur-Baum durch den Träger, sobald ein Payload ausgeliefert wird:

```ts
return { rootNodeId, nodes: { [rootNodeId]: { …root, children: [delivered] }, [delivered]: carrierNode } };
```

**Gemessen (25.10.2026, `rare-works`).** Eine Überschrift im Baum auf „GEÄNDERT IM EDITOR"
gesetzt, gebacken, im Browser gesucht: **nicht vorhanden.** Der Baum ist dann eine Karte der
Seite, nicht die Seite.

Der Ausweg war der Schalter „Deckt die Seite ab" (`coversPage`). Ausgeschaltet greift der Baum —
und die Seite war unbrauchbar:

| | mit Payload | Struktur-Baum (vorher) |
|---|---|---|
| Aussehen | 0,00 % Abweichung | Hero-Überschrift ein grauer Fleck |
| Sichtbare Elemente | 3.134 | 2.874 |
| Unsichtbar (`opacity < 0.05`) | 260 (wie die Quelle) | 260 + 92 verwaschene Wörter |
| `blur(`-Regeln im Release | 92 | 92 |
| Kaputte Bilder | 0 | 13 |

**Ursache 1: `filter` fehlte in der Liste der Startzustände.** Framer schreibt die wortweise
Einblendung an *jedes Wort*:

```html
<span style="display:inline-block;opacity:0.001;filter:blur(12px);transform:translateY(28px)">Run</span>
```

Der Capture kannte `opacity`, `transform` und `will-change` als Startzustand — `filter` nicht.
Also blieb der Weichzeichner als **Dauerzustand** stehen, während `opacity` und `transform`
korrekt verschwanden: die Wörter wurden sichtbar, aber unscharf. Zwei Stellen tragen die Liste
(`START_STATE_PROPERTIES` und `ohneStartzustaende`); beide kennen jetzt `filter`.

**Ursache 2: der Rohtext behielt nichts.** `inlineOf` fiel auf `escapeHtml(fallback)` zurück,
wenn ein Textknoten keine Elementkinder hatte — dort stand der reine Text ohne Auszeichnung.
Das ist richtig so (der Text kommt aus dem Knoten), aber es hiess: eine Überschrift, deren Wörter
als *getrennte* `span`-Knoten ankommen, hatte gar kein `innerHtml`, und der Weichzeichner blieb
am Kindknoten hängen. Der Fix an Ursache 1 greift deshalb an beiden Wegen.

**Entscheidung.** Der Struktur-Baum wird die **vollwertige** Seite; der Payload bleibt die Zugabe
für das, was nur er kann (Lenis, three.js, Scroll-Choreografie, Canvas). Konkret:

1. **Ein Startzustand ist kein Aussehen.** `opacity`, `transform`, `will-change` und `filter`
   wandern nach `appearInitial`, wenn die Quelle sie als Zustand *vor* einer Animation schreibt.
   Erkennungsmerkmal bleibt der Zustand selbst (`opacity ≤ 0.01` **und** bewegender Transform,
   oder `will-change: transform`, oder eine Appear-Id) — nicht ein pauschales „alles weg".
2. **Ein Weichzeichner ohne Einblendung bleibt stehen.** `filter: blur(4px)` ohne
   `opacity`/`transform` ist ein unscharfer Hintergrund, kein Startzustand. Ein pauschales
   Entfernen würde das Design der Seite zerstören; der Test hält diesen Fall fest.
3. **Der Payload bleibt der Standard.** Er liefert die Bewegung, die der Baum nicht kann. Der
   Schalter `coversPage` ist der Weg, den Baum zu sehen — und der Baum ist jetzt eine Seite,
   die man zeigen kann, keine Baustelle.

**Zweiter Fehler, der beim Messen auffiel: die Seite wuchs beim Scrollen.** Der Träger wuchs
von 0 auf 17.508 px, sobald er in den Sichtbereich kam — die Seite stand **zweimal** (17.508 →
35.016 px). Zwei Ursachen:

1. `renderTreeOf` ersetzte den Baum durch den Träger, **egal ob er aktiv war** — der Baum war
   weg, auch wenn man ihn sehen wollte. Der Aus-Zustand ist deshalb ein eigenes Feld `active`
   (Steuerelement „Aktiv", Vorgabe an), nicht `coversPage`: das beschreibt weiterhin „Seite statt
   Abschnitt". Ein inaktiver Träger fällt beim Backen aus dem Baum, und der Island-Code lädt ihn
   nicht (`packages/renderer/src/bake.ts`, `motion.ts`).
2. Danach blieb ein Zuwachs von 1.080 px: das **Poster** ist ein `loading="lazy"`-Bild ohne Höhe.
   Beim Scrollen lud es nach und schob die Seite. Ein abgeschalteter Träger wird jetzt schon beim
   Backen auf `off` gesetzt und ist `display: none` — er trägt nichts bei, auch kein Poster.

Messung danach: beide Varianten **stabil bei 17.508 px** (vorher wuchs der Baum auf 35.016).

**Der ehrliche Abstand — und warum eine einzelne Zahl hier nicht geht.** Ohne Payload sieht
der Baum so nah aus wie der Import ihn bringt. Gemessen, über je drei Aufnahmen:

| Breite | Median | Einzelwerte | Höhen |
|---|---|---|---|
| 1440 px | **10,29 %** | 7,75 / 10,31 / 10,29 | 17.508 / 17.508 |
| 900 px | **11,74 %** | 11,74 / 11,74 / 7,95 | 20.162 / 20.162 |
| 390 px | **7,55 %** | 7,55 / 7,55 / 7,55 | 20.648 / 20.648 |

**Die Spanne ist keine Nachlässigkeit, sie gehört zur Quelle.** Drei Eigenschaften der Seite
machen eine Punktzahl unmöglich, und jede davon ist gemessen:

1. **Ein Endlos-Ticker läuft dauerhaft.** Element `e80` schwingt 9 px mit einer Periode von rund
   8 s. Zwei Aufnahmen derselben Seite unterscheiden sich dadurch um **4,55 %** — die Quelle
   weicht also von sich selbst ab, nicht der Baum (der Baum: **0,01 %**). Bei 390 px läuft
   dieser Ticker nicht, und genau dort ist die Zahl stabil (0,00 pp).
2. **Die Navigation tauscht einmalig.** Beim ersten Scrollen wechselt die Quelle von
   „Desktop" (778 px) auf „Desktop Compact" (292 px) und **nie zurück** (`reducedMotion` ändert
   daran nichts). Wer vor dem Screenshot scrollt — und das muss man, damit die Lazy-Bilder
   laden — misst danach eine andere Seite als beim ersten Aufruf.
3. **Die Quelle animiert per `requestAnimationFrame`.** `document.getAnimations()` findet dort
   **0** pausierbare Animationen (der Baum: 208). Ein Einfrieren von außen ist also nicht
   möglich; nur der Median über mehrere Aufnahmen beruhigt die Zahl.

**Was das für die früheren Zahlen heißt.** Die 14,62 % waren zusätzlich **falsch gemessen**:
der Screenshot des Baums kam mit **Alpha 0** heraus, weil `global.css` keinen `body`-Hintergrund
setzte (`theme.css` deklariert nur Variablen, keine Regeln). Jeder Vergleich las damit eine weiße
Fläche gegen eine durchsichtige — `pixelmatch` zählt verschiedene Alpha-Werte als Unterschied.
Behoben in `packages/renderer/astro-template/src/styles/global.css`, Beleg
`packages/renderer/test/bake-ground.test.ts` (ohne den Fix rot). Zusätzlich trägt die Quelle
Framers **„Edit this site"-Badge** (`<iframe>`, `z-index` 2147483646) und einen schwebenden
Badge; beides ist Werkzeug der Plattform, nicht die Seite, und wird beidseitig entfernt.

**Ein Fehler, der beim Messen fast durchgerutscht wäre.** Die erste Fassung des Messskripts
pausierte die Animationen des Baums bei `currentTime = 0` — also im **Startzustand**. Jede
Einblendung ist dort `opacity:0`; der Baum wäre unsichtbar gewesen und hätte gegen eine weiße
Quelle **5,08 %** ergeben, deutlich besser als die Wahrheit. Ein schöneres Ergebnis durch eine
unsichtbare Seite ist keine Messung. Der Baum wird jetzt mit `finish()` **ans Ende** gesprungen.

**Der Weg zum Nachmessen** steht vollständig in `_messung/messung-final.ts` und
`_messung/messung-median.ts`: beide Screenshots über Weiß zusammensetzen, die Badges entfernen,
die Baum-Animationen ans Ende springen lassen, dann den Median über drei Aufnahmen nehmen. Eine
Zahl ohne ihre Spanne zu nennen wäre hier eine Behauptung, keine Messung.

**Was das nicht löst — und was inzwischen doch geht.** Der Baum trug **keine** Bewegung: keine
Scroll-Choreografie, kein Lenis, kein three.js. Der mittlere Teil davon ist inzwischen gebaut:
**die Einblendungen des Baums selbst**. Gemessen an `rare-works`: 336 Elemente tragen einen
Startzustand, nur **8** davon eine `data-framer-appear-id`. Die Ableitung lief bisher nur, wenn die
Seite **gar keinen** Appear-Kanal hatte — diese Seite hat einen (für 8 Elemente), also wurde nichts
abgeleitet und 328 Elemente blieben auf `opacity:0.001` stehen. Jetzt leitet der Import für jedes
Element ohne Kanal-Eintrag ab, inklusive **Weichzeichner** (`blur(12px)→blur(0px)`, das ist die
halbe Wort-Einblendung) und **Versatz** (50 ms zwischen gleichartigen Geschwistern, gemessen an der
laufenden Seite). Ergebnis: **212 Keyframe-Regeln statt 10**, **209 Elemente mit laufender
Animation statt 10**.

Was der Baum weiterhin **nicht** trägt: Lenis, three.js, die scroll-gesteuerten Variantenwechsel der
Quelle („Desktop Compact" ab Scroll, die Panels des Product Tour). Wer den Payload abschaltet,
bekommt eine Seite, die richtig aussieht und ihre eigenen Einblendungen spielt — aber nicht die
Scroll-Choreografie des Originals. Das ist der bewusste Preis und der Grund, warum der Payload
Standard bleibt.

**Grenze, die bleibt.** Zwei Quellen für eine Seite heissen zwei Wahrheiten. Wer im Baum ändert
und den Payload stehen lässt, sieht seine Änderung nicht. Das ist keine Lücke, die man
wegprogrammieren kann — es ist die Entscheidung, welcher Quelle man folgt. Der Editor muss sie
sichtbar machen (Schalter am Träger, Wirkung im Text daneben), nicht verstecken.

**Beleg.** Wiederholbar:

```bash
# Der Baum als Seite, mit einer Änderung darin:
pnpm exec tsx _messung/struktur-neu.ts     # 17508 px, 12 unsichtbar, 0 blur, 0 kaputte Bilder
pnpm exec tsx _messung/edit-neu.ts         # "GEÄNDERT" im gerenderten Text: JA
# Und die Original-Optik ist unberührt:
pnpm exec tsx _messung/release-all.ts https://rare-works-510047.framer.app/
# desktop 0.00% · tablet 0.00% · mobile 0.01%, state=mounted
```

Tests: `inline-style.test.ts` (7 Fälle; die zwei neuen sind ohne den Fix rot — gegengeprobt).
Die 260 unsichtbaren Elemente der Quelle bleiben unangetastet: es sind Karussell-Karten und der
Page-Loader, die auch im Original unsichtbar sind.
