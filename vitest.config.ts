import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));

const tsconfig = JSON.parse(
  readFileSync(resolve(root, "tsconfig.json"), "utf8"),
) as { compilerOptions: { paths: Record<string, string[]> } };

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const alias = Object.entries(tsconfig.compilerOptions.paths).map(
  ([key, targets]) => ({
    find: new RegExp(`^${escapeRegExp(key)}$`),
    replacement: resolve(root, targets[0] ?? ""),
  }),
);

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    // Die Suite mischt schwere Browser- und Engine-Tests mit schnellen
    // Unit-Tests. Mit vollem Parallelismus (alle Kerne) verhungern die
    // laengeren Tests (Playwright-Klicks, powershell-Spawn, MCP-Läufe) an
    // ihren Timeouts, obwohl sie solo schnell sind. Vier Worker halten die
    // Last unter der Kernzahl; CI kann via --pool-threads uebersteuern.
    poolOptions: { threads: { maxThreads: 4, minThreads: 1 } },
    // Coverage-Gate (Fahrplan P1-2, R11). Die gemessenen Zahlen stehen in
    // docs/current/qualitaet.md, nicht hier - dieser Block ist das Tor, nicht
    // die Messung. Bewusst NUR die Pfade, in denen Fehler am teuersten sind:
    // HTTP-Dispatcher, Store, Lebenszyklus, Formulare, Editor-Zustand und die
    // MCP-Werkzeuge. Eine einzige Zahl ueber dem ganzen Quellbaum waere ein
    // Index ohne Aussage, weil er Browser-Oberflaeche und Engine in einen Topf
    // wirft und eine gut getestete Datei eine ungetestete ausgleichen kann.
    //
    // `perFile: true` gilt fuer jede Gruppe einzeln und fuer jede Datei darin:
    // eine Datei unter der Schwelle macht das Tor rot, auch wenn die Gruppe im
    // Schnitt darueber liegt. Die Schwellen liegen jeweils knapp unter dem
    // gemessenen Stand - das Tor soll einen Rueckschritt sichern, nicht eine
    // Zahl des Tages bestaetigen. Gehoben wird nach, nicht vor einer Aenderung.
    //
    // Das Tor haengt an `test:coverage`, das nur die Suites der geschuetzten
    // Pfade faehrt (engine, editor, mcp). Die schweren Browser-Suiten bleiben
    // draussen: sie decken dieselben Dateien nur ein Stueck weiter ab, machen
    // das Tor aber von Playwright-Laengen abhaengig, und ein Gate, das unter
    // Last faesst, wird abgeschaltet statt repariert.
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "packages/engine/src/http.ts",
        "packages/engine/src/store.ts",
        "packages/engine/src/lifecycle.ts",
        "packages/engine/src/forms.ts",
        "packages/mcp/src/tools.ts",
      ],
      exclude: [
        // Reine Weiterreichung ohne eigene Aussagen: browser.ts hat keine
        // eigenen Statements, ihre Prozentzahl misst nichts. Was sie
        // durchreicht, steht einzeln im Tor.
        "**/packages/editor/src/state/browser.ts",
      ],
      thresholds: {
        perFile: true,
        "packages/engine/src/{http,store,lifecycle,forms}.ts": {
          statements: 80,
          branches: 68,
          functions: 88,
          lines: 80,
        },
        "packages/editor/src/state/**/*.ts": {
          statements: 60,
          branches: 52,
          functions: 62,
          lines: 60,
        },
        "packages/mcp/src/tools.ts": {
          statements: 85,
          branches: 60,
          functions: 82,
          lines: 85,
        },
      },
    },
  },
});
