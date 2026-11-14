import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { widgetFileName, widgetVendorCode } from "../src/widget-vendor.ts";

describe("widget vendor", () => {
  it("bundles a widget module to ESM exporting mount", () => {
    const code = widgetVendorCode("ribbon-gallery");
    expect(code).toContain("mount");
    expect(code.length).toBeGreaterThan(0);
  });
  it("exports a callable mount", async () => {
    const dir = mkdtempSync(join(tmpdir(), "senify-widget-vendor-"));
    const file = join(dir, "widget.mjs");
    writeFileSync(file, widgetVendorCode("ribbon-gallery"));
    try {
      const module = await import(/* @vite-ignore */ pathToFileURL(file).href);
      expect(typeof module.mount).toBe("function");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rejects an unknown widget type", () => {
    expect(() => widgetVendorCode("nicht-vorhanden")).toThrow(/unknown widget type/);
  });
  it("file name carries a content hash", () => {
    const a = widgetFileName("ribbon-gallery", "abc");
    expect(a).toMatch(/^ribbon-gallery\.[a-f0-9]{8}\.js$/);
    expect(widgetFileName("ribbon-gallery", "abc")).toBe(a);
    expect(widgetFileName("ribbon-gallery", "abd")).not.toBe(a);
  });
});
