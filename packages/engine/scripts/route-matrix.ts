// Regenerates `docs/mcp-route-matrix.md` from the engine ROUTES and the
// manifest facts: `pnpm route-matrix` from the repo root.
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
  ...readdirSync(srcDir)
    .filter((name) => name.startsWith("http-routes-") && name.endsWith(".ts"))
    .map((name) => join(srcDir, name)),
];
const httpSource = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const serverSource = readFileSync(
  join(root, "packages", "mcp", "src", "server.ts"),
  "utf8",
);
const rows = buildRouteMatrixFromManifest(httpSource, TOOL_MANIFEST, serverSource);
const stand = new Date().toISOString().slice(0, 10) ?? "";
const markdown = renderRouteMatrix(rows, stand);
writeFileSync(join(root, "docs", "mcp-route-matrix.md"), markdown);
console.log(`route matrix: ${rows.length} routes written`);
