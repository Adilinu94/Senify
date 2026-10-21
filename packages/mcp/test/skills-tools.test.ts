import { describe, expect, it } from "vitest";
import { TOOL_MANIFEST } from "@senify/manifest";
import { skillFiles } from "@senify/skills";

// The skills tell the agent which tool to call. A name that no longer exists
// is a promise the agent cannot keep - and the agent finds out at the worst
// moment: in the middle of a task, from a tool that is not there.
//
// The check lives here because this is the one package that knows both sides:
// the skills (it ships them) and the manifest (it holds the facts about the
// tools). The skills package itself must stay free of dependencies
// (dependency-cruiser: `skills-know-nobody`).

// Names that appear in the skills but are not tools: `dry_run` is a flag of a
// mutation batch, `invalid_input` is an error category. Every other name has
// to be a tool of the manifest - a new name in a skill is either a tool or an
// addition to this list, with a reason.
const KEPT_NAMES = new Map<string, string>([
  ["dry_run", "a flag of a mutation batch, not a tool"],
  ["invalid_input", "an error category, not a tool"],
]);

// A tool name looks like `apply_mutations`: lower case, words joined by an
// underscore. The pattern ignores camelCase (`assetRef`) and hyphenated names
// (`image-use`), which are neither.
const TOOL_NAME = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

describe("die Skills nennen nur Werkzeuge, die es gibt", () => {
  it("nennt kein unbekanntes Werkzeug", () => {
    const known = new Set(TOOL_MANIFEST.map((tool) => tool.name));
    const unknown = new Map<string, string[]>();
    for (const file of skillFiles()) {
      for (const name of file.content.match(TOOL_NAME) ?? []) {
        if (known.has(name) || KEPT_NAMES.has(name)) continue;
        const where = unknown.get(name) ?? [];
        where.push(file.name);
        unknown.set(name, where);
      }
    }
    const report = [...unknown.entries()]
      .map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`)
      .sort();
    expect(
      report,
      `Unbekannte Werkzeugnamen in den Skills: ${report.join("; ")}`,
    ).toEqual([]);
  });

  it("kennt jeden Namen, den es ausdrücklich ausnimmt", () => {
    // Eine Ausnahme, die es nicht mehr braucht, ist eine Ausnahme, die
    // einen Namen verdeckt: sie waere der Grund, warum ein falscher Name
    // durchginge.
    const names = new Set<string>();
    for (const file of skillFiles()) {
      for (const name of file.content.match(TOOL_NAME) ?? []) names.add(name);
    }
    const obsolete = [...KEPT_NAMES.keys()].filter((name) => !names.has(name));
    expect(obsolete, `Ausnahmen ohne Fundstelle: ${obsolete.join(", ")}`).toEqual([]);
  });
});
