import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/capture-html.ts";
import { importAssets, sourceAssetDeliveries } from "../src/assets.ts";
import { decodeDataUrl, sanitizeSvg } from "../src/svg.ts";
import { mapDocument, normalize } from "../src/index.ts";
import type { IrNode } from "../src/ir.ts";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const page = (body: string, css = "", head = ""): string =>
  `<html lang="en"><head><title>t</title>${head}<style>${css}</style></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

// The node with the given tag, wherever it sits in the tree.
function nodeWithTag(root: IrNode, tag: string): IrNode | undefined {
  for (const child of root.children) {
    if (child.tag === tag) return child;
    const found = nodeWithTag(child, tag);
    if (found !== undefined) return found;
  }
  return undefined;
}
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 449"><path d="M0 0 L10 10 Z" fill="#d7ff6f"/></svg>';

describe("a tag whose attribute value holds a `>`", () => {
  // Framer writes its graphics as `src="data:image/svg+xml,<svg …>"`. A tag
  // scanner that looks for the next `>` cuts the tag there: the value loses its
  // closing quote, the attribute reads as empty, and the picture arrives
  // without a source.
  it("keeps the whole value of an attribute that holds a `>`", () => {
    const document = captureHtml({
      html: page(`<img alt class="grafik" src="data:image/svg+xml,${SVG.replace(/"/g, "&quot;")}">`),
    });
    const image = nodeWithTag(document.pages[0]?.root as never, "img");
    expect(image?.assetUrl).toBe(`data:image/svg+xml,${SVG.replace(/"/g, '"')}`);
  });

  it("reads the style attribute of a tag that holds a `>`", () => {
    const document = captureHtml({
      html: page(
        `<div style="background-image:url(&quot;data:image/svg+xml,<svg/>&quot;);color:#111">x</div>`,
      ),
    });
    const values: string[] = [];
    const collect = (node: IrNode): void => {
      for (const state of node.states) {
        for (const value of Object.values(state.visual)) {
          if (typeof value === "string") values.push(value);
        }
      }
      for (const child of node.children) collect(child);
    };
    collect(document.pages[0]?.root as IrNode);
    expect(values.some((value) => value.includes("data:image/svg+xml"))).toBe(true);
  });
});

