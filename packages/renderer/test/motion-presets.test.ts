import { describe, expect, it } from "vitest";
import { MOTION_PRESETS } from "@senify/section-sdk";
import { PAGE_SCRIPT_PRESETS, PIN_PRESETS } from "../src/motion.ts";

// The runtime lists and the registry must not drift (ticket 19): the registry
// is the contract, the page script the implementation. A new preset is added in
// both places, or this test says so.

describe("motion runtime coverage", () => {
  it("the page script covers exactly the page and css presets of the registry", () => {
    const expected = MOTION_PRESETS.filter(
      (preset) => preset.runtime === "page" || preset.runtime === "css",
    )
      .map((preset) => preset.id)
      .sort();
    expect([...PAGE_SCRIPT_PRESETS].sort()).toEqual(expected);
  });

  it("the pin list is exactly the registry's pin presets", () => {
    const expected = MOTION_PRESETS.filter((preset) => preset.flags.includes("pins"))
      .map((preset) => preset.id)
      .sort();
    expect([...PIN_PRESETS].sort()).toEqual(expected);
  });
});
