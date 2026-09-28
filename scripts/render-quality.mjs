// Renders the measured numbers into `docs/current/qualitaet.md` (Fahrplan P3-6).
//
// Why a generator and not a hand-written table: the numbers in that document
// were a copy. A copy goes stale the moment the code changes, and a stale number
// in a quality document is worse than no number - it reads as a measurement.
//
// The rule from the Fahrplan stands: the numbers are a PROJECTION, not carried
// text. This script reads `coverage/coverage-summary.json` (what the run wrote)
// and writes a delimited block into the document. Everything outside the
// markers is left alone, so the prose in the file - which is judgement, not
// measurement - stays hand-written.
//
// Two modes, because the two questions are different:
//   --check  the block matches what the run measured. Exit 1 if not. This is
//            what CI runs: it fails when the document and the run disagree,
//            which is the moment a human has to decide which one is right.
//   (default) write the block. This is what a human runs after a change.
//
// The block is regenerated, never merged: a merge would let prose and numbers
// drift apart inside the same region, and the drift is what this is here to
// prevent.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SUMMARY = join(ROOT, "coverage", "coverage-summary.json");
const TARGET = join(ROOT, "docs", "current", "qualitaet.md");

// The markers have to survive a careless edit, so they are not markdown
// syntax someone would "clean up" - they are visibly machine-owned.
const BEGIN = "<!-- messwerte:anfang -->";
const END = "<!-- messwerte:ende -->";

