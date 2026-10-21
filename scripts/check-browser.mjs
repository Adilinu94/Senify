// Checks whether the browser tests can run at all.
//
// The browser suites skip themselves when Chromium is missing or does not
// match the Playwright version. A skipped browser test is a test that
// checked nothing - and in a full test run it is easy to miss, because the
// summary just says "skipped" (Fachanalyse 5, Abschnitt 7).
//
// The CI sets SENIFY_REQUIRE_BROWSER=1, so there a missing browser turns
// the run red. Locally nobody notices. This script answers the question in
// a second, before the run: "will the browser tests run?"
//
//   pnpm browser:check
//
// It fails with the fix when the browser is missing, and it says so when
// the browser is there.
import { existsSync } from "node:fs";

const playwright = await import("playwright").catch(() => undefined);

if (playwright === undefined) {
  console.error(
    "browser: Playwright ist nicht installiert - die Browser-Suiten ueberspringen sich.\n" +
      "Installieren: pnpm install (Playwright ist eine Entwicklungsabhaengigkeit)",
  );
  process.exit(1);
}

let executable = "";
try {
  executable = playwright.chromium.executablePath();
} catch {
  console.error(
    "browser: der Chromium-Pfad liess sich nicht bestimmen - die Browser-Suiten ueberspringen sich.",
  );
  process.exit(1);
}

if (!existsSync(executable)) {
  console.error(
    `browser: Chromium fehlt oder passt nicht zur Playwright-Version.\n` +
      `  erwartet: ${executable}\n` +
      "Die Browser-Suiten ueberspringen sich dann still - sie pruefen nichts.\n" +
      "Installieren: pnpm exec playwright install chromium",
  );
  process.exit(1);
}

console.log(`browser: Chromium gefunden (${executable}) - die Browser-Suiten laufen.`);
