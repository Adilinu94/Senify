import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyEditorSkin,
  EDITOR_SKIN_ALT,
  EDITOR_SKIN_ATTRIBUTE,
  EDITOR_SKIN_DEFAULT,
  EDITOR_SKIN_STYLES,
  EDITOR_SKIN_TIEFWASSER,
  isEditorSkin,
} from "../../src/ui/skin.ts";
import { EDITOR_ICON_BASE_CSS, EDITOR_ICON_STYLES, EDITOR_STYLES } from "../../src/styles.ts";
import { EDITOR_ICON_CSS } from "../../src/ui/icons.ts";
import { EDITOR_TOKENS } from "../../src/ui/tokens.ts";

// Hautumstellung (Aufgabe 1/2): the new deep-water skin is written in the token
// vocabulary of `tokens.ts` only, scoped to the token marker plus the skin
// attribute. `data-editor-skin="alt"` turns it off and the previous light chrome
// shows through, so nothing about structure, operation or function changes.

describe("editor skin is one source of appearance", () => {
  it("has a name, a marker and a default skin", () => {
    expect(EDITOR_SKIN_ATTRIBUTE).toBe("data-editor-skin");
    expect(EDITOR_SKIN_TIEFWASSER).toBe("tiefwasser");
    expect(EDITOR_SKIN_ALT).toBe("alt");
    expect(EDITOR_SKIN_DEFAULT).toBe(EDITOR_SKIN_TIEFWASSER);
    expect(isEditorSkin("tiefwasser")).toBe(true);
    expect(isEditorSkin("alt")).toBe(true);
    expect(isEditorSkin("nope")).toBe(false);
    expect(isEditorSkin(null)).toBe(false);
  });

  it("scopes every rule to the token marker and the new skin", () => {
    const scope = `.senify-editor[data-senify-editor][data-editor-skin="tiefwasser"]`;
    // No @media/at-rules: every line that opens a rule is a selector line.
    const openingLines = EDITOR_SKIN_STYLES.split("\n").filter((line) => line.includes("{"));
    expect(openingLines.length).toBeGreaterThan(30);
    for (const line of openingLines) {
      const selectorPart = line.slice(0, line.indexOf("{"));
      for (const part of selectorPart.split(",")) {
        const trimmed = part.trim();
        if (trimmed === "") continue;
        expect(trimmed.startsWith(scope), `unscoped selector: ${trimmed}`).toBe(true);
      }
    }
  });

  it("speaks tokens only (the single white content sheet is the one literal)", () => {
    const hexes = [...EDITOR_SKIN_STYLES.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) =>
      m[0].toLowerCase(),
    );
    expect(new Set(hexes)).toEqual(new Set(["#ffffff"]));
    // Every referenced variable exists in the token set (no typo, no second name).
    const referenced = new Set(
      [...EDITOR_SKIN_STYLES.matchAll(/var\((--ed-[a-z0-9-]+)/g)]
        .map((m) => m[1])
        .filter((name): name is string => name !== undefined),
    );
    expect(referenced.size).toBeGreaterThan(30);
    for (const name of referenced) {
      expect(name in EDITOR_TOKENS, `unknown token ${name}`).toBe(true);
    }
  });

  it("uses the title face --ed-font-display (Aufgabe 4 / ui-plan.md Abschnitt 1)", () => {
    expect(EDITOR_SKIN_STYLES).toContain("var(--ed-font-display)");
    // Wortmarke, Dokumenttitel und Panel-Titel tragen die Titel-Schrift.
    const displayRules = [
      ...EDITOR_SKIN_STYLES.matchAll(/[^{}]*\{([^}]*var\(--ed-font-display\)[^}]*)\}/g),
    ];
    expect(displayRules.length).toBeGreaterThanOrEqual(3);
  });

  it("never carries the legacy violet accent", () => {
    for (const legacy of ["#d004d4", "#a21caf", "#86198f", "#7c3aed", "#4f46e5", "#b000b0"]) {
      expect(EDITOR_SKIN_STYLES.toLowerCase()).not.toContain(legacy);
    }
  });
});

