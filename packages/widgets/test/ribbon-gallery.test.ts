import { describe, expect, it } from "vitest";
import { ribbonOptsFromProps } from "../src/ribbon-gallery.ts";

describe("ribbon props mapping", () => {
  it("maps flat widget props to RibbonOpts", () => {
    const opts = ribbonOptsFromProps({ speed: 10, side: "right", ribbonWidth: 40, dispersion: 2, trigger: "none", images: ["a.webp", "b.webp"] });
    expect(opts.speed).toBeCloseTo(0.1);
    expect(opts.side).toBe(-1);
    expect(opts.width).toBe(40);
    expect(opts.dispersion).toBe(2);
    expect(opts.trigger).toBe("none");
    expect(opts.urls).toEqual(["a.webp", "b.webp"]);
  });
  it("applies Framer defaults", () => {
    const opts = ribbonOptsFromProps({});
    expect(opts.speed).toBeCloseTo(0.0828);
    expect(opts.side).toBe(1);
    expect(opts.trigger).toBe("layerInView");
    expect(opts.duration).toBeCloseTo(0.85);
  });
  it("reads the image field of repeater items and drops unresolved asset ids", () => {
    const opts = ribbonOptsFromProps({ images: [{ image: "a.webp" }, { image: { src: "b.webp" } }, { image: { assetId: "c" } }] });
    expect(opts.urls).toEqual(["a.webp", "b.webp"]);
  });
});
