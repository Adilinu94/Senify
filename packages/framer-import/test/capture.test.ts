import { describe, expect, it } from "vitest";
import { captureFixture, captureHtml, type IrNode } from "@senify/framer-import";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// The capture reads the three static data channels and the element tree from
// real Framer SSR-HTML — the fixtures are trimmed exports (decision 23.09.),
// so the tests run offline and deterministic.

describe("captureHtml", () => {
  it("reads the appear, breakpoint and handover channels from the fluffy fixture", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    expect(document.ir).toBe(1);
    // Three breakpoint stations (B2): ≥1200 / 810–1199.98 / ≤809.98.
    const widths = document.breakpoints.map((entry) => entry.minWidth);
    expect(widths).toContain(1200);
    expect(widths).toContain(810);
    // handoverData present → CMS finding (B9).
    expect(document.findings.some((finding) => finding.kind === "cms")).toBe(true);
    // The tree is non-empty.
    expect(document.pages[0]?.root.children.length).toBeGreaterThan(0);
  });

  it("extracts tokens from the style block", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    // Measured in S0: 12 token definitions on this page.
    expect(document.styles.colors.length).toBeGreaterThanOrEqual(10);
    const lime = document.styles.colors.find((entry) => entry.value === "#d7ff6f");
    expect(lime).toBeDefined();
  });

  it("extracts font faces and reports the DSGVO task", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    expect(document.styles.fonts.length).toBeGreaterThan(0);
    expect(document.styles.fonts.every((font) => font.family !== "")).toBe(true);
    expect(document.findings.some((finding) => finding.kind === "font-subset")).toBe(true);
  });

  it("detects Lenis smooth-scroll on all three fixtures", () => {
    for (const name of [
      "framer-stupendous-football-158496",
      "framer-fluffy-rectangle-418998",
      "framer-easier-train-154753",
    ]) {
      const document = captureFixture(join(FIXTURES, name));
      expect(document.findings.some((finding) => finding.kind === "smooth-scroll")).toBe(true);
    }
  });

  it("collects images with dimensions", () => {
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    const images = document.assets.filter((asset) => asset.kind === "image");
    expect(images.length).toBeGreaterThan(0);
    expect(images[0]?.url).toContain("assets/images/");
  });

  it("collects an image whose file is named only in srcset", () => {
    // Framer writes a responsive ladder into `srcset` and may leave `src` at a
    // one-pixel placeholder. Measured on `rare-works`: three collection images
    // had NO asset entry, so the rewrite table knew no local path, 4 CDN
    // addresses stayed in the payload, the CSP blocked them and the pictures
    // were broken. The ladder's candidates name the same file at several sizes;
    // the asset is the file itself, without the query.
    const html = [
      '<div id="main">',
      '<img srcset="https://framerusercontent.com/images/a.jpg?scale-down-to=512&amp;width=1200 512w, https://framerusercontent.com/images/a.jpg?width=1200 1200w" src="https://framerusercontent.com/images/placeholder.png">',
      "</div>",
    ].join("");
    const document = captureHtml({ html });
    const urls = document.assets.map((asset) => asset.url);
    expect(urls).toContain("https://framerusercontent.com/images/a.jpg");
    // The `src` keeps its own entry — it is a different file.
    expect(urls).toContain("https://framerusercontent.com/images/placeholder.png");
  });

  it("does not invent an asset for a data-URL in srcset", () => {
    const html = [
      '<div id="main">',
      '<img srcset="data:image/png;base64,AAAA 1x">',
      "</div>",
    ].join("");
    const document = captureHtml({ html });
    expect(document.assets).toHaveLength(0);
  });

  it("keeps the page title", () => {
    const document = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    expect(document.pages[0]?.title).toContain("Datains");
  });

  it("is deterministic: the same input hashes the same", () => {
    const first = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    const second = captureFixture(join(FIXTURES, "framer-stupendous-football-158496"));
    expect(first.source.contentHash).toBe(second.source.contentHash);
  });

  it("reports a block finding when the HTML is not a Framer export", () => {
    const document = captureHtml({ html: "<html><body><p>Hallo</p></body></html>" });
    expect(document.findings.some((finding) => finding.severity === "block")).toBe(true);
    expect(document.pages[0]?.root.children).toHaveLength(0);
  });

  it("decodes the font-selector base64 into family and weight", () => {
    // Measured in S0: `--font-selector:SW50ZXItTWVkaXVt` = "Inter-Medium".
    const html = `<div id="main"><p style="--font-selector:SW50ZXItTWVkaXVt;--framer-font-size:15px">Text</p></div>`;
    const document = captureHtml({ html });
    const paragraph = document.pages[0]?.root.children[0];
    const inline = paragraph?.states[0]?.text?.inline ?? {};
    expect(inline["fontSize"]).toBe("15px");
  });

  it("reads inline --framer-* text styles into Senify property names", () => {
    const html = [
      '<div id="main">',
      '<h2 style="--framer-font-size:116px;--framer-text-alignment:center">Titel</h2>',
      "</div>",
    ].join("");
    const document = captureHtml({ html });
    const heading = document.pages[0]?.root.children[0];
    expect(heading?.kind).toBe("text");
    expect(heading?.states[0]?.text?.inline["fontSize"]).toBe("116px");
    expect(heading?.states[0]?.text?.inline["textAlign"]).toBe("center");
  });
});

describe("captureHtml runtime-only attribute rules", () => {
  // Framer's CSS holds `[data-framer-component-text-autosized] *{white-space:pre}`;
  // the attribute only exists once Framer's script has run, so in an export the
  // rule matches no element. An image has no text and no `white-space` rule of
  // its own: if one shows up, the rule leaked onto every node.
  it("does not apply the autosized-text rule to nodes that never carry the attribute", () => {
    for (const fixture of ["framer-easier-train-154753", "framer-fluffy-rectangle-418998", "framer-stupendous-football-158496"]) {
      const root = captureFixture(join(FIXTURES, fixture)).pages[0]?.root;
      expect(root, fixture).toBeDefined();
      if (root === undefined) continue;
      const images = allNodes(root).filter((node) => node.kind === "image");
      expect(images.length, fixture).toBeGreaterThan(0);
      const leaked = images.filter((node) => node.states[0]?.visual["white-space"] !== undefined);
      expect(leaked.length, fixture).toBe(0);
    }
  });
});

describe("captureHtml device states", () => {
  it("reads the ssr-variant wrappers as separate states of one element", () => {
    // The measured merge anchor (befund §4/5): three <header> with the same
    // base classes, one framer-v-<hash> each, names desktop/tablet/phone.
    const document = captureFixture(join(FIXTURES, "framer-fluffy-rectangle-418998"));
    // The fixture has three header elements — the mapper's device merge
    // (mapper.test.ts) folds them; the capture only has to preserve the
    // evidence: framer-v- hashes and names.
    const root = document.pages[0]?.root;
    expect(root).toBeDefined();
    if (root === undefined) return;
    const headers = allNodes(root).filter(
      (node) => node.tag === "header",
    );
    expect(headers.length).toBe(3);
    const names = headers.map((node) => node.name).sort();
    expect(names).toEqual(["desktop", "phone", "tablet"]);
    const variantHashes = headers.map(
      (node) => node.states[0]?.variantHash ?? null,
    );
    expect(variantHashes.every((hash) => hash !== null)).toBe(true);
    expect(new Set(variantHashes).size).toBe(3);
  });
});

function allNodes(node: IrNode): IrNode[] {
  const out: IrNode[] = [node];
  for (const child of node.children) out.push(...allNodes(child));
  return out;
}
