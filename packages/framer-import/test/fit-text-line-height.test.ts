import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// A fit text whose line height is written in `em` (measured on last-studio,
// 23.10.2026).
//
// The source sets the line height of a fitted heading as `--framer-line-height:
// 1.05em`. The capture read `%` and a bare number, but not `em` — the value fell
// away and the heading took the browser's 1.5. At a font size of 201 px that is
// 295 px instead of 211: the header grew from 510 to 599 px, the page from 9354
// to 9531 (177 px), and the pixel difference of the whole page was 25,07 %
// (desktop). With the `em` form read, the header is 510 px again, the page
// height exact, and the difference **8,96 / 7,66 / 2,88 %**.

const FIT_TEXT = `<div id="main" data-framer-hydrate-v2>
  <svg viewBox="0 0 1000 200" style="width:100%">
    <foreignObject width="100%" height="100%" class="framer-fit-text">
      <h1 style="--framer-font-size:200px;--framer-line-height:1.05em;--framer-font-family:'Inter'">Last studio</h1>
    </foreignObject>
  </svg>
</div>`;

function mapped(html: string): Record<string, unknown> {
  const document = captureHtml({ html: `<html lang="de"><head><title>t</title></head><body>${html}</body></html>` });
  const normalized = normalize(document, { mode: "fidelity" });
  return mapDocument(document, normalized.rules, { mode: "fidelity" }).document.nodes as unknown as Record<string, unknown>;
}

describe("the line height of a fit text", () => {
  it("reads the em form as the factor the style table wants", () => {
    const nodes = mapped(FIT_TEXT);
    const heading = Object.values(nodes).find(
      (node) => typeof (node as { props?: { lineHeight?: unknown } }).props?.lineHeight === "string",
    ) as { props: Record<string, unknown> } | undefined;
    expect(heading).toBeDefined();
    // 1.05em is 1.05 as a factor — not the browser default of 1.5.
    expect(heading?.props["lineHeight"]).toBe("1.05");
  });

  it("still reads the percent form", () => {
    const nodes = mapped(FIT_TEXT.replace("1.05em", "105%"));
    const heading = Object.values(nodes).find(
      (node) => typeof (node as { props?: { lineHeight?: unknown } }).props?.lineHeight === "string",
    ) as { props: Record<string, unknown> } | undefined;
    expect(heading?.props["lineHeight"]).toBe("1.05");
  });

  it("leaves the line height out when the form is unknown", () => {
    // Not a guess: an unreadable value stays absent, and the browser default
    // applies. Inventing a number would be the silent failure this test guards.
    const nodes = mapped(FIT_TEXT.replace("1.05em", "calc(1em + 2px)"));
    const heading = Object.values(nodes).find(
      (node) => typeof (node as { props?: { lineHeight?: unknown } }).props?.lineHeight === "string",
    ) as { props: Record<string, unknown> } | undefined;
    expect(heading?.props["lineHeight"]).toBeUndefined();
  });
});
