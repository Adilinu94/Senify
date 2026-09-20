import { describe, expect, it } from "vitest";
import {
  buildEditorLayerList,
  buildEditorSpotlightIndex,
  buildLayerList,
  buildMediaTab,
  buildPageList,
  buildTemplatesSection,
  editorNodeLabel,
  editorNodeSnippet,
  EXPLORER_TABS,
  filterMedia,
  layerLabel,
  type MediaItem,
} from "@senify/editor";
import { draftTree, registry } from "./fixtures.ts";
import { baseStore, emptyV2Document } from "./state/fixtures.ts";

const media: MediaItem[] = [
  {
    id: "a1",
    name: "Hero Berlin.jpg",
    kind: "image",
    folders: ["Referenzen", "2026"],
    tags: ["hero", "foto"],
    createdAt: 10,
  },
  {
    id: "a2",
    name: "logo-sora.svg",
    kind: "file",
    folders: ["Marke"],
    tags: ["logo"],
    createdAt: 30,
  },
  {
    id: "a3",
    name: "team-foto.webp",
    kind: "image",
    folders: ["Referenzen"],
    tags: ["team", "foto"],
    createdAt: 20,
  },
];

describe("explorer tabs", () => {
  it("declares Ebenen · Seiten · Vorlagen · Medien", () => {
    expect(EXPLORER_TABS.map((tab) => tab.label)).toEqual([
      "Ebenen",
      "Seiten",
      "Vorlagen",
      "Medien",
    ]);
  });

  it("builds the layer tree in render order with slots and depths", () => {
    const layers = buildLayerList(draftTree(), { registry });
    expect(layers.map((layer) => [layer.id, layer.depth, layer.slot])).toEqual([
      ["page000001", 0, null],
      ["hero000001", 1, null],
      ["media00001", 2, "visual"],
      ["pricing00001", 1, null],
      ["widget00001", 1, null],
    ]);
    expect(layers.map((layer) => layer.label)).toEqual([
      "page",
      "Hero",
      "Media",
      "Pricing",
      "custom-widget",
    ]);
    expect(layers.find((layer) => layer.id === "hero000001")?.childCount).toBe(1);
    expect(layers.find((layer) => layer.id === "media00001")?.locked).toBe(true);
  });

  it("uses the registry title when it knows the type", () => {
    expect(layerLabel("hero", registry)).toBe("Hero");
    expect(layerLabel("custom-widget", registry)).toBe("custom-widget");
  });

  it("marks the active page and renders templates as a section of the tab", () => {
    const pages = buildPageList(
      [
        { id: "p1", title: "Start", path: "/" },
        { id: "p2", title: "Kontakt", path: "/kontakt" },
      ],
      "p2",
    );
    expect(pages.map((page) => page.active)).toEqual([false, true]);
    const templates = buildTemplatesSection(
      [
        { id: "l1", kind: "layout", label: "Onepager" },
        { id: "t1", kind: "entry", label: "Blogpost" },
      ],
      "t1",
    );
    expect(templates.map((template) => template.badge)).toEqual(["Layout", "Entry"]);
    expect(templates.map((template) => template.active)).toEqual([false, true]);
  });

  it("searches, filters and sorts the media library", () => {
    expect(filterMedia(media, { query: "team" }).map((item) => item.id)).toEqual(["a3"]);
    expect(filterMedia(media, { query: "foto" }).map((item) => item.id)).toEqual(["a1", "a3"]);
    expect(
      filterMedia(media, { folders: ["referenzen"], tags: ["foto"] }).map((item) => item.id),
    ).toEqual(["a1", "a3"]);
    expect(filterMedia(media, { sort: "newest" }).map((item) => item.id)).toEqual([
      "a2",
      "a3",
      "a1",
    ]);
    const tab = buildMediaTab(media, { query: "logo" });
    expect(tab.items.map((item) => item.id)).toEqual(["a2"]);
    expect(tab.total).toBe(3);
    expect(tab.folders).toEqual(["2026", "Marke", "Referenzen"]);
    expect(tab.tags).toEqual(["foto", "hero", "logo", "team"]);
  });
});

// Ticket 03, slice 1: the rebuild explorer reads the v2 editor document.
describe("editor layer tree (v2)", () => {
  it("lists the document depth-first with catalog names and content snippets", () => {
    const store = baseStore();
    const layers = buildEditorLayerList(store.document, { rootLabel: "Seite" });
    expect(layers.map((layer) => [layer.id, layer.depth, layer.parentId])).toEqual([
      [store.document.rootNodeId, 0, null],
      ["sec0000001", 1, store.document.rootNodeId],
      ["head000001", 2, "sec0000001"],
      ["btn0000001", 1, store.document.rootNodeId],
    ]);
    expect(layers[0]?.label).toBe("Seite");
    // The heading carries its text, the button its label.
    expect(layers[2]?.label).toContain("Hallo");
    expect(layers[3]?.label).toContain("Los");
    expect(layers[1]?.hasChildren).toBe(true);
    expect(layers[2]?.hasChildren).toBe(false);
  });

  it("flags hidden, locked, motion and per-device hidden nodes", () => {
    const store = baseStore();
    store.apply({
      op: "setNodeMeta",
      id: "head000001",
      meta: { hidden: true, locked: true },
    });
    store.apply({
      op: "setNodeHiddenDevices",
      id: "head000001",
      devices: ["mobile"],
    });
    store.apply({
      op: "setMotion",
      id: "head000001",
      spec: { preset: "fade-up", intensity: 5 },
    });
    const layers = buildEditorLayerList(store.document);
    const heading = layers.find((layer) => layer.id === "head000001");
    expect(heading?.hidden).toBe(true);
    expect(heading?.hiddenDevices).toEqual(["mobile"]);
    expect(heading?.locked).toBe(true);
    expect(heading?.motion).toBe(true);
  });

  it("renders the snippet without markup and truncates long text", () => {
    expect(editorNodeSnippet({ id: "n", primitive: "heading", props: { text: "<b>Hallo</b>  Welt" } })).toBe(
      "Hallo Welt",
    );
    const long = editorNodeSnippet({
      id: "n",
      primitive: "heading",
      props: { text: "x".repeat(100) },
    });
    expect(long?.length).toBe(32);
    expect(long?.endsWith("…")).toBe(true);
    expect(editorNodeLabel({ id: "n", primitive: "heading", props: {} })).toBe("Überschrift");
  });

  it("handles an empty document", () => {
    const layers = buildEditorLayerList(emptyV2Document());
    expect(layers).toHaveLength(1);
    expect(layers[0]?.primitive).toBe("root");
  });
});

describe("editor spotlight index (v2)", () => {
  it("indexes pages, primitives and actions with insert commands", () => {
    const index = buildEditorSpotlightIndex({
      pages: [{ id: "p1", title: "Start", path: "/" }],
      primitives: [
        { type: "root", name: "Wurzel", description: "", category: "layout" },
        { type: "heading", name: "Überschrift", description: "Titel", category: "basic" },
      ],
      currentPageId: "p1",
    });
    expect(index.some((item) => item.command.type === "open-page")).toBe(true);
    expect(index.some((item) => item.command.type === "insert-primitive")).toBe(true);
    expect(index.some((item) => item.command.type === "publish")).toBe(true);
    // The root is not insertable and stays out of the index.
    expect(index.some((item) => item.id === "primitive:root")).toBe(false);
    const heading = index.find((item) => item.id === "primitive:heading");
    expect(heading?.command).toEqual({ type: "insert-primitive", primitive: "heading" });
    expect(heading?.group).toBe("Bausteine");
  });
});
