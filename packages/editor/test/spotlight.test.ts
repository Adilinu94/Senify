import { describe, expect, it } from "vitest";
import {
  buildSpotlightIndex,
  matchesSpotlight,
  scoreSpotlight,
  searchSpotlight,
  SPOTLIGHT_ACTIONS,
  type SpotlightItem,
} from "@senify/editor";
import { registry } from "./fixtures.ts";

const pages = [
  { id: "p1", title: "Start", path: "/" },
  { id: "p2", title: "Kontakt", path: "/kontakt" },
];

const index = buildSpotlightIndex({ pages, registry, currentPageId: "p2" });

function ids(items: SpotlightItem[]): string[] {
  return items.map((item) => item.id);
}

describe("Cmd+K spotlight", () => {
  it("indexes pages, sections (with thumbnails) and actions", () => {
    expect(ids(index).slice(0, 2)).toEqual(["page:p2", "page:p1"]);
    const hero = index.find((item) => item.id === "section:hero");
    expect(hero?.label).toBe("Hero");
    expect(hero?.thumbnail).toBe("thumbnails/hero-centered-1440.png");
    expect(hero?.command).toEqual({ type: "insert-section", sectionType: "hero" });
    expect(index.length).toBe(pages.length + registry.list().length + SPOTLIGHT_ACTIONS.length);
    expect(SPOTLIGHT_ACTIONS.map((action) => action.command.type)).toEqual([
      "open-media",
      "publish",
    ]);
  });

  it("finds a section by name", () => {
    const found = searchSpotlight(index, "hero");
    expect(found[0]?.id).toBe("section:hero");
  });

  it("finds an action by a partial word", () => {
    expect(searchSpotlight(index, "publiz")[0]?.id).toBe("action:publish");
    const mediaHits = searchSpotlight(index, "medien");
    expect(mediaHits.map((item) => item.id)).toContain("action:media");
    expect(mediaHits[0]?.kind).toBe("action");
  });

  it("matches subsequences and scores labels above keywords", () => {
    const hero = index.find((item) => item.id === "section:hero");
    const pricing = index.find((item) => item.id === "section:pricing");
    if (!hero || !pricing) throw new Error("index incomplete");
    expect(matchesSpotlight(hero, "qqq")).toBe(false);
    expect(matchesSpotlight(pricing, "prcng")).toBe(true);
    expect(scoreSpotlight(hero, "")).toBe(1);
    expect(scoreSpotlight(hero, "hero")).toBeGreaterThan(scoreSpotlight(hero, "e"));
    expect(scoreSpotlight(hero, "zzz")).toBe(0);
  });

  it("filters unknown queries and honours the limit", () => {
    expect(searchSpotlight(index, "zzzzz")).toEqual([]);
    expect(searchSpotlight(index, "", 3)).toHaveLength(3);
    expect(searchSpotlight(index, "e", 2)).toHaveLength(2);
  });

  it("prefers pages over actions over sections for the same score", () => {
    const found = searchSpotlight(index, "start");
    expect(found.map((item) => item.kind)).toContain("page");
  });
});
