import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const { chromium } = await import("playwright");
let executablePath = "";
try {
  executablePath = chromium.executablePath();
} catch {
  // Der Fehler wird unten mit einer actionable Meldung ausgegeben.
}

if (!executablePath || !existsSync(executablePath)) {
  console.error(
    "Visual-Gate blockiert: Chromium fehlt. Bitte `pnpm exec playwright install chromium` ausführen.",
  );
  process.exit(1);
}

const vitestPath = resolve(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitestPath, "run", "packages/app/test/visual-snapshot-browser.test.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, SENIFY_REQUIRE_BROWSER: "1" },
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