describe("panel edges belong to the new skin (Aufgabe 29)", () => {
  it("shows and sizes the two edges from the token widths", () => {
    expect(EDITOR_SKIN_STYLES).toContain(".senify-editor__split");
    // Bounds and defaults come from tokens.ts, never a second number.
    expect(EDITOR_SKIN_STYLES).toContain("grid-template-columns: var(--ed-w-inspector) var(--ed-w-explorer) minmax(0, 1fr);");
    expect(EDITOR_SKIN_STYLES).toContain("left: calc(var(--ed-w-inspector) - 4px);");
    expect(EDITOR_SKIN_STYLES).toContain(
      "left: calc(var(--ed-w-inspector) + var(--ed-w-explorer) - 4px);",
    );
    // The old chrome has no visible edge: the base sheet hides it.
    expect(EDITOR_STYLES).toContain(".senify-editor__split { display: none; }");
  });

  // P3-1 Punkt 4 (R5): the two panel edges belonged to the retired v1 editor.
  // The editor is gone, so there are no edges left to wire - and that is the
  // assertion worth keeping. The old test read `mount.ts` as text and looked for
  // `splitHandle("inspector")` in it; asserting on the ABSENCE of the file says
  // the same thing about the product and fails if the module ever comes back.
  it("has no legacy editor module left to carry the panel edges", () => {
    expect(() =>
      readFileSync(new URL("../../src/mount.ts", import.meta.url), "utf8"),
    ).toThrow();
  });
});

describe("skin switching keeps the old chrome", () => {
  function fakeRoot(): {
    root: { setAttribute(name: string, value: string): void; getAttribute(name: string): string | null };
    attrs: Record<string, string>;
  } {
    const attrs: Record<string, string> = {};
    return {
      attrs,
      root: {
        setAttribute(name, value) {
          attrs[name] = value;
        },
        getAttribute(name) {
          return attrs[name] ?? null;
        },
      },
    };
  }

  it("puts the root on the new skin and back", () => {
    const { root, attrs } = fakeRoot();
    applyEditorSkin(root, EDITOR_SKIN_TIEFWASSER);
    expect(attrs[EDITOR_SKIN_ATTRIBUTE]).toBe("tiefwasser");
    applyEditorSkin(root, EDITOR_SKIN_ALT);
    expect(attrs[EDITOR_SKIN_ATTRIBUTE]).toBe("alt");
    // The token marker is never touched by the switch.
    expect(EDITOR_STYLES).toContain(".senify-editor__topbar");
    expect(EDITOR_SKIN_STYLES).not.toContain(".senify-editor--alt");
  });

  it("leaves the previous light chrome rules in place", () => {
    // The old appearance is still the base sheet; the skin only overrides it.
    expect(EDITOR_STYLES).toContain("--ed-accent: #d004d4;");
    expect(EDITOR_STYLES).toContain(".senify-editor {");
    expect(EDITOR_STYLES).toContain(".senify-editor__publish");
    // The skin does not redefine the legacy variables.
    expect(EDITOR_SKIN_STYLES).not.toContain("--ed-accent:");
    expect(EDITOR_SKIN_STYLES).not.toContain("--ed-canvas:");
  });
});

describe("symbols are drawn from the bundled set (Aufgabe 3)", () => {
  it("emits the base mask rule plus every Phosphor name", () => {
    expect(EDITOR_ICON_STYLES).toContain(".senify-editor .ic {");
    expect(EDITOR_ICON_STYLES).toContain("mask: var(--m) center / contain no-repeat;");
    expect(EDITOR_ICON_STYLES.endsWith(`${EDITOR_ICON_CSS}\n`)).toBe(true);
    expect(EDITOR_ICON_BASE_CSS).toContain(".senify-editor .ic--14");
  });

  // The old assertion read `mount.ts` and looked for the placeholder glyphs.
  // The file is gone, so the check moves to where the glyphs would reappear if
  // someone reintroduced them: the bundled icon set itself. A placeholder glyph
  // in `EDITOR_ICON_STYLES` would be drawn next to a mask rule that resolves to
  // nothing, which is the exact failure this test was written for.
  it("carries no placeholder glyphs in the bundled icon set", () => {
    for (const glyph of ["↺", "▾", "▸", "✎", "⧉", "⠿", "✕", "●", "◌", "‹", "−", "✓"]) {
      expect(EDITOR_ICON_STYLES.includes(glyph), `placeholder glyph left: ${glyph}`).toBe(
        false,
      );
    }
    // And the set is real icons, not text: one mask rule per name.
    expect(EDITOR_ICON_STYLES).toContain("ic--");
  });
});
