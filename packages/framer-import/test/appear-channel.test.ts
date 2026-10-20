import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/capture-html.ts";
import type { IrNode } from "../src/ir.ts";

const page = (body: string, head = ""): string =>
  `<html lang="en"><head><title>t</title>${head}</head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

const channel = (entries: string): string =>
  `<script type="application/json" id="__framer__appearAnimationsContent">${entries}</script>`;

function nodeWithTag(root: IrNode, tag: string): IrNode | undefined {
  for (const child of root.children) {
    if (child.tag === tag) return child;
    const found = nodeWithTag(child, tag);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("what names a start state", () => {
  // The appear channel names the elements Framer moves in, with their start
  // values per device. It does NOT name every appear id: Framer's variants are
  // missing from it. An element the channel does not know would keep its
  // start state, stay invisible and would not be folded into one node
  // (measured: the page grew by 17 KB of HTML and the pixel difference on
  // tablet rose from 3.5 % to 4.2 %). The appear id therefore stays the
  // marker, and the inline style stays the source of the value.
  it("takes a start state from an appear id the channel does not name", () => {
    const document = captureHtml({
      html: page(
        `<div data-framer-appear-id="a1" style="opacity:0.001;transform:translateY(10px)">x</div>`,
        channel('{"a2":{"default":{"initial":{"opacity":0.8,"x":20,"y":0,"scale":1,"rotate":0}}}}'),
      ),
    });
    const node = nodeWithTag(document.pages[0]?.root as IrNode, "div");
    expect(node?.appearInitial).toEqual({ opacity: "0.001", transform: "translateY(10px)" });
    expect(node?.states[0]?.visual.opacity).toBeUndefined();
    expect(node?.states[0]?.visual.transform).toBeUndefined();
  });

  it("recognizes a plainly visible start state without an appear id", () => {
    const document = captureHtml({
      html: page(`<div style="opacity:0.001;transform:translateY(40px)">x</div>`),
    });
    const node = nodeWithTag(document.pages[0]?.root as IrNode, "div");
    expect(node?.appearInitial).toEqual({ opacity: "0.001", transform: "translateY(40px)" });
    expect(node?.states[0]?.visual.opacity).toBeUndefined();
  });

  it("keeps an opacity that is plainly the look of the element", () => {
    // A half transparent element without a transform is a design, not a
    // start state: it stays.
    const document = captureHtml({
      html: page(`<div style="opacity:0.5">x</div>`),
    });
    const node = nodeWithTag(document.pages[0]?.root as IrNode, "div");
    expect(node?.appearInitial).toBeUndefined();
    expect(node?.states[0]?.visual.opacity).toBe("0.5");
  });

  it("leaves a scroll reveal where it stands", () => {
    // A scroll reveal carries `will-change: transform` and an opacity above
    // 0.01. No channel names it, so the capture cannot tell it from a design.
    // The rule that would catch it (`will-change: transform` plus a moving
    // transform) was measured on the site and brought no gain: the pixel
    // difference rose from 4.24 % to 4.27 % and the page stayed 147 px too
    // short. The state therefore stays where it is, and the loss is named in
    // the report instead of being guessed away.
    const document = captureHtml({
      html: page(
        `<div style="will-change:transform;opacity:0.6;transform:translateY(132px) scale(0.6)">x</div>`,
      ),
    });
    const node = nodeWithTag(document.pages[0]?.root as IrNode, "div");
    expect(node?.appearInitial).toBeUndefined();
    expect(node?.states[0]?.visual.opacity).toBe("0.6");
    expect(node?.states[0]?.visual.transform).toBe("translateY(132px) scale(0.6)");
  });

  it("keeps a shifted element that carries no will-change", () => {
    // A centring transform is a design, not a start state. Measured on the
    // site: the three hover offsets and the two centring transforms carry no
    // `will-change`, so no rule touches them.
    const document = captureHtml({
      html: page(`<div style="transform:translate(-50%, -50%)">x</div>`),
    });
    const node = nodeWithTag(document.pages[0]?.root as IrNode, "div");
    expect(node?.appearInitial).toBeUndefined();
    expect(node?.states[0]?.visual.transform).toBe("translate(-50%, -50%)");
  });
});
