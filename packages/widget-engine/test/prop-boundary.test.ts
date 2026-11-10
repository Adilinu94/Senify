import { describe, expect, it } from "vitest";
import { checkPropValue, describePrimitive, getPrimitive } from "../src/index.ts";

// The prop boundary must accept the asset references the import writes
// (ADR-0010 §7: a page carrier carries a mandatory poster `{ assetId }`).
// Before the fix, `checkPropValue` re-ran every accepted object value through
// the CSS style grammar, which only understands token references and spacing
// bags — so `{ assetId }` was rejected ("Unsupported style value shape") and
// the documented `active` toggle (ADR-0026) failed for every imported carrier.
function primitive(type: string) {
  const definition = getPrimitive(type);
  if (definition === undefined) throw new Error(`missing primitive ${type}`);
  return definition;
}

describe("prop boundary: asset references", () => {
  it("accepts an asset reference for payload.poster", () => {
    expect(checkPropValue(primitive("payload"), "poster", { assetId: "poster1" })).toBeUndefined();
  });

  it("accepts an asset reference for image.asset", () => {
    expect(checkPropValue(primitive("image"), "asset", { assetId: "img1" })).toBeUndefined();
  });

  it("accepts a plain asset string", () => {
    expect(checkPropValue(primitive("image"), "asset", "/assets/img1")).toBeUndefined();
  });
});

describe("prop boundary: structured links", () => {
  const linkControl = { ...primitive("link"), controls: primitive("link").controls.map((control) => control.key === "link" ? { ...control, valueType: "link" as const } : control) };
  it("accepts a link object and blocks unsafe schemes when rendering", () => {
    const link = { url: "javascript:alert(1)" };
    expect(checkPropValue(linkControl, "link", link)).toBeUndefined();
    expect(describePrimitive("link", { label: "Link", link })?.attrs?.href).toBe("#");
  });

  it("retains an ordinary structured link", () => {
    const link = { url: "/kontakt", newTab: true };
    expect(checkPropValue(linkControl, "link", link)).toBeUndefined();
    expect(describePrimitive("link", { label: "Kontakt", link })?.attrs?.href).toBe("/kontakt");
  });

  it("renders rich link content and sanitizes it", () => {
    const spec = describePrimitive("link", {
      label: "Fallback",
      html: 'Hallo <strong>Welt</strong><script>alert(1)</script>',
    });
    expect(spec?.html).toContain("<strong>Welt</strong>");
    expect(spec?.html).not.toContain("<script");
    expect(spec?.text).toBeUndefined();
  });
});
describe("prop boundary: the style grammar stays loud", () => {
  it("accepts a well-formed token reference for a color", () => {
    expect(checkPropValue(primitive("text"), "color", { $token: "brand" })).toBeUndefined();
  });

  it("rejects an unsafe token reference", () => {
    expect(checkPropValue(primitive("text"), "color", { $token: "bad ref!" })).toBeDefined();
  });

  it("rejects a CSS breakout on an open style property", () => {
    expect(checkPropValue(primitive("payload"), "background", "red;}")).toBeDefined();
  });
});