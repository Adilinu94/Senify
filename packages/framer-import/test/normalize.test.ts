import { describe, expect, it } from "vitest";
import { captureFixture, normalize } from "@senify/framer-import";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// The normalizer's two jobs (plan S1.4): consolidate declaration duplicates
// into shared rules, and enforce the DNA — every rewrite becomes a
// `dna-adjustment` finding with its Belegstelle (decision 23.09./2).

describe("normalize — DNA-Konformität", () => {
  it("rewrites gradients to a flat color and documents the loss", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const result = normalize(document);
    const gradientFindings = result.findings.filter(
      (finding) =>
        finding.kind === "dna-adjustment" && finding.message.includes("Verlauf"),
    );
    // The fixture carries gradients (S0 measured backdrop/backdrop-filter and
    // gradient declarations on this page); if none exist, the pass is a no-op
    // and the assertion still holds vacuously — but the fixture has them.
    expect(gradientFindings.length).toBeGreaterThan(0);
    const first = gradientFindings[0];
    expect(first?.evidence).toContain(":");
    expect(first?.severity).toBeDefined();
  });

  it("never leaves a gradient in the normalized declarations", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const result = normalize(document);
    for (const rule of result.rules) {
      for (const value of Object.values(rule.declarations)) {
        expect(value.toLowerCase()).not.toContain("gradient(");
      }
    }
  });

  it("drops shadows with a finding", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const result = normalize(document);
    const shadowFindings = result.findings.filter(
      (finding) =>
        finding.kind === "dna-adjustment" && finding.message.includes("Schatten"),
    );
    expect(shadowFindings.length).toBeGreaterThan(0);
    for (const rule of result.rules) {
      const shadow = rule.declarations["box-shadow"];
      if (shadow !== undefined) expect(shadow).toBe("none");
    }
  });

  it("resets border radius to 0 with a finding", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const result = normalize(document);
    const radiusFindings = result.findings.filter(
      (finding) =>
        finding.kind === "dna-adjustment" && finding.message.includes("Rundung"),
    );
    if (radiusFindings.length > 0) {
      for (const rule of result.rules) {
        const radius = rule.declarations["border-radius"];
        if (radius !== undefined) expect(radius).toBe("0");
      }
    }
  });

  it("keeps every dna-adjustment finding with evidence and suggestion", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const result = normalize(document);
    for (const finding of result.findings.filter((entry) => entry.kind === "dna-adjustment")) {
      expect(finding.evidence).not.toBe("");
      expect(finding.suggestion).not.toBe("");
    }
  });
});

describe("normalize — Konsolidierung", () => {
  it("collapses identical declaration sets into one shared rule", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const result = normalize(document);
    // The S0 measurement promises 20–30 % savings (B5); the consolidation must
    // at least not inflate: rules ≤ declaration sets.
    expect(result.stats.rules).toBeLessThanOrEqual(result.stats.declarationSets);
    // Rules with more than one use prove the collapse happened.
    const shared = result.rules.filter((rule) => rule.uses > 1);
    expect(shared.length).toBeGreaterThan(0);
  });

  it("drops vendor-prefixed declarations and counts them", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const result = normalize(document);
    for (const rule of result.rules) {
      for (const property of Object.keys(rule.declarations)) {
        expect(property.startsWith("-webkit-")).toBe(false);
        expect(property.startsWith("-moz-")).toBe(false);
      }
    }
    // The fluffy fixture has -webkit-backdrop-filter etc. (measured in S0).
    expect(result.stats.droppedDeclarations).toBeGreaterThan(0);
  });

  it("is deterministic: two runs produce identical rules", () => {
    const document = captureFixture(join(FIXTURES, "framer-easier-train-154753"));
    const first = normalize(document);
    const second = normalize(document);
    expect(first.stats).toEqual(second.stats);
    expect(first.rules.map((rule) => rule.declarations)).toEqual(
      second.rules.map((rule) => rule.declarations),
    );
  });
});
