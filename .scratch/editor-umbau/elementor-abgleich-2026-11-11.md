# Elementor-Abgleich: erster geprüfter Ablauf

> **Korrektur (11.11.2026):** Die Gegenüberstellung `Content / Style / Advanced` unten stammt aus der englischen Core-Referenz 4.3.6. In der live geprüften Installation 4.2.3 (deutsch) heißen die Heading-Tabs ebenfalls `Allgemein / Stil / Interaktionen`. Der Unterschied ist ein Umgebungsunterschied, kein Senify-Unterschied. Fortsetzung mit Live-Abgleich: `elementor-live/befunde-2026-11-11.md`.

Stand: 11.11.2026. Basis dieses isolierten Editor-Arbeitszweigs: `821d2bd`. Der Hauptarbeitsbaum wurde parallel weiterentwickelt; vor Integration und weiterer Bewertung ist der aktuelle Stand abzugleichen.

## Umfang und Methode

Im lokalen Senify-Testsystem mit isolierter In-memory-Datenbank wurde bei 1440 × 900 ein Heading ausgewählt, sein Text im Inspector geändert, gespeichert und nach Neuladen mit Undo und Redo überprüft. Danach wurden globale Klassen angelegt und nach dem Speichern erneut geladen. Als Elementor-Referenz dienten vorhandene Aufnahmen vom 06.11.2026 unter `docs/research/elementor-captures-2026-11-06/`, insbesondere `71-heading-general.png`, `72-heading-style.png`, `49-structure.png` und `40-editor-empty.png`. Unterschiedliche Inhalte und Aufnahmezeitpunkte begrenzen den Vergleich. Das ist kein vollständiger Live-Vergleich und kein Paritätsnachweis.

## Beobachtungen

- Beide Oberflächen erlauben die Bearbeitung eines Headings und seiner Ebene; im geprüften Senify-Ablauf funktionierten Speichern, Reload und Undo/Redo einer Textänderung.
- Senify zeigte im beobachteten Inspector `Allgemein`, `Stil` und `Interaktionen`, die Elementor-Referenz `Content`, `Style` und `Advanced`. Das bedeutet nicht, dass gleichnamige Funktionen vollständig übereinstimmen.
- Die Elementor-Aufnahme zeigt ein Link-Feld beim Heading. Im beobachteten Senify-Zustand war es nicht sichtbar. Daraus folgt nicht, dass Senify keine Links unterstützt: Der Basis-Commit trägt bereits eine Link-Inhalt-Abnahme. Weitere Prüfung anhand gleicher Ausgangsdaten ist nötig.
- Elementor zeigt in der Referenz die Struktur über der Website; im geprüften Senify-Zustand war rechts eine feste Strukturspalte sichtbar. Die Bedienung wurde nicht systematisch verglichen.

## Gefundener und behobener Fehler

Nach dem Anlegen und Speichern einer globalen Klasse blockierte Senify nach Reload den Verlauf mit einer Recovery-Warnung. Der Fehler wurde nach Recovery mit einer weiteren neu angelegten Klasse reproduziert. Ursache: Die serverseitige Regel enthielt `authoredBy: user`, die lokal im Inspector erzeugte Regel zunächst nicht. Beim Vergleich mit dem gespeicherten History-Checkpoint führte dies zu einer Abweichung. Die lokale Regel erhält nun dasselbe Feld; die Checkpoint-Prüfung selbst bleibt bestehen.

Belege: `packages/editor/src/inspector/inspector.ts`, `packages/engine/src/store-style-rules.ts`, `packages/app/test/class-history-reload-browser.test.ts`. Der Regressionstest war vor der Korrektur rot und danach grün. Gate-Zahlen stehen ausschließlich in `docs/current/qualitaet.md`. Eine nachträgliche Behandlung bereits beschädigter oder abweichender Checkpoints wurde nicht verändert.

## Nächste Schritte

1. Diesen Zweig auf den inzwischen fortgeschrittenen Hauptstand übertragen und Konflikte mit dessen Änderungen einzeln prüfen; danach die passenden Gates erneut ausführen.
2. Gleiche Testseite und gleiche Inhalte in beiden Editoren verwenden. Heading inklusive Link, Container, responsive Werte, Klasse und Variable jeweils als abgeschlossenen Ablauf prüfen; Speichern, Reload und Undo/Redo einbeziehen.
3. Für jeden festgestellten Unterschied Code- oder Browserbelege und Auswirkungen festhalten; Produktlücke, bewusste Abweichung und ungeprüfte Frage unterscheiden.
4. Für eine aussagekräftige Barrierefreiheits- und Usability-Bewertung Tastatur, Fokus, Screenreader und kleinere Viewports gesondert prüfen.
