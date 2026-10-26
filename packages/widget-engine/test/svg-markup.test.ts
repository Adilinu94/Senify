import { describe, expect, it } from "vitest";
import { sanitizeSvgMarkup } from "../src/svg-markup.ts";

describe("sanitizeSvgMarkup", () => {
  it("keeps the shapes and paints of an icon and reports the root attributes apart", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 32 32" fill="none"><g clip-path="url(#c)"><path d="M0 0L1 1" fill="var(--token-a1, rgb(1, 2, 3))" stroke-width="2"/></g></svg>',
    );
    expect(out).toEqual({
      attrs: { viewBox: "0 0 32 32", fill: "none" },
      html: '<g clip-path="url(#c)"><path d="M0 0L1 1" fill="var(--token-a1, rgb(1, 2, 3))" stroke-width="2"></path></g>',
    });
  });

  it("keeps the camel-case names and the mask type of a masked graphic", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 8 8"><defs><clipPath id="c"><rect width="8" height="8"/></clipPath><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/></linearGradient></defs><mask id="m" style="mask-type:luminance" maskUnits="userSpaceOnUse"><path d="M0 0H8" fill="white"/></mask></svg>',
    );
    expect(out?.html).toBe(
      '<defs><clipPath id="c"><rect width="8" height="8"></rect></clipPath><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"></stop></linearGradient></defs><mask id="m" style="mask-type:luminance" maskUnits="userSpaceOnUse"><path d="M0 0H8" fill="white"></path></mask>',
    );
  });

  it("keeps a nested svg with its own size, as a symbol of the page's sprite has it", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 32 32"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" id="s1"><path d="M0 0" fill="red"/></svg></svg>',
    );
    expect(out?.html).toBe(
      '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" id="s1"><path d="M0 0" fill="red"></path></svg>',
    );
  });

  it("leaves the size and the style of the root to the element that carries it", () => {
    const out = sanitizeSvgMarkup(
      '<svg width="24" height="24" id="x" x="1" style="width:100%;position:fixed" viewBox="0 0 24 24"><path d="M0 0"/></svg>',
    );
    expect(out?.attrs).toEqual({ viewBox: "0 0 24 24" });
  });

  it("drops what can run or load: scripts, foreign content, images, use and styles — with their content", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 8 8"><script>alert(1)</script><style>*{fill:red}</style><foreignObject><div onclick="x()"><path d="M1 1"/></div></foreignObject><image href="https://evil.example/x.png"/><use href="https://evil.example/x.svg#a"/><a href="javascript:alert(1)"><path d="M2 2"/></a><text>Hallo</text><path d="M3 3"/></svg>',
    );
    expect(out?.html).toBe('<path d="M3 3"></path>');
  });

  it("drops event handlers, links and every attribute outside the list", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 8 8"><path d="M0 0" onload="alert(1)" onclick=\'alert(2)\' href="javascript:1" xlink:href="x" class="a" data-x="1" fill="red"/></svg>',
    );
    expect(out?.html).toBe('<path d="M0 0" fill="red"></path>');
  });

  it("allows a reference to an element of the same graphic and nothing else", () => {
    const html = (fill: string): string | undefined =>
      sanitizeSvgMarkup(`<svg viewBox="0 0 8 8"><path d="M0 0" fill="${fill}"/></svg>`)?.html;
    expect(html("url(#g1)")).toBe('<path d="M0 0" fill="url(#g1)"></path>');
    for (const fill of [
      "url(https://evil.example/x.svg#a)",
      "url(//evil.example/x.svg#a)",
      "url(data:image/svg+xml,x)",
      "url('https://evil.example/x.svg#a')",
      "url(#a) url(https://evil.example/x.svg#a)",
      "javascript:alert(1)",
    ]) {
      expect(html(fill)).toBe("<path d=\"M0 0\"></path>");
    }
  });

  it("does not let a value leave its attribute", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 8 8"><path d=\'M0 0" onload="alert(1)\' fill="red"/><path d="M1 1 &quot; onload=x" fill="blue"/></svg>',
    );
    expect(out?.html).toBe('<path fill="red"></path><path fill="blue"></path>');
  });

  it("keeps only the mask type of a style attribute", () => {
    const style = (value: string): string | undefined =>
      sanitizeSvgMarkup(`<svg viewBox="0 0 8 8"><mask style="${value}"><path d="M0 0"/></mask></svg>`)?.html;
    expect(style("mask-type:alpha;position:fixed;background:url(https://evil.example/x)")).toBe(
      '<mask style="mask-type:alpha"><path d="M0 0"></path></mask>',
    );
    expect(style("position:fixed")).toBe('<mask><path d="M0 0"></path></mask>');
  });

  // Framer writes an icon's palette as variables on the wrapping `<svg>` and has
  // every shape read them: `--21h8s6` is the glyph colour, `--pgex8v` the stroke
  // width. Because the root's style attribute was dropped as a whole, each shape
  // fell back to the value inside its own `var()` — measured on `rare-works`:
  // 794 shapes painted `rgb(0,0,0)` instead of the source's `#fff`, and the
  // stroke width fell from 3.5 to 1.5. A definition paints nothing and loads
  // nothing, so it has to survive.
  it("keeps the custom properties of the root, so the shapes inside resolve them", () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 24 24" style="--21h8s6: var(--token-ad88ec39, #fff); --pgex8v: 3.5; width:100%;position:fixed">' +
        '<path d="M0 0" stroke="var(--21h8s6, rgb(0, 0, 0))" stroke-width="var(--pgex8v, 1.5)"/></svg>',
    );
    expect(out?.attrs).toEqual({
      viewBox: "0 0 24 24",
      style: "--21h8s6:var(--token-ad88ec39, #fff);--pgex8v:3.5",
    });
    // The size and position of the host still stay out.
    expect(out?.attrs["style"]).not.toContain("width");
    expect(out?.attrs["style"]).not.toContain("position");
    // The use keeps its variable: without the definition above it would paint black.
    expect(out?.html).toContain('stroke="var(--21h8s6, rgb(0, 0, 0))"');
    expect(out?.html).toContain('stroke-width="var(--pgex8v, 1.5)"');
  });

  it("keeps a measurement and an opacity that are a variable, and drops what a variable may not carry", () => {
    const html = (attrs: string): string | undefined =>
      sanitizeSvgMarkup(`<svg viewBox="0 0 8 8"><path d="M0 0" ${attrs}/></svg>`)?.html;
    expect(html('fill-opacity="var(--a, 0)" stroke-width="var(--b, 1.5)"')).toBe(
      '<path d="M0 0" fill-opacity="var(--a, 0)" stroke-width="var(--b, 1.5)"></path>',
    );
    // A value that loads a resource stays out, in a variable as anywhere else.
    expect(html('stroke-width="var(--a, url(https://evil.example/x))"')).toBe('<path d="M0 0"></path>');
    // Something that is not a measurement is not a measurement because of a var().
    expect(html('stroke-width="var(--a) 2"')).toBe('<path d="M0 0" stroke-width="var(--a) 2"></path>');
    expect(html('stroke-width="close) var(--a"')).toBe('<path d="M0 0"></path>');
  });

  it("drops a custom property that tries to leave its declaration or load a resource", () => {
    const style = (value: string): string | undefined =>
      sanitizeSvgMarkup(`<svg viewBox="0 0 8 8" style="${value}"><path d="M0 0"/></svg>`)?.attrs["style"];
    expect(style("--a: #fff")).toBe("--a:#fff");
    expect(style("--a: url(https://evil.example/x)")).toBeUndefined();
    expect(style("--a: red;position:fixed")).toBe("--a:red");
    expect(style('--a: "x"')).toBeUndefined();
    expect(style("--a: expression(alert(1))")).toBeUndefined();
    // A property that is not a custom property is not a definition either.
    expect(style("--a: 1; color: red")).toBe("--a:1");
  });

  it("drops comments, processing instructions and the text between the tags", () => {
    const out = sanitizeSvgMarkup(
      '<?xml version="1.0"?><!-- <script>x</script> --><svg viewBox="0 0 8 8">text<!-- <g onclick="x()"> --><path d="M0 0"/>more</svg>',
    );
    expect(out?.html).toBe('<path d="M0 0"></path>');
  });

  it("closes what the input left open and ignores what follows the root", () => {
    const out = sanitizeSvgMarkup('<svg viewBox="0 0 8 8"><g><path d="M0 0"></svg><path d="M9 9"/>');
    expect(out?.html).toBe('<g><path d="M0 0"></path></g>');
  });

  it("returns nothing for a text that is not an svg", () => {
    expect(sanitizeSvgMarkup("")).toBeUndefined();
    expect(sanitizeSvgMarkup("<div><path d='M0 0'/></div>")).toBeUndefined();
    expect(sanitizeSvgMarkup("circle")).toBeUndefined();
  });
});
