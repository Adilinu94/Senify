import { describe, expect, it } from "vitest";
import { emitBatch, emitMutations, type EditorAction } from "@senify/editor";
import { parseApplyMutationsBody, type AuthorInput, type Mutation } from "@senify/engine";
import { draftTree, nodeOf } from "./fixtures.ts";

const author: AuthorInput = { kind: "human", id: "editor", label: "Editor" };

// The engine owns the mutation contract; validating the emitted batch against
// it is the strongest possible statement that the editor speaks it correctly.
// An empty batch is never sent (the engine rejects it), so it is not validated.
function expectContract(given: Mutation[]): void {
  if (given.length === 0) return;
  expect(() =>
    parseApplyMutationsBody({
      baseDraftVersion: 1,
      author,
      mutations: given,
    }),
  ).not.toThrow();
}

function emit(action: EditorAction): Mutation[] {
  const tree = draftTree();
  const mutations = emitMutations(action, { tree });
  expectContract(mutations);
  return mutations;
}

describe("every editor action emits a canonical mutation", () => {
  it("drag & drop → moveNode", () => {
    expect(
      emit({
        kind: "move",
        nodeId: "pricing00001",
        target: { nodeId: "page000001" },
        index: 0,
      }),
    ).toEqual([
      {
        op: "moveNode",
        id: "pricing00001",
        target: { nodeId: "page000001" },
        index: 0,
      },
    ]);
  });

  it("drag & drop into a slot → moveNode with slot", () => {
    const mutations = emit({
      kind: "move",
      nodeId: "media00001",
      target: { nodeId: "hero000001", slot: "visual" },
    });
    expect(mutations[0]).toEqual({
      op: "moveNode",
      id: "media00001",
      target: { nodeId: "hero000001", slot: "visual" },
    });
  });

  it("section drop → insertNode with the section spec", () => {
    expect(
      emit({
        kind: "insert",
        parent: { nodeId: "page000001" },
        index: 1,
        node: { type: "cta", variant: "boxed", props: { title: "Neu" } },
      }),
    ).toEqual([
      {
        op: "insertNode",
        parent: { nodeId: "page000001" },
        index: 1,
        node: { type: "cta", variant: "boxed", props: { title: "Neu" } },
      },
    ]);
  });

  it("mini toolbar → delete / duplicate / wrap", () => {
    expect(emit({ kind: "delete", nodeId: "pricing00001" })).toEqual([
      { op: "deleteNode", id: "pricing00001" },
    ]);
    expect(emit({ kind: "duplicate", nodeId: "hero000001" })).toEqual([
      { op: "duplicateNode", id: "hero000001" },
    ]);
    expect(
      emit({
        kind: "wrap",
        nodeId: "hero000001",
        wrapper: { type: "content", props: {} },
      }),
    ).toEqual([
      { op: "wrapNode", id: "hero000001", wrapper: { type: "content", props: {} } },
    ]);
  });

  it("property change in the desktop frame → updateNodeProps (base, all breakpoints)", () => {
    expect(
      emit({
        kind: "prop",
        nodeId: "hero000001",
        key: "headline",
        value: "Neu",
        breakpoint: "desktop",
      }),
    ).toEqual([
      { op: "updateNodeProps", id: "hero000001", patch: { headline: "Neu" } },
    ]);
  });

  it("property change in the tablet frame → setBreakpointOverride", () => {
    expect(
      emit({
        kind: "prop",
        nodeId: "hero000001",
        key: "headline",
        value: "Kurz",
        breakpoint: "tablet",
      }),
    ).toEqual([
      {
        op: "setBreakpointOverride",
        id: "hero000001",
        breakpoint: "tablet",
        override: { props: { headline: "Kurz" } },
      },
    ]);
  });

  it("hidden in a breakpoint → setBreakpointOverride with hidden", () => {
    expect(
      emit({ kind: "hide", nodeId: "pricing00001", hidden: true, breakpoint: "mobile" }),
    ).toEqual([
      {
        op: "setBreakpointOverride",
        id: "pricing00001",
        breakpoint: "mobile",
        override: { hidden: true },
      },
    ]);
  });

  it("override badge reset removes exactly one property", () => {
    const mutations = emit({
      kind: "override-reset",
      nodeId: "hero000001",
      key: "headline",
      breakpoint: "mobile",
    });
    expect(mutations).toEqual([
      { op: "clearBreakpointOverride", id: "hero000001", breakpoint: "mobile" },
      {
        op: "setBreakpointOverride",
        id: "hero000001",
        breakpoint: "mobile",
        override: { props: { paddingY: { $token: "space.4" } } },
      },
    ]);
  });

  it("override badge reset clears the breakpoint when it was the last property", () => {
    const tree = draftTree();
    const node = nodeOf(tree, "widget00001");
    node.overrides = { tablet: { props: { spacing: "2rem" } } };
    expect(
      emitMutations(
        { kind: "override-reset", nodeId: "widget00001", key: "spacing", breakpoint: "tablet" },
        { tree },
      ),
    ).toEqual([
      { op: "clearBreakpointOverride", id: "widget00001", breakpoint: "tablet" },
    ]);
  });

  it("motion panel → setMotion / clearMotion", () => {
    expect(
      emit({
        kind: "motion",
        nodeId: "hero000001",
        spec: { preset: "fade-up", intensity: 4 },
      }),
    ).toEqual([
      { op: "setMotion", id: "hero000001", spec: { preset: "fade-up", intensity: 4 } },
    ]);
    expect(emit({ kind: "motion", nodeId: "hero000001", spec: null })).toEqual([
      { op: "clearMotion", id: "hero000001" },
    ]);
  });

  it("variant / lock / page meta → updateNodeMeta and updatePageMeta", () => {
    expect(emit({ kind: "variant", nodeId: "hero000001", variant: "split" })).toEqual([
      { op: "updateNodeMeta", id: "hero000001", meta: { variant: "split" } },
    ]);
    expect(emit({ kind: "lock", nodeId: "hero000001", locked: true })).toEqual([
      { op: "updateNodeMeta", id: "hero000001", meta: { locked: true } },
    ]);
    expect(emit({ kind: "page-meta", title: "Start", path: "/start" })).toEqual([
      { op: "updatePageMeta", title: "Start", path: "/start" },
    ]);
  });

  it("inline text → updateNodeProps on the base prop (visible in all breakpoints)", () => {
    expect(
      emit({ kind: "inline-text", nodeId: "hero000001", key: "headline", value: "Tipp" }),
    ).toEqual([
      { op: "updateNodeProps", id: "hero000001", patch: { headline: "Tipp" } },
    ]);
  });

  it("prop patches skip nulls in a breakpoint override", () => {
    expect(
      emit({
        kind: "prop-patch",
        nodeId: "hero000001",
        patch: { headline: "A", sub: null },
        breakpoint: "tablet",
      }),
    ).toEqual([
      {
        op: "setBreakpointOverride",
        id: "hero000001",
        breakpoint: "tablet",
        override: { props: { headline: "A" } },
      },
    ]);
  });

  it("emits an empty batch for a no-op override reset", () => {
    expect(
      emit({ kind: "override-reset", nodeId: "media00001", key: "src", breakpoint: "mobile" }),
    ).toEqual([]);
  });

  it("batches several actions into one canonical list", () => {
    const mutations = emitBatch(
      [
        { kind: "delete", nodeId: "pricing00001" },
        { kind: "prop", nodeId: "hero000001", key: "headline", value: "X", breakpoint: "desktop" },
      ],
      { tree: draftTree() },
    );
    expect(mutations.map((mutation) => mutation.op)).toEqual([
      "deleteNode",
      "updateNodeProps",
    ]);
    expectContract(mutations);
  });
});
