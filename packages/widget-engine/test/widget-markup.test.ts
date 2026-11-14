import { describe, expect, it } from "vitest";
import { describePrimitive } from "../src/markup.ts";

describe("widget markup", () => {
  it("emits a widget island host with serialized props", () => {
    const spec = describePrimitive("ribbon-gallery", { speed: 12, side: "right", images: [] })!;
    expect(spec.tag).toBe("div");
    expect(spec.attrs?.["data-island"]).toBe("widget");
    expect(spec.attrs?.["data-widget-type"]).toBe("ribbon-gallery");
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
    expect(spec.children?.some((c) => c.tag === "img")).toBe(false);
    const plate = spec.children?.find((c) => c.classes?.includes("w-wave-background--plate"));
    expect(plate?.text).toBe("");
  });
});
