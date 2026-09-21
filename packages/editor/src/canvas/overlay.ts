// The marker overlay (ticket 16): selection and hover chrome in a portal over
// the stage, never inside the content frame.
//
// The frame stays a pure document — the mark "0 `--ed-*` in the iframe" keeps
// holding, because the markers are children of the editor overlay
// (`.senify-canvas__overlay`, `pointer-events: none`, `role="presentation"`).
// One layer per frame clips a ring to its sheet, the way it did inside the
// frame; the double edge (outer `--ed-selection-edge`, inner
// `--ed-signal-select`) stays visible on light and dark content (`ui-plan.md`
// §8).
//
// Geometry follows `dnd-dom.ts`: the wrap rect is stage-content coordinates,
// the node rect is frame-viewport CSS pixels, the frame scale connects them.
// Measurements are throttled (`ui-plan.md` §8: 20 ms); zoom and selection
// flush immediately.

import type { DomDocument, DomElement, DomEvent } from "../dom.ts";
import type { EditorMode } from "../types.ts";

export type OverlayRect = { left: number; top: number; width: number; height: number };
export type OverlayViewport = { width: number; height: number };

export const OVERLAY_THROTTLE_MS = 20;
export const OVERLAY_LABEL_HEIGHT = 18;
export const OVERLAY_HANDLE_HIT = 24;
// The live-follow highlight (ticket 05): a remote change flashes its nodes.
export const OVERLAY_FLASH_MS = 1200;

