// Regenerates `docs/mcp-route-matrix.md` from the engine ROUTES and the
// manifest facts: `pnpm route-matrix` from the repo root.
//
// `--check` compares instead of writing (the pattern of the manifest): a
// generated file nobody checks drifts silently - the matrix would list the
// routes of a module that no longer exists, and a reader cannot tell that
// from a correct table.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_MANIFEST } from "@senify/manifest";
import {
  buildRouteMatrixFromManifest,
  renderRouteMatrix,
} from "../src/route-matrix.ts";

const engineDir = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(dirname(engineDir));
// Die Routen liegen in der Tabelle in `http.ts` und in den Modulen
// `http-routes-*.ts` (ADR-0019) - alle werden gelesen.
const srcDir = join(engineDir, "src");
const routeFiles = [
  join(srcDir, "http.ts"),
  // Die Reihenfolge von `readdirSync` hängt vom Dateisystem ab: auf ext4 ist
  // sie eine andere als auf NTFS. Ohne die Sortierung lieferte derselbe
  // Code je Maschine eine andere Matrix - und die eingecheckte Datei konnte
  // keine der beiden erfüllen.
  ...readdirSync(srcDir)
    .filter((name) => name.startsWith("http-routes-") && name.endsWith(".ts"))
    .sort()
    .map((name) => join(srcDir, name)),
];
const httpSource = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const serverSource = readFileSync(
  join(root, "packages", "mcp", "src", "server.ts"),
  "utf8",
);
const rows = buildRouteMatrixFromManifest(httpSource, TOOL_MANIFEST, serverSource);
const markdown = renderRouteMatrix(rows);
const ziel = join(root, "docs", "mcp-route-matrix.md");

if (process.argv.includes("--check")) {
  const normalisieren = (text: string): string => text.replace(/\r\n/g, "\n");
  const vorhanden = readFileSync(ziel, "utf8");
  if (normalisieren(vorhanden) === normalisieren(markdown)) {
    console.log(`route matrix: unveraendert (${rows.length} Routen)`);
    process.exit(0);
  }
  console.error(
    "route matrix: docs/mcp-route-matrix.md weicht vom Generator ab.\n" +
      "Neu erzeugen: pnpm route-matrix",
  );
  process.exit(1);
}

writeFileSync(ziel, markdown);
console.log(`route matrix: ${rows.length} routes written`);
