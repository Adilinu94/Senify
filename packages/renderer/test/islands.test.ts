import { describe, expect, it } from "vitest";
import { getHydration, islandsForNode, islandsForTree } from "@senify/renderer";
import type { Node } from "@senify/section-sdk";

function node(type: string, extra: Partial<Node> = {}): Node {
  return { id: `n-${type}`, type, props: {}, ...extra };
}

describe("hydration dispatcher", () => {
  it("keeps plain sections static", () => {
    for (const type of ["hero", "features", "content", "divider", "marquee", "media", "gallery", "testimonials"]) {
      expect(getHydration(node(type)), type).toEqual({ mode: "static" });
    }
  });

  it("assigns islands to interactive sections", () => {
    expect(islandsForNode(node("navbar"))).toEqual(["menu"]);
    expect(islandsForNode(node("faq"))).toEqual(["accordion"]);
    expect(islandsForNode(node("cookie-note"))).toEqual(["consent"]);
    expect(
      islandsForNode(node("testimonials", { variant: "slider" })),
    ).toEqual(["slider"]);
    expect(
      islandsForNode(node("gallery", { variant: "carousel" })),
    ).toEqual(["slider"]);
    expect(
      islandsForNode(node("banner", { props: { dismissible: true } })),
    ).toEqual(["dismiss"]);
    expect(islandsForNode(node("banner", { props: {} }))).toEqual([]);
    expect(
      islandsForNode(node("hero", { variant: "showcase-3d" })),
    ).toEqual(["webgl-scene"]);
    expect(
      islandsForNode(node("media", { variant: "3d-scene" })),
    ).toEqual(["webgl-scene"]);
  });

  it("links the consent gate exactly where a placeholder is rendered", () => {
    const map = "https://www.google.com/maps/embed?pb=abc";
    expect(islandsForNode(node("embed", { props: { url: map } }))).toEqual(["embed-gate"]);
    expect(islandsForNode(node("embed", { props: { url: map, requireConsent: false } }))).toEqual([]);
    expect(islandsForNode(node("embed", { props: { url: "/lokal" } }))).toEqual([]);
    expect(
      islandsForNode(node("video", { props: { provider: "youtube", url: "https://www.youtube.com/embed/x" } })),
    ).toEqual(["embed-gate"]);
    expect(islandsForNode(node("video", { props: { provider: "file", url: "https://cdn.example.com/a.mp4" } }))).toEqual([]);
  });

  it("hangs the 3D island on the surface and honours the switch", () => {
    // A hero whose visual slot is filled lets the slot bring the surface.
    expect(
      islandsForNode(node("hero", { variant: "showcase-3d", slots: { visual: ["m1"] } })),
    ).toEqual([]);
    // The preset alone never starts the island — the surface is the contract.
    expect(
      islandsForNode(node("media", { variant: "image", motion: { preset: "webgl-scene" } })),
    ).toEqual([]);
    // A disabled spec switches the surface back to its static poster.
    expect(
      islandsForNode(
        node("media", { variant: "3d-scene", motion: { preset: "webgl-scene", enabled: false } }),
      ),
    ).toEqual([]);
    // Surface plus spec stays a single kind (no duplicate in the set).
    expect(
      islandsForNode(
        node("media", { variant: "3d-scene", motion: { preset: "webgl-scene" } }),
      ),
    ).toEqual(["webgl-scene"]);
  });

  it("enables billing only with a yearly price present", () => {
    expect(
      islandsForNode(node("pricing", { props: { billingToggle: true, plans: [] } })),
    ).toEqual([]);
    expect(
      islandsForNode(
        node("pricing", {
          props: {
            billingToggle: true,
            plans: [{ priceYearly: "100 €" }],
          },
        }),
      ),
    ).toEqual(["billing"]);
  });

  it("enables the modal lightbox through the motion preset", () => {
    expect(islandsForNode(node("gallery"))).toEqual([]);
    expect(
      islandsForNode(node("gallery", { motion: { preset: "modal" } })),
    ).toEqual(["modal"]);
    // A disabled spec opts out again.
    expect(
      islandsForNode(node("gallery", { motion: { preset: "modal", enabled: false } })),
    ).toEqual([]);
  });

  it("collects island kinds across a tree", () => {
    const kinds = islandsForTree({
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["a", "b"] },
        a: { id: "a", type: "navbar", props: {} },
        b: { id: "b", type: "faq", props: {} },
      },
    });
    expect([...kinds].sort()).toEqual(["accordion", "menu"]);
  });
});
