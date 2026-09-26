import { describe, expect, it } from "vitest";
import { captureFixture, normalize, mapDocument } from "@senify/framer-import";
import { validateDocument } from "@senify/editor/state";
import { compileCss } from "@senify/widget-engine";
import { toCssDocument } from "@senify/editor/state";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// Integrity (plan S1.8): the mapped document passes the editor's validator
// and the CSS compiler — an import that cannot compile is worthless, so the
// gate runs on every fixture.

const FIXTURE_NAMES = [
  "framer-stupendous-football-158496",
  "framer-fluffy-rectangle-418998",
  "framer-easier-train-154753",
] as const;

describe("mapped documents pass validation and compilation", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: validateDocument reports no issues`, () => {
      const document = captureFixture(join(FIXTURES, name));
      const normalized = normalize(document);
      const mapped = mapDocument(document, normalized.rules);
      const issues = validateDocument(mapped.document);
      expect(issues).toEqual([]);
    });

    it(`${name}: the compiler turns the document into CSS without errors`, () => {
      const document = captureFixture(join(FIXTURES, name));
      const normalized = normalize(document);
      const mapped = mapDocument(document, normalized.rules);
      const css = compileCss(toCssDocument(mapped.document));
      expect(css.length).toBeGreaterThan(0);
      // The DNA fence holds: no gradient survives into the stylesheet.
      expect(css.toLowerCase()).not.toContain("gradient(");
    });
  }
});
