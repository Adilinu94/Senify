import { describe, expect, it } from "vitest";
import { widgetTypeForCodeComponent } from "../src/mapper.ts";

describe("widgetTypeForCodeComponent", () => {
  it("mappt portierte Framer-Komponenten auf ihre Widget-Typen", () => {
    expect(widgetTypeForCodeComponent("WaveBackground.tsx")).toBe("wave-background");
    expect(widgetTypeForCodeComponent("RibbonGallery.tsx")).toBe("ribbon-gallery");
  });
  it("normalisiert Extension, Groß/Klein und Leerzeichen", () => {
    expect(widgetTypeForCodeComponent("WaveBackground")).toBe("wave-background");
    expect(widgetTypeForCodeComponent("wavebackground.TSX")).toBe("wave-background");
    expect(widgetTypeForCodeComponent("Ribbon Gallery")).toBe("ribbon-gallery");
    expect(widgetTypeForCodeComponent("  WaveBackground.tsx  ")).toBe("wave-background");
  });
  it("lässt unbekannte Komponenten und null durch (Platte bleibt)", () => {
    expect(widgetTypeForCodeComponent("FormPopup.tsx")).toBeUndefined();
    expect(widgetTypeForCodeComponent("SomeOtherComponent")).toBeUndefined();
    expect(widgetTypeForCodeComponent(null)).toBeUndefined();
    expect(widgetTypeForCodeComponent("")).toBeUndefined();
  });
});