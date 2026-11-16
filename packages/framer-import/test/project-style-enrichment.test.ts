import { describe, expect, it } from "vitest";
import { widgetPrimitive } from "@senify/widget-engine";
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
    expect(stats.ambiguousTexts).toContain("Doppelt");

    const ambiguous = findByText(document, "Doppelt");
    expect(ambiguous?.states[0]?.text?.inline["color"]).toBeUndefined();
  });

  it("trennt mehrdeutige Worte über den DOM-Pfad, wenn die Quelle eindeutig ist", () => {
    const projectXml = `<Project name="Pfad">
      <Pages><Page nodeId="page-home" path="/" /></Pages>
      <TextStyles />
      <ColorStyles />
    </Project>`;
    const pageXml = `<Desktop nodeId="d" width="1200px">
      <CardA nodeId="card-a"><Body nodeId="text-a">Gleicher Text</Body></CardA>
      <CardB nodeId="card-b"><Body nodeId="text-b">Gleicher Text</Body></CardB>
    </Desktop>`;
    const document = mapUnframerProject({
      projectXml,
      pages: [{ path: "/", xml: pageXml }],
      capturedAt: "2026-11-16T12:00:00.000Z",
    });
    const html = `<!doctype html><html><body><div id="main"><div>
      <div data-framer-name="CardA"><div data-framer-name="Body"><p style="--framer-text-color: rgb(255, 0, 0)">Gleicher Text</p></div></div>
      <div data-framer-name="CardB"><div data-framer-name="Body"><p style="--framer-text-color: rgb(0, 0, 255)">Gleicher Text</p></div></div>
    </div></div></body></html>`;
    const stats = enrichProjectDocument(document, { html });
    expect(stats.ambiguous).toBe(0);
    expect(stats.colors).toBe(2);

    const colors: string[] = [];
    const visit = (node: IrNode): void => {
      const content = node.states[0]?.text?.content;
      if (content === "Gleicher Text") {
        const color = node.states[0]?.text?.inline["color"];
        if (typeof color === "string") colors.push(color);
      }
      for (const child of node.children) visit(child);
    };
    const root = document.pages[0]?.root;
    if (root === undefined) throw new Error("Seite fehlt");
    visit(root);
    expect(colors).toContain("rgb(255, 0, 0)");
    expect(colors).toContain("rgb(0, 0, 255)");
  });

  it("plant die Bilder der DOM-Widget-Defaults als lokale Assets ein", () => {
    const projectXml = `<Project name="Fluffy">
      <Pages><Page nodeId="page-home" path="/" /></Pages>
      <Components>
        <Component nodeId="c-nav" name="Navbar" />
        <Component nodeId="c-rev" name="Ticker reviews item" />
      </Components>
      <TextStyles /><ColorStyles />
    </Project>`;
    const pageXml = `<Desktop nodeId="d" width="1200px">
      <Navbar nodeId="n-nav" width="1fr" componentId="c-nav" />
      <TickerReviewsItem nodeId="n-rev" width="1fr" componentId="c-rev" />
    </Desktop>`;
    const document = mapUnframerProject({
      projectXml,
      pages: [{ path: "/", xml: pageXml }],
      capturedAt: "2026-11-15T12:00:00.000Z",
    });
    const navLogo = widgetPrimitive("framer-navbar")?.sourceMedia?.["logo"];
    const reviewAvatars = widgetPrimitive("framer-reviews")?.sourceMedia?.["items.avatar"];
    if (typeof navLogo !== "string" || !Array.isArray(reviewAvatars)) throw new Error("Widget-Quellbilder fehlen");
    const avatars = reviewAvatars.filter((value): value is string => typeof value === "string" && value !== "");
    const html = `<!doctype html><html><body><div id="main"><div>
      <img src="${navLogo}" alt="Logo">
      ${avatars.map((url) => `<img src="${url}" alt="">`).join("")}
    </div></div></body></html>`;
    const stats = enrichProjectDocument(document, { html });
    expect(stats.widgetImages).toBe(1 + avatars.length);
    expect(document.assets).toContainEqual(expect.objectContaining({ url: navLogo, kind: "image" }));
    for (const avatar of avatars) {
      expect(document.assets).toContainEqual(expect.objectContaining({ url: avatar, kind: "image" }));
    }
  });

  it("klont Projektkarten, die nur die veröffentlichte Seite zeigt", () => {
    const projectXml = `<Project name="Fluffy">
      <Pages><Page nodeId="page-home" path="/" /></Pages>
      <TextStyles />
      <ColorStyles />
    </Project>`;
    const pageXml = `<Desktop nodeId="d" width="1200px">
      <Projects nodeId="grid-one" layout="grid" gridColumns="2">
        <Project nodeId="card-volmer" link="/projects/:slug" padding="70px 22px 22px 22px">
          <Text nodeId="text-volmer">
            <Top nodeId="top-volmer"><Date nodeId="date-volmer">5/31/26</Date></Top>
            <Title nodeId="title-volmer">Volmer-Betonwerk.de</Title>
            <Services nodeId="services-volmer">Web design &amp; Web development</Services>
          </Text>
          <Image nodeId="image-volmer" width="1fr" height="407px" aspectRatio="1.609" />
        </Project>
      </Projects>
      <Projects nodeId="grid-two" layout="grid" gridColumns="2">
        <Project nodeId="card-betreuung" link="/projects/:slug" padding="60px 22px 22px 22px">
          <Text nodeId="text-betreuung">
            <Top nodeId="top-betreuung"><Date nodeId="date-betreuung">6/20/24</Date></Top>
            <Title nodeId="title-betreuung">Betreuung-Witten.de</Title>
            <Services nodeId="services-betreuung">Web design &amp; Web development</Services>
          </Text>
          <Image nodeId="image-betreuung" width="1fr" height="407px" aspectRatio="1.609" />
        </Project>
      </Projects>
    </Desktop>`;
    const document = mapUnframerProject({
      projectXml,
      pages: [{ path: "/", xml: pageXml }],
      capturedAt: "2026-11-16T12:00:00.000Z",
    });
    const html = `<!doctype html><html><body><div id="main"><div>
      <a href="/projects/volmer-betonwerk.de"><div data-framer-name="Date">31.05.26</div><div data-framer-name="Title">Volmer-Betonwerk.de</div><div data-framer-name="Services">Web design &amp; Web development</div><img src="https://example.test/volmer.png" alt=""></a>
      <a href="/projects/linasfotozauber.de"><div data-framer-name="Date">08.08.23</div><div data-framer-name="Title">Linasfotozauber.de</div><div data-framer-name="Services">Web design &amp; Web development</div><img src="https://example.test/linas.png" alt=""></a>
      <a href="/projects/betreuung-witten.de"><div data-framer-name="Date">20.06.24</div><div data-framer-name="Title">Betreuung-Witten.de</div><div data-framer-name="Services">Web design &amp; Web development</div><img src="https://example.test/betreuung.png" alt=""></a>
      <a href="/projects/eventlocation-ulrepforte"><div data-framer-name="Date">13.07.26</div><div data-framer-name="Title">Ulrepforte-Events.de</div><div data-framer-name="Services">Web design &amp; Web development</div><img src="https://example.test/ulrepforte.png" alt=""></a>
    </div></div></body></html>`;
    const stats = enrichProjectDocument(document, { html });
    expect(stats.projectCards).toBe(2);
    expect(stats.images).toBe(4);

    const cards: IrNode[] = [];
    const visit = (node: IrNode): void => {
      if (node.name === "Project" && node.kind === "link") cards.push(node);
      for (const child of node.children) visit(child);
    };
    const root = document.pages[0]?.root;
    if (root === undefined) throw new Error("Seite fehlt");
    visit(root);
    expect(cards).toHaveLength(4);
    const findByName = (node: IrNode, name: string): IrNode | undefined => {
      if (node.name === name) return node;
      for (const child of node.children) {
        const found = findByName(child, name);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    const titles = cards.map((card) => findByName(card, "Title")?.states[0]?.text?.content ?? "");
    expect(titles).toEqual(["Volmer-Betonwerk.de", "Linasfotozauber.de", "Betreuung-Witten.de", "Ulrepforte-Events.de"]);
    const dates = cards.map((card) => findByName(card, "Date")?.states[0]?.text?.content ?? "");
    expect(dates).toEqual(["31.05.26", "08.08.23", "20.06.24", "13.07.26"]);
    expect(document.assets.map((asset) => asset.url)).toEqual(
      expect.arrayContaining([
        "https://example.test/volmer.png",
        "https://example.test/linas.png",
        "https://example.test/betreuung.png",
        "https://example.test/ulrepforte.png",
      ]),
    );
  });
});
