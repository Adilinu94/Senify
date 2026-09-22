import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  composePageTree,
  type Mutation,
} from "@senify/engine";
import type { Node, NodeTree } from "@senify/section-sdk";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
  type MutationsResponse,
  type PageResponse,
} from "./helpers.ts";

// Visual components (ticket 04) through the running engine: the reserved node
// types must survive the save path (section registry + mutation validation) and
// the bake must resolve definitions that sit in a spliced tree. Slice 1 built
// the model; these tests pin the integration the canvas and the release need.

let env: BootEnv;
let siteId: string;
let page: PageResponse;

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api)).id;
});

afterAll(async () => {
  await env.close();
});

async function apply(
  mutations: Mutation[],
  target: PageResponse = page,
): Promise<{ status: number; body: MutationsResponse }> {
  const response = await applyMutationsRequest(env.api, target, mutations);
  return response as { status: number; body: MutationsResponse };
}

async function loadPage(id: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${id}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

// The draft travels as plain JSON; the helpers in mutations.test.ts cast the
// same way. Only the fields these tests assert on are named.
type RawNode = {
  type?: string;
  props?: Record<string, unknown>;
  slots?: Record<string, string[]>;
  children?: string[];
};

function rawNode(page: PageResponse, id: string): RawNode | undefined {
  return (page.draft.nodes as Record<string, RawNode>)[id];
}

describe("component nodes through the save path", () => {
  it("stores a definition, its slot and a filled instance", async () => {
    page = await createTestPage(env.api, siteId);
    const root = page.draft.rootNodeId;

    const definition = await apply([
      {
        op: "insertNode",
        parent: { nodeId: root },
        node: { id: "def-card-01", type: "__component", props: { name: "Karte" } },
      },
      {
        op: "insertNode",
        parent: { nodeId: "def-card-01" },
        node: { id: "def-root-01", type: "container", props: {} },
      },
      {
        op: "insertNode",
        parent: { nodeId: "def-root-01" },
        node: { id: "def-head-01", type: "block", props: { headline: "Titel" } },
      },
      {
        op: "insertNode",
        parent: { nodeId: "def-root-01" },
        node: { id: "def-slot-01", type: "__component_slot", props: { name: "inhalt" } },
      },
      {
        op: "insertNode",
        parent: { nodeId: root },
        node: {
          id: "inst-01",
          type: "__component_instance",
          props: { componentId: "def-card-01" },
        },
      },
      {
        op: "insertNode",
        parent: { nodeId: "inst-01", slot: "inhalt" },
        node: { id: "inst-body-01", type: "block", props: { headline: "Hallo" } },
      },
    ]);
    if (definition.status !== 200) console.log(JSON.stringify(definition.body));
    expect(definition.status).toBe(200);

    const fresh = await loadPage(page.id);
    expect(rawNode(fresh, "def-card-01")?.type).toBe("__component");
    expect(rawNode(fresh, "def-slot-01")?.type).toBe("__component_slot");
    expect(rawNode(fresh, "def-root-01")?.children).toEqual([
      "def-head-01",
      "def-slot-01",
    ]);
    expect(rawNode(fresh, "inst-01")?.props).toEqual({
      componentId: "def-card-01",
    });
    expect(rawNode(fresh, "inst-01")?.slots?.["inhalt"]).toEqual(["inst-body-01"]);
  });

  it("writes instance overrides as a plain prop bag", async () => {
    page = await loadPage(page.id);
    const result = await apply([
      {
        op: "updateNodeProps",
        id: "inst-01",
        patch: { overrides: { "def-head-01": { body: "Eigener Titel" } } },
      },
    ]);
    expect(result.status).toBe(200);
    const fresh = await loadPage(page.id);
    expect(rawNode(fresh, "inst-01")?.props?.["overrides"]).toEqual({
      "def-head-01": { body: "Eigener Titel" },
    });
  });

  it("enforces the slot rules the definition declares", async () => {
    page = await loadPage(page.id);
    // The first test filled the slot; empty it before the rules apply.
    const cleared = await apply([{ op: "deleteNode", id: "inst-body-01" }]);
    expect(cleared.status).toBe(200);

    page = await loadPage(page.id);
    // The slot accepts a block only, at most one node.
    const rules = await apply([
      {
        op: "updateNodeProps",
        id: "def-slot-01",
        patch: { allowedTypes: ["block"], max: 1 },
      },
    ]);
    expect(rules.status).toBe(200);

    page = await loadPage(page.id);
    const filled = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "inst-01", slot: "inhalt" },
        node: { id: "inst-fill-01", type: "block", props: { headline: "Hallo" } },
      },
    ]);
    expect(filled.status).toBe(200);

    // A second node is refused (max), a wrong type too (allowedTypes).
    page = await loadPage(page.id);
    const full = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "inst-01", slot: "inhalt" },
        node: { id: "inst-fill-02", type: "block", props: { headline: "Noch" } },
      },
    ]);
    expect(full.status).toBe(400);
    expect((full.body as unknown as ErrorResponse).error.message).toContain("full (max 1)");

    const wrong = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "inst-01", slot: "inhalt" },
        node: { id: "inst-fill-03", type: "divider", props: {} },
      },
    ]);
    expect(wrong.status).toBe(400);
    expect((wrong.body as unknown as ErrorResponse).error.message).toContain("does not allow");

    // An unknown slot name on the instance is refused (the definition names
    // its slots, not the structural type).
    const unknown = await apply([
      {
        op: "insertNode",
        parent: { nodeId: "inst-01", slot: "gibtsnicht" },
        node: { id: "inst-fill-04", type: "block", props: { headline: "X" } },
      },
    ]);
    expect(unknown.status).toBe(400);
    expect((unknown.body as unknown as ErrorResponse).error.message).toContain("no slot");
  });
});

