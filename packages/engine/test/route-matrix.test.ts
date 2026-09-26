import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRouteMatrix,
  type MatrixStatus,
} from "../src/route-matrix.ts";

const engineDir = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(dirname(engineDir));

function documentedRows(markdown: string): { key: string; status: string }[] {
  return markdown
    .split("\n")
    .filter((line) => /^\| (GET|POST|PATCH|PUT|DELETE) /.test(line))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      return {
        key: `${cells[1] ?? ""} ${(cells[2] ?? "").replace(/`/g, "")}`,
        status: cells[4] ?? "",
      };
    });
}

describe("mcp route matrix (E4 slice 2)", () => {
  it("covers every engine route with a conscious status", () => {
    const http = readFileSync(join(engineDir, "src", "http.ts"), "utf8");
    const tools = readFileSync(
      join(root, "packages", "mcp", "src", "tools.ts"),
      "utf8",
    );
    const server = readFileSync(
      join(root, "packages", "mcp", "src", "server.ts"),
      "utf8",
    );
    const rows = buildRouteMatrix(http, tools, server);
    expect(rows.length).toBeGreaterThan(0);
    const markdown = readFileSync(
      join(root, "docs", "mcp-route-matrix.md"),
      "utf8",
    );
    const documented = new Map(
      documentedRows(markdown).map((row) => [row.key, row.status]),
    );
    const valid: MatrixStatus[] = ["Tool", "Workflow-gebündelt", "Operator"];
    for (const row of rows) {
      const key = `${row.method} ${row.path}`;
      const status = documented.get(key);
      expect(
        status,
        `Route ${key} fehlt in docs/mcp-route-matrix.md (neu erzeugen: pnpm route-matrix)`,
      ).toBeDefined();
      expect(valid).toContain(status);
    }
    // No stale rows: the document matches the sources exactly.
    expect(documented.size).toBe(rows.length);
  });
});
