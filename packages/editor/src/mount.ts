import type {
  Node,
  NodeTree,
  PropValue,
  Registry,
  SectionDefinition,
} from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import type { Mutation, ParentRef } from "@senify/engine";
import { goldenTreeToMutations } from "./golden.ts";
import {
  buildLayerList,
  buildMediaTab,
  buildTemplatesSection,
  EXPLORER_TABS,
  type ExplorerTab,
  type LayerItem,
  type MediaItem,
  type MediaQuery,
  type TemplateKind,
} from "./explorer.ts";
import { DraftConflictError, MutationsSession } from "./client.ts";
import { emitMutations } from "./mutations.ts";
import { InlineEditing } from "./inline-text.ts";
import { HistoryStack, type HistoryEntry } from "./history.ts";
import { buildMotionPanel, buildPanels, type PanelField, type PanelGroup } from "./panels.ts";
import {
  buildSpotlightIndex,
  searchSpotlight,
  type PageRef,
  type SpotlightCommand,
  type SpotlightItem,
} from "./spotlight.ts";
import {
  createFrameState,
  effectiveProps,
  framePlacements,
  framesForState,
  isHiddenAt,
  panBy,
  selectNode,
  setBreakpoint as setBreakpointState,
  setMode as setModeState,
  setZoom,
  zoomBy,
  type FrameDescriptor,
  type FrameState,
} from "./frames.ts";
import { parseDeepLink, serializeDeepLink, type DeepLinkState } from "./deep-links.ts";
import { ensureEditorStyles } from "./styles.ts";
import {
  getDocument,
  requireDocument,
  type DomDocument,
  type DomElement,
  type DomEvent,
  type DomWindow,
} from "./dom.ts";
import {
  isOverrideBreakpoint,
  type EditorAction,
  type FrameBreakpoint,
} from "./types.ts";

// The editor core, shaped after the Elementor workbench (T17): a top bar
// (brand menu, add element, page settings, history, page name, device
// switcher, structure, finder, preview, publish), one left panel that flips
// between the widget catalog and the element settings (Content/Style/
// Advanced), a gray stage with white sheets per breakpoint, a selection
// handle with edit/duplicate/delete, "+" insert points, a right-click context
// menu and a zoom footer. The core stays renderer-agnostic: the frame
// renderer is injected; every edit funnels through the canonical mutations of
// the engine.

// The one seam where Puck enters: the program shell injects the pinned Puck
// binding behind this interface, the editor core stays renderer-agnostic.
export type FrameRenderContext = {
  tree: NodeTree;
  registry: Registry;
  breakpoint: FrameBreakpoint;
};

export type FrameRenderer = {
  mount(frame: FrameDescriptor, body: DomElement, context: FrameRenderContext): void;
  destroy(): void;
};

export type EditorOptions = {
  session: MutationsSession;
  registry: Registry;
  tree: () => NodeTree;
  page: { pageId: string; title: string; path: string };
  pages?: () => PageRef[];
  templates?: () => { id: string; kind: TemplateKind; label: string }[];
  media?: () => MediaItem[];
  mediaQuery?: () => MediaQuery;
  theme?: Theme;
  renderer?: FrameRenderer;
  // Stylesheets every frame document loads (theme tokens, section styles).
  frameStyles?: string[];
  initialSearch?: string;
  onDeepLink?: (search: string, state: DeepLinkState) => void;
  onRefresh?: () => void | Promise<void>;
  onUndo?: (entry: HistoryEntry) => void | Promise<void>;
  onRedo?: (entry: HistoryEntry) => void | Promise<void>;
  onCommand?: (command: SpotlightCommand) => void;
  onError?: (error: unknown) => void;
};

export type EditorInstance = {
  state(): FrameState;
  history: HistoryStack;
  inline: InlineEditing;
  session: MutationsSession;
  deepLink(): DeepLinkState;
  dispatch(action: EditorAction): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setMode(mode: FrameState["mode"]): void;
  setBreakpoint(breakpoint: FrameBreakpoint): void;
  select(nodeId: string | null): void;
  openTab(tab: ExplorerTab): void;
  zoom(delta: number): void;
  resetZoom(): void;
  spotlight(query: string): SpotlightItem[];
  openSpotlight(open?: boolean): void;
  refresh(): void;
  message(): string | null;
  destroy(): void;
};

type PanelMode = "widgets" | "settings" | "page";
type PanelTab = "content" | "style" | "advanced";
type MenuName = "brand" | "history" | "publish";
type InsertTarget = { parent: ParentRef; index?: number };

type MountedFrame = {
  frame: FrameDescriptor;
  wrap: DomElement;
  body: DomElement;
  offsetLeft: number;
  offsetTop: number;
};

// The slice of the HTML5 drag data transfer the editor uses.
type DragTransfer = {
  setData?: (format: string, value: string) => void;
  effectAllowed?: string;
};

// The gray gap between the stage edge and the sheets. Frames live in content
// coordinates of the stage, so the selection overlay shares the same origin.
const STAGE_OFFSET = 24;

const CATEGORY_ORDER = ["structure", "content", "commerce", "media", "utility"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  structure: "Struktur",
  content: "Inhalte",
  commerce: "Commerce",
  media: "Medien",
  utility: "Werkzeuge",
};
const STYLE_GROUPS = new Set(["Styling", "Layout"]);
const PANEL_TABS: readonly { id: PanelTab; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "style", label: "Style" },
  { id: "advanced", label: "Advanced" },
];

function groupBase(id: string): string {
  return id.split("/")[0] ?? id;
}

