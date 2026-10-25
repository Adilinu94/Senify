# Framer-Import: Motion nur über die geschlossene Preset-Registry

Status: accepted · 22.10.2026
Bezug: Plan S8 (`.scratch/framer-import/plan.md`), ADR-0006 (Motion-Spec und Preset-Registry), ADR-0003 (GSAP als Choreografie-Kern), ADR-0010 (Island-Payload für Fremdcode).

**Problem.** S8 verlangte eine eigene Entscheidung dafür, wie weit der Framer-Import die
Bewegung einer Quelle abbildet. Offen war die Frage, ob fehlende Formen (horizontale
Einblendungen, Einblendungen von oben, Skalierung) durch neue Presets geschlossen werden
sollen - oder ob die geschlossene Registry die Grenze bleibt und jeder nicht abbildbare
Effekt ein Befund wird.

**Messung (22.10.2026).** Erhoben über `runImport` auf den drei gespeicherten Exporten und
auf der veröffentlichten Earn-Seite, jeweils im Modus `fidelity`:

| Quelle | gemessen | auf Preset | Befund | Formen |
|---|---|---|---|---|
| stupendous-football | 2 | 2 | 0 | 2 × appear |
| easier-train | 5 | 3 | 2 | 5 × appear |
| fluffy-rectangle | 23 | 11 | 12 | 23 × appear |
| Earn, statisch | 5 | 2 | 3 | 5 × appear |
| Earn, Browser-Capture | 15 | 12 | 3 | 5 × appear, 8 × scroll (Sensor), 1 × inview, 1 × Lenis |

Die nicht abgebildeten Fälle sind **keine** exotischen Formen: es sind horizontale
Einblendungen (`fromX` 20 und 150 px), eine Einblendung von oben (`fromY: -20`) und
Skalierungen. Die Registry kennt für Einblendungen genau `fade-up` (von unten, ohne
Seitwärtsbewegung, ohne Skalierung) sowie `fade-up-deblur`; für Bewegung aus einer anderen
Richtung gibt es kein Preset.

**Entscheidung.**

1. **Die Registry bleibt geschlossen.** Der Import bildet einen Effekt nur dann auf ein
   Preset ab, wenn dessen Form wirklich passt (`appearPreset` in
   `packages/framer-import/src/motion-mapping.ts`: `fromX = 0`, `fromY ≥ 0`,
   `fromScale = 1`). Jeder andere Effekt wird ein Befund mit Rohbeleg - niemals ein
   „ungefähr passendes" Preset.
2. **Kein neues Preset für Horizontale oder Skalierung.** Ein `slide-left`-Preset wäre eine
   Produktentscheidung für das Design-System, nicht für den Import: es würde auf jeder
   Senify-Seite verfügbar, nur weil eine fremde Quelle es braucht. Die Registry ist der
   gestalterische Vertrag der Plattform (ADR-0006), kein Abbild fremder Exporte.
3. **Der Befund ist das Ergebnis, nicht das Versagen.** Er nennt Knoten, Startwerte und
   Grund im Bericht (Fundart `unsupported-declaration`); der Bearbeiter entscheidet, ob er
   die Stelle von Hand bewegt, sie statisch lässt oder ein Preset vorschlägt.
4. **Der Browser-Capture ändert die Bilanz, nicht die Regel.** Er liefert die Formen, die
   das SSR nicht sieht (Scroll-Sensor, Invoke-Observer, Lenis): auf der Earn-Seite steigt
   die Ausbeute von 5 auf 15 gemessene Samples. Die Zuordnungsregel bleibt dieselbe.

**Folgen.**

- Die Abdeckung ist eine **Zahl pro Quelle**, keine Zusage: 100 % bei
  stupendous-football, 60 % bei easier-train, 48 % bei fluffy-rectangle, 80 % auf der
  Earn-Seite (Browser). Diese Zahlen stehen in `README`/`qualitaet.md`-Nähe, nicht als
  globale Quote.
- Wer eine horizontale Einblendung importiert, sieht sie im Bericht und entscheidet. Das
  ist ehrlicher als ein Preset, das die Bewegung in die falsche Richtung spielt.
- Soll die Registry wachsen, ist das eine eigene ADR mit Begründung am Design-System -
  nicht eine Nebenwirkung des Imports.

**Belege.** `packages/framer-import/test/motion-mapping.test.ts` (die Zuordnungsregel samt
Gegenprobe), `packages/framer-import/test/motion-appear.test.ts`,
`packages/framer-import/test/appear-channel.test.ts`, die Messung in
`docs/current/qualitaet.md`.
