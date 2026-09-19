import { describe, expect, it } from "vitest";
import {
  RESERVED_CONTEXT_IDS,
  assertValidCssClassName,
  classKindSelector,
  createAmbientRule,
  createClassRule,
  createScopedRule,
  isStyleRule,
  isValidCssClassName,
  isValidCssSelector,
  normalizeRuleOrder,
  parseStyleRule,
  parseStyleRuleRegistry,
  reservedContextIds,
  scopeNameFor,
  styleRuleErrors,
  styleRuleSelector,
  styleRuleToClassRule,
  type StyleRule,
} from "../src/index.ts";

describe("style rule model", () => {
  it("builds a class rule with a derived selector", () => {
    const rule = createClassRule({
      id: "r1",
      name: "hero-button",
      styles: { background: "#cbff97", padding_tablet: 8 },
    });
    expect(rule.kind).toBe("class");
    expect(rule.selector).toBe(".hero-button");
    expect(rule.order).toBe(0);
    expect(rule.contextStyles).toEqual({});
    expect(rule.styles).toEqual({ background: "#cbff97", padding_tablet: 8 });
    expect(styleRuleSelector(rule)).toBe(".hero-button");
  });

  it("leaves a valid class token unescaped", () => {
    expect(classKindSelector("hero-button")).toBe(".hero-button");
    expect(classKindSelector("card_2")).toBe(".card_2");
  });

  it("escapes an unusable name only on the tolerant read path", () => {
    // A valid class name can never carry `:`, so the class gate rejects it up
    // front. The parser must still not emit broken CSS when it reads such a
    // name out of corrupt data.
    expect(() => classKindSelector("a:b")).toThrow(/Invalid style class name/);
    expect(parseStyleRule({ id: "r1", name: "a:b" })?.selector).toBe(".a\\:b");
  });

  it("rejects an invalid class name", () => {
    expect(isValidCssClassName("hero-button")).toBe(true);
    expect(isValidCssClassName("2hero")).toBe(false);
    expect(isValidCssClassName("hero button")).toBe(false);
    expect(isValidCssClassName(".hero")).toBe(false);
    expect(() => assertValidCssClassName("  ")).toThrow(/required/);
    expect(() => assertValidCssClassName("2hero")).toThrow(/Invalid style class name/);
  });

  it("builds a scoped rule pinned to one node", () => {
    const rule = createScopedRule({ id: "r2", nodeId: "node-abc", styles: { color: "#fff" } });
    expect(rule.kind).toBe("scoped");
    expect(rule.name).toBe(scopeNameFor("node-abc"));
    expect(rule.name).toBe("__senify_scope_node-abc");
    expect(rule.scope).toEqual({ type: "node", nodeId: "node-abc", role: "module-style" });
    expect(styleRuleSelector(rule)).toBe(rule.selector);
  });

  it("builds an ambient rule whose name mirrors the selector", () => {
    const rule = createAmbientRule({ id: "r3", selector: "h1 > span" });
    expect(rule.kind).toBe("ambient");
    expect(rule.name).toBe("h1 > span");
    expect(rule.selector).toBe("h1 > span");
    expect(rule.scope).toBeUndefined();
    // An ambient rule is never assigned, so the class selector helper does not
    // apply; the selector UI shows the verbatim text.
    expect(styleRuleSelector(rule)).toBe("h1 > span");
  });

  it("answers the selector gate conservatively", () => {
    expect(isValidCssSelector("h1 > span")).toBe(true);
    expect(isValidCssSelector("a:hover")).toBe(true);
    expect(isValidCssSelector(".hero .title")).toBe(true);
    expect(isValidCssSelector("")).toBe(false);
    expect(isValidCssSelector("@media print")).toBe(false);
    expect(isValidCssSelector("h1 { color: red }")).toBe(false);
    expect(isValidCssSelector("> span")).toBe(false);
    expect(isValidCssSelector("h1,")).toBe(false);
    expect(() => createAmbientRule({ id: "r", selector: "@media" })).toThrow(
      /Invalid CSS selector/,
    );
  });

  it("names the device breakpoints as reserved context ids", () => {
    expect([...RESERVED_CONTEXT_IDS]).toEqual(["desktop", "tablet", "mobile"]);
    const rule = createClassRule({ id: "r", name: "card" });
    rule.contextStyles = { mobile: { color: "#fff" }, "(orientation: landscape)": { color: "#000" } };
    expect(reservedContextIds(rule)).toEqual(["mobile"]);
  });

  it("maps every rule kind onto the compiler shape", () => {
    const classRule = createClassRule({ id: "r", name: "cta", styles: { color: "#f00" } });
    expect(styleRuleToClassRule(classRule)).toEqual({
      name: "cta",
      props: { color: "#f00" },
      kind: "class",
      selector: ".cta",
    });
    // Scoped and ambient rules reach the compiler from the rule list itself —
    // the bake and the canvas both read them through this one mapping.
    const scoped = createScopedRule({ id: "r2", nodeId: "n1" });
    expect(styleRuleToClassRule(scoped)).toMatchObject({
      kind: "scoped",
      scope: { nodeId: "n1" },
    });
    const ambient = createAmbientRule({ id: "r3", selector: "h1" });
    expect(styleRuleToClassRule(ambient)).toMatchObject({ kind: "ambient", selector: "h1" });
  });
});

