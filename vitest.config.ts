import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

const alias = Object.fromEntries(
  [
    "core",
    "registry",
    "mcp",
    "engine",
    "renderer",
    "editor",
    "app",
    "analysis-worker",
    "docs-portal",
    "skills",
  ].map((name) => [
    `@senify/${name}`,
    resolve(root, `packages/${name}/src/index.ts`),
  ]),
);

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
