# Verwaiste Appear-IDs melden

Status: ready-for-agent
Label: ready-for-agent

## Befund

Der Compiler erkennt eine Appear-ID ohne Zielknoten und erzeugt einen `warn`-Befund (`packages/framer-import/src/appear-css.ts`). Auf Mapper-Ebene ist nicht getestet, ob dieser Befund im `FidelityReport` ankommt. Zusätzlich überspringt `readAppearMotion` IDs ohne Knoten ohne Befund, sodass die Motion-Zahl im Bericht die Abdeckung überzeichnen kann. Der Suggestion-Text für ein gefaltetes Element spricht fälschlich von einem fehlenden Endzustand.

## Zweite Quelle, 10.11.2026

Relay `/` erzeugt 910 verwaiste Appear-IDs bei 955 Befunden; `/contact` 79 bei 106. Die Warnung kommt im Bericht an, der Suggestion-Text ist aber weiterhin irreführend. Der statische Fallback lässt die betroffenen Elemente sichtbar, es fehlt die Bewegung. Belege: `.scratch/framer-live-2026-11-09/structure-relay-2026-11-10/result.json`, `.scratch/framer-live-2026-11-09/relay-import-2026-11-10/result.json`.

## Nächster Schritt

1. Einen Report-Test in `packages/framer-import/test/appear-css.test.ts` ergänzen: `severity === "warn"`, Meldung nennt „keinem Knoten", Evidence ist die Appear-ID.
2. Den Suggestion-Text für gefaltete und entfernte Elemente trennen.
3. In `readAppearMotion` einen eigenen Befund für eine nicht zuordenbare ID erzeugen.
4. Gegenprobe: ein Element mit gemapptem Vorfahren erzeugt keine Warnung.
5. Die 910/79 Relay-IDs stichprobenartig auf ihre Herkunft prüfen: gefaltete Breakpoint-Kopie, entfernter Code-/CMS-Knoten oder fehlender Vorfahre. Erst danach entscheiden, ob die ID auf den überlebenden Vorfahren abgebildet oder der Effekt bewusst verworfen wird.

## Abnahme

Die Warnung erscheint im gemappten Dokument und im Bericht, die Zahl der verworfenen Effekte ist sichtbar, und der bestehende grüne Fall bleibt unverändert.
