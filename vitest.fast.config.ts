// Der lokale Schnellweg fuer die Entwicklung.
//
// Warum eine eigene Datei und nicht eine Aenderung an `vitest.config.ts`:
// `pnpm verify` und `pnpm test` sind die Tore der CI (`.github/workflows/verify.yml`:
// Linux-`verify`, Windows-`pnpm test`, Coverage-Job). Wuerde man dort Tests
// abwaehlen, waere das kein schnellerer Lauf, sondern ein abgeschaltetes Tor.
// Diese Datei erbt die Basiskonfiguration (Aliase, Umgebung, Timeouts, Coverage-
// Schwellen) und nimmt nur weg, was lokal Zeit kostet:
//
//   - die 39 Browser-Suiten (echtes Chromium, Screenshots, pixelmatch); sie
//     laufen weiter in der CI und ueber `pnpm test:visual` / `pnpm verify:import`.
//
// Die Worker-Zahl bleibt bei der Basiskonfiguration (vier). Eine eigene Grenze
// von zwei Workern wurde am 01.11.2026 gemessen und wieder verworfen: derselbe
// Ausschnitt (`core`, `widget-engine`, `section-sdk`, `tokens`, 41 Dateien)
// brauchte mit zwei Workern 68 s statt 48 s. Weniger Kerne kuehlen den Rechner,
// machen den Lauf aber laenger - und schneller werden soll er.
//
// Der volle Lauf bleibt `pnpm test`; diese Datei ist kein Gate und ersetzt
// keines. Wer den Schnellweg fuer bare Muenze nimmt, hat die Browser-Suiten
// nicht gesehen - das steht so auch in der README.
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["packages/*/test/**/*.test.ts"],
      exclude: [...configDefaults.exclude, "**/*browser*.test.ts"],
    },
  }),
);
