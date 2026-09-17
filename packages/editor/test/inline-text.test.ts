import { describe, expect, it } from "vitest";
import { HistoryStack, InlineEditing, sanitizeInlineText } from "@senify/editor";
import type { Mutation } from "@senify/engine";

const RECORD = {
  undoPatch: [{ patch: "setProps" as const, id: "hero000001", props: { headline: "Start" } }],
  batchId: "batch-1",
  versionBefore: 1,
  versionAfter: 2,
};

function mutationValue(mutation: Mutation): string {
  if (mutation.op !== "updateNodeProps") throw new Error("expected updateNodeProps");
  return String(mutation.patch.headline);
}

describe("inline text editing", () => {
  it("sanitizes to plaintext", () => {
    expect(sanitizeInlineText("<b>Hi</b> &amp; mehr")).toBe("Hi & mehr");
    expect(sanitizeInlineText('<a href="#" onclick="x()">Link</a>')).toBe("Link");
    expect(sanitizeInlineText("Zeile1\r\nZeile2")).toBe("Zeile1\nZeile2");
    expect(sanitizeInlineText("A&nbsp;B")).toBe("A B");
  });

  it("commits every keystroke as updateNodeProps on the base prop", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    inline.start({ nodeId: "hero000001", key: "headline", value: "Start" });
    const first = inline.type("Start <b>Neu</b>");
    expect(first.value).toBe("Start Neu");
    expect(first.mutation).toEqual({
      op: "updateNodeProps",
      id: "hero000001",
      patch: { headline: "Start Neu" },
    });
  });

  it("collapses a typing burst into exactly one history entry", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    inline.start({ nodeId: "hero000001", key: "headline", value: "" });
    for (const step of ["H", "He", "Her", "Hero", "Hero!"]) {
      inline.type(step);
      inline.record(RECORD);
    }
    expect(history.size).toBe(1);
    const entry = history.top();
    expect(entry?.op).toBe("inline-text");
    expect(entry?.mutations).toHaveLength(5);
    // The first undo patch wins: one Cmd+Z restores the state before the burst.
    expect(entry?.undoPatch).toEqual(RECORD.undoPatch);
  });

  it("reverts with Escape as one undo entry and restores the original text", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    history.record({
      label: "Sektion einfügen",
      op: "insertNode",
      mutations: [{ op: "deleteNode", id: "pricing00001" }],
      undoPatch: [],
      batchId: "batch-0",
      versionBefore: 0,
      versionAfter: 1,
    });
    inline.start({ nodeId: "hero000001", key: "headline", value: "Start" });
    inline.type("Start kaputt");
    inline.record(RECORD);
    inline.type("Start kaputt!!");
    inline.record({ ...RECORD, versionAfter: 3 });
    expect(history.size).toBe(2);

    const reverted = inline.revert();
    expect(reverted.removedEntryId).not.toBeNull();
    expect(reverted.session.value).toBe("Start");
    expect(reverted.mutation).not.toBeNull();
    expect(mutationValue(reverted.mutation as Mutation)).toBe("Start");
    // Escape consumed the entry: the next undo is the action before the edit.
    expect(history.size).toBe(1);
    expect(history.undo()?.label).toBe("Sektion einfügen");
    expect(history.canUndo).toBe(false);
  });

  it("emits no revert mutation when the text never changed", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    inline.start({ nodeId: "hero000001", key: "headline", value: "Start" });
    const reverted = inline.revert();
    expect(reverted.mutation).toBeNull();
    expect(reverted.removedEntryId).toBeNull();
    expect(history.size).toBe(0);
  });

  it("ends the session on commit and refuses to type without one", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    inline.start({ nodeId: "hero000001", key: "headline", value: "Start" });
    inline.type("Neu");
    inline.record(RECORD);
    const session = inline.commit();
    expect(session.active).toBe(false);
    expect(inline.session).toBeNull();
    expect(() => inline.type("weiter")).toThrow(/No inline edit/);
    // The committed burst stays on the stack as one entry.
    expect(history.size).toBe(1);
  });

  it("keeps completed editing sessions as separate undo entries", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    for (const original of ["Start", "Erste Änderung"]) {
      inline.start({ nodeId: "hero000001", key: "headline", value: original });
      inline.type(original === "Start" ? "Erste Änderung" : "Zweite Änderung");
      inline.record({ ...RECORD, undoPatch: [
        { patch: "setProps", id: "hero000001", props: { headline: original } },
      ] });
      inline.commit();
    }
    expect(history.size).toBe(2);
    expect(history.undo()?.undoPatch).toEqual([
      { patch: "setProps", id: "hero000001", props: { headline: "Erste Änderung" } },
    ]);
    expect(history.undo()?.undoPatch).toEqual(RECORD.undoPatch);
  });

  it("keeps rich text out of the inline path", () => {
    const history = new HistoryStack();
    const inline = new InlineEditing(history);
    inline.start({ nodeId: "hero000001", key: "headline", value: "" });
    const typed = inline.type("<strong><em>Fett</em></strong> text");
    expect(mutationValue(typed.mutation)).toBe("Fett text");
    expect(typed.value).not.toContain("<");
  });
});
