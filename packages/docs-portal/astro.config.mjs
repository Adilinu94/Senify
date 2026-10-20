import { defineConfig } from "astro/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Workspace sources are aliased explicitly (and exactly, never as a prefix)
// so subpath imports like `@senify/registry/components` never fall back to the
// heavy package index with its engine and renderer chain.
//
// P3-3 Punkt 5: there is no alias for `@senify/mcp` any more. The docs take
// the facts about the tools from the manifest, and the manifest is neutral -
// so the docs build does not pull the server (client, handlers, audit wiring)
// in any more.
const here = dirname(fileURLToPath(import.meta.url));
const source = (path) => join(here, path);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (name, path) => ({
  find: new RegExp(`^${escapeRegExp(name)}$`),
  replacement: source(path),
});

export default defineConfig({
  site: "https://senify.local",
  output: "static",
  vite: {
    resolve: {
      alias: [
        exact("@senify/core", "../../packages/core/src/index.ts"),
        exact("@senify/section-sdk", "../../packages/section-sdk/src/index.ts"),
        exact("@senify/registry", "../../packages/registry/src/index.ts"),
        exact(
          "@senify/registry/components",
          "../../packages/registry/src/components/index.ts",
        ),
        exact("@senify/tokens", "../../packages/tokens/src/index.ts"),
        exact("@senify/docs-portal", "./src/index.ts"),
      ],
    },
  },
});