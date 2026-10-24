import { coverageConfigDefaults, defineConfig } from "vitest/config";
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
    // Viele Tests importieren von einem lokalen 127.0.0.1-Server. Produktiv
    // weisen Import und Referenz-Analyse private Ziele ab (ADR-0016); der
    // Betreiber-Schalter gilt hier fuer die ganze Suite, die Tests des Schutzes
    // (packages/core/test/net.test.ts) schalten ihn selbst wieder aus.
    env: { SENIFY_ALLOW_PRIVATE_URLS: "1" },
    // Die Suite mischt schwere Browser- und Engine-Tests mit schnellen
    // Unit-Tests. Mit vollem Parallelismus (alle Kerne) verhungern die
    // laengeren Tests (Playwright-Klicks, powershell-Spawn, MCP-Läufe) an
    // ihren Timeouts, obwohl sie solo schnell sind. Vier Worker halten die
    // Last unter der Kernzahl; CI kann via VITEST_MAX_WORKERS uebersteuern.
    // Vitest 4: maxWorkers ersetzt die alten Pool-Optionen; minWorkers entfällt.
    pool: "forks",
    maxWorkers: 4,
    // vitest's 5 s default is tighter than the full suite under load: tests that take
    // 1-4 s alone (fixture pipelines, engine round trips) failed at random per run
    // (qualitaet.md, 11.10.2026). Heavy tests keep their own explicit limits.
    testTimeout: 30_000,
    // Dieselbe Begruendung, andere Frist: der Standard fuer Hooks ist 10 s.
    // Der Aufraeum-Hook (`afterAll` -> `env.close()`) faehrt die Engine herunter,
    // schliesst Datenbank und Server und raeumt das Datenverzeichnis. Unter Last
    // (2642 Tests, vier Worker, Windows-Laeufer) braucht das manchmal laenger als
    // 10 s - am 22.10.2026 in `media.test.ts` geschehen: **kein Test rot**, nur
    // der Hook lief in sein Timeout, und der ganze Windows-Job wurde rot
    // (Lauf 39850687405; der Neustart desselben Commits war gruen).
    //
    // Ein Aufraeum-Timeout als roter Job ist ein Fehlalarm, der wie ein Befund
    // aussieht: die Meldung nennt eine Testdatei, aber die Tests darin waren
    // alle gruen. Dieselbe Frist wie fuer die Tests ist die ehrliche Antwort -
    // ein haengender Hook faellt weiter auf, nur nicht mehr an der Laenge der
    // Warteschlange.
    hookTimeout: 30_000,
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
        // Alle HTTP-Fachmodule (ADR-0019): `http-route-support.ts` und
        // `http-routes-sites.ts` sind aus der geteilten HTTP-Schicht, der
        // Glob nimmt sie mit - und kuenftige dazu.
        "packages/engine/src/http-*.ts",
        "packages/engine/src/store.ts",
        "packages/engine/src/store-*.ts",
        "packages/engine/src/lifecycle.ts",
        "packages/engine/src/forms.ts",
        "packages/editor/src/state/**",
        // Die Werkzeug-Definitionen der MCP-Fassade: `tools.ts` traegt die
        // Tabelle, die Module `tools-*.ts` die ausgelagerten Werkzeuge und die
        // Schemas. Ohne den Glob waeren die 622 Zeilen aus Schritt 56
        // ungemessen - und ein ungemessenes Modul kann keinen Rueckschritt
        // melden (Befund vom 23.10.2026).
        "packages/mcp/src/tools.ts",
        "packages/mcp/src/tools-*.ts",
      ],
      // Die eigenen Ausschluesse GELTEND NEBEN den Standardwerten: ein eigenes
      // `exclude`-Feld ersetzt sie, und dann liegen ploetzlich dist/-Artefakte
      // und node_modules in der Messung - seit P0-4 echte Build-Ausgaben. Das
      // hat die Report-Erzeugung unterlaufen, nicht die Tests.
      exclude: [
        // Reine Weiterreichung ohne eigene Aussagen: browser.ts hat keine
        // eigenen Statements, ihre Prozentzahl misst nichts. Was sie
        // durchreicht, steht einzeln im Tor.
        "**/packages/editor/src/state/browser.ts",
        // http-contract.ts haelt nur Typen (Kontext, Route, Antwort): es gibt
        // keine ausfuehrbare Aussage, die man messen koennte - 0 % waeren eine
        // Zahl ohne Bedeutung. Der Vertrag selbst ist Typ fuer Typ (ADR-0019).
        "**/packages/engine/src/http-contract.ts",
        ...coverageConfigDefaults.exclude,
      ],
      thresholds: {
        perFile: true,
        // Die HTTP-Schicht ist in neun Module geteilt (ADR-0019); das Tor
        // haengt an allen, sonst wuerde der umgezogene Code ungeschuetzt
        // mitarbeiten. Die Schwellen liegen knapp unter dem gemessenen Stand
        // vom 20.10.2026:
        //   http.ts                   96,09 / 87,01 / 100   / 96,09
        //   http-route-support.ts     85,44 / 76,63 / 100   / 85,44
        //   http-routes-sites.ts      96,38 / 76,27 / 94,73 / 96,38
        //   http-routes-references.ts 95,74 / 80,64 / 100   / 95,74
        //   http-routes-content.ts    94,52 / 73,46 / 94,11 / 94,52
        "packages/engine/src/{http,http-route-support,http-routes-sites,http-routes-assets,http-routes-formular,http-routes-references,http-routes-content,store,lifecycle,forms}.ts": {
          statements: 80,
          branches: 68,
          functions: 88,
          lines: 80,
        },
        // Drei Route-Module sind deutlich schwaecher gemessen und stehen
        // deshalb in eigenen Gruppen; eine gemeinsame Schwelle fuer alle
        // waere die niedrigste von allen - und damit ein Tor, das nichts mehr
        // sichert (Stand 20.10.2026):
        //   http-routes-pages.ts  97,34 / 67,08 / 96,29 / 97,34
        //   http-routes-media.ts  85,66 / 64,00 / 75,00 / 85,66
        //   http-routes-ops.ts    86,15 / 58,88 / 88,88 / 86,15
        "packages/engine/src/http-routes-pages.ts": {
          statements: 96,
          branches: 66,
          functions: 95,
          lines: 96,
        },
        "packages/engine/src/http-routes-media.ts": {
          statements: 85,
          branches: 63,
          functions: 74,
          lines: 85,
        },
        "packages/engine/src/http-routes-ops.ts": {
          statements: 85,
          branches: 58,
          functions: 88,
          lines: 85,
        },
        // Die ausgelagerten Fachmodule der Engine (ADR-0019, P3-2) und die
        // HTTP-Helfer sind jetzt im Tor. Sie waren vorher nicht gemessen -
        // rund 7 000 Zeilen, die niemandem einen Rueckschritt melden konnten.
        //
        // Die Schwellen liegen knapp unter der NIEDRIGSTEN Datei der Gruppe
        // (Stand 20.10.2026: 89.51 Statements, 75 Branches, 90 Functions).
        // Vier Dateien sind deutlich schwaecher gemessen und stehen deshalb in
        // eigenen Gruppen: `store-settings-mappers.ts` (39 Branches),
        // `store-style-rules.ts` (79 Branches, aber 95 Functions),
        // `http-build-files.ts` (57 Statements) und `store-themes.ts` (65
        // Branches). Eine gemeinsame Schwelle fuer alle waere die niedrigste
        // von allen - und damit ein Tor, das nichts mehr sichert.
        "packages/engine/src/store-{asset-folders,assets,audit,bake-jobs,code-payloads,collections,deploy,design-records,entries,form-mappers,forms,idempotency,image-jobs,import-jobs,job-mappers,library,library-definition,library-similarity,mcp-audit,notifications,page-mappers,pages,record-mappers,redesign-proposals,reference-library,reference-mappers,references,releases,reviews,revisions,row-utils,settings,sites,token-mappers,tokens}.ts": {
          statements: 85,
          branches: 70,
          functions: 85,
          lines: 85,
        },
        // `store-themes.ts` (Upstream, Schritt 34): 92,85 Statements / 65,38
        // Branches / 100 Functions / 96,22 Lines. Die Branches sind
        // Fehlerpfade, die das Modul selbst verhindert: ein ungueltiges
        // Standard-Theme (die `validateTheme`-Pruefung) und eine leere Zeile
        // nach dem INSERT. Beide zu testen hiesse, die Selbstheilung zu
        // umgehen - der Test wuerde den Zustand erzeugen, den das Modul
        // verhindert. Die eigene Schwelle sichert trotzdem einen Rueckschritt.
        "packages/engine/src/store-themes.ts": {
          statements: 85,
          branches: 60,
          functions: 85,
          lines: 85,
        },
        "packages/engine/src/http-response.ts": {
          statements: 85,
          branches: 70,
          functions: 85,
          lines: 85,
        },
        // Die Route-Module der Schritte 25 (ADR-0019) stehen in der Gruppe
        // oben; die Seiten-Routen haben eigene Schwellen (siehe dort).
        "packages/engine/src/store-settings-mappers.ts": {
          statements: 76,
          branches: 35,
          functions: 66,
          lines: 76,
        },
        "packages/engine/src/store-style-rules.ts": {
          statements: 75,
          branches: 74,
          functions: 90,
          lines: 75,
        },
        "packages/engine/src/http-build-files.ts": {
          statements: 53,
          branches: 44,
          functions: 70,
          lines: 53,
        },
        "packages/editor/src/state/**/*.ts": {
          statements: 60,
          branches: 52,
          functions: 62,
          lines: 60,
        },
        // Die ausgelagerten Werkzeug-Module (P3-2, Schritt 56). Sie entstanden
        // aus `tools.ts` und erben dessen Schwelle: derselbe Code, dieselbe
        // Erwartung. Stand 23.10.2026 (gemessen):
        //   tools.ts             89,78 / 64,60 / 81,81 / 89,78
        //   tools-medien.ts      98,49 / 49,50 / 100   / 98,49
        //   tools-components.ts  97,10 / 65,38 / 100   / 97,10
        //   tools-support.ts     81,81 / 76,92 / 100   / 81,81
        //   tools-schemas.ts    100    / 100   / 100   / 100
        "packages/mcp/src/tools.ts": {
          statements: 85,
          branches: 60,
          // 81,81 statt 82 seit Schritt 56. Die Zahl ist gesunken, die
          // Abdeckung nicht: die 21 Medien-Werkzeuge sind mit ihren 42
          // Funktionen nach `tools-medien.ts` gewandert, und diese 42 waren
          // zu 100 Prozent gedeckt. `tools.ts + tools-medien` ergibt
          // 177/207 - genau der Wert, den `tools.ts` allein vor dem Schnitt
          // hatte. Ein kleinerer Nenner senkt die Quote, auch wenn niemand
          // weniger getestet hat; die Schwelle beschreibt die Datei, nicht
          // den Code.
          functions: 81,
          lines: 85,
        },
        "packages/mcp/src/tools-medien.ts": {
          // Die 21 Werkzeuge haben wenige Verzweigungen: die Spanne 49,50
          // kommt von den optionalen Feldern der Eingabeschemas.
          statements: 95,
          branches: 45,
          functions: 95,
          lines: 95,
        },
        "packages/mcp/src/tools-components.ts": {
          statements: 95,
          branches: 60,
          functions: 95,
          lines: 95,
        },
        "packages/mcp/src/tools-support.ts": {
          statements: 80,
          branches: 72,
          functions: 95,
          lines: 80,
        },
        "packages/mcp/src/tools-schemas.ts": {
          // Nur Konstanten: Statements messen hier die Datenmenge, nicht die
          // Abdeckung. Die Schwelle haelt fest, dass keine Konstante
          // unbenutzt hinzukommt.
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
      },
    },
  },
});