# ADR-0017: Bedingung vor Herkunft, lokal vor global bei gleicher Bedingung

**Status:** Angenommen, 06.11.2026
**Betrifft:** `packages/widget-engine/src/css/compile.ts`, `packages/widget-engine/src/css/cascade.ts`, Canvas und Release-Build

## Kontext

Der Compiler emittierte bis hierher die Stufen `base < device < state < class < inline`.
Damit gewann eine globale Klasse auch auf Desktop gegen einen lokal am Knoten gesetzten Wert.
Die Elementor-Referenz erwartet den umgekehrten Vorrang: Ein lokaler Stil soll eine globale
Klasse überstimmen, solange beide unter derselben Bedingung gelten. Gleichzeitig muss eine
engere Bedingung weiterhin stärker sein: Eine Tablet-Regel einer Klasse muss einen lokalen
Desktop-Wert auf Tablet überstimmen, und ein Klassen-Hover muss einen lokalen Basiswert beim
Hover überstimmen.

## Entscheidung

Die Reihenfolge wird von einer reinen Herkunftsreihenfolge zu einer Bedingungsmatrix:

1. globale Klasse, Basis
2. lokaler Knotenwert, Basis
3. lokale scoped Regel, Basis
4. globale Klasse, Gerät (Tablet, dann Mobil)
5. lokaler Knotenwert, Gerät
6. lokale scoped Regel, Gerät
7. globale Klasse, Zustand (Hover, Focus, Active, Disabled)
8. lokaler Knoten-Zustand
9. lokale scoped Regel, Zustand
10. Inline-Werte außerhalb der Layer

Damit gilt: **Bedingung vor Herkunft** (Zustand vor Gerät vor Basis) und **lokal vor global**
bei gleicher Bedingung. Die Regel `inline` bleibt unverändert die stärkste Stufe und liegt
außerhalb von `@layer user-authored`.

## Folgen

- Lokale Knotenwerte und scoped Regeln gewinnen gegen globale Klassen derselben Bedingung.
- Globale Klassen mit engerer Bedingung (Tablet/Mobil, Hover) gewinnen weiterhin gegen
  lokale Basiswerte, weil die Bedingung spezifischer ist.
- Bestehende Projekte, die sich auf den alten Klassen-vor-lokal-Vorrang verlassen haben,
  ändern ihr visuelles Ergebnis. Das ist die beabsichtigte Korrektur; Framer-Importe werden
  gegen die bestehenden Fixtures und den Browser-Canvas erneut abgenommen.
- Ambient-Regeln mit frei gewählten Selektoren behalten ihre CSS-Spezifität. Eine lokal
  gesetzte Regel kann eine höher spezifische Ambient-Regel nur gewinnen, wenn deren
  Spezifität nicht größer ist. Diese Grenze bleibt dokumentiert.
- Die Regelreihenfolge ist weiterhin deterministisch und die Layer-Anzahl bleibt eins.

## Nachweise

- Charakterisierungstests in `packages/widget-engine/test/css-cascade.test.ts` für die
  vollständige Matrix (Basis, Gerät, Zustand, lokal/global, scoped, ambient, inline).
- Browser-/Canvas- und Build-Gates laufen über dieselbe `compileCss`-Quelle.
- Die Migration wird im Fahrplan und im aktuellen Stand vermerkt.