// --------------------------------------------------------------- composition

function node(
  id: string,
  type: string,
  props: Record<string, Node["props"][string]> = {},
  extra: Partial<Node> = {},
): Node {
  return { id, type, props, ...extra };
}

function layoutTree(): NodeTree {
  return {
    rootNodeId: "layout-root",
    nodes: {
      "layout-root": node("layout-root", "page", {}, { children: ["layout-slot"] }),
      "layout-slot": node("layout-slot", "outlet"),
    },
  };
}

describe("component composition", () => {
  it("resolves a definition in the spliced page and expands every instance", () => {
    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, {
          children: ["def-card", "inst-a", "inst-b"],
        }),
        "def-card": node("def-card", "__component", { name: "Karte" }, {
          children: ["def-root"],
        }),
        "def-root": node("def-root", "container", {}, {
          children: ["def-head", "def-slot"],
        }),
        "def-head": node("def-head", "block", { headline: "Titel" }),
        "def-slot": node("def-slot", "__component_slot", { name: "inhalt" }),
        "inst-a": node("inst-a", "__component_instance", { componentId: "def-card" }, {
          slots: { inhalt: ["body-a"] },
        }),
        "inst-b": node("inst-b", "__component_instance", { componentId: "def-card" }, {
          slots: { inhalt: ["body-b"] },
        }),
        "body-a": node("body-a", "block", { headline: "A" }),
        "body-b": node("body-b", "block", { headline: "B" }),
      },
    };
    const composed = composePageTree({
      layout: layoutTree(),
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
    });
    const types = Object.values(composed.nodes).map((entry) => entry.type);
    // Two instances, two definition copies, two filled slots; the definition
    // itself is gone.
    expect(types.filter((type) => type === "__component_instance")).toHaveLength(0);
    expect(types.filter((type) => type === "__component")).toHaveLength(0);
    const texts = Object.values(composed.nodes)
      .filter((entry) => entry.type === "block" && entry.props["headline"] === "Titel")
      .map((entry) => entry.props["headline"]);
    expect(texts).toHaveLength(2);
    const filled = Object.values(composed.nodes)
      .filter((entry) => entry.type === "block" && entry.props["headline"] !== "Titel")
      .map((entry) => entry.props["headline"])
      .sort();
    expect(filled).toEqual(["A", "B"]);
  });

  it("applies instance overrides to the copy only", () => {
    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, {
          children: ["def-card", "inst-a", "inst-b"],
        }),
        "def-card": node("def-card", "__component", { name: "Karte" }, {
          children: ["def-root"],
        }),
        "def-root": node("def-root", "container", {}, { children: ["def-head"] }),
        "def-head": node("def-head", "block", { headline: "Titel" }),
        "inst-a": node("inst-a", "__component_instance", {
          componentId: "def-card",
          overrides: { "def-head": { headline: "A" } },
        }),
        "inst-b": node("inst-b", "__component_instance", { componentId: "def-card" }),
      },
    };
    const composed = composePageTree({
      layout: null,
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
    });
    const texts = Object.values(composed.nodes)
      .filter((entry) => entry.type === "block")
      .map((entry) => entry.props["headline"])
      .sort();
    expect(texts).toEqual(["A", "Titel"]);
    // The definition itself was not touched.
    expect(draft.nodes["def-head"]?.props["headline"]).toBe("Titel");
  });

  // Variants (ticket 04): the definition declares named props overlays, the
  // instance activates them; the composed copy carries the merged value while
  // the definition keeps its own.
  it("applies the active variant's overlay in the composition", () => {
    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, {
          children: ["def-card", "inst-a"],
        }),
        "def-card": node("def-card", "__component", {
          name: "Karte",
          variants: { groß: { "def-head": { headline: "Groß" } } },
        }, { children: ["def-root"] }),
        "def-root": node("def-root", "container", {}, { children: ["def-head"] }),
        "def-head": node("def-head", "block", { headline: "Titel" }),
        "inst-a": node("inst-a", "__component_instance", {
          componentId: "def-card",
          variants: ["groß"],
        }),
      },
    };
    const composed = composePageTree({
      layout: null,
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
    });
    const texts = Object.values(composed.nodes)
      .filter((entry) => entry.type === "block")
      .map((entry) => entry.props["headline"]);
    expect(texts).toEqual(["Groß"]);
    // The definition itself was not touched.
    expect(draft.nodes["def-head"]?.props["headline"]).toBe("Titel");
  });

  it("maps scoped rules of a definition part to every copy", () => {    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, {
          children: ["def-card", "inst-a", "inst-b"],
        }),
        "def-card": node("def-card", "__component", { name: "Karte" }, {
          children: ["def-root"],
        }),
        "def-root": node("def-root", "container", {}, { children: ["def-head"] }),
        "def-head": node("def-head", "block", { headline: "Titel" }),
        "inst-a": node("inst-a", "__component_instance", { componentId: "def-card" }),
        "inst-b": node("inst-b", "__component_instance", { componentId: "def-card" }),
      },
    };
    const idMap = new Map<string, string[]>();
    composePageTree({
      layout: null,
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
      idMap,
    });
    const targets = idMap.get("def-head") ?? [];
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(2);
  });

  // Styles per instance (ticket 04): a scoped rule can sit on the instance
  // itself. The instance is not rekeyed by a splice here, so the idMap entry
  // comes from the inliner — it must point at the instance's root copy, the
  // element that carries the rendered node.
  it("maps the instance id to its root copy", () => {
    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, {
          children: ["def-card", "inst-a"],
        }),
        "def-card": node("def-card", "__component", { name: "Karte" }, {
          children: ["def-root"],
        }),
        "def-root": node("def-root", "container", {}, { children: ["def-head"] }),
        "def-head": node("def-head", "block", { headline: "Titel" }),
        "inst-a": node("inst-a", "__component_instance", { componentId: "def-card" }),
      },
    };
    const idMap = new Map<string, string[]>();
    const composed = composePageTree({
      layout: null,
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
      idMap,
    });
    const targets = idMap.get("inst-a") ?? [];
    expect(targets).toHaveLength(1);
    // The target is the copy of the definition root, not a fresh node.
    expect(composed.nodes[targets[0]!]?.type).toBe("container");
  });

  // Motion an Komponenten (Ticket 19, M6): der Bake laeuft ueber dieselbe
  // Komposition — die Motion der Instanz muss auf der Wurzel-Kopie landen,
  // sonst animiert die veroeffentlichte Seite nichts.
  it("carries the instance's motion through the composition", () => {
    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, {
          children: ["def-card", "inst-a", "inst-b"],
        }),
        "def-card": node("def-card", "__component", { name: "Karte" }, {
          children: ["def-root"],
          motion: { preset: "stagger-cascade", intensity: 3 },
        }),
        "def-root": node("def-root", "container", {}, { children: ["def-head"] }),
        "def-head": node("def-head", "block", { headline: "Titel" }),
        "inst-a": node(
          "inst-a",
          "__component_instance",
          { componentId: "def-card" },
          { motion: { preset: "fade-up", intensity: 8 } },
        ),
        "inst-b": node("inst-b", "__component_instance", { componentId: "def-card" }),
      },
    };
    const idMap = new Map<string, string[]>();
    const composed = composePageTree({
      layout: null,
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
      idMap,
    });
    const motionOf = (instanceId: string) => {
      const target = idMap.get(instanceId)?.[0] ?? "";
      return composed.nodes[target]?.motion;
    };
    expect(motionOf("inst-a")).toEqual({ preset: "fade-up", intensity: 8 });
    expect(motionOf("inst-b")).toEqual({ preset: "stagger-cascade", intensity: 3 });
    // The definition keeps its own default.
    expect(draft.nodes["def-card"]?.motion).toEqual({
      preset: "stagger-cascade",
      intensity: 3,
    });
  });

  it("keeps a definition of the layout alive for instances of the page", () => {
    // The definition sits in the container (layout), the instance in the page:
    // no rekeying, but the resolution must span the spliced tree.
    const layout: NodeTree = {
      rootNodeId: "layout-root",
      nodes: {
        "layout-root": node("layout-root", "page", {}, {
          children: ["def-card", "layout-slot"],
        }),
        "def-card": node("def-card", "__component", { name: "Karte" }, {
          children: ["def-root"],
        }),
        "def-root": node("def-root", "container", {}, { children: ["def-head"] }),
        "def-head": node("def-head", "block", { headline: "Layout-Titel" }),
        "layout-slot": node("layout-slot", "outlet"),
      },
    };
    let counter = 0;
    const draft: NodeTree = {
      rootNodeId: "page-root",
      nodes: {
        "page-root": node("page-root", "page", {}, { children: ["inst-a"] }),
        "inst-a": node("inst-a", "__component_instance", { componentId: "def-card" }),
      },
    };
    const composed = composePageTree({
      layout,
      template: null,
      page: draft,
      article: null,
      createId: () => `n${counter++}`,
    });
    const headings = Object.values(composed.nodes).filter(
      (entry) => entry.type === "block",
    );
    expect(headings).toHaveLength(1);
    expect(headings[0]?.props["headline"]).toBe("Layout-Titel");
  });
});
