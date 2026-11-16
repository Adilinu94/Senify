# Rest-Sammelbefund: eine gemessene Einblendung ohne Ziel

Status: resolved 10.11.2026
Label: ready-for-agent

## Befund

Nach der Orphan-Zuordnung blieb auf Relay `/` genau ein Sammelbefund: „1 gemessene Einblendung(en) ohne Ziel im sichtbaren Baum (… n1630)“. Die Vermutung im Handoff war eine letzte nicht entfernte Kopie. Die Messung sagt etwas anderes.

**Ursache (am laufenden Capture gemessen):** Der Live-Stempel `senifyStampKeys` (`capture-browser.ts`) vergab die IR-Schlüssel, indem er durch **jedes** Element lief. Der HTML-Capture macht aus `<svg>` und `<select>` aber **einen** Knoten — `toIrNode` liest deren Inhalt als Markup und steigt nicht hinein. Jedes Inline-SVG verschob deshalb alle folgenden Schlüssel um seine Kinderzahl.

Gemessen an Relay `/` am 10.11.2026: Der Stempel zählte **1959** Elemente, der IR-Baum hatte **1922** Knoten. `n1630` gehörte live zu einem `div.framer-e666lp-container`; im IR saß unter diesem Schlüssel ein anderes Element. Die gemessene Einblendung auf `n1630` fand damit keinen Knoten — ein Befund über einen Stempel-Fehler, nicht über eine entfernte Kopie.

Dieselbe Verschiebung traf jede Messung hinter dem ersten Inline-SVG: Der Scroll-Sensor und die gemessenen Einblendungen adressierten die falschen Knoten.

## Umsetzung

`senifyStampKeys` behandelt `<svg>` und `<select>` als Blatt: Das Element bekommt seinen Schlüssel, seine Kinder bekommen keinen und werden nicht besucht. Das ist genau die Regel, nach der `toIrNode` den Baum baut.

## Abnahme

- Neuer Test `packages/framer-import/test/capture-browser-motion.test.ts` („vergibt hinter einem Inline-SVG keinen verschobenen Schlüssel“): Ein SVG steht **vor** einem Element, das eine Einblendung spielt; die gemessene Einblendung muss den IR-Schlüssel dieses Elements tragen. Gegenprobe: ohne die Blatt-Regel ist der Test rot (geprüft).
- Relay6-Lauf (`structure-relay6-2026-11-10`, 10.11.2026): Der Schlüsselabgleich Live ↔ IR meldet **keine Abweichung** mehr (vorher 1959 gegen 1922), und der Sammelbefund ist **0** (vorher 1).
- `/`: 46 Befunde / 4 nicht-info → **45 / 3**. Der verbleibende `warn:unsupported-declaration` ist der Data-URL-Fund, den der Import jetzt korrekt als Asset-Übernahme beschreibt.
- 216 Keyframes, 0 enden im Startzustand, 0 sichtbare Knoten bleiben transparent, 56 Appear-Klassen im CSS (39 animieren im Browser, 17 gehören zum Kontakt-Scope).

## Grenze

Der Live-Lauf ist eine Momentaufnahme einer veränderlichen Quelle. Die Zuordnung hängt an der Reihenfolge des DOM, nicht an IDs; eine Seite, deren Laufzeit Baumteile **vor** dem Lesen einfügt oder entfernt, kann weiterhin einzelne Messungen ohne Ziel lassen — dann bleibt der Sammelbefund der ehrliche Ausdruck dafür.
