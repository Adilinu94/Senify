import { describe, expect, it } from "vitest";
import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
  COMPONENT_STUB_TYPE,
  componentDefinitions,
  componentDrift,
  componentParts,
  inlineComponents,
  instanceOverrides,
  instanceVersion,
  readSlotSpec,
  staleOverrides,
  unfilledSlots,
  wouldCreateCycle,
  type Node,
  type NodeTree,
} from "@senify/section-sdk";

// Ticket 04, slice 1: the component model as pure data. A definition is a
// reserved node in the tree, an instance names it and fills its slots; the
// inliner is the one derivation for canvas and bake.

function node(id: string, type: string, extra: Partial<Node> = {}): Node {
  return { id, type, props: {}, ...extra };
}

// A definition with a heading and a named slot, plus a page that instantiates
// it once with filled slot content.
function fixture(): NodeTree {
  return {
    rootNodeId: "root000001",
    nodes: {
      root000001: node("root000001", "page", { children: ["def0000001", "sec0000001"] }),
      def0000001: node("def0000001", COMPONENT_DEFINITION_TYPE, {
        props: { name: "card" },
        children: ["head000001"],
      }),
      head000001: node("head000001", "heading", {
        props: { text: "Karte" },
        children: ["slot000001"],
      }),
      slot000001: node("slot000001", COMPONENT_SLOT_TYPE, {
        props: { name: "content" },
      }),
      sec0000001: node("sec0000001", "frame", {
        children: ["inst000001"],
      }),
      inst000001: node("inst000001", COMPONENT_INSTANCE_TYPE, {
        props: { componentId: "def0000001" },
        slots: { content: ["body000001"] },
      }),
      body000001: node("body000001", "body", { props: { html: "Inhalt" } }),
    },
  };
}

describe("component definitions", () => {
  it("finds definitions and their slots in tree order", () => {
    const definitions = componentDefinitions(fixture());
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.name).toBe("card");
    expect(definitions[0]?.slots.map((slot) => slot.name)).toEqual(["content"]);
    expect(definitions[0]?.version).toBe(1);
  });

  it("reads the slot rules from the placeholder props", () => {
    const tree = fixture();
    tree.nodes["slot000001"]!.props = {
      name: "content",
      allowedTypes: ["heading", "body"],
      max: 2,
    };
    const definition = componentDefinitions(tree)[0]!;
    expect(definition.slots).toEqual([
      {
        name: "content",
        nodeId: "slot000001",
        allowedTypes: ["heading", "body"],
        max: 2,
      },
    ]);
    // Malformed values are ignored, not fatal.
    expect(
      readSlotSpec({ id: "s1", props: { name: "x", allowedTypes: "heading", max: -3 } }),
    ).toEqual({ name: "x", nodeId: "s1", allowedTypes: [], max: null });
    // Without a name the node id stands in.
    expect(readSlotSpec({ id: "s2", props: {} }).name).toBe("s2");
  });

  it("reports instances whose pin differs from the definition version", () => {
    const tree = fixture();
    expect(componentDrift(tree)).toEqual([]);
    tree.nodes["def0000001"]!.props = { name: "card", version: 2 };
    expect(componentDrift(tree)).toEqual([
      { instanceId: "inst000001", componentId: "def0000001", pinned: 1, current: 2 },
    ]);
    tree.nodes["inst000001"]!.props = { componentId: "def0000001", componentVersion: 2 };
    expect(instanceVersion(tree.nodes["inst000001"]!)).toBe(2);
    expect(componentDrift(tree)).toEqual([]);
    // An instance without a definition is a problem, not drift.
    tree.nodes["inst000001"]!.props = { componentId: "missing001", componentVersion: 9 };
    expect(componentDrift(tree)).toEqual([]);
  });

  it("reports unfilled slots against an instance", () => {
    const tree = fixture();
    const definition = componentDefinitions(tree)[0]!;
    const instance = tree.nodes["inst000001"]!;
    expect(unfilledSlots(definition, instance)).toEqual([]);
    const empty: Node = { ...instance, slots: {} };
    expect(unfilledSlots(definition, empty)).toEqual(["content"]);
  });
});

