import { describe, expect, it } from "vitest";
import type { DomDocument } from "../../src/dom.ts";
import { EDITOR_STYLES, EDITOR_TOKEN_STYLES, ensureEditorStyles } from "../../src/styles.ts";
import { EDITOR_BASE_STYLES } from "../../src/ui/base.ts";
import {
  EDITOR_ROOT_ATTRIBUTE,
  EDITOR_TOKENS,
  editorTokensCss,
} from "../../src/ui/tokens.ts";

// Aufgabe 1 "Tokens in den Editor bringen": `editorTokensCss()` is written into
// its own style element at the editor host build and `data-senify-editor` is set
// on the root node, so the editor root carries every `--ed-*` variable. The
// values come from `src/ui/tokens.ts` (one source), and the running (T17) chrome
// keeps its own style element untouched.

type FakeStyle = {
  tagName: string;
  attrs: Record<string, string>;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
};

// The editor declares its own structural DOM slice (`src/dom.ts`) because the
// project ships no DOM lib; a small stand-in is enough to exercise the host
// injection without a browser.
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

describe("Aufgabe 1: editor tokens are fed into the host", () => {
  it("scopes the token CSS to the editor root attribute", () => {
    expect(EDITOR_ROOT_ATTRIBUTE).toBe("data-senify-editor");
    expect(EDITOR_TOKEN_STYLES).toBe(editorTokensCss(`[${EDITOR_ROOT_ATTRIBUTE}]`));
    expect(EDITOR_TOKEN_STYLES.startsWith(`[${EDITOR_ROOT_ATTRIBUTE}] {`)).toBe(true);
  });

  it("emits every token of the single source, value for value", () => {
    for (const [name, value] of Object.entries(EDITOR_TOKENS)) {
      expect(EDITOR_TOKEN_STYLES).toContain(`  ${name}: ${value};`);
    }
  });

  it("writes the tokens into the host document once, next to the chrome styles", () => {
    const { doc, styles } = fakeDocument();
    ensureEditorStyles(doc);
    ensureEditorStyles(doc);

    // Five sheets, each written once: tokens, base (E16 P0), icons, skin, chrome.
    expect(styles).toHaveLength(5);
    const tokenStyle = styles.find((style) => "data-senify-editor-tokens" in style.attrs);
    const baseStyle = styles.find((style) => "data-senify-editor-base" in style.attrs);
    const chromeStyle = styles.find((style) => "data-senify-editor-styles" in style.attrs);
    expect(tokenStyle?.textContent).toBe(EDITOR_TOKEN_STYLES);
    expect(baseStyle?.textContent).toBe(EDITOR_BASE_STYLES);
    expect(chromeStyle?.textContent).toBe(EDITOR_STYLES);
  });

  it("leaves the running chrome untouched (separate element, no shared name)", () => {
    const { doc, styles } = fakeDocument();
    ensureEditorStyles(doc);
    // The chrome rules still carry their own T17 names …
    expect(EDITOR_STYLES).toContain(".senify-editor__topbar");
    expect(EDITOR_STYLES).toContain("--ed-accent: #d004d4;");
    // … and the new token set is a second element, not a rewrite of the first.
    const tokenStyle = styles.find((style) => "data-senify-editor-tokens" in style.attrs);
    expect(tokenStyle?.textContent).not.toContain(".senify-editor__topbar");
    expect(EDITOR_TOKEN_STYLES).not.toContain("--ed-accent:");
    expect(EDITOR_TOKEN_STYLES).not.toContain("--ed-canvas:");
  });
});
