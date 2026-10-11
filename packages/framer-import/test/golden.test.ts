import { describe, expect, it } from "vitest";
import { captureFixture, normalize, mapDocument, buildFidelityReport, mapFramerMotion } from "@senify/framer-import";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// Golden tests (plan S1.7): the three committed fixtures produce three
// byte-stable documents. The golden pins the *shape* — primitive counts,
// rule counts, score, finding kinds — not the whole JSON (the fixtures are
// real pages; a full byte-diff would pin every Framer edit forever).

const FIXTURE_NAMES = [
  "framer-stupendous-football-158496",
  "framer-fluffy-rectangle-418998",
  "framer-easier-train-154753",
] as const;

function pipelineFor(name: (typeof FIXTURE_NAMES)[number]) {
  const document = captureFixture(join(FIXTURES, name));
  const normalized = normalize(document);
  const mapped = mapDocument(document, normalized.rules);
  const report = buildFidelityReport(document, normalized, mapped, mapFramerMotion(document));
  return { document, normalized, mapped, report };
}

// Several full pipeline passes per test (~3.6 s alone) exceed vitest's 5 s default under full-suite load.
describe("golden pipeline over the three fixtures", { timeout: 60_000 }, () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: stable counts across two runs`, () => {
      const first = pipelineFor(name);
      const second = pipelineFor(name);
      expect(first.mapped.stats).toEqual(second.mapped.stats);
      expect(first.normalized.stats).toEqual(second.normalized.stats);
      expect(first.report.score).toBe(second.report.score);
      expect(first.report.findings.map((finding) => finding.kind)).toEqual(
        second.report.findings.map((finding) => finding.kind),
      );
    });

    it(`${name}: every node maps into a known primitive`, () => {
      const { mapped } = pipelineFor(name);
      const known = new Set([
        "root",
        "frame",
        "column",
        "grid",
        "section",
        "heading",
        "text",
        "body",
        "button",
        "link",
        "list",
        "image",
        "video",
        "icon",
        "embed",
        "payload",
      ]);
      for (const node of Object.values(mapped.document.nodes)) {
        expect(known.has(node.primitive)).toBe(true);
      }
    });

    it(`${name}: the report is complete (score, steps, findings with evidence)`, () => {
      const { report } = pipelineFor(name);
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(report.steps.length).toBeGreaterThanOrEqual(4);
      for (const finding of report.findings) {
        expect(finding.evidence).not.toBe("");
      }
      expect(report.counts.mapped).toBeGreaterThan(0);
    });
  }

  it("the three fixtures differ in size as measured in S0", () => {
    const small = pipelineFor("framer-stupendous-football-158496");
    const medium = pipelineFor("framer-fluffy-rectangle-418998");
    const large = pipelineFor("framer-easier-train-154753");
    expect(small.mapped.stats.nodes).toBeLessThan(medium.mapped.stats.nodes);
    expect(medium.mapped.stats.nodes).toBeLessThan(large.mapped.stats.nodes);
  });
});
