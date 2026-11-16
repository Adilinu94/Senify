# Reduzierte Bewegung für Appear-Regeln

Status: resolved
Label: resolved

## Befund

`appearReducedMotionCss` erzeugte den passenden Block, wurde aber nie aufgerufen. Der Bake-Test suchte nur `prefers-reduced-motion`; der Preset-Pfad im Renderer machte ihn grün, nicht die importierte Regel. Bei reduzierter Bewegung konnte eine Appear-Regel im Startzustand hängen bleiben.

## Ergebnis 10.11.2026

Der Block entsteht jetzt im gemeinsamen Seitenstil-Compiler `styleRulesCss` in `packages/renderer/src/style-css.ts`. Die generische Hilfe `appearReducedMotionCss` liegt in `packages/widget-engine/src/css/reduced-motion.ts`; sie erkennt Klassen mit `senify-appear-*`-Keyframes und setzt für sie `animation:none!important` und `opacity:1!important`. Bake und Canvas teilen denselben Pfad.

Die ungenutzte Kopie in `packages/framer-import/src/appear-css.ts` ist entfernt. Der Bake-Test prüft jetzt die tatsächlich importierte `fi-…-appear-…`-Klasse im Reduced-Motion-Block, nicht mehr nur das Media-Feature. Der Compiler-Test deckt die Klasse und die Abgrenzung zu normalen Klassen ab. Ohne den neuen Aufruf sind beide Tests rot.

Belege: `packages/renderer/test/style-rules-css.test.ts`, `packages/framer-import/test/appear-bake.test.ts`, `packages/widget-engine/src/css/reduced-motion.ts`.

## Browser-Beleg 11.11.2026

Chromium mit `reducedMotion: "reduce"`, Relay6-Build, Startseite 1440 px: 39 von 39 Elementen mit einer `-appear-`-Klasse haben `animation-name: none` und `opacity: 1`; kein Element weicht ab. Der Reduced-Motion-Block im ausgelieferten CSS nennt dieselben Klassen wie die Animationen (39).

Beleg: `.scratch/framer-live-2026-11-09/visual-settle2-2026-11-10/result.json` (`reduzierteBewegung["/@desktop"]`), Bild `reduziert-top.png`. Das ist ein Browser-Beleg, kein Pixelvergleich gegen die Live-Quelle; die Quelle reagiert auf dieselbe Media-Abfrage, aber ihre Appear-Animationen laufen über die Framer-Runtime.
