# Probes

Runtime probes injected into the captured page before its own scripts run
(plan S2.2: "Probes als eigene, versionierte Module übernehmen"). They ask the
running page what it actually animates instead of paraphrasing a minified
bundle — IntersectionObserver registrations, requestAnimationFrame usage,
WAAPI animations (`document.getAnimations()`), CSSOM `@keyframes`, Lenis
options, global listeners, scroll-driven timelines.

## Herkunft und Lizenz

Beide Dateien sind **unveränderte Kopien** aus
`Repos/site-clone/skills/clone-site/scripts/` (Chase Hannegan,
<https://github.com/chasehannegan/site-clone>), **MIT-Lizenz**
(Copyright (c) 2026 Chase Hannegan, siehe LICENSE des Quell-Repos).

- `motion-probe.mjs` ← `motion-probe.js` (Stand 23.09.2026)
- `tokens-probe.mjs` ← `tokens-probe.js` (Stand 23.09.2026)

Die `.mjs`-Endung ist die einzige Änderung; `capture-browser.ts` liest sie als
Text und injiziert sie per `context.addInitScript`. Updates geschehen bewusst:
eine neue Version wird hier eingecheckt, der Capture-Vertrag (die drei
`window.*`-Funktionen) bleibt stabil.

## Vertrag

| Funktion | Wann | Liefert |
|---|---|---|
| `instrumentMotion()` | als Init-Script, vor den Seitenskripten | instrumentiert IO/rAF/Listener/MutationObserver |
| `motionProbe()` | nach dem Settle | das volle Inventar (GSAP, WAAPI, Lenis, Sliders, …) |
| `motionSummary()` | nach dem Settle | die kurze Ansicht für Logs |
| `tokensProbe()` | nach dem Settle | frequenzgerankte Design-Tokens |
