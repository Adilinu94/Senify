import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EDITOR_CANVAS,
  EDITOR_METRIC,
  EDITOR_PALETTE,
  EDITOR_TOKENS,
  EDITOR_TOKENS_CSS,
  editorTokensCss,
} from "../../src/ui/tokens.ts";
import {
  EDITOR_BUNDLED_FONT_FILES,
  EDITOR_CONTENT_FONT_FILES,
  EDITOR_FONT_FACE_CSS,
  EDITOR_FONT_FILES,
} from "../../src/ui/fonts.ts";
import {
  EDITOR_ICON_CSS,
  EDITOR_ICONS,
  EDITOR_ICON_SOURCE,
} from "../../src/ui/icons.ts";

// Parity test: every value of the editor token set is pinned to the plan
// (`ui-plan.md`, `ui-design.md` sections 2 and 3, and the eight extra tokens of
// `ui-plan.md` section 0). Changing a token without changing the plan fails
// here; adding an indigo/violet value fails the palette allow-list below.

const EXPECTED_TOKENS: Record<string, string> = {
  "--ed-brand-900": "#1f1f1f",
  "--ed-brand-800": "#151515",
  "--ed-brand-700": "#262626",
  "--ed-brand-600": "#3a3a3a",
  "--ed-brand-300": "#9b9b9b",
  "--ed-lime": "#cbff97",
  "--ed-surface-canvas": "#1f1f1f",
  "--ed-surface-panel": "#151515",
  "--ed-surface-raised": "#262626",
  "--ed-surface-inset": "#0e0e0e",
  "--ed-ink-strong": "#ffffff",
  "--ed-ink-base": "#f3f3f3",
  "--ed-ink-muted": "#9b9b9b",
  "--ed-ink-faint": "#5f5f5f",
  "--ed-ink-on-lime": "#0b0b0b",
  "--ed-line-hairline": "#363636",
  "--ed-line-control": "#737373",
  "--ed-line-strong": "#c8c8c8",
  "--ed-signal-accent": "#3d9bff",
  "--ed-signal-select": "#3d9bff",
  "--ed-signal-danger": "#f87171",
  "--ed-signal-danger-ink": "#fca5a5",
  "--ed-signal-success": "#4ade80",
  "--ed-signal-warning": "#fbbf24",
  "--ed-fill-hover": "rgb(255 255 255 / 0.06)",
  "--ed-fill-select": "rgb(61 155 255 / 0.16)",
  "--ed-fill-danger": "rgb(248 113 113 / 0.14)",
  "--ed-fill-accent-hover": "#4da3ff",
  "--ed-focus": "#3d9bff",
  "--ed-focus-on-accent": "#0b0b0b",
  "--ed-edge-hairline": "inset 0 0 0 1px rgb(255 255 255 / 0.14)",
  "--ed-edge-top": "inset 0 1px 0 rgb(255 255 255 / 0.1)",
  "--ed-edge-select": "inset 0 0 0 1px rgb(61 155 255 / 0.55)",
  "--ed-shadow-float": "0 18px 44px -18px rgb(0 0 0 / 0.72), 0 2px 6px -2px rgb(0 0 0 / 0.5)",
  "--ed-shadow-dialog": "0 28px 72px -24px rgb(0 0 0 / 0.8)",
  "--ed-scrim": "rgb(23 32 55 / 0.48)",
  "--ed-blur-glass": "10px",
  "--ed-blur-scrim": "4px",
  "--ed-space-0": "0",
  "--ed-space-1": "4px",
  "--ed-space-2": "8px",
  "--ed-space-3": "12px",
  "--ed-space-4": "16px",
  "--ed-space-5": "20px",
  "--ed-space-6": "24px",
  "--ed-space-8": "32px",
  "--ed-space-10": "40px",
  "--ed-space-12": "48px",
  "--ed-radius-0": "0",
  "--ed-radius-sm": "4px",
  "--ed-radius-md": "8px",
  "--ed-radius-full": "9999px",
  "--ed-h-topbar": "48px",
  "--ed-h-toolbar": "40px",
  "--ed-h-tabrow": "36px",
  "--ed-h-panelhead": "36px",
  "--ed-h-statusbar": "28px",
  "--ed-h-row": "28px",
  "--ed-h-row-menu": "32px",
  "--ed-h-prop": "32px",
  "--ed-h-field": "28px",
  "--ed-h-btn-sm": "28px",
  "--ed-h-btn-md": "32px",
  "--ed-h-btn-lg": "40px",
  "--ed-h-iconbtn": "28px",
  "--ed-h-ruler": "24px",
  "--ed-w-rail": "48px",
  "--ed-w-explorer": "264px",
  "--ed-w-inspector": "320px",
  "--ed-w-spotlight": "640px",
  "--ed-w-menu-min": "200px",
  "--ed-w-menu-max": "320px",
  "--ed-w-toast-max": "360px",
  "--ed-w-dialog": "560px",
  "--ed-h-devicebar": "28px",
  "--ed-w-keys": "56px",
  "--ed-hit-min": "24px",
  "--ed-handle": "8px",
  "--ed-indent": "16px",
  "--ed-grid-step": "4px",
  "--ed-grid-help": "rgb(61 155 255 / 0.35)",
  "--ed-snap-line": "#3d9bff",
  "--ed-marquee": "rgb(61 155 255 / 0.16)",
  "--ed-selection-edge": "rgb(11 11 11 / 0.55)",
  "--ed-band-margin": "rgb(248 113 113 / 0.12)",
  "--ed-band-padding": "rgb(74 222 128 / 0.12)",
  "--ed-font-display": '"Inter Display", "Inter", system-ui, sans-serif',
  "--ed-font-body": '"Inter", system-ui, sans-serif',
  "--ed-font-mono": 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
  "--ed-text-10": "10px",
  "--ed-text-11": "11px",
  "--ed-text-12": "12px",
  "--ed-text-13": "13px",
  "--ed-text-15": "15px",
  "--ed-text-17": "17px",
  "--ed-lh-10": "14px",
  "--ed-lh-11": "15px",
  "--ed-lh-12": "16px",
  "--ed-lh-13": "18px",
  "--ed-lh-15": "20px",
  "--ed-lh-17": "22px",
  "--ed-track-micro": "0.06em",
  "--ed-track-display": "-0.01em",
  "--ed-weight-regular": "400",
  "--ed-weight-medium": "500",
  "--ed-weight-semibold": "600",
  "--ed-t-0": "0ms",
  "--ed-t-1": "120ms",
  "--ed-t-2": "160ms",
  "--ed-t-3": "200ms",
  "--ed-t-4": "240ms",
  "--ed-t-brand": "1200ms",
  "--ed-ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
  "--ed-ease-in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
  "--ed-ease-drawer": "cubic-bezier(0.32, 0.72, 0, 1)",
  "--ed-ease-standard": "cubic-bezier(0.16, 1, 0.3, 1)",
  "--ed-ease-linear": "linear",
};

