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
// stylesheet is the single compiler output. The canvas adds the frame chrome —
// the pointer cursor unlayered in the frame (cascade decision O1), the
// selection and hover markers in the editor portal over the stage (ticket 16).

import type { MotionProfile, NodeTree, Registry } from "@senify/section-sdk";
import {
  getPrimitive,
  themeTokenResolver,
  type StateName,
  type TokenResolver,
} from "@senify/widget-engine";
import type { Theme } from "@senify/tokens";
import { createReactRenderer } from "../react-renderer.tsx";
import type { FrameDescriptor } from "../frames.ts";
import type { EditorMode, FrameBreakpoint } from "../types.ts";
import type { FrameRenderer } from "../frame-renderer.ts";
import { getDocument, type DomDocument, type DomElement, type DomEvent } from "../dom.ts";
import { ensureCanvasStyles } from "./styles.ts";
import { editorFontFaceCss } from "../ui/fonts.ts";
import { applyEditorSkin, EDITOR_SKIN_DEFAULT } from "../ui/skin.ts";
import { EDITOR_ROOT_ATTRIBUTE } from "../ui/tokens.ts";
import { injectMotionRuntime, MOTION_VENDOR_BASE, profileLenis } from "../motion-inject.ts";
import { EditorStore, typingCoalesceKey } from "../state/store.ts";
import { copyNode, pasteNode } from "../state/clipboard.ts";
import { sanitizeInlineText } from "../inline-text.ts";
import { createHistoryDialog } from "../history/dialog.ts";
import { canvasFrames, fitZoom, ZOOM_MAX, ZOOM_MIN, type CanvasFrameSpec } from "./device.ts";
import { scrubOffset, scrubProgress } from "./scrub.ts";
import { canvasFrameRules, type FrameRules } from "./rules.ts";
import { createMarkerOverlay, type OverlayFrame } from "./overlay.ts";
import { canvasNodeTree, canvasNodeTreeWithCopies } from "./adapter.ts";
import { type InsertPosition } from "./insert.ts";
import { firstChildId, resolveClick, selectionLabel } from "./selection.ts";
import { locateParent } from "../state/document.ts";
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
  // Pseudo-state buttons are a developer aid, not part of the product chrome.
  // Tests and diagnostics can opt in explicitly without changing normal flows.
  debugChrome?: boolean;
};

export type CanvasState = {
  zoom: number;
  previewState: StateName | null;
  selected: string | null;
  mode: EditorMode;
  breakpoint: FrameBreakpoint;
};

// Where the next insert goes once a plus point has been clicked; `label` reads
// "hinter Hero" / "vor Hero" / "in Rahmen" for the elements panel's hint.
export type ArmedTarget = {
  nodeId: string;
  position: InsertPosition;
  label: string;
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
  insert(
    primitive: string,
    position: InsertPosition,
    props?: Record<string, import("@senify/widget-engine").PropValue>,
  ): boolean;
  // Fuegt ein Primitiv am gemerkten Ziel ein (siehe `armedTarget`), sonst als
  // letztes Kind der Seitenwurzel. Der Weg des Elemente-Panels (E5/E7): es steht
  // nur ohne Auswahl da, also gibt es kein Ziel "hinter" einem Knoten, es sei
  // denn ein Plus-Punkt hat eins gemerkt.
  insertAtTarget(primitive: string): boolean;
  // Das Ziel des naechsten Einfuegens, gemerkt durch einen Klick auf einen
  // Plus-Punkt im Canvas (E7). Es faellt weg, sobald etwas gewaehlt wird, der
  // Knoten verschwindet oder eingefuegt wurde.
  armedTarget(): ArmedTarget | null;
  onArmedChange(listener: (target: ArmedTarget | null) => void): () => void;
  clearArmed(): void;
  // Setzt eine Registry-Sektion (Typ plus Variante) auf die Seitenebene: hinter
  // den Bereich, in dem die Auswahl liegt, ohne Auswahl ans Ende der Seite.
  // Die Auswahl bleibt, wie sie war.
  insertSection(type: string, variant: string): boolean;
  // Macht eine Sektions-Kachel ausserhalb des Canvas zur Drag-Quelle.
  bindSectionDragSource(element: DomElement, type: string, variant: string): void;
  // Macht ein Element ausserhalb des Canvas (Elemente-Panel) zur Drag-Quelle
  // fuer ein Primitiv; der Drop laeuft ueber denselben Controller wie die Chips.
  bindDragSource(element: DomElement, primitive: string): void;
  // The live-follow highlight (ticket 05): rings over remotely changed nodes.
  flashNodes(ids: string[]): void;
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
  frameLabel: DomElement;
};

