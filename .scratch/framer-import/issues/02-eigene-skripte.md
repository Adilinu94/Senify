# Eigene Skripte bleiben im Struktur-Build

Status: resolved 10.11.2026
Label: ready-for-agent

## Befund

Der Relay-Build `/` enthält ein Inline-Ladeskript, `assets/page.js` (15.298 Bytes) und `assets/vendor/lenis.min.js` (18.722 Bytes). Die Laufzeitprüfung blieb deshalb bei `unknown`; es gab keine Framer-Anfragen und keine Framer-Globals. `/contact` enthielt keine Skripte und wurde widerlegt.

**Ursache (im Build zurückverfolgt):** Die drei Skripte stammen nicht aus der Framer-Quelle, sondern aus Senifys eigenem Bake (`packages/renderer/astro-template/src/layouts/Page.astro`, `lenisLateLoader`): Der Motion-Lauf wird nach dem `load`-Event nachgeladen, damit er Schriften und CSS nicht verdrängt. Die Prüfung sah nur `createElement("script")` und stufte jeden dynamischen Lader als ungeklärt ein.

## Umsetzung

- `auditFramerRuntime` erkennt den eigenen Lader an seiner Signatur (`requestIdleCallback`, `lenis.onload`, ausschließlich `/assets/vendor/lenis.min.js` und `/assets/page.js`, keine Fremdadresse) und meldet `own-motion-loader` (neutral) statt `dynamic-loading` (unknown).
- Ein Skript von einem fremden Host wird als `third-party-script` (dependency) benannt. Ohne gemessenen Inhalt bleibt es zusätzlich `script-not-inspected` (unknown); ein Framer-Host oder Framer-Marker bleibt `runtime`.

## Abnahme

- `packages/engine/test/runtime-audit.test.ts`: 18 Tests, davon drei neue: eigener Lader neutral und `refuted`, Lader mit Fremdadresse nicht als eigener, Lader mit Framer-Marker bestätigt, fremder Host als Drittanbieter.
- Relay5-Lauf (`structure-relay5-2026-11-10`, 10.11.2026): `/` und `/contact` sind jetzt `refuted`, jeweils mit dem Signal `own-motion-loader` und ohne offene Fragen. Vorher war `/` `unknown`.
- Typecheck und ESLint grün.

## Grenze

Die Prüfung bleibt ein Marker-Beleg, kein formaler Beweis gegen bewusst verschleierten Code. Ein fremder Host ohne gemessenen Inhalt bleibt bewusst `unknown`.