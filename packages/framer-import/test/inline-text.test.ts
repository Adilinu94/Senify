import { describe, expect, it } from "vitest";
import { captureFixture, normalize, mapDocument } from "@senify/framer-import";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(fileURLToPath(new URL("./fixtures", import.meta.url)));

// Regression: a text element that only holds children (`<p><a>Home</a></p>`,
// `<h3><span>Logo</span></h3>`) used to map to `<p></p>` / `<h3></h3>`, because
// the capture stores "" as its own text and the old inline-HTML walker only
// descended when that text was null. Navigation, logo text, mail and phone
// links vanished from the imported page.

const FIXTURE_NAMES = [
  "framer-stupendous-football-158496",
  "framer-fluffy-rectangle-418998",
  "framer-easier-train-154753",
] as const;

type Loose = {
  states?: { text?: { content?: string } | null }[];
  children?: Loose[];
};

function irTexts(node: Loose, out = new Set<string>()): Set<string> {
  const content = node.states?.[0]?.text?.content;
  if (typeof content === "string" && content.trim() !== "") out.add(content.trim());
  for (const child of node.children ?? []) irTexts(child, out);
  return out;
}

function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsOf(item, out);
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) stringsOf(item, out);
  return out;
}

function decodeEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

function mapFixture(name: (typeof FIXTURE_NAMES)[number]) {
  const document = captureFixture(join(FIXTURES, name));
  const mapped = mapDocument(document, normalize(document).rules);
  const bodies = Object.values(mapped.document.nodes).filter((node) => node.primitive === "body");
  return { document, mapped, bodies };
}

describe("mapper keeps nested inline text", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: every text of the capture survives in the mapped document`, () => {
      const { document, mapped } = mapFixture(name);
      const root = (document as unknown as { pages: { root: Loose }[] }).pages[0]?.root;
      expect(root).toBeDefined();
      const mappedText = decodeEntities(
        stringsOf(Object.values(mapped.document.nodes).map((node) => node.props)).join("\u0000"),
      );
      const missing = [...irTexts(root as Loose)].filter((text) => !mappedText.includes(text));
      expect(missing).toEqual([]);
    });

    it(`${name}: no rich-text body is an empty shell like <p></p>`, () => {
      const { bodies } = mapFixture(name);
      const empty = bodies
        .map((body) => String(body.props["html"] ?? ""))
        .filter((html) => /^<(p|h[1-6]|span|strong|em)><\/\1>$/.test(html));
      expect(empty).toEqual([]);
    });
  }

  it("keeps the navigation links with their targets", () => {
    const { bodies } = mapFixture("framer-fluffy-rectangle-418998");
    const html = bodies.map((body) => String(body.props["html"] ?? ""));
    expect(html).toContain('<p><a href="./projects">Projekte</a></p>');
    expect(html).toContain('<p><a href="./contact">Über mich &amp; Kontakt</a></p>');
  });

  it("keeps mail links and the text of a heading that wraps a span", () => {
    const { bodies } = mapFixture("framer-fluffy-rectangle-418998");
    const html = bodies.map((body) => String(body.props["html"] ?? ""));
    // Framer left a trailing blank in the href; it must not end up in the link.
    expect(html).toContain('<p><a href="mailto:adrian@nick-webdesign.de">adrian@nick-webdesign.de</a></p>');
    expect(html).toContain("<h3><span>NICK WEBDESIGN</span></h3>");
  });

  it("keeps phone links", () => {
    const { bodies } = mapFixture("framer-easier-train-154753");
    const html = bodies.map((body) => String(body.props["html"] ?? ""));
    expect(html.some((entry) => entry.includes(">(408) 555-0382</a>"))).toBe(true);
  });
});
