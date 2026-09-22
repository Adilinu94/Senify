// The 3D runtime (ticket 19, M6): the `webgl-scene` island imports three.js
// lazily, so the file ships next to the other vendored runtime files. Three
// no longer publishes a minified build (r150+), and the module build pulls
// `three.core.js` as a second request — bundling at bake time keeps the island
// to one minified file that always matches the installed version. The entry
// lists exactly the classes the island uses; esbuild tree-shakes the rest.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const rendererDir = dirname(fileURLToPath(import.meta.url));

const ENTRY = `
export {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from "three";
`;

// The installed three version travels in the banner: the test pins it against
// the dependency, so a dependency bump without a fresh bundle fails loudly.
export function threeVersion(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("three");
  const pkg = JSON.parse(
    readFileSync(join(dirname(entry), "..", "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}

let cached: string | undefined;

export function webglVendorCode(): string {
  if (cached !== undefined) return cached;
  const result = buildSync({
    stdin: { contents: ENTRY, resolveDir: rendererDir, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2020",
    write: false,
    legalComments: "none",
    banner: {
      js: `/* three.js r${threeVersion()} (MIT) — bundled by @senify/renderer for the webgl-scene island. */`,
    },
  });
  const file = result.outputFiles[0];
  if (file === undefined) throw new Error("three bundle produced no output");
  cached = file.text;
  return cached;
}
