import { describe, expect, it } from "vitest";
import type { DeviceValueMap } from "../src/index.ts";
import {
  DEVICES,
  baseKeyOf,
  deviceKey,
  deviceOverrides,
  hasDeviceOverride,
  inheritanceChain,
  isDeviceKey,
  resetDeviceValue,
  resolveAllForDevice,
  resolveDeviceValue,
  setDeviceValue,
} from "../src/index.ts";

describe("device keys", () => {
  it("builds and detects the tablet and mobile suffixes", () => {
    expect(deviceKey("paddingY", "desktop")).toBe("paddingY");
    expect(deviceKey("paddingY", "tablet")).toBe("paddingY_tablet");
    expect(deviceKey("paddingY", "mobile")).toBe("paddingY_mobile");
    expect(isDeviceKey("paddingY_tablet")).toBe(true);
    expect(isDeviceKey("paddingY_mobile")).toBe(true);
    expect(isDeviceKey("paddingY")).toBe(false);
    expect(baseKeyOf("paddingY_tablet")).toBe("paddingY");
    expect(baseKeyOf("paddingY_mobile")).toBe("paddingY");
    expect(baseKeyOf("paddingY")).toBe("paddingY");
  });

  it("orders inheritance from top to bottom", () => {
    expect(inheritanceChain("paddingY", "desktop")).toEqual(["paddingY"]);
    expect(inheritanceChain("paddingY", "tablet")).toEqual([
      "paddingY_tablet",
      "paddingY",
    ]);
    expect(inheritanceChain("paddingY", "mobile")).toEqual([
      "paddingY_mobile",
      "paddingY_tablet",
      "paddingY",
    ]);
    expect([...DEVICES]).toEqual(["desktop", "tablet", "mobile"]);
  });
});

describe("inheritance", () => {
  it("lets tablet and mobile fall back upward", () => {
    const base: DeviceValueMap = { paddingY: "48px" };
    const tablet = setDeviceValue(base, "paddingY", "tablet", "32px");
    const mobile = setDeviceValue(tablet, "paddingY", "mobile", "16px");

    expect(resolveDeviceValue<string>(base, "paddingY", "desktop")).toBe("48px");
    expect(resolveDeviceValue<string>(tablet, "paddingY", "desktop")).toBe("48px");
    expect(resolveDeviceValue<string>(tablet, "paddingY", "tablet")).toBe("32px");
    // Mobile has no own value yet, so it inherits the tablet override.
    expect(resolveDeviceValue<string>(tablet, "paddingY", "mobile")).toBe("32px");
    expect(resolveDeviceValue<string>(mobile, "paddingY", "mobile")).toBe("16px");
    // Desktop is never touched by a lower device.
    expect(resolveDeviceValue<string>(mobile, "paddingY", "desktop")).toBe("48px");
  });

  it("returns undefined when no value exists", () => {
    expect(resolveDeviceValue({}, "paddingY", "mobile")).toBeUndefined();
  });
});

describe("reset per device", () => {
  it("drops only the device override so the value inherits again", () => {
    const values: DeviceValueMap = {
      paddingY: "48px",
      paddingY_tablet: "32px",
      paddingY_mobile: "16px",
    };

    const withoutTablet = resetDeviceValue(values, "paddingY", "tablet");
    expect(withoutTablet["paddingY_tablet"]).toBeUndefined();
    expect(resolveDeviceValue<string>(withoutTablet, "paddingY", "tablet")).toBe("48px");
    // The mobile override survives the tablet reset.
    expect(resolveDeviceValue<string>(withoutTablet, "paddingY", "mobile")).toBe("16px");
    // The original map is untouched.
    expect(values["paddingY_tablet"]).toBe("32px");

    const withoutMobile = resetDeviceValue(values, "paddingY", "mobile");
    expect(resolveDeviceValue<string>(withoutMobile, "paddingY", "mobile")).toBe("32px");
  });

  it("clears the base value when desktop is reset", () => {
    const cleared = resetDeviceValue({ paddingY: "48px" }, "paddingY", "desktop");
    expect(cleared["paddingY"]).toBeUndefined();
    expect(resolveDeviceValue(cleared, "paddingY", "desktop")).toBeUndefined();
    expect(resolveDeviceValue(cleared, "paddingY", "mobile")).toBeUndefined();
  });
});

describe("device overrides", () => {
  const values: DeviceValueMap = {
    paddingY: "48px",
    paddingY_tablet: "32px",
    color: "#111111",
  };

  it("reports whether a device carries an explicit value", () => {
    expect(hasDeviceOverride(values, "paddingY", "tablet")).toBe(true);
    expect(hasDeviceOverride(values, "paddingY", "mobile")).toBe(false);
    expect(hasDeviceOverride(values, "color", "desktop")).toBe(true);
  });

  it("lists the overriding keys per device", () => {
    expect(deviceOverrides(values, "tablet")).toEqual(["paddingY_tablet"]);
    expect(deviceOverrides(values, "mobile")).toEqual([]);
    expect(deviceOverrides(values, "desktop")).toEqual([]);
  });

  it("flattens the effective values for a device", () => {
    expect(resolveAllForDevice(values, "desktop")).toEqual({
      paddingY: "48px",
      color: "#111111",
    });
    expect(resolveAllForDevice(values, "tablet")).toEqual({
      paddingY: "32px",
      color: "#111111",
    });
    expect(resolveAllForDevice(values, "mobile")).toEqual({
      paddingY: "32px",
      color: "#111111",
    });
  });
});
