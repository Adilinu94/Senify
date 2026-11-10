# Verwaiste Appear-IDs zuordnen

Status: resolved
Label: resolved

## Befund

Der Compiler erkennt eine Appear-ID ohne Zielknoten und erzeugt einen `warn`-Befund (`packages/framer-import/src/appear-css.ts`). Auf Mapper-Ebene war nicht getestet, ob dieser Befund im `FidelityReport` ankommt. Zusätzlich überspringt `readAppearMotion` IDs ohne Knoten ohne Befund, sodass die Motion-Zahl im Bericht die Abdeckung überzeichnen kann. Der Suggestion-Text für ein gefaltetes Element sprach fälschlich von einem fehlenden Endzustand.

## Zweite Quelle, 10.11.2026

Relay `/` erzeugte 910 verwaiste Appear-IDs bei 955 Befunden; `/contact` 79 bei 106. Die Warnung kam im Bericht an. Die IDs waren fast alle gemessene Zwillinge gefalteter Wort-Spans und Divs, deren statische oder abgeleitete Einblendung bereits lief.

## Ergebnis 10.11.2026

Gemessene IDs gefalteter Elemente werden jetzt wie ihre statischen Zwillinge auf den nächsten erhaltenen Knoten abgebildet. Wort-Spans behalten ihre Inline-Klasse; gemessene Regeln stehen vor den abgeleiteten Regeln und gewinnen. Echte ziellose Messungen werden zu einem Sammelbefund mit Beispiel-IDs; Inline- und geteilte Ziele sind `info`.

Relay `/`: 910 Einzelwarnungen werden 1 Sammelbefund, die Befunde fallen von 955 auf 46, die Nicht-Info-Funde von 916 auf 5. `/contact`: 79 werden 1, die Befunde fallen von 106 auf 28, die Nicht-Info-Funde von 82 auf 3. 160 Inline-Regeln tragen die gemessene Zeit (0.4 s, cubic-bezier, 0.1 s Versatz) statt der abgeleiteten 0.6-s-Annahme. 41 von 41 Knoten-Animationen laufen weiter. Visuell bleibt der Build praktisch unverändert: erster Bildschirm `/` 2.201/0.944/1.501 Prozent, `/contact` 3.580/0.242/0.800 Prozent; Höhen exakt beziehungsweise 3 px Differenz.

Belege: `packages/framer-import/src/mapper.ts`, `appear-css.ts`, `packages/framer-import/test/appear-inline-words.test.ts`, `.scratch/framer-live-2026-11-09/structure-relay2-2026-11-10/result.json`, `.scratch/framer-live-2026-11-09/visual-relay2-2026-11-10/result.json`. 568 Framer-Import-Tests (2 übersprungen) sind grün; Typecheck, ESLint und die Doku-Wächter sind grün.

## Rest

Ein Sammelbefund je Seite bleibt sichtbar, bis die letzte entfernte Kopie geklärt ist. `readAppearMotion`-Befund und Textlink-Motion bleiben getrennt geführt.

## Abnahme

Die Warnung erscheint im gemappten Dokument und im Bericht, die Zahl der wirklich verworfenen Effekte ist sichtbar, und der bestehende grüne Fall bleibt unverändert.
