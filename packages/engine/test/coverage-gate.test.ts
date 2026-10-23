import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Das Coverage-Tor misst die ausgelagerten Fachmodule der Engine (ADR-0019,
// P3-2). Es misst sie ueber zwei Globs (`store-*.ts`, `http-*.ts`), die
// Schwelle haengt aber an einer AUFZAEHLUNG von Namen. Wer ein Modul aus der
// Liste vergisst, bekommt keine rote Zahl: die Datei wird weiter gemessen,
// ihre Quote steht im Bericht - und niemand meldet einen Rueckschritt.
//
// Genau das war am 22.10.2026 der Fall: `store-settings.ts` und
// `store-reviews.ts` standen in `include`, aber in keiner Schwelle. Beide
// waren gut gemessen (97,25 und 98,04 Prozent Statements) - das Tor haette
// ihren Verfall trotzdem nicht gemeldet.
//
// Diese Pruefung liest beide Seiten: die Dateien auf der Platte und die
// Schwellen in `vitest.config.ts`. Sie ist absichtlich streng: jede gemessene
// Datei braucht eine Schwelle, und jede Schwelle braucht eine Datei. Eine
// Schwelle fuer eine Datei, die es nicht gibt, ist genauso ein Fehler - sie
// sichert nichts und tarnt sich als Deckung.
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(dirname(here)));
const srcDir = join(root, "packages", "engine", "src");
const configPath = join(root, "vitest.config.ts");

const config = readFileSync(configPath, "utf8");

// Eine Schwellen-Gruppe ist ein Schluessel wie
// `packages/engine/src/store-{a,b,c}.ts` oder `packages/engine/src/http-*.ts`.
// Die geschweiften Klammern sind eine Aufzaehlung, der Stern ein Glob.
type Gruppe = { exact: string[]; globs: string[] };

function groupFiles(pattern: string): Gruppe {
  const brace = /^(.*)\{([^}]+)\}(.*)$/.exec(pattern);
  if (brace) {
    const prefix = brace[1] ?? "";
    const namen = brace[2] ?? "";
    const suffix = brace[3] ?? "";
    return { exact: namen.split(",").map((name) => `${prefix}${name}${suffix}`), globs: [] };
  }
  if (pattern.includes("*")) return { exact: [], globs: [pattern] };
  return { exact: [pattern], globs: [] };
}

function ohneKommentare(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

const saeuber = ohneKommentare(config);

// Die Schwellen stehen in `thresholds` als achtfach eingerueckte Schluessel.
const thresholdKeys: string[] = [];
for (const match of saeuber.matchAll(/^ {8}"([^"]+)":\s*\{/gm)) {
  const key = match[1];
  if (key !== undefined && key.includes("packages/")) thresholdKeys.push(key);
}

const exact = new Set<string>();
const globs: string[] = [];
for (const key of thresholdKeys) {
  const gruppe = groupFiles(key);
  for (const file of gruppe.exact) exact.add(file);
  for (const pattern of gruppe.globs) globs.push(pattern);
}

// Die gemessenen Engine-Module: `store.ts` und `http.ts` stehen einzeln im
// Include, die Fachmodule ueber die zwei Globs.
const gemessen = [
  "packages/engine/src/store.ts",
  "packages/engine/src/http.ts",
  ...readdirSync(srcDir)
    .filter((name) => /^(store|http)-.*\.ts$/.test(name))
    .map((name) => `packages/engine/src/${name}`),
];

// `http-contract.ts` haelt nur Typen und ist in `exclude` - eine Schwelle
// darauf waere eine Zahl ohne Aussage. Die Ausnahme steht hier mit Grund,
// nicht als stiller Filter.
const NUR_TYPEN = new Set(["packages/engine/src/http-contract.ts"]);

function istGedeckt(file: string): boolean {
  if (exact.has(file)) return true;
  return globs.some((pattern) => {
    if (pattern.endsWith("http-*.ts")) return /\/http-.*\.ts$/.test(file);
    if (pattern.endsWith("store-*.ts")) return /\/store-.*\.ts$/.test(file);
    return false;
  });
}

describe("Coverage-Tor: jede gemessene Datei hat eine Schwelle", () => {
  it("deckt jedes gemessene Engine-Modul ab", () => {
    const ohneSchwelle = gemessen.filter((file) => !NUR_TYPEN.has(file) && !istGedeckt(file));
    expect(ohneSchwelle).toEqual([]);
  });

  it("nennt keine Schwelle fuer eine Datei, die es nicht gibt", () => {
    // Gegen die Platte pruefen, nicht gegen die Liste oben: `lifecycle.ts`
    // und `forms.ts` tragen eine Schwelle, sind aber keine Fachmodule und
    // stehen deshalb nicht in `gemessen`.
    const verwaist = [...exact].filter(
      (file) => file.includes("packages/engine/src/") && !existsSync(join(root, file)),
    );
    expect(verwaist).toEqual([]);
  });

  it("nimmt beide Praefixe in die Messung auf", () => {
    // Die Gegenrichtung: eine Schwelle fuer ein Modul ausserhalb von
    // `include` misst nichts. Der Include-Block steht unter `coverage:`.
    const coverage = /coverage:\s*\{([\s\S]*?)\n {6}\}/.exec(saeuber)?.[1] ?? "";
    expect(coverage).toContain("packages/engine/src/store-*.ts");
    expect(coverage).toContain("packages/engine/src/http-*.ts");
  });
});
