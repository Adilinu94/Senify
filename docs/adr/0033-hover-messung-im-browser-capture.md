# ADR-0033: Hover-Zustände aus dem Browser-Capture

**Status:** Angenommen, 11.11.2026
**Betrifft:** `packages/framer-import/src/capture-hover.ts`, `packages/framer-import/src/capture-browser.ts`

## Kontext

Framer schaltet Hover-Varianten in der Laufzeit um, nicht im Stylesheet. An der Relay-Quelle
ändern 5 von 28 Links und Knöpfen beim Hover ihre Darstellung, das gebaute CSS enthält 0 `:hover`-Regeln.
Der statische Capture liest nur Stylesheet-Pseudozustände und sieht diese Zustände nicht.
Der Weg danach ist vorhanden: `IrInteraction`, `StyleRule.states`, der Baker schreibt `:hover`.

## Entscheidung

Der Browser-Capture hovert Kandidaten (`a[href]`, `button`, `[role=button]` in `#main`, höchstens 40)
und legt die gemessene Differenz als `interactions.hover` am Desktop-Zustand des Knotens ab.
Die vier offenen Fragen aus Issue 08 sind klein entschieden:

1. **Eigenschaften:** feste Liste `color`, `background-color`, `border-color`, `opacity`, `transform`,
   `box-shadow`, `text-decoration-line`, `filter`. Eine Eigenschaft zählt nur, wenn sie sich beim Hover
   ändert und vorher zweimal im Abstand von 80 ms gleich war. Selbst animierte Elemente (Puls, Marquee)
   liefern so keinen falschen Hover. Es wird keine Übergangszeit abgeleitet; der Hover springt.
2. **Zuordnung:** über den IR-Schlüsselstempel (`senifyStampKeys`), der nach dem Auslesen von Markup und
   CSS erneut gesetzt wird, weil Hovern die Laufzeit Varianten umschalten lässt und danach kein Markup mehr
   gelesen wird.
3. **Eltern-Hover:** ändern sich beim Hover nur Kinder, entsteht ein `info`-Befund
   (`unsupported-declaration`) am Elternknoten. `.eltern:hover .kind` wird nicht gebaut.
4. **Geräte:** nur Desktop, gemessen bei der Capture-Breite. Kein `(hover: hover)`-Schutz.

Eine Regel aus dem Stylesheet gewinnt: die Messung ergänzt nur Eigenschaften, die das Stylesheet nicht nennt.
Mit `hover: "off"` entfällt der Durchlauf (etwa 0,7 s je Kandidat).

## Folgen

- Gegen die Relay-Quelle liefert der Capture dieselben 5 Knoten wie die Handmessung.
- Offen: Übergangszeit, Eltern-Hover mit Kindern, Tablet/Mobil und Touch.
- Der Ausgangspunkt der Maus (Ecke 1,1) kann selbst ein Hover-Ziel sein; ein Element dort zeigt keinen Unterschied.
- Belegt durch `packages/framer-import/test/capture-hover.test.ts` (lokale Seite, Laufzeit-Stil per Skript,
  Pipeline bis ins gebackene `:hover`-CSS).
