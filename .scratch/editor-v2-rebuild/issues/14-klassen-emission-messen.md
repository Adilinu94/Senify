# Editor v2 - Klassen-Emission messen: regional vs. global (B8)

Status: **erledigt (19.09.) — Entscheidung: global umgestellt, gemessen 4,2–8,2x Ersparnis.**
Nachtrag 18.09. (O13/ADR-0005): die Entscheidung war teilweise erzwungen.
Mit `kind: "ambient"` (freie Selektoren wie `h1 > span`, `.card:hover::after`) gibt es Regeln, die
**gar keinen** Knotenanker haben koennen — globale Emission ist fuer sie Pflicht. Die Messung
entscheidet damit nur noch fuer `kind: "class"`, und die Frage verschiebt sich: eine einheitliche
globale Emission fuer beide Arten ist einfacher zu erklaeren als zwei Strategien nebeneinander.
Das Byte-Kriterium unten bleibt, bekommt aber diesen Zusatz als Argument fuer „global".
Abhaengig von: 07-style-rule-modell (Regeln mit `order` als Datum)
Muss liegen: VOR dem Inspektor-Bau (Ergebnis bestimmt, was Ticket 02 im Style-Tab
„Klasse bearbeiten" an Emission garantiert)
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B8

## Ergebnis (19.09.)

Messung: `.scratch/editor-v2-rebuild/pruef-klassen-emission.mjs`, Bericht
`.scratch/refs/klassen-emission.md` + `.json`. Drei Dokumente (a: 30 Knoten/1 Klasse/20
Deklarationen, b: 120/6/15, c: Hero 15/3/40), `compileCssReport` ueber beide Strategien,
Korrektheitsprobe (gleiche Deklarationen je Traeger) gruen.

| Dokument | regional | global | Verhaeltnis |
|---|---|---|---|
| a | 16.295 B / 30 Klassenregeln | 1.987 B / 1 | **8,2x** |
| b | 54.867 B / 120 Klassenregeln | 8.356 B / 6 | **6,57x** |
| c | 15.185 B / 15 Klassenregeln | 3.590 B / 3 | **4,23x** |

Kriterium („bei b mehr als ~2x regional -> global") deutlich erfuellt -> **global umstellen**.

**Umgesetzt:** `compileCss` emittiert Klassenregeln global (`classEmission: "global"` ist
Default, `"regional"` bleibt als Option und Rueckweg). `globalClassSelector` in
`cascade.ts`; die Emission folgt der Regel-Reihenfolge des Dokuments (`order`, Ticket 07),
nicht mehr der Knoten-Reihenfolge. Knoten-eigene Zustaende bleiben verankert
(`[data-node-id].cls:hover`), weil `.cls` (0,1,0) gegen `[data-node-id]:hover` (0,2,0) sonst
verloere (O1). Golden-Snapshots und betroffene Tests aktualisiert; neue Testdatei
`packages/widget-engine/test/css-class-emission.test.ts`.

**Entscheidung eingetragen:** `map.md` O15.

**Nebenbefund (gleicher Lauf):** `packages/app/test/editor-browser.test.ts` klickte im
Live-Modus auf die erste Section — nach dem DnD das Banner mit `/kontakt`-Link, was den
Frame wegnavigierte (404 im Fehler-Tracker). Der Klick geht jetzt auf den linkfreien
Divider; kein Produktfehler, ein Testfehler (Klickziel war nie als Link gedacht).

## Ziel

`classSelector` (cascade.ts) emittiert Klassenregeln JE tragendem Knoten:
`[data-node-id="a"].cls { … }`, `[data-node-id="b"].cls { … }`, … Das kauft die triviale
Kaskadengeschichte (gleiche Spezifität wie State-Regeln, Gewinn per Quellordnung), kostet
aber Bytes bei klassengetriebenen Seiten: eine Klasse auf 40 Knoten = 40 Regeln.
Instatic emittiert dagegen globale `.cls`-Regeln einmalig und löst die State-Spezifität
über doppelte Selektoren. Beide Wege sind legitim — die Entscheidung soll auf einer
MESSUNG fallen, nicht auf Geschmack, und zwar bevor UI-Code Emission-Garantien annimmt.

## Umfang

1. Mess-Skript (pruef-Muster, flüchtige Instanz): drei repräsentative Dokumente bauen —
   (a) 30 Knoten, 1 Klasse mit 20 Deklarationen; (b) 120 Knoten, 6 Klassen à 15
   Deklarationen; (c) hero-artige Seite, 3 Klassen, je 40 Deklarationen, 15 Knoten.
2. Für jedes Dokument: `measureCss` über beide Emissionsstrategien —
   - **regional (heute):** `[data-node-id].cls` je Knoten;
   - **global:** einmalige `.cls`-Regel; Spezifität der class-Stufe bleibt über die
     Regel-Reihenfolge (`order` aus Ticket 07) garantiert, weil base < device < state <
     class die Stufenordnung trägt und Klassen untereinander per `order` sortieren.
3. Korrektheitsprobe je Strategie: gleiches Bild, gleicher Paritäts-Check
   (Canvas vs. Bake innerhalb der Toleranz) — die Strategie darf das Tor nicht lockern.
4. Entscheidung als Eintrag in map.md (O-Reihe): regional BEHALTEN oder global UMSTELLEN.
   Kriterium: bei (b) mehr als ~2x Bytes regional -> global umstellen; sonst regional
   behalten (einfachere Spezifitäts-Geschichte).

## Falls global umgestellt wird

- `compile.ts`: class-Stufe emittiert `.cls` einmalig (Dedupe über Regelnamen); die
  Knoten-Ankerung entfällt. `classSelector` bleibt als API (State-Emission braucht
  weiterhin den Knoten-Anker für den doppelten Selektor).
- Ticket 07s `order` wird zur alleinigen Ordnungsquelle der class-Stufe.
- Golden-Snapshots aktualisieren.

## Abnahme

- Messbericht mit Zahlen je Dokument und Strategie (Bytes, Regelzahl) liegt unter
  `.scratch/refs/`.
- Entscheidung ist in map.md eingetragen, mit Begründung und Messbeleg.
- Paritäts-Tor gruen unter der gewählten Strategie; `pnpm test` gruen.
