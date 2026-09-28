import type { NodeTree } from "@senify/section-sdk";
import type { Registry } from "@senify/section-sdk";
import type { DomElement } from "./dom.ts";
import type { FrameDescriptor } from "./frames.ts";
import type { FrameBreakpoint } from "./types.ts";

// The seam between "who paints a frame" and "where the frame lives".
//
// This type used to live in `mount.ts` next to the retired v1 editor, and both
// the canvas and the React renderer imported it from there. That was the last
// thing keeping a 3 200-line legacy module in the dependency graph of live
// code, so it moved here (Fahrplan P3-1 Punkt 4, R5).
//
// The split is the point: `FrameRenderer` is a two-method contract, and both
// live consumers only ever needed the contract. Nothing about it is legacy -
// `createReactRenderer` and the canvas both satisfy it, and both keep doing so
// after `mount.ts` is gone. The moved definition is byte-for-byte the old one,
// so no behaviour can have shifted in the move.
export type FrameRenderContext = {
  tree: NodeTree;
  registry: Registry;
  breakpoint: FrameBreakpoint;
};

export type FrameRenderer = {
  mount(frame: FrameDescriptor, body: DomElement, context: FrameRenderContext): void;
  destroy(): void;
};
