import { describe, expect, it } from "vitest";
import { baseStore } from "./fixtures.ts";

// The variant of a section node (hero: centered / split / …). The canvas and
// the release render the variant on the node; the store writes it as a
// structural field, undoes it, and refuses a name the section does not declare
// (the server refuses it on save anyway, so the editor says so up front).

function withHero() {
  const store = baseStore();
  store.apply({
    op: "insertNode",
    parent: { nodeId: store.document.rootNodeId },
    node: { primitive: "hero", id: "hero000001", props: { headline: "Hallo" } },
  });
  return store;
}

const variantOf = (store: ReturnType<typeof withHero>) => store.document.nodes["hero000001"]?.variant;

describe("section variant in the editor store", () => {
  it("sets the variant, keeps the props and undoes it", () => {
    const store = withHero();
    expect(variantOf(store)).toBeUndefined();
    store.apply({ op: "setNodeMeta", id: "hero000001", meta: { variant: "split" } });
    expect(variantOf(store)).toBe("split");
    // A switch changes the variant only: the content stays.
    expect(store.document.nodes["hero000001"]?.props["headline"]).toBe("Hallo");
    expect(store.undo()).toBe(true);
    expect(variantOf(store)).toBeUndefined();
    expect(store.redo()).toBe(true);
    expect(variantOf(store)).toBe("split");
  });

  it("returns to the section default with null, and undoes that too", () => {
    const store = withHero();
    store.apply({ op: "setNodeMeta", id: "hero000001", meta: { variant: "split" } });
    store.apply({ op: "setNodeMeta", id: "hero000001", meta: { variant: null } });
    expect(variantOf(store)).toBeUndefined();
    store.undo();
    expect(variantOf(store)).toBe("split");
  });

  it("refuses a variant the section does not declare and leaves the node alone", () => {
    const store = withHero();
    expect(() =>
      store.apply({ op: "setNodeMeta", id: "hero000001", meta: { variant: "nope" } }),
    ).toThrow(/no variant "nope"/);
    expect(variantOf(store)).toBeUndefined();
  });

  it("refuses a variant on a node whose primitive has none", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "setNodeMeta", id: "head000001", meta: { variant: "split" } }),
    ).toThrow(/has no variants/);
    expect(store.document.nodes["head000001"]?.variant).toBeUndefined();
  });

  it("writes the variant together with other structural fields in one op", () => {
    const store = withHero();
    store.apply({
      op: "setNodeMeta",
      id: "hero000001",
      meta: { variant: "split", locked: true },
    });
    const node = store.document.nodes["hero000001"];
    expect(node?.variant).toBe("split");
    expect(node?.locked).toBe(true);
    store.undo();
    const undone = store.document.nodes["hero000001"];
    expect(undone?.variant).toBeUndefined();
    expect(undone?.locked).toBeUndefined();
  });
});
