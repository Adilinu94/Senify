import { describe, expect, it } from "vitest";
import type { DomDocument, DomElement } from "../../src/dom.ts";
import { createDropController } from "../../src/canvas/dnd-dom.ts";
import { baseStore } from "../state/fixtures.ts";

// Wie in Elementor: Was gerade eingefuegt wurde, ist ausgewaehlt, damit links
// sofort die Einstellungen aufgehen. Der Test faehrt den Drop-Controller ohne
// Browser; ein Fake-DOM, das jeden Aufruf schluckt, reicht, weil nur der Store
// geprueft wird.

function fakeElement(): DomElement {
  const own: Record<string | symbol, unknown> = {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild: (child: unknown) => child,
    getAttribute: () => null,
  };
  return new Proxy(own, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as DomElement;
}

function mount() {
  const store = baseStore();
  const doc = { createElement: () => fakeElement() } as unknown as DomDocument;
  const controller = createDropController({
    doc,
    stage: fakeElement(),
    overlay: fakeElement(),
    store,
    frames: () => [],
    onPlus: () => undefined,
    onMessage: () => undefined,
  });
  return { store, controller };
}

const selectedIds = (store: ReturnType<typeof baseStore>): string[] => [
  ...store.selection.selected,
];

const childrenOf = (store: ReturnType<typeof baseStore>, id: string): string[] => [
  ...(store.document.nodes[id]?.children ?? []),
];

describe("insert selects the new element (E7)", () => {
  it("selects a building block that was inserted into a container", () => {
    const { store, controller } = mount();
    expect(selectedIds(store)).toEqual([]);

    expect(controller.insertAt("sec0000001", "divider", "into")).toBe(true);

    const children = childrenOf(store, "sec0000001");
    const inserted = children[children.length - 1];
    expect(inserted).toBeDefined();
    expect(store.document.nodes[inserted as string]?.primitive).toBe("divider");
    expect(selectedIds(store)).toEqual([inserted]);
  });

  it("selects a building block that was inserted before a sibling", () => {
    const { store, controller } = mount();

    expect(controller.insertAt("btn0000001", "divider", "before")).toBe(true);

    const siblings = childrenOf(store, store.document.rootNodeId);
    const inserted = siblings[siblings.indexOf("btn0000001") - 1];
    expect(store.document.nodes[inserted as string]?.primitive).toBe("divider");
    expect(selectedIds(store)).toEqual([inserted]);
  });

  it("selects a section that was inserted", () => {
    const { store, controller } = mount();

    expect(controller.insertSectionAt("btn0000001", "pricing", "comparison", "after")).toBe(true);

    const siblings = childrenOf(store, store.document.rootNodeId);
    const inserted = siblings[siblings.indexOf("btn0000001") + 1];
    expect(store.document.nodes[inserted as string]?.variant).toBe("comparison");
    expect(selectedIds(store)).toEqual([inserted]);
  });

  it("keeps the selection when the insert is refused", () => {
    const { store, controller } = mount();
    store.select("btn0000001");

    // A button is a leaf: nothing goes into it.
    expect(controller.insertAt("btn0000001", "divider", "into")).toBe(false);

    expect(selectedIds(store)).toEqual(["btn0000001"]);
  });
});
