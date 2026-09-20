// Drag-and-drop DOM (ticket 12): catalog chips, drop line, plus points.
//
// The decisions live in `dnd.ts` (pure); this module is the DOM half. Two
// sources, one overlay:
//
// - the **catalog strip** under the canvas top bar (draggable chips; a click
//   inserts like the top bar buttons),
// - an **existing node** in a frame (pointer drag: mousedown + 4 px, then the
//   pointer moves; the whole drag is one undo through `dragCoalesceKey`).
//
// The drop line and the plus points live in the *editor* overlay over the
// stage, never in the content frame (content neutrality): the frame stays a
// pure document, the chrome is unlayered parent DOM with `pointer-events:
// none` except the plus buttons.

import type { PropValue } from "@senify/widget-engine";
import { getPrimitive, primitiveTypes } from "@senify/widget-engine";
import type { DomDocument, DomElement, DomEvent } from "../dom.ts";
import type { EditorStore } from "../state/store.ts";
import { dragCoalesceKey } from "../state/store.ts";
import { type InsertPosition } from "./insert.ts";
import {
  dropPositionFor,
  isContainer,
  resolveDrop,
  type DropPosition,
  type DropResolution,
  type DropSource,
} from "./dnd.ts";

export type DropFrame = {
  device: string;
  doc: DomDocument;
  body: DomElement | null;
  wrap: DomElement;
  scale: number;
};

export type DropControllerOptions = {
  doc: DomDocument;
  stage: DomElement;
  overlay: DomElement;
  store: EditorStore;
  frames: () => DropFrame[];
  catalogValue: () => string;
  onMessage: (message: string | null) => void;
};

export type DropController = {
  catalog: DomElement;
  attachFrame(frame: DropFrame): void;
  insertAt(targetId: string, primitive: string, position: InsertPosition): boolean;
  dragging(): boolean;
  destroy(): void;
};

type ElementSpec = {
  className?: string;
  text?: string;
  data?: Record<string, string>;
  attributes?: Record<string, string>;
};

