import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// The fit text of Framer.
//
// The source measures the words: the box of a text component carries
// `font-size: 0` (and `line-height: 0`), the words themselves take their size
// from the class. The import took the measuring zero as the size — the words
// were invisible (measured on `notes.framer.website`: the heading "Writing"
// had a height of 0 in the import while the source showed 22 px, and the page
// lost 242 px of height).
//
// The import gives the box the size of the words and drops the marker from
// the inner markup. What is STILL open: the size of a word usually comes
// from an attribute selector of the source
// (`[data-framer-component-type=Text] span span { font-size: var(--framer-font-size) }`)
// that the import does not evaluate — see `docs/fahrplan.md`, P3-7.

const page = (body: string, head = ""): string =>
  `<html lang="de"><head><title>t</title>${head}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

// A text component as Framer writes it: the box measures, the words carry
// their size.
const FIT_TEXT = `<div data-framer-component-type="Text" class="framer-x" style="font-size:0px;line-height:0px">
  <span style="font-size: 0; line-height: 0; tab-size: 4"><span style="direction: ltr; font-size: 0"><span style="font-size:18px">Writing</span></span></span>
</div>`;

function mapped(body: string): Record<string, unknown> {
  const document = captureHtml({ html: page(body) });
  const normalized = normalize(document, { mode: "fidelity" });
  return mapDocument(document, normalized.rules).document.nodes as unknown as Record<string, unknown>;
}

describe("the fit text of Framer", () => {
  it("gives the box the size of the words instead of the measuring zero", () => {
    const nodes = mapped(FIT_TEXT);
    const texts = Object.values(nodes).filter(
      (node) => typeof (node as { props?: { html?: unknown } }).props?.html === "string",
    );
    expect(texts.length).toBeGreaterThan(0);
    const text = texts[0] as { props: Record<string, unknown> };
    // The size of the words, not the zero of the box.
    expect(text.props["fontSize"]).toBe("18px");
    // The inner markup no longer carries the marker.
    expect(String(text.props["html"])).not.toMatch(/font-size:\s*0/);
  });

  it("keeps a text that is not a fit text as it is", () => {
    const nodes = mapped(`<p class="framer-y" style="font-size:24px">Wort</p>`);
    const texts = Object.values(nodes).filter(
      (node) => typeof (node as { props?: { text?: unknown } }).props?.text === "string",
    );
    expect(texts.length).toBeGreaterThan(0);
    const text = texts[0] as { props: Record<string, unknown> };
    expect(text.props["fontSize"]).toBe("24px");
  });
});
