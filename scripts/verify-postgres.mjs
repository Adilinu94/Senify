// Die Postgres-Lane als blockierender Schritt (Fahrplan P1-1, R11): fuehrt die
// beiden Testdateien aus, die Transaktionssemantik NUR gegen eine echte
// Datenbank beweisen, und faellt rot, wenn auch nur ein Fall uebersprungen wird.
//
// Warum ein eigenes Tor und nicht einfach `pnpm test`: beide Dateien uebersprin-
// gen still, wenn TEST_DATABASE_URL fehlt (pg-mem ignoriert ROLLBACK, ein
// Atomaritaets-test darauf waehre ein falscher Beweis). Ein Tor, das bei
// fehlender Datenbank gruen bleibt, beweist nichts - deshalb ist die Umgebungs-
// variable Pflicht und ein Skip ein Fehlschlag.
//
// Aufruf: `pnpm test:postgres` mit gesetztem TEST_DATABASE_URL. In CI stellt der
// Job `postgres-tests` in .github/workflows/verify.yml die Datenbank bereit
// (siehe Fahrplan P1-1). Die Scope-Anlage und ihr Schema uebernimmt
// packages/engine/test/helpers.ts: jede Datei bekommt ein eigenes, veraenderliches
// Schema und raeumt es beim Schliessen wieder weg.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SUITE = [
  "packages/engine/test/transactions.test.ts",
  "packages/engine/test/redesign-transaction.test.ts",
];

if ((process.env.TEST_DATABASE_URL ?? "").length === 0) {
  console.error(
    "Postgres-Lane: TEST_DATABASE_URL fehlt. Diese Lane ist als Nachweis gegen " +
      "eine echte Datenbank gedacht und ueberspringt nicht still - ohne " +
      "Verbindung ist ihr Ergebnis wertlos. lokal: eine Postgres starten und " +
      'TEST_DATABASE_URL="postgres://user:pass@localhost:5432/senify" setzen.',
  );
  process.exit(1);
}

const vitest = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
if (!existsSync(vitest)) {
  console.error("Postgres-Lane: vitest nicht gefunden - erst `pnpm install` ausfuehren.");
  process.exit(1);
}

const reportFile = join(
  tmpdir(),
  `senify-postgres-lane-${process.pid}-${Date.now()}.json`,
);

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    ...SUITE,
    "--reporter=default",
    "--reporter=json",
    // Quoted: with shell:true (Windows) a tmpdir containing spaces would split into two args.
    `--outputFile.json="${reportFile}"`,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

const verdict = readVerdict(reportFile);
rmSync(reportFile, { force: true });

if ((result.status ?? 1) !== 0) {
  console.error("Postgres-Lane: rot - mindestens ein Test ist fehlgeschlagen.");
  process.exit(result.status ?? 1);
}
if (verdict === undefined) {
  console.error(
    `Postgres-Lane: rot - der Vitest-Report fehlt oder ist unlesbar (${reportFile}). ` +
      "Die Zahl der uebersprungenen Faelle laesst sich nicht pruefen.",
  );
  process.exit(1);
}
if (verdict.skipped > 0) {
  console.error(
    `Postgres-Lane: rot - ${verdict.skipped} von ${verdict.total} Faellen sind ` +
      "uebersprungen. Diese Lane gilt nur mit 0 uebersprungenen Faellen " +
      "(Fahrplan P1-1, Done-Bedingung).",
  );
  process.exit(1);
}
if (verdict.passed === 0) {
  console.error(
    "Postgres-Lane: rot - kein einziger Fall ist gelaufen. Ein leerer Lauf ist " +
      "kein Nachweis.",
  );
  process.exit(1);
}

console.log(
  `Postgres-Lane: gruen - ${verdict.passed} Faelle gegen echte Postgres, 0 uebersprungen.`,
);

// Zaehlt die Einzelfaelle aus dem Vitest-JSON-Report. Der Report traegt pro
// Datei `assertionResults` mit Status; uebersprungen erscheint als `skipped`
// oder `pending`, je nach Version und Grund.
function readVerdict(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  const counts = { total: 0, passed: 0, skipped: 0 };
  for (const file of raw.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      counts.total += 1;
      if (assertion.status === "passed") counts.passed += 1;
      if (assertion.status === "skipped" || assertion.status === "pending") {
        counts.skipped += 1;
      }
    }
  }
  if (counts.total === 0) return undefined;
  return counts;
}