describe("a graphic in a style value", () => {
  // The X logo of the source is a frame with a mask: the graphic stands in the
  // value as a data URL. ADR-0005 keeps `data:image/svg+xml` out of style
  // values (an SVG can carry a script), so the graphic becomes an asset —
  // cleaned up — and the value names it.
  it("makes the graphic of a mask an asset and names it in the value", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0 L24 24"/></svg>';
    // In the style the inner quotes of the SVG are escaped (`\"`) — the CSS
    // escape, not the character. The rule stands in a style sheet, as in the
    // source.
    const escaped = svg.replace(/"/g, '\\"');
    const html = page(
      `<div class="maske">x</div>`,
      `.maske{mask:url("data:image/svg+xml,${escaped}")}`,
    );
    const document = captureHtml({ html });
    const work = mkdtempSync(join(tmpdir(), "senify-mask-"));
    try {
      const uploaded: { filename: string; data: Buffer }[] = [];
      const { document: mitAssets } = await importAssets({
        document,
        uploader: async (input) => {
          uploaded.push({ filename: input.filename, data: input.data });
          return { assetId: "up-1", url: "/assets/up-1/import-image.svg" };
        },
      });
      // The graphic was uploaded — and the file carries the plain markup.
      expect(uploaded.length).toBe(1);
      expect(uploaded[0]?.filename).toBe("import-image.svg");
      expect(uploaded[0]?.data.toString("utf8")).toContain("<path");
      // The value names the asset, the data URL is gone.
      const werte: string[] = [];
      const sammle = (node: IrNode): void => {
        for (const state of node.states) {
          for (const wert of Object.values(state.visual)) {
            if (typeof wert === "string") werte.push(wert);
          }
        }
        for (const kind of node.children) sammle(kind);
      };
      sammle(mitAssets.pages[0]?.root as IrNode);
      expect(werte.some((wert) => wert.includes("data:image/svg+xml"))).toBe(false);
      expect(werte.some((wert) => wert.includes("/assets/up-1/import-image.svg"))).toBe(true);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe("the spaces between inline elements", () => {
  // Framer writes a heading as one span per word, with the space as a bare
  // text node BETWEEN the spans. The child scan does not see that space, so
  // the comparison must not invent one: with the space invented, both sides
  // read the same, the raw inner markup was thrown away, and the words ran
  // together ("EverythingIknow.").
  it("keeps the space between two spans of a heading", () => {
    const document = captureHtml({
      html: page(`<h1><span>Everything</span> <span>I</span> <span>know.</span></h1>`),
    });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const html = Object.values(mapped.document.nodes)
      .map((node) => String(node.props["html"] ?? ""))
      .join("|");
    expect(html).toContain("<span>Everything</span> <span>I</span> <span>know.</span>");
  });

  it("keeps the space when the words sit in a rich-text container", () => {
    const document = captureHtml({
      html: page(
        `<div data-framer-component-type="RichTextContainer"><h2><span>Personal</span> <span>toolkits,</span></h2></div>`,
      ),
    });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const html = Object.values(mapped.document.nodes)
      .map((node) => String(node.props["html"] ?? ""))
      .join("|");
    expect(html).toContain("<h2><span>Personal</span> <span>toolkits,</span></h2>");
  });

  it("still keeps a space that sits in a span of its own", () => {
    const document = captureHtml({
      html: page(`<p><span>Wir</span><span> </span><span>sind</span></p>`),
    });
    const normalized = normalize(document, { mode: "fidelity" });
    const mapped = mapDocument(document, normalized.rules);
    const html = Object.values(mapped.document.nodes)
      .map((node) => String(node.props["html"] ?? ""))
      .join("|");
    expect(html).toContain("<span>Wir</span><span> </span><span>sind</span>");
  });
});

describe("a graphic that travels as a data URL", () => {
  it("decodes the bytes of a base64 data URL", () => {
    const decoded = decodeDataUrl(`data:image/svg+xml;base64,${Buffer.from("<svg/>", "utf8").toString("base64")}`);
    expect(decoded?.mime).toBe("image/svg+xml");
    expect(decoded?.bytes.toString("utf8")).toBe("<svg/>");
  });

  it("decodes the bytes of a percent-encoded data URL", () => {
    const decoded = decodeDataUrl("data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E");
    expect(decoded?.bytes.toString("utf8")).toBe("<svg></svg>");
  });

  it("takes the script out of an SVG", () => {
    const cleaned = sanitizeSvg(
      `<svg><script>alert(1)</script><path d="M0 0" onload="alert(2)"/></svg>`,
    );
    expect(cleaned).not.toContain("script");
    expect(cleaned).not.toContain("onload");
    expect(cleaned).toContain("<path");
  });

  it("takes every reference that leaves the file out of an SVG", () => {
    const cleaned = sanitizeSvg(
      `<svg><use href="https://evil.example/x.svg#a"/><use href="#local"/><image href="javascript:alert(1)"/></svg>`,
    );
    expect(cleaned).not.toContain("evil.example");
    expect(cleaned).not.toContain("javascript:");
    expect(cleaned).toContain("#local");
  });

  it("stores the graphic as a file and gives the node an asset id", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "senify-data-url-"));
    try {
      const document = captureHtml({
        html: page(`<img alt="g" src="data:image/svg+xml,${encodeURIComponent(SVG)}">`),
      });
      const result = await importAssets({ document, outDir, includeFonts: false });
      expect(result.report.downloads.length).toBe(1);
      expect(result.report.downloads[0]?.mime).toBe("image/svg+xml");
      const files = readdirSync(outDir);
      expect(files.some((name) => name.endsWith(".svg"))).toBe(true);
      const written = files
        .filter((name) => name.endsWith(".svg"))
        .map((name) => readFileSync(join(outDir, name), "utf8"))
        .join("");
      expect(written).toContain("<path");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("leaves a data URL that is not a picture alone", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "senify-data-url-"));
    try {
      const document = captureHtml({
        html: page(`<img alt="x" src="data:text/html,<script>alert(1)</script>">`),
      });
      const result = await importAssets({ document, outDir, includeFonts: false });
      expect(result.report.downloads.length).toBe(0);
      expect(result.report.failed).toBe(1);
      expect(result.document.findings.some((finding) => finding.kind === "asset-blocked")).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("the delivery of a run without an upload", () => {
  it("names every asset of the run by the address it has in the source", () => {
    const document = captureHtml({
      html: page(`<img alt="g" src="https://example.test/a.png"><img alt="h" src="https://example.test/b.png">`),
    });
    const deliveries = sourceAssetDeliveries(document, "https://example.test/");
    expect(deliveries["https://example.test/a.png"]).toBe("https://example.test/a.png");
    expect(deliveries["https://example.test/b.png"]).toBe("https://example.test/b.png");
  });

  it("makes a relative address absolute against the page", () => {
    const document = captureHtml({ html: page(`<img alt="g" src="/a.png">`) });
    const deliveries = sourceAssetDeliveries(document, "https://example.test/seite/");
    expect(deliveries["/a.png"]).toBe("https://example.test/a.png");
  });
});
