import { describe, expect, it } from "vitest";
import { parseColor, rgbToOklch } from "@senify/tokens";
import { captureHtml, mapDocument, neutralBaseOf, normalize, typeBaseOf } from "../src/index.ts";

const page = (body: string, css = ""): string =>
  `<html lang="de"><head><title>t</title><style>${css}</style></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const document = (body: string, css = "") => captureHtml({ html: page(body, css) });
const neutral = (body: string, css = "") => neutralBaseOf(document(body, css));
const body = (markup: string, css = "") => typeBaseOf(document(markup, css));
const hueOf = (hex: string): number => rgbToOklch(parseColor(hex)).h;

describe("neutralBaseOf", () => {
  it("reads the warm tint of cream surfaces and a warm grey text", () => {
    const found = neutral(
      '<div class="a">1</div><div class="a">2</div><p class="t">x</p>',
      ".a{background-color:#f9f4e9}.t{color:#5a554b}",
    );
    expect(found).not.toBeNull();
    const hue = hueOf(found?.hex ?? "#000000");
    expect(hue).toBeGreaterThan(60);
    expect(hue).toBeLessThan(110);
  });

  it("reads a cool tint just as well", () => {
    const found = neutral('<div class="a">1</div><p class="t">x</p>', ".a{background-color:#e9eef9}.t{color:#4b505a}");
    const hue = hueOf(found?.hex ?? "#000000");
    expect(hue).toBeGreaterThan(240);
    expect(hue).toBeLessThan(300);
  });

  it("offers a plain grey when the page's greys carry no tint", () => {
    expect(neutral('<div class="a">1</div><p class="t">x</p>', ".a{background-color:#f8f8f8}.t{color:#2f2f2f}")?.hex).toBe(
      "#717171",
    );
  });

  it("does not count black and white, which every page has", () => {
    expect(neutral('<div class="a">1</div><div class="b">2</div>', ".a{background-color:#000}.b{background-color:#fff}")).toBeNull();
    // a dark page: the black surface must not drown the one tinted grey
    const found = neutral(
      '<div class="a">1</div><div class="a">2</div><div class="a">3</div><p class="t">x</p>',
      ".a{background-color:#000}.t{color:#5a554b}",
    );
    const hue = hueOf(found?.hex ?? "#000000");
    expect(hue).toBeGreaterThan(60);
    expect(hue).toBeLessThan(110);
  });

  it("leaves the brand colour out of it", () => {
    expect(neutral('<div class="a">1</div><p class="t">x</p>', ".a{background-color:#2f6fed}.t{color:#2f6fed}")).toBeNull();
  });

  it("keeps hues on both sides of 0° together instead of cancelling them", () => {
    const found = neutral('<div class="a">1</div><div class="b">2</div>', ".a{background-color:#efe9eb}.b{background-color:#efe9e8}");
    const hue = hueOf(found?.hex ?? "#000000");
    expect(hue < 40 || hue > 320).toBe(true);
  });

  it("ignores gradients and transparency", () => {
    expect(
      neutral(
        '<div class="a">1</div><div class="b">2</div>',
        ".a{background:linear-gradient(#f9f4e9,#e9eef9)}.b{background-color:rgba(90,85,75,.5)}",
      ),
    ).toBeNull();
  });
});

describe("typeBaseOf", () => {
  it("takes the size most characters are set in, not the loudest heading", () => {
    const found = body(
      '<h1 class="h">Kurze Überschrift</h1><p class="p">Ein langer Absatz mit viel Text, der die Seite im Wesentlichen ausmacht und in der Fließtextgröße gesetzt ist.</p>',
      ".h{font-size:48px}.p{font-size:17px}",
    );
    expect(found?.px).toBe(17);
    expect((found?.characters ?? 0) > 50).toBe(true);
  });

  it("reads the size a Framer text preset carries", () => {
    const found = body(
      '<p class="framer-styles-preset-abc123" data-styles-preset="abc123">Ein Absatz in einem Framer-Textstil, lang genug, um zu zählen.</p>',
      ".framer-styles-preset-abc123{--framer-font-size:18px}",
    );
    expect(found?.px).toBe(18);
  });

  it("prefers the declaration on the text itself over its preset", () => {
    const found = body(
      '<p class="framer-styles-preset-abc123" data-styles-preset="abc123" style="--framer-font-size:15px">Ein Absatz mit eigener Größe, lang genug, um zu zählen.</p>',
      ".framer-styles-preset-abc123{--framer-font-size:18px}",
    );
    expect(found?.px).toBe(15);
  });

  it("converts rem to px", () => {
    expect(body('<p class="p">Ein Absatz in rem, lang genug, um zu zählen.</p>', ".p{font-size:1.125rem}")?.px).toBe(18);
  });

  it("offers nothing when the page has only display sizes", () => {
    expect(body('<h1 class="h">Nur eine große Überschrift auf der ganzen Seite</h1>', ".h{font-size:56px}")).toBeNull();
  });

  it("offers nothing for a page without text", () => {
    expect(body('<div class="a"></div>', ".a{background-color:#2f6fed}")).toBeNull();
  });
});

describe("theme patch", () => {
  const patchOf = (markup: string, css: string) => {
    const doc = document(markup, css);
    return mapDocument(doc, normalize(doc, { mode: "fidelity" }).rules).themePatch;
  };

  it("carries the neutral tint and the body size next to the brand colour", () => {
    const scales = patchOf(
      '<div class="a">x</div><p class="p">Ein Absatz in der Fließtextgröße, lang genug, um zu zählen.</p>',
      ".a{background-color:#2f6fed}.p{font-size:17px;color:#5a554b}",
    ).scales;
    expect(scales?.brand).toBe("#2f6fed");
    expect(scales?.typeBase).toBe(17);
    expect(hueOf(scales?.neutralBase ?? "#000000")).toBeGreaterThan(60);
  });

  it("leaves out what the page does not show", () => {
    expect(patchOf('<div class="a">x</div>', ".a{background-color:#2f6fed}").scales).toEqual({ brand: "#2f6fed" });
  });

  it("never proposes a radius, which the DNA mode zeroes anyway", () => {
    const scales = patchOf('<div class="a">x</div>', ".a{background-color:#2f6fed;border-radius:12px}").scales;
    expect(scales).not.toHaveProperty("radiusBase");
  });
});
