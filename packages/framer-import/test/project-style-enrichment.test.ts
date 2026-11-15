import { describe, expect, it } from "vitest";
import { mapUnframerProject } from "../src/unframer-ir.ts";
import { enrichProjectDocument } from "../src/project-style-enrichment.ts";
import type { FramerIrDocument, IrNode } from "../src/ir.ts";

const PROJECT_XML = `<Project name="Fluffy">
  <Pages><Page nodeId="page-home" path="/" /></Pages>
  <TextStyles>
    <TextStyle path="/Text Styles/Body" font="FS;Manrope-regular" fontSize="20px" tag="p" />
    <TextStyle path="/Text Styles/Semi" font="GF;Manrope-600" fontSize="20px" tag="p" />
  </TextStyles>
</Project>`;

const PAGE_XML = `<Desktop nodeId="d" width="1200px">
  <Body nodeId="n-hello" inlineTextStyle="/Text Styles/Body">Hallo Welt</Body>
  <Body nodeId="n-ambiguous" inlineTextStyle="/Text Styles/Body">Doppelt</Body>
  <Body nodeId="n-semi" inlineTextStyle="/Text Styles/Semi">Fett</Body>
  <Card nodeId="n-card">
    <Body nodeId="n-card-title" inlineTextStyle="/Text Styles/Body">Projekt-Eins.de Webdesign 2026</Body>
    <Image nodeId="n-card-image" width="1fr" height="407px" />
  </Card>
</Desktop>`;

function projectDocument(): FramerIrDocument {
  return mapUnframerProject({
    projectXml: PROJECT_XML,
    pages: [{ path: "/", xml: PAGE_XML }],
    capturedAt: "2026-11-14T12:00:00.000Z",
  });
}

function findImage(document: FramerIrDocument): IrNode | undefined {
  const visit = (node: IrNode): IrNode | undefined => {
    if (node.kind === "image") return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const root = document.pages[0]?.root;
  return root === undefined ? undefined : visit(root);
}

function findByText(document: FramerIrDocument, content: string): FramerIrDocument["pages"][number]["root"] | undefined {
  const visit = (node: FramerIrDocument["pages"][number]["root"]): FramerIrDocument["pages"][number]["root"] | undefined => {
    if (node.states[0]?.text?.content === content) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const root = document.pages[0]?.root;
  return root === undefined ? undefined : visit(root);
}

const PAGE_HTML = `<!doctype html><html><head>
<style>
:root { --token-white: rgb(255, 255, 255); }
body { background: rgb(10, 10, 10); color: rgb(230, 230, 230); }
@font-face { font-family: "Manrope"; src: url("https://example.test/manrope-400.woff2"); font-style: normal; font-weight: 400; }
@font-face { font-family: "Manrope"; src: url("https://example.test/manrope-600.woff2"); font-style: normal; font-weight: 600; }
@font-face { font-family: "Manrope"; src: url("https://example.test/manrope-700.woff2"); font-style: normal; font-weight: 700; }
@font-face { font-family: "Inter"; src: url("https://example.test/inter-400.woff2"); font-style: normal; font-weight: 400; }
</style></head><body>
<div id="main"><div>
  <p style="--framer-text-color:var(--token-white, rgb(255, 255, 255))">Hallo Welt</p>
  <p style="--framer-text-color:rgb(255, 0, 0)">Doppelt</p>
  <p style="--framer-text-color:rgb(0, 0, 255)">Doppelt</p>
</div></div></body></html>`;

describe("Projekt-XML plus veröffentlichte Seite", () => {
  it("ergänzt Textfarbe, Body-Stil und die Schriftdatei zur Projekt-Familie", () => {
    const document = projectDocument();
    const stats = enrichProjectDocument(document, { html: PAGE_HTML });

    const hello = findByText(document, "Hallo Welt");
    expect(hello?.states[0]?.text?.inline["color"]).toBe("rgb(255, 255, 255)");

    expect(document.styles.body).toEqual({
      background: "rgb(10, 10, 10)",
      color: "rgb(230, 230, 230)",
    });

    // The project family and weight stay; only the file arrives from the page.
    // `Manrope-600` must take the 600 face only, not all Manrope weights.
    expect(document.styles.fonts).toHaveLength(2);
    expect(document.styles.fonts).toContainEqual({
      family: "Manrope-regular",
      weight: 400,
      style: "normal",
      src: ["https://example.test/manrope-400.woff2"],
      unicodeRange: null,
    });
    expect(document.styles.fonts).toContainEqual({
      family: "Manrope-600",
      weight: 600,
      style: "normal",
      src: ["https://example.test/manrope-600.woff2"],
      unicodeRange: null,
    });
    expect(document.styles.fonts.some((face) => face.weight === 700)).toBe(false);
    expect(stats).toMatchObject({ colors: 1, ambiguous: 1, fonts: 2, body: true });
  });

  it("vererbt die Textfarbe eines Vorfahren", () => {
    const document = projectDocument();
    const html = `<!doctype html><html><body><div id="main"><div style="color: rgb(200, 200, 200)"><p>Hallo Welt</p></div></div></body></html>`;
    const stats = enrichProjectDocument(document, { html });
    const hello = findByText(document, "Hallo Welt");
    expect(hello?.states[0]?.text?.inline["color"]).toBe("rgb(200, 200, 200)");
    expect(stats.colors).toBe(1);
  });

  it("ergänzt eine fehlende Bildquelle über den Kartentext", () => {
    const document = projectDocument();
    const html = `<!doctype html><html><body><div id="main"><a href="/p"><div>Projekt-Eins.de Webdesign 2026</div><img src="https://example.test/projekt.png" alt="Projekt"></a></div></body></html>`;
    const stats = enrichProjectDocument(document, { html });
    const image = findImage(document);
    expect(image?.assetUrl).toBe("https://example.test/projekt.png");
    expect(document.assets).toContainEqual(
      expect.objectContaining({ url: "https://example.test/projekt.png", kind: "image" }),
    );
    expect(stats.images).toBe(1);
  });

  it("lässt eine vorhandene Farbe stehen und rät bei mehrdeutigen Worten nicht", () => {
    const document = projectDocument();
    const hello = findByText(document, "Hallo Welt");
    const helloText = hello?.states[0]?.text;
    if (helloText === undefined || helloText === null) throw new Error("Testknoten fehlt");
    helloText.inline["color"] = "rgb(1, 2, 3)";

    const stats = enrichProjectDocument(document, { html: PAGE_HTML });
    expect(helloText.inline["color"]).toBe("rgb(1, 2, 3)");
    expect(stats.colors).toBe(0);
    expect(stats.ambiguous).toBe(1);

    const ambiguous = findByText(document, "Doppelt");
    expect(ambiguous?.states[0]?.text?.inline["color"]).toBeUndefined();
  });
});
