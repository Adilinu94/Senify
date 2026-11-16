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

describe("mergeStatesBySignature bei generischen Framer-Klassen", () => {
  // `framer-text` sitzt auf jedem Absatz einer Framer-Seite: die Klasse benennt
  // kein Element. Gemessen auf Chocolate `/`: 75 `p.framer-text` auf Desktop,
  // 71 im Tablet-Bau; der Header traegt auf Desktop fuenf Texte mehr. Die
  // Reihenfolge paarte den Hero-Text mit einem fremden Absatz, der Hero-Badge
  // bekam auf Tablet und Mobil 10 px und dessen Farbe statt 19,8 px.
  it("paart einen Absatz ueber seinen benannten Elternteil, nicht ueber die Reihenfolge", () => {
    const browser = documentOf([
      element("kopf", "div", ["framer-kopf"], [element("kopf-text", "p", ["framer-text"])]),
      element("held", "div", ["framer-held"], [element("held-text", "p", ["framer-text"])]),
      element("fuss", "div", ["framer-fuss"], [element("fuss-text", "p", ["framer-text"])]),
    ]);
    // Der Tablet-Bau hat den Kopftext nicht (Menue eingeklappt).
    const tablet = documentOf([
      element("kopf", "div", ["framer-kopf"]),
      element("held", "div", ["framer-held"], [element("held-text", "p", ["framer-text"], [], { "font-size": "19.8px" })]),
      element("fuss", "div", ["framer-fuss"], [element("fuss-text", "p", ["framer-text"], [], { "font-size": "10px" })]),
    ]);

    mergeStatesBySignature(browser, tablet, "tablet");

    const root = (browser as unknown as { pages: { root: TestNode }[] }).pages[0]?.root;
    if (root === undefined) throw new Error("kein Root");
    expect(stateOf(root, "held-text", "tablet")?.["font-size"]).toBe("19.8px");
    expect(stateOf(root, "fuss-text", "tablet")?.["font-size"]).toBe("10px");
    // Der Kopftext hat im Tablet-Bau keine Entsprechung und bekommt keinen fremden Zustand.
    expect(stateOf(root, "kopf-text", "tablet")).toBeUndefined();
  });

  it("paart wiederholte Absaetze unter demselben Elternteil weiter in Reihenfolge", () => {
    const browser = documentOf([
      element("liste", "div", ["framer-liste"], [element("eins", "p", ["framer-text"]), element("zwei", "p", ["framer-text"])]),
    ]);
    const tablet = documentOf([
      element("liste", "div", ["framer-liste"], [
        element("eins", "p", ["framer-text"], [], { "font-size": "12px" }),
        element("zwei", "p", ["framer-text"], [], { "font-size": "14px" }),
      ]),
    ]);
    mergeStatesBySignature(browser, tablet, "tablet");
    const root = (browser as unknown as { pages: { root: TestNode }[] }).pages[0]?.root;
    if (root === undefined) throw new Error("kein Root");
    expect(stateOf(root, "eins", "tablet")?.["font-size"]).toBe("12px");
    expect(stateOf(root, "zwei", "tablet")?.["font-size"]).toBe("14px");
  });
});