import { describe, expect, it } from "vitest";
import {
  applyDocumentPatches,
  applyEditorMutation,
  createDocument,
  validateDocument,
  type EditorDocument,
} from "@senify/editor/state";
import { parseEditorMutation, type EditorMutation } from "@senify/engine";
import { baseStore, counterIds, makeStore } from "./fixtures.ts";

function nextOf(
  document: EditorDocument,
  mutation: EditorMutation,
): EditorDocument {
  const result = applyEditorMutation(document, mutation, { idFactory: counterIds() });
  return applyDocumentPatches(document, result.forward);
}

// A canonical class rule, shaped like the site registry stores it.
function rule(
  id: string,
  name: string,
  styles: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name,
    kind: "class",
    selector: `.${name}`,
    order: 0,
    styles,
    contextStyles: {},
    ...extra,
  };
}

describe("structure operations", () => {
  it("rejects a child the catalog does not allow, with a clear message", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "list", id: "list000001" },
    });
    expect(() =>
      store.apply({
        op: "insertNode",
        parent: { nodeId: "list000001" },
        node: { primitive: "button", id: "btn0000001" },
      }),
    ).toThrow(/does not allow child "button"/);
  });

  it("rejects an unknown primitive", () => {
    const store = makeStore();
    expect(() =>
      store.apply({
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: { primitive: "nope" },
      }),
    ).toThrow(/Unknown primitive "nope"/);
  });

  it("refuses to insert the root again", () => {
    const store = makeStore();
    expect(() =>
      store.apply({
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: { primitive: "root" },
      }),
    ).toThrow(/root cannot be inserted/);
  });

  it("moves a node and refuses to move it into its own subtree", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "frame", id: "frame000001" },
    });
    store.apply({
      op: "insertNode",
      parent: { nodeId: "frame000001" },
      node: { primitive: "frame", id: "frame000002" },
    });
    expect(() =>
      store.apply({
        op: "moveNode",
        id: "frame000001",
        target: { nodeId: "frame000002" },
      }),
    ).toThrow(/own subtree/);
    expect(() =>
      store.apply({
        op: "moveNode",
        id: "frame000002",
        target: { nodeId: root },
        index: 0,
      }),
    ).not.toThrow();
    expect(store.document.nodes[root]?.children).toEqual([
      "frame000002",
      "frame000001",
    ]);
  });

  it("duplicates a subtree with fresh ids", () => {
    const store = baseStore();
    const before = Object.keys(store.document.nodes).length;
    store.apply({ op: "duplicateNode", id: "sec0000001" });
    const ids = Object.keys(store.document.nodes);
    expect(ids.length).toBe(before + 2);
    const headings = ids.filter(
      (id) => store.document.nodes[id]?.primitive === "heading",
    );
    expect(headings).toHaveLength(2);
  });

  it("deletes a subtree and can undo it", () => {
    const store = baseStore();
    store.apply({ op: "deleteNode", id: "sec0000001" });
    expect(store.document.nodes["sec0000001"]).toBeUndefined();
    expect(store.document.nodes["head000001"]).toBeUndefined();
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
  });

  it("refuses to delete the root", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "deleteNode", id: store.document.rootNodeId }),
    ).toThrow(/root cannot be deleted/);
  });
});

