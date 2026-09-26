// Artefakt-Tor (P0-4, R1): nach `pnpm build` muss `packages/app/dist`
// tatsaechlich eine auslieferbare Dashboard-Shell enthalten. Der Gate steht
// hier als Skript (nicht nur als vitest-Test), weil `verify` ohnehin bereits
// `pnpm build` ausfuehrt — ein Skript liest sich im CI-Log direkter.
//
// Aufruf: `pnpm exec node scripts/verify-dist.mjs` oder als Teil von
// `pnpm verify`. Exit 0 heisst: Artefakt erzeugt, keine 0-Byte-Dateien,
// Editor-Bundle resolved `import`, index.html referenziert die Artefakte.
//
// Fahrplan P0-4: "Ein bundler-basiertes dist/ ist das Ziel, nicht die
// Feinabstimmung." — dieses Tor prueft die Existenz, nicht Optimierung.
import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST_DIR = fileURLToPath(new URL("../packages/app/dist", import.meta.url));
const REQUIRED = ["index.html", "app.js", "app.css", "ui.css", "editor.js"];

const failures = [];
for (const file of REQUIRED) {
  const path = join(DIST_DIR, file);
  if (!existsSync(path)) {
    failures.push(`${file} fehlt`);
    continue;
  }
  const size = statSync(path).size;
  if (size < 1000) {
    failures.push(`${file} ist winzig (${size} B) — vermutlich korrupt`);
  }
}

// app.js muss ein echtes Bundle sein (nicht die Quelldatei, die Definitionen
// importiert).
const appJs = readFileSync(join(DIST_DIR, "app.js"), "utf8");
if (!appJs.includes("function") && !appJs.includes("=>")) {
  failures.push("app.js sieht nicht nach einem Bundle aus");
}
// editor.js loest die @senify/editor/browser-Importe auf; ein Broken-Bundle
// haette keine "document.createElement"-Rezepte mehr.
const editorJs = readFileSync(join(DIST_DIR, "editor.js"), "utf8");
if (!editorJs.includes("createElement")) {
  failures.push("editor.js sieht nicht nach einem Bundle aus");
}

// Editor-Fonts: die inter-*.woff2 muessen kopiert sein, sonst greift der
// @font-face.
const fontsDir = join(DIST_DIR, "editor-fonts");
if (!existsSync(fontsDir)) {
  failures.push("editor-fonts/ fehlt");
} else {
  const size = statSync(joins(fontsDir, "Inter-Regular.woff2")).size;
  if (size < 50_000) {
    failures.push(`Inter-Regular.woff2 ist korrupt (${size} B)`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`verify-dist: ${failure}`);
  }
  process.exit(1);
}
console.log(`verify-dist: ${DIST_DIR} enthaelt ${REQUIRED.length} Artefakte (Exit 0)`);

function joins(...segments) {
  return join(...segments);
}