// Frame-viewport rect -> stage-content rect at the frame scale.
export function overlayRect(
  rect: OverlayRect,
  origin: { left: number; top: number },
  scale: number,
): OverlayRect {
  return {
    left: origin.left + rect.left * scale,
    top: origin.top + rect.top * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

// Does any part of the rect fall into the frame's visible viewport? Nodes
// scrolled out of the sheet draw no ring (the frame layer would clip them
// anyway, but the hit test below needs the viewport check too).
export function intersectsViewport(rect: OverlayRect, viewport: OverlayViewport): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  return (
    rect.left < viewport.width &&
    rect.top < viewport.height &&
    rect.left + rect.width > 0 &&
    rect.top + rect.height > 0
  );
}

// The plan rule: a target behind another element draws no ring, the selection
// shows in the navigator instead. A hit inside the target is not occlusion —
// only a foreign node is.
export function isOccluded(
  targetId: string,
  hitId: string | null,
  hitInsideTarget: boolean,
): boolean {
  if (hitId === null || hitInsideTarget) return false;
  return hitId !== targetId;
}

// The Plaetzchen sits above the rect; at the sheet edge it stays inside.
export function badgeTop(rect: OverlayRect, height = OVERLAY_LABEL_HEIGHT): number {
  return rect.top >= height + 2 ? rect.top - height : rect.top;
}

export type OverlayFrame = {
  device: string;
  doc: DomDocument;
  body: DomElement | null;
  wrap: DomElement;
  scale: number;
  mode: EditorMode;
  viewport: OverlayViewport;
};

export type MarkerOverlayOptions = {
  doc: DomDocument;
  stage: DomElement;
  overlay: DomElement;
  frames: () => OverlayFrame[];
  label: (id: string) => string;
  // Alt+hover walks one step up the tree (the inspect ladder, ticket 03
  // point 7): the hover ring previews the parent the Alt+click would select.
  parent?: (id: string) => string | null;
};

export type MarkerOverlay = {
  attachFrame(frame: OverlayFrame): void;
  setSelection(id: string | null): void;
  setHover(id: string | null): void;
  // The live-follow highlight: draws a ring over each node for a moment.
  flash(ids: string[], durationMs?: number): void;
  flush(): void;
  // Read/write split (ticket 05, point 7): the store change writes the DOM in
  // this task; the marker geometry is measured in the next frame, so the
  // insert path never forces a synchronous layout.
  flushNextFrame(): void;
  schedule(): void;
  destroy(): void;
};

type Layer = {
  root: DomElement;
  hoverRing: DomElement;
  selectRing: DomElement;
  label: DomElement;
  size: DomElement;
  handles: DomElement[];
  // A pool of flash rings, grown on demand (one per flashed node).
  flash: DomElement[];
};

function h(doc: DomDocument, tag: string, className: string): DomElement {
  const element = doc.createElement(tag);
  element.className = className;
  return element;
}

function rectOf(element: DomElement): OverlayRect {
  return element.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
}

function hitNodeId(target: unknown): string | null {
  const element = target as DomElement | null;
  if (element === null || element === undefined || typeof element.closest !== "function") {
    return null;
  }
  return element.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
}

function hide(element: DomElement): void {
  element.style.display = "none";
}

function place(element: DomElement, rect: OverlayRect): void {
  element.style.display = "block";
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${Math.max(1, rect.width)}px`;
  element.style.height = `${Math.max(1, rect.height)}px`;
}

export function createMarkerOverlay(options: MarkerOverlayOptions): MarkerOverlay {
  const { doc, stage, overlay } = options;
  const layers = new Map<DomDocument, Layer>();
  let selection: string | null = null;
  let hover: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flashIds: string[] = [];
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let frameHandle: number | null = null;
  let frameTimer: ReturnType<typeof setTimeout> | null = null;

  function ensureLayer(frameDoc: DomDocument): Layer {
    const existing = layers.get(frameDoc);
    if (existing !== undefined) return existing;
    const root = h(doc, "div", "senify-canvas__marker-layer");
    root.setAttribute("role", "presentation");
    root.setAttribute("aria-hidden", "true");
    const hoverRing = h(doc, "div", "senify-canvas__hover-ring");
    const selectRing = h(doc, "div", "senify-canvas__select-ring");
    const label = h(doc, "div", "senify-canvas__select-label");
    const size = h(doc, "div", "senify-canvas__select-size");
    const handles = [0, 1, 2, 3].map(() => {
      const handle = h(doc, "div", "senify-canvas__handle");
      const dot = h(doc, "span", "senify-canvas__handle-dot");
      handle.appendChild(dot);
      return handle;
    });
    for (const element of [hoverRing, selectRing, label, size, ...handles]) {
      hide(element);
      root.appendChild(element);
    }
    overlay.appendChild(root);
    const layer: Layer = { root, hoverRing, selectRing, label, size, handles, flash: [] };
    layers.set(frameDoc, layer);
    return layer;
  }

  function ensureFlashRings(layer: Layer, count: number): DomElement[] {
    while (layer.flash.length < count) {
      const ring = h(doc, "div", "senify-canvas__flash-ring");
      hide(ring);
      layer.root.appendChild(ring);
      layer.flash.push(ring);
    }
    return layer.flash;
  }

  function hideNode(layer: Layer): void {
    hide(layer.hoverRing);
    hide(layer.selectRing);
    hide(layer.label);
    hide(layer.size);
    for (const handle of layer.handles) hide(handle);
  }

  // The occlusion probe: the hit test at the centre must land on the target or
  // inside it; a foreign node covering it suppresses the ring.
  function covered(
    frame: OverlayFrame,
    target: DomElement,
    targetId: string,
    rect: OverlayRect,
  ): boolean {
    const source = frame.doc as unknown as {
      elementFromPoint?: (x: number, y: number) => unknown;
    };
    if (typeof source.elementFromPoint !== "function") return false;
    const hit = source.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    ) as DomElement | null;
    if (hit === null || hit === undefined || hit === target) return false;
    const inside = typeof target.contains === "function" && target.contains(hit);
    return isOccluded(targetId, hitNodeId(hit), inside);
  }

  function nodeRect(
    frame: OverlayFrame,
    id: string,
  ): { element: DomElement; rect: OverlayRect } | null {
    const element = frame.body?.querySelector(`[data-node-id="${id}"]`) ?? null;
    if (element === null) return null;
    const rect = rectOf(element);
    if (!intersectsViewport(rect, frame.viewport)) return null;
    if (covered(frame, element, id, rect)) return null;
    return { element, rect };
  }

  function paintHover(frame: OverlayFrame, layer: Layer): void {
    const id = hover !== null && hover !== selection ? hover : null;
    if (id === null) {
      hide(layer.hoverRing);
      return;
    }
    const found = nodeRect(frame, id);
    if (found === null) {
      hide(layer.hoverRing);
      return;
    }
    place(layer.hoverRing, overlayRect(found.rect, { left: 0, top: 0 }, frame.scale));
  }

  // The Plaetzchen shows the name of the selection, or of the hovered node
  // while nothing is selected (ui-plan.md §8: "Ueberfahren: Plaetzchen mit
  // Name"; the selection keeps it as the primary target).
  function paintLabel(frame: OverlayFrame, layer: Layer): void {
    const id = selection ?? hover;
    if (id === null) {
      hide(layer.label);
      return;
    }
    const found = nodeRect(frame, id);
    if (found === null) {
      hide(layer.label);
      return;
    }
    const rect = overlayRect(found.rect, { left: 0, top: 0 }, frame.scale);
    layer.label.textContent = options.label(id);
    layer.label.style.display = "block";
    layer.label.style.left = `${rect.left}px`;
    layer.label.style.top = `${badgeTop(rect)}px`;
  }

  function paintSelection(frame: OverlayFrame, layer: Layer): void {
    if (selection === null) {
      hide(layer.selectRing);
      hide(layer.size);
      for (const handle of layer.handles) hide(handle);
      return;
    }
    const found = nodeRect(frame, selection);
    if (found === null) {
      hide(layer.selectRing);
      hide(layer.size);
      for (const handle of layer.handles) hide(handle);
      return;
    }
    const rect = overlayRect(found.rect, { left: 0, top: 0 }, frame.scale);
    place(layer.selectRing, rect);
    layer.size.textContent = `${Math.round(found.rect.width)} × ${Math.round(found.rect.height)}`;
    layer.size.style.display = "block";
    layer.size.style.left = `${rect.left + rect.width}px`;
    layer.size.style.top = `${badgeTop(rect)}px`;
    layer.size.style.transform = "translateX(-100%)";
    const corners = [
      { x: rect.left, y: rect.top },
      { x: rect.left + rect.width, y: rect.top },
      { x: rect.left, y: rect.top + rect.height },
      { x: rect.left + rect.width, y: rect.top + rect.height },
    ];
    layer.handles.forEach((handle, index) => {
      const corner = corners[index];
      if (corner === undefined) return;
      handle.style.display = "block";
      handle.style.left = `${corner.x - OVERLAY_HANDLE_HIT / 2}px`;
      handle.style.top = `${corner.y - OVERLAY_HANDLE_HIT / 2}px`;
    });
  }

  // The live-follow ring (ticket 05): a soft highlight over each changed node,
  // drawn like the selection (same geometry, no handles/label). The rings stay
  // until the flash window ends; a new flash replaces the old ids.
  function paintFlash(frame: OverlayFrame, layer: Layer): void {
    if (flashIds.length === 0) {
      for (const ring of layer.flash) hide(ring);
      return;
    }
    const rects: OverlayRect[] = [];
    for (const id of flashIds) {
      const found = nodeRect(frame, id);
      if (found !== null) {
        rects.push(overlayRect(found.rect, { left: 0, top: 0 }, frame.scale));
      }
    }
    const rings = ensureFlashRings(layer, rects.length);
    rings.forEach((ring, index) => {
      const rect = rects[index];
      if (rect === undefined) {
        hide(ring);
        return;
      }
      place(ring, rect);
    });
  }

  function paint(): void {
    const stageRect = rectOf(stage);
    const frames = options.frames();
    const live = new Set<DomDocument>();
    for (const frame of frames) {
      const layer = ensureLayer(frame.doc);
      live.add(frame.doc);
      const wrapRect = rectOf(frame.wrap);
      const origin = {
        left: wrapRect.left - stageRect.left + stage.scrollLeft,
        top: wrapRect.top - stageRect.top + stage.scrollTop,
      };
      layer.root.style.left = `${origin.left}px`;
      layer.root.style.top = `${origin.top}px`;
      layer.root.style.width = `${Math.max(0, frame.viewport.width * frame.scale)}px`;
      layer.root.style.height = `${Math.max(0, frame.viewport.height * frame.scale)}px`;
      if (frame.mode === "live" || frame.body === null) {
        // Live shows the real page: selection chrome stays out. The live-follow
        // flash still marks the changed node (ticket 05).
        hideNode(layer);
        if (frame.body !== null) paintFlash(frame, layer);
        continue;
      }
      paintHover(frame, layer);
      paintSelection(frame, layer);
      paintFlash(frame, layer);
      paintLabel(frame, layer);
    }
    for (const [frameDoc, layer] of layers) {
      if (live.has(frameDoc)) continue;
      layer.root.remove();
      layers.delete(frameDoc);
    }
  }

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      paint();
    }, OVERLAY_THROTTLE_MS);
  }

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    paint();
  }

  // The next-frame slot: one rAF where available, otherwise the next task.
  function flushNextFrame(): void {
    if (frameHandle !== null || frameTimer !== null) return;
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
      .requestAnimationFrame;
    if (typeof raf === "function") {
      frameHandle = raf(() => {
        frameHandle = null;
        paint();
      });
      return;
    }
    frameTimer = setTimeout(() => {
      frameTimer = null;
      paint();
    }, 0);
  }

  return {
    attachFrame(frame: OverlayFrame): void {
      frame.doc.addEventListener("scroll", () => schedule());
      // The pointer left the frame document entirely (relatedTarget null):
      // a body-level `mouseleave` proved unreliable — a re-render under the
      // pointer can fire it while the pointer never moved.
      frame.doc.addEventListener("mouseout", (event: DomEvent) => {
        const related = (event as { relatedTarget?: unknown }).relatedTarget ?? null;
        if (related !== null) return;
        if (hover === null) return;
        hover = null;
        schedule();
      });
      frame.doc.addEventListener("mousemove", (event: DomEvent) => {
        const hit = hitNodeId(event.target);
        const id =
          event.altKey === true && hit !== null
            ? (options.parent?.(hit) ?? hit)
            : hit;
        if (id === hover) return;
        hover = id;
        schedule();
      });
    },
    setSelection(id: string | null): void {
      if (selection === id) return;
      selection = id;
      flush();
    },
    setHover(id: string | null): void {
      if (hover === id) return;
      hover = id;
      schedule();
    },
    flash(ids: string[], durationMs = OVERLAY_FLASH_MS): void {
      flashIds = [...new Set(ids)];
      if (flashTimer !== null) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        flashIds = [];
        flush();
      }, durationMs);
      // The ring follows in the next frame (read/write split): the store change
      // of this task writes the DOM first.
      flushNextFrame();
      // A remote follow replaces the document and flashes in the same tick; the
      // renderer commits a moment later. One late paint catches the fresh DOM.
      setTimeout(() => {
        if (flashIds.length > 0) flush();
      }, 60);
    },
    flush,
    flushNextFrame,
    schedule,
    destroy(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (flashTimer !== null) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      if (frameHandle !== null) {
        (globalThis as { cancelAnimationFrame?: (handle: number) => void })
          .cancelAnimationFrame?.(frameHandle);
        frameHandle = null;
      }
      if (frameTimer !== null) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
      flashIds = [];
      for (const layer of layers.values()) layer.root.remove();
      layers.clear();
    },
  };
}
