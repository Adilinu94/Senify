import { describe, expect, it } from "vitest";
import { fromPuckData, toPuckData, PUCK_META_KEY } from "@senify/editor";
import { SenifyError } from "@senify/core";
import { cloneTree, draftTree } from "./fixtures.ts";

describe("Puck adapter (NodeTree ⇄ Puck data)", () => {
  it("round-trips a tree losslessly", () => {
    const tree = draftTree();
    const puck = toPuckData(tree);
    const back = fromPuckData(puck);
    expect(back).toEqual(tree);
  });

  it("keeps nodes whose type the registry does not know", () => {
    const tree = draftTree();
    const back = fromPuckData(toPuckData(tree));
    expect(back.nodes.widget00001).toEqual(tree.nodes.widget00001);
  });

  it("keeps orphans the page never renders", () => {
    const tree = draftTree();
    const puck = toPuckData(tree);
    const meta = puck.root.props[PUCK_META_KEY] as { orphans?: unknown[] };
    expect(meta.orphans).toHaveLength(1);
    expect(fromPuckData(puck).nodes.orphan000001).toEqual(tree.nodes.orphan000001);
  });

  it("maps children, slots, overrides and motion into Puck props", () => {
    const puck = toPuckData(draftTree());
    const hero = puck.content.find((entry) => entry.type === "hero");
    expect(hero).toBeDefined();
    expect(hero?.props.id).toBe("hero000001");
    // children live under the reserved key, slots are Puck-native arrays.
    expect(Array.isArray(hero?.props.visual)).toBe(true);
    const meta = hero?.props[PUCK_META_KEY] as {
      slotNames?: string[];
      motion?: { preset: string };
      overrides?: Record<string, unknown>;
      variant?: string;
    };
    expect(meta.slotNames).toEqual(["visual"]);
    expect(meta.motion?.preset).toBe("masked-headline");
    expect(Object.keys(meta.overrides ?? {})).toEqual(["mobile"]);
    expect(meta.variant).toBe("centered");
  });

  it("writes the page root into data.root and keeps the node type", () => {
    const puck = toPuckData(draftTree());
    const meta = puck.root.props[PUCK_META_KEY] as { rootType?: string };
    expect(puck.root.props.id).toBe("page000001");
    expect(meta.rootType).toBe("page");
    expect(puck.content.map((entry) => entry.type)).toEqual([
      "hero",
      "pricing",
      "custom-widget",
    ]);
  });

  it("is idempotent: adapter → adapter yields the same Puck data", () => {
    const tree = draftTree();
    const first = toPuckData(tree);
    const second = toPuckData(fromPuckData(first));
    expect(second).toEqual(first);
  });

  it("does not mutate the source tree", () => {
    const tree = draftTree();
    const before = cloneTree(tree);
    fromPuckData(toPuckData(tree));
    expect(tree).toEqual(before);
  });

  it("rejects section props that collide with reserved editor keys", () => {
    const tree = draftTree();
    const widget = tree.nodes.widget00001;
    if (!widget) throw new Error("fixture missing");
    widget.props[PUCK_META_KEY] = "clash";
    expect(() => toPuckData(tree)).toThrow(SenifyError);
  });

  it("rejects a prop and a slot that share a name", () => {
    const tree = draftTree();
    const hero = tree.nodes.hero000001;
    if (!hero) throw new Error("fixture missing");
    hero.props.visual = "clash";
    expect(() => toPuckData(tree)).toThrow(/prop and a slot/);
  });

  it("rejects Puck data without node ids", () => {
    expect(() =>
      fromPuckData({ root: { props: { id: "" } }, content: [] }),
    ).toThrow(/missing a string "id"/);
  });
});
