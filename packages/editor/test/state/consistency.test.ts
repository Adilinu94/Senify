import { describe, expect, it } from "vitest";
import { validateDocument, type EditorDocument } from "@senify/editor/state";

function doc(
  nodes: EditorDocument["nodes"],
  classes: EditorDocument["classes"] = {},
): EditorDocument {
  return { version: 2, rootNodeId: "root", nodes, classes };
}

const valid = doc({
  root: { id: "root", primitive: "root", props: {}, children: ["frame"] },
  frame: { id: "frame", primitive: "frame", props: {} },
});

function kinds(document: EditorDocument): string[] {
  return validateDocument(document).map((issue) => issue.kind);
}

describe("consistency check", () => {
  it("accepts a valid document", () => {
    expect(validateDocument(valid)).toEqual([]);
  });

  it("flags a wrong version", () => {
    expect(kinds({ ...valid, version: 1 as unknown as 2 })).toContain("wrong-version");
  });

  it("flags a missing root", () => {
    const broken = doc({ other: { id: "other", primitive: "frame", props: {} } });
    expect(kinds(broken)).toContain("missing-root");
  });

  it("flags a root that is not a root primitive", () => {
    const broken = doc({ root: { id: "root", primitive: "frame", props: {} } });
    expect(kinds(broken)).toContain("root-primitive");
  });

  it("flags an unknown primitive", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["x"] },
      x: { id: "x", primitive: "nope", props: {} },
    });
    expect(kinds(broken)).toContain("unknown-primitive");
  });

  it("flags a dangling child reference", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["gone"] },
    });
    expect(kinds(broken)).toContain("dangling-child");
  });

  it("flags a node claimed by two parents", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["frame", "frame"] },
      frame: { id: "frame", primitive: "frame", props: {} },
    });
    expect(kinds(broken)).toContain("duplicate-parent");
  });

  it("flags an orphan node", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["frame"] },
      frame: { id: "frame", primitive: "frame", props: {} },
      orphan: { id: "orphan", primitive: "text", props: {} },
    });
    expect(kinds(broken)).toContain("orphan-node");
  });

  it("flags a child the catalog does not allow", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["list"] },
      list: { id: "list", primitive: "list", props: {}, children: ["btn"] },
      btn: { id: "btn", primitive: "button", props: {} },
    });
    expect(kinds(broken)).toContain("child-not-allowed");
  });

  it("flags an undefined style class", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["frame"] },
      frame: { id: "frame", primitive: "frame", props: {}, classes: ["ghost"] },
    });
    expect(kinds(broken)).toContain("undefined-class");
  });

  it("flags an unknown slot and an overfull slot", () => {
    const unknownSlot = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["frame"] },
      frame: { id: "frame", primitive: "frame", props: {}, slots: { nope: [] } },
    });
    expect(kinds(unknownSlot)).toContain("slot-unknown");
    const full = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["frame"] },
      frame: { id: "frame", primitive: "frame", props: {}, children: ["col"] },
      col: { id: "col", primitive: "collection", props: {}, slots: { item: ["a", "b"] } },
      a: { id: "a", primitive: "text", props: {} },
      b: { id: "b", primitive: "text", props: {} },
    });
    expect(kinds(full)).toContain("slot-full");
  });

  // A v1 page names its nodes by section type; those become legacy stand-ins
  // (widget-engine `legacy.ts`) whose slot rules live in the section registry.
  // The check must tolerate their slots (rebuild Phase 0, fifth slice).
  it("tolerates a slot on a legacy section stand-in", () => {
    const legacy = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["hero"] },
      hero: { id: "hero", primitive: "hero", props: {}, slots: { visual: ["pic"] } },
      pic: { id: "pic", primitive: "media", props: {} },
    });
    expect(kinds(legacy)).toEqual([]);
  });

  it("flags a reference cycle", () => {
    const broken = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["a"] },
      a: { id: "a", primitive: "frame", props: {}, children: ["b"] },
      b: { id: "b", primitive: "frame", props: {}, children: ["a"] },
    });
    expect(kinds(broken)).toContain("cycle");
  });
});