function h(doc: DomDocument, tag: string, spec: ElementSpec = {}): DomElement {
  const element = doc.createElement(tag);
  if (spec.className !== undefined) element.className = spec.className;
  if (spec.text !== undefined) element.textContent = spec.text;
  for (const [name, value] of Object.entries(spec.data ?? {})) {
    element.setAttribute(`data-${name}`, value);
  }
  for (const [name, value] of Object.entries(spec.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

function rectOf(element: DomElement): { left: number; top: number; width: number; height: number } {
  return element.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
}

function hitNodeId(target: unknown): string | null {
  const element = target as DomElement | null;
  if (element === null || element === undefined || typeof element.closest !== "function") {
    return null;
  }
  const node = element.closest("[data-node-id]");
  return node?.getAttribute("data-node-id") ?? null;
}

function nodeElement(frame: DropFrame, nodeId: string): DomElement | null {
  return frame.body?.querySelector(`[data-node-id="${nodeId}"]`) ?? null;
}

export function createDropController(options: DropControllerOptions): DropController {
  const { doc, stage, overlay, store } = options;
  let dragSource: DropSource | null = null;
  let hoverNodeId: string | null = null;

  const catalog = h(doc, "div", {
    className: "senify-canvas__catalog",
    data: { role: "catalog-strip" },
    attributes: { "aria-label": "Bausteine zum Ziehen" },
  });

  // Insert at a target (the same resolution the drag uses); the chips, the plus
  // points and the top bar buttons all funnel through here.
  function insertAt(targetId: string, primitive: string, position: InsertPosition): boolean {
    const resolution = resolveDrop(
      store.document,
      { kind: "primitive", primitive },
      targetId,
      position,
    );
    if (resolution.kind === "reject") {
      options.onMessage(resolution.reason);
      return false;
    }
    if (resolution.kind !== "insert") return false;
    store.apply(
      {
        op: "insertNode",
        parent: resolution.parent,
        index: resolution.index,
        node: { primitive, props: {} as Record<string, PropValue> },
      },
      { label: "Baustein einfügen" },
    );
    options.onMessage(null);
    return true;
  }

  for (const type of primitiveTypes()) {
    if (type === "root") continue;
    const chip = h(doc, "button", {
      className: "senify-canvas__chip",
      text: getPrimitive(type)?.name ?? type,
      data: { primitive: type },
      attributes: { type: "button", draggable: "true", title: `${type} — ziehen oder klicken` },
    });
    chip.addEventListener("click", () => {
      const selected = store.selection.focus ?? store.selection.selected[0] ?? null;
      if (selected !== null) insertAt(selected, type, "after");
    });
    chip.addEventListener("dragstart", (event) => {
      dragSource = { kind: "primitive", primitive: type };
      const transfer = (event as { dataTransfer?: { setData?: (format: string, value: string) => void; effectAllowed?: string } }).dataTransfer;
      transfer?.setData?.("text/plain", type);
      if (transfer !== undefined) transfer.effectAllowed = "copy";
      root.setAttribute("data-drag", "true");
      hideLine();
      hidePluses();
    });
    chip.addEventListener("dragend", () => endDrag());
    catalog.appendChild(chip);
  }

  const root = overlay;
  const line = h(doc, "div", {
    className: "senify-canvas__dropline",
    data: { state: "hidden" },
  });
  overlay.appendChild(line);
  const plusTop = plusButton("before");
  const plusBottom = plusButton("after");
  const plusInto = plusButton("into");
  overlay.appendChild(plusTop);
  overlay.appendChild(plusBottom);
  overlay.appendChild(plusInto);

  function plusButton(position: InsertPosition): DomElement {
    const button = h(doc, "button", {
      className: "senify-canvas__plus",
      text: "+",
      data: { position },
      attributes: {
        type: "button",
        title: position === "into" ? "Hinein einfügen" : "Einfügen",
        "aria-label": position === "into" ? "Hinein einfügen" : "Einfügen",
      },
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation?.();
      if (hoverNodeId === null) return;
      insertAt(hoverNodeId, options.catalogValue(), position);
      hidePluses();
    });
    return button;
  }

  function hideLine(): void {
    line.setAttribute("data-state", "hidden");
  }

  function hidePluses(): void {
    plusTop.setAttribute("data-state", "hidden");
    plusBottom.setAttribute("data-state", "hidden");
    plusInto.setAttribute("data-state", "hidden");
  }

  // The content origin of the stage: the wrap offsets are stage-content
  // coordinates, the node rect is frame-document CSS pixels.
  function showLine(
    frame: DropFrame,
    nodeId: string,
    position: DropPosition,
    rejected: boolean,
  ): void {
    const element = nodeElement(frame, nodeId);
    if (element === null) {
      hideLine();
      return;
    }
    const rect = rectOf(element);
    const wrapRect = rectOf(frame.wrap);
    const stageRect = rectOf(stage);
    const originLeft = wrapRect.left - stageRect.left + stage.scrollLeft;
    const originTop = wrapRect.top - stageRect.top + stage.scrollTop;
    const left = originLeft + rect.left * frame.scale;
    const top = originTop + rect.top * frame.scale;
    const width = Math.max(8, rect.width * frame.scale);
    const height = Math.max(1, rect.height * frame.scale);
    line.style.left = `${left}px`;
    line.style.width = `${width}px`;
    if (position === "before") line.style.top = `${top}px`;
    else if (position === "after") line.style.top = `${top + height}px`;
    else line.style.top = `${top + Math.max(2, height / 2)}px`;
    line.setAttribute("data-position", position);
    line.setAttribute("data-state", rejected ? "rejected" : "valid");
  }

  function showPluses(frame: DropFrame, nodeId: string): void {
    const element = nodeElement(frame, nodeId);
    if (element === null) {
      hidePluses();
      return;
    }
    const rect = rectOf(element);
    const wrapRect = rectOf(frame.wrap);
    const stageRect = rectOf(stage);
    const originLeft = wrapRect.left - stageRect.left + stage.scrollLeft;
    const originTop = wrapRect.top - stageRect.top + stage.scrollTop;
    const left = originLeft + rect.left * frame.scale;
    const top = originTop + rect.top * frame.scale;
    const width = Math.max(8, rect.width * frame.scale);
    const height = Math.max(1, rect.height * frame.scale);
    const center = left + width / 2;
    const place = (button: DomElement, x: number, y: number): void => {
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      button.setAttribute("data-state", "visible");
    };
    place(plusTop, center, top - 9);
    place(plusBottom, center, top + height - 9);
    if (isContainer(store.document, nodeId)) place(plusInto, center, top + height / 2 - 9);
    else plusInto.setAttribute("data-state", "hidden");
  }

  function endDrag(): void {
    dragSource = null;
    root.setAttribute("data-drag", "false");
    hideLine();
    hidePluses();
  }

  function applyResolution(resolution: DropResolution, source: DropSource): boolean {
    if (resolution.kind === "reject") {
      options.onMessage(resolution.reason);
      return false;
    }
    if (resolution.kind === "none") return false;
    if (resolution.kind === "insert") {
      if (source.kind !== "primitive") return false;
      store.apply(
        {
          op: "insertNode",
          parent: resolution.parent,
          index: resolution.index,
          node: { primitive: source.primitive, props: {} as Record<string, PropValue> },
        },
        { label: "Baustein einfügen" },
      );
      options.onMessage(null);
      return true;
    }
    if (source.kind !== "node") return false;
    store.apply(
      { op: "moveNode", id: source.id, target: resolution.target, index: resolution.index },
      { label: "Ebene verschieben", coalesceKey: dragCoalesceKey(source.id) },
    );
    options.onMessage(null);
    return true;
  }

  // ------------------------------------------------------------ frame events

  function frameFor(doc2: DomDocument): DropFrame | undefined {
    return options.frames().find((frame) => frame.doc === doc2);
  }

  function handlePointerMove(event: DomEvent): void {
    if (dragSource === null) return;
    const frame = frameFor(frameOfEvent(event));
    if (frame === undefined) return;
    const nodeId = hitNodeId(event.target);
    if (nodeId === null) {
      hideLine();
      return;
    }
    const container = isContainer(store.document, nodeId);
    const element = nodeElement(frame, nodeId);
    if (element === null) return;
    const rect = rectOf(element);
    const position = dropPositionFor(rect, event.clientY ?? 0, container);
    const resolution = resolveDrop(store.document, dragSource, nodeId, position);
    showLine(frame, nodeId, position, resolution.kind === "reject");
  }

  function frameOfEvent(event: DomEvent): DomDocument {
    const target = event.target as DomElement | null;
    return target?.ownerDocument ?? doc;
  }

  function attachFrame(frame: DropFrame): void {
    const target = frame.doc;
    target.addEventListener("dragover", (event) => {
      if (dragSource === null) return;
      event.preventDefault?.();
      handlePointerMove(event);
    });
    target.addEventListener("drop", (event) => {
      if (dragSource === null) return;
      event.preventDefault?.();
      const nodeId = hitNodeId(event.target);
      if (nodeId !== null) {
        const element = nodeElement(frame, nodeId);
        const rect = element === null ? { top: 0, height: 0 } : rectOf(element);
        const position = dropPositionFor(
          rect,
          event.clientY ?? 0,
          isContainer(store.document, nodeId),
        );
        const source = dragSource;
        const resolution = resolveDrop(store.document, source, nodeId, position);
        applyResolution(resolution, source);
      }
      endDrag();
    });
    target.addEventListener("dragleave", () => {
      if (dragSource !== null) hideLine();
    });
    // Node reorder: a pointer drag inside the frame (native DnD on rendered
    // nodes would fight the selection click).
    let pointerDrag: { id: string; x: number; y: number; moved: boolean } | null = null;
    target.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const nodeId = hitNodeId(event.target);
      if (nodeId === null) return;
      pointerDrag = { id: nodeId, x: event.clientX ?? 0, y: event.clientY ?? 0, moved: false };
    });
    target.addEventListener("mousemove", (event) => {
      if (pointerDrag !== null) {
        const dx = (event.clientX ?? 0) - pointerDrag.x;
        const dy = (event.clientY ?? 0) - pointerDrag.y;
        if (!pointerDrag.moved && Math.hypot(dx, dy) > 4) {
          pointerDrag.moved = true;
          dragSource = { kind: "node", id: pointerDrag.id };
          root.setAttribute("data-drag", "true");
          hidePluses();
        }
        if (pointerDrag.moved) handlePointerMove(event);
        return;
      }
      if (dragSource !== null) return;
      const nodeId = hitNodeId(event.target);
      if (nodeId === null) return;
      hoverNodeId = nodeId;
      showPluses(frame, nodeId);
    });
    target.addEventListener("mouseup", (event) => {
      if (pointerDrag !== null && pointerDrag.moved && dragSource !== null) {
        const nodeId = hitNodeId(event.target);
        if (nodeId !== null) {
          const element = nodeElement(frame, nodeId);
          const rect = element === null ? { top: 0, height: 0 } : rectOf(element);
          const position = dropPositionFor(
            rect,
            event.clientY ?? 0,
            isContainer(store.document, nodeId),
          );
          const source = dragSource;
          applyResolution(resolveDrop(store.document, source, nodeId, position), source);
        }
      }
      pointerDrag = null;
      if (dragSource !== null) endDrag();
    });
  }

  return {
    catalog,
    attachFrame,
    insertAt,
    dragging: () => dragSource !== null,
    destroy: () => {
      line.remove();
      plusTop.remove();
      plusBottom.remove();
      plusInto.remove();
      catalog.remove();
    },
  };
}
