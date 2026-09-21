import { describe, expect, it } from "vitest";
import {
  componentDefinitionsIn,
  createComponent,
  detachComponent,
  insertSlot,
  instantiateComponent,
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
});