describe("property writes per device", () => {
  it("sets and clears a device value so inheritance takes over again", () => {
    const store = baseStore();
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 18,
      device: "tablet",
    });
    expect(store.document.nodes["head000001"]?.props["fontSize_tablet"]).toBe(18);
    store.apply({
      op: "clearNodeProp",
      id: "head000001",
      key: "fontSize",
      device: "tablet",
    });
    expect(store.document.nodes["head000001"]?.props["fontSize_tablet"]).toBeUndefined();
    expect(store.document.nodes["head000001"]?.props["fontSize"]).toBe(24);
  });

  it("warns when a device value has no broader value to inherit from", () => {
    const store = makeStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "heading", id: "head000001" },
    });
    const outcome = store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 14,
      device: "mobile",
    });
    expect(outcome.warnings[0]).toMatch(/No broader value/);
  });

  it("rejects an unsafe property name and a wrong value type", () => {
    const store = baseStore();
    // A catalog prop keeps its type contract (`text` must be a string).
    expect(() =>
      store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: 5 }),
    ).toThrow(/must be a string/);
    // A property name that would break out of the declaration is rejected.
    expect(() =>
      store.apply({ op: "setNodeProp", id: "head000001", key: "color:red", value: 1 }),
    ).toThrow(/Unsafe CSS property/);
  });

  it("accepts a free CSS property the catalog does not know (ADR-0005)", () => {
    const store = baseStore();
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "scrollSnapType",
      value: "x mandatory",
    });
    expect(store.document.nodes["head000001"]?.props["scrollSnapType"]).toBe("x mandatory");
    // A value that would break out of the declaration is rejected loudly.
    expect(() =>
      store.apply({
        op: "setNodeProp",
        id: "head000001",
        key: "boxShadow",
        value: "red; } body { background: black",
      }),
    ).toThrow(/Unsafe CSS value/);
  });
});

describe("class operations", () => {
  it("assigns, removes and renames classes", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" }),
    ).toThrow(/Unknown style class "cta"/);
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { background: "#f00" }) });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    expect(store.document.nodes["btn0000001"]?.classes).toEqual(["cta"]);
    // The rename follows the id, so the assignment survives.
    store.apply({ op: "renameStyleRule", id: "r-cta", name: "hero-cta" });
    expect(store.document.nodes["btn0000001"]?.classes).toEqual(["hero-cta"]);
    const renamed = store.document.styleRules.find((entry) => entry.id === "r-cta");
    expect(renamed?.name).toBe("hero-cta");
    expect(renamed?.selector).toBe(".hero-cta");
    store.apply({ op: "removeClass", id: "btn0000001", classId: "hero-cta" });
    expect(store.document.nodes["btn0000001"]?.classes).toBeUndefined();
  });

  it("rejects removing a class that is not assigned", () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#fff" }) });
    expect(() =>
      store.apply({ op: "removeClass", id: "btn0000001", classId: "cta" }),
    ).toThrow(/not assigned/);
  });

  it("rejects a rename onto an existing name and a missing source", () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("r-a", "a", { color: "#000" }) });
    store.apply({ op: "upsertStyleRule", rule: rule("r-b", "b", { color: "#111" }) });
    expect(() =>
      store.apply({ op: "renameStyleRule", id: "r-a", name: "b" }),
    ).toThrow(/already exists/);
    expect(() =>
      store.apply({ op: "renameStyleRule", id: "missing", name: "c" }),
    ).toThrow(/does not exist/);
  });
});

