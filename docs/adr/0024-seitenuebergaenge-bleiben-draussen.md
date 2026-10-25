# Seitenübergänge bleiben draußen: sie sind im SSR nicht vorhanden

Status: angenommen · 24.10.2026
Bezug: ADR-0010 (Island-Payload für importierten Fremd-Code), `docs/fahrplan-framer-1zu1.md`
Schritt 6 („Seitenübergänge: eigene Entscheidung nötig"), Unframer-Befund („gehen verloren").

**Problem.** Der 1:1-Plan führt zwei offene Punkte aus Schritt 6: **CMS-Daten** und
**Seitenübergänge**. Für die Seitenübergänge stand dort nur der fremde Befund („bleiben laut Unframer
nicht erhalten") und die Feststellung „eigene Entscheidung nötig" - entschieden war nichts. Ohne
Entscheidung bleibt der Punkt in jedem Bericht als ungeklärter Rest stehen.

**Messung (24.10.2026, sieben Blindtest-Seiten).** Gesucht wurde im Server-HTML jeder Seite nach
jeder Form, in der Framer einen Seitenübergang ablegen könnte:

| Marke | wedge | donutshop | last-studio | refined | notes | meeko | unifiersofjapan |
|---|---|---|---|---|---|---|---|
| `pageEffect` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pageTransition` / `framer-page-transition` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `data-framer-page-transition` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `animatePresence` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**Keine Spur auf keiner der sieben Seiten.** Die `transition`-Treffer, die ein grep findet, sind
`transition: color .3s` in Link-Regeln und Übergangs-Einträge in den Daten der Laufzeit - keine
Seitenübergänge zwischen Routen. Der Befund von Unframer ist damit nicht nur übernommen, sondern
am SSR nachgezählt.

**Entscheidung.** Seitenübergänge werden **nicht** importiert, und der Import **erfindet** keinen
Übergang. Begründung:

1. **Es gibt nichts zu lesen.** Anders als bei den Platzhaltern (die wenigstens als leeres Element
   dastehen) existiert für einen Seitenübergang kein Element und kein Attribut im SSR. Ein Import,
   der hier etwas ausgäbe, würde raten.
2. **Der Release braucht ihn nicht.** Ein Seitenübergang spielt beim Wechsel zwischen zwei Seiten.
   Ein importierter Framer-Release führt die Original-Runtime - wo die Quelle einen Übergang hatte,
   führt sie ihn selbst aus. Der Struktur-Baum ist eine Näherung für den Editor, kein Router.
3. **Ein erfundener Übergang wäre schlechter als keiner.** Senify hat eigene Presets für Ein- und
   Ausblendungen; ein pauschal gesetzter Fade über jede Navigation würde die Seiten verlangsamen und
   wäre nicht die Bewegung der Quelle.

**Was stattdessen gilt.** Der Import meldet **nicht** „Seitenübergang verloren" - das wäre eine
Meldung über etwas, das die Quelle nicht hergibt, und würde bei jeder Seite als Rauschen stehen. Der
Punkt ist mit dieser Messung geschlossen, nicht vertagt.

**Grenze, die bleibt.** Wer eine importierte Seite als **eigene** Seite weiterbaut (ohne Runtime) und
dabei einen Seitenwechsel gestalten will, setzt ihn in Senify von Hand - als eigene Entscheidung,
nicht als Import-Ergebnis. Das ist keine Lücke des Imports, sondern der Unterschied zwischen
„Original läuft" und „neu gebaut".

**Beleg.** Die Zählung ist wiederholbar:
`node -e "const h=await(await fetch('https://wedge.framer.website/')).text(); console.log(h.includes('pageEffect'))"`
gegen jede der sieben Adressen. Der Befund steht in `docs/fahrplan-framer-1zu1.md` Schritt 6.
