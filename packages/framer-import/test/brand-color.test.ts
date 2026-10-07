import { describe, expect, it } from "vitest";
import { brandColorOf, captureHtml, mapDocument, normalize } from "../src/index.ts";

const page = (body: string, css = ""): string =>
  `<html lang="de"><head><title>t</title><style>${css}</style></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const brand = (body: string, css = "") => brandColorOf(captureHtml({ html: page(body, css) }));

describe("brandColorOf", () => {
  it("takes the chromatic colour the page uses most, weighting surfaces over text", () => {
    const found = brand(
      '<div class="a">1</div><div class="a">2</div><div class="b">3</div><p class="t">x</p>',
      ".a{background-color:#254139}.b{background-color:#d79706}.t{color:#d79706}",
    );
    expect(found?.hex).toBe("#254139");
    expect(found?.uses).toBe(6);
  });

  it("reads the literal behind a theme token variable", () => {
    expect(brand('<div class="a">x</div>', ".a{background-color:var(--token-1f29b48f-b9fc,#2f6fed)}")?.hex).toBe("#2f6fed");
  });

  it("ignores greys, white, black, gradients and transparency", () => {
    expect(
      brand(
        '<div class="a">1</div><div class="b">2</div><div class="c">3</div><div class="d">4</div><div class="e">5</div>',
        ".a{background-color:#808080}.b{background-color:#fff}.c{background-color:#000}.d{background:linear-gradient(#f00,#00f)}.e{background-color:rgba(255,0,0,0.5)}",
      ),
    ).toBeNull();
  });

  it("offers nothing for a page without a colour", () => {
    expect(brand("<p>Nur Text</p>")).toBeNull();
  });
});

describe("theme patch", () => {
  it("carries the brand colour as scales.brand", () => {
    const document = captureHtml({ html: page('<div class="a">x</div>', ".a{background-color:#2f6fed}") });
    const mapped = mapDocument(document, normalize(document, { mode: "fidelity" }).rules);
    expect(mapped.themePatch.scales).toEqual({ brand: "#2f6fed" });
  });
});