describe("style rules", () => {
  const names = (store: ReturnType<typeof baseStore>): string[] =>
    store.document.styleRules.map((entry) => entry.name);

  it("upserts a rule, validates it and deletes it", () => {
    const store = baseStore();
    // A free property is allowed; an unsafe value is not (ADR-0005).
    expect(() =>
      store.apply({
        op: "upsertStyleRule",
        rule: rule("r-bad", "bad", { backgroundImage: "url(javascript:alert(1))" }),
      }),
    ).toThrow(/Unsafe CSS value/);
    store.apply({
      op: "upsertStyleRule",
      rule: rule("r-free", "free", { clipPath: "polygon(0 0, 100% 0, 50% 100%)" }),
    });
    expect(store.document.styleRules.find((entry) => entry.id === "r-free")?.styles).toEqual({
      clipPath: "polygon(0 0, 100% 0, 50% 100%)",
    });
    // The upsert replaces by id, so the same rule can be edited.
    store.apply({
      op: "upsertStyleRule",
      rule: rule("r-free", "free", { clipPath: "none" }),
    });
    expect(store.document.styleRules.find((entry) => entry.id === "r-free")?.styles).toEqual({
      clipPath: "none",
    });
    // A second assignable rule with the same name is a conflict.
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { background: "#f00" }) });
    expect(() =>
      store.apply({ op: "upsertStyleRule", rule: rule("r-cta2", "cta", {}) }),
    ).toThrow(/already exists/);
    // States and the author ride along (O11, ADR-0005).
    store.apply({
      op: "upsertStyleRule",
      rule: rule("r-cta", "cta", { color: "#fff" }, {
        states: { hover: { color: "#00ff00" } },
        authoredBy: "agent",
      }),
    });
    const cta = store.document.styleRules.find((entry) => entry.id === "r-cta");
    expect(cta?.states).toEqual({ hover: { color: "#00ff00" } });
    expect(cta?.authoredBy).toBe("agent");
    // Deleting the rule removes the assignment from every node.
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    store.apply({ op: "deleteStyleRule", id: "r-cta" });
    expect(store.document.styleRules.find((entry) => entry.id === "r-cta")).toBeUndefined();
    expect(store.document.nodes["btn0000001"]?.classes).toBeUndefined();
    expect(validateDocument(store.document)).toEqual([]);
  });

  it("undoes a delete completely, assignment included", () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("r-cta", "cta", { color: "#fff" }) });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    store.apply({ op: "deleteStyleRule", id: "r-cta" });
    store.undo();
    expect(store.document.styleRules.find((entry) => entry.id === "r-cta")?.name).toBe("cta");
    expect(store.document.nodes["btn0000001"]?.classes).toEqual(["cta"]);
    expect(validateDocument(store.document)).toEqual([]);
  });

  it("reorders a rule and undoes the move", () => {
    const store = baseStore();
    for (const [id, name] of [["r-a", "a"], ["r-b", "b"], ["r-c", "c"]] as const) {
      store.apply({ op: "upsertStyleRule", rule: rule(id, name) });
    }
    expect(names(store)).toEqual(["a", "b", "c"]);

    store.apply({ op: "reorderStyleRule", id: "r-c", index: 0 });
    expect(names(store)).toEqual(["c", "a", "b"]);

    store.apply({ op: "reorderStyleRule", id: "r-c", index: 2 });
    expect(names(store)).toEqual(["a", "b", "c"]);

    store.undo();
    expect(names(store)).toEqual(["c", "a", "b"]);
    store.redo();
    expect(names(store)).toEqual(["a", "b", "c"]);
  });

  it("rejects reordering a missing rule or an out-of-range index", () => {
    const store = baseStore();
    store.apply({ op: "upsertStyleRule", rule: rule("r-a", "a") });
    expect(() =>
      store.apply({ op: "reorderStyleRule", id: "missing", index: 0 }),
    ).toThrow(/does not exist/);
    expect(() =>
      store.apply({ op: "reorderStyleRule", id: "r-a", index: 3 }),
    ).toThrow(/outside the style rule list/);
  });

  it("keeps a scoped rule tied to its node", () => {
    const store = baseStore();
    store.apply({
      op: "upsertStyleRule",
      rule: {
        id: "r-scope",
        name: "__senify_scope_btn0000001",
        kind: "scoped",
        selector: ".__senify_scope_btn0000001",
        order: 0,
        styles: { borderRadius: "12px" },
        contextStyles: {},
        scope: { type: "node", nodeId: "btn0000001", role: "module-style" },
      },
    });
    // Deleting the node takes its scoped rule with it…
    store.apply({ op: "deleteNode", id: "btn0000001" });
    expect(store.document.styleRules.find((entry) => entry.id === "r-scope")).toBeUndefined();
    expect(validateDocument(store.document)).toEqual([]);
    // …and the undo brings both back.
    store.undo();
    expect(store.document.styleRules.find((entry) => entry.id === "r-scope")).toBeDefined();
    expect(validateDocument(store.document)).toEqual([]);
  });

  it("gives a duplicated node its own scoped rule", () => {
    const store = baseStore();
    store.apply({
      op: "upsertStyleRule",
      rule: {
        id: "r-scope",
        name: "__senify_scope_btn0000001",
        kind: "scoped",
        selector: ".__senify_scope_btn0000001",
        order: 0,
        styles: { borderRadius: "12px" },
        contextStyles: {},
        scope: { type: "node", nodeId: "btn0000001", role: "module-style" },
      },
    });
    store.apply({ op: "duplicateNode", id: "btn0000001" });
    const scoped = store.document.styleRules.filter((entry) => entry.kind === "scoped");
    expect(scoped).toHaveLength(2);
    const copies = scoped.filter((entry) => entry.id !== "r-scope");
    expect(copies).toHaveLength(1);
    const copy = copies[0];
    expect(copy?.scope?.nodeId).not.toBe("btn0000001");
    expect(copy?.name).toBe(`__senify_scope_${copy?.scope?.nodeId}`);
    expect(validateDocument(store.document)).toEqual([]);
    store.undo();
    expect(store.document.styleRules.filter((entry) => entry.kind === "scoped")).toHaveLength(1);
  });

  it("rejects a reserved context id and an unsafe rawCss", () => {
    const store = baseStore();
    expect(() =>
      store.apply({
        op: "upsertStyleRule",
        rule: rule("r-ctx", "ctx", {}, {
          contextStyles: { mobile: { color: "#fff" } },
        }),
      }),
    ).toThrow(/reserved/);
    expect(() =>
      store.apply({
        op: "upsertStyleRule",
        rule: rule("r-raw", "raw", {}, { rawCss: "@import url(https://evil.example/x.css)" }),
      }),
    ).toThrow(/keyframes/);
    store.apply({
      op: "upsertStyleRule",
      rule: rule("r-raw", "raw", {}, {
        rawCss: "@keyframes spin { from { opacity: 0; } to { opacity: 1; } }",
      }),
    });
    expect(store.document.styleRules.find((entry) => entry.id === "r-raw")).toBeDefined();
  });
});

