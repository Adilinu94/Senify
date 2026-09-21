// Das Paritaets-Tor als blockierender Schritt (Ticket 17 Punkt 5, Luecke L4):
// fuehrt den Release-Cutover-Browser-Test mit PFLICHT-Browser aus. Fehlt
// Playwright oder der Chromium-Build, faellt das Tor rot statt still zu
// ueberspringen; weichen Canvas und Release ab, endet es mit Exit 1.
//
// Der Lauf startet ueber `pnpm exec vitest`: pnpm setzt die Modulpfade, die der
// Astro-Bake fuer `tailwindcss` braucht (ein direkter `node vitest.mjs`-Start
// scheitert an der Aufloesung aus dem Stage-Verzeichnis).
//
// Aufruf: `pnpm verify:parity` (in CI nach `pnpm verify`, siehe
// .github/workflows/verify.yml). Die Zahlen (Kopf-/Sektions-Diff) stehen als
// CUTOVER-PARITY im Testlauf.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
if (!existsSync(vitest)) {
  console.error("Paritaets-Tor: vitest nicht gefunden - erst `pnpm install` ausfuehren.");
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "packages/app/test/release-cutover-browser.test.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, SENIFY_REQUIRE_BROWSER: "1" },
    // Windows braucht die Shell fuer pnpm.cmd; die Argumente tragen keine Leerzeichen.
    shell: process.platform === "win32",
  },
);

if ((result.status ?? 1) !== 0) {
  console.error(
    "Paritaets-Tor: rot - Canvas und Release weichen ab, oder der Browser fehlt " +
      "(`pnpm exec playwright install chromium`).",
  );
}
process.exit(result.status ?? 1);
