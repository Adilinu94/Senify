import { describe, expect, it } from "vitest";
import { describePrimitive, primitiveResetCss } from "../src/markup.ts";

describe("widget markup", () => {
  it("emits a widget island host with serialized props", () => {
    const spec = describePrimitive("ribbon-gallery", { speed: 12, side: "right", images: [] })!;
    expect(spec.tag).toBe("div");
    expect(spec.attrs?.["data-island"]).toBe("widget");
    expect(spec.attrs?.["data-widget-type"]).toBe("ribbon-gallery");
    expect(spec.attrs?.["data-widget-eager"]).toBeUndefined();
    const props = JSON.parse(String(spec.attrs?.["data-props"]));
    expect(props.speed).toBe(12);
    expect(props.side).toBe("right");
    expect(spec.children?.some((c) => c.tag === "canvas")).toBe(true);
  });
  it("fills defaults for missing props", () => {
    const spec = describePrimitive("ribbon-gallery", {})!;
    const props = JSON.parse(String(spec.attrs?.["data-props"]));
    expect(props.speed).toBe(8.28);
    expect(props.trigger).toBe("layerInView");
  });
  it("keeps repeater image items in their { image } shape", () => {
    const spec = describePrimitive("ribbon-gallery", { images: [{ image: "bild1" }, { image: { assetId: "asset1" } }] })!;
    const props = JSON.parse(String(spec.attrs?.["data-props"]));
    expect(props.images).toEqual([{ image: "bild1" }, { image: { assetId: "asset1" } }]);
  });
  it("renders the first image as the poster", () => {
    const spec = describePrimitive("ribbon-gallery", { images: [{ image: "bild1" }] })!;
    const poster = spec.children?.find((child) => child.tag === "img");
    expect(poster?.attrs?.["data-asset"]).toBe("bild1");
    expect(
      describePrimitive("ribbon-gallery", {})?.children?.some((child) => child.tag === "img"),
    ).toBe(false);
  });
  it("shows a plate while no images are set", () => {
    const plate = (props: Parameters<typeof describePrimitive>[1]) =>
      describePrimitive("ribbon-gallery", props)?.children?.find((child) =>
        child.classes?.includes("w-ribbon-gallery--plate"),
      );
    expect(plate({})?.text).toBe("Keine Bilder hinterlegt");
    expect(plate({ images: [{ image: "bild1" }] })).toBeUndefined();
  });
});

describe("wave-background markup", () => {
  it("emits a widget island host with serialized shader props", () => {
    const spec = describePrimitive("wave-background", { speed: 2, glow: 1.5 })!;
    expect(spec.tag).toBe("div");
    expect(spec.attrs?.["data-island"]).toBe("widget");
    expect(spec.attrs?.["data-widget-type"]).toBe("wave-background");
    const props = JSON.parse(String(spec.attrs?.["data-props"]));
    expect(props.speed).toBe(2);
    expect(props.glow).toBe(1.5);
    expect(spec.children?.some((c) => c.tag === "canvas")).toBe(true);
  });
  it("fills the source defaults for missing props", () => {
    const props = JSON.parse(String(describePrimitive("wave-background", {})?.attrs?.["data-props"]));
    expect(props.speed).toBe(1);
    expect(props.steps).toBe(22);
    expect(props.zoom).toBe(1);
  });
  it("has no poster and an empty plate (kein Bilder-Hinweis)", () => {
    const spec = describePrimitive("wave-background", {})!;
    expect(spec.children?.some((child) => child.tag === "img")).toBe(false);
    const plate = spec.children?.find((c) => c.classes?.includes("w-wave-background--plate"));
    expect(plate?.text).toBe("");
  });
});

describe("DOM widget markup (ADR-0038)", () => {
  it("emits the rendered footer as HTML inside the widget host, without a canvas", () => {
    const spec = describePrimitive("framer-footer", {})!;
    expect(spec.attrs?.["data-island"]).toBe("widget");
    expect(spec.attrs?.["data-widget-type"]).toBe("framer-footer");
    expect(spec.attrs?.["data-widget-eager"]).toBe("true");
    expect(spec.children).toBeUndefined();
    expect(spec.html).toContain("Bereit für deine neue Website?");
    expect(spec.html).toContain("w-framer-footer__root");
    const props = JSON.parse(String(spec.attrs?.["data-props"]));
    expect(props.headline).toBe("Bereit für deine neue Website?");
  });

  it("renders the navbar defaults and keeps the source links", () => {
    const spec = describePrimitive("framer-navbar", {})!;
    expect(spec.html).toContain("NICK WEBDESIGN");
    expect(spec.html).toContain("Projekte");
    expect(spec.html).toContain("WhatsApp");
  });

  it("passes instance props through to the step renderer", () => {
    const spec = describePrimitive("framer-step", {
      nr: "07",
      title: "SEO",
      text: "Bessere Sichtbarkeit.",
      points: [{ label: "Klare Texte:", text: "Verständlich." }],
    })!;
    expect(spec.html).toContain("SEO");
    expect(spec.html).toContain("/</span> 07");
    expect(spec.html).toContain("Bessere Sichtbarkeit.");
    expect(spec.html).toContain("Klare Texte:");
  });

  it("escapes HTML from control values", () => {
    const spec = describePrimitive("framer-footer", { headline: "<img src=x onerror=alert(1)>" })!;
    expect(spec.html).not.toContain("<img src=x");
    expect(spec.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("ships the DOM widget styles in the shared reset CSS", () => {
    const css = primitiveResetCss();
    expect(css).toContain(".w-framer-navbar__root");
    expect(css).toContain(".w-framer-footer__root");
    expect(css).toContain(".w-framer-reviews__track");
    expect(css).toContain(".w-framer-step__card");
  });
});