const PREVIEW_STATES: readonly (StateName | "none")[] = [
  "none",
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
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
  // Copy id -> the instance that rendered it, from the last `refresh`. A click
  // inside a component instance resolves through it (ticket 04).
  let copyOrigins: ReadonlyMap<string, { instanceId: string; partId: string }> = new Map();
  // Live preview reload (ticket 05, point 4): the live frame reloads on a
  // remote change, so a flash for the changed nodes waits for the fresh frame
  // (the old DOM is about to be replaced and would swallow the ring).
  let pendingFlash: string[] | null = null;
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
  const stage = create(doc, "div", "senify-canvas__stage");
  const overlay = create(doc, "div", "senify-canvas__overlay", { "data-role": "overlay" });
  const footer = create(doc, "div", "senify-canvas__footer");
  const status = create(doc, "span", "senify-canvas__status", { "data-role": "status" });
  root.appendChild(topbar);
  root.appendChild(stage);
  root.appendChild(footer);
  stage.appendChild(overlay);
  host.appendChild(root);

  // Drag and drop (ticket 12): the drop line and the plus points live in the
  // stage overlay — never in the content frame. The drag sources are the
  // elements panel tiles (`bindDragSource`).
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
    onPlus: (nodeId, position) => arm(nodeId, position),
    onMessage: (value) => message(value),
  });

  // The marker portal (ticket 16): selection and hover chrome over the stage,
  // never in the content frame. One layer per sheet clips the ring at the
  // sheet edge; the geometry is recomputed from the live frame rects.
  const markers = createMarkerOverlay({
    doc,
    stage,
    overlay,
    frames: () => mounted.map((entry) => overlayFrame(entry)),
    label: (id) => markerLabel(id),
    parent: (id) => locateParent(store.document, id)?.parent.nodeId ?? null,
  });

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
  const debugChrome = options.debugChrome === true;
  const stateButtons: DomElement[] = [];
  const stateGroup = create(doc, "div", "senify-canvas__group", {
    "data-role": "states",
    "aria-label": "Pseudo-Zustände",
  });
  stateGroup.hidden = !debugChrome;
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

  // Chrome-Buttons (Framer/Webflow-Stil): Phosphor-Maskensymbol, der volle
  // deutsche Name bleibt als aria-label und Tooltip, optional ein Kurztext.
  function setIcon(button: DomElement, icon: string, label: string, text?: string): void {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.appendChild(create(doc, "span", `ic ic--${icon} ic--16`, { "aria-hidden": "true" }));
    if (text !== undefined) {
      const caption = create(doc, "span", "senify-canvas__button-text");
      caption.textContent = text;
      button.appendChild(caption);
    }
  }

  const undoButton = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "undo",
  });
  setIcon(undoButton, "undo", "Rückgängig");
  undoButton.addEventListener("click", () => {
    if (store.undo()) message(null);
  });
  const redoButton = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "redo",
  });
  setIcon(redoButton, "redo", "Wiederholen");
  redoButton.addEventListener("click", () => {
    if (store.redo()) message(null);
  });
  // The history sheet (ticket 03 point 5): time + action per row, a click
  // jumps to that state through the ordinary undo/redo gate.
  const historyDialog = createHistoryDialog({ doc, store });
  const historyButton = create(doc, "button", "senify-canvas__button", {
    type: "button",
    "data-action": "history",
  });
  setIcon(historyButton, "history", "Verlauf");
  historyButton.addEventListener("click", () => historyDialog.toggle());

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
  setIcon(zoomFit, "fit", "Einpassen");
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

  // Geräte-Umschalter: wählt das aktive Breakpoint-Blatt (Design markiert es,
  // Live rendert in dieser Breite).
  const deviceGroup = create(doc, "div", "senify-canvas__group", { "data-role": "device" });
  const deviceButtons = new Map<FrameBreakpoint, DomElement>();
  const deviceSpecs: ReadonlyArray<readonly [FrameBreakpoint, string, string]> = [
    ["desktop", "desktop", "Desktop"],
    ["tablet", "tablet", "Tablet"],
    ["mobile", "phone", "Mobil"],
  ];
  for (const [value, icon, label] of deviceSpecs) {
    const button = create(doc, "button", "senify-canvas__button", {
      type: "button",
      "data-action": "device",
      "data-device": value,
    });
    setIcon(button, icon, label);
    button.addEventListener("click", () => setBreakpoint(value));
    deviceButtons.set(value, button);
    deviceGroup.appendChild(button);
  }

  const historyGroup = create(doc, "div", "senify-canvas__group");
  historyGroup.appendChild(undoButton);
  historyGroup.appendChild(redoButton);
  historyGroup.appendChild(historyButton);
  const zoomGroup = create(doc, "div", "senify-canvas__group");
  zoomGroup.appendChild(zoomOut);
  zoomGroup.appendChild(zoomLabel);
  zoomGroup.appendChild(zoomIn);
  zoomGroup.appendChild(zoomFit);

  // Scrub (Ticket 19, M6): im Live-Modus faehrt der Regler die Scroll-Position
  // der echten Seite an — Pin-/Scrub-Presets werden ohne Mausrad pruefbar.
  // ScrollTrigger reagiert auf das ausgeloeste Scroll-Event; der Rueckweg
  // (Scrollen im Frame) fuehrt den Regler nach.
  const scrubGroup = create(doc, "div", "senify-canvas__group", { "data-role": "scrub" });
  const scrubLabel = create(doc, "span", "senify-canvas__scrub-label");
  scrubLabel.textContent = "Scrub";
  const scrubInput = create(doc, "input", "senify-canvas__scrub", {
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: "0",
    "data-action": "scrub",
    "aria-label": "Scroll-Position der Live-Vorschau",
  });
  scrubInput.addEventListener("input", () => {
    scrubTo(Number(scrubInput.value ?? "0") / 100);
  });
  scrubGroup.appendChild(scrubLabel);
  scrubGroup.appendChild(scrubInput);

  topbar.appendChild(modeGroup);
  topbar.appendChild(deviceGroup);
  topbar.appendChild(historyGroup);
  topbar.appendChild(stateGroup);
  footer.appendChild(status);
  footer.appendChild(scrubGroup);
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

  function markerLabel(id: string): string {
    const node = store.document.nodes[id];
    const fromStore = selectionLabel(store.document, store.selection);
    if (node === undefined) return id;
    return fromStore !== null && store.selection.selected.includes(id)
      ? fromStore
      : `${node.primitive} · ${id}`;
  }

  // The frame rules of the current document and view state. The compiler run
  // is the expensive part of a refresh (ticket 05, point 7), so the refresh
  // path compiles once and hands the same rules to every sheet.
  function frameRules(): FrameRules {
    return canvasFrameRules(store.document, {
      forcedState: previewState,
      ...(mode === "live" ? { chrome: false } : {}),
      ...(resolveToken === undefined ? {} : { resolveToken }),
    });
  }

  function updateRules(entry: MountedFrame, prepared?: FrameRules): void {
    if (entry.body === null) return;
    const rules = prepared ?? frameRules();
    if (entry.rules === null) {
      const style = create(entry.doc, "style", undefined, { "data-senify-canvas-rules": "" });
      (entry.doc.head ?? entry.body).appendChild(style);
      entry.rules = style;
    }
    // The same CSS for every sheet: a rewrite only when it actually changed.
    if (entry.rules.textContent !== rules.css) entry.rules.textContent = rules.css;
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

  // ------------------------------------------------------- inline text (P4)
  // Double-click on a text leaf edits the real element (`contentEditable`
  // plaintext-only, artifacts/24 §2). Every input writes through the one store
  // gate with a typing coalesce key, so the burst folds into one undo entry and
  // the save pipeline persists it. The frames stay un-rendered while the
  // session runs — React would reset the caret on every keystroke; commit,
  // Enter and Escape refresh them.
  let inlineSession: {
    nodeId: string;
    key: string;
    original: string;
    element: DomElement;
  } | null = null;

  function inlineTargetOf(
    target: unknown,
  ): { element: DomElement; nodeId: string; key: string } | null {
    const element = (target as DomElement | null)?.closest?.("[data-inline]") ?? null;
    if (element === null) return null;
    const nodeId =
      element.getAttribute("data-inline-node") ?? element.getAttribute("data-node-id");
    const key = element.getAttribute("data-prop-key");
    if (nodeId === null || key === null) return null;
    return { element, nodeId, key };
  }

  function inlineValue(): string {
    return sanitizeInlineText(inlineSession?.element.textContent ?? "");
  }

  function writeInline(value: string): void {
    const session = inlineSession;
    if (session === null) return;
    try {
      // A no-op value produces no patch and no history entry (the store gate).
      store.apply(
        {
          op: "setNodeProp",
          id: session.nodeId,
          key: session.key,
          value: sanitizeInlineText(value),
        },
        {
          coalesceKey: typingCoalesceKey(session.nodeId, session.key),
          label: "Text bearbeiten",
        },
      );
    } catch (error) {
      message(error instanceof Error ? error.message : "Text konnte nicht gespeichert werden.");
    }
  }

  function startInline(target: { element: DomElement; nodeId: string; key: string }): void {
    finishInline();
    inlineSession = {
      nodeId: target.nodeId,
      key: target.key,
      original: target.element.textContent ?? "",
      element: target.element,
    };
    target.element.setAttribute("contenteditable", "plaintext-only");
    target.element.focus?.();
    options.onState?.(stateOf());
  }

  // Enter, a click elsewhere or a focus loss: keep the edit, drop the mode.
  function finishInline(): void {
    if (inlineSession === null) return;
    inlineSession.element.removeAttribute("contenteditable");
    inlineSession = null;
    refresh();
    options.onState?.(stateOf());
  }

  // Escape: back to the original text; the coalesced burst entry is consumed,
  // so Cmd+Z afterwards undoes the *previous* action (artifacts/24 §2).
  function revertInline(): void {
    const session = inlineSession;
    if (session === null) return;
    if (inlineValue() !== session.original) {
      store.apply(
        {
          op: "setNodeProp",
          id: session.nodeId,
          key: session.key,
          value: session.original,
        },
        {
          coalesceKey: typingCoalesceKey(session.nodeId, session.key),
          label: "Text bearbeiten",
        },
      );
    }
    const top = store.history.top();
    if (top !== null && top.coalesceKey === typingCoalesceKey(session.nodeId, session.key)) {
      store.history.remove(top.id);
    }
    session.element.textContent = session.original;
    session.element.removeAttribute("contenteditable");
    inlineSession = null;
    message("Inline-Text zurückgesetzt");
    refresh();
    options.onState?.(stateOf());
  }

  // --------------------------------------------------------- keyboard (P7)
  // One shortcut layer for the outer document and every frame: Cmd+Z /
  // Shift+Cmd+Z, Cmd+D, Delete, Escape (one level up), Enter (one level down),
  // Cmd+0. Text entry and an open sheet keep their own keys.
  function isTextEntry(target: unknown): boolean {
    const element = target as (DomElement & { isContentEditable?: boolean }) | null;
    if (element === null || element === undefined) return false;
    const tag = (element as { tagName?: string }).tagName?.toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return element.isContentEditable === true;
  }

  function selectedOrNull(): string | null {
    return selectedId();
  }

  function duplicateSelected(): void {
    const id = selectedOrNull();
    if (id === null || id === store.document.rootNodeId) return;
    try {
      store.apply({ op: "duplicateNode", id }, { label: "Ebene duplizieren" });
      message(null);
    } catch (error) {
      message(error instanceof Error ? error.message : "Duplizieren nicht möglich.");
    }
  }

  function deleteSelected(): void {
    const id = selectedOrNull();
    if (id === null || id === store.document.rootNodeId) return;
    try {
      store.apply({ op: "deleteNode", id }, { label: "Ebene löschen" });
      message(null);
    } catch (error) {
      message(error instanceof Error ? error.message : "Löschen nicht möglich.");
    }
  }

  function shortcut(event: DomEvent): void {
    const mod = event.metaKey === true || event.ctrlKey === true;
    const key = event.key?.toLowerCase();
    if (mod && event.key === "0") {
      event.preventDefault?.();
      setZoom(1);
      return;
    }
    if (mod && key === "z") {
      event.preventDefault?.();
      if (event.shiftKey === true) {
        if (store.redo()) message(null);
      } else if (store.undo()) {
        message(null);
      }
      return;
    }
    if (mod && key === "y") {
      event.preventDefault?.();
      if (store.redo()) message(null);
      return;
    }
    if (mod && key === "d") {
      event.preventDefault?.();
      duplicateSelected();
      return;
    }
    if (mod && key === "c") {
      event.preventDefault?.();
      const id = selectedOrNull();
      if (id !== null && copyNode(store, id)) message("Ebene kopiert");
      return;
    }
    if (mod && key === "v") {
      event.preventDefault?.();
      const pasted = pasteNode(store, selectedOrNull());
      if (pasted === null) {
        message("Die Zwischenablage ist leer oder die Quelle fehlt.");
        return;
      }
      store.select(pasted);
      options.onState?.(stateOf());
      message(null);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !isTextEntry(event.target)) {
      event.preventDefault?.();
      deleteSelected();
      return;
    }
    if (event.key === "Escape") {
      if (event.defaultPrevented === true) return;
      // The frame handler reverts a running inline edit before this runs.
      if (inlineSession !== null) return;
      if (selectedOrNull() === null) return;
      event.preventDefault?.();
      store.selectParent();
      options.onState?.(stateOf());
      return;
    }
    if (event.key === "Enter" && !isTextEntry(event.target)) {
      const id = selectedOrNull();
      if (id === null) return;
      const child = firstChildId(store.document, id);
      if (child === null) return;
      event.preventDefault?.();
      store.select(child);
      options.onState?.(stateOf());
    }
  }

  function bindFrame(entry: MountedFrame): void {
    // The scrub slider follows the wheel (ticket 19, M6): scrolling inside the
    // live frame writes the progress back into the control.
    entry.doc.addEventListener("scroll", () => syncScrub(entry));
    entry.doc.addEventListener("click", (event: DomEvent) => {
      // Live shows the real page (M4 Stufe 1): links and islands keep their
      // own behaviour, the editor chrome stays out.
      if (mode === "live") return;
      // While a text is being edited, clicks inside the leaf place the caret;
      // a click elsewhere commits the burst first.
      if (inlineSession !== null) {
        const target = event.target as DomElement | null;
        if (inlineSession.element.contains?.(target) === true) return;
        finishInline();
      }
      // A click in a sheet makes it the active breakpoint (dimming cue).
      setBreakpoint(entry.device);
      // Alt walks one step up the tree (the inspect ladder): the click selects
      // the parent of what the pointer hit.
      const hit = hitNodeId(event.target);
      const id =
        event.altKey === true && hit !== null
          ? (locateParent(store.document, hit)?.parent.nodeId ?? hit)
          : hit;
      applyResolution(resolveClick(store.document, id, { origins: copyOrigins }));
    });
    entry.doc.addEventListener("dblclick", (event: DomEvent) => {
      if (mode === "live") return;
      const inline = inlineTargetOf(event.target);
      if (inline !== null) {
        event.preventDefault?.();
        startInline(inline);
        return;
      }
      applyResolution(
        resolveClick(store.document, hitNodeId(event.target), {
          double: true,
          origins: copyOrigins,
        }),
      );
    });
    entry.doc.addEventListener("input", (event: DomEvent) => {
      const session = inlineSession;
      if (session === null) return;
      if ((event.target as DomElement | null) !== session.element) return;
      writeInline(session.element.textContent ?? "");
    });
    entry.doc.addEventListener("focusout", (event: DomEvent) => {
      const session = inlineSession;
      if (session === null) return;
      const related = (event as { relatedTarget?: unknown }).relatedTarget ?? null;
      if (related === session.element) return;
      finishInline();
    });
    entry.doc.addEventListener("keydown", (event: DomEvent) => {
      if (inlineSession !== null) {
        if (event.key === "Escape") {
          event.preventDefault?.();
          revertInline();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault?.();
          finishInline();
          return;
        }
        if (event.key === "Tab") {
          // Tab never walks into the content (ui-plan section 17).
          event.preventDefault?.();
          finishInline();
          return;
        }
        // The text field keeps the rest of its keys (copy/paste of text, not
        // of the node).
        return;
      }
      if (mode === "live") return;
      if (event.key === "Tab") {
        // The design frame is not a tab stop; the editor chrome owns the
        // focus order (ui-plan section 17: "Der Fokus geht nie in den
        // Canvas-Inhalt").
        event.preventDefault?.();
        return;
      }
      if (event.defaultPrevented === true) return;
      shortcut(event);
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
      frameLabel,
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
      bindFrame(entry);
      drop.attachFrame({
        device: entry.device,
        doc: entry.doc,
        body: entry.body,
        wrap: entry.wrap,
        scale: entry.frame.scale,
      });
      markers.attachFrame(overlayFrame(entry));
      refresh();
    });
    iframe.setAttribute("srcdoc", frameDoc(options.frameStyles ?? []));
  }

  function overlayFrame(entry: MountedFrame): OverlayFrame {
    // Live frames have no fixed size (real size, native scroll): the viewport
    // is what the frame shows right now, so the flash can still be placed.
    const viewport =
      entry.frame.width !== null && entry.frame.height !== null
        ? { width: entry.frame.width, height: entry.frame.height }
        : { width: rectOf(entry.iframe).width, height: rectOf(entry.iframe).height };
    return {
      device: entry.device,
      doc: entry.doc,
      body: entry.body,
      wrap: entry.wrap,
      scale: entry.frame.scale,
      mode,
      viewport,
    };
  }

  // One frame in live mode (the active breakpoint, real size), three sheets in
  // design. Switching rebuilds the frames: the live frame starts from the
  // baseline state, and the design frames drop any runtime the live mode wrote.
  function rebuildFrames(): void {
    finishInline();
    cancelDeferred();
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
    for (const [value, button] of deviceButtons) {
      button.setAttribute("data-active", String(value === breakpoint));
      button.setAttribute("aria-pressed", String(value === breakpoint));
    }
    // Zoom and forced states belong to the design mode; live is 100 % by
    // definition and shows the real page without editor chrome.
    const designOnly = [...stateButtons, zoomOut, zoomIn, zoomFit, zoomLabel];
    for (const button of designOnly) {
      if (mode === "design") button.removeAttribute("disabled");
      else button.setAttribute("disabled", "disabled");
    }
  // Der Scrub ist ein bewusst optionales Live-Werkzeug. Im Design-Modus bleibt
  // die DOM-Hülle für bestehende Integrationen erhalten, ist aber unsichtbar.
  scrubGroup.hidden = mode !== "live" && !debugChrome;
  if (mode === "live") {
    scrubInput.removeAttribute("disabled");
    scrubGroup.setAttribute("data-active", "true");
  } else {
    scrubInput.setAttribute("disabled", "disabled");
    scrubGroup.removeAttribute("data-active");
  }
    for (const entry of mounted) {
      const active = entry.device === breakpoint;
      entry.wrap.setAttribute("data-active", String(active));
      if (active) entry.wrap.removeAttribute("title");
      else entry.wrap.setAttribute("title", "Zum Bearbeiten aktivieren");
    }
    // Selection chrome lives in the portal (ticket 16); live shows the real
    // page without it. The geometry is measured in the next frame (ticket 05,
    // point 7): the DOM writes of this task settle first, so an insert never
    // forces a synchronous layout. A selection change still flushes at once.
    markers.setSelection(mode === "design" ? selected : null);
    markers.flushNextFrame();
  }

  // The scrub slider of the live preview (ticket 19, M6): it reads and writes
  // the active frame's scroll offset. ScrollTrigger listens to the resulting
  // scroll events, so pin/scrub presets can be inspected without the wheel.
  function activeEntry(): MountedFrame | undefined {
    return mounted.find((entry) => entry.device === breakpoint) ?? mounted[0];
  }

  function maxScrollOf(entry: MountedFrame): number {
    const rootEl = entry.doc.documentElement;
    if (rootEl === undefined) return 0;
    return Math.max(0, (rootEl.scrollHeight ?? 0) - (rootEl.clientHeight ?? 0));
  }

  function scrubTo(progress: number): void {
    if (mode !== "live") return;
    const entry = activeEntry();
    const rootEl = entry?.doc.documentElement;
    if (entry === undefined || rootEl === undefined) return;
    rootEl.scrollTop = scrubOffset(progress, maxScrollOf(entry));
  }

  function syncScrub(entry: MountedFrame): void {
    if (mode !== "live") return;
    if (entry !== activeEntry()) return;
    const rootEl = entry.doc.documentElement;
    if (rootEl === undefined) return;
    const progress = scrubProgress(rootEl.scrollTop, maxScrollOf(entry));
    scrubInput.value = String(Math.round(progress * 100));
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

  // One sheet of the refresh: React render (unless an inline edit owns the
  // DOM), the shared rules, the forced state and — in live — the runtime.
  function renderEntry(entry: MountedFrame, tree: NodeTree, rules: FrameRules): void {
    if (entry.body === null) return;
    // While an inline edit runs the frame DOM belongs to the user: React
    // would rewrite the leaf and drop the caret. The document still updates
    // through the store gate; commit and revert refresh the frames.
    if (inlineSession === null) {
      renderer.mount(entry.frame, entry.body, {
        tree,
        registry: options.registry,
        breakpoint: entry.device,
      });
    }
    updateRules(entry, rules);
    setForcedState(entry);
    if (mode === "live") injectLiveMotion(entry);
  }

  // The sheets beside the active breakpoint follow one frame later (ticket 05,
  // point 7): the insert path writes the sheet the user works on, the dimmed
  // sheets catch up in the next frame. A pending render is replaced by the
  // newer one, never queued twice.
  let deferredRender: { tree: NodeTree; rules: FrameRules } | null = null;
  let deferredHandle: number | null = null;

  function flushDeferred(): void {
    deferredHandle = null;
    const pending = deferredRender;
    deferredRender = null;
    if (pending === null) return;
    for (const entry of mounted) {
      if (entry.device === breakpoint) continue;
      renderEntry(entry, pending.tree, pending.rules);
    }
  }

  function scheduleDeferred(tree: NodeTree, rules: FrameRules): void {
    deferredRender = { tree, rules };
    if (deferredHandle !== null) return;
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
      .requestAnimationFrame;
    if (typeof raf === "function") {
      deferredHandle = raf(() => flushDeferred());
      return;
    }
    deferredHandle = setTimeout(() => flushDeferred(), 0) as unknown as number;
  }

  function cancelDeferred(): void {
    deferredRender = null;
    if (deferredHandle === null) return;
    const caf = (globalThis as { cancelAnimationFrame?: (handle: number) => void })
      .cancelAnimationFrame;
    if (typeof caf === "function") caf(deferredHandle);
    else clearTimeout(deferredHandle as unknown as ReturnType<typeof setTimeout>);
    deferredHandle = null;
  }

  function refresh(): void {
    const expanded = canvasNodeTreeWithCopies(store.document);
    const tree = expanded.tree;
    // A click inside an instance hits a copy id that is not a document node;
    // the map from the last render resolves it back to the instance (ticket 04).
    copyOrigins = expanded.origins;
    // One compiler run for all sheets (ticket 05, point 7).
    const rules = frameRules();
    let deferred = false;
    for (const entry of mounted) {
      if (entry.body === null) continue;
      if (entry.device === breakpoint) {
        renderEntry(entry, tree, rules);
      } else {
        deferred = true;
      }
    }
    if (deferred) scheduleDeferred(tree, rules);
    // The live preview reloaded (point 4): the ring for the remote change lands
    // on the fresh frame, where the copy map is current again.
    if (mode === "live" && pendingFlash !== null) {
      const ids = pendingFlash;
      pendingFlash = null;
      markers.flash(flashIds(ids));
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
    const rules = frameRules();
    for (const entry of mounted) {
      if (entry.body === null) continue;
      setForcedState(entry);
      updateRules(entry, rules);
    }
    updateChrome();
    options.onState?.(stateOf());
  }

  function select(id: string | null): void {
    if (id === null) store.clearSelection();
    else store.select(id);
    options.onState?.(stateOf());
  }

  function insert(
    primitive: string,
    position: InsertPosition,
    props: Record<string, import("@senify/widget-engine").PropValue> = {},
  ): boolean {
    const target = selectedId();
    if (target === null) {
      message("Wähle zuerst einen Knoten im Canvas.");
      return false;
    }
    return drop.insertAt(target, primitive, position, props);
  }

  function insertAtEnd(primitive: string): boolean {
    return drop.insertAt(store.document.rootNodeId, primitive, "into");
  }

  // The target a plus point armed (E7): the elements panel supplies the element,
  // this is where it goes. The selection is cleared first - the panel shows
  // without one - so the arming itself does not trip the "selected: disarm" rule.
  let armed: ArmedTarget | null = null;
  const armedListeners = new Set<(target: ArmedTarget | null) => void>();
  function setArmed(next: ArmedTarget | null): void {
    armed = next;
    for (const listener of [...armedListeners]) listener(next);
  }
  function arm(nodeId: string, position: InsertPosition): void {
    const node = store.document.nodes[nodeId];
    if (node === undefined) return;
    store.clearSelection();
    const where = position === "before" ? "vor" : position === "after" ? "hinter" : "in";
    setArmed({
      nodeId,
      position,
      label: `${where} ${getPrimitive(node.primitive)?.name ?? node.primitive}`,
    });
  }
  function clearArmed(): void {
    if (armed !== null) setArmed(null);
  }
  function insertAtTarget(primitive: string): boolean {
    if (armed === null) return insertAtEnd(primitive);
    const target = armed;
    const inserted = drop.insertAt(target.nodeId, primitive, target.position);
    clearArmed();
    return inserted;
  }

  // A section belongs on the page level: behind the top-level block the
  // selection sits in (a section inserted "after" a heading would end up inside
  // that heading's frame), at the end of the page without a selection.
  function insertSection(type: string, variant: string): boolean {
    // A plus point armed a target (E7): it wins, like it does for a building block.
    if (armed !== null) {
      const target = armed;
      const inserted = drop.insertSectionAt(target.nodeId, type, variant, target.position);
      clearArmed();
      return inserted;
    }
    const rootId = store.document.rootNodeId;
    let anchor = selectedId();
    if (anchor === null || anchor === rootId) {
      return drop.insertSectionAt(rootId, type, variant, "into");
    }
    for (;;) {
      const located = locateParent(store.document, anchor);
      if (located === undefined) return drop.insertSectionAt(rootId, type, variant, "into");
      if (located.parent.nodeId === rootId) break;
      anchor = located.parent.nodeId;
    }
    return drop.insertSectionAt(anchor, type, variant, "after");
  }

  // The event names document nodes; a component instance renders as copies
  // with their own ids (and a definition part renders once per instance). The
  // copy map of the last render resolves both to the visible element.
  function flashIds(ids: string[]): string[] {
    const resolved = new Set(ids);
    for (const [copyId, origin] of copyOrigins) {
      if (resolved.has(origin.instanceId) || resolved.has(origin.partId)) {
        resolved.add(copyId);
      }
    }
    return [...resolved];
  }

  const unsubscribe = store.subscribe(() => {
    if (armed !== null && (selectedId() !== null || store.document.nodes[armed.nodeId] === undefined)) {
      clearArmed();
    }
    // Live is the real page (M4 Stufe 1): a remote change reloads the preview
    // (point 4) instead of patching the tree, so the release runtime rebinds to
    // the fresh DOM. Design keeps the store patch, which preserves the caret.
    if (mode === "live") rebuildFrames();
    else refresh();
  });

  // The outer shortcut layer (Ticket 03 Punkt 7): the frame handler covers the
  // content focus, this one covers the editor chrome. Text entry keeps its own
  // keys, an open history sheet swallows the rest.
  const onKeydown = (event: DomEvent): void => {
    if (historyDialog.isOpen()) return;
    if (isTextEntry(event.target)) return;
    shortcut(event);
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
    insertAtTarget,
    armedTarget: () => armed,
    onArmedChange: (listener) => {
      armedListeners.add(listener);
      return () => {
        armedListeners.delete(listener);
      };
    },
    clearArmed,
    insertSection,
    bindSectionDragSource: (element, type, variant) =>
      drop.bindSectionDragSource(element, type, variant),
    bindDragSource: (element, primitive) => drop.bindDragSource(element, primitive),
    flashNodes(ids: string[]): void {
      // Live reloads on the next store change (point 4): the ring lands on the
      // fresh frame via `refresh`, where the copy map is current again.
      if (mode === "live") {
        pendingFlash = ids;
        return;
      }
      markers.flash(flashIds(ids));
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    state: stateOf,
    destroy(): void {
      unsubscribe();
      cancelDeferred();
      doc.removeEventListener("keydown", onKeydown);
      global.removeEventListener?.("resize", onResize);
      drop.destroy();
      markers.destroy();
      historyDialog.destroy();
      renderer.destroy();
      root.remove();
    },
  };
}
