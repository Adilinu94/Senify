import { describe, expect, it } from "vitest";
import { getPrimitive, primitiveTypes } from "@senify/widget-engine";
import {
  buildElementGroups,
  createElementsPanel,
  ELEMENT_ICONS,
  ELEMENT_NOT_INSERTABLE,
} from "@senify/editor";
import type { DomDocument, DomElement } from "../src/dom.ts";
import { EDITOR_ICONS } from "../src/ui/icons.ts";

const insertable = primitiveTypes().filter((type) => !ELEMENT_NOT_INSERTABLE.has(type));
const flat = (query = "") => buildElementGroups(query).flatMap((group) => group.tiles);

describe("elements model (E4)", () => {
  it("lists every insertable primitive exactly once, without root and payload", () => {
    const types = flat().map((tile) => tile.type);
    expect(types.sort()).toEqual([...insertable].sort());
    expect(types).not.toContain("root");
    expect(types).not.toContain("payload");
    expect(types.length).toBe(22);
  });

  it("groups by catalog category in catalog order", () => {
    expect(buildElementGroups().map((group) => group.id)).toEqual([
      "layout",
      "basic",
      "media",
      "form",
      "advanced",
    ]);
  });

  it("gives every tile a vendored icon of its own, never the fallback", () => {
    for (const type of insertable) {
      const icon = ELEMENT_ICONS[type];
      expect(icon, `no icon for ${type}`).toBeDefined();
      expect(Object.keys(EDITOR_ICONS), `icon ${icon} is not vendored`).toContain(icon);
    }
    expect(flat().every((tile) => tile.icon !== "box")).toBe(true);
  });

  it("searches name and type, case-insensitively, and drops empty categories", () => {
    const name = getPrimitive("heading")?.name ?? "";
    expect(name).not.toBe("");
    expect(flat(name.toUpperCase()).map((tile) => tile.type)).toContain("heading");
    expect(flat("  HEADING ").map((tile) => tile.type)).toContain("heading");
    const onlyForm = buildElementGroups("checkbox");
    expect(onlyForm.every((group) => group.tiles.length > 0)).toBe(true);
    expect(buildElementGroups("zzz-gibt-es-nicht")).toEqual([]);
    expect(flat("root")).toEqual([]);
  });
});

// Minimaler DOM-Ersatz: genug fuer das Panel, ohne Browser.
type Listener = (event: { key?: string; preventDefault?: () => void }) => void;
class FakeElement {
  tagName: string;
  className = "";
  hidden = false;
  value = "";
  children: FakeElement[] = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, Listener[]> = {};
  private text: string | null = null;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  get textContent(): string | null {
    return this.text;
  }
  set textContent(value: string | null) {
    this.text = value;
    if (value === "") this.children = [];
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, handler: Listener): void {
    (this.listeners[type] ??= []).push(handler);
  }
  fire(type: string, event: Parameters<Listener>[0] = {}): void {
    for (const handler of this.listeners[type] ?? []) handler(event);
  }
}

function walk(root: FakeElement, test: (el: FakeElement) => boolean): FakeElement[] {
  const found: FakeElement[] = [];
  const visit = (el: FakeElement): void => {
    if (test(el)) found.push(el);
    for (const child of el.children) visit(child);
  };
  visit(root);
  return found;
}

function mount() {
  const doc = { createElement: (tag: string) => new FakeElement(tag) } as unknown as DomDocument;
  const inserted: string[] = [];
  const bound: string[] = [];
  const panel = createElementsPanel(doc, {
    insert: (primitive) => inserted.push(primitive),
    bindDragSource: (_element: DomElement, primitive) => bound.push(primitive),
  });
  const root = panel.element as unknown as FakeElement;
  const tiles = () => walk(root, (el) => el.className === "senify-elements__tile");
  const heads = () => walk(root, (el) => el.className === "senify-elements__head");
  const input = walk(root, (el) => el.className === "senify-elements__search")[0] as FakeElement;
  return { panel, root, tiles, heads, input, inserted, bound };
}

describe("elements panel (E4)", () => {
  it("renders one tile per insertable primitive, each bound as a drag source", () => {
    const { tiles, bound } = mount();
    expect(tiles().length).toBe(22);
    expect(bound.sort()).toEqual([...insertable].sort());
    expect(tiles().every((tile) => tile.attrs.draggable === "true")).toBe(true);
  });

  it("inserts the clicked primitive and nothing else", () => {
    const { tiles, inserted } = mount();
    const heading = tiles().find((tile) => tile.attrs["data-primitive"] === "heading") as FakeElement;
    heading.fire("click");
    expect(inserted).toEqual(["heading"]);
  });

  it("filters by the search text and clears it with Escape", () => {
    const { tiles, input, panel } = mount();
    input.value = "heading";
    input.fire("input");
    expect(tiles().map((tile) => tile.attrs["data-primitive"])).toEqual(["heading"]);
    let prevented = false;
    input.fire("keydown", { key: "Escape", preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    expect(input.value).toBe("");
    expect(tiles().length).toBe(22);
    // Escape ohne Suchtext tut nichts (und schluckt das Ereignis nicht).
    prevented = false;
    input.fire("keydown", { key: "Escape", preventDefault: () => (prevented = true) });
    expect(prevented).toBe(false);
    panel.search("zzz");
    expect(walk(panel.element as unknown as FakeElement, (el) => el.className === "senify-elements__empty").length).toBe(1);
  });

  it("collapses a category, keeps it collapsed across searches, and ignores collapsing during a search", () => {
    const { heads, root, panel } = mount();
    const gridOf = (id: string) =>
      walk(root, (el) => el.className === "senify-elements__group" && el.attrs["data-category"] === id)[0]
        ?.children[1] as FakeElement;
    heads()[0]?.fire("click");
    expect(gridOf("layout").hidden).toBe(true);
    expect(heads()[0]?.attrs["aria-expanded"]).toBe("false");
    panel.search("frame");
    expect(gridOf("layout").hidden).toBe(false);
    heads()[0]?.fire("click");
    expect(gridOf("layout").hidden).toBe(false);
    panel.search("");
    expect(gridOf("layout").hidden).toBe(true);
    heads()[0]?.fire("click");
    expect(gridOf("layout").hidden).toBe(false);
  });
});