describe("slots and collection entries", () => {
  it("sets slot content and rejects unknown slots", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "collection", id: "col0000001" },
    });
    expect(() =>
      store.apply({
        op: "setSlotContent",
        id: "col0000001",
        slot: "nope",
        nodes: [],
      }),
    ).toThrow(/no slot "nope"/);
    store.apply({
      op: "setSlotContent",
      id: "col0000001",
      slot: "item",
      nodes: [{ primitive: "text", id: "text000001", props: { text: "A" } }],
    });
    expect(store.document.nodes["col0000001"]?.slots?.["item"]).toEqual([
      "text000001",
    ]);
    store.apply({
      op: "setSlotContent",
      id: "col0000001",
      slot: "item",
      nodes: [{ primitive: "text", id: "text000002", props: { text: "B" } }],
    });
    expect(store.document.nodes["col0000001"]?.slots?.["item"]).toEqual([
      "text000002",
    ]);
    expect(store.document.nodes["text000001"]).toBeUndefined();
  });

  it("creates and updates a collection entry, enforcing the item slot max", () => {
    const store = makeStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "collection", id: "col0000001" },
    });
    store.apply({
      op: "createCollectionEntry",
      id: "col0000001",
      node: { primitive: "text", id: "text000001", props: { text: "A" } },
    });
    expect(() =>
      store.apply({
        op: "createCollectionEntry",
        id: "col0000001",
        node: { primitive: "text", props: { text: "B" } },
      }),
    ).toThrow(/item slot of "collection" is full/);
    store.apply({
      op: "updateCollectionEntry",
      id: "col0000001",
      index: 0,
      patch: { text: "Neu" },
    });
    expect(store.document.nodes["text000001"]?.props["text"]).toBe("Neu");
    expect(() =>
      store.apply({
        op: "updateCollectionEntry",
        id: "col0000001",
        index: 5,
        patch: { text: "X" },
      }),
    ).toThrow(/No collection entry at index 5/);
  });

  it("rejects collection ops on a non-collection", () => {
    const store = baseStore();
    expect(() =>
      store.apply({
        op: "createCollectionEntry",
        id: "sec0000001",
        node: { primitive: "text" },
      }),
    ).toThrow(/is not a collection/);
  });
});

