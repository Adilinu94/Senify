// Motion preset registry (ticket 19, M1): the contract behind every motion
// spec. One place declares what a preset is and what it needs — the editor
// validates against it, the consistency check reads the flags, and the bake
// derives its runtime lists from it. The long form of this table (coverage,
// guardrails, rationale) lives in `.scratch/motion-v2/preset-matrix.md`.
//
// `runtime` is the coverage state, not the contract: `page`/`css` run in the
// baked page script today, `island` has its own vanilla island, `planned` is
// accepted by the editor but not implemented yet (the bake warns).

export const MOTION_PRESET_GROUPS = [
  "entry",
  "scroll",
  "text",
  "hover",
  "state",
  "ambient",
  "scene",
] as const;
export type MotionPresetGroup = (typeof MOTION_PRESET_GROUPS)[number];

export const MOTION_PRESET_FLAGS = [
  "splits",
  "staggers",
  "scrubbable",
  "hides",
  "loops",
  "interactive",
  "pins",
] as const;
export type MotionPresetFlag = (typeof MOTION_PRESET_FLAGS)[number];

export type MotionPresetRuntime = "page" | "css" | "island" | "planned";

export type MotionPreset = {
  id: string;
  group: MotionPresetGroup;
  flags: readonly MotionPresetFlag[];
  gsapPlugins: readonly string[];
  runtime: MotionPresetRuntime;
};

export const MOTION_PRESETS: readonly MotionPreset[] = [
  { id: "fade-up", group: "entry", flags: ["hides"], gsapPlugins: [], runtime: "page" },
  { id: "fade-up-deblur", group: "entry", flags: ["hides"], gsapPlugins: [], runtime: "page" },
  {
    id: "masked-headline",
    group: "entry",
    flags: ["splits", "staggers", "hides"],
    gsapPlugins: ["splittext"],
    runtime: "page",
  },
  { id: "stagger-cascade", group: "entry", flags: ["staggers", "hides"], gsapPlugins: [], runtime: "page" },
  {
    id: "scroll-reveal",
    group: "scroll",
    flags: ["hides"],
    gsapPlugins: ["scrolltrigger"],
    runtime: "page",
  },
  {
    id: "scrub-pin",
    group: "scroll",
    flags: ["scrubbable", "pins"],
    gsapPlugins: ["scrolltrigger"],
    runtime: "page",
  },
  {
    id: "sticky-stack",
    group: "scroll",
    flags: ["scrubbable", "pins"],
    gsapPlugins: ["scrolltrigger"],
    runtime: "page",
  },
  {
    id: "horizontal-pan",
    group: "scroll",
    flags: ["scrubbable", "pins", "hides"],
    gsapPlugins: ["scrolltrigger"],
    runtime: "page",
  },
  {
    id: "parallax-subtle",
    group: "scroll",
    flags: ["scrubbable"],
    gsapPlugins: ["scrolltrigger"],
    runtime: "page",
  },
  {
    id: "scroll-progress",
    group: "scroll",
    flags: ["scrubbable"],
    gsapPlugins: ["scrolltrigger"],
    runtime: "page",
  },
  { id: "counter", group: "text", flags: [], gsapPlugins: [], runtime: "page" },
  { id: "marquee", group: "text", flags: ["loops"], gsapPlugins: [], runtime: "css" },
  {
    id: "char-split",
    group: "text",
    flags: ["splits", "staggers", "hides"],
    gsapPlugins: ["splittext"],
    runtime: "page",
  },
  { id: "hover-lift", group: "hover", flags: ["interactive"], gsapPlugins: [], runtime: "planned" },
  {
    id: "magnetic-button",
    group: "hover",
    flags: ["interactive"],
    gsapPlugins: [],
    runtime: "planned",
  },
  { id: "tilt-card", group: "hover", flags: ["interactive"], gsapPlugins: [], runtime: "planned" },
  { id: "cursor-glow", group: "hover", flags: ["interactive"], gsapPlugins: [], runtime: "planned" },
  { id: "page-fade", group: "state", flags: [], gsapPlugins: [], runtime: "planned" },
  {
    id: "preloader-light",
    group: "state",
    flags: ["hides", "loops"],
    gsapPlugins: [],
    runtime: "planned",
  },
  { id: "accordion", group: "state", flags: [], gsapPlugins: [], runtime: "island" },
  { id: "modal", group: "state", flags: [], gsapPlugins: [], runtime: "planned" },
  { id: "ambient-float", group: "ambient", flags: ["loops"], gsapPlugins: [], runtime: "planned" },
  { id: "grain", group: "ambient", flags: ["loops"], gsapPlugins: [], runtime: "planned" },
  { id: "webgl-scene", group: "scene", flags: ["loops"], gsapPlugins: [], runtime: "planned" },
];

const PRESET_BY_ID = new Map(MOTION_PRESETS.map((preset) => [preset.id, preset]));

export function motionPreset(id: string): MotionPreset | undefined {
  return PRESET_BY_ID.get(id);
}

export function hasMotionFlag(id: string, flag: MotionPresetFlag): boolean {
  return motionPreset(id)?.flags.includes(flag) ?? false;
}

