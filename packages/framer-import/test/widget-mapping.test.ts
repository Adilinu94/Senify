import { describe, expect, it } from "vitest";
import { widgetTypeForCapturedComponent, widgetTypeForCodeComponent, widgetTypeForComponent } from "../src/mapper.ts";

describe("widget mapping", () => {
  it("mappt portierte Framer-Code-Komponenten", () => {
    expect(widgetTypeForCodeComponent("WaveBackground.tsx")).toBe("wave-background");
    expect(widgetTypeForCodeComponent("RibbonGallery.tsx")).toBe("ribbon-gallery");
    expect(widgetTypeForCodeComponent("ReviewsTicker.tsx")).toBe("framer-reviews");
  });
  it("mappt reguläre Framer-Komponenten nur über die Komponenten-Tabelle", () => {
    expect(widgetTypeForComponent("Avatar & info")).toBe("framer-avatar-info");
    expect(widgetTypeForComponent("Button 2")).toBe("framer-button");
    expect(widgetTypeForComponent("Ticker")).toBe("framer-stats");
    expect(widgetTypeForComponent("View all 2")).toBe("framer-view-all");
    expect(widgetTypeForComponent("Navbar")).toBe("framer-navbar");
  });
  it("mappt die Sammel-Ticker nicht versehentlich", () => {
    expect(widgetTypeForComponent("Ticker item")).toBeUndefined();
    expect(widgetTypeForComponent("Ticker reviews item")).toBe("framer-reviews");
  });
  it("normalisiert Extension, Groß/Klein und Leerzeichen", () => {
    expect(widgetTypeForCodeComponent("WaveBackground")).toBe("wave-background");
    expect(widgetTypeForCodeComponent("wavebackground.TSX")).toBe("wave-background");
    expect(widgetTypeForCodeComponent("Ribbon Gallery")).toBe("ribbon-gallery");
    expect(widgetTypeForCodeComponent("  WaveBackground.tsx  ")).toBe("wave-background");
  });
  it("hält die fünf neuen Ports aus dem HTML-Capture-Pfad heraus", () => {
    expect(widgetTypeForCapturedComponent("Navbar")).toBe("framer-navbar");
    expect(widgetTypeForCapturedComponent("Step 2")).toBe("framer-step");
    expect(widgetTypeForCapturedComponent("Ticker reviews item")).toBe("framer-reviews");
    expect(widgetTypeForCapturedComponent("Avatar & info")).toBeUndefined();
    expect(widgetTypeForCapturedComponent("Button 2")).toBeUndefined();
    expect(widgetTypeForCapturedComponent("Ticker")).toBeUndefined();
    expect(widgetTypeForCapturedComponent("View all 2")).toBeUndefined();
    expect(widgetTypeForCodeComponent("Button 2")).toBeUndefined();
  });
  it("lässt unbekannte Komponenten und null durch (Platte bleibt)", () => {
    expect(widgetTypeForCodeComponent("FormPopup.tsx")).toBeUndefined();
    expect(widgetTypeForCodeComponent("SomeOtherComponent")).toBeUndefined();
    expect(widgetTypeForComponent("SomeOtherComponent")).toBeUndefined();
    expect(widgetTypeForCodeComponent(null)).toBeUndefined();
    expect(widgetTypeForComponent(null)).toBeUndefined();
    expect(widgetTypeForCodeComponent("")).toBeUndefined();
  });
});
