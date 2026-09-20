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

import type { MotionProfile, Registry } from "@senify/section-sdk";
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
import type { EditorMode, FrameBreakpoint } from "../types.ts";
import type { FrameRenderer } from "../mount.ts";
import { getDocument, type DomDocument, type DomElement, type DomEvent } from "../dom.ts";
import { ensureCanvasStyles } from "./styles.ts";
import { editorFontFaceCss } from "../ui/fonts.ts";
import { applyEditorSkin, EDITOR_SKIN_DEFAULT } from "../ui/skin.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { injectMotionRuntime, MOTION_VENDOR_BASE, profileLenis } from "../motion-inject.ts";
import { EditorStore } from "../state/store.ts";
import { canvasFrames, fitZoom, ZOOM_MAX, ZOOM_MIN, type CanvasFrameSpec } from "./device.ts";
import { canvasFrameRules } from "./rules.ts";
import { canvasNodeTree } from "./adapter.ts";
import { type InsertPosition } from "./insert.ts";
import { resolveClick, selectionLabel } from "./selection.ts";
import { createDropController } from "./dnd-dom.ts";

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
  // Design/Live (Ticket 03 Punkt 6): live shows the real page (M4 Stufe 1) —
  // one frame at 100 %, native scroll, the release runtime running.
  mode?: EditorMode;
  // The breakpoint the live frame renders at; in design it is the frame the
  // editor marks as active (dimming, activation).
  breakpoint?: FrameBreakpoint;
  // The site profile decides the Lenis switch of the live runtime (F6/F7).
  profile?: MotionProfile;
  motionVendorBase?: string;
  onMessage?: (message: string | null) => void;
  // Reports view changes (zoom, selection, mode, breakpoint, forced state) so
  // the session can persist them; the canvas itself stays storage-free.
  onState?: (state: CanvasState) => void;
};

export type CanvasState = {
  zoom: number;
  previewState: StateName | null;
  selected: string | null;
  mode: EditorMode;
  breakpoint: FrameBreakpoint;
};

export type CanvasInstance = {
  element: DomElement;
  refresh(): void;
  setZoom(zoom: number): void;
  fit(): void;
  setPreviewState(state: StateName | null): void;
  setMode(mode: EditorMode): void;
  setBreakpoint(device: FrameBreakpoint): void;
  mode(): EditorMode;
  breakpoint(): FrameBreakpoint;
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
  frameLabel: DomElement;
  markers: DomElement[];
};

const PREVIEW_STATES: readonly (StateName | "none")[] = [
  "none",
  "hover",
  "focus",
  "active",
  "disabled",
];