describe("inlineComponents", () => {
  it("expands an instance, fills the slot and drops the definition", () => {
    const result = inlineComponents(fixture());
    expect(result.problems).toEqual([]);
    const root = result.tree.nodes[result.tree.rootNodeId]!;
    // The definition is gone, the page keeps one section.
    expect(Object.values(result.tree.nodes).some((entry) => entry.type === COMPONENT_DEFINITION_TYPE)).toBe(false);
    expect(root.children).toHaveLength(1);
    const section = result.tree.nodes[root.children![0]!]!;
    expect(section.type).toBe("frame");
    const instanceCopy = result.tree.nodes[section.children![0]!]!;
    // The copy carries the definition's shape: heading + the filled slot.
    expect(instanceCopy.type).toBe("heading");
    const heading = instanceCopy;
    expect(heading.props["text"]).toBe("Karte");
    expect(heading.children).toHaveLength(1);
    const filled = result.tree.nodes[heading.children![0]!]!;
    expect(filled.type).toBe("body");
    expect(filled.props["html"]).toBe("Inhalt");
  });

  it("gives every copy fresh, deterministic ids and maps them", () => {
    const first = inlineComponents(fixture());
    const second = inlineComponents(fixture());
    const ids = Object.keys(first.tree.nodes).sort();
    expect(ids).toEqual(Object.keys(second.tree.nodes).sort());
    expect(ids).not.toContain("head000001");
    expect(first.nodeIdMap.get("head000001")).toBeDefined();
    expect(first.nodeIdMap.get("head000001")).toBe(second.nodeIdMap.get("head000001"));
  });

  it("expands the same definition twice without id collisions", () => {
    const tree = fixture();
    tree.nodes["sec0000002"] = node("sec0000002", "frame", { children: ["inst000002"] });
    tree.nodes["inst000002"] = node("inst000002", COMPONENT_INSTANCE_TYPE, {
      props: { componentId: "def0000001" },
      slots: { content: [] },
    });
    tree.nodes["root000001"] = node("root000001", "page", {
      children: ["def0000001", "sec0000001", "sec0000002"],
    });
    const result = inlineComponents(tree);
    expect(result.problems).toEqual([]);
    const ids = Object.keys(result.tree.nodes);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports an unknown component and leaves a stub instead of crashing", () => {
    const tree = fixture();
    tree.nodes["inst000001"] = node("inst000001", COMPONENT_INSTANCE_TYPE, {
      props: { componentId: "missing001" },
    });
    const result = inlineComponents(tree);
    expect(result.problems.map((problem) => problem.kind)).toEqual(["unknown-component"]);
    const stubs = Object.values(result.tree.nodes).filter(
      (entry) => entry.type === COMPONENT_STUB_TYPE,
    );
    expect(stubs).toHaveLength(1);
    expect(String(stubs[0]?.props["message"])).toContain("missing001");
  });

  it("detects a cycle through another definition", () => {
    const tree: NodeTree = {
      rootNodeId: "root000001",
      nodes: {
        root000001: node("root000001", "page", {
          children: ["def0000001", "def0000002", "sec0000001"],
        }),
        def0000001: node("def0000001", COMPONENT_DEFINITION_TYPE, {
          props: { name: "a" },
          children: ["inst000002"],
        }),
        def0000002: node("def0000002", COMPONENT_DEFINITION_TYPE, {
          props: { name: "b" },
          children: ["inst000001"],
        }),
        inst000001: node("inst000001", COMPONENT_INSTANCE_TYPE, {
          props: { componentId: "def0000001" },
        }),
        inst000002: node("inst000002", COMPONENT_INSTANCE_TYPE, {
          props: { componentId: "def0000002" },
        }),
        // The page instantiates the cyclic definition: that is where the
        // inliner meets the loop.
        sec0000001: node("sec0000001", "frame", { children: ["pageinst01"] }),
        pageinst01: node("pageinst01", COMPONENT_INSTANCE_TYPE, {
          props: { componentId: "def0000001" },
        }),
      },
    };
    expect(wouldCreateCycle(tree, "def0000001", tree)).toBe(true);
    const result = inlineComponents(tree);
    expect(result.problems.some((problem) => problem.kind === "cycle")).toBe(true);
    // The loop ends in a stub, not in an endless expansion.
    expect(
      Object.values(result.tree.nodes).some((entry) => entry.type === COMPONENT_STUB_TYPE),
    ).toBe(true);
  });

  it("leaves a tree without components untouched", () => {
    const plain: NodeTree = {
      rootNodeId: "root000001",
      nodes: {
        root000001: node("root000001", "page", { children: ["sec0000001"] }),
        sec0000001: node("sec0000001", "hero", { props: { headline: "Hallo" } }),
      },
    };
    const result = inlineComponents(plain);
    expect(result.problems).toEqual([]);
    expect(result.tree).toEqual(plain);
  });
});