// The only palette the editor may use: the deep-water anchors plus lime and the
// documented mixes/signals derived from them. No second accent, no violet, no
// pure black (`ui-design.md` section 6.12).
const ALLOWED_HEX = new Set([
  "#1f1f1f", "#151515", "#262626", "#3a3a3a", "#9b9b9b", "#cbff97",
  "#0e0e0e", "#ffffff", "#f3f3f3", "#5f5f5f", "#363636", "#737373",
  "#c8c8c8", "#3d9bff", "#0b0b0b", "#4da3ff", "#f87171", "#fca5a5",
  "#4ade80", "#fbbf24",
]);

describe("editor tokens against the plan", () => {
  it("carries exactly the planned token set, value for value", () => {
    expect(EDITOR_TOKENS).toEqual(EXPECTED_TOKENS);
  });

  it("emits every planned token as CSS", () => {
    expect(EDITOR_TOKENS_CSS).toBe(editorTokensCss());
    for (const name of Object.keys(EXPECTED_TOKENS)) {
      expect(EDITOR_TOKENS_CSS).toContain(`  ${name}:`);
    }
  });

  it("keeps the palette anchors at the design-language hexes", () => {
    expect(EDITOR_PALETTE).toEqual({
      "brand-900": "#1f1f1f",
      "brand-800": "#151515",
      "brand-700": "#262626",
      "brand-600": "#3a3a3a",
      "brand-300": "#9b9b9b",
      lime: "#cbff97",
    });
  });

  it("adds the eight tokens from ui-plan.md section 0", () => {
    expect(EDITOR_METRIC.deviceBar).toBe("28px");
    expect(EDITOR_METRIC.keys).toBe("56px");
    expect(EDITOR_CANVAS).toEqual({
      gridStep: "4px",
      gridHelp: "rgb(61 155 255 / 0.35)",
      snapLine: "#3d9bff",
      marquee: "rgb(61 155 255 / 0.16)",
      selectionEdge: "rgb(11 11 11 / 0.55)",
      bandMargin: "rgb(248 113 113 / 0.12)",
      bandPadding: "rgb(74 222 128 / 0.12)",
    });
  });
});

