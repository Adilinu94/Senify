import type { Node, NodeTree, PropValue, Registry } from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
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

// Frame document of one breakpoint: host stylesheets (theme tokens, section
// styles) load via frameStyles, the editor's own overlay rules stay inline.
function frameDoc(styles: readonly string[] = []): string {
  const links = styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>
html, body { margin: 0; padding: 0; }
body { font: 14px/1.5 system-ui, sans-serif; background: var(--bg-base, #ffffff); }
[data-node-id] { position: relative; outline: 1px dashed transparent; }
[data-node-id]:hover { outline-color: rgba(79,70,229,.45); }
[data-node-id][data-hidden="true"] { opacity: .35; }
[data-node-id][data-selected="true"] { outline: 2px solid #4f46e5; }
[data-inline] { cursor: text; }
[data-inline]:hover { background: rgba(79,70,229,.08); }
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
// exercisable without Puck. The shell swaps in the Puck frame renderer.
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
  let message: string | null = null;
  let spotlightOpen = false;
  let spotlightQuery = "";
  // Frame documents currently mounted: selection rings are written straight
  // into them so selecting never re-creates (and reloads) the iframes.
  const frameBodies: DomElement[] = [];

  const root = h(doc, "div", { className: "senify-editor", data: { "senify-editor": "true" } });
  // #1829: our own toolbar and overlays, never Puck's default action bar.
  const toolbar = h(doc, "div", {
    className: "senify-editor__toolbar",
    data: { toolbar: "senify" },
  });
  const main = h(doc, "div", { className: "senify-editor__main" });
  const rail = h(doc, "div", { className: "senify-editor__rail" });
  const stage = h(doc, "div", { className: "senify-editor__stage" });
  const panelHost = h(doc, "div", { className: "senify-editor__panels" });
  const status = h(doc, "div", { className: "senify-editor__status" });
  const overlay = h(doc, "div", {
    className: "senify-editor__spotlight",
    attributes: { hidden: "hidden" },
  });
  const spotlightInput = h(doc, "input", { className: "senify-editor__spotlight-input" });
  const spotlightList = h(doc, "div", { className: "senify-editor__spotlight-list" });

  overlay.appendChild(spotlightInput);
  overlay.appendChild(spotlightList);
  main.appendChild(rail);
  main.appendChild(stage);
  main.appendChild(panelHost);
  root.appendChild(toolbar);
  root.appendChild(main);
  root.appendChild(overlay);
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

  function report(text: string | null): void {
    message = text;
  }

  function reportError(error: unknown): void {
    if (error instanceof DraftConflictError) {
      report(error.message);
    } else {
      report(error instanceof Error ? error.message : String(error));
    }
    options.onError?.(error);
  }

  async function runAction(action: EditorAction, label: string): Promise<void> {
    const mutations = emitMutations(action, { tree: options.tree() });
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

  function renderToolbar(): void {
    toolbar.textContent = "";
    const modeGroup = h(doc, "div", { className: "senify-editor__group" });
    for (const mode of ["design", "live"] as const) {
      const button = h(doc, "button", {
        className: "senify-editor__button",
        text: mode === "design" ? "Design" : "Live",
        data: { mode, active: String(state.mode === mode) },
      });
      button.setAttribute("type", "button");
      button.addEventListener("click", () => setMode(mode));
      modeGroup.appendChild(button);
    }
    const bpGroup = h(doc, "div", { className: "senify-editor__group" });
    for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
      const button = h(doc, "button", {
        className: "senify-editor__button",
        text: breakpoint,
        data: { bp: breakpoint, active: String(state.activeBreakpoint === breakpoint) },
      });
      button.setAttribute("type", "button");
      button.addEventListener("click", () => setBreakpoint(breakpoint));
      bpGroup.appendChild(button);
    }
    const zoomGroup = h(doc, "div", { className: "senify-editor__group" });
    const zoomOut = h(doc, "button", { className: "senify-editor__button", text: "−" });
    zoomOut.setAttribute("type", "button");
    zoomOut.addEventListener("click", () => zoomByStep(-0.1));
    const zoomReset = h(doc, "button", {
      className: "senify-editor__button",
      text: `${Math.round(state.design.zoom * 100)} %`,
      data: { action: "zoom-reset" },
    });
    zoomReset.setAttribute("type", "button");
    zoomReset.addEventListener("click", () => resetZoom());
    const zoomIn = h(doc, "button", { className: "senify-editor__button", text: "+" });
    zoomIn.setAttribute("type", "button");
    zoomIn.addEventListener("click", () => zoomByStep(0.1));
    zoomGroup.appendChild(zoomOut);
    zoomGroup.appendChild(zoomReset);
    zoomGroup.appendChild(zoomIn);
    const historyGroup = h(doc, "div", { className: "senify-editor__group" });
    const undo = h(doc, "button", {
      className: "senify-editor__button",
      text: "Undo",
      data: { action: "undo", enabled: String(history.canUndo) },
    });
    undo.setAttribute("type", "button");
    undo.addEventListener("click", () => void instance.undo());
    const redo = h(doc, "button", {
      className: "senify-editor__button",
      text: "Redo",
      data: { action: "redo", enabled: String(history.canRedo) },
    });
    redo.setAttribute("type", "button");
    redo.addEventListener("click", () => void instance.redo());
    historyGroup.appendChild(undo);
    historyGroup.appendChild(redo);
    toolbar.appendChild(modeGroup);
    toolbar.appendChild(bpGroup);
    toolbar.appendChild(zoomGroup);
    toolbar.appendChild(historyGroup);
    toolbar.appendChild(
      h(doc, "div", {
        className: "senify-editor__title",
        text: `${options.page.title} · v${session.version}`,
      }),
    );
  }

  function wireInlineEditing(body: DomElement | null): void {
    if (!body) return;
    body.addEventListener("dblclick", (event: DomEvent) => {
      const target = (event.target as DomElement | null)?.closest?.("[data-inline]");
      if (!target) return;
      const nodeId =
        target.getAttribute("data-inline-node") ?? target.getAttribute("data-node-id");
      const key = target.getAttribute("data-prop-key");
      if (!nodeId || !key) return;
      inline.start({ nodeId, key, value: target.textContent ?? "" });
      target.setAttribute("contenteditable", "plaintext-only");
      target.focus?.();
      event.preventDefault?.();
    });
    body.addEventListener("input", (event: DomEvent) => {
      const target = (event.target as DomElement | null)?.closest?.("[data-inline]");
      if (!target || !inline.session) return;
      void commitInline(target.textContent ?? "");
    });
    body.addEventListener("keydown", (event: DomEvent) => {
      if (!inline.session) return;
      if (event.key === "Escape") {
        void revertInline();
        return;
      }
      if (event.key === "Enter") {
        const target = (event.target as DomElement | null)?.closest?.("[data-inline]");
        target?.removeAttribute("contenteditable");
        inline.commit();
      }
    });
  }

  async function commitInline(value: string): Promise<void> {
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

  async function revertInline(): Promise<void> {
    const { mutation } = inline.revert();
    report("Inline-Text zurückgesetzt");
    if (!mutation) {
      renderStatus();
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

  function renderFrames(): void {
    stage.textContent = "";
    renderer.destroy();
    frameBodies.length = 0;
    const placements = framePlacements(state);
    framesForState(state).forEach((frame, index) => {
      const placement = placements[index];
      const wrap = h(doc, "div", {
        className: "senify-editor__frame",
        data: { breakpoint: frame.breakpoint },
        style: {
          position: "absolute",
          left: `${placement?.left ?? 0}px`,
          top: `${placement?.top ?? 0}px`,
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
        if (body) {
          renderer.mount(frame, body, {
            tree: options.tree(),
            registry: options.registry,
            breakpoint: frame.breakpoint,
          });
          frameBodies.push(body);
          wireFrameSelection(body);
          syncSelectionRing();
        }
        wireInlineEditing(body);
      };
      iframe.addEventListener("load", mount);
      iframe.setAttribute("srcdoc", frameDoc(options.frameStyles));
      wrap.appendChild(iframe);
      stage.appendChild(wrap);
      mount();
    });
  }

  // Clicking a node stub selects it; Alt-click steps one level up (the same
  // inspect ladder as in the layer rail).
  function wireFrameSelection(body: DomElement): void {
    body.addEventListener("click", (event: DomEvent) => {
      if (inline.session) return;
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]");
      const nodeId = target?.getAttribute("data-node-id") ?? null;
      if (!nodeId) return;
      const next =
        event.altKey === true ? (parentIdOf(nodeId) ?? nodeId) : nodeId;
      if (next !== state.selectedNodeId) select(next);
      event.stopPropagation?.();
    });
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

  function syncSelectionRing(): void {
    for (const body of frameBodies) {
      for (const element of body.querySelectorAll("[data-node-id]")) {
        const id = element.getAttribute("data-node-id");
        if (id !== null && id === state.selectedNodeId) {
          element.setAttribute("data-selected", "true");
        } else {
          element.removeAttribute("data-selected");
        }
      }
    }
  }

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
        for (const template of templates) list.appendChild(templateRow(template.label, template.badge, template.id));
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
    const row = h(doc, "button", {
      className: "senify-editor__row",
      text: `${"  ".repeat(item.depth)}${item.label}`,
      data: {
        node: item.id,
        active: String(item.id === state.selectedNodeId),
        hidden: String(item.hidden),
        locked: String(item.locked),
      },
    });
    row.setAttribute("type", "button");
    row.addEventListener("click", (event: DomEvent) => {
      // Alt-Klick steigt eine Ebene hoch (Inspect-Ladder).
      select(event.altKey ? item.parentId : item.id);
    });
    return row;
  }

  function renderPanels(): void {
    panelHost.textContent = "";
    const selected = state.selectedNodeId;
    if (!selected) {
      panelHost.appendChild(
        h(doc, "div", { className: "senify-editor__empty", text: "Keine Auswahl" }),
      );
      return;
    }
    const node = options.tree().nodes[selected];
    if (!node) return;
    if (!options.registry.has(node.type)) return;
    const definition = options.registry.get(node.type);
    for (const group of buildPanels({
      definition,
      nodeId: selected,
      tree: options.tree(),
      breakpoint: state.activeBreakpoint,
      theme: options.theme,
    })) {
      panelHost.appendChild(renderGroup(group, selected));
    }
    const motion = buildMotionPanel({ definition, nodeId: selected, tree: options.tree() });
    const motionGroup = h(doc, "div", { className: "senify-editor__panel", data: { group: "motion" } });
    motionGroup.appendChild(h(doc, "div", { className: "senify-editor__panel-title", text: "Motion" }));
    const select = h(doc, "select", {
      className: "senify-editor__control",
      data: { control: "motion-preset" },
    });
    for (const preset of motion.presets) {
      const option = h(doc, "option", { text: preset, attributes: { value: preset } });
      if (preset === motion.preset) option.setAttribute("selected", "selected");
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      const value = select.value ?? motion.presets[0] ?? "";
      void runAction(
        {
          kind: "motion",
          nodeId: selected,
          spec: { preset: value, intensity: motion.intensity },
        },
        "Motion ändern",
      );
    });
    motionGroup.appendChild(select);
    panelHost.appendChild(motionGroup);
  }

  function renderGroup(group: PanelGroup, selected: string): DomElement {
    const panel = h(doc, "div", { className: "senify-editor__panel", data: { group: group.id } });
    panel.appendChild(h(doc, "div", { className: "senify-editor__panel-title", text: group.label }));
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
    );
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
        );
      });
      row.appendChild(reset);
    }
    return row;
  }

  function renderSpotlight(): void {
    if (!spotlightOpen) {
      overlay.setAttribute("hidden", "hidden");
      return;
    }
    overlay.removeAttribute("hidden");
    spotlightList.textContent = "";
    for (const item of searchSpotlight(spotlightIndex(), spotlightQuery)) {
      const row = h(doc, "button", {
        className: "senify-editor__spotlight-row",
        text: `${item.label} — ${item.description}`,
        data: { kind: item.kind },
      });
      row.setAttribute("type", "button");
      row.addEventListener("click", () => {
        options.onCommand?.(item.command);
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

  function renderStatus(): void {
    status.textContent = message ?? "";
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

  function render(): void {
    renderToolbar();
    renderFrames();
    renderRail();
    renderPanels();
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
    render();
  }

  function select(nodeId: string | null): void {
    state = selectNode(state, nodeId);
    syncDeepLink();
    renderRail();
    renderPanels();
    syncSelectionRing();
  }

  function zoomByStep(delta: number): void {
    state = zoomBy(state, delta);
    renderFrames();
    renderToolbar();
  }

  function resetZoom(): void {
    state = panBy(setZoom(state, 0.5), -state.design.pan.x, -state.design.pan.y);
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    renderFrames();
    renderToolbar();
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

  const onKeydown = (event: DomEvent): void => {
    const modifier = event.metaKey === true || event.ctrlKey === true;
    const key = (event.key ?? "").toLowerCase();
    if (modifier && key === "k") {
      openSpotlight();
      event.preventDefault?.();
      return;
    }
    if (event.key === "Escape" && spotlightOpen) {
      openSpotlight(false);
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
    }
  };
  const keyboardTarget: DomDocument | DomWindow = win ?? doc;
  keyboardTarget.addEventListener("keydown", onKeydown);

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
      renderRail();
    },
    zoom: zoomByStep,
    resetZoom,
    spotlight: (query) => searchSpotlight(spotlightIndex(), query),
    openSpotlight,
    refresh: render,
    message: () => message,
    destroy: () => {
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
