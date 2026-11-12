# ADR-0034: Übergangszeit der Hover-Zustände aus dem Browser-Capture

**Status:** Angenommen, 12.11.2026
**Betrifft:** `packages/framer-import/src/capture-hover.ts`
**Ergänzt:** ADR-0033

## Kontext

ADR-0033 misst den Endwert eines Laufzeit-Hovers. Die Framer-Laufzeit gleitet aber dorthin, obwohl das CSS
`transition-duration: 0s` hat. Der Import ließ den Hover springen.

Gemessen am 12.11.2026 mit `.scratch/motion-import/hover-uebergang-probe.mts` an sechs öffentlichen Framer-Quellen
(Zwischenwerte nach 30, 120 und 500 ms):

- Fünf von sechs Quellen haben Hover-Knoten; die sechste (`yeuxtest`) hat keine Kandidaten.
- Bei allen fünf gleitet mindestens ein Hover-Knoten (Hintergrund, Transform, Deckkraft). Bei vier Quellen läuft das über
  die Laufzeit trotz `transition-duration: 0s`; bei `wedge` über ein echtes CSS-`transition: 0.3s`. Farbwechsel von
  Textlinks springen dagegen innerhalb von 30 ms (`distinct-assistant`, `donutshop`).
- Der Capture friert CSS-Übergänge ein und liest dabei `none`; eine deklarierte Dauer ist im IR daher nie sichtbar.

Der Sprung unterscheidet sich also sichtbar vom Original, und er kommt oft vor.

## Entscheidung

1. **Messung:** Nach dem Hover wird alle 40 ms gelesen (vorher: ein Wartepunkt, dann Lesen bis zur Ruhe). Die Gleitdauer
   ist die Zeit vom ersten bis zum letzten beobachteten Wertwechsel der eigenen Eigenschaften. Die Verzögerung vor dem
   ersten Wechsel (an der Relay-Quelle 100 bis 160 ms) fließt nicht ein.
2. **Sprung:** Liegt zwischen erstem und letztem Wechsel weniger als 80 ms (zwei Leseschritte), springt der Wert; es
   entsteht keine Übergangszeit.
3. **Rundung:** auf 50 ms, begrenzt auf 100 bis 1000 ms.
4. **Ablage:** als `transition: <Eigenschaft> <ms>ms ease` für die gemessenen Hover-Eigenschaften im Basisstil des
   Desktop-Zustands. Der Baker schreibt es in das normale CSS.
5. **Vorrang:** Eine `transition` aus dem Stylesheet gewinnt. `none` zählt nicht als Aussage, weil der eingefrorene
   Capture es überall liest.
6. **Kurve:** immer `ease`. Die Laufzeit nutzt Federn; deren Kurve wird nicht abgeleitet.

## Folgen

- Gemessen am 12.11.2026 mit `.scratch/motion-import/hover-capture-probe.mts`: Relay 350 bis 400 ms für die vier Knöpfe
  und 200 ms für den Absende-Knopf, Donutshop 500 bis 550 ms für die drei Social-Knöpfe. Textlinks ohne Zwischenwerte
  bekommen keine Übergangszeit.
- Die gemessene Dauer liegt etwas über der Handmessung der Relay-Quelle (letzter Wertwechsel 214 bis 457 ms), weil die
  Abfrage selbst Zeit braucht und die Federn lange kaum sichtbar auslaufen. Der Wert ist eine Näherung, kein Original.
- Kosten: etwa dieselben wie in ADR-0033 (Lesen alle 40 ms statt eines Wartepunkts).
- Offen: Kurve (Feder statt `ease`), Verzögerung, Eltern-Hover mit Kindern, Tablet/Mobil und Touch.
- Belegt durch `packages/framer-import/test/capture-hover.test.ts` (Skript-Animation mit 500 ms: Dauer zwischen 400 und
  600 ms; Sprung ohne Dauer; vorhandene `transition` bleibt; `transition` im gebackenen CSS).
