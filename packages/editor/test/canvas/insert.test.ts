import { describe, expect, it } from "vitest";
import { EditorStore } from "@senify/editor/state";
import { insertMutation, insertPlan } from "@senify/editor/canvas";
import { counterIds } from "../state/fixtures.ts";

// Point 5: insert behind or into the selected node, planned from the catalog's
// child rules. A disallowed insertion is refused with a clear message; a legal
// one lands where it should and is undoable.

const SECTION = "sec001";
const HEADING = "head01";
const LIST = "list01";
const COLLECTION = "coll01";

function base(): EditorStore {
  const editor = new EditorStore({ idFactory: counterIds("n") });
  const root = editor.document.rootNodeId;
  editor.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "section", id: SECTION },
  });
  editor.apply({
    op: "insertNode",
    parent: { nodeId: SECTION },
    node: { primitive: "heading", id: HEADING, props: { text: "Hi" } },
  });
  editor.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "list", id: LIST },
  });
  editor.apply({
    op: "insertNode",
    parent: { nodeId: root },
    node: { primitive: "collection", id: COLLECTION },
  });
  return editor;
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "no error";
}

describe("insert plan", () => {
  it("places a node behind the selected node", () => {
    const editor = base();
    const plan = insertPlan(editor.document, HEADING, "text", "after");
    expect(plan.parent).toEqual({ nodeId: SECTION });
    expect(plan.index).toBe(1);
    editor.apply(insertMutation(plan, "text", { text: "dazu" }));
    expect(editor.document.nodes[SECTION]?.children).toEqual([
      HEADING,
      expect.stringMatching(/^n/),
    ]);
  });

  it("places a node into the selected container", () => {
    const editor = base();
    const plan = insertPlan(editor.document, SECTION, "button", "into");
    expect(plan.parent).toEqual({ nodeId: SECTION });
    expect(plan.index).toBe(1);
    editor.apply(insertMutation(plan, "button", { label: "Los" }));
    expect(editor.document.nodes[SECTION]?.children).toHaveLength(2);
  });

  it("refuses the root as a sibling with a clear message", () => {
    const editor = base();
    const message = messageOf(() =>
      insertPlan(editor.document, editor.document.rootNodeId, "frame", "after"),
    );
    expect(message).toMatch(/Wurzel hat kein Geschwister/);
  });

  it("refuses a leaf as a target with a clear message", () => {
    const editor = base();
    const message = messageOf(() => insertPlan(editor.document, HEADING, "text", "into"));
    expect(message).toMatch(/heading.*nimmt keine Kinder auf/);
  });

  it("refuses a child the catalog of the target does not allow", () => {
    const editor = base();
    const message = messageOf(() => insertPlan(editor.document, LIST, "button", "into"));
    expect(message).toMatch(/Einfügen nicht erlaubt/);
    expect(message).toMatch(/text, link, icon, heading, image/);
  });

  it("uses the item slot of a collection and respects its limit", () => {
    const editor = base();
    const plan = insertPlan(editor.document, COLLECTION, "frame", "into");
    expect(plan.parent).toEqual({ nodeId: COLLECTION, slot: "item" });
    editor.apply(insertMutation(plan, "frame"));
    expect(editor.document.nodes[COLLECTION]?.slots?.["item"]).toHaveLength(1);
    // The slot holds at most one node.
    const message = messageOf(() =>
      insertPlan(editor.document, COLLECTION, "frame", "into"),
    );
    expect(message).toMatch(/Slot "item" ist voll/);
  });

  it("never inserts the root primitive", () => {
    const editor = base();
    expect(messageOf(() => insertPlan(editor.document, SECTION, "root", "into"))).toMatch(
      /Wurzel lässt sich nicht einfügen/,
    );
  });

  it("refuses an unknown primitive", () => {
    const editor = base();
    expect(messageOf(() => insertPlan(editor.document, SECTION, "nope", "into"))).toMatch(
      /Unbekanntes Primitiv/,
    );
  });

  it("is undoable through the store", () => {
    const editor = base();
    const before = editor.document.nodes[SECTION]?.children?.length ?? 0;
    const plan = insertPlan(editor.document, SECTION, "button", "into");
    const outcome = editor.apply(insertMutation(plan, "button"));
    expect(outcome.changed).toBe(true);
    expect(editor.document.nodes[SECTION]?.children?.length).toBe(before + 1);
    expect(editor.undo()).toBe(true);
    expect(editor.document.nodes[SECTION]?.children?.length).toBe(before);
  });
});
