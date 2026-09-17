// The canvas of the editor rebuild (Phase 0, fourth slice).
//
// One editable frame per device state, the node tree rendered by the existing
// React renderer, the compiler rules injected per frame and the selection kept
// in the store. This module is the DOM shell; the arithmetic and the decisions
// live in `device.ts`, `rules.ts`, `adapter.ts`, `insert.ts` and `selection.ts`
// and are unit-tested without a browser.
//
// Nothing here is a second render path: `renderer.mount` is the very
// `FrameRenderer` the program shell injects (`createReactRenderer`), and the
// stylesheet is the single compiler output. The canvas only adds the frame
// chrome (markers, handles, labels) — unlayered, so it beats the authored
// layer, exactly as the cascade decision (O1) prescribes.

import type { Registry } from "@senify/section-sdk";
import {
  getPrimitive,
  primitiveTypes,
  themeTokenResolver,
  type StateName,
  type TokenResolver,
} from "@senify/widget-engine";
import type { Theme } from "@senify/tokens";
import { createReactRenderer } from "../react-renderer.tsx";
import type { FrameDescriptor } from "../frames.ts";
import type { FrameBreakpoint } from "../types.ts";
import type { FrameRenderer } from "../mount.ts";
import { getDocument, type DomDocument, type DomElement, type DomEvent } from "../dom.ts";
import { ensureCanvasStyles } from "./styles.ts";
import { editorFontFaceCss } from "../ui/fonts.ts";
import { applyEditorSkin, EDITOR_SKIN_DEFAULT } from "../ui/skin.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { EditorStore } from "../state/store.ts";
import { canvasFrames, fitZoom, ZOOM_MAX, ZOOM_MIN } from "./device.ts";
import { canvasFrameRules } from "./rules.ts";
import { canvasNodeTree } from "./adapter.ts";
import { insertPlan, insertMutation, type InsertPosition } from "./insert.ts";
import { resolveClick, selectionLabel } from "./selection.ts";

export type CanvasOptions = {
  store: EditorStore;
  registry: Registry;
  renderer?: FrameRenderer;
  // Extra stylesheets every frame loads (theme tokens, section styles).
  frameStyles?: string[];
  theme?: Theme;
  resolveToken?: TokenResolver;
  zoom?: number;
  previewState?: StateName | null;
  onMessage?: (message: string | null) => void;
};

export type CanvasState = {
  zoom: number;
  previewState: StateName | null;
  selected: string | null;
};

export type CanvasInstance = {
  element: DomElement;
  refresh(): void;
  setZoom(zoom: number): void;
  fit(): void;
  setPreviewState(state: StateName | null): void;
  select(id: string | null): void;
  insert(primitive: string, position: InsertPosition): boolean;
  undo(): boolean;
  redo(): boolean;
  state(): CanvasState;
  destroy(): void;
};

type MountedFrame = {
  device: FrameBreakpoint;
  frame: FrameDescriptor;
  wrap: DomElement;
  iframe: DomElement;
  doc: DomDocument;
  body: DomElement | null;
  rules: DomElement | null;
  label: DomElement | null;
  markers: DomElement[];
};

const PREVIEW_STATES: readonly (StateName | "none")[] = [
  "none",
  "hover",
  "focus",
  "active",
];

const FRAME_BASE_CSS = `
html, body { margin: 0; padding: 0; }
body { font: 14px/1.5 var(--font-body, system-ui, sans-serif); background: #ffffff; }
`;

