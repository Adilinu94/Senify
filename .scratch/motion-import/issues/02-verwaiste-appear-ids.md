# Verwaiste Appear-IDs melden

Status: ready-for-agent
Label: ready-for-agent

## Befund

Der Compiler erkennt eine Appear-ID ohne Zielknoten und erzeugt einen `warn`-Befund (`packages/framer-import/src/appear-css.ts`). Auf Mapper-Ebene ist nicht getestet, ob dieser Befund im `FidelityReport` ankommt. Zusätzlich überspringt `readAppearMotion` IDs ohne Knoten ohne Befund, sodass die Motion-Zahl im Bericht die Abdeckung überzeichnen kann. Der Suggestion-Text für ein gefaltetes Element spricht fälschlich von einem fehlenden Endzustand.

## Nächster Schritt

1. Einen Report-Test in `packages/framer-import/test/appear-css.test.ts` ergänzen: `severity === "warn"`, Meldung nennt „keinem Knoten", Evidence ist die Appear-ID.
2. Den Suggestion-Text für gefaltete und entfernte Elemente trennen.
3. In `readAppearMotion` einen eigenen Befund für eine nicht zuordenbare ID erzeugen.
4. Gegenprobe: ein Element mit gemapptem Vorfahren erzeugt keine Warnung.

## Abnahme

Die Warnung erscheint im gemappten Dokument und im Bericht, die Zahl der verworfenen Effekte ist sichtbar, und der bestehende grüne Fall bleibt unverändert.
