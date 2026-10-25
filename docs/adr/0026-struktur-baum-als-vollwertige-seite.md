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

**Was das nicht löst.** Der Baum trägt weiterhin **keine** Bewegung: keine Scroll-Choreografie,
kein Lenis, kein three.js. Wer den Payload abschaltet, bekommt eine **stehende** Seite, die
richtig aussieht. Das ist der bewusste Preis und der Grund, warum der Payload Standard bleibt.

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