// Frame document of one breakpoint: host stylesheets (theme tokens, section
// styles) load via frameStyles, the editor's own overlay rules stay inline.
function frameDoc(styles: readonly string[] = []): string {
  const links = styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>
html, body { margin: 0; padding: 0; }
body { font: 14px/1.5 system-ui, sans-serif; background: var(--bg-base, #ffffff); }
[data-node-id] { position: relative; outline: 1px dashed transparent; outline-offset: -1px; }
[data-node-id]:hover { outline-color: rgba(208, 4, 212, .4); }
[data-node-id][data-hidden="true"] { opacity: .35; }
[data-node-id][data-selected="true"] { outline: 2px solid #d004d4; outline-offset: -2px; }
[data-inline] { cursor: text; }
[data-inline]:hover { background: rgba(208, 4, 212, .08); }
.senify-drop-line { position: fixed; left: 0; right: 0; height: 2px; background: #d004d4; z-index: 9999; pointer-events: none; }
.senify-frame-page { min-height: 100vh; }
</style></head><body></body></html>`;
}

type ElementSpec = {
  className?: string;
  text?: string;
  value?: string;
  data?: Record<string, string>;
  attributes?: Record<string, string>;
  style?: Record<string, string>;
};

function h(doc: DomDocument, tag: string, spec?: ElementSpec): DomElement {
  const element = doc.createElement(tag);
  if (spec?.className) element.className = spec.className;
  if (spec?.text !== undefined) element.textContent = spec.text;
  if (spec?.value !== undefined) element.value = spec.value;
  for (const [key, value] of Object.entries(spec?.data ?? {})) {
    element.setAttribute(`data-${key}`, value);
  }
  for (const [key, value] of Object.entries(spec?.attributes ?? {})) {
    element.setAttribute(key, value);
  }
  for (const [key, value] of Object.entries(spec?.style ?? {})) {
    element.style[key] = value;
  }
  return element;
}

// Default renderer: draws the node tree of one breakpoint as editable stubs,
// so frame manager, overlays, panels, inline text and deep links are fully
// exercisable without Puck. The shell swaps in the real frame renderer.
export function createStubRenderer(): FrameRenderer {
  return {
    mount(frame, body, context): void {
      const doc = body.ownerDocument ?? getDocument() ?? requireDocument();
      body.textContent = "";
      const visit = (ownerId: string, host: DomElement): void => {
        const owner: Node | undefined = context.tree.nodes[ownerId];
        if (!owner) return;
        const lists: { slot: string | null; ids: string[] }[] = [
          { slot: null, ids: owner.children ?? [] },
          ...Object.entries(owner.slots ?? {}).map(([slot, ids]) => ({
            slot,
            ids: [...ids],
          })),
        ];
        for (const list of lists) {
          for (const childId of list.ids) {
            const child: Node | undefined = context.tree.nodes[childId];
            if (!child) continue;
            const props = effectiveProps(context.tree, childId, context.breakpoint);
            const element = h(doc, "div", {
              className: "senify-node",
              data: {
                "node-id": childId,
                type: child.type,
                slot: list.slot ?? "",
                hidden: String(isHiddenAt(context.tree, childId, context.breakpoint)),
              },
            });
            element.appendChild(
              h(doc, "div", {
                className: "senify-node__label",
                text: context.registry.has(child.type)
                  ? context.registry.get(child.type).title
                  : child.type,
                data: { "node-label": child.type },
              }),
            );
            const inlineKey = inlineKeyFor(props);
            if (inlineKey) {
              const value = props[inlineKey];
              const textElement = h(doc, "div", {
                className: "senify-node__text",
                text: typeof value === "string" ? value : "",
                data: {
                  inline: "true",
                  "node-id": childId,
                  "prop-key": inlineKey,
                },
              });
              element.appendChild(textElement);
            }
            host.appendChild(element);
            visit(childId, element);
          }
        }
      };
      visit(context.tree.rootNodeId, body);
    },
    destroy(): void {
      // Nothing to release: the stubs live inside the frame body.
    },
  };
}

function inlineKeyFor(props: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string" && value.length > 0) return key;
  }
  return null;
}

export function mountEditor(container: DomElement, options: EditorOptions): EditorInstance {
  const doc = requireDocument();
  ensureEditorStyles(doc);
  const win = (globalThis as { window?: DomWindow }).window ?? null;
  const renderer = options.renderer ?? createStubRenderer();
  const history = new HistoryStack();
  const inline = new InlineEditing(history);
  const session = options.session;

  const bootLink = options.initialSearch
    ? parseDeepLink(options.initialSearch)
    : null;
  let state = createFrameState(
    bootLink
      ? { mode: bootLink.mode, activeBreakpoint: bootLink.bp, selectedNodeId: bootLink.node }
      : undefined,
  );
  let activeTab: ExplorerTab = "layers";
  let panelMode: PanelMode = bootLink?.node ? "settings" : "widgets";
  let panelTab: PanelTab = "content";
  let insertTarget: InsertTarget | null = null;
  let insertHint: string | null = null;
  let menuOpen: MenuName | null = null;
  let contextMenu: { nodeId: string; left: number; top: number } | null = null;
  let railHidden = false;
  let widgetQuery = "";
  // Drag & drop: a widget dragged out of the catalog, a layer row dragged in
  // the structure column, and the element currently in inline editing.
  let dragWidget: string | null = null;
  let railDragId: string | null = null;
  let inlineElement: DomElement | null = null;
  // Inline typing commits on a short idle instead of every keystroke: the
  // canvas stays smooth and the engine's rate limiter stays happy (the
  // history already coalesces the burst into one undo entry).
  let inlineTimer: ReturnType<typeof setTimeout> | null = null;
  let message: string | null = null;
  let messageTone: "info" | "error" = "info";
  let spotlightOpen = false;
  let spotlightQuery = "";
  let pageMeta = { title: options.page.title, path: options.page.path };
  const collapsed = new Set<string>();
  // Frame documents currently mounted: selection rings are written straight
  // into them so selecting never re-creates (and reloads) the iframes.
  const mountedFrames: MountedFrame[] = [];

  const root = h(doc, "div", { className: "senify-editor", data: { "senify-editor": "true" } });
  // #1829: our own top bar and overlays, never Puck's default action bar.
  const topbar = h(doc, "div", {
    className: "senify-editor__topbar",
    data: { toolbar: "senify" },
  });
  const main = h(doc, "div", { className: "senify-editor__main" });
  const panelHost = h(doc, "div", { className: "senify-editor__panels" });
  const rail = h(doc, "div", { className: "senify-editor__rail" });
  const stage = h(doc, "div", { className: "senify-editor__stage" });
  const framesHost = h(doc, "div", { className: "senify-editor__frames" });
  const overlay = h(doc, "div", { className: "senify-editor__overlay" });
  const status = h(doc, "div", { className: "senify-editor__status" });
  const spotlight = h(doc, "div", {
    className: "senify-editor__spotlight",
    attributes: { hidden: "hidden" },
  });
  const spotlightInput = h(doc, "input", { className: "senify-editor__spotlight-input" });
  const spotlightList = h(doc, "div", { className: "senify-editor__spotlight-list" });

  spotlight.appendChild(spotlightInput);
  spotlight.appendChild(spotlightList);
  stage.appendChild(framesHost);
  stage.appendChild(overlay);
  main.appendChild(panelHost);
  main.appendChild(rail);
  main.appendChild(stage);
  root.appendChild(topbar);
  root.appendChild(main);
  root.appendChild(spotlight);
  root.appendChild(status);
  container.appendChild(root);

  function deepLink(): DeepLinkState {
    return {
      page: options.page.pageId,
      node: state.selectedNodeId,
      mode: state.mode,
      bp: state.activeBreakpoint,
    };
  }

  function syncDeepLink(): void {
    const link = deepLink();
    const search = serializeDeepLink(link);
    if (options.onDeepLink) {
      // The shell owns the URL (hash routing): it gets the state and writes
      // its own history entry, the editor never touches location here.
      options.onDeepLink(search, link);
      return;
    }
    if (win) {
      const base = win.location.href.split("?")[0] ?? "";
      win.history.replaceState(null, "", `${base}${search ? `?${search}` : ""}`);
    }
  }

  function report(text: string | null, tone: "info" | "error" = "info"): void {
    message = text;
    messageTone = tone;
  }

  function reportError(error: unknown): void {
    if (error instanceof DraftConflictError) {
      report(error.message, "error");
    } else {
      report(error instanceof Error ? error.message : String(error), "error");
    }
    options.onError?.(error);
  }

  // Every editor action funnels through here: emit canonical mutations,
  // apply them, record the undo entry, refresh the chrome.
  async function applyMutations(mutations: Mutation[], label: string): Promise<void> {
    if (mutations.length === 0) return;
    const versionBefore = session.version;
    try {
      const response = await session.applyMutations(mutations);
      history.record({
        label,
        op: mutations[0]?.op ?? "updateNodeProps",
        mutations,
        undoPatch: response.results.flatMap((result) => result.undoPatch),
        batchId: response.undoBatchId,
        versionBefore,
        versionAfter: response.newDraftVersion,
      });
      report(null);
      render();
    } catch (error) {
      reportError(error);
      throw error;
    }
  }

  function runAction(action: EditorAction, label: string): Promise<void> {
    return applyMutations(emitMutations(action, { tree: options.tree() }), label);
  }

  /* ------------------------------------------------------------ top bar */

  function iconButton(spec: {
    id: string;
    text: string;
    title?: string;
    active?: boolean;
    enabled?: boolean;
    onClick: () => void;
  }): DomElement {
    const button = h(doc, "button", {
      className: "senify-editor__button",
      text: spec.text,
      data: {
        action: spec.id,
        ...(spec.active === undefined ? {} : { active: String(spec.active) }),
        ...(spec.enabled === undefined ? {} : { enabled: String(spec.enabled) }),
      },
      ...(spec.title === undefined ? {} : { attributes: { title: spec.title } }),
    });
    button.setAttribute("type", "button");
    if (spec.enabled === false) button.setAttribute("disabled", "disabled");
    button.addEventListener("click", spec.onClick);
    return button;
  }

  function menuItem(
    label: string,
    onClick: () => void,
    options?: { enabled?: boolean; active?: boolean; danger?: boolean; trailing?: string },
  ): DomElement {
    const item = h(doc, "button", {
      className: "senify-editor__menu-item",
      data: {
        ...(options?.enabled === undefined ? {} : { enabled: String(options.enabled) }),
        ...(options?.active === undefined ? {} : { active: String(options.active) }),
        ...(options?.danger === undefined ? {} : { danger: String(options.danger) }),
      },
    });
    item.setAttribute("type", "button");
    item.appendChild(h(doc, "span", { text: label }));
    if (options?.trailing) {
      item.appendChild(h(doc, "span", { className: "senify-editor__history-time", text: options.trailing }));
    }
    item.addEventListener("click", (event) => {
      event.stopPropagation?.();
      if (options?.enabled === false) return;
      menuOpen = null;
      if (contextMenu !== null) contextMenu = null;
      onClick();
      renderTopbar();
      renderOverlay();
    });
    return item;
  }

  function menuSeparator(): DomElement {
    return h(doc, "div", { className: "senify-editor__menu-sep" });
  }

  function menuGroup(spec: {
    id: MenuName;
    button: DomElement;
    build: () => DomElement;
    align?: "end";
  }): DomElement {
    const wrap = h(doc, "div", { className: "senify-editor__menugroup" });
    wrap.appendChild(spec.button);
    if (menuOpen === spec.id) {
      const menu = spec.build();
      if (spec.align === "end") menu.setAttribute("data-align", "end");
      menu.addEventListener("click", (event) => event.stopPropagation?.());
      wrap.appendChild(menu);
    }
    return wrap;
  }

  function toggleMenu(name: MenuName): void {
    menuOpen = menuOpen === name ? null : name;
    if (contextMenu !== null) contextMenu = null;
    renderTopbar();
  }

  function brandMenu(): DomElement {
    const menu = h(doc, "div", { className: "senify-editor__menu", data: { menu: "brand" } });
    menu.appendChild(
      menuItem("Seiten-Einstellungen", () => {
        panelMode = "page";
        renderPanelHost();
      }),
    );
    menu.appendChild(
      menuItem("Tastenkürzel anzeigen", () => {
        report(
          "Strg+Z/Y Undo/Redo · Strg+D Duplizieren · Entf Löschen · Strg+S Speichern · Esc Auswahl aufheben",
        );
        renderStatus();
      }),
    );
    menu.appendChild(menuSeparator());
    menu.appendChild(menuItem("Spotlight öffnen · Strg+K", () => openSpotlight(true)));
    return menu;
  }

  function historyMenu(): DomElement {
    const menu = h(doc, "div", { className: "senify-editor__menu", data: { menu: "history" } });
    menu.appendChild(
      menuItem("Rückgängig · Strg+Z", () => void instance.undo(), { enabled: history.canUndo }),
    );
    menu.appendChild(
      menuItem("Wiederholen · Strg+Y", () => void instance.redo(), { enabled: history.canRedo }),
    );
    const appliedEntries = history.applied();
    if (appliedEntries.length > 0) {
      menu.appendChild(menuSeparator());
      menu.appendChild(h(doc, "div", { className: "senify-editor__menu-label", text: "Verlauf" }));
      for (const entry of [...appliedEntries].reverse().slice(0, 12)) {
        menu.appendChild(
          menuItem(entry.label, () => void restoreTo(entry.id), {
            trailing: `v${entry.versionAfter}`,
          }),
        );
      }
    }
    return menu;
  }

  function publishMenu(): DomElement {
    const menu = h(doc, "div", { className: "senify-editor__menu", data: { menu: "publish" } });
    menu.appendChild(
      menuItem("Zum Review senden", () => options.onCommand?.({ type: "publish" })),
    );
    menu.appendChild(menuItem("Vorschau öffnen", () => setMode("live")));
    return menu;
  }

  async function restoreTo(entryId: string): Promise<void> {
    let guard = 0;
    while (history.canUndo && history.top()?.id !== entryId && guard < 200) {
      const entry = history.undo();
      if (!entry) break;
      await options.onUndo?.(entry);
      guard += 1;
    }
    render();
  }

  function renderTopbar(): void {
    topbar.textContent = "";
    const brandButton = h(doc, "button", {
      className: "senify-editor__brand",
      data: { action: "menu-brand" },
    });
    brandButton.setAttribute("type", "button");
    brandButton.appendChild(h(doc, "span", { className: "senify-editor__brand-mark", text: "S" }));
    brandButton.appendChild(h(doc, "span", { text: "Senify" }));
    brandButton.addEventListener("click", (event) => {
      event.stopPropagation?.();
      toggleMenu("brand");
    });
    topbar.appendChild(menuGroup({ id: "brand", button: brandButton, build: brandMenu }));
    topbar.appendChild(
      iconButton({
        id: "add",
        text: "+",
        title: "Element hinzufügen",
        active: panelMode === "widgets",
        onClick: () => openCatalog(null),
      }),
    );
    topbar.appendChild(
      iconButton({
        id: "page-settings",
        text: "Seite",
        title: "Seiten-Einstellungen",
        active: panelMode === "page",
        onClick: () => {
          panelMode = "page";
          renderPanelHost();
        },
      }),
    );
    const historyButton = iconButton({
      id: "history",
      text: "↺",
      title: "Verlauf · Rückgängig und Wiederholen",
      active: menuOpen === "history",
      onClick: () => toggleMenu("history"),
    });
    topbar.appendChild(menuGroup({ id: "history", button: historyButton, build: historyMenu }));
    const pageButton = h(doc, "button", {
      className: "senify-editor__title",
      data: { action: "page-name" },
    });
    pageButton.setAttribute("type", "button");
    pageButton.appendChild(h(doc, "strong", { text: pageMeta.title || options.page.pageId }));
    pageButton.appendChild(h(doc, "small", { text: pageMeta.path }));
    pageButton.addEventListener("click", () => {
      panelMode = "page";
      renderPanelHost();
    });
    topbar.appendChild(pageButton);
    topbar.appendChild(h(doc, "div", { className: "senify-editor__spacer" }));

    const devices = h(doc, "div", { className: "senify-editor__devices" });
    for (const device of [
      { id: "desktop" as const, label: "Desktop" },
      { id: "tablet" as const, label: "Tablet" },
      { id: "mobile" as const, label: "Mobile" },
    ]) {
      const button = h(doc, "button", {
        className: "senify-editor__button",
        text: device.label,
        data: { bp: device.id, active: String(state.activeBreakpoint === device.id) },
        attributes: { title: `${device.label}-Ansicht` },
      });
      button.setAttribute("type", "button");
      button.addEventListener("click", () => setBreakpoint(device.id));
      devices.appendChild(button);
    }
    topbar.appendChild(devices);
    topbar.appendChild(
      iconButton({
        id: "structure",
        text: "Struktur",
        title: "Struktur ein-/ausblenden",
        active: !railHidden,
        onClick: () => {
          railHidden = !railHidden;
          syncMain();
          renderTopbar();
        },
      }),
    );
    topbar.appendChild(
      iconButton({
        id: "finder",
        text: "Suchen",
        title: "Finder · Strg+K",
        onClick: () => openSpotlight(true),
      }),
    );
    const modeGroup = h(doc, "div", { className: "senify-editor__group" });
    for (const mode of ["design", "live"] as const) {
      const button = h(doc, "button", {
        className: "senify-editor__button",
        text: mode === "design" ? "Design" : "Vorschau",
        data: { mode, active: String(state.mode === mode) },
        attributes: { title: mode === "design" ? "Design-Modus" : "Vorschau-Modus" },
      });
      button.setAttribute("type", "button");
      button.addEventListener("click", () => setMode(mode));
      modeGroup.appendChild(button);
    }
    topbar.appendChild(modeGroup);
    topbar.appendChild(h(doc, "div", { className: "senify-editor__sep" }));

    const publishGroup = h(doc, "div", { className: "senify-editor__publish-group" });
    const publish = h(doc, "button", {
      className: "senify-editor__publish",
      text: "Veröffentlichen",
      data: { action: "publish" },
    });
    publish.setAttribute("type", "button");
    publish.addEventListener("click", () => options.onCommand?.({ type: "publish" }));
    const publishCaret = h(doc, "button", {
      className: "senify-editor__publish-caret",
      text: "▾",
      data: { action: "publish-menu" },
    });
    publishCaret.setAttribute("type", "button");
    publishCaret.addEventListener("click", (event) => {
      event.stopPropagation?.();
      toggleMenu("publish");
    });
    publishGroup.appendChild(publish);
    publishGroup.appendChild(publishCaret);
    const publishWrap = menuGroup({
      id: "publish",
      button: publishGroup,
      build: publishMenu,
      align: "end",
    });
    topbar.appendChild(publishWrap);
  }

  function syncMain(): void {
    main.className = railHidden
      ? "senify-editor__main senify-editor__main--norail"
      : "senify-editor__main";
  }

  /* ------------------------------------------------------------ widget catalog */

  function openCatalog(target: InsertTarget | null): void {
    insertTarget = target;
    insertHint = target === null ? null : insertHint ?? "Einfügeposition gewählt — Element wählen";
    panelMode = "widgets";
    widgetQuery = "";
    renderPanelHost();
    renderTopbar();
  }

  function startInsert(target: InsertTarget, hint: string): void {
    insertTarget = target;
    insertHint = hint;
    panelMode = "widgets";
    widgetQuery = "";
    renderTopbar();
    renderPanelHost();
  }

  // Places one golden example at a concrete position; the shared tail of the
  // catalog click, the "+" insert points and the drag & drop drop.
  function placeGolden(type: string, parent: ParentRef, index?: number): void {
    if (!options.registry.has(type)) return;
    const definition = options.registry.get(type);
    const placement = goldenTreeToMutations(definition.golden.tree, parent, index);
    void applyMutations(placement.mutations, `${definition.title} einfügen`)
      .then(() => {
        panelMode = "settings";
        select(placement.rootId);
      })
      .catch(() => undefined);
  }

  function insertWidget(type: string): void {
    const target = insertTarget;
    insertTarget = null;
    insertHint = null;
    const tree = options.tree();
    placeGolden(type, target?.parent ?? { nodeId: tree.rootNodeId }, target?.index);
  }

  function dropWidget(type: string, target: DomElement | null, clientY: number): void {
    const tree = options.tree();
    let parent: ParentRef = { nodeId: tree.rootNodeId };
    let index: number | undefined;
    const targetId = target?.getAttribute("data-node-id") ?? null;
    const placement = targetId ? siblingPlacement(targetId) : null;
    if (placement) {
      const rect = target?.getBoundingClientRect?.();
      const after = rect ? clientY > rect.top + rect.height / 2 : false;
      parent = placement.parent;
      index = placement.index + (after ? 1 : 0);
    }
    placeGolden(type, parent, index);
  }

  function renderCatalog(): void {
    const header = h(doc, "div", { className: "senify-editor__panel-header" });
    header.appendChild(h(doc, "strong", { className: "senify-editor__panel-heading", text: "Elemente" }));
    panelHost.appendChild(header);
    if (insertTarget) {
      const hint = h(doc, "div", { className: "senify-editor__hint", data: { hint: "insert" } });
      hint.appendChild(h(doc, "span", { text: insertHint ?? "Einfügeposition gewählt" }));
      const cancel = h(doc, "button", {
        className: "senify-editor__iconbtn",
        text: "✕",
        attributes: { title: "Einfügen abbrechen" },
      });
      cancel.setAttribute("type", "button");
      cancel.addEventListener("click", () => {
        insertTarget = null;
        insertHint = null;
        renderPanelHost();
      });
      hint.appendChild(cancel);
      panelHost.appendChild(hint);
    }
    const search = h(doc, "input", {
      className: "senify-editor__search",
      value: widgetQuery,
      data: { control: "widget-search" },
    });
    search.setAttribute("placeholder", "Elemente suchen");
    panelHost.appendChild(search);
    const list = h(doc, "div", { className: "senify-editor__widgets" });
    panelHost.appendChild(list);
    const paint = (): void => {
      list.textContent = "";
      const query = widgetQuery.trim().toLowerCase();
      const definitions = options.registry
        .list()
        .filter((definition) => definition.deprecated !== true)
        .filter(
          (definition) =>
            query === "" ||
            `${definition.title} ${definition.description} ${definition.type} ${definition.category}`
              .toLowerCase()
              .includes(query),
        );
      if (definitions.length === 0) {
        list.appendChild(h(doc, "div", { className: "senify-editor__empty", text: "Keine Elemente gefunden" }));
        return;
      }
      for (const category of CATEGORY_ORDER) {
        const items = definitions.filter((definition) => definition.category === category);
        if (items.length === 0) continue;
        list.appendChild(
          h(doc, "div", {
            className: "senify-editor__widget-category",
            text: CATEGORY_LABELS[category] ?? category,
          }),
        );
        const grid = h(doc, "div", { className: "senify-editor__widget-grid" });
        for (const definition of items) {
          const card = h(doc, "button", {
            className: "senify-editor__widget-card",
            data: { widget: definition.type },
            attributes: { title: definition.description, draggable: "true" },
          });
          card.setAttribute("type", "button");
          card.appendChild(h(doc, "span", { className: "senify-editor__widget-icon" }));
          card.appendChild(
            h(doc, "span", { className: "senify-editor__widget-label", text: definition.title }),
          );
          card.addEventListener("click", () => insertWidget(definition.type));
          card.addEventListener("dragstart", (event: DomEvent) => {
            dragWidget = definition.type;
            card.setAttribute("data-dragging", "true");
            const transfer = (event as { dataTransfer?: DragTransfer }).dataTransfer;
            transfer?.setData?.("text/plain", definition.type);
            if (transfer) transfer.effectAllowed = "copy";
          });
          card.addEventListener("dragend", () => {
            dragWidget = null;
            card.removeAttribute("data-dragging");
          });
          grid.appendChild(card);
        }
        list.appendChild(grid);
      }
    };
    search.addEventListener("input", () => {
      widgetQuery = search.value ?? "";
      paint();
    });
    paint();
  }

  /* ------------------------------------------------------------ settings panel */

  function renderSettings(node: Node, definition: SectionDefinition): void {
    const header = h(doc, "div", { className: "senify-editor__panel-header" });
    const back = h(doc, "button", {
      className: "senify-editor__iconbtn",
      text: "‹",
      data: { action: "settings-back" },
      attributes: { title: "Zurück zu den Elementen" },
    });
    back.setAttribute("type", "button");
    back.addEventListener("click", () => {
      panelMode = "widgets";
      renderPanelHost();
      renderTopbar();
    });
    header.appendChild(back);
    header.appendChild(
      h(doc, "strong", { className: "senify-editor__panel-heading", text: definition.title }),
    );
    panelHost.appendChild(header);
    const tabs = h(doc, "div", { className: "senify-editor__ptabs" });
    for (const tab of PANEL_TABS) {
      const button = h(doc, "button", {
        className: "senify-editor__ptab",
        text: tab.label,
        data: { ptab: tab.id, active: String(panelTab === tab.id) },
      });
      button.setAttribute("type", "button");
      button.addEventListener("click", () => {
        panelTab = tab.id;
        renderPanelHost();
      });
      tabs.appendChild(button);
    }
    panelHost.appendChild(tabs);
    if (panelTab === "advanced") {
      renderAdvanced(node, definition);
      return;
    }
    const groups = buildPanels({
      definition,
      nodeId: node.id,
      tree: options.tree(),
      breakpoint: state.activeBreakpoint,
      theme: options.theme,
    });
    const subset = groups.filter(
      (group) => (panelTab === "style") === STYLE_GROUPS.has(groupBase(group.id)),
    );
    if (subset.length === 0) {
      panelHost.appendChild(
        h(doc, "div", {
          className: "senify-editor__empty",
          text: "Keine Einstellungen in diesem Tab",
        }),
      );
    }
    for (const group of subset) panelHost.appendChild(renderGroup(group, node.id));
  }

  function renderAdvanced(node: Node, definition: SectionDefinition): void {
    const motion = buildMotionPanel({ definition, nodeId: node.id, tree: options.tree() });
    const group = h(doc, "div", { className: "senify-editor__panel", data: { group: "motion" } });
    group.appendChild(h(doc, "div", { className: "senify-editor__panel-title", text: "Motion" }));
    if (motion.presets.length === 0) {
      group.appendChild(
        h(doc, "div", { className: "senify-editor__empty", text: "Keine Motion-Presets" }),
      );
    } else {
      const presetSelect = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "motion-preset" },
      });
      for (const preset of motion.presets) {
        const option = h(doc, "option", { text: preset, attributes: { value: preset } });
        if (preset === (motion.preset ?? motion.presets[0])) {
          option.setAttribute("selected", "selected");
        }
        presetSelect.appendChild(option);
      }
      const intensity = h(doc, "input", {
        className: "senify-editor__control",
        value: String(motion.intensity),
        data: { control: "motion-intensity" },
      });
      intensity.setAttribute("type", "number");
      intensity.setAttribute("min", "1");
      intensity.setAttribute("max", "10");
      const triggerSelect = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "motion-trigger" },
      });
      for (const trigger of ["viewport", "load", "scroll", "hover"]) {
        const option = h(doc, "option", { text: trigger, attributes: { value: trigger } });
        if (trigger === motion.trigger) option.setAttribute("selected", "selected");
        triggerSelect.appendChild(option);
      }
      const delay = h(doc, "input", {
        className: "senify-editor__control",
        value: String(motion.delay),
        data: { control: "motion-delay" },
      });
      delay.setAttribute("type", "number");
      delay.setAttribute("min", "0");
      const dispatch = (): void => {
        void runAction(
          {
            kind: "motion",
            nodeId: node.id,
            spec: {
              preset: presetSelect.value ?? motion.presets[0] ?? "",
              intensity: Number(intensity.value ?? motion.intensity) || motion.intensity,
              trigger: (triggerSelect.value ?? motion.trigger) as
                | "load"
                | "scroll"
                | "viewport"
                | "hover",
              delay: Number(delay.value ?? motion.delay) || 0,
            },
          },
          "Motion ändern",
        ).catch(() => undefined);
      };
      const row = (label: string, control: DomElement): DomElement => {
        const field = h(doc, "div", { className: "senify-editor__field", data: { key: `motion-${label}` } });
        field.appendChild(h(doc, "label", { className: "senify-editor__label", text: label }));
        field.appendChild(control);
        return field;
      };
      group.appendChild(row("Preset", presetSelect));
      group.appendChild(row("Intensität", intensity));
      group.appendChild(row("Auslöser", triggerSelect));
      group.appendChild(row("Verzögerung", delay));
      for (const control of [presetSelect, intensity, triggerSelect, delay]) {
        control.addEventListener("change", dispatch);
      }
      if (motion.preset !== null) {
        const remove = h(doc, "button", {
          className: "senify-editor__reset",
          text: "Motion entfernen",
          data: { action: "motion-remove" },
        });
        remove.setAttribute("type", "button");
        remove.addEventListener("click", () => {
          void runAction({ kind: "motion", nodeId: node.id, spec: null }, "Motion entfernen").catch(
            () => undefined,
          );
        });
        group.appendChild(remove);
      }
    }
    panelHost.appendChild(group);

    const visibility = h(doc, "div", {
      className: "senify-editor__panel",
      data: { group: "visibility" },
    });
    visibility.appendChild(
      h(doc, "div", { className: "senify-editor__panel-title", text: "Sichtbarkeit" }),
    );
    const hideRow = h(doc, "div", { className: "senify-editor__field", data: { key: "hidden" } });
    hideRow.appendChild(
      h(doc, "label", {
        className: "senify-editor__label",
        text: `Auf ${state.activeBreakpoint} ausblenden`,
      }),
    );
    const hideBox = h(doc, "input", { className: "senify-editor__control", data: { control: "hidden" } });
    hideBox.setAttribute("type", "checkbox");
    if (isHiddenAt(options.tree(), node.id, state.activeBreakpoint)) {
      hideBox.setAttribute("checked", "checked");
    }
    hideBox.addEventListener("change", () => toggleHidden(node.id));
    hideRow.appendChild(hideBox);
    visibility.appendChild(hideRow);
    panelHost.appendChild(visibility);
  }

  function renderPageSettings(): void {
    const header = h(doc, "div", { className: "senify-editor__panel-header" });
    const back = h(doc, "button", {
      className: "senify-editor__iconbtn",
      text: "‹",
      data: { action: "page-back" },
      attributes: { title: "Zurück" },
    });
    back.setAttribute("type", "button");
    back.addEventListener("click", () => {
      panelMode = state.selectedNodeId ? "settings" : "widgets";
      renderPanelHost();
      renderTopbar();
    });
    header.appendChild(back);
    header.appendChild(
      h(doc, "strong", { className: "senify-editor__panel-heading", text: "Seiten-Einstellungen" }),
    );
    panelHost.appendChild(header);
    const form = h(doc, "div", { className: "senify-editor__page-form" });
    const title = h(doc, "input", {
      className: "senify-editor__control",
      value: pageMeta.title,
      data: { control: "page-title" },
    });
    const path = h(doc, "input", {
      className: "senify-editor__control",
      value: pageMeta.path,
      data: { control: "page-path" },
    });
    const row = (label: string, control: DomElement): DomElement => {
      const field = h(doc, "div", { className: "senify-editor__field" });
      field.appendChild(h(doc, "label", { className: "senify-editor__label", text: label }));
      field.appendChild(control);
      return field;
    };
    form.appendChild(row("Titel", title));
    form.appendChild(row("Pfad", path));
    const apply = h(doc, "button", {
      className: "senify-editor__button senify-editor__button--primary",
      text: "Übernehmen",
      data: { action: "page-apply" },
    });
    apply.setAttribute("type", "button");
    apply.addEventListener("click", () => {
      const nextTitle = title.value ?? pageMeta.title;
      const nextPath = path.value ?? pageMeta.path;
      void runAction({ kind: "page-meta", title: nextTitle, path: nextPath }, "Seite ändern")
        .then(() => {
          pageMeta = { title: nextTitle, path: nextPath };
          report("Seiteneinstellungen gespeichert");
          renderTopbar();
          renderStatus();
        })
        .catch(() => undefined);
    });
    form.appendChild(apply);
    panelHost.appendChild(form);
  }

  function renderPanelHost(): void {
    panelHost.textContent = "";
    if (panelMode === "page") {
      renderPageSettings();
      return;
    }
    const selected = state.selectedNodeId;
    const node = selected ? options.tree().nodes[selected] : undefined;
    const definition =
      node && options.registry.has(node.type) ? options.registry.get(node.type) : null;
    if (panelMode === "settings" && node && definition) {
      renderSettings(node, definition);
      return;
    }
    renderCatalog();
  }

  /* ------------------------------------------------------------ settings fields */

  function renderGroup(group: PanelGroup, selected: string): DomElement {
    const isCollapsed = collapsed.has(group.id);
    const panel = h(doc, "div", {
      className: "senify-editor__panel",
      data: { group: group.id, collapsed: String(isCollapsed) },
    });
    const head = h(doc, "button", {
      className: "senify-editor__panel-title",
      text: `${isCollapsed ? "▸" : "▾"} ${group.label}`,
    });
    head.setAttribute("type", "button");
    head.addEventListener("click", () => {
      if (isCollapsed) collapsed.delete(group.id);
      else collapsed.add(group.id);
      renderPanelHost();
    });
    panel.appendChild(head);
    if (isCollapsed) return panel;
    for (const field of group.fields) {
      if (field.hidden) continue;
      panel.appendChild(renderField(field, selected));
    }
    return panel;
  }

  function dispatchProp(selected: string, field: PanelField, value: PropValue): void {
    void runAction(
      {
        kind: "prop",
        nodeId: selected,
        key: field.key,
        value,
        breakpoint: state.activeBreakpoint,
      },
      `Feld ${field.key}`,
    ).catch(() => undefined);
  }

  function renderField(field: PanelField, selected: string): DomElement {
    const row = h(doc, "div", {
      className: "senify-editor__field",
      data: { key: field.key, overridden: String(field.overridden) },
    });
    row.appendChild(h(doc, "label", { className: "senify-editor__label", text: field.label }));
    const options = field.tokenOptions;
    if (options) {
      const select = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "token-picker" },
      });
      for (const option of options) {
        select.appendChild(
          h(doc, "option", {
            text: `${option.label} · ${option.value}`,
            attributes: { value: option.ref },
          }),
        );
      }
      select.addEventListener("change", () =>
        dispatchProp(selected, field, { $token: select.value ?? "" }),
      );
      row.appendChild(select);
      if (field.literalWarning) {
        row.appendChild(
          h(doc, "span", { className: "senify-editor__warning", text: field.literalWarning }),
        );
      }
    } else if (field.control === "boolean") {
      const input = h(doc, "input", { className: "senify-editor__control", data: { control: "boolean" } });
      input.setAttribute("type", "checkbox");
      if (field.value === true) input.setAttribute("checked", "checked");
      input.addEventListener("change", () => dispatchProp(selected, field, field.value !== true));
      row.appendChild(input);
    } else if (field.control === "number") {
      const input = h(doc, "input", {
        className: "senify-editor__control",
        data: { control: "number" },
        value: field.value === undefined ? "" : String(field.value),
      });
      input.setAttribute("type", "number");
      input.addEventListener("change", () =>
        dispatchProp(selected, field, Number(input.value ?? "0")),
      );
      row.appendChild(input);
    } else if (field.control === "enum" && field.options) {
      const select = h(doc, "select", { className: "senify-editor__control", data: { control: "enum" } });
      for (const option of field.options) {
        select.appendChild(
          h(doc, "option", { text: option.label, attributes: { value: option.value } }),
        );
      }
      select.addEventListener("change", () => dispatchProp(selected, field, select.value ?? ""));
      row.appendChild(select);
    } else {
      const tag = field.control === "text" || field.control === "richtext" ? "textarea" : "input";
      const input = h(doc, tag, {
        className: "senify-editor__control",
        data: { control: field.control },
        value: typeof field.value === "string" ? field.value : "",
      });
      input.addEventListener("change", () => dispatchProp(selected, field, input.value ?? ""));
      row.appendChild(input);
    }
    if (field.overrideBreakpoints.length > 0) {
      const dots = h(doc, "span", { className: "senify-editor__device-dots" });
      for (const breakpoint of field.overrideBreakpoints) {
        const dot = h(doc, "span", {
          className: "senify-editor__device-dot",
          data: { dot: breakpoint },
          attributes: { role: "button", title: `Override für ${breakpoint} — Ansicht wechseln` },
        });
        dot.addEventListener("click", () => setBreakpoint(breakpoint));
        dots.appendChild(dot);
      }
      row.appendChild(dots);
    }
    if (field.overridden && isOverrideBreakpoint(field.target)) {
      row.appendChild(
        h(doc, "span", {
          className: "senify-editor__badge",
          text: `Override ${field.target}`,
          data: { badge: field.target },
        }),
      );
      const reset = h(doc, "button", { className: "senify-editor__reset", text: "Reset" });
      reset.setAttribute("type", "button");
      reset.addEventListener("click", () => {
        if (!isOverrideBreakpoint(field.target)) return;
        void runAction(
          { kind: "override-reset", nodeId: selected, key: field.key, breakpoint: field.target },
          `Override zurücksetzen · ${field.key}`,
        ).catch(() => undefined);
      });
      row.appendChild(reset);
    }
    return row;
  }

  /* ------------------------------------------------------------ frames and stage */

  function renderFrames(): void {
    framesHost.textContent = "";
    renderer.destroy();
    mountedFrames.length = 0;
    const placements = framePlacements(state);
    framesForState(state).forEach((frame, index) => {
      const placement = placements[index];
      const live = frame.width === null;
      const offsetLeft = live ? 0 : (placement?.left ?? 0) + STAGE_OFFSET;
      const offsetTop = live ? 0 : (placement?.top ?? 0) + STAGE_OFFSET;
      const wrap = h(doc, "div", {
        className: "senify-editor__frame",
        data: { breakpoint: frame.breakpoint },
        style: live
          ? { left: "0", top: "0", width: "100%", height: "100%" }
          : {
              left: `${offsetLeft}px`,
              top: `${offsetTop}px`,
              width: `${frame.width ?? 0}px`,
              height: `${frame.height ?? 0}px`,
              transform: `scale(${frame.scale})`,
              transformOrigin: "0 0",
            },
      });
      const iframe = h(doc, "iframe", {
        className: "senify-editor__iframe",
        attributes: { title: frame.label, "data-frame": frame.breakpoint },
        style: { width: "100%", height: "100%", border: "0" },
      });
      const mount = (): void => {
        const body = iframe.contentWindow?.document.body ?? null;
        if (!body) return;
        renderer.mount(frame, body, {
          tree: options.tree(),
          registry: options.registry,
          breakpoint: frame.breakpoint,
        });
        // The first mount can land in the initial about:blank document, which
        // the srcdoc load replaces. Keep exactly one live entry per frame:
        // a stale detached body reports zero-size rects to the overlay.
        const stale = mountedFrames.findIndex((entry) => entry.wrap === wrap);
        if (stale >= 0) mountedFrames.splice(stale, 1);
        mountedFrames.push({ frame, wrap, body, offsetLeft, offsetTop });
        wireFrameBody(body);
        syncSelectionRing();
        renderOverlay();
      };
      iframe.addEventListener("load", mount);
      iframe.setAttribute("srcdoc", frameDoc(options.frameStyles));
      wrap.appendChild(iframe);
      framesHost.appendChild(wrap);
      mount();
    });
  }

  function wireFrameBody(body: DomElement): void {
    body.addEventListener("click", (event: DomEvent) => {
      if (inline.session) return;
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]");
      const nodeId = target?.getAttribute("data-node-id") ?? null;
      if (!nodeId) return;
      const next = event.altKey === true ? parentIdOf(nodeId) ?? nodeId : nodeId;
      if (next !== state.selectedNodeId) select(next);
      event.stopPropagation?.();
    });
    body.addEventListener("contextmenu", (event: DomEvent) => {
      if (inline.session) return;
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]");
      const nodeId = target?.getAttribute("data-node-id") ?? null;
      if (!nodeId) return;
      event.preventDefault?.();
      select(nodeId);
      const mounted = mountedFrames.find((entry) => entry.body === body);
      const scale = mounted?.frame.scale ?? 1;
      contextMenu = {
        nodeId,
        left: (mounted?.offsetLeft ?? 0) + (event.clientX ?? 0) * scale,
        top: (mounted?.offsetTop ?? 0) + (event.clientY ?? 0) * scale,
      };
      renderOverlay();
    });
    body.addEventListener("dblclick", (event: DomEvent) => {
      const target = (event.target as DomElement | null)?.closest?.("[data-inline]");
      if (!target) return;
      const nodeId =
        target.getAttribute("data-inline-node") ?? target.getAttribute("data-node-id");
      const key = target.getAttribute("data-prop-key");
      if (!nodeId || !key) return;
      startInline(target, nodeId, key);
      event.preventDefault?.();
    });
    body.addEventListener("input", (event: DomEvent) => {
      const target = (event.target as DomElement | null)?.closest?.("[data-inline]");
      if (!target || !inline.session) return;
      // Keep the local session value current (Escape/Enter use it), the
      // server write follows on the idle tick.
      inline.type(target.textContent ?? "");
      scheduleInlineCommit();
    });
    body.addEventListener("focusout", () => {
      if (inlineTimer !== null) flushInlineCommit();
    });
    // Widgets dragged out of the catalog: the frame document owns the drop
    // events (an iframe swallows them from the parent document), so the
    // listeners live here. The drop position comes from the node under the
    // pointer and its vertical midpoint.
    body.addEventListener("dragenter", (event: DomEvent) => {
      if (dragWidget === null) return;
      event.preventDefault?.();
    });
    body.addEventListener("dragover", (event: DomEvent) => {
      if (dragWidget === null) return;
      event.preventDefault?.();
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]") ?? null;
      showDropLine(body, target, event.clientY ?? 0);
    });
    body.addEventListener("dragleave", (event: DomEvent) => {
      if (dragWidget === null) return;
      const related = (event as { relatedTarget?: unknown }).relatedTarget;
      if (related && body.contains?.(related) === true) return;
      clearDropLine(body);
    });
    body.addEventListener("drop", (event: DomEvent) => {
      if (dragWidget === null) return;
      event.preventDefault?.();
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]") ?? null;
      const clientY = event.clientY ?? 0;
      clearDropLine(body);
      const type = dragWidget;
      dragWidget = null;
      dropWidget(type, target, clientY);
    });
    body.addEventListener("keydown", (event: DomEvent) => {
      if (!inline.session) return;
      if (event.key === "Escape") {
        void revertInline();
        return;
      }
      if (event.key === "Enter") {
        void finishInline();
      }
    });
  }

  // The blue line Elementor draws between sections while dragging.
  function showDropLine(body: DomElement, target: DomElement | null, clientY: number): void {
    const frameDocument = body.ownerDocument;
    if (!frameDocument) return;
    let line = body.querySelector(".senify-drop-line");
    if (!line) {
      line = h(frameDocument, "div", { className: "senify-drop-line" });
      body.appendChild(line);
    }
    let y = 10;
    if (target) {
      const rect = target.getBoundingClientRect?.();
      if (rect) {
        y = clientY > rect.top + rect.height / 2 ? rect.top + rect.height : rect.top;
      }
    }
    line.style.top = `${Math.max(0, Math.round(y) - 1)}px`;
  }

  function clearDropLine(body: DomElement): void {
    body.querySelector(".senify-drop-line")?.remove();
  }

  function parentIdOf(nodeId: string): string | null {
    const tree = options.tree();
    if (nodeId === tree.rootNodeId) return null;
    const visit = (ownerId: string): string | null => {
      const owner = tree.nodes[ownerId];
      if (!owner) return null;
      for (const childId of owner.children ?? []) {
        if (childId === nodeId) return ownerId;
        const found = visit(childId);
        if (found) return found;
      }
      for (const list of Object.values(owner.slots ?? {})) {
        for (const childId of list) {
          if (childId === nodeId) return ownerId;
          const found = visit(childId);
          if (found) return found;
        }
      }
      return null;
    };
    return visit(tree.rootNodeId);
  }

  // Where a node sits in its owner list — the anchor for insert points and
  // the move commands of the context menu.
  function siblingPlacement(
    nodeId: string,
  ): { parent: ParentRef; index: number; count: number } | null {
    const tree = options.tree();
    const visit = (ownerId: string): { parent: ParentRef; index: number; count: number } | null => {
      const owner = tree.nodes[ownerId];
      if (!owner) return null;
      const lists: { slot: string | null; ids: string[] }[] = [
        { slot: null, ids: owner.children ?? [] },
        ...Object.entries(owner.slots ?? {}).map(([slot, ids]) => ({ slot, ids: [...ids] })),
      ];
      for (const list of lists) {
        const index = list.ids.indexOf(nodeId);
        if (index >= 0) {
          return {
            parent: list.slot === null ? { nodeId: ownerId } : { nodeId: ownerId, slot: list.slot },
            index,
            count: list.ids.length,
          };
        }
      }
      for (const list of lists) {
        for (const childId of list.ids) {
          const found = visit(childId);
          if (found) return found;
        }
      }
      return null;
    };
    return visit(tree.rootNodeId);
  }

  function syncSelectionRing(): void {
    for (const mounted of mountedFrames) {
      for (const element of mounted.body.querySelectorAll("[data-node-id]")) {
        const id = element.getAttribute("data-node-id");
        if (id !== null && id === state.selectedNodeId) {
          element.setAttribute("data-selected", "true");
        } else {
          element.removeAttribute("data-selected");
        }
      }
    }
  }

  function selectionRect(
    nodeId: string,
  ): { left: number; top: number; width: number; height: number } | null {
    for (const mounted of mountedFrames) {
      const element = mounted.body.querySelector(`[data-node-id="${nodeId}"]`);
      if (!element) continue;
      const rect = element.getBoundingClientRect?.();
      if (!rect) continue;
      const scale = mounted.frame.scale;
      return {
        left: mounted.offsetLeft + rect.left * scale,
        top: mounted.offsetTop + rect.top * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      };
    }
    return null;
  }

  function inlineTargetFor(nodeId: string): DomElement | null {
    for (const mounted of mountedFrames) {
      const found = mounted.body.querySelector(`[data-inline-node="${nodeId}"]`);
      if (found) return found;
    }
    return null;
  }

  function startInline(target: DomElement, nodeId: string, key: string): void {
    inline.start({ nodeId, key, value: target.textContent ?? "" });
    target.setAttribute("contenteditable", "plaintext-only");
    target.focus?.();
    inlineElement = target;
    renderOverlay();
  }

  // Enter or the toolbar's "Fertig": flush the pending write, keep the edit,
  // drop the editing mode.
  async function finishInline(): Promise<void> {
    if (inlineTimer !== null) {
      clearTimeout(inlineTimer);
      inlineTimer = null;
      const target = inlineElement;
      if (target && inline.session) await commitInline(target.textContent ?? "");
    }
    inlineElement?.removeAttribute("contenteditable");
    if (inline.session) inline.commit();
    inlineElement = null;
    renderOverlay();
  }

  function editNodeInline(nodeId: string): void {
    const target = inlineTargetFor(nodeId);
    if (!target) {
      report("Dieses Element hat keinen bearbeitbaren Text.");
      renderStatus();
      return;
    }
    const key = target.getAttribute("data-prop-key");
    if (!key) return;
    startInline(target, nodeId, key);
  }

  async function commitInline(value: string): Promise<void> {
    if (!inline.session) return;
    if (value === inline.session.original && inline.session.entryId === null) return;
    const { mutation } = inline.type(value);
    const versionBefore = session.version;
    try {
      const response = await session.applyMutations([mutation]);
      inline.record({
        undoPatch: response.results.flatMap((result) => result.undoPatch),
        batchId: response.undoBatchId,
        versionBefore,
        versionAfter: response.newDraftVersion,
      });
      report(null);
    } catch (error) {
      reportError(error);
    }
  }

  function scheduleInlineCommit(): void {
    if (inlineTimer !== null) clearTimeout(inlineTimer);
    inlineTimer = setTimeout(() => {
      inlineTimer = null;
      const target = inlineElement;
      if (!target || !inline.session) return;
      void commitInline(target.textContent ?? "");
    }, 350);
  }

  function flushInlineCommit(): void {
    if (inlineTimer === null) return;
    clearTimeout(inlineTimer);
    inlineTimer = null;
    const target = inlineElement;
    if (!target || !inline.session) return;
    void commitInline(target.textContent ?? "");
  }

  async function revertInline(): Promise<void> {
    if (inlineTimer !== null) {
      clearTimeout(inlineTimer);
      inlineTimer = null;
    }
    inlineElement?.removeAttribute("contenteditable");
    inlineElement = null;
    if (!inline.session) {
      renderOverlay();
      return;
    }
    const { mutation } = inline.revert();
    report("Inline-Text zurückgesetzt");
    if (!mutation) {
      renderStatus();
      renderOverlay();
      return;
    }
    try {
      await session.applyMutations([mutation]);
      render();
    } catch (error) {
      reportError(error);
      renderStatus();
    }
  }

  function handleButton(
    id: string,
    glyph: string,
    title: string,
    onClick: () => void,
    enabled = true,
  ): DomElement {
    const button = h(doc, "button", {
      className: `senify-editor__handle-btn${id === "grip" ? " senify-editor__handle-grip" : ""}`,
      text: glyph,
      data: { action: id },
      attributes: { title: enabled ? title : `${title} — gesperrt` },
    });
    button.setAttribute("type", "button");
    if (!enabled) button.setAttribute("disabled", "disabled");
    if (enabled) button.addEventListener("click", onClick);
    return button;
  }

  function renderOverlay(): void {
    overlay.textContent = "";
    if (state.mode !== "design") return;
    const nodeId = inline.session?.nodeId ?? state.selectedNodeId;
    if (nodeId !== null) renderSelectionOverlay(nodeId);
    if (inline.session) renderInlineBar(inline.session.nodeId);
    if (contextMenu !== null) renderContextMenu();
  }

  // While inline editing: a small bar with "Fertig" and "Verwerfen"
  // (Enter/Escape equivalents) so the mode is discoverable and escapable
  // without the keyboard.
  function renderInlineBar(nodeId: string): void {
    const rect = selectionRect(nodeId);
    if (!rect) return;
    const bar = h(doc, "div", {
      className: "senify-editor__inline-bar",
      data: { inline: nodeId },
      style: {
        left: `${Math.max(0, rect.left + rect.width - 158)}px`,
        top: `${Math.max(0, rect.top > 34 ? rect.top - 32 : rect.top + 2)}px`,
      },
    });
    const done = h(doc, "button", { text: "✓ Fertig", data: { action: "inline-done" } });
    done.setAttribute("type", "button");
    done.addEventListener("click", () => void finishInline());
    const discard = h(doc, "button", { text: "✕ Verwerfen", data: { action: "inline-discard" } });
    discard.setAttribute("type", "button");
    discard.addEventListener("click", () => void revertInline());
    bar.appendChild(done);
    bar.appendChild(discard);
    overlay.appendChild(bar);
  }

  function renderSelectionOverlay(nodeId: string): void {
    const tree = options.tree();
    const node = tree.nodes[nodeId];
    if (!node) return;
    const placement = siblingPlacement(nodeId);
    const rect = selectionRect(nodeId);
    const isRoot = nodeId === tree.rootNodeId;
    const locked = node.locked === true;
    if (rect) {
      // Elementor's handle hugs the element's top-left corner; at the very top
      // of the page it flips inside so it never floats over the gray stage.
      const handleTop = rect.top > 34 ? rect.top - 32 : rect.top + 2;
      const bar = h(doc, "div", {
        className: "senify-editor__handle",
        data: { handle: nodeId },
        style: {
          left: `${Math.max(0, rect.left)}px`,
          top: `${Math.max(0, handleTop)}px`,
        },
      });
      const definition = options.registry.has(node.type)
        ? options.registry.get(node.type)
        : undefined;
      const label = definition?.title ?? node.type;
      if (!isRoot) {
        bar.appendChild(
          handleButton("grip", "⠿", `${label} verschieben`, () => undefined, false),
        );
      }
      bar.appendChild(
        handleButton(
          "edit",
          "✎",
          `${label} bearbeiten`,
          () => editNodeInline(nodeId),
          inlineTargetFor(nodeId) !== null,
        ),
      );
      if (!isRoot) {
        bar.appendChild(
          handleButton("duplicate", "⧉", `${label} duplizieren`, () => duplicateNode(nodeId), !locked),
        );
        bar.appendChild(
          handleButton("delete", "✕", `${label} löschen`, () => removeNode(nodeId), !locked),
        );
      }
      overlay.appendChild(bar);
    }
    if (placement !== null) {
      const top = rect ? rect.top : null;
      const bottom = rect ? rect.top + rect.height : null;
      const center = rect ? rect.left + rect.width / 2 - 13 : null;
      if (top !== null && center !== null) {
        const before = h(doc, "button", {
          className: "senify-editor__insert",
          text: "+",
          data: { action: "insert-before" },
          attributes: { title: "Element davor einfügen" },
          style: { left: `${Math.max(0, center)}px`, top: `${Math.max(0, top - 13)}px` },
        });
        before.setAttribute("type", "button");
        before.addEventListener("click", () =>
          startInsert(
            {
              parent: placement.parent,
              index: placement.index,
            },
            "Neues Element davor einfügen",
          ),
        );
        overlay.appendChild(before);
      }
      if (bottom !== null && center !== null) {
        const after = h(doc, "button", {
          className: "senify-editor__insert",
          text: "+",
          data: { action: "insert-after" },
          attributes: { title: "Element danach einfügen" },
          style: { left: `${Math.max(0, center)}px`, top: `${Math.max(0, bottom - 13)}px` },
        });
        after.setAttribute("type", "button");
        after.addEventListener("click", () =>
          startInsert(
            {
              parent: placement.parent,
              index: placement.index + 1,
            },
            "Neues Element danach einfügen",
          ),
        );
        overlay.appendChild(after);
      }
    }
  }

  function contextItem(
    label: string,
    onClick: () => void,
    options?: { danger?: boolean; enabled?: boolean; trailing?: string },
  ): DomElement {
    const item = h(doc, "button", {
      className: "senify-editor__context-item",
      data: {
        ...(options?.danger === undefined ? {} : { danger: String(options.danger) }),
        ...(options?.enabled === undefined ? {} : { enabled: String(options.enabled) }),
      },
    });
    item.setAttribute("type", "button");
    item.appendChild(h(doc, "span", { text: label }));
    if (options?.trailing) {
      item.appendChild(h(doc, "span", { className: "senify-editor__history-time", text: options.trailing }));
    }
    item.addEventListener("click", (event) => {
      event.stopPropagation?.();
      if (options?.enabled === false) return;
      contextMenu = null;
      onClick();
      renderOverlay();
    });
    return item;
  }

  function renderContextMenu(): void {
    if (contextMenu === null) return;
    const { nodeId, left, top } = contextMenu;
    const tree = options.tree();
    const node = tree.nodes[nodeId];
    if (!node) {
      contextMenu = null;
      return;
    }
    const definition = options.registry.has(node.type) ? options.registry.get(node.type) : undefined;
    const isRoot = nodeId === tree.rootNodeId;
    const locked = node.locked === true;
    const hidden = isHiddenAt(tree, nodeId, state.activeBreakpoint);
    const menu = h(doc, "div", {
      className: "senify-editor__context",
      data: { context: nodeId },
      style: { left: `${Math.max(0, left)}px`, top: `${Math.max(0, top)}px` },
    });
    menu.addEventListener("click", (event) => event.stopPropagation?.());
    menu.appendChild(
      contextItem(`Einstellungen${definition ? ` · ${definition.title}` : ""}`, () => {
        select(nodeId);
        panelMode = "settings";
        panelTab = "content";
        renderPanelHost();
      }),
    );
    menu.appendChild(
      contextItem(
        "Text bearbeiten",
        () => editNodeInline(nodeId),
        { enabled: inlineTargetFor(nodeId) !== null },
      ),
    );
    menu.appendChild(menuSeparator());
    const placement = siblingPlacement(nodeId);
    menu.appendChild(
      contextItem("Duplizieren", () => duplicateNode(nodeId), {
        enabled: !isRoot && !locked,
        trailing: "Strg+D",
      }),
    );
    menu.appendChild(
      contextItem("Nach oben", () => moveNode(nodeId, (placement?.index ?? 0) - 1), {
        enabled: !isRoot && !locked && placement !== null && placement.index > 0,
      }),
    );
    menu.appendChild(
      contextItem("Nach unten", () => moveNode(nodeId, placement?.index ?? 0), {
        enabled:
          !isRoot &&
          !locked &&
          placement !== null &&
          placement.index < placement.count - 1,
      }),
    );
    menu.appendChild(
      contextItem(hidden ? "Einblenden" : "Ausblenden", () => toggleHidden(nodeId), {
        enabled: !isRoot,
      }),
    );
    menu.appendChild(menuSeparator());
    menu.appendChild(
      contextItem("Löschen", () => removeNode(nodeId), {
        danger: true,
        enabled: !isRoot && !locked,
        trailing: "Entf",
      }),
    );
    overlay.appendChild(menu);
  }

  function duplicateNode(nodeId: string): void {
    void runAction({ kind: "duplicate", nodeId }, "Knoten duplizieren").catch(() => undefined);
  }

  function removeNode(nodeId: string): void {
    const tree = options.tree();
    if (nodeId === tree.rootNodeId) return;
    const parent = parentIdOf(nodeId);
    void applyMutations(emitMutations({ kind: "delete", nodeId }, { tree }), "Knoten löschen")
      .then(() => {
        if (state.selectedNodeId === nodeId) select(parent);
      })
      .catch(() => undefined);
  }

  // `index` is the post-removal position (engine contract): moving one slot
  // up is index-1, one slot down is index.
  function moveNode(nodeId: string, index: number): void {
    const placement = siblingPlacement(nodeId);
    if (!placement) return;
    if (index < 0 || index > placement.count - 1) return;
    void runAction({ kind: "move", nodeId, target: placement.parent, index }, "Knoten verschieben")
      .catch(() => undefined);
  }

  function toggleHidden(nodeId: string): void {
    const hidden = isHiddenAt(options.tree(), nodeId, state.activeBreakpoint);
    void runAction(
      { kind: "hide", nodeId, hidden: !hidden, breakpoint: state.activeBreakpoint },
      hidden ? "Knoten einblenden" : "Knoten ausblenden",
    )
      .then(() => {
        renderPanelHost();
      })
      .catch(() => undefined);
  }

  /* ------------------------------------------------------------ rail (structure) */

  function renderRail(): void {
    rail.textContent = "";
    const tabs = h(doc, "div", { className: "senify-editor__tabs" });
    for (const tab of EXPLORER_TABS) {
      const button = h(doc, "button", {
        className: "senify-editor__tab",
        text: tab.label,
        data: { tab: tab.id, active: String(activeTab === tab.id) },
      });
      button.setAttribute("type", "button");
      button.addEventListener("click", () => {
        activeTab = tab.id;
        renderRail();
      });
      tabs.appendChild(button);
    }
    rail.appendChild(tabs);
    const list = h(doc, "div", { className: "senify-editor__list" });
    if (activeTab === "layers") {
      for (const item of buildLayerList(options.tree(), { registry: options.registry })) {
        list.appendChild(layerRow(item));
      }
    } else if (activeTab === "pages") {
      for (const page of options.pages?.() ?? []) {
        const row = h(doc, "button", {
          className: "senify-editor__row",
          text: `${page.title} · ${page.path}`,
          data: { page: page.id, active: String(page.id === options.page.pageId) },
        });
        row.setAttribute("type", "button");
        row.addEventListener("click", () =>
          options.onCommand?.({ type: "open-page", pageId: page.id }),
        );
        list.appendChild(row);
      }
      const templates = buildTemplatesSection(options.templates?.() ?? [], null);
      if (templates.length > 0) {
        list.appendChild(h(doc, "div", { className: "senify-editor__section", text: "Vorlagen" }));
        for (const template of templates) {
          list.appendChild(templateRow(template.label, template.badge, template.id));
        }
      }
    } else if (activeTab === "templates") {
      for (const template of buildTemplatesSection(options.templates?.() ?? [], null)) {
        list.appendChild(templateRow(template.label, template.badge, template.id));
      }
    } else {
      const search = h(doc, "input", { className: "senify-editor__search" });
      search.setAttribute("placeholder", "Medien suchen");
      list.appendChild(search);
      const media = buildMediaTab(options.media?.() ?? [], options.mediaQuery?.());
      for (const item of media.items) {
        list.appendChild(
          h(doc, "div", {
            className: "senify-editor__row",
            text: item.name,
            data: { media: item.id },
          }),
        );
      }
    }
    rail.appendChild(list);
  }

  function templateRow(label: string, badge: string, id: string): DomElement {
    return h(doc, "div", {
      className: "senify-editor__row",
      text: `${label} · ${badge}`,
      data: { template: id },
    });
  }

  function layerRow(item: LayerItem): DomElement {
    const row = h(doc, "div", {
      className: "senify-editor__row",
      data: {
        node: item.id,
        active: String(item.id === state.selectedNodeId),
        hidden: String(item.hidden),
        locked: String(item.locked),
      },
      attributes: { draggable: "true" },
    });
    row.appendChild(
      h(doc, "span", {
        className: "senify-editor__row-label",
        text: `${"  ".repeat(item.depth)}${item.label}`,
      }),
    );
    const eye = h(doc, "span", {
      className: "senify-editor__eye",
      text: item.hidden ? "◌" : "●",
      data: { eye: item.id },
      attributes: { role: "button", title: item.hidden ? "Einblenden" : "Ausblenden" },
    });
    eye.addEventListener("click", (event: DomEvent) => {
      event.stopPropagation?.();
      toggleHidden(item.id);
    });
    row.appendChild(eye);
    row.addEventListener("click", (event: DomEvent) => {
      // Alt-Klick steigt eine Ebene hoch (Inspect-Ladder).
      select(event.altKey ? item.parentId : item.id);
    });
    // Drag to reorder (Elementor's navigator): the row under the pointer and
    // its vertical midpoint decide before/after.
    row.addEventListener("dragstart", (event: DomEvent) => {
      railDragId = item.id;
      row.setAttribute("data-dragging", "true");
      const transfer = (event as { dataTransfer?: DragTransfer }).dataTransfer;
      transfer?.setData?.("text/plain", item.id);
      if (transfer) transfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (event: DomEvent) => {
      if (railDragId === null || railDragId === item.id) return;
      event.preventDefault?.();
      const rect = row.getBoundingClientRect?.();
      const after = rect ? (event.clientY ?? 0) > rect.top + rect.height / 2 : false;
      row.setAttribute("data-drop", after ? "after" : "before");
    });
    row.addEventListener("dragleave", () => row.removeAttribute("data-drop"));
    row.addEventListener("drop", (event: DomEvent) => {
      if (railDragId === null) return;
      event.preventDefault?.();
      const rect = row.getBoundingClientRect?.();
      const after = rect ? (event.clientY ?? 0) > rect.top + rect.height / 2 : false;
      const source = railDragId;
      railDragId = null;
      row.removeAttribute("data-drop");
      if (source !== item.id) moveNodeTo(source, item.id, after);
    });
    row.addEventListener("dragend", () => {
      railDragId = null;
      row.removeAttribute("data-dragging");
      row.removeAttribute("data-drop");
    });
    return row;
  }

  function isDescendant(tree: NodeTree, ancestorId: string, nodeId: string): boolean {
    const visit = (ownerId: string): boolean => {
      const owner = tree.nodes[ownerId];
      if (!owner) return false;
      const ids = [
        ...(owner.children ?? []),
        ...Object.values(owner.slots ?? {}).flat(),
      ];
      for (const childId of ids) {
        if (childId === nodeId) return true;
        if (visit(childId)) return true;
      }
      return false;
    };
    return visit(ancestorId);
  }

  // Reorder via the structure column: move `sourceId` next to `targetId`.
  function moveNodeTo(sourceId: string, targetId: string, after: boolean): void {
    const tree = options.tree();
    if (sourceId === tree.rootNodeId) return;
    if (sourceId === targetId || isDescendant(tree, sourceId, targetId)) return;
    const from = siblingPlacement(sourceId);
    const to = siblingPlacement(targetId);
    if (!from || !to) return;
    const sameList =
      from.parent.nodeId === to.parent.nodeId && from.parent.slot === to.parent.slot;
    let index = to.index + (after ? 1 : 0);
    if (sameList && from.index < index) index -= 1;
    const maxIndex = sameList ? to.count - 1 : to.count;
    if (index < 0 || index > maxIndex) return;
    void runAction({ kind: "move", nodeId: sourceId, target: to.parent, index }, "Knoten verschieben")
      .catch(() => undefined);
  }

  /* ------------------------------------------------------------ spotlight */

  function renderSpotlight(): void {
    if (!spotlightOpen) {
      spotlight.setAttribute("hidden", "hidden");
      return;
    }
    spotlight.removeAttribute("hidden");
    spotlightList.textContent = "";
    for (const item of searchSpotlight(spotlightIndex(), spotlightQuery)) {
      const row = h(doc, "button", {
        className: "senify-editor__spotlight-row",
        text: `${item.label} — ${item.description}`,
        data: { kind: item.kind },
      });
      row.setAttribute("type", "button");
      row.addEventListener("click", () => {
        if (item.command.type === "insert-section") {
          const definition = options.registry.has(item.command.sectionType)
            ? options.registry.get(item.command.sectionType)
            : undefined;
          if (definition) {
            void applyMutations(
              goldenTreeToMutations(definition.golden.tree, { nodeId: options.tree().rootNodeId })
                .mutations,
              `${definition.title} einfügen`,
            ).catch(() => undefined);
          }
        } else {
          options.onCommand?.(item.command);
        }
        openSpotlight(false);
      });
      spotlightList.appendChild(row);
    }
  }

  function spotlightIndex(): SpotlightItem[] {
    return buildSpotlightIndex({
      pages: options.pages?.() ?? [],
      registry: options.registry,
      currentPageId: options.page.pageId,
    });
  }

  /* ------------------------------------------------------------ status footer */

  function renderStatus(): void {
    status.textContent = "";
    status.setAttribute("data-tone", messageTone);
    if (state.mode === "design") {
      const zoomGroup = h(doc, "div", { className: "senify-editor__zoom" });
      zoomGroup.appendChild(iconButton({ id: "zoom-out", text: "−", title: "Herauszoomen", onClick: () => zoomByStep(-0.1) }));
      zoomGroup.appendChild(
        iconButton({
          id: "zoom-reset",
          text: `${Math.round(state.design.zoom * 100)} %`,
          title: "Zoom zurücksetzen",
          onClick: () => resetZoom(),
        }),
      );
      zoomGroup.appendChild(iconButton({ id: "zoom-in", text: "+", title: "Hineinzoomen", onClick: () => zoomByStep(0.1) }));
      status.appendChild(zoomGroup);
    }
    const text =
      message ??
      (state.mode === "live" ? "Vorschau-Modus — Bearbeitung im Design-Modus" : "");
    status.appendChild(h(doc, "div", { className: "senify-editor__status-message", text }));
    if (message) {
      const reload = h(doc, "button", { className: "senify-editor__reload", text: "Neu laden" });
      reload.setAttribute("type", "button");
      reload.addEventListener("click", () => {
        report(null);
        void options.onRefresh?.();
        render();
      });
      status.appendChild(reload);
    }
  }

  /* ------------------------------------------------------------ lifecycle */

  function render(): void {
    syncMain();
    renderTopbar();
    renderFrames();
    renderRail();
    renderPanelHost();
    renderOverlay();
    renderSpotlight();
    renderStatus();
  }

  function setMode(mode: FrameState["mode"]): void {
    state = setModeState(state, mode);
    syncDeepLink();
    render();
  }

  function setBreakpoint(breakpoint: FrameBreakpoint): void {
    state = setBreakpointState(state, breakpoint);
    syncDeepLink();
    renderTopbar();
    renderPanelHost();
    renderOverlay();
    focusActiveFrame();
  }

  function focusActiveFrame(): void {
    if (state.mode !== "design") return;
    const mounted = mountedFrames.find(
      (entry) => entry.frame.breakpoint === state.activeBreakpoint,
    );
    if (!mounted) return;
    stage.scrollLeft = Math.max(0, mounted.offsetLeft - STAGE_OFFSET);
  }

  function select(nodeId: string | null): void {
    state = selectNode(state, nodeId);
    if (nodeId === null && panelMode === "settings") panelMode = "widgets";
    if (nodeId !== null && panelMode === "widgets" && insertTarget === null) {
      panelMode = "settings";
    }
    contextMenu = null;
    syncDeepLink();
    renderTopbar();
    renderRail();
    renderPanelHost();
    syncSelectionRing();
    renderOverlay();
  }

  function zoomByStep(delta: number): void {
    state = zoomBy(state, delta);
    renderFrames();
    renderTopbar();
    renderOverlay();
    renderStatus();
  }

  function resetZoom(): void {
    state = panBy(setZoom(state, 0.5), -state.design.pan.x, -state.design.pan.y);
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    renderFrames();
    renderTopbar();
    renderOverlay();
    renderStatus();
  }

  function openSpotlight(open?: boolean): void {
    spotlightOpen = open ?? !spotlightOpen;
    if (spotlightOpen) spotlightInput.focus?.();
    renderSpotlight();
  }

  spotlightInput.addEventListener("input", () => {
    spotlightQuery = spotlightInput.value ?? "";
    renderSpotlight();
  });

  const closeFloating = (): void => {
    if (menuOpen !== null) {
      menuOpen = null;
      renderTopbar();
    }
    if (contextMenu !== null) {
      contextMenu = null;
      renderOverlay();
    }
  };
  const onStageScroll = (): void => renderOverlay();
  const onResize = (): void => renderOverlay();
  doc.addEventListener("click", closeFloating);
  stage.addEventListener("scroll", onStageScroll);

  const onKeydown = (event: DomEvent): void => {
    const modifier = event.metaKey === true || event.ctrlKey === true;
    const key = (event.key ?? "").toLowerCase();
    const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
    const tag = target?.tagName?.toLowerCase() ?? "";
    const editable =
      tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable === true;
    if (modifier && key === "k") {
      openSpotlight(true);
      event.preventDefault?.();
      return;
    }
    if (event.key === "Escape") {
      if (menuOpen !== null) {
        menuOpen = null;
        renderTopbar();
        return;
      }
      if (contextMenu !== null) {
        contextMenu = null;
        renderOverlay();
        return;
      }
      if (spotlightOpen) {
        openSpotlight(false);
        return;
      }
      if (!editable && state.selectedNodeId !== null) select(null);
      return;
    }
    if (editable) return;
    if (modifier && key === "s") {
      event.preventDefault?.();
      report(`Entwurf gespeichert · v${session.version}`);
      renderStatus();
      return;
    }
    if (modifier && key === "z") {
      if (event.shiftKey === true) void instance.redo();
      else void instance.undo();
      event.preventDefault?.();
      return;
    }
    if (modifier && key === "y") {
      void instance.redo();
      event.preventDefault?.();
      return;
    }
    if (modifier && key === "d" && state.selectedNodeId !== null) {
      event.preventDefault?.();
      duplicateNode(state.selectedNodeId);
      return;
    }
    if (key === "delete" && state.selectedNodeId !== null) {
      event.preventDefault?.();
      removeNode(state.selectedNodeId);
    }
  };
  const keyboardTarget: DomDocument | DomWindow = win ?? doc;
  keyboardTarget.addEventListener("keydown", onKeydown);
  if (win) win.addEventListener("resize", onResize);

  const instance: EditorInstance = {
    state: () => state,
    history,
    inline,
    session,
    deepLink,
    dispatch: (action) => runAction(action, actionLabel(action)),
    undo: async () => {
      const entry = history.undo();
      if (!entry) return;
      await options.onUndo?.(entry);
      render();
    },
    redo: async () => {
      const entry = history.redo();
      if (!entry) return;
      await options.onRedo?.(entry);
      render();
    },
    setMode,
    setBreakpoint,
    select,
    openTab: (tab) => {
      activeTab = tab;
      railHidden = false;
      syncMain();
      renderTopbar();
      renderRail();
    },
    zoom: zoomByStep,
    resetZoom,
    spotlight: (query) => searchSpotlight(spotlightIndex(), query),
    openSpotlight,
    refresh: render,
    message: () => message,
    destroy: () => {
      doc.removeEventListener("click", closeFloating);
      stage.removeEventListener("scroll", onStageScroll);
      if (win) win.removeEventListener("resize", onResize);
      keyboardTarget.removeEventListener("keydown", onKeydown);
      renderer.destroy();
      root.remove();
    },
  };

  render();
  syncDeepLink();
  return instance;
}

function actionLabel(action: EditorAction): string {
  switch (action.kind) {
    case "insert":
      return "Sektion einfügen";
    case "delete":
      return "Knoten löschen";
    case "duplicate":
      return "Knoten duplizieren";
    case "move":
      return "Knoten verschieben";
    case "wrap":
      return "Knoten umschließen";
    case "prop":
      return `Feld ${action.key}`;
    case "prop-patch":
      return "Felder ändern";
    case "override-reset":
      return `Override zurücksetzen · ${action.key}`;
    case "variant":
      return "Variante wechseln";
    case "lock":
      return action.locked ? "Knoten sperren" : "Knoten entsperren";
    case "hide":
      return action.hidden ? "Knoten ausblenden" : "Knoten einblenden";
    case "motion":
      return action.spec === null ? "Motion entfernen" : "Motion ändern";
    case "inline-text":
      return `Text bearbeiten · ${action.key}`;
    case "page-meta":
      return "Seite ändern";
  }
}
