import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { DomDocument } from "../../src/dom.ts";
import {
  CANVAS_ICON_CSS,
  CANVAS_STYLES,
  CANVAS_TOKEN_CSS,
  ensureCanvasStyles,
} from "../../src/canvas/styles.ts";
import { EDITOR_ICON_CSS } from "../../src/ui/icons.ts";
import { EDITOR_CANVAS_SKIN_STYLES } from "../../src/ui/skin.ts";
import {
  EDITOR_ROOT_ATTRIBUTE,
  EDITOR_TOKENS,
  editorTokensCss,
} from "../../src/ui/tokens.ts";

// Auftrag "Canvas-Ansicht an die Haut anschliessen": die neue Canvas-Ansicht
// (`?view=canvas`, `.senify-canvas`) traegt dieselben Tokens, dieselbe Schrift
// und denselben Symbolbezug wie der Editor -- aus derselben Quelle. Keine
// zweite Wahrheit: die Werte kommen aus `ui/tokens.ts`, `ui/skin.ts`,
// `ui/fonts.ts` und `ui/icons.ts`; die Arbeitsflaeche (das weisse Blatt mit dem
// Seiteninhalt) bleibt neutral und wird von der Haut nicht beruehrt.

type FakeStyle = {
  tagName: string;
  attrs: Record<string, string>;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
};

