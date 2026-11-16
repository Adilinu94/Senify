# Gerätepaarung: generische Framer-Klassen und überlappende SSR-Kopien

Status: umgesetzt 12.11.2026 (zwei Ursachen, je roter Test, Re-Import, Sichtvergleich)
Label: ready-for-agent (erledigt)
Type: bug

## Befund

Auf Tablet (768 px) und Mobil (390 px) wich der Import stark ab, auf Desktop kaum.
Die Bilder waren nicht falsch skaliert: Im Original und im Build messen die
Halftone-Grafiken auf 768 px gleich 1200 × 750. Die Abweichung kam von Höhenversätzen, die sich über die Seite aufsummierten
(`/` Tablet: −6 px am Hero, −16 px bei y = 1498, bis −39 px bei y = 7405).

## Ursache 1 — generische Klassen in der Signatur (belegt)

`mergeStatesBySignature` (`packages/framer-import/src/import.ts`) paart Knoten
über `tag|Basisklassen|Varianten|id`. `framer-text` sitzt auf jedem Absatz und
benennt kein Element: 75 `p.framer-text` auf Desktop, 71 im Tablet-Bau, der
Header trägt auf Desktop fünf Texte mehr. Die Reihenfolge paarte den Hero-Badge
„Astra for growing teams" mit einem fremden Absatz; er bekam auf Tablet und Mobil
`font-size: 10px` und `color: rgb(112, 115, 255)` statt 19,8 px. Messung:
`.scratch/choc-merge-dbg.mts`, `.scratch/choc-merge-dbg2.mts`, `.scratch/choc-pill.mts`.

Korrektur: `framer-text` und `framer-styles-preset-*` zählen nicht als eigener
Name (`ownClasses`). Solche Knoten bekommen den nächsten Vorfahren mit eigener Klasse als
Kontext; der Kontext selbst ignoriert sie ebenfalls.
Test: `packages/framer-import/test/merge-signature.test.ts` (zwei neue Fälle,
der erste vor der Korrektur rot).

## Ursache 2 — überlappende SSR-Kopien (belegt)

Auf `/price` schreibt Framer die Kartenüberschrift zweimal: „Astra Starter"
(`hidden-10d29j2`, nur auf Tablet 810–1199 versteckt) und „Meridian Starter"
(`hidden-q7h94o`, nur auf Desktop versteckt). Unter 810 px versteckt keine Regel
eine der beiden; die Laufzeit entfernt eine. `restoreIdLessDeviceVariants` übernahm
die SSR-Sichtbarkeit, der Build zeigte auf Phone beide, jede Preiskarte wuchs um
47 px. Der hydratisierte Gerätebau enthält genau eine Kopie (Tablet „Meridian",
Mobil „Astra"; `.scratch/choc-merge-dbg3.mts`).

Korrektur: `settleOverlaps` gibt ein überlapptes Gerät nur der Kopie, deren eigener
Text im Gerätebau steht. Ohne Gerätebau, ohne unterscheidenden Text oder ohne eindeutige
Antwort bleibt alles unverändert. `runImport` reicht die Gerätebauten durch.
Test: `packages/framer-import/test/device-variants.test.ts` (zwei neue Fälle,
der erste vor der Korrektur rot).

## Ergebnis

Re-Import aller 10 Seiten, Vorschau, Release-Prüfung 0 hart / 0 weich, Sichtvergleich
`.scratch/framer-live-2026-11-09/choc-visual-2026-11-12d/result.json`. Zahlen
stehen in `docs/current/qualitaet.md`.

## Grenzen

- Belegt an einer Quelle (Chocolate); andere generische Framer-Klassen sind nicht
  gesucht worden.
- Die Überlappungsauflösung braucht unterscheidenden Text; Kopien, die sich nur im
  Layout unterscheiden, bleiben überlappend.
- Restabweichung `/price` (Median 2,7 / 4,6 / 6,5 %) und `/contact` Tablet (4,7 %)
  nicht untersucht.
