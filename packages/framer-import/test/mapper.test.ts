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

  it("keeps structurally different header variants, each visible on its own device only", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    // The S0 measurement: three <header> elements (desktop/tablet/phone) in
    // ssr-variant wrappers. Their markup differs per breakpoint (the phone
    // header has another menu structure), so they cannot fold into one node
    // without losing content. Each copy states where it is shown instead, so
    // exactly one header is visible on every device.
    type Shown = { visibleDevices?: string[]; hiddenDevices?: string[]; children?: string[] };
    const nodes = mapped.document.nodes as Record<string, Shown & { primitive: string; props: Record<string, unknown> }>;
    const shownOn = (node: Shown, device: string): boolean =>
      (node.visibleDevices === undefined || node.visibleDevices.includes(device)) &&
      node.hiddenDevices?.includes(device) !== true;
    // A copy can be hidden by the container that wraps it, so visibility is the
    // node's own flag AND every ancestor's.
    const visibleHeaders = (device: string): number => {
      let count = 0;
      const walk = (id: string, visible: boolean): void => {
        const node = nodes[id];
        if (node === undefined) return;
        const here = visible && shownOn(node, device);
        if (here && node.primitive === "frame" && node.props["semantic"] === "header") count += 1;
        for (const child of node.children ?? []) walk(child, here);
      };
      walk(mapped.document.rootNodeId, true);
      return count;
    };
    const all = Object.values(nodes).filter((node) => node.primitive === "frame" && node.props["semantic"] === "header");
    expect(all).toHaveLength(3);
    for (const device of ["desktop", "tablet", "mobile"]) expect(visibleHeaders(device)).toBe(1);
    // Identical copies elsewhere in the document do fold.
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
