import { describe, expect, it } from "vitest";
import {
  describePrimitive,
  getPrimitive,
  type ElementSpec,
  type PropValue,
} from "@senify/widget-engine";

// B3 des Elementor-Abgleichs: Die Ueberschrift traegt ein Link-Ziel mit "Neuer
// Tab", wie das Heading in Elementor. Der Link sitzt als <a> um den Text IM
// Heading (die Ebene bleibt h1-h6); ein unsicheres Ziel wird nie gerendert.

function heading(props: Record<string, PropValue>): ElementSpec {
  const described = describePrimitive("heading", props);
  expect(described).toBeDefined();
  return described as ElementSpec;
}

describe("heading link (B3)", () => {
  it("offers a target and a new-tab switch like the frame does", () => {
    const keys = getPrimitive("heading")?.controls.map((control) => control.key);
    expect(keys).toEqual(expect.arrayContaining(["text", "level", "eyebrow", "link", "newTab"]));
    const link = getPrimitive("heading")?.controls.find((control) => control.key === "link");
    expect(link?.kind).toBe("url");
    expect(link?.default).toBe("");
  });

  it("renders without a link exactly as before", () => {
    const described = heading({ text: "Titel", level: "h3" });
    expect(described.tag).toBe("h3");
    expect(described.text).toBe("Titel");
    expect(described.children).toEqual([]);
  });

  it("wraps the text in an anchor inside the heading, keeping its level", () => {
    const described = heading({ text: "Titel", level: "h1", link: "/kontakt" });
    expect(described.tag).toBe("h1");
    expect(described.text).toBeUndefined();
    expect(described.children).toHaveLength(1);
    const anchor = described.children?.[0] as ElementSpec;
    expect(anchor.tag).toBe("a");
    expect(anchor.text).toBe("Titel");
    expect(anchor.attrs).toEqual({ href: "/kontakt" });
  });

  it("opens in a new tab with a safe rel when asked", () => {
    const anchor = heading({ text: "Titel", link: "https://example.com", newTab: true })
      .children?.[0] as ElementSpec;
    expect(anchor.attrs).toEqual({
      href: "https://example.com",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("reads the shared { url, newTab } link value that imports write", () => {
    const anchor = heading({ text: "Titel", link: { url: "/preise", newTab: true } })
      .children?.[0] as ElementSpec;
    expect(anchor.attrs).toEqual({ href: "/preise", target: "_blank", rel: "noopener noreferrer" });
  });

  it("keeps the kicker in front of the linked text", () => {
    const described = heading({ text: "Titel", eyebrow: "Neu", link: "/x" });
    expect(described.children?.map((child) => child.tag)).toEqual(["span", "a"]);
  });

  it("renders no anchor for an unsafe or empty target", () => {
    for (const link of ["javascript:alert(1)", "", "   "]) {
      const described = heading({ text: "Titel", link });
      expect(described.children, link).toEqual([]);
      expect(described.text, link).toBe("Titel");
    }
  });
});
