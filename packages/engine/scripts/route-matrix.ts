// Regenerates `docs/mcp-route-matrix.md` from the engine ROUTES and the MCP
// tool catalog: `pnpm route-matrix` from the repo root.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRouteMatrix,
  renderRouteMatrix,
} from "../src/route-matrix.ts";

const engineDir = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(dirname(engineDir));
const httpSource = readFileSync(join(engineDir, "src", "http.ts"), "utf8");
const toolsSource = readFileSync(
  join(root, "packages", "mcp", "src", "tools.ts"),
  "utf8",
);
const serverSource = readFileSync(
  join(root, "packages", "mcp", "src", "server.ts"),
  "utf8",
);
const rows = buildRouteMatrix(httpSource, toolsSource, serverSource);
const stand = new Date().toISOString().slice(0, 10) ?? "";
const markdown = renderRouteMatrix(rows, stand);
writeFileSync(join(root, "docs", "mcp-route-matrix.md"), markdown);
console.log(`route matrix: ${rows.length} routes written`);
