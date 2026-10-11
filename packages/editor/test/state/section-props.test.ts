import { describe, expect, it } from "vitest";
import { baseStore } from "./fixtures.ts";

// A legacy section node ("features", "cta", …) carries the section's own props.
// Their shape is the registry's, not the CSS value grammar's: a headline may
// hold a colon, a list is a list. Before this the store refused both with
// "Unsafe CSS value" / "Unsupported style value".

function withSection(props: Record<string, unknown>, primitive = "features") {
  const store = baseStore();
  store.apply({
    op: "insertNode",
    parent: { nodeId: store.document.rootNodeId },
    node: { primitive, id: "sect000001", props: props as never },
  });
  return store;
}

describe("section content props in the editor store", () => {
  it("takes a list prop and a headline with a colon on insert", () => {
    const store = withSection({
      title: "Warum wir: drei Gründe; ehrlich",
      items: [{ title: "Schnell", text: "In zwei Wochen online." }],
    });
    const node = store.document.nodes["sect000001"];
    expect(node?.props["title"]).toBe("Warum wir: drei Gründe; ehrlich");
    expect(node?.props["items"]).toEqual([{ title: "Schnell", text: "In zwei Wochen online." }]);
  });

  it("takes later writes and undoes them", () => {
    const store = withSection({ title: "Alt" });
    store.apply({
      op: "setNodeProp",
      id: "sect000001",
      key: "items",
      value: [{ title: "A", text: "B" }],
      device: "desktop",
    });
    expect(store.document.nodes["sect000001"]?.props["items"]).toEqual([{ title: "A", text: "B" }]);
    store.undo();
    expect(store.document.nodes["sect000001"]?.props["items"]).toBeUndefined();
  });

  it("refuses a list item that breaks the section's schema, in plain words", () => {
    const store = withSection({ title: "Alt" });
    expect(() =>
      store.apply({
        op: "setNodeProp",
        id: "sect000001",
        key: "items",
        value: [{ title: "ohne Text" }],
        device: "desktop",
      }),
    ).toThrow(/items/);
    expect(store.document.nodes["sect000001"]?.props["items"]).toBeUndefined();
  });

  it("names the field when a required text is emptied", () => {
    const store = withSection({ title: "Alt" }, "cta");
    expect(() =>
      store.apply({
        op: "setNodeProp",
        id: "sect000001",
        key: "headline",
        value: "",
        device: "desktop",
      }),
    ).toThrow("Das Feld „Headline“ darf nicht leer sein.");
  });

  it("keeps the style grammar for everything that is not a content prop", () => {
    const store = withSection({ title: "Alt" });
    expect(() =>
      store.apply({
        op: "setNodeProp",
        id: "sect000001",
        key: "background",
        value: "red; color: blue",
        device: "desktop",
      }),
    ).toThrow(/Unsafe CSS value/);
  });
});
