import { mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);

// Build artifact for the dashboard shell (agentenglas). What the program was
// serving ad-hoc from `public/app.js` and bundling at runtime for the editor
// now lands in dist/, so `pnpm build` proves there is a real production
// artifact and not just `tsc --noEmit` (R1, Fahrplan P0-4). The server prefers
// this directory when `appDir` is set; development keeps going through
// `public/` + runtime bundling.
//
// Deliberately not done here (Fahrplan P0-4 "Bewusst nicht"): no minify, no
// tree-shake tuning, no code-splitting. This step is about *having* an
// artifact, not about its yet.

const require = createRequire(import.meta.url);
// `new URL(".", import.meta.url)` resolves to the directory containing this
// file (packages/app/), not its parent — join() it with "public"/"dist".
const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(APP_DIR, "public");
const DIST_DIR = process.env.APP_DIST_DIR ?? join(APP_DIR, "dist");

async function bundleAppShell() {
  await build({
    entryPoints: [join(PUBLIC_DIR, "app.js")],
    bundle: true,
    write: true,
    outfile: join(DIST_DIR, "app.js"),
    format: "esm",
    platform: "browser",
    target: "es2022",
    // No sourcemap in the production artifact (R1 is about *existence* of a
    // build, not about debugging it). The dev path keeps serving the raw
    // public/app.js for stack traces.
    sourcemap: false,
    minify: false,
    logLevel: "silent",
  });
}

async function bundleEditor() {
  const entry = require.resolve("@senify/editor/browser");
  await build({
    entryPoints: [entry],
    bundle: true,
    write: true,
    outfile: join(DIST_DIR, "editor.js"),
    format: "esm",
    platform: "browser",
    target: "es2022",
    sourcemap: false,
    minify: false,
    logLevel: "silent",
  });
}

function copyStatics() {
  mkdirSync(DIST_DIR, { recursive: true });
  // `legacy-editor.html` used to ship here (P3-1 Punkte 1-3). Punkt 4 removed
  // it with `mount.ts` itself: the page existed only to mount the retired
  // editor, and that module is gone.
  // `fonts.css` binds Inter/Sora for the dashboard shell itself. It is
  // generated from the editor's own font list (build-fonts.mjs) so there is
  // one source, and it ships next to `ui.css` because without it the shell
  // falls back to system-ui and looks different on every operating system.
  for (const file of ["index.html", "app.css", "ui.css", "fonts.css"]) {
    copyFileSync(join(PUBLIC_DIR, file), join(DIST_DIR, file));
  }
  // Editor fonts ship next to the editor bundle: the dashboard serves them
  // under /editor-fonts/*, the bundle references them by relative path.
  const fontsSrc = fileURLToPath(
    new URL("../editor/assets/fonts", import.meta.url),
  );
  const fontsDest = join(DIST_DIR, "editor-fonts");
  try {
    mkdirSync(fontsDest, { recursive: true });
    for (const file of readdirSync(fontsSrc)) {
      copyFileSync(join(fontsSrc, file), join(fontsDest, file));
    }
  } catch {
    // Editor fonts are optional (they ship in @senify/editor). Skip silently
    // when missing — dev mode keeps serving them from the editor workspace.
  }
  // The previews of the section variants ship next to the bundle the same way;
  // the dashboard serves them under /editor-section-thumbnails/*.
  const thumbnailsSrc = fileURLToPath(
    new URL("../editor/assets/section-thumbnails", import.meta.url),
  );
  const thumbnailsDest = join(DIST_DIR, "editor-section-thumbnails");
  try {
    mkdirSync(thumbnailsDest, { recursive: true });
    for (const file of readdirSync(thumbnailsSrc)) {
      copyFileSync(join(thumbnailsSrc, file), join(thumbnailsDest, file));
    }
  } catch {
    // Without the generated previews the tiles show their names only.
  }
}

const start = Date.now();
mkdirSync(DIST_DIR, { recursive: true });
// Generate the dashboard's @font-face block before the bundling, so the file
// that gets copied into dist/ is the fresh one.
await execFileAsync(process.execPath, [fileURLToPath(new URL("build-fonts.mjs", import.meta.url))]);
await Promise.all([bundleAppShell(), bundleEditor()]);
copyStatics();
console.log(`[app] build → ${resolve(DIST_DIR)} (${Date.now() - start} ms)`);