describe("style rule states and authorship (O11, O13)", () => {
  it("roundtrips states, state priorities and the author", () => {
    const rule: StyleRule = {
      ...createClassRule({ id: "r1", name: "cta", styles: { background: "#f00" } }),
      states: { hover: { background: "#0f0" }, disabled: { opacity: 0.5 } },
      statePriorities: { hover: { background: "important" } },
      authoredBy: "agent",
    };
    expect(parseStyleRule(rule)).toEqual(rule);
    expect(isStyleRule(rule)).toBe(true);
  });

  it("drops an unknown state and keeps the known ones", () => {
    const parsed = parseStyleRule({
      id: "r1",
      name: "cta",
      states: { hover: { color: "#fff" }, banana: { color: "#000" } },
    });
    expect(parsed?.states).toEqual({ hover: { color: "#fff" } });
  });

  it("tolerates broken state shapes", () => {
    expect(parseStyleRule({ id: "r1", name: "cta", states: "nope" })?.states).toBeUndefined();
    expect(
      parseStyleRule({ id: "r1", name: "cta", states: { hover: null } })?.states,
    ).toEqual({ hover: {} });
    expect(parseStyleRule({ id: "r1", name: "cta", authoredBy: "robot" })?.authoredBy).toBeUndefined();
  });

  it("rejects an unknown state in the hard schema", () => {
    const rule = {
      ...createClassRule({ id: "r1", name: "cta" }),
      states: { banana: { color: "#000" } },
    };
    expect(isStyleRule(rule)).toBe(false);
    expect(styleRuleErrors(rule).join(" ")).toContain("banana");
  });

  it("passes the states through to the compiler shape", () => {
    const rule = {
      ...createClassRule({ id: "r1", name: "cta", styles: { color: "#f00" } }),
      states: { hover: { color: "#0f0" } },
    };
    expect(styleRuleToClassRule(rule)).toMatchObject({
      name: "cta",
      props: { color: "#f00" },
      states: { hover: { color: "#0f0" } },
    });
  });
});

