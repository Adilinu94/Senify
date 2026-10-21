import { describe, expect, it } from "vitest";
import { captureHtml, mapDocument, normalize } from "@senify/framer-import";

// The look of a word inside a flowing text (the marked word of the
// testimonial of the Earn template). The source puts the marker in the inline
// style of its `<span>`; two things kept it from arriving: the sanitizer
// dropped every `style` attribute, and the start state of the effect
// (`background-size:0%`) would have kept the word unmarked for good.

const bodiesOf = (html: string, mode: "dna" | "fidelity" = "dna"): string[] => {
  const document = captureHtml({ html });
  const normalized = normalize(document);
  const mapped = mapDocument(document, normalized.rules, { mode });
  return Object.values(mapped.document.nodes)
    .filter((node) => node.primitive === "body")
    .map((node) => String(node.props["html"] ?? ""));
};

const rulesOf = (html: string): string[] => {
  const document = captureHtml({ html });
  const out: string[] = [];
  const walk = (node: { states: { visual: Record<string, string> }[]; children: unknown[] }): void => {
    for (const state of node.states) {
      for (const [name, wert] of Object.entries(state.visual)) out.push(`${name}:${wert}`);
    }
    for (const child of node.children) walk(child as { states: { visual: Record<string, string> }[]; children: unknown[] });
  };
  walk(document.pages[0]?.root as { states: { visual: Record<string, string> }[]; children: unknown[] });
  return out;
};

describe("der Stil eines Wortes im Fliesstext", () => {
  it("nimmt die Inline-Deklarationen des Elements mit", () => {
    const html = `<html><body><div id="main"><div data-framer-component-type="RichTextContainer">
      <span style="position:relative;display:inline;padding:0px 2px;background-color:rgb(255, 249, 189)">markiert</span>
      </div></div></body></html>`;
    const bodies = bodiesOf(html).join("\n");
    expect(bodies).toContain("background-color:rgb(255, 249, 189)");
    expect(bodies).toContain("markiert");
  });

  it("laesst die Properties weg, die ein Uebergang nennt (der Zustand vor dem Effekt)", () => {
    // Framer schreibt den Zustand VOR dem Effekt inline: `background-size:0%`
    // waechst beim Erscheinen auf die volle Flaeche. Der Ruhewert kommt aus
    // den Klassenregeln — die Inline-Deklaration waere der Startzustand.
    const html = `<html><body><div id="main"><div data-framer-component-type="RichTextContainer">
      <span style="background-color:rgb(255, 249, 189);background-size:0% 100%;transition:background-size 2s cubic-bezier(0.65, 0, 0.35, 1)">markiert</span>
      </div></div></body></html>`;
    const bodies = bodiesOf(html).join("\n");
    expect(bodies).toContain("background-color:rgb(255, 249, 189)");
    expect(bodies).not.toContain("background-size");
    expect(bodies).not.toContain("transition");
  });

  it("nimmt die Typografie nur im Originalgetreu-Modus mit", () => {
    const html = `<html><body><div id="main"><div data-framer-component-type="RichTextContainer">
      <span style="--framer-font-size:40px;--framer-font-weight:700">Wort</span>
      </div></div></body></html>`;
    // Im DNA-Modus gehoeren die Schriften dem Theme, nicht der Quelle.
    expect(bodiesOf(html, "dna").join("\n")).not.toContain("font-size");
    expect(bodiesOf(html, "fidelity").join("\n")).toContain("font-size:40px");
  });
});

describe("der Startzustand eines Effekts", () => {
  it("kommt nicht als Aussehen an (die Hervorhebung waere 0 % breit)", () => {
    const html = `<html><body><div id="main"><div data-framer-component-type="RichTextContainer">
      <span style="background:rgb(255, 249, 189);background-size:0% 100%;transition:background-size 2s ease">markiert</span>
      </div></div></body></html>`;
    const regeln = rulesOf(html).join("\n");
    expect(regeln).toContain("background:rgb(255, 249, 189)");
    expect(regeln).not.toContain("background-size");
    expect(regeln).not.toContain("transition");
  });

  it("kommt auch nicht mit dem inneren Markup einer Ueberschrift mit", () => {
    // Die Woerter einer Ueberschrift tragen den Startzustand inline
    // (`opacity:0.001` + Transform). Mit dem inneren Markup angekommen, waeren
    // sie fuer immer unsichtbar — die Ueberschrift fehlte dann ganz.
    const html = `<html><body><div id="main"><h1><span style="display:inline-block;opacity:0.001;transform:translateY(10px)">Alles</span> <span style="display:inline-block;opacity:0.001;transform:translateY(10px)">waechst</span></h1></div></body></html>`;
    const document = captureHtml({ html });
    const inner = document.pages[0]?.root.children[0]?.innerHtml ?? "";
    expect(inner).toContain("Alles");
    expect(inner).not.toContain("opacity");
    expect(inner).not.toContain("transform");
  });
});
