import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// A marked word whose size stands in a Framer VARIABLE (measured on `refined`,
// 24.10.2026).
//
// Framer writes the typography of a single word into `--framer-*` variables and
// its own stylesheet turns them into declarations:
//
//   <p style="--framer-font-size:20px;--framer-line-height:1.5em">
//     <span style="--framer-font-size:32px">$5000</span>/project
//
// The import drops variables (they are not style properties, and no stylesheet
// reads them any more), so the word kept the paragraph's size: measured on
// `refined`, "$5000" stands **48 px** tall in the source and 30 px in the
// structure, the price card 69 → 51 px, the page 18 px short (10375 → 10357).
//
// The line height is the second half of it. The source writes `1.5em` on the
// PARAGRAPH; the browser inherits the FACTOR, so the 32 px word is laid out in
// 48 px, not in the paragraph's computed 30. A `px` value of the parent is not
// repeatable — it belongs to the parent's size.
//
// The rule sits in the sheet for the real page (`line-height: 1.5em` on the
// container); the fixture writes it as a class rule so the cascade produces the
// same `visual` the live page produces.

function mapped(html: string): Record<string, { primitive?: string; props?: Record<string, unknown> }> {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  return mapDocument(document, normalized.rules, { mode: "fidelity" }).document.nodes as unknown as Record<
    string,
    { primitive?: string; props?: Record<string, unknown> }
  >;
}

function priceHtml(lineHeight: string): string {
  return `<html lang="de"><head><title>t</title><style>
    .pricing { line-height: ${lineHeight}; }
  </style></head><body>
    <div id="main" data-framer-hydrate-v2>
      <div class="framer-7h4mmy pricing">
        <p class="framer-text"><span class="framer-text" style="--framer-font-size:32px">$5000</span>/project</p>
      </div>
    </div>
  </body></html>`;
}

function htmlOf(nodes: Record<string, { props?: Record<string, unknown> }>): string {
  const node = Object.values(nodes).find((entry) => typeof entry.props?.html === "string" && String(entry.props.html).includes("5000"));
  return String(node?.props?.html ?? "");
}

describe("a marked word sized by a Framer variable", () => {
  it("writes the size as the declaration the variable stands for", () => {
    const html = htmlOf(mapped(priceHtml("1.5em")));
    // Without this the word keeps the paragraph's 20px and the line is 34 px
    // instead of 48.
    expect(html).toContain("font-size:32px");
  });

  it("repeats the parent's line-height FACTOR on the bigger word", () => {
    const html = htmlOf(mapped(priceHtml("1.5em")));
    // 1.5 × 32 = 48 — exactly what the source renders.
    expect(html).toContain("line-height:1.5");
  });

  it("does not repeat a line height written in px", () => {
    // A `px` line height belongs to the parent's font size; repeating it on the
    // 32 px word would freeze the line at the parent's height.
    const html = htmlOf(mapped(priceHtml("30px")));
    expect(html).toContain("font-size:32px");
    expect(html).not.toContain("line-height:30px");
  });

  it("leaves a word without a variable untouched", () => {
    // Nothing to rewrite: the markup is the author's.
    const html = `<html lang="de"><head><title>t</title></head><body>
      <div id="main" data-framer-hydrate-v2>
        <p class="framer-text"><span class="framer-text">$5000</span>/project</p>
      </div>
    </body></html>`;
    expect(htmlOf(mapped(html))).not.toContain("font-size:32px");
  });
});
