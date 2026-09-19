import { describe, expect, it } from "vitest";
import {
  MOTION_PRESETS,
  MOTION_PRESET_FLAGS,
  MOTION_PRESET_GROUPS,
  MOTION_PROFILE_RULES,
  hasMotionFlag,
  motionPends,
  motionPreset,
  motionProfileViolations,
} from "@senify/section-sdk";

// The preset registry is the contract behind motion specs (ticket 19): the
// editor validates against it, the consistency check reads the flags, the bake
// derives its runtime lists from it.

describe("motion preset registry", () => {
  it("lists every preset exactly once with known group, flags and runtime", () => {
    const ids = MOTION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(24);
    for (const preset of MOTION_PRESETS) {
      expect(MOTION_PRESET_GROUPS).toContain(preset.group);
      expect(["page", "css", "island", "planned"]).toContain(preset.runtime);
      for (const flag of preset.flags) expect(MOTION_PRESET_FLAGS).toContain(flag);
    }
  });

  it("knows the pin presets and the page-script coverage", () => {
    const pins = MOTION_PRESETS.filter((preset) => preset.flags.includes("pins")).map(
      (preset) => preset.id,
    );
    expect(pins).toEqual(["scrub-pin", "sticky-stack", "horizontal-pan"]);
    expect(hasMotionFlag("scrub-pin", "pins")).toBe(true);
    expect(hasMotionFlag("fade-up", "pins")).toBe(false);
    expect(hasMotionFlag("char-split", "splits")).toBe(true);
  });

  it("resolves presets by id", () => {
    expect(motionPreset("fade-up")?.group).toBe("entry");
    expect(motionPreset("webgl-scene")?.runtime).toBe("planned");
    expect(motionPreset("warp-speed")).toBeUndefined();
  });

  it("pends only page-runtime hiding presets (FOUC marker)", () => {
    expect(motionPends("fade-up")).toBe(true);
    expect(motionPends("masked-headline")).toBe(true);
    expect(motionPends("scrub-pin")).toBe(false);
    // Planned and island presets never hide before a script runs.
    expect(motionPends("preloader-light")).toBe(false);
    expect(motionPends("accordion")).toBe(false);
    expect(motionPends("warp-speed")).toBe(false);
  });

  it("derives the profile rules from the registry", () => {
    expect(MOTION_PROFILE_RULES.clean.intensityCap).toBe(3);
    expect(MOTION_PROFILE_RULES.standard.intensityCap).toBe(7);
    expect(MOTION_PROFILE_RULES.showcase.intensityCap).toBe(10);
    // clean: reveals/progress yes, scrub/pins and text no.
    const clean = MOTION_PROFILE_RULES.clean.presets as readonly string[];
    expect(clean).toContain("fade-up");
    expect(clean).toContain("scroll-reveal");
    expect(clean).toContain("scroll-progress");
    expect(clean).not.toContain("scrub-pin");
    expect(clean).not.toContain("parallax-subtle");
    expect(clean).not.toContain("char-split");
    // standard adds the scrub half and the text group, but no 3D.
    const standard = MOTION_PROFILE_RULES.standard.presets as readonly string[];
    expect(standard).toContain("scrub-pin");
    expect(standard).toContain("char-split");
    expect(standard).not.toContain("webgl-scene");
    expect(MOTION_PROFILE_RULES.showcase.presets).toBe("all");
    expect(MOTION_PROFILE_RULES.showcase.threeD).toBe(true);
  });

  it("reports profile violations with cap, class and 3D codes", () => {
    const entries = [
      { nodeId: "a", preset: "fade-up", intensity: 5 },
      { nodeId: "b", preset: "scrub-pin", intensity: 2 },
      { nodeId: "c", preset: "webgl-scene" },
    ];
    const clean = motionProfileViolations("clean", entries);
    // A disallowed preset reports the class, not the cap — fixing the preset
    // resolves the entry (no double noise).
    expect(clean.map((violation) => violation.code).sort()).toEqual([
      "profile-3d",
      "profile-intensity-cap",
      "profile-preset",
    ]);
    expect(clean.find((violation) => violation.code === "profile-intensity-cap")?.nodeId).toBe("a");
    expect(clean.find((violation) => violation.code === "profile-preset")?.nodeId).toBe("b");

    // The pin budget is profile-specific: standard allows one.
    const standardPins = motionProfileViolations("standard", [
      { nodeId: "a", preset: "scrub-pin" },
      { nodeId: "b", preset: "sticky-stack" },
    ]);
    expect(standardPins.map((violation) => violation.code)).toEqual(["profile-pin"]);

    const showcase = motionProfileViolations("showcase", [
      { nodeId: "a", preset: "fade-up", intensity: 10 },
      { nodeId: "c", preset: "webgl-scene" },
    ]);
    expect(showcase).toEqual([]);

    // A disabled spec never violates.
    expect(
      motionProfileViolations("clean", [
        { nodeId: "a", preset: "char-split", intensity: 9, enabled: false },
      ]),
    ).toEqual([]);
  });
});
