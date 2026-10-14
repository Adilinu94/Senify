import { describe, expect, it } from "vitest";
import { bundledSections } from "@senify/registry";
import {
  SECTION_GROUP_NAMES,
  SECTION_INFO,
  SECTION_NOT_INSERTABLE,
  buildSectionGroups,
  listSectionVariants,
  sectionInsertSpec,
  sectionThumbnailFile,
} from "../src/explorer/sections-model.ts";
import { baseStore } from "./state/fixtures.ts";

const insertable = bundledSections.filter((section) => !SECTION_NOT_INSERTABLE.has(section.type));

describe("sections in the elements panel (model)", () => {
  it("names every insertable registry section in German, and only those", () => {
    expect(Object.keys(SECTION_INFO).sort()).toEqual(insertable.map((section) => section.type).sort());
    for (const [type, info] of Object.entries(SECTION_INFO)) {
      expect(info.name.trim(), type).not.toBe("");
      expect(info.description.trim(), type).not.toBe("");
    }
  });

  it("keeps the template and loop sections out of the page-level list", () => {
    const types = buildSectionGroups().flatMap((group) => group.sections.map((tile) => tile.type));
    for (const hidden of SECTION_NOT_INSERTABLE) expect(types).not.toContain(hidden);
    expect(types.sort()).toEqual(insertable.map((section) => section.type).sort());
  });

  it("groups by registry category in a fixed order, with German group names", () => {
    const groups = buildSectionGroups();
    expect(groups.map((group) => group.id)).toEqual(["structure", "content", "media", "commerce", "utility"]);
    expect(groups.map((group) => group.name)).toEqual(
      ["structure", "content", "media", "commerce", "utility"].map((id) => SECTION_GROUP_NAMES[id]),
    );
    expect(groups[0]?.sections.map((tile) => tile.type)).toEqual(["navbar", "footer", "hero"]);
  });

  it("lists every variant of a section with its German label and one thumbnail file each", () => {
    const hero = buildSectionGroups()
      .flatMap((group) => group.sections)
      .find((tile) => tile.type === "hero");
    expect(hero?.name).toBe("Hero");
    expect(hero?.defaultVariant).toBe("centered");
    expect(hero?.variants).toEqual([
      { key: "centered", label: "Zentriert", thumbnail: "hero-centered.png" },
      { key: "split", label: "Geteilt", thumbnail: "hero-split.png" },
      { key: "showcase-3d", label: "3D-Bühne", thumbnail: "hero-showcase-3d.png" },
    ]);
    expect(sectionThumbnailFile("pricing", "plans-3")).toBe("pricing-plans-3.png");
  });

  it("searches the German name, the type, the description and the variant labels", () => {
    const types = (query: string) =>
      buildSectionGroups(query).flatMap((group) => group.sections.map((tile) => tile.type));
    expect(types("preise")).toEqual(["pricing"]);
    expect(types("FAQ")).toEqual(["faq"]);
    // A variant label finds the whole section: "Banner" is a variant of the call to action.
    expect(types("banner")).toEqual(expect.arrayContaining(["cta", "banner"]));
    expect(types("3d-bühne")).toEqual(["hero"]);
    expect(types("gibt-es-nicht")).toEqual([]);
    expect(buildSectionGroups("gibt-es-nicht")).toEqual([]);
  });

  it("flattens every variant for the spotlight", () => {
    const all = listSectionVariants();
    const expected = insertable.reduce((sum, section) => sum + Object.keys(section.variants ?? {}).length, 0);
    expect(all).toHaveLength(expected);
    const split = all.find((entry) => entry.type === "hero" && entry.variant.key === "split");
    expect(split).toMatchObject({ name: "Hero", category: "structure" });
    expect(split?.variant.label).toBe("Geteilt");
  });

  it("builds the node to insert from the golden tree and the variant", () => {
    const spec = sectionInsertSpec("hero", "split");
    expect(spec?.primitive).toBe("hero");
    expect(spec?.variant).toBe("split");
    expect(spec?.props["headline"]).toBe("Websites, gebaut von Agenten");
    // Without a variant the golden tree's own variant is used.
    expect(sectionInsertSpec("hero")?.variant).toBe("centered");
    // Nothing shared with the registry's golden tree: editing the node must not edit the example.
    const first = sectionInsertSpec("hero");
    const second = sectionInsertSpec("hero");
    expect(first?.props).toEqual(second?.props);
    expect(first?.props).not.toBe(second?.props);
  });

  it("refuses an unknown section, an undeclared variant and the template sections", () => {
    expect(sectionInsertSpec("nope")).toBeUndefined();
    expect(sectionInsertSpec("hero", "nope")).toBeUndefined();
    expect(sectionInsertSpec("outlet")).toBeUndefined();
    expect(sectionInsertSpec("card", "text")).toBeUndefined();
  });

  it("inserts every variant of every section as a valid node, and undo takes it away", () => {
    for (const section of insertable) {
      for (const variant of Object.keys(section.variants ?? {})) {
        const spec = sectionInsertSpec(section.type, variant);
        expect(spec, `${section.type}/${variant}`).toBeDefined();
        if (spec === undefined) continue;
        const store = baseStore();
        const before = store.document.nodes[store.document.rootNodeId]?.children?.length ?? 0;
        store.apply({
          op: "insertNode",
          parent: { nodeId: store.document.rootNodeId },
          node: { primitive: spec.primitive, props: spec.props, variant: spec.variant },
        });
        const children = store.document.nodes[store.document.rootNodeId]?.children ?? [];
        expect(children, `${section.type}/${variant}`).toHaveLength(before + 1);
        const inserted = store.document.nodes[children[children.length - 1] ?? ""];
        expect(inserted?.primitive).toBe(section.type);
        expect(inserted?.variant).toBe(variant);
        store.undo();
        expect(store.document.nodes[store.document.rootNodeId]?.children ?? []).toHaveLength(before);
      }
    }
  });
});
