import { describe, expect, it } from "vitest";
import {
  buildLayerList,
  buildMediaTab,
  buildPageList,
  buildTemplatesSection,
  EXPLORER_TABS,
  filterMedia,
  layerLabel,
  type MediaItem,
} from "@senify/editor";
import { draftTree, registry } from "./fixtures.ts";

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
