import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// U7 (Live-Messung 26.10.2026): Von 40 105 Deklarationen der Quelle kamen
// 17 871 „nicht an" — aber der ehrliche Vergleich je Knoten zeigt, dass der
// Baum MEHR trägt (15,4 Deklarationen je Knoten gegen 13,9 je Element). Der
// Rest ist Faltung: 2 887 Elemente werden zu 1 533 Knoten.
//
// Vier Eigenschaften bleiben als echte Lücke übrig. Eine davon ist ein
// Kaskadenfehler: `margin` (die Kurzschreibweise) überschreibt `margin-top`.
//
//   Quelle:  <p style="margin:0; margin-top:20px">
//   Baum:    margin = {0,0,0,0}   — die 20px sind weg
//
// CSS löst das über die REIHENFOLGE: was später kommt, gewinnt. `margin-top`
// nach `margin` muss also die Oberkante setzen. Der Mapper hat die Werte in
// zwei getrennten Schritten gelesen und dabei die Reihenfolge verloren.

const page = (body: string): string =>
  `<html lang="de"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const mappedOf = (html: string): Record<string, { id: string; primitive: string; props: Record<string, unknown> }> => {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const mapped = mapDocument(document, normalized.rules);
  return mapped.document.nodes as unknown as Record<string, { id: string; primitive: string; props: Record<string, unknown> }>;
};

describe("U7: die Kurzschreibweise darf die Langform nicht schlucken", () => {
  it("keeps a margin-top that comes after the margin shorthand", () => {
    const nodes = mappedOf(page(`<p style="margin:0; margin-top:20px">Text</p>`));
    const text = Object.values(nodes).find((node) => node.props["text"] === "Text");
    expect(text).toBeDefined();
    const margin = text?.props["margin"] as { top?: string; bottom?: string } | undefined;
    expect(margin).toBeDefined();
    // CSS: die spätere Langform gewinnt. Die Einheit ist die der Quelle
    // (`0` bleibt `0`, kein erfundenes `0px`).
    expect(margin?.top).toBe("20px");
    expect(margin?.bottom).toBe("0");
  });

  it("lets a margin shorthand AFTER the longhand win, as CSS does", () => {
    const nodes = mappedOf(page(`<p style="margin-top:20px; margin:0">Text</p>`));
    const text = Object.values(nodes).find((node) => node.props["text"] === "Text");
    const margin = text?.props["margin"] as { top?: string } | undefined;
    // Die Kurzschreibweise steht später und setzt alle vier Seiten.
    expect(margin?.top).toBe("0");
  });

  it("does not invent a margin where the source has none", () => {
    const nodes = mappedOf(page(`<p style="margin-top:20px">Text</p>`));
    const text = Object.values(nodes).find((node) => node.props["text"] === "Text");
    const margin = text?.props["margin"] as { top?: string; right?: string; bottom?: string; left?: string } | undefined;
    // Nur die Oberkante ist gesetzt; die anderen Seiten bleiben bei 0.
    expect(margin?.top).toBe("20px");
    expect(margin?.right ?? "0px").toBe("0px");
  });
});
