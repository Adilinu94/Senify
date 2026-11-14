import { describe, expect, it } from "vitest";
import { WIDGET_MODULES, type WidgetMount } from "../src/index.ts";

describe("widget contract", () => {
  it("registry is a record of mount functions", () => {
    expect(WIDGET_MODULES).toEqual({
      "ribbon-gallery": expect.any(Function),
      "wave-background": expect.any(Function),
    });
    for (const mount of Object.values(WIDGET_MODULES)) {
      expect(typeof mount).toBe("function");
    }
  });
  it("a mount returns a handle with setProps and destroy", () => {
    const fake: WidgetMount = () => ({ setProps: () => {}, destroy: () => {} });
    const host = { nodeType: 1 } as unknown as HTMLElement;
    const handle = fake(host, {});
    expect(typeof handle.setProps).toBe("function");
    expect(typeof handle.destroy).toBe("function");
  });
});
