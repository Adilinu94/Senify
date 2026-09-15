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
  },
});
