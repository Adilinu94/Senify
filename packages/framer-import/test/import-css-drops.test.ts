import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { styleRulesReport } from "@senify/renderer";
import { runImport } from "../src/index.ts";

// The compiler drops a value it cannot take (`inset: 0` as text, an object where a
// length belongs) and the bake only warns. An import that hands the compiler such
// a value loses the look without a visible error: an overlay pinned with
// `inset:0` collapsed to a point, a `gap` vanished. This gate keeps the count at
// zero on the real Framer exports, in both modes.
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const fixtures = readdirSync(FIXTURES).filter((name) => name.startsWith("framer-"));

describe("what the compiler drops from an import", () => {
  for (const fixture of fixtures) {
    for (const mode of ["fidelity", "dna"] as const) {
      it(`${fixture} (${mode}): no value is dropped and no image sits in a background colour`, async () => {
        const run = await runImport({ source: { kind: "mirror", rootDir: resolve(FIXTURES, fixture) }, mode });
        const tree = editorDocumentToNodeTree(run.mapped.document);
        const report = styleRulesReport(
          [{ path: "/", tree }],
          run.mapped.rules,
          run.breakpoints ?? undefined,
        );
        expect(report.diagnostics.map((drop) => `${drop.property}=${String(drop.value)}`)).toEqual([]);

        // A gradient or url() in `background` compiles to `background-color`, which
        // is invalid CSS the compiler does not report.
        const imageInColour = Object.values(run.mapped.document.nodes).filter((node) => {
          const background = node.props["background"];
          return typeof background === "string" && /(gradient|url)\(/i.test(background);
        });
        expect(imageInColour).toEqual([]);
      }, 120_000);
    }
  }
});
