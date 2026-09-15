import { defineConfig } from "astro/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Workspace sources are aliased explicitly so the portal builds without
// relying on a local tsconfig or a publish step.
const here = dirname(fileURLToPath(import.meta.url));
const source = (path) => join(here, path);

export default defineConfig({
  site: "https://senify.local",
  output: "static",
  vite: {
    resolve: {
      alias: {
        "@senify/core": source("../../packages/core/src/index.ts"),
        "@senify/section-sdk": source("../../packages/section-sdk/src/index.ts"),
        // Exact entry before the bare one: "@senify/registry" also matches the
        // "/components" subpath and would resolve it as index.ts/components.
        "@senify/registry/components": source("../../packages/registry/src/components/index.ts"),
        "@senify/registry": source("../../packages/registry/src/index.ts"),
        // The portal only needs the tool catalog; the package root would pull
        // the CLI and with it the whole app shell into this build.
        "@senify/mcp": source("../../packages/mcp/src/tools.ts"),
        "@senify/tokens": source("../../packages/tokens/src/index.ts"),
        "@senify/docs-portal": source("./src/index.ts"),
      },
    },
  },
});