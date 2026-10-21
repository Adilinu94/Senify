import { describe, expect, it } from "vitest";
import { captureHtml, mapDocument, normalize } from "@senify/framer-import";
import type { IrNode } from "../src/ir.ts";

// Framer's "fit text": the words stand at their layout size inside an
// `<svg><foreignObject>`, and the `viewBox` of the `<svg>` scales the whole
// thing down to the box. Measured on the Earn template, the footer name carries
// `font-size:211px` in a `viewBox` 1058.22 wide — a visitor sees 19.94 % of the
// box width, on every device (1440, 900 and 390 px).
//
// Read as a graphic (`props.svg`), the words were a picture: the footer name
// did not arrive at all, the page came out 203 / 133 / 56 px too short, and no
// editor could reach the words. Read as text, they stay editable and the share
// of the box is what travels.

const page = (body: string): string =>
  `<html lang="en"><head><title>t</title></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const FIT_TEXT =
  '<svg class="framer-1apmb9b" data-framer-name="Your Name" data-framer-component-type="RichTextContainer" viewBox="0 0 1058.22 169" style="--framer-paragraph-spacing:0px">' +
  '<foreignObject width="100%" height="100%" class="framer-fit-text" transform="scale(1)" style="overflow:visible">' +
  '<p dir="auto" class="framer-text" style="--framer-font-family:&quot;Manrope&quot;, sans-serif;--framer-font-size:211px;--framer-font-weight:600;--framer-letter-spacing:-0.02em;--framer-line-height:80%;--framer-text-alignment:center">Alex Rivera</p>' +
  "</foreignObject></svg>";

function run(html: string) {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const mapped = mapDocument(document, normalized.rules, { mode: "fidelity" });
  return { document, mapped, nodes: Object.values(mapped.document.nodes) };
}

function nodeWithKind(root: IrNode, kind: string): IrNode | undefined {
  if (root.kind === kind) return root;
  for (const child of root.children) {
    const found = nodeWithKind(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("ein Text in einem foreignObject (Framer „fit text“)", () => {
  it("kommt als Text an, nicht als Grafik", () => {
    const { document } = run(page(FIT_TEXT));
    const node = nodeWithKind(document.pages[0]?.root as IrNode, "fit-text");
    expect(node).toBeDefined();
    expect(node?.states[0]?.text?.content).toBe("Alex Rivera");
    // Als Grafik wäre der Text ein Bild: im Editor nicht erreichbar.
    expect(node?.svg).toBeNull();
  });

  it("drückt die Schriftgröße als Anteil der Box aus", () => {
    // 211 / 1058.22 = 19.9391 % der Boxbreite. Ein fester px-Wert würde eine
    // Breite einfrieren, ein vw-Wert folgt dem Fenster statt der Box.
    const { document } = run(page(FIT_TEXT));
    const node = nodeWithKind(document.pages[0]?.root as IrNode, "fit-text");
    expect(node?.states[0]?.visual["font-size"]).toBe("19.9391cqw");
    // Aus `line-height:80%` wird der Faktor, den die Stiltabelle liest.
    expect(node?.states[0]?.visual["line-height"]).toBe("0.8");
    expect(node?.states[0]?.visual["font-weight"]).toBe("600");
    expect(node?.states[0]?.visual["text-align"]).toBe("center");
  });

  it("setzt den Container auf den Elternteil, nicht auf den Text", () => {
    // Eine Container-Query misst gegen den nächsten Vorfahren-Container, nie
    // gegen das Element, das die Einheit deklariert. Am Element selbst löst der
    // Browser 19.9391cqw gegen das Fenster auf (gemessen: 287 px statt 255 px).
    const { document } = run(page(`<div class="zeile">${FIT_TEXT}</div>`));
    const wrapper = document.pages[0]?.root.children[0] as IrNode;
    const fit = nodeWithKind(document.pages[0]?.root as IrNode, "fit-text");
    expect(wrapper.states[0]?.visual["container-type"]).toBe("inline-size");
    expect(fit?.states[0]?.visual["container-type"]).toBeUndefined();
  });

  it("mappt den Text als body mit seinem Inhalt", () => {
    const { nodes } = run(page(FIT_TEXT));
    const body = nodes.find((node) => String(node.props["html"] ?? "").includes("Alex Rivera"));
    expect(body?.primitive).toBe("body");
    expect(body?.props["html"]).toBe("Alex Rivera");
    expect(body?.props["fontSize"]).toBe("19.9391cqw");
    expect(body?.props["containerType"]).toBeUndefined();
  });

  it("lässt ein SVG ohne fit-text eine Grafik", () => {
    // Der Schutz: nur das Marker-Class macht einen Text, jedes andere SVG
    // bleibt die Zeichnung, die es ist (die Chevrons und Masken der Quelle).
    const { document } = run(page('<svg viewBox="0 0 24 24"><path d="M0 0 L8 8"/></svg>'));
    const node = nodeWithKind(document.pages[0]?.root as IrNode, "svg");
    expect(node?.svg).toContain("<path");
    expect(nodeWithKind(document.pages[0]?.root as IrNode, "fit-text")).toBeUndefined();
  });
});
