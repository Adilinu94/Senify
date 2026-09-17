// The canvas (Phase 0, fourth slice): the frame shell and its pure building
// blocks. `mountCanvas` is the DOM entry; everything else is browser-free and
// unit-tested (device frames, rule injection, selection logic, insert rules,
// document adapter).
export {
  mountCanvas,
  type CanvasInstance,
  type CanvasOptions,
  type CanvasState,
} from "./canvas.ts";
export { CANVAS_STYLES, ensureCanvasStyles } from "./styles.ts";
export {
  CANVAS_DEVICES,
  canvasFrames,
  canvasStageWidth,
  fitZoom,
  frameSelector,
  type CanvasDevice,
  type CanvasFrameSpec,
  type FitOptions,
} from "./device.ts";
export { CANVAS_CHROME_CSS, canvasFrameRules, type FrameRules, type FrameRulesOptions } from "./rules.ts";
export { canvasNodeTree } from "./adapter.ts";
export {
  assertChildAllowed,
  childRejection,
  firstFreeSlot,
  insertMutation,
  insertPlan,
  slotRejection,
  type InsertPlan,
  type InsertPosition,
} from "./insert.ts";
export {
  drillDownId,
  firstChildId,
  resolveClick,
  selectedId,
  selectionLabel,
  type ClickResolution,
} from "./selection.ts";