// Bundled @font-face rules (Inter/Inter Display for the tool, Sora for content)
// so the frame renders the theme's families from the local files, no network.
function frameDoc(styles: readonly string[]): string {
  const links = styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>${editorFontFaceCss()}\n${FRAME_BASE_CSS}</style></head><body class="senify-canvas-body"></body></html>`;
}

function create(
  doc: DomDocument,
  tag: string,
  className?: string,
  attrs: Record<string, string> = {},
): DomElement {
  const element = doc.createElement(tag);
  if (className !== undefined) element.className = className;
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, value);
  }
  return element;
}

function docScroll(doc: DomDocument): { x: number; y: number } {
  const root = (doc as unknown as {
    documentElement?: { scrollLeft: number; scrollTop: number };
  }).documentElement;
  return { x: root?.scrollLeft ?? 0, y: root?.scrollTop ?? 0 };
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

export function mountCanvas(host: DomElement, options: CanvasOptions): CanvasInstance {
  const hostDoc = host.ownerDocument ?? getDocument();
  if (hostDoc === null) {
    throw new Error("mountCanvas needs a DOM (document) — run it in the browser");
  }
  const doc: DomDocument = hostDoc;
  const store = options.store;
  const renderer = options.renderer ?? createReactRenderer();
  const resolveToken =
    options.resolveToken ??
    (options.theme === undefined ? undefined : themeTokenResolver(options.theme));
  ensureCanvasStyles(doc);

  let zoom = options.zoom ?? 0.5;
  let previewState: StateName | null = options.previewState ?? null;
  const mounted: MountedFrame[] = [];

  const root = create(doc, "div", "senify-canvas", { "data-zoom": String(zoom) });
  // The canvas carries the same marker and the same skin name as the editor, so
  // it reads the very same `--ed-*` tokens (`CANVAS_TOKEN_CSS`, scoped to the
  // marker) and the canvas skin (`EDITOR_CANVAS_SKIN_STYLES`) paints it from
  // them. One source, no second palette — see `ui/skin.ts`.
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  applyEditorSkin(root, EDITOR_SKIN_DEFAULT);
  const topbar = create(doc, "div", "senify-canvas__topbar");
  const stage = create(doc, "div", "senify-canvas__stage");
  const status = create(doc, "span", "senify-canvas__status", { "data-role": "status" });
  root.appendChild(topbar);
  root.appendChild(stage);
  host.appendChild(root);

  function message(value: string | null): void {
    status.textContent = value ?? "";
    options.onMessage?.(value);
  }

  function selectedId(): string | null {
    return store.selection.focus ?? store.selection.selected[0] ?? null;
  }

  // ---------------------------------------------------------------- top bar
  const stateButtons: DomElement[] = [];
  const stateGroup = create(doc, "div", "senify-canvas__group", { "data-role": "states" });
  for (const value of PREVIEW_STATES) {
    const button = create(doc, "button", "senify-canvas__button", {
      type: "button",
      "data-state": value,
    });
    button.textContent = value === "none" ? "Aus" : value;
    button.addEventListener("click", () =>
      setPreviewState(value === "none" ? null : value),
    );
    stateButtons.push(button);
    stateGroup.appendChild(button);
  }

  const catalog = create(doc, "select", "senify-canvas__select", { "data-role": "catalog" });
  for (const type of primitiveTypes()) {
    if (type === "root") continue;
    const option = create(doc, "option", undefined, { value: type });
    option.textContent = getPrimitive(type)?.name ?? type;
    catalog.appendChild(option);
  }
  if (catalog.value === undefined || catalog.value === "") catalog.value = "divider";

  const insertAfter = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "insert-after",
  });
  insertAfter.textContent = "Danach einfügen";
  insertAfter.addEventListener("click", () => {
    if (typeof catalog.value === "string") insert(catalog.value, "after");
  });
  const insertInto = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "insert-into",
  });
  insertInto.textContent = "Hinein einfügen";
  insertInto.addEventListener("click", () => {
    if (typeof catalog.value === "string") insert(catalog.value, "into");
  });

  const undoButton = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "undo",
  });
  undoButton.textContent = "Rückgängig";
  undoButton.addEventListener("click", () => {
    if (store.undo()) message(null);
  });
  const redoButton = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "redo",
  });
  redoButton.textContent = "Wiederholen";
  redoButton.addEventListener("click", () => {
    if (store.redo()) message(null);
  });

  const zoomOut = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "zoom-out",
    "aria-label": "Herauszoomen",
  });
  const zoomOutIcon = create(doc, "span", "ic ic--zoomout ic--14", { "aria-hidden": "true" });
  zoomOut.appendChild(zoomOutIcon);
  zoomOut.addEventListener("click", () => setZoom(zoom - 0.1));
  const zoomIn = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "zoom-in",
    "aria-label": "Hineinzoomen",
  });
  const zoomInIcon = create(doc, "span", "ic ic--zoomin ic--14", { "aria-hidden": "true" });
  zoomIn.appendChild(zoomInIcon);
  zoomIn.addEventListener("click", () => setZoom(zoom + 0.1));
  const zoomFit = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "zoom-fit",
  });
  zoomFit.textContent = "Einpassen";
  zoomFit.addEventListener("click", () => fit());
  const zoomLabel = create(doc, "span", "senify-canvas__zoom-label", { "data-role": "zoom" });

  const insertGroup = create(doc, "div", "senify-canvas__group");
  insertGroup.appendChild(catalog);
  insertGroup.appendChild(insertAfter);
  insertGroup.appendChild(insertInto);
  const historyGroup = create(doc, "div", "senify-canvas__group");
  historyGroup.appendChild(undoButton);
  historyGroup.appendChild(redoButton);
  const zoomGroup = create(doc, "div", "senify-canvas__group");
  zoomGroup.appendChild(zoomOut);
  zoomGroup.appendChild(zoomLabel);
  zoomGroup.appendChild(zoomIn);
  zoomGroup.appendChild(zoomFit);

  topbar.appendChild(stateGroup);
  topbar.appendChild(insertGroup);
  topbar.appendChild(historyGroup);
  topbar.appendChild(zoomGroup);
  topbar.appendChild(status);

  // ----------------------------------------------------------------- frames
  function applyFrameLayout(): void {
    let left = 0;
    for (const entry of mounted) {
      const frame = canvasFrames(zoom).find((spec) => spec.device === entry.device);
      if (frame === undefined) continue;
      entry.wrap.style.left = `${left}px`;
      entry.wrap.style.top = "0px";
      entry.wrap.style.width = `${frame.width}px`;
      entry.wrap.style.height = `${frame.height}px`;
      entry.wrap.style.transform = `scale(${frame.scale})`;
      entry.iframe.style.width = `${frame.width}px`;
      entry.iframe.style.height = `${frame.height}px`;
      entry.frame = {
        breakpoint: entry.device,
        label: frame.label,
        mode: "design",
        width: frame.width,
        height: frame.height,
        scale: frame.scale,
        mediaMaxWidth: frame.mediaMaxWidth,
        editable: true,
      };
      left += frame.width * frame.scale + 32;
    }
    root.setAttribute("data-zoom", String(zoom));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function ensureMarkers(entry: MountedFrame): void {
    if (entry.body === null) return;
    while (entry.markers.length < 5) {
      const kind = entry.markers.length === 0 ? "selection" : "handle";
      const marker = create(entry.doc, "div", "senify-canvas__marker", { "data-kind": kind });
      marker.style.display = "none";
      entry.body.appendChild(marker);
      entry.markers.push(marker);
    }
    if (entry.label === null) {
      const label = create(entry.doc, "div", "senify-canvas__label");
      label.style.display = "none";
      entry.body.appendChild(label);
      entry.label = label;
    }
  }

  function clearMarkers(entry: MountedFrame): void {
    for (const marker of entry.markers) marker.style.display = "none";
    if (entry.label !== null) entry.label.style.display = "none";
  }

  function paintSelection(entry: MountedFrame, id: string | null): void {
    ensureMarkers(entry);
    const [ring] = entry.markers;
    const handles = entry.markers.slice(1, 5);
    if (id === null || ring === undefined || entry.body === null) {
      clearMarkers(entry);
      return;
    }
    const target = entry.body.querySelector(`[data-node-id="${id}"]`);
    if (target === null) {
      clearMarkers(entry);
      return;
    }
    const rect = rectOf(target);
    const scroll = docScroll(entry.doc);
    const left = rect.left + scroll.x;
    const top = rect.top + scroll.y;
    ring.style.display = "block";
    ring.style.left = `${left}px`;
    ring.style.top = `${top}px`;
    ring.style.width = `${rect.width}px`;
    ring.style.height = `${rect.height}px`;
    const corners = [
      { x: left - 4, y: top - 4 },
      { x: left + rect.width - 4, y: top - 4 },
      { x: left - 4, y: top + rect.height - 4 },
      { x: left + rect.width - 4, y: top + rect.height - 4 },
    ];
    handles.forEach((handle, index) => {
      const corner = corners[index];
      if (corner === undefined) return;
      handle.style.display = "block";
      handle.style.left = `${corner.x}px`;
      handle.style.top = `${corner.y}px`;
    });
    if (entry.label !== null) {
      entry.label.style.display = "block";
      entry.label.style.left = `${left}px`;
      entry.label.style.top = `${Math.max(0, top - 18)}px`;
      entry.label.textContent = markerLabel(id);
    }
  }

  function markerLabel(id: string): string {
    const node = store.document.nodes[id];
    const fromStore = selectionLabel(store.document, store.selection);
    if (node === undefined) return id;
    return fromStore !== null && store.selection.selected.includes(id)
      ? fromStore
      : `${node.primitive} · ${id}`;
  }

  function markSelectedNode(entry: MountedFrame, id: string | null): void {
    if (entry.body === null) return;
    for (const element of entry.body.querySelectorAll("[data-selected]")) {
      element.removeAttribute("data-selected");
    }
    if (id === null) return;
    entry.body.querySelector(`[data-node-id="${id}"]`)?.setAttribute("data-selected", "true");
  }

  function updateRules(entry: MountedFrame): void {
    if (entry.body === null) return;
    const rules = canvasFrameRules(store.document, {
      forcedState: previewState,
      ...(resolveToken === undefined ? {} : { resolveToken }),
    });
    if (entry.rules === null) {
      const style = create(entry.doc, "style", undefined, { "data-senify-canvas-rules": "" });
      (entry.doc.head ?? entry.body).appendChild(style);
      entry.rules = style;
    }
    entry.rules.textContent = rules.css;
  }

  function setForcedState(entry: MountedFrame): void {
    const rootElement = (entry.doc as unknown as { documentElement?: DomElement }).documentElement;
    if (rootElement === undefined) return;
    if (previewState === null) rootElement.removeAttribute("data-force-state");
    else rootElement.setAttribute("data-force-state", previewState);
  }

  function applyResolution(resolution: ReturnType<typeof resolveClick>): void {
    if (resolution.kind === "clear") {
      store.clearSelection();
      message(null);
    } else {
      store.select(resolution.id);
      message(resolution.kind === "drill" ? "Ebene tiefer gewählt" : null);
    }
  }

  function bindFrame(entry: MountedFrame): void {
    entry.doc.addEventListener("click", (event: DomEvent) => {
      applyResolution(resolveClick(store.document, hitNodeId(event.target)));
    });
    entry.doc.addEventListener("dblclick", (event: DomEvent) => {
      applyResolution(resolveClick(store.document, hitNodeId(event.target), { double: true }));
    });
  }

  function mountFrame(device: FrameBreakpoint): void {
    const frame = canvasFrames(zoom).find((spec) => spec.device === device);
    if (frame === undefined) return;
    const wrap = create(doc, "div", "senify-canvas__frame", { "data-device": device });
    const iframe = create(doc, "iframe", "senify-canvas__iframe", { title: frame.label });
    wrap.appendChild(iframe);
    stage.appendChild(wrap);
    const entry: MountedFrame = {
      device,
      frame: {
        breakpoint: device,
        label: frame.label,
        mode: "design",
        width: frame.width,
        height: frame.height,
        scale: frame.scale,
        mediaMaxWidth: frame.mediaMaxWidth,
        editable: true,
      },
      wrap,
      iframe,
      doc,
      body: null,
      rules: null,
      label: null,
      markers: [],
    };
    mounted.push(entry);
    iframe.addEventListener("load", () => {
      const scoped = iframe as unknown as {
        contentDocument?: DomDocument | null;
        contentWindow?: { document: DomDocument } | null;
      };
      const resolved = scoped.contentDocument ?? scoped.contentWindow?.document ?? null;
      if (resolved === null) return;
      entry.doc = resolved;
      entry.body = resolved.body;
      entry.rules = null;
      entry.label = null;
      entry.markers = [];
      bindFrame(entry);
      refresh();
    });
    iframe.setAttribute("srcdoc", frameDoc(options.frameStyles ?? []));
    applyFrameLayout();
  }

  function updateChrome(): void {
    const selected = selectedId();
    root.setAttribute("data-selected", selected ?? "");
    root.setAttribute("data-preview-state", previewState ?? "none");
    for (const button of stateButtons) {
      const value = button.getAttribute("data-state");
      button.setAttribute(
        "data-active",
        String((value === "none" ? null : value) === previewState),
      );
    }
    for (const entry of mounted) {
      markSelectedNode(entry, selected);
      paintSelection(entry, selected);
    }
  }

  function refresh(): void {
    const tree = canvasNodeTree(store.document);
    for (const entry of mounted) {
      if (entry.body === null) continue;
      renderer.mount(entry.frame, entry.body, {
        tree,
        registry: options.registry,
        breakpoint: entry.device,
      });
      updateRules(entry);
      setForcedState(entry);
    }
    updateChrome();
  }

  function setZoom(value: number): void {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000));
    applyFrameLayout();
    refresh();
  }

  function fit(): void {
    const width = rectOf(stage).width || rectOf(root).width;
    if (width > 0) setZoom(fitZoom(width, { margin: 24 }));
    else applyFrameLayout();
  }

  function setPreviewState(value: StateName | null): void {
    previewState = value;
    for (const entry of mounted) {
      if (entry.body === null) continue;
      setForcedState(entry);
      updateRules(entry);
    }
    updateChrome();
  }

  function select(id: string | null): void {
    if (id === null) store.clearSelection();
    else store.select(id);
  }

  function insert(primitive: string, position: InsertPosition): boolean {
    const target = selectedId();
    if (target === null) {
      message("Wähle zuerst einen Knoten im Canvas.");
      return false;
    }
    try {
      const plan = insertPlan(store.document, target, primitive, position);
      store.apply(insertMutation(plan, primitive));
      message(null);
      return true;
    } catch (error) {
      message(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  const unsubscribe = store.subscribe(() => refresh());

  const onResize = (): void => {
    const width = rectOf(stage).width;
    const needed = canvasFrames(zoom).reduce(
      (sum, spec) => sum + spec.width * spec.scale,
      0,
    );
    if (width > 0 && needed > width) setZoom(fitZoom(width, { margin: 24 }));
  };
  const global = globalThis as {
    addEventListener?: (type: string, handler: () => void) => void;
    removeEventListener?: (type: string, handler: () => void) => void;
  };
  global.addEventListener?.("resize", onResize);

  for (const device of ["desktop", "tablet", "mobile"] as const) mountFrame(device);
  applyFrameLayout();
  updateChrome();

  return {
    element: root,
    refresh,
    setZoom,
    fit,
    setPreviewState,
    select,
    insert,
    undo: () => store.undo(),
    redo: () => store.redo(),
    state: () => ({ zoom, previewState, selected: selectedId() }),
    destroy(): void {
      unsubscribe();
      global.removeEventListener?.("resize", onResize);
      renderer.destroy();
      root.remove();
    },
  };
}