describe("operation patches round-trip", () => {
  it("forwards and inverts every op through its patch list", () => {
    const store = baseStore();
    const document = store.document;
    const mutations: EditorMutation[] = [
      { op: "upsertStyleRule", rule: rule("r-cta", "cta", { background: "#f00" }) } as EditorMutation,
      { op: "assignClass", id: "btn0000001", classId: "cta" },
      { op: "setNodeProp", id: "head000001", key: "fontSize", value: 18, device: "tablet" },
      { op: "insertNode", parent: { nodeId: "sec0000001" }, node: { primitive: "text", id: "text000001" } },
    ];
    let current = document;
    for (const mutation of mutations) {
      const parsed = parseEditorMutation(mutation);
      const result = applyEditorMutation(current, parsed, { idFactory: counterIds() });
      const next = applyDocumentPatches(current, result.forward);
      const back = applyDocumentPatches(next, result.inverse);
      expect(back).toEqual(current);
      current = next;
    }
  });
});

describe("motion operations", () => {
  it("sets, replaces and clears a motion spec with undo", () => {
    const store = baseStore();
    store.apply({
      op: "setMotion",
      id: "head000001",
      spec: { preset: "fade-up", intensity: 6 },
    });
    expect(store.document.nodes["head000001"]?.motion).toEqual({
      preset: "fade-up",
      intensity: 6,
    });

    store.apply({ op: "setMotion", id: "head000001", spec: { preset: "scroll-reveal" } });
    expect(store.document.nodes["head000001"]?.motion?.preset).toBe("scroll-reveal");

    store.undo();
    expect(store.document.nodes["head000001"]?.motion?.preset).toBe("fade-up");
    store.undo();
    expect(store.document.nodes["head000001"]?.motion).toBeUndefined();
  });

  it("rejects an unknown preset and motion on the page root", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "setMotion", id: "head000001", spec: { preset: "warp-speed" } }),
    ).toThrow(/Unknown motion preset/);
    expect(() =>
      store.apply({
        op: "setMotion",
        id: store.document.rootNodeId,
        spec: { preset: "fade-up" },
      }),
    ).toThrow(/root has no motion/);
  });

  it("clearing a node without motion is a no-op", () => {
    const store = baseStore();
    store.apply({ op: "clearMotion", id: "head000001" });
    expect(store.document.nodes["head000001"]?.motion).toBeUndefined();
  });
});

describe("editor contract", () => {
  it("rejects unknown ops and bad shapes with a field path", () => {
    expect(() => parseEditorMutation({ op: "nope" })).toThrow(/Unknown editor mutation/);
    try {
      parseEditorMutation({ op: "setNodeProp", id: "", key: "x", value: 1 });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as { field?: string }).field).toMatch(/^mutations\[0\]\./);
    }
    expect(() =>
      parseEditorMutation({ op: "setNodeProp", id: "x", key: "k", value: 1, device: "tv" }),
    ).toThrow(/device/);
  });

  it("parses a valid batch", () => {
    const mutation = parseEditorMutation({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 20,
    });
    expect(mutation.op).toBe("setNodeProp");
  });
});

describe("document next-state helper", () => {
  it("applies an operation to a hand-built document", () => {
    const document = createDocument(counterIds("r"));
    const next = nextOf(document, {
      op: "insertNode",
      parent: { nodeId: document.rootNodeId },
      node: { primitive: "heading", id: "head000001" },
    });
    expect(next.nodes["head000001"]?.primitive).toBe("heading");
  });
});
