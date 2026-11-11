# Motion im Framer-Import

Kontext: Appear-Effekte, Startzustände und Wiedergabe ohne Framer-Runtime.

## Issues

- [Appear-Kaskade und gehaltener Endzustand](./issues/01-appear-kaskade.md), resolved 10.11.2026.
- [Verwaiste Appear-IDs zuordnen](./issues/02-verwaiste-appear-ids.md), resolved 10.11.2026; der Sammelbefund restlos geschlossen mit Issue 06.
- [Motion und Inline-Auszeichnung auf Textlinks](./issues/03-textlink-motion.md), resolved 10.11.2026; Live-Scroll-Sample auf einer Blog-Karte und Editor-Abnahme von Beschriftung und Inhalt am 11.11.2026, Hover bleibt offen (keine Hover-Regel im Build).
- [Reduzierte Bewegung für Appear-Regeln](./issues/04-reduced-motion.md), resolved 10.11.2026; Browser-Beleg mit `prefers-reduced-motion: reduce` am 11.11.2026 gemessen (39 von 39 Klassen ohne Animation).
- [Ganzseitenvergleich bei laufenden Appear-Animationen](./issues/05-ganzseitenvergleich.md), resolved 11.11.2026; Abschnittsvergleich nach abgeschlossenen Animationen ersetzt das Ganzseitenbild.
- [Rest-Sammelbefund: eine Einblendung ohne Ziel](./issues/06-rest-sammelbefund.md), resolved 10.11.2026; Ursache war der Live-Schlüsselstempel an Inline-SVGs.
- [Puls-Punkt vor „200+ Firms already enrolled“](./issues/07-punkt-puls.md), ready-for-agent; der Build verliert die Inline-Zentrierung und schreibt eine Ausblendung statt des Pulses, dadurch zwei versetzte Punkte.
