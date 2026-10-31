import { describe, expect, it } from "vitest";
import {
  REFS_DEFAULT_FILTER,
  refsFooterText,
  refsHeaderText,
  refsSearchParams,
  refsStyleMatches,
} from "../public/app-refs-filter.js";

// Der Filter- und Kopfblock der Referenzen-Seite, R12-Schnitt aus
// `app-references.js` (Rang 1 der Roadmap). Die Regel, die vorher nur im
// Browser galt und deshalb hier festgehalten wird: die Adresse der Liste
// traegt NUR, was vom Standard abweicht.

const BASIS = { query: "", collection: "", sort: "newest", view: "" };

describe("Referenzen: Filter und Kopf", () => {
  it("schickt nur, was vom Standard abweicht", () => {
    expect(refsSearchParams(BASIS).toString()).toBe("");
    expect(refsSearchParams({ ...BASIS, query: "bauhaus" }).toString()).toBe("q=bauhaus");
    expect(refsSearchParams({ ...BASIS, collection: "abc" }).toString()).toBe("collection=abc");
    expect(refsSearchParams({ ...BASIS, sort: "oldest" }).toString()).toBe("sort=oldest");
  });

  it("schickt den Ansichts-Schalter nicht an die API", () => {
    // `view=styles` ist eine Angabe der Seite; die Stilfamilien filtert sie
    // selbst. Ein mitgeschickter Schalter aendert die Antwort nicht, macht
    // aber aus derselben Liste zwei Adressen.
    expect(refsSearchParams({ ...BASIS, view: "styles" }).toString()).toBe("");
  });

  it("findet einen Stil ueber Name, Wiedererkennung und Vokabular", () => {
    const collection = { name: "Bauhaus", recognize: ["Geometrie"], vocabulary: ["Primaerfarben"] };
    expect(refsStyleMatches(collection, "")).toBe(true);
    expect(refsStyleMatches(collection, "bau")).toBe(true);
    expect(refsStyleMatches(collection, "GEOMETRIE")).toBe(true);
    expect(refsStyleMatches(collection, "primaer")).toBe(true);
    expect(refsStyleMatches(collection, "barock")).toBe(false);
  });

  it("uebersteht einen Stil ohne Wiedererkennung und Vokabular", () => {
    expect(refsStyleMatches({ name: "Minimal" }, "mini")).toBe(true);
    expect(refsStyleMatches({ name: "Minimal" }, "maxi")).toBe(false);
  });

  it("nennt in der Fusszeile die Sicht oder den Suchbegriff", () => {
    expect(refsFooterText(7, "Referenzen", "")).toBe("7 Referenzen in Sicht");
    expect(refsFooterText(2, "Stile", "bauhaus")).toBe("2 Stile passend zu “bauhaus”");
  });

  it("waehlt die Kopfzeile in der Reihenfolge Stil, Sammlung, ohne Sammlung, alle", () => {
    expect(refsHeaderText({ styleMode: true, collection: "k1", activeCollection: { name: "Fotografie" } })).toEqual({
      title: "Stil-Guide",
      description: "Erkunde die visuellen Sprachen hinter der Arbeit.",
    });
    expect(refsHeaderText({ styleMode: false, collection: "k1", activeCollection: { name: "Fotografie" } })).toEqual({
      title: "Fotografie",
      description: "Ein anderer Blickwinkel. Für das richtige Projekt aufgehoben.",
    });
    expect(refsHeaderText({ styleMode: false, collection: "none", activeCollection: null })).toEqual({
      title: "Ohne Sammlung",
      description: "Referenzen, die noch keiner Sammlung zugeordnet sind.",
    });
    expect(refsHeaderText({ styleMode: false, collection: "", activeCollection: null })).toEqual({
      title: "Alle Referenzen",
      description: "Sammle, was dein Auge fängt. Mach es zu deinem.",
    });
  });

  it("haelt die Standardfilter an einer Stelle", () => {
    expect(REFS_DEFAULT_FILTER).toEqual({ query: "", collection: "", view: "", sort: "newest" });
    expect(Object.isFrozen(REFS_DEFAULT_FILTER)).toBe(true);
  });
});
