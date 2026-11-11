import { describe, expect, it } from "vitest";
import { mergeStatesBySignature } from "../src/import.ts";

// Elements without a class, an id or a variant are common inside a Framer card
// (the absolute image wrapper, the centre wrapper). Their signature is only
// `tag||` — every one of them looks alike, so the pairing fell back to document
// order. Measured on Relay `/`: the portrait wrapper took the tablet state of a
// logo card (190 x 70 instead of the parent's aspect ratio), and one logo card
// took 330 x 210. The classed parent separates them.

type TestNode = {
  key: string;
  tag: string;
  kind: string;
  htmlId: string | null;
  baseClasses: string[];
  variantClasses?: string[];
  states: { device: string; hiddenAt: string[]; visual?: Record<string, string> }[];
  children: TestNode[];
};

const element = (
  key: string,
  tag: string,
  baseClasses: string[],
  children: TestNode[] = [],
  visual?: Record<string, string>,
): TestNode => ({
  key,
  tag,
  kind: "element",
  htmlId: null,
  baseClasses,
  states: [{ device: "desktop", hiddenAt: [], ...(visual === undefined ? {} : { visual }) }],
  children,
});

const documentOf = (children: TestNode[]) =>
  ({
    pages: [{ root: element("root", "div", [], children) }],
    breakpoints: [],
    findings: [],
    assets: [],
  }) as never;

const stateOf = (root: TestNode, key: string, device: string): Record<string, string> | undefined => {
  const suchen = (node: TestNode): TestNode | null => {
    if (node.key === key) return node;
    for (const child of node.children) {
      const found = suchen(child);
      if (found !== null) return found;
    }
    return null;
  };
  const node = suchen(root);
  return node?.states.find((state) => state.device === device)?.visual;
};

describe("mergeStatesBySignature bei klassenlosen Kopien", () => {
  it("paart eine klassenlose Kopie über den klassenlosen Elternteil, nicht über die Dokumentreihenfolge", () => {
    // Desktop: zwei Karten mit je einem klassenlosen Kind, A vor B.
    const browser = documentOf([
      element("karte-a", "div", ["framer-karte-a"], [element("a", "div", [])]),
      element("karte-b", "div", ["framer-karte-b"], [element("b", "div", [])]),
    ]);
    // Gerätebau: dieselben zwei Karten, aber B steht vor A. Ohne den Elternteil
    // paart die Dokumentreihenfolge A mit dem Kind von B.
    const tablet = documentOf([
      element("karte-b", "div", ["framer-karte-b"], [element("b", "div", [], [], { width: "330px", height: "210px" })]),
      element("karte-a", "div", ["framer-karte-a"], [element("a", "div", [], [], { width: "190px", height: "70px" })]),
    ]);

    mergeStatesBySignature(browser, tablet, "tablet");

    const root = (browser as unknown as { pages: { root: TestNode }[] }).pages[0]?.root;
    if (root === undefined) throw new Error("kein Root");
    const a = stateOf(root, "a", "tablet");
    const b = stateOf(root, "b", "tablet");
    expect(a?.["width"]).toBe("190px");
    expect(a?.["height"]).toBe("70px");
    expect(b?.["width"]).toBe("330px");
    expect(b?.["height"]).toBe("210px");
  });
});