// The frame shell: the browser defaults the editor has to take out (the frame
// scrolls its own document, so the body must not add a margin) and nothing else.
// In particular the frame brings **no** typography of its own: the content must
// look like the release, and on the release the type comes from the page's
// stylesheets (theme tokens + Tailwind's reset). A frame-owned `font: 14px/…`
// would be editor skin on the content and would drift from the release the
// moment either side changes — exactly what the parity gate of Phase 1 measures.
const FRAME_BASE_CSS = `
html, body { margin: 0; padding: 0; }
body { background: #ffffff; }
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
  let mode: EditorMode = options.mode ?? "design";
  let breakpoint: FrameBreakpoint = options.breakpoint ?? "desktop";
  const profile: MotionProfile = options.profile ?? "standard";
  const vendorBase = options.motionVendorBase ?? MOTION_VENDOR_BASE;
  const mounted: MountedFrame[] = [];

  const root = create(doc, "div", "senify-canvas", {
    "data-zoom": String(zoom),
    "data-mode": mode,
  });
  // The canvas carries the same marker and the same skin name as the editor, so
  // it reads the very same `--ed-*` tokens (`CANVAS_TOKEN_CSS`, scoped to the
  // marker) and the canvas skin (`EDITOR_CANVAS_SKIN_STYLES`) paints it from
  // them. One source, no second palette — see `ui/skin.ts`.
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  applyEditorSkin(root, EDITOR_SKIN_DEFAULT);
  const topbar = create(doc, "div", "senify-canvas__topbar");
  const catalogStripHost = create(doc, "div", "senify-canvas__cataloghost");
  const stage = create(doc, "div", "senify-canvas__stage");
  const overlay = create(doc, "div", "senify-canvas__overlay", { "data-role": "overlay" });
  const footer = create(doc, "div", "senify-canvas__footer");
  const status = create(doc, "span", "senify-canvas__status", { "data-role": "status" });
  root.appendChild(topbar);
  root.appendChild(catalogStripHost);
  root.appendChild(stage);
  root.appendChild(footer);
  stage.appendChild(overlay);
  host.appendChild(root);

  // Drag and drop (ticket 12): the catalog strip lives in `catalogStripHost`,
  // the drop line and the plus points in the stage overlay — never in the
  // content frame.
  const drop = createDropController({
    doc,
    stage,
    overlay,
    store,
    frames: () =>
      mounted.map((entry) => ({
        device: entry.device,
        doc: entry.doc,
        body: entry.body,
        wrap: entry.wrap,
        scale: entry.frame.scale,
      })),
    catalogValue: () => (typeof catalog.value === "string" ? catalog.value : ""),
    onMessage: (value) => message(value),
  });
  catalogStripHost.appendChild(drop.catalog);

  function message(value: string | null): void {
    status.textContent = value ?? "";
    options.onMessage?.(value);
  }

  function selectedId(): string | null {
    return store.selection.focus ?? store.selection.selected[0] ?? null;
  }

  function stateOf(): CanvasState {
    return { zoom, previewState, selected: selectedId(), mode, breakpoint };
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
  const zoomLabel = create(doc, "button", "senify-canvas__zoom-label", {
    type: "button",
    "data-role": "zoom",
    "data-action": "zoom-reset",
    title: "Zoom zurücksetzen (Strg+0)",
  });
  zoomLabel.addEventListener("click", () => setZoom(1));

  // Design/Live (Ticket 03 Punkt 6): live shows the real page (M4 Stufe 1).
  const modeGroup = create(doc, "div", "senify-canvas__group", { "data-role": "mode" });
  const modeButtons = new Map<EditorMode, DomElement>();
  for (const value of ["design", "live"] as const) {
    const button = create(doc, "button", "senify-canvas__button", {
      type: "button",
      "data-mode": value,
    });
    button.textContent = value === "design" ? "Design" : "Live";
    button.addEventListener("click", () => setMode(value));
    modeButtons.set(value, button);
    modeGroup.appendChild(button);
  }

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

  topbar.appendChild(modeGroup);
  topbar.appendChild(stateGroup);
  topbar.appendChild(insertGroup);
  topbar.appendChild(historyGroup);
  footer.appendChild(status);
  footer.appendChild(zoomGroup);

  // ----------------------------------------------------------------- frames
  function applyFrameLayout(): void {
    if (mode === "live") {
      const [entry] = mounted;
      if (entry !== undefined) {
        entry.wrap.style.left = "0px";
        entry.wrap.style.top = "0px";
        entry.wrap.style.width = "100%";
        entry.wrap.style.height = "100%";
        entry.wrap.style.transform = "none";
        entry.iframe.style.width = "100%";
        entry.iframe.style.height = "100%";
      }
      root.setAttribute("data-zoom", "1");
      zoomLabel.textContent = "100 %";
      return;
    }
    let left = 0;
    for (const entry of mounted) {
      const frame = canvasFrames(zoom).find((spec) => spec.device === entry.device);
      if (frame === undefined || frame.width === null || frame.height === null) continue;
      entry.wrap.style.left = `${left}px`;
      entry.wrap.style.top = "0px";
      entry.wrap.style.width = `${frame.width}px`;
      entry.wrap.style.height = `${frame.height}px`;
      entry.wrap.style.transform = `scale(${frame.scale})`;
      entry.iframe.style.width = `${frame.width}px`;
      entry.iframe.style.height = `${frame.height}px`;
      entry.frame = { ...entry.frame, scale: frame.scale };
      // The label sits in the scaled sheet; the counter-scale keeps it legible.
      entry.frameLabel.style.transform = `scale(${1 / frame.scale})`;
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
      ...(mode === "live" ? { chrome: false } : {}),
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
    options.onState?.(stateOf());
  }

  function bindFrame(entry: MountedFrame): void {
    entry.doc.addEventListener("click", (event: DomEvent) => {
      // Live shows the real page (M4 Stufe 1): links and islands keep their
      // own behaviour, the editor chrome stays out.
      if (mode === "live") return;
      // A click in a sheet makes it the active breakpoint (dimming cue).
      setBreakpoint(entry.device);
      applyResolution(resolveClick(store.document, hitNodeId(event.target)));
    });
    entry.doc.addEventListener("dblclick", (event: DomEvent) => {
      if (mode === "live") return;
      applyResolution(resolveClick(store.document, hitNodeId(event.target), { double: true }));
    });
  }

  function mountFrame(spec: CanvasFrameSpec): void {
    const device = spec.device;
    const wrap = create(doc, "div", "senify-canvas__frame", {
      "data-device": device,
      "data-mode": spec.mode,
    });
    // The frame label (Ticket 03 Punkt 6): name and width of the sheet. It sits
    // in the scaled sheet, so the counter-scale keeps it legible at any zoom.
    const frameLabel = create(doc, "span", "senify-canvas__frame-label");
    frameLabel.textContent =
      spec.mode === "live" ? "Live" : `${spec.label} · ${spec.width ?? 0} px`;
    frameLabel.style.transform = `scale(${1 / spec.scale})`;
    wrap.appendChild(frameLabel);
    const iframe = create(doc, "iframe", "senify-canvas__iframe", { title: spec.label });
    wrap.appendChild(iframe);
    stage.appendChild(wrap);
    const entry: MountedFrame = {
      device,
      frame: {
        breakpoint: device,
        label: spec.label,
        mode: spec.mode,
        width: spec.width,
        height: spec.height,
        scale: spec.scale,
        mediaMaxWidth: spec.mediaMaxWidth,
        editable: true,
      },
      wrap,
      iframe,
      doc,
      body: null,
      rules: null,
      label: null,
      frameLabel,
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
      drop.attachFrame({
        device: entry.device,
        doc: entry.doc,
        body: entry.body,
        wrap: entry.wrap,
        scale: entry.frame.scale,
      });
      refresh();
    });
    iframe.setAttribute("srcdoc", frameDoc(options.frameStyles ?? []));
  }

  // One frame in live mode (the active breakpoint, real size), three sheets in
  // design. Switching rebuilds the frames: the live frame starts from the
  // baseline state, and the design frames drop any runtime the live mode wrote.
  function rebuildFrames(): void {
    for (const entry of mounted) entry.wrap.remove();
    mounted.length = 0;
    for (const spec of canvasFrames(zoom, { mode, breakpoint })) mountFrame(spec);
    applyFrameLayout();
    updateChrome();
  }

  function updateChrome(): void {
    const selected = selectedId();
    root.setAttribute("data-mode", mode);
    stage.setAttribute("data-mode", mode);
    // Live shows the real page: no selection ring, no handles, no label.
    root.setAttribute("data-selected", mode === "design" ? selected ?? "" : "");
    root.setAttribute("data-preview-state", previewState ?? "none");
    for (const button of stateButtons) {
      const value = button.getAttribute("data-state");
      button.setAttribute(
        "data-active",
        String((value === "none" ? null : value) === previewState),
      );
    }
    for (const [value, button] of modeButtons) {
      button.setAttribute("data-active", String(value === mode));
    }
    // Zoom and forced states belong to the design mode; live is 100 % by
    // definition and shows the real page without editor chrome.
    const designOnly = [...stateButtons, zoomOut, zoomIn, zoomFit, zoomLabel];
    for (const button of designOnly) {
      if (mode === "design") button.removeAttribute("disabled");
      else button.setAttribute("disabled", "disabled");
    }
    for (const entry of mounted) {
      const active = entry.device === breakpoint;
      entry.wrap.setAttribute("data-active", String(active));
      if (active) entry.wrap.removeAttribute("title");
      else entry.wrap.setAttribute("title", "Zum Bearbeiten aktivieren");
      if (mode === "design") {
        markSelectedNode(entry, selected);
        paintSelection(entry, selected);
      } else {
        markSelectedNode(entry, null);
        clearMarkers(entry);
      }
    }
  }

  // Live mode runs the release runtime (M4 Stufe 1): the same contract the bake
  // writes, Lenis following the site profile. The module's guard keeps a
  // refresh from stacking a second runtime next to the first.
  function injectLiveMotion(entry: MountedFrame): void {
    if (entry.body === null) return;
    injectMotionRuntime({
      doc: entry.doc,
      body: entry.body,
      tree: canvasNodeTree(store.document),
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      profile,
      lenis: profileLenis(profile),
      vendorBase,
      onMessage: (value) => message(value),
    });
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
      if (mode === "live") injectLiveMotion(entry);
    }
    updateChrome();
  }

  function setZoom(value: number): void {
    if (mode === "live") return;
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000));
    applyFrameLayout();
    refresh();
    options.onState?.(stateOf());
  }

  function setMode(next: EditorMode): void {
    if (mode === next) return;
    mode = next;
    rebuildFrames();
    options.onState?.(stateOf());
  }

  function setBreakpoint(device: FrameBreakpoint): void {
    if (breakpoint === device) return;
    breakpoint = device;
    // Design only re-marks the sheets; live re-renders at the new width.
    if (mode === "live") rebuildFrames();
    else updateChrome();
    options.onState?.(stateOf());
  }

  function fit(): void {
    const width = rectOf(stage).width || rectOf(root).width;
    if (width > 0) setZoom(fitZoom(width, { margin: 24 }));
    else applyFrameLayout();
  }

  function setPreviewState(value: StateName | null): void {
    if (mode === "live") return;
    previewState = value;
    for (const entry of mounted) {
      if (entry.body === null) continue;
      setForcedState(entry);
      updateRules(entry);
    }
    updateChrome();
    options.onState?.(stateOf());
  }

  function select(id: string | null): void {
    if (id === null) store.clearSelection();
    else store.select(id);
    options.onState?.(stateOf());
  }

  function insert(primitive: string, position: InsertPosition): boolean {
    const target = selectedId();
    if (target === null) {
      message("Wähle zuerst einen Knoten im Canvas.");
      return false;
    }
    return drop.insertAt(target, primitive, position);
  }

  const unsubscribe = store.subscribe(() => refresh());

  // Strg/Cmd+0 resets the design zoom to 100 % (Ticket 03 Punkt 6).
  const onKeydown = (event: DomEvent): void => {
    if ((event.metaKey === true || event.ctrlKey === true) && event.key === "0") {
      event.preventDefault?.();
      setZoom(1);
    }
  };
  doc.addEventListener("keydown", onKeydown);

  const onResize = (): void => {
    const width = rectOf(stage).width;
    const needed = canvasFrames(zoom).reduce(
      (sum, spec) => sum + (spec.width ?? 0) * spec.scale,
      0,
    );
    if (width > 0 && needed > width) setZoom(fitZoom(width, { margin: 24 }));
  };
  const global = globalThis as {
    addEventListener?: (type: string, handler: () => void) => void;
    removeEventListener?: (type: string, handler: () => void) => void;
  };
  global.addEventListener?.("resize", onResize);

  for (const spec of canvasFrames(zoom, { mode, breakpoint })) mountFrame(spec);
  applyFrameLayout();
  updateChrome();

  return {
    element: root,
    refresh,
    setZoom,
    fit,
    setPreviewState,
    setMode,
    setBreakpoint,
    mode: () => mode,
    breakpoint: () => breakpoint,
    select,
    insert,
    undo: () => store.undo(),
    redo: () => store.redo(),
    state: stateOf,
    destroy(): void {
      unsubscribe();
      doc.removeEventListener("keydown", onKeydown);
      global.removeEventListener?.("resize", onResize);
      drop.destroy();
      renderer.destroy();
      root.remove();
    },
  };
}