function fakeDocument(): { doc: DomDocument; styles: FakeStyle[] } {
  const styles: FakeStyle[] = [];
  const host = {
    appendChild(child: FakeStyle) {
      styles.push(child);
      return child;
    },
  };
  const doc = {
    head: host,
    body: host,
    createElement(tag: string): FakeStyle {
      const element: FakeStyle = {
        tagName: tag,
        attrs: {},
        textContent: null,
        setAttribute(name, value) {
          element.attrs[name] = value;
        },
        getAttribute(name) {
          return element.attrs[name] ?? null;
        },
      };
      return element;
    },
    querySelector(selector: string): FakeStyle | null {
      const match = /^style\[([a-z-]+)\]$/.exec(selector);
      if (!match) return null;
      const attribute = match[1] ?? "";
      return styles.find((style) => attribute in style.attrs) ?? null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { doc: doc as unknown as DomDocument, styles };
}

describe("canvas skin is the editor skin, scoped to the canvas root", () => {
  const scope = `.senify-canvas[data-senify-editor][data-editor-skin="tiefwasser"]`;

  it("scopes every rule to the canvas marker and the skin name", () => {
    const openingLines = EDITOR_CANVAS_SKIN_STYLES.split("\n").filter((line) => line.includes("{"));
    expect(openingLines.length).toBeGreaterThan(10);
    for (const line of openingLines) {
      const selectorPart = line.slice(0, line.indexOf("{"));
      for (const part of selectorPart.split(",")) {
        const trimmed = part.trim();
        if (trimmed === "") continue;
        expect(trimmed.startsWith(scope), `unscoped selector: ${trimmed}`).toBe(true);
      }
    }
  });

  it("speaks tokens only and never the legacy palette", () => {
    const hexes = [...EDITOR_CANVAS_SKIN_STYLES.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) =>
      m[0].toLowerCase(),
    );
    expect(hexes).toEqual([]);
    const referenced = new Set(
      [...EDITOR_CANVAS_SKIN_STYLES.matchAll(/var\((--ed-[a-z0-9-]+)/g)]
        .map((m) => m[1])
        .filter((name): name is string => name !== undefined),
    );
    expect(referenced.size).toBeGreaterThan(10);
    for (const name of referenced) {
      expect(name in EDITOR_TOKENS, `unknown token ${name}`).toBe(true);
    }
    for (const legacy of ["#d004d4", "#e0e0e0", "#515962", "#d5d8dc", "#f1f2f3"]) {
      expect(EDITOR_CANVAS_SKIN_STYLES.toLowerCase()).not.toContain(legacy);
    }
  });

  it("carries the chrome surfaces from the tokens (colours exactly as tokens.ts)", () => {
    expect(EDITOR_CANVAS_SKIN_STYLES).toContain(".senify-canvas__topbar");
    expect(EDITOR_CANVAS_SKIN_STYLES).toContain("background: var(--ed-surface-canvas);");
    expect(EDITOR_CANVAS_SKIN_STYLES).toContain("font-family: var(--ed-font-body);");
  });
});

describe("canvas view draws from the one appearance source", () => {
  it("feeds the very same tokens as the editor, scoped to the shared marker", () => {
    expect(EDITOR_ROOT_ATTRIBUTE).toBe("data-senify-editor");
    // The same selector the editor host uses: one token list, no second.
    expect(CANVAS_TOKEN_CSS).toBe(editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`));
    expect(CANVAS_TOKEN_CSS).toContain(`[${EDITOR_ROOT_ATTRIBUTE}] {`);
    for (const [name, value] of Object.entries(EDITOR_TOKENS)) {
      expect(CANVAS_TOKEN_CSS, `token ${name}`).toContain(`  ${name}: ${value};`);
    }
  });

  it("takes the symbol set from icons.ts, not a second drawing", () => {
    expect(CANVAS_ICON_CSS).toContain(".senify-canvas .ic {");
    expect(CANVAS_ICON_CSS).toContain("mask: var(--m) center / contain no-repeat;");
    expect(CANVAS_ICON_CSS.endsWith(EDITOR_ICON_CSS)).toBe(true);
  });

  it("keeps the content paper neutral — the skin paints only the chrome", () => {
    // The sheet with the page content is the one literal that must stay white
    // and untouched, in both the structural sheet and the skin.
    expect(CANVAS_STYLES).toContain(".senify-canvas__frame {");
    expect(CANVAS_STYLES).toContain("background: #ffffff;");
    expect(CANVAS_STYLES).toContain(".senify-canvas__iframe { display: block; border: 0; background: #ffffff; }");
    // The skin never sets a background on the paper (frame/iframe/marker).
    const paperRules = [
      ...EDITOR_CANVAS_SKIN_STYLES.matchAll(
        /[^{}]*\.senify-canvas__(?:frame|iframe|marker)[^{]*\{([^}]*)\}/g,
      ),
    ];
    for (const rule of paperRules) {
      expect(rule[1] ?? "", "paper rule paints a background").not.toContain("background");
    }
    // And it is a separate document: the skin goes to the outer document, the
    // content lives in `srcdoc` frames where no `--ed-*` reaches it.
    const canvas = readFileSync(new URL("../../src/canvas/canvas.ts", import.meta.url), "utf8");
    expect(canvas).toContain("srcdoc");
    expect(canvas).toContain('body class="senify-canvas-body"');
  });

  it("makes the canvas root the carrier of marker, tokens and skin", () => {
    const canvas = readFileSync(new URL("../../src/canvas/canvas.ts", import.meta.url), "utf8");
    expect(canvas).toContain("root.setAttribute(EDITOR_ROOT_ATTRIBUTE, \"true\")");
    expect(canvas).toContain("applyEditorSkin(root, EDITOR_SKIN_DEFAULT)");
  });

  it("writes fonts, tokens, icons, structure and skin once, next to each other", () => {
    const { doc, styles } = fakeDocument();
    ensureCanvasStyles(doc);
    ensureCanvasStyles(doc);

    // Five sheets, each written once.
    expect(styles).toHaveLength(5);
    const byAttr = (attribute: string): FakeStyle | undefined =>
      styles.find((style) => attribute in style.attrs);
    expect(byAttr("data-senify-canvas-fonts")?.textContent).toContain("@font-face");
    expect(byAttr("data-senify-canvas-tokens")?.textContent).toBe(CANVAS_TOKEN_CSS);
    expect(byAttr("data-senify-canvas-icons")?.textContent).toBe(CANVAS_ICON_CSS);
    expect(byAttr("data-senify-canvas-styles")?.textContent).toBe(CANVAS_STYLES);
    expect(byAttr("data-senify-canvas-skin")?.textContent).toBe(EDITOR_CANVAS_SKIN_STYLES);
  });
});
