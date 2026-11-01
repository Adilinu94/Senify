import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// The case of a fit text (measured on `unifiersofjapan`, 01.11.2026).
//
// The source's fit text is an `<svg>` with a viewBox and a `<h3 class="framer-text">`
// inside; the words carry their style as `--framer-*` variables. The box scale
// already travels (see `fit-text-box.test.ts`), but the case did not: the
// measured hero of `unifiersofjapan` showed `ODA NOBUNAGA` in the source and
// `oda nobunaga` in the import — the same Anton file, the same 281.3 px type,
// the wrong case. The variable is read (`--framer-text-transform` → textTransform),
// but `fitTextStyles` never handed it on.

type MappedNode = { id?: string; primitive?: string; props?: Record<string, unknown> };

function page(body: string): string {
  return `<html lang="de"><head><title>t</title></head><body>
    <div id="main" data-framer-hydrate-v2>${body}</div>
  </body></html>`;
}

const FIT_TEXT = `<svg class="framer-oda" viewBox="0 0 1079.066 394.8">
  <foreignObject width="100%" height="100%" class="framer-fit-text">
    <h3 style="--framer-font-family:&quot;Anton&quot;, sans-serif;--framer-font-size:768.857px;--framer-text-transform:uppercase">oda</h3>
  </foreignObject>
</svg>`;

function fitNode(body: string): MappedNode | undefined {
  const document = captureHtml({ html: page(body) });
  const normalized = normalize(document, { mode: "fidelity" });
  const result = mapDocument(document, normalized.rules, { mode: "fidelity" });
  const nodes = Object.values(result.document.nodes) as MappedNode[];
  return nodes.find((node) => node.props?.html === "oda");
}

describe("the case of a fit text", () => {
  it("carries the text-transform of the words", () => {
    expect(fitNode(FIT_TEXT)?.props?.textTransform).toBe("uppercase");
  });

  it("leaves the case alone when the source names none", () => {
    expect(fitNode(FIT_TEXT.replace("--framer-text-transform:uppercase", ""))?.props?.textTransform).toBeUndefined();
  });
});