describe("style rule parsing", () => {
  const full: StyleRule = {
    id: "r1",
    name: "card",
    kind: "class",
    selector: ".card",
    order: 2,
    description: "The card shell",
    styles: { padding: 16, padding_mobile: 8 },
    stylePriorities: { padding: "important" },
    states: { hover: { padding: 20 }, disabled: { opacity: 0.4 } },
    statePriorities: { hover: { padding: "important" } },
    contextStyles: { "(orientation: landscape)": { padding: 12 } },
    contextStylePriorities: { "(orientation: landscape)": { padding: "important" } },
    origin: { source: "styles/main.css", ordinal: 3 },
    authoredBy: "user",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  };

  it("roundtrips a fully populated rule", () => {
    expect(parseStyleRule(full)).toEqual(full);
    // The registry normalizes `order` to the array position, so the single
    // entry reads back at 0 even though the stored rule carried 2.
    const second = { ...full, id: "r2", name: "card-2" };
    expect(parseStyleRuleRegistry([full, second]).map((rule) => rule.order)).toEqual([0, 1]);
    expect(parseStyleRuleRegistry([full])).toEqual([{ ...full, order: 0 }]);
  });

  it("drops entries without an id or a name", () => {
    expect(parseStyleRule({ name: "card" })).toBeUndefined();
    expect(parseStyleRule({ id: "r1" })).toBeUndefined();
    expect(parseStyleRule({ id: "", name: "card" })).toBeUndefined();
    expect(parseStyleRule("not a rule")).toBeUndefined();
    expect(parseStyleRule(null)).toBeUndefined();
  });

  it("backfills kind, selector and order on an old entry", () => {
    const parsed = parseStyleRule({ id: "r1", name: "legacy" }, 4);
    expect(parsed?.kind).toBe("class");
    expect(parsed?.selector).toBe(".legacy");
    expect(parsed?.order).toBe(4);
    expect(parsed?.styles).toEqual({});
    expect(parsed?.contextStyles).toEqual({});
  });

  it("keeps a scoped rule scoped when kind is missing", () => {
    const parsed = parseStyleRule({
      id: "r1",
      name: "whatever",
      scope: { type: "node", nodeId: "n1", role: "module-style" },
    });
    expect(parsed?.kind).toBe("scoped");
    expect(parsed?.scope?.nodeId).toBe("n1");
  });

  it("replaces an unusable selector instead of emitting broken CSS", () => {
    const parsed = parseStyleRule({ id: "r1", name: "card", selector: "h1 {" });
    expect(parsed?.selector).toBe(".card");
  });

  it("drops invalid entries but keeps the rest of the registry", () => {
    const rules = parseStyleRuleRegistry([
      { id: "a", name: "one" },
      { name: "no-id" },
      { id: "b", name: "two" },
      "junk",
    ]);
    expect(rules.map((rule) => rule.id)).toEqual(["a", "b"]);
  });

  it("deduplicates by id and renumbers the order", () => {
    const rules = parseStyleRuleRegistry([
      { id: "a", name: "one", order: 7 },
      { id: "a", name: "one-again" },
      { id: "b", name: "two", order: 0 },
    ]);
    expect(rules.map((rule) => rule.id)).toEqual(["a", "b"]);
    expect(rules.map((rule) => rule.order)).toEqual([0, 1]);
  });

  it("normalizes a stale order to the array position", () => {
    const rules = [
      createClassRule({ id: "a", name: "one", order: 5 }),
      createClassRule({ id: "b", name: "two", order: 5 }),
    ];
    expect(normalizeRuleOrder(rules).map((rule) => rule.order)).toEqual([0, 1]);
  });

  it("tolerates a registry that is not an array", () => {
    expect(parseStyleRuleRegistry(null)).toEqual([]);
    expect(parseStyleRuleRegistry({ id: "a" })).toEqual([]);
    expect(parseStyleRuleRegistry(undefined)).toEqual([]);
  });
});

describe("style rule validation", () => {
  it("accepts a well-formed rule and reports the field of a broken one", () => {
    const rule = createClassRule({ id: "r1", name: "card" });
    expect(isStyleRule(rule)).toBe(true);
    expect(styleRuleErrors(rule)).toEqual([]);

    const broken = { ...rule, order: -1 };
    expect(isStyleRule(broken)).toBe(false);
    expect(styleRuleErrors(broken).join(" ")).toContain("order");
  });

  it("rejects an unknown extra field", () => {
    const rule = { ...createClassRule({ id: "r1", name: "card" }), nope: true };
    expect(styleRuleErrors(rule).join(" ")).toContain("nope");
  });
});