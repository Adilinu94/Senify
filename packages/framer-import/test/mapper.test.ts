import { describe, expect, it } from "vitest";
import { captureFixture, normalize, mapDocument } from "@senify/framer-import";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// The mapper (plan S1.3/S1.5): IR → EditorDocument with the device merge.
// The merge anchor is the measured S0 finding: Framer duplicates elements per
// breakpoint with a shared base-class signature and one framer-v-<hash> each.

describe("mapDocument", () => {
  it("produces a valid EditorDocument shape (version 2, root, styleRules)", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    expect(mapped.document.version).toBe(2);
    expect(mapped.document.rootNodeId).toBe("root");
    expect(mapped.document.nodes["root"]).toBeDefined();
    expect(mapped.document.styleRules.length).toBeGreaterThan(0);
    // Every rule carries the import provenance.
    for (const rule of mapped.document.styleRules) {
      expect(rule.origin?.source).toBe("framer-import");
    }
  });

  it("merges the three header variants into one node with device values", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    // The S0 measurement: three <header> elements (desktop/tablet/phone) in
    // ssr-variant wrappers. The merge must fold them so the document holds
    // fewer header primitives than the capture found elements.
    const headers = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "frame" && node.props["semantic"] === "header",
    );
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.length).toBeLessThan(3);
    // Device overrides exist somewhere in the document.
    expect(mapped.stats.mergedVariants).toBeGreaterThan(0);
  });

  it("maps headings to the heading primitive with a level", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const headings = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "heading",
    );
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      const level = heading.props["level"];
      expect(["h1", "h2", "h3", "h4", "h5", "h6"]).toContain(level);
    }
  });

  it("carries links with their href — as link nodes or inside body html", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const links = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "link",
    );
    const bodies = Object.values(mapped.document.nodes).filter(
      (node) => node.primitive === "body",
    );
    const htmlWithHref = bodies.some((body) =>
      String(body.props["html"] ?? "").includes('href="'),
    );
    // Framer's navigation is a rich-text container with <a> children — those
    // ride in the body html. Standalone text links become link nodes. At
    // least one of the two forms must exist, never neither.
    expect(links.length > 0 || htmlWithHref).toBe(true);
    const withUrl = links.find((link) => {
      const target = link.props["link"];
      return typeof target === "object" && target !== null && "url" in target;
    });
    if (links.length > 0) expect(withUrl).toBeDefined();
  });

  it("derives a theme patch from the font faces", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    // The fixture ships Inter (measured in S0) — the patch must name it.
    expect(mapped.themePatch.fonts).toBeDefined();
    expect(mapped.themePatch.fonts?.body?.family).toBe("Inter");
    expect(mapped.themePatch.fonts?.body?.weights.length).toBeGreaterThan(0);
  });

  it("reports smooth-scroll findings through (S1.6)", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    expect(mapped.findings.some((finding) => finding.kind === "smooth-scroll")).toBe(true);
  });

  it("keeps every node id unique and children consistent", () => {
    const document = captureFixture(join(FIXTURES, "framer-easier-train-154753"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const ids = Object.keys(mapped.document.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of Object.values(mapped.document.nodes)) {
      for (const child of node.children ?? []) {
        expect(mapped.document.nodes[child]).toBeDefined();
      }
    }
  });
});
