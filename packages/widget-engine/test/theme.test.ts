import { describe, expect, it } from "vitest";
import { defaultTheme, mergeThemePatch, resolveTheme, themeVariables } from "@senify/tokens";
import {
  compileCss,
  formatColor,
  tokenFallbackCss,
  tokenRef,
  themeTokenResolver,
} from "../src/index.ts";

const themeA = defaultTheme();
const themeB = mergeThemePatch(defaultTheme(), {
  scales: { brand: "#ff0000" },
  tokens: { primitive: { color: { accent: "#ff0000" } } },
});

describe("token resolver", () => {
  it("reads the emitted variable of the theme", () => {
    const resolve = themeTokenResolver(themeA);
    expect(resolve("color.brand")).toBe("#4f46e5");
    expect(resolve("color.brand")).toBe(themeVariables(resolveTheme(themeA))["--color-brand"]);
  });

  it("follows a semantic role to its primitive", () => {
    const resolve = themeTokenResolver(themeA);
    // `accent` is a semantic role; it resolves through the $ref chain.
    expect(resolve("accent")).toBe("#4f46e5");
    expect(resolve("not.a.token")).toBeUndefined();
  });

  it("recognises a token reference", () => {
    expect(tokenRef({ $token: "color.brand" })).toBe("color.brand");
    expect(tokenRef("#ffffff")).toBeUndefined();
    expect(tokenFallbackCss("brand.primary")).toBe("var(--brand-primary)");
  });
});

describe("compiler with a theme", () => {
  const doc = (primitive: string, props: Record<string, unknown>) => ({
    nodes: [{ id: "n", primitive, props: props as never }],
  });

  it("resolves a colour reference to the concrete theme value", () => {
    const css = compileCss(doc("text", { color: { $token: "color.brand" } }), {
      layer: null,
      resolveToken: themeTokenResolver(themeA),
    });
    expect(css).toBe(`[data-node-id="n"] {\n  color: #4f46e5;\n}`);
  });

  it("changes with the theme (two theme states)", () => {
    const make = (theme: typeof themeA) =>
      compileCss(doc("text", { color: { $token: "color.brand" } }), {
        layer: null,
        resolveToken: themeTokenResolver(theme),
      });
    expect(make(themeA)).toContain("#4f46e5");
    expect(make(themeB)).toContain("#ff0000");
    expect(make(themeA)).not.toBe(make(themeB));
  });

  it("resolves a theme size for a dimensions value", () => {
    const css = compileCss(doc("frame", { padding: { $token: "space.4" } }), {
      layer: null,
      resolveToken: themeTokenResolver(themeA),
    });
    expect(css).toBe(`[data-node-id="n"] {\n  padding: 1rem;\n}`);
  });

  it("changes a size with the spacing scale of the theme", () => {
    const wide = mergeThemePatch(defaultTheme(), { scales: { spacingBase: 8 } });
    const css = compileCss(doc("frame", { padding: { $token: "space.4" } }), {
      layer: null,
      resolveToken: themeTokenResolver(wide),
    });
    expect(css).toBe(`[data-node-id="n"] {\n  padding: 2rem;\n}`);
  });

  it("keeps border and text colours when a token is unknown", () => {
    const css = compileCss(
      doc("frame", {
        borderColor: { $token: "not.a.token" },
        color: { $token: "also.missing" },
      }),
      { layer: null, resolveToken: themeTokenResolver(themeA) },
    );
    // Nothing is dropped: an unknown reference keeps its var() colour.
    expect(css).toContain("border-color: var(--not-a-token);");
    expect(css).toContain("color: var(--also-missing);");
  });

  it("keeps the var() form without a theme", () => {
    const css = compileCss(doc("text", { color: { $token: "brand.primary" } }), { layer: null });
    expect(css).toBe(`[data-node-id="n"] {\n  color: var(--brand-primary);\n}`);
  });

  it("resolves inside a state and a class combination too", () => {
    const css = compileCss(
      {
        nodes: [
          {
            id: "n",
            primitive: "button",
            props: { color: { $token: "color.brand" } },
            states: { hover: { background: { $token: "accent" } } },
            classIds: ["branded"],
          },
        ],
        classRules: [{ name: "branded", props: { borderColor: { $token: "color.brand" } } }],
      },
      { layer: null, resolveToken: themeTokenResolver(themeB) },
    );
    expect(css).toContain(`[data-node-id="n"]:hover {`);
    expect(css).toContain("background-color: #ff0000;");
    expect(css).toContain(`[data-node-id="n"].branded {`);
    expect(css).toContain("border-color: #ff0000;");
  });
});

describe("format helpers", () => {
  it("resolves or falls back per colour", () => {
    const resolve = themeTokenResolver(themeA);
    expect(formatColor({ $token: "color.brand" }, resolve)).toBe("#4f46e5");
    expect(formatColor({ $token: "nope" }, resolve)).toBe("var(--nope)");
    expect(formatColor({ $token: "nope" })).toBe("var(--nope)");
  });
});