describe("prohibition rules (ui-design.md section 6)", () => {
  const values = Object.values(EDITOR_TOKENS);

  it("uses no gradient anywhere in the tokens (6.1)", () => {
    for (const value of values) {
      expect(value.toLowerCase()).not.toContain("gradient");
    }
  });

  it("keeps a single palette: no violet, indigo or pure black (6.12)", () => {
    const hexes = values.flatMap((value) => value.match(/#[0-9a-fA-F]{3,8}/g) ?? []);
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(ALLOWED_HEX.has(hex.toLowerCase()), `unexpected colour ${hex}`).toBe(true);
    }
    expect(EDITOR_TOKENS_CSS).not.toContain("#4f46e5"); // legacy indigo
    expect(EDITOR_TOKENS_CSS).not.toContain("#000000"); // pure black ground
  });

  it("has no infinite animation and no movement over 240ms except the brand duration (6.9)", () => {
    expect(EDITOR_TOKENS_CSS).not.toMatch(/animation/);
    const durations = values.filter((value) => /^\d+ms$/.test(value));
    for (const value of durations) {
      const ms = Number.parseInt(value, 10);
      expect(ms === 0 || ms <= 240 || ms === 1200).toBe(true);
    }
  });

  it("uses fixed px type sizes, never fluid clamp/vw/rem (ui-design.md 2.5)", () => {
    for (const key of Object.keys(EDITOR_TOKENS)) {
      if (key.startsWith("--ed-text-") || key.startsWith("--ed-lh-")) {
        expect(EDITOR_TOKENS[key]).toMatch(/^\d+px$/);
      }
    }
    expect(EDITOR_TOKENS_CSS).not.toContain("clamp(");
    expect(EDITOR_TOKENS_CSS).not.toContain("vw");
  });
});

describe("fonts and symbols are local and emoji-free", () => {
  it("declares a swap font-face for every chrome file", () => {
    expect(EDITOR_FONT_FACE_CSS).toContain("font-display: swap;");
    // Only the tool's own face is injected. The content face (Sora) is bound
    // by the theme itself - see `editorFontFaceCss` in src/ui/fonts.ts for why
    // binding it twice broke the canvas/release parity.
    for (const { file } of EDITOR_FONT_FILES) {
      expect(EDITOR_FONT_FACE_CSS).toContain(`/editor-fonts/${file}`);
    }
    // The chrome families are exactly the chrome tokens.
    expect(EDITOR_TOKENS["--ed-font-display"]).toContain('"Inter Display"');
    expect(EDITOR_TOKENS["--ed-font-body"]).toContain('"Inter"');
  });

  it("leaves the content face (Sora) to the theme, keeping the bytes on disk", () => {
    // The bytes stay bundled so the standalone preview and the disk check
    // below have them, but the injected rules must NOT mention Sora: the theme
    // binds it through `fontFaceBlocks()`, and only the theme knows which
    // face a project uses.
    expect(EDITOR_CONTENT_FONT_FILES.map((f) => f.family)).toEqual(["Sora", "Sora", "Sora"]);
    expect(EDITOR_CONTENT_FONT_FILES.map((f) => f.weight)).toEqual([400, 600, 700]);
    expect(EDITOR_FONT_FACE_CSS).not.toContain("font-family: Sora;");
    for (const { file } of EDITOR_CONTENT_FONT_FILES) {
      expect(EDITOR_FONT_FACE_CSS).not.toContain(`/editor-fonts/${file}`);
    }
    // The chrome list stays Inter-only (no content face leaks into the tool set).
    expect(EDITOR_FONT_FILES.every((f) => f.family.startsWith("Inter"))).toBe(true);
  });

  it("keeps every bundled font file present on disk", () => {
    const dir = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
    const present = new Set(readdirSync(dir));
    for (const { file } of EDITOR_BUNDLED_FONT_FILES) {
      expect(present.has(file), `missing font ${file}`).toBe(true);
    }
    expect(present.has("LICENSE.txt")).toBe(true);
  });

  it("draws symbols from one library and carries no emoji", () => {
    expect(EDITOR_ICON_SOURCE).toContain("Phosphor");
    // 41 aus dem Plan + 4 Chrome-Symbole (desktop, tablet, phone, history) + 8
    // Inspektor-Symbole (Richtungspfeile, Textausrichtung).
    expect(Object.keys(EDITOR_ICONS).length).toBe(53);
    // Emoji guard over the generated symbol source (6.3).
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [name, svg] of Object.entries(EDITOR_ICONS)) {
      expect(emoji.test(name), `emoji in name ${name}`).toBe(false);
      expect(svg).not.toMatch(emoji);
      expect(svg).toContain("viewBox='0 0 256 256'");
    }
    expect(emoji.test(EDITOR_ICON_CSS)).toBe(false);
  });

  it("keeps hand-drawn SVG paths out of src/ui except the icon module", () => {
    const uiDir = fileURLToPath(new URL("../../src/ui/", import.meta.url));
    for (const file of readdirSync(uiDir)) {
      if (!file.endsWith(".ts") || file === "icons.ts") continue;
      const text = readFileSync(new URL(`../../src/ui/${file}`, import.meta.url), "utf8");
      expect(text.includes("<path"), `${file} carries a hand-drawn path`).toBe(false);
    }
  });
});
