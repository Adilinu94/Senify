import { describe, expect, it } from "vitest";
import {
  componentDefinitionsIn,
  componentPartsIn,
  createComponent,
  detachComponent,
  insertSlot,
  instantiateComponent,
  overridesOf,
  setComponentOverride,
} from "@senify/editor/state";
import { inlineComponents, type Node, type NodeTree } from "@senify/section-sdk";
import { canvasNodeTree } from "@senify/editor/canvas";
import { baseStore } from "./fixtures.ts";

// Ticket 04, slice 1: the component operations. A definition is a node, an
// instance is a node; every action is one `applyBatch` entry (one undo), and
// the render tree inlines what the store holds — the same derivation the bake
// runs.

describe("editor components", () => {
  it("turns a node into a definition and leaves an instance in its place", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "head000001", "karte");
    expect(definitionId).not.toBeNull();
    // The definition sits under the root, the heading became its root child.
    const root = store.document.nodes[store.document.rootNodeId];
    expect(root?.children).toContain(definitionId);
    expect(store.document.nodes[definitionId!]?.props["name"]).toBe("karte");
    expect(store.document.nodes[definitionId!]?.children).toEqual(["head000001"]);
    // The section now holds an instance where the heading was.
    const section = store.document.nodes["sec0000001"];
    const instanceId = section?.children?.[0];
    expect(instanceId).toBeDefined();
    expect(store.document.nodes[instanceId!]?.primitive).toBe("__component_instance");
    expect(store.document.nodes[instanceId!]?.props["componentId"]).toBe(definitionId);
    // One undo restores the original tree.
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["sec0000001"]?.children).toEqual(["head000001"]);
    expect(store.document.nodes[definitionId!]).toBeUndefined();
  });

  it("lists definitions and instantiates one behind a target", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "head000001", "karte");
    expect(componentDefinitionsIn(store)).toEqual([
      { id: definitionId, name: "karte" },
    ]);
    const instanceId = instantiateComponent(store, definitionId!, "head000001");
    // The target lives inside the definition; the instance lands next to it.
    expect(instanceId).not.toBeNull();
    expect(store.document.nodes[definitionId!]?.children).toContain(instanceId);
    // An unknown component is refused.
    expect(instantiateComponent(store, "missing001")).toBeNull();
  });

  it("declares a slot inside the definition", () => {
    const store = baseStore();
    // A container is the useful definition root: it can hold a slot.
    const definitionId = createComponent(store, "sec0000001", "karte");
    const slotId = insertSlot(store, definitionId!, "content");
    expect(slotId).not.toBeNull();
    expect(store.document.nodes["sec0000001"]?.children).toContain(slotId);
    expect(store.document.nodes[slotId!]?.props["name"]).toBe("content");
  });

  it("detaches an instance back into a real subtree", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0];
    expect(instanceId).toBeDefined();
    const detached = detachComponent(store, instanceId!);
    expect(detached).not.toBeNull();
    // The instance is gone, a real copy of the definition's subtree took over.
    expect(store.document.nodes[instanceId!]).toBeUndefined();
    const section = store.document.nodes["sec0000001"];
    expect(section?.children).toEqual([detached]);
    expect(store.document.nodes[detached!]?.primitive).toBe("heading");
    expect(store.document.nodes[detached!]?.props["text"]).toBe("Hallo");
    // The definition itself stays.
    expect(store.document.nodes[definitionId!]).toBeDefined();
  });

  it("inlines the canvas tree the way the bake does", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "sec0000001", "karte");
    insertSlot(store, definitionId!, "content");
    const tree: NodeTree = canvasNodeTree(store.document);
    // No definition and no instance survive the inlining.
    const types = Object.values(tree.nodes).map((node: Node) => node.type);
    expect(types).not.toContain("__component");
    expect(types).not.toContain("__component_instance");
    // The instance renders the definition's section again, heading included.
    const rendered = tree.nodes[tree.nodes[tree.rootNodeId]?.children?.[0] ?? ""];
    expect(rendered?.type).toBe("section");
    const headingId = rendered?.children?.[0];
    expect(tree.nodes[headingId ?? ""]?.type).toBe("heading");
    expect(tree.nodes[headingId ?? ""]?.props["text"]).toBe("Hallo");
    // A second, independent run gives the same ids (canvas and bake agree).
    const again = inlineComponents(canvasNodeTree(store.document));
    expect(Object.keys(again.tree.nodes).sort()).toEqual(Object.keys(tree.nodes).sort());
  });

  it("writes and clears an instance override, one part at a time", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0];
    expect(instanceId).toBeDefined();
    const parts = componentPartsIn(store, definitionId!);
    // The heading is the definition root and its only part.
    expect(parts.map((part) => part.id)).toEqual(["head000001"]);

    expect(
      setComponentOverride(store, instanceId!, "head000001", "text", "Eigene Karte"),
    ).toBe(true);
    expect(overridesOf(store, instanceId!)).toEqual({
      head000001: { text: "Eigene Karte" },
    });
    // The definition itself stays untouched; the canvas copy shows the value.
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    const tree = canvasNodeTree(store.document);
    const texts = Object.values(tree.nodes)
      .filter((node) => node.type === "heading")
      .map((node) => node.props["text"]);
    expect(texts).toEqual(["Eigene Karte"]);

    // Clearing removes the value and prunes the empty bag entirely.
    expect(setComponentOverride(store, instanceId!, "head000001", "text", null)).toBe(true);
    expect(overridesOf(store, instanceId!)).toEqual({});
    expect(store.document.nodes[instanceId!]?.props["overrides"]).toBeUndefined();

    // One undo brings the override back (the clear was its own entry).
    expect(store.undo()).toBe(true);
    expect(overridesOf(store, instanceId!)).toEqual({
      head000001: { text: "Eigene Karte" },
    });
  });

  it("refuses an override for a part that does not exist", () => {
    const store = baseStore();
    createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    expect(() =>
      setComponentOverride(store, instanceId, "missing001", "text", "x"),
    ).toThrowError(/no part "missing001"/);
  });

  it("materializes overrides when an instance is detached", () => {
    const store = baseStore();
    createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    setComponentOverride(store, instanceId, "head000001", "text", "Eigene Karte");
    const detached = detachComponent(store, instanceId);
    expect(detached).not.toBeNull();
    // The copy carries the override as a real prop; the definition is intact.
    expect(store.document.nodes[detached!]?.props["text"]).toBe("Eigene Karte");
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    // Both steps of the detach share one coalesce key: one undo restores the
    // instance (with its override bag).
    expect(store.undo()).toBe(true);
    expect(store.document.nodes[instanceId]?.primitive).toBe("__component_instance");
    expect(overridesOf(store, instanceId)).toEqual({
      head000001: { text: "Eigene Karte" },
    });
    expect(store.document.nodes[detached!]).toBeUndefined();
  });
});
