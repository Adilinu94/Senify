import { describe, expect, it } from "vitest";
import { captureHtml, mapDocument, normalize, sectionCandidatesOf } from "../src/index.ts";

const page = (body: string): string =>
  `<html lang="de"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

function candidates(body: string) {
  const document = captureHtml({ html: page(body) });
  const mapped = mapDocument(document, normalize(document, { mode: "fidelity" }).rules);
  return sectionCandidatesOf(mapped.document, "/");
}

const kindsOf = (found: ReturnType<typeof candidates>): string[] => found.map((entry) => entry.label);

describe("section candidates", () => {
  it("recognizes a header with a menu as the navbar section", () => {
    const found = candidates(
      '<header><a href="/"><img src="logo.png" alt="Logo"></a><nav><a href="/leistungen">Leistungen</a><a href="/team">Team</a><a href="/kontakt">Kontakt</a></nav></header><p>Inhalt</p>',
    );
    expect(kindsOf(found)).toContain("Registry-Baustein „navbar\"");
    expect(found.find((entry) => entry.label.includes("navbar"))?.reason).toContain("Links");
  });

  it("recognizes a footer with links as the footer section", () => {
    const found = candidates(
      '<footer><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/kontakt">Kontakt</a></footer>',
    );
    expect(kindsOf(found)).toContain("Registry-Baustein „footer\"");
  });

  it("recognizes a level-1 heading with an action as the hero section", () => {
    const found = candidates('<section><h1>Willkommen</h1><p>Text</p><a href="/start">Los geht\'s</a></section>');
    expect(kindsOf(found)).toContain("Registry-Baustein „hero\"");
  });

  it("does not call body copy that happens to link a menu", () => {
    const found = candidates(
      '<header><p>Dies ist ein langer Absatz, der zufällig <a href="/a">einen Link</a> und <a href="/b">noch einen</a> und <a href="/c">einen dritten</a> enthält, ohne ein Menü zu sein.</p></header>',
    );
    expect(kindsOf(found)).not.toContain("Registry-Baustein „navbar\"");
  });

  it("reports nothing for a page without such parts", () => {
    expect(candidates("<p>Nur Text</p>")).toEqual([]);
  });

  it("only reports: the mapped tree keeps its own header frame", () => {
    const document = captureHtml({
      html: page('<header><nav><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav></header>'),
    });
    const mapped = mapDocument(document, normalize(document, { mode: "fidelity" }).rules);
    expect(Object.values(mapped.document.nodes).some((node) => node.props?.["semantic"] === "header")).toBe(true);
  });
});