function readSummary() {
  if (!existsSync(SUMMARY)) {
    console.error(
      `Kein Messwert gefunden: ${SUMMARY}.\n` +
        "Erst `pnpm test:coverage` fahren - der Generator liest, er misst nicht.",
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(SUMMARY, "utf8"));
}

// One line per protected file, in the order the Fahrplan names them. The
// thresholds are NOT re-read here: they live in `vitest.config.ts` and the
// gate already enforced them. A second copy of the thresholds would be a
// second source of truth, which is the thing this whole step removes.
//
// The coverage summary keys are ABSOLUTE paths with the platform's separator -
// on Windows that is `C:\...\file.ts`, on Linux `/home/.../file.ts`. Matching
// therefore happens on a normalised tail, not on the raw key: a generator that
// only worked on the machine that wrote it would be a second source of truth
// with extra steps.
const PROTECTED = [
  "packages/engine/src/http.ts",
  "packages/engine/src/store.ts",
  "packages/engine/src/lifecycle.ts",
  "packages/engine/src/forms.ts",
  "packages/mcp/src/tools.ts",
  // The editor's state folder is measured as a group, the way the Fahrplan
  // states it. One row, and the row says which files it covers - a table that
  // named fifteen rows nobody read was worse than one honest row.
  "packages/editor/src/state/",
];

function findEntry(summary, path) {
  const normalised = path.replace(/\\/g, "/");
  for (const [key, value] of Object.entries(summary)) {
    if (key === "total") continue;
    const asPosix = key.replace(/\\/g, "/");
    if (asPosix.endsWith(`/${normalised}`) || asPosix === normalised) return value;
  }
  return undefined;
}

function percent(value) {
  return typeof value === "number" ? value.toFixed(2) : "—";
}

// The group rows report a RANGE, not an average. An average hides the file
// that dragged the number down, and the lowest file in a group is the reason
// the threshold sits where it does. Returns the four cells WITHOUT the file
// name, so the caller controls that column and the row always has five.
function groupCells(summary, prefix) {
  const normalised = prefix.replace(/\\/g, "/");
  const entries = Object.entries(summary).filter(([key]) => {
    if (key === "total") return false;
    return key.replace(/\\/g, "/").includes(normalised);
  });
  if (entries.length === 0) return null;
  const range = (pick) => {
    const values = entries
      .map(([, value]) => pick(value))
      .filter((value) => typeof value === "number");
    if (values.length === 0) return "—";
    const low = Math.min(...values);
    const high = Math.max(...values);
    return low === high ? low.toFixed(2) : `${low.toFixed(2)} bis ${high.toFixed(2)}`;
  };
  return {
    count: entries.length,
    statements: range((v) => v.statements?.pct),
    branches: range((v) => v.branches?.pct),
    functions: range((v) => v.functions?.pct),
    lines: range((v) => v.lines?.pct),
  };
}

function render(summary) {
  const lines = [];
  lines.push(BEGIN);
  lines.push("");
  lines.push(
    "<!-- Erzeugt von `scripts/render-quality.mjs` aus `coverage/coverage-summary.json`.",
    "     Nicht von Hand editieren: dieser Block ist ein Messwert, und `pnpm quality:check`",
    "     lässt den Lauf rot werden, sobald Dokument und Lauf auseinanderlaufen. -->",
  );
  lines.push("");
  lines.push(`**Gemessen:** ${new Date().toISOString().slice(0, 10)} · vitest coverage (v8)`);
  lines.push("");
  lines.push("| Pfad | Statements | Branches | Functions | Lines |");
  lines.push("|---|---|---|---|---|");
  for (const path of PROTECTED) {
    if (path.endsWith("/")) {
      const cells = groupCells(summary, path);
      lines.push(
        cells === null
          ? `| \`${path}*\` | nicht gemessen | nicht gemessen | nicht gemessen | nicht gemessen |`
          : `| \`${path}*\` (${cells.count} Dateien) | ${cells.statements} | ${cells.branches} | ` +
            `${cells.functions} | ${cells.lines} |`,
      );
      continue;
    }
    const entry = findEntry(summary, path);
    if (entry === undefined) {
      // A file the summary does not mention was not measured in this run. Saying
      // so is better than a zero: a zero would read as "nothing is covered"
      // and quietly hide a gap in the run itself.
      lines.push(`| \`${path}\` | nicht gemessen | nicht gemessen | nicht gemessen | nicht gemessen |`);
      continue;
    }
    lines.push(
      `| \`${path}\` | ${percent(entry.statements?.pct)} | ${percent(entry.branches?.pct)} | ` +
        `${percent(entry.functions?.pct)} | ${percent(entry.lines?.pct)} |`,
    );
  }
  const total = summary.total;
  if (total !== undefined) {
    lines.push("");
    lines.push(
      `**Über alle gemessenen Dateien:** Statements ${percent(total.statements?.pct)} · ` +
        `Branches ${percent(total.branches?.pct)} · Functions ${percent(total.functions?.pct)} · ` +
        `Lines ${percent(total.lines?.pct)}`,
    );
  }
  lines.push("");
  lines.push(END);
  return lines.join("\n");
}

const block = render(readSummary());
const current = readFileSync(TARGET, "utf8");

if (!current.includes(BEGIN) || !current.includes(END)) {
  console.error(
    `${TARGET} enthält die Marker ${BEGIN} / ${END} nicht.\n` +
      "Der Generator ersetzt nur den Block zwischen ihnen - ohne beide Marker wäre\n" +
      "die Entscheidung, wo der Text aufhört, eine Vermutung. Marker setzen und\n" +
      "den Block einmal von Hand eintragen, dann ist er ab da Pflege.",
  );
  process.exit(1);
}

const head = current.slice(0, current.indexOf(BEGIN));
const tail = current.slice(current.indexOf(END) + END.length);
const next = `${head}${block}${tail}`;

if (process.argv.includes("--check")) {
  if (next === current) {
    console.log("qualitaet.md stimmt mit dem Lauf überein.");
    process.exit(0);
  }
  console.error(
    "qualitaet.md weicht vom Lauf ab.\n" +
      "Entweder hat sich der Code geändert (dann `pnpm quality:render`) oder der\n" +
      "Lauf ist unvollständig (dann `pnpm test:coverage` wiederholen).",
  );
  process.exit(1);
}

if (next === current) {
  console.log("qualitaet.md ist bereits aktuell.");
  process.exit(0);
}
writeFileSync(TARGET, next, "utf8");
console.log(`qualitaet.md aktualisiert (${new Date().toISOString().slice(0, 19)}Z).`);
