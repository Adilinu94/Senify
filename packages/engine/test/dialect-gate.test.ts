import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The dialect gate of ADR-0004 (ticket 15): Senify is Postgres-only by
// decision, and the exit to a dual-dialect model stays cheap only while the
// Postgres-isms live in `db.ts` alone. The scan runs over the engine sources;
// `db.ts` is the schema layer where they are allowed. Tests and fixtures are
// out of scope — the gate guards the shipped repositories, not the harness.

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  // `$1::jsonb`, `x::text` — SQL casts; IPv6 literals ("::1") do not match.
  { label: ":: cast", pattern: /\w\s*::\s*\w/ },
  // SQL `now()`; `Date.now()` and `this.#now()` are fine.
  { label: "now() in DML", pattern: /(?<![.#\w])now\s*\(\s*\)/i },
  { label: "DISTINCT ON", pattern: /\bdistinct\s+on\b/i },
  {
    label: "ADD COLUMN IF NOT EXISTS",
    pattern: /\badd\s+column\s+if\s+not\s+exists\b/i,
  },
];

function tsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("postgres dialect gate (ADR-0004)", () => {
  it("keeps Postgres-isms inside db.ts", () => {
    const offenders: string[] = [];
    for (const file of tsFiles(srcDir)) {
      if (file.endsWith(`${sep}db.ts`)) continue;
      const text = readFileSync(file, "utf8");
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(text)) {
          offenders.push(`${relative(srcDir, file)} → ${rule.label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Control: the patterns have to catch a real violation, or the gate is green
  // for the wrong reason (the Phase-1 counterproof pattern).
  it("catches a violation sample", () => {
    const sample =
      "SELECT $1::jsonb FROM t WHERE at = now() DISTINCT ON (x); ALTER TABLE t ADD COLUMN IF NOT EXISTS y jsonb";
    expect(FORBIDDEN.filter((rule) => rule.pattern.test(sample))).toHaveLength(4);
  });
});