describe("instance overrides", () => {
  // The instance changes the heading text of its copy only — the definition
  // (and every other instance) stays untouched.
  function withOverride(): NodeTree {
    const tree = fixture();
    tree.nodes["inst000001"] = node("inst000001", COMPONENT_INSTANCE_TYPE, {
      props: {
        componentId: "def0000001",
        overrides: { head000001: { text: "Eigene Karte" } },
      },
      slots: { content: ["body000001"] },
    });
    return tree;
  }

  it("reads the override bag of an instance", () => {
    const tree = withOverride();
    expect(instanceOverrides(tree.nodes["inst000001"]!)).toEqual({
      head000001: { text: "Eigene Karte" },
    });
    expect(instanceOverrides(node("x", COMPONENT_INSTANCE_TYPE))).toEqual({});
    expect(
      instanceOverrides(
        node("x", COMPONENT_INSTANCE_TYPE, { props: { overrides: "kaputt" } }),
      ),
    ).toEqual({});
  });

  it("merges overrides into the copy, never into the definition", () => {
    const tree = withOverride();
    const result = inlineComponents(tree);
    expect(result.problems).toEqual([]);
    const texts = Object.values(result.tree.nodes)
      .filter((entry) => entry.type === "heading")
      .map((entry) => entry.props["text"]);
    expect(texts).toEqual(["Eigene Karte"]);
    expect(tree.nodes["head000001"]?.props["text"]).toBe("Karte");
  });

  it("leaves other instances of the same definition unchanged", () => {
    const tree = withOverride();
    tree.nodes["sec0000002"] = node("sec0000002", "frame", { children: ["inst000002"] });
    tree.nodes["inst000002"] = node("inst000002", COMPONENT_INSTANCE_TYPE, {
      props: { componentId: "def0000001" },
      slots: { content: [] },
    });
    tree.nodes["root000001"] = node("root000001", "page", {
      children: ["def0000001", "sec0000001", "sec0000002"],
    });
    const result = inlineComponents(tree);
    const texts = Object.values(result.tree.nodes)
      .filter((entry) => entry.type === "heading")
      .map((entry) => entry.props["text"])
      .sort();
    expect(texts).toEqual(["Eigene Karte", "Karte"]);
  });

  it("lets an instance swap a nested instance through its part id", () => {
    // Two definitions; A embeds B. An instance of A overrides the nested
    // instance's `componentId` — instance swap without touching the definition.
    const tree: NodeTree = {
      rootNodeId: "root000001",
      nodes: {
        root000001: node("root000001", "page", {
          children: ["defa000001", "defb000001", "defc000001", "insta00001"],
        }),
        defa000001: node("defa000001", COMPONENT_DEFINITION_TYPE, {
          props: { name: "a" },
          children: ["inner00001"],
        }),
        inner00001: node("inner00001", COMPONENT_INSTANCE_TYPE, {
          props: { componentId: "defb000001" },
        }),
        defb000001: node("defb000001", COMPONENT_DEFINITION_TYPE, {
          props: { name: "b" },
          children: ["headb00001"],
        }),
        headb00001: node("headb00001", "heading", { props: { text: "B" } }),
        defc000001: node("defc000001", COMPONENT_DEFINITION_TYPE, {
          props: { name: "c" },
          children: ["headc00001"],
        }),
        headc00001: node("headc00001", "heading", { props: { text: "C" } }),
        insta00001: node("insta00001", COMPONENT_INSTANCE_TYPE, {
          props: {
            componentId: "defa000001",
            overrides: { inner00001: { componentId: "defc000001" } },
          },
        }),
      },
    };
    const result = inlineComponents(tree);
    expect(result.problems).toEqual([]);
    const texts = Object.values(result.tree.nodes)
      .filter((entry) => entry.type === "heading")
      .map((entry) => entry.props["text"]);
    expect(texts).toEqual(["C"]);
  });

  it("lists the parts of a definition and reports stale overrides", () => {
    const tree = withOverride();
    const parts = componentParts(tree, "def0000001");
    expect(parts.map((part) => part.id)).toEqual(["head000001"]);
    expect(parts[0]?.props["text"]).toBe("Karte");
    // A slot placeholder is structure, not an overridable part.
    expect(parts.some((part) => part.type === COMPONENT_SLOT_TYPE)).toBe(false);
    expect(staleOverrides(tree, tree.nodes["inst000001"]!)).toEqual([]);

    const stale = node("inst000002", COMPONENT_INSTANCE_TYPE, {
      props: {
        componentId: "def0000001",
        overrides: { gone000001: { text: "weg" }, head000001: { text: "da" } },
      },
    });
    expect(staleOverrides(tree, stale)).toEqual(["gone000001"]);
    // The stale entry does not break the inliner; it simply has no target.
    const result = inlineComponents(tree);
    expect(result.problems).toEqual([]);
  });
});