// True when the baked page script hides this preset's node before it runs. The
// render paths stamp `data-motion-pending` for those nodes (SectionShell /
// PrimitiveNode), so the first paint never flashes the un-animated state; the
// page script and a 1.6 s failsafe release the attribute again.
export function motionPends(id: string): boolean {
  const preset = PRESET_BY_ID.get(id);
  return preset !== undefined && preset.runtime === "page" && preset.flags.includes("hides");
}

// The presets the baked page script carries (page + CSS-only). The renderer's
// `PAGE_SCRIPT_PRESETS` must stay equal to this list — a test guards the drift.
export function motionPresetIds(): string[] {
  return MOTION_PRESETS.map((preset) => preset.id);
}

// --------------------------------------------------------------- site profiles
// The v1 profile table (ticket 21): every site carries a profile that caps the
// intensity and narrows the preset classes. One table for editor display and
// publish gates — `MOTION_PROFILE_RULES` is the only copy. `Lenis` and `3D`
// are part of the profile too; Lenis is read by the bake (`profile !== "clean"`).

export const MOTION_PROFILES = ["clean", "standard", "showcase"] as const;
export type MotionProfile = (typeof MOTION_PROFILES)[number];

export type MotionProfileRules = {
  intensityCap: number;
  // Preset ids the profile allows; "all" is the whole registry.
  presets: readonly string[] | "all";
  pins: number;
  threeD: boolean;
};

// `clean` keeps the reveal half of the scroll group (B-Reveals/Progress);
// `standard` adds the scrub/sticky/pan half and the text group; `showcase`
// carries everything including the 3D scene.
const CLEAN_SCROLL = ["scroll-reveal", "scroll-progress"] as const;
const STANDARD_SCROLL = [
  ...CLEAN_SCROLL,
  "scrub-pin",
  "sticky-stack",
  "horizontal-pan",
  "parallax-subtle",
] as const;
const CLEAN_GROUPS: readonly MotionPresetGroup[] = ["entry", "hover", "state", "ambient"];

function allowedPresetIds(profile: Exclude<MotionProfile, "showcase">): string[] {
  const groups = profile === "clean" ? CLEAN_GROUPS : [...CLEAN_GROUPS, "text"];
  const scroll = profile === "clean" ? CLEAN_SCROLL : STANDARD_SCROLL;
  return MOTION_PRESETS.filter(
    (preset) =>
      groups.includes(preset.group) ||
      (preset.group === "scroll" && (scroll as readonly string[]).includes(preset.id)),
  ).map((preset) => preset.id);
}

export const MOTION_PROFILE_RULES: Record<MotionProfile, MotionProfileRules> = {
  clean: { intensityCap: 3, presets: allowedPresetIds("clean"), pins: 0, threeD: false },
  standard: {
    intensityCap: 7,
    presets: allowedPresetIds("standard"),
    pins: 1,
    threeD: false,
  },
  showcase: { intensityCap: 10, presets: "all", pins: 1, threeD: true },
};

export type MotionProfileViolation = {
  code: "profile-intensity-cap" | "profile-preset" | "profile-pin" | "profile-3d";
  nodeId?: string;
  preset?: string;
  message: string;
  suggestion: string;
};

// The profile gate over a page's motion entries. The editor shows the
// violations before a profile change, the engine blocks them at publish (M5).
export function motionProfileViolations(
  profile: MotionProfile,
  entries: readonly { nodeId: string; preset: string; intensity?: number; enabled?: boolean }[],
): MotionProfileViolation[] {
  const rules = MOTION_PROFILE_RULES[profile];
  const violations: MotionProfileViolation[] = [];
  let pins = 0;
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    const preset = PRESET_BY_ID.get(entry.preset);
    if (preset === undefined) continue;
    const allowed = rules.presets === "all" || rules.presets.includes(entry.preset);
    if (!allowed) {
      violations.push({
        code: preset.group === "scene" ? "profile-3d" : "profile-preset",
        nodeId: entry.nodeId,
        preset: entry.preset,
        message: `Preset "${entry.preset}" is not allowed by the "${profile}" profile`,
        suggestion:
          preset.group === "scene"
            ? 'Raise the site profile to "showcase" for a 3D scene.'
            : 'Use a reveal or state preset, or raise the site profile.',
      });
      continue;
    }
    if (preset.flags.includes("pins")) pins += 1;
    const intensity = entry.intensity ?? 5;
    if (intensity > rules.intensityCap) {
      violations.push({
        code: "profile-intensity-cap",
        nodeId: entry.nodeId,
        preset: entry.preset,
        message: `Intensity ${intensity} exceeds the "${profile}" cap (${rules.intensityCap})`,
        suggestion: `Lower the intensity to ${rules.intensityCap}, or raise the site profile.`,
      });
    }
  }
  if (pins > rules.pins) {
    violations.push({
      code: "profile-pin",
      message: `Page uses ${pins} pin presets (max ${rules.pins} in "${profile}")`,
      suggestion:
        rules.pins === 0
          ? "The clean profile carries no pin presets; raise the site profile or remove it."
          : "Keep one pin preset per page.",
    });
  }
  return violations;
}
