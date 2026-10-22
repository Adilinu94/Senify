// Die Aehnlichkeit zweier Baustein-Definitionen.
//
// Der Fingerabdruck ist eine Gleichheit: zwei Definitionen, die sich um eine
// Zeile unterscheiden, haben zwei verschiedene Fingerabdruecke. Die Aehnlichkeit
// misst die STRUKTUR (Knotenform, Prop-Schluessel, Slots) und beantwortet die
// Frage, die der Fingerabdruck nicht beantworten kann: "sind das zwei
// Auspraegungen desselben Bausteins?"
import { describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import {
  definitionFingerprint,
  definitionSimilarity,
} from "../src/store-library-similarity.ts";

function baum(nodes: Record<string, { type: string; props?: Record<string, unknown>; children?: string[]; slots?: Record<string, string[]> }>): NodeTree {
  return {
    rootNodeId: "wurzel",
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, node]) => [
        id,
        {
          id,
          type: node.type,
          props: node.props ?? {},
          ...(node.children === undefined ? {} : { children: node.children }),
          ...(node.slots === undefined ? {} : { slots: node.slots }),
        },
      ]),
    ),
  };
}

describe("definitionSimilarity", () => {
  it("erkennt dieselbe Struktur als 100 Prozent", () => {
    const eins = baum({
      wurzel: { type: "section", children: ["karte"] },
      karte: { type: "card", props: { headline: "A", tone: "soft" } },
    });
    const zwei = baum({
      wurzel: { type: "section", children: ["karte"] },
      karte: { type: "card", props: { headline: "B", tone: "hard" } },
    });
    // Der Text ist anders, die Form nicht: 100 Prozent.
    expect(definitionSimilarity(eins, zwei)).toBe(100);
  });

  it("unterscheidet verschiedene Bausteine", () => {
    const eins = baum({
      wurzel: { type: "section", children: ["karte"] },
      karte: { type: "card", props: { headline: "A" } },
    });
    const zwei = baum({
      wurzel: { type: "section", children: ["text"] },
      text: { type: "heading", props: { text: "B" } },
    });
    expect(definitionSimilarity(eins, zwei)).toBeLessThan(50);
  });

  it("bewertet einen zusaetzlichen Teil als teilweise aehnlich", () => {
    const eins = baum({
      wurzel: { type: "section", children: ["a", "b"] },
      a: { type: "card", props: { headline: "A" } },
      b: { type: "card", props: { headline: "B" } },
    });
    const zwei = baum({
      wurzel: { type: "section", children: ["a"] },
      a: { type: "card", props: { headline: "A" } },
    });
    // Einer von zwei Teilen passt: die Aehnlichkeit liegt dazwischen. (Der
    // Wurzelknoten zaehlt mit - und seine Form schliesst die Kinderzahl ein,
    // deshalb ist die Wurzel selbst keine Uebereinstimmung.)
    const wert = definitionSimilarity(eins, zwei);
    expect(wert).toBeGreaterThan(0);
    expect(wert).toBeLessThan(100);
  });

  it("behandelt die leere Definition", () => {
    const leer: NodeTree = { rootNodeId: "wurzel", nodes: { wurzel: { id: "wurzel", type: "section", props: {} } } };
    const voll = baum({ wurzel: { type: "section", children: ["a"] }, a: { type: "card" } });
    // Zwei leere Definitionen sind gleich, eine leere gegen eine volle nicht.
    expect(definitionSimilarity(leer, leer)).toBe(100);
    expect(definitionSimilarity(leer, voll)).toBe(0);
  });

  it("geht auch in die Slots", () => {
    // Der Slot-Inhalt ist Teil der Form: ein Baustein, dessen Slot gefuellt
    // ist, ist ein anderer als derselbe Baustein mit leerem Slot.
    const mitSlot = baum({
      wurzel: { type: "section", children: ["a"], slots: { inhalt: ["b"] } },
      a: { type: "card" },
      b: { type: "body" },
    });
    const ohneSlot = baum({
      wurzel: { type: "section", children: ["a"] },
      a: { type: "card" },
    });
    expect(definitionSimilarity(mitSlot, ohneSlot)).toBeLessThan(100);
    // Und der Slot-Inhalt zaehlt zur Groesse.
    expect(definitionSimilarity(mitSlot, mitSlot)).toBe(100);
  });

  it("zaehlt gleiche Formen mehrfach, wenn sie mehrfach vorkommen", () => {
    const eins = baum({
      wurzel: { type: "section", children: ["a", "b"] },
      a: { type: "card", props: { headline: "A" } },
      b: { type: "card", props: { headline: "A" } },
    });
    const zwei = baum({
      wurzel: { type: "section", children: ["a"] },
      a: { type: "card", props: { headline: "A" } },
    });
    // Zwei gleiche Karten gegen eine: die Aehnlichkeit liegt deutlich unter
    // 100, aber ueber null - die Form ist verwandt, nicht gleich.
    const wert = definitionSimilarity(eins, zwei);
    expect(wert).toBeGreaterThan(0);
    expect(wert).toBeLessThan(100);
  });
});

describe("definitionFingerprint", () => {
  it("ist fuer dieselbe Struktur gleich und fuer andere verschieden", () => {
    const eins = baum({ wurzel: { type: "section", children: ["a"] }, a: { type: "card" } });
    const gleich = baum({ wurzel: { type: "section", children: ["a"] }, a: { type: "card" } });
    const anders = baum({ wurzel: { type: "section", children: ["a"] }, a: { type: "heading" } });
    expect(definitionFingerprint(eins)).toBe(definitionFingerprint(gleich));
    expect(definitionFingerprint(eins)).not.toBe(definitionFingerprint(anders));
  });

  it("ignoriert die Werte der Props", () => {
    // Der Fingerabdruck ist der Dublettenschluessel: er schliesst die
    // Definitionen mit derselben FORM ein - ein Textunterschied ist kein
    // neuer Baustein, sondern eine Variante.
    const eins = baum({ wurzel: { type: "section", children: ["a"] }, a: { type: "card", props: { headline: "A" } } });
    const zwei = baum({ wurzel: { type: "section", children: ["a"] }, a: { type: "card", props: { headline: "B" } } });
    expect(definitionFingerprint(eins)).toBe(definitionFingerprint(zwei));
  });
});
