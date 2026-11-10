# Appear-Kaskade und gehaltener Endzustand

Status: resolved 10.11.2026
Label: ready-for-agent

## Befund

Im Live-Build liefen nur 19 von 93 Elementen mit einer Appear-Klasse. Die übrigen 74 wurden von der Knotenbasis `animation: none` überstimmt, die Framer in die Quellstile schreibt. Zusätzlich konnte eine gemessene Einblendung im Startzustand enden: Framer hält zuerst `opacity [0.001, 0.001]` für 10 s, die Probe behielt diese erste Aufzeichnung und verwarf die echte 100-Bilder-Einblendung. Der Hero-Eyebrow `fi-8a5eda-64` wäre dadurch dauerhaft unsichtbar geblieben.

## Umsetzung

- Beim Anhängen einer Appear-Klasse entfernt der Mapper alle `animation*`-Props des Knotens. Die Klasse ist damit der einzige Eigentümer der Animation.
- Die Probe behält pro Element und Property die Aufzeichnung mit den meisten Bildern, nicht die erste. Die Halteanimation hat 2, die echte Einblendung 100 Bilder.
- Der Compiler verwirft eine gemessene Variante, die im Startzustand endet, statt sie als Endzustand zu schreiben.
- Der Startzustand erkennt jetzt auch eine reine Deblur-Einblendung (`opacity:0.001; filter:blur(4px); transform:none`), sowohl am Knoten als auch im Inline-Markup.

## Beleg

- Tests: `packages/framer-import/test/appear-css.test.ts`, `appear-measured.test.ts`, `capture-browser-motion.test.ts`, `appear-channel.test.ts`; alle vier neuen Fälle waren ohne die jeweilige Korrektur rot.
- Live: `.scratch/framer-live-2026-11-09/structure-motionfix2-2026-11-10/result.json`; 93 von 93 Appear-Klassen animieren bei 1440, 768 und 390 px. Kein Keyframe endet bei `opacity:0.001`; 16 verbleibend transparente Knoten haben null Größe und sind nicht sichtbar.
- Visuell: Erster Bildschirm `/` 0.240/5.618/8.071 Prozent und `/about` 0.358/1.287/1.931 Prozent. Der Ganzseitenwert ist für den animierten Build nicht vergleichbar, weil der Ganzseiten-Screenshot die laufenden Animationen am Startzustand erwischt; beim echten Scrollen sind die Bilder und Karten sichtbar. Belege: `.scratch/framer-live-2026-11-09/visual-motionfix2-2026-11-10/result.json` und die Screenshots im selben Laufverzeichnis.

## Grenzen

Der Live-Lauf prüft den gerenderten Endzustand, nicht Zwischenwerte, Hover, Scroll-Trigger oder reduzierte Bewegung. Die Live-Quelle ist beweglich. Textlink-Motion und verwaiste Appear-IDs bleiben eigene offene Fälle.
