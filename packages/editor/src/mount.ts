import {
  MOTION_PROFILE_RULES,
  MOTION_PROFILES,
  motionProfileViolations,
  type MotionProfile,
  type Node,
  type NodeTree,
  type PropValue,
  type Registry,
  type SectionDefinition,
} from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import { resolveTheme } from "@senify/tokens";
import {
  motionConfigsForTree,
  motionDataFor,
  parseDurationMs,
  renderPageScript,
  type MotionTokens,
} from "@senify/renderer/motion";
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
import { HistoryStack, patchesToMutations, type HistoryEntry } from "./history.ts";
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
import { editorFontFaceCss } from "./ui/fonts.ts";
import {
  applyEditorSkin,
  EDITOR_SKIN_DEFAULT,
  type EditorSkin,
} from "./ui/skin.ts";
import { EDITOR_METRIC, EDITOR_ROOT_ATTRIBUTE } from "./ui/tokens.ts";
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
  // Appearance of the chrome: the new deep-water skin (default) or the previous
  // light chrome. Structure and behaviour are identical either way.
  skin?: EditorSkin;
  initialSearch?: string;
  onDeepLink?: (search: string, state: DeepLinkState) => void;
  onRefresh?: () => void | Promise<void>;
  onUndo?: (entry: HistoryEntry) => void | Promise<void>;
  onRedo?: (entry: HistoryEntry) => void | Promise<void>;
  onCommand?: (command: SpotlightCommand) => void;
  onError?: (error: unknown) => void;
  // The site profile (ticket 20): the shell hands in the current value and the
  // transport for a change. The editor validates the document against the new
  // profile before it calls — nothing changes silently (ticket 21).
  site?: { profile: MotionProfile };
  onSiteProfile?: (profile: MotionProfile) => void | Promise<void>;
  // The play preview (ticket 19, M4) loads the self-hosted motion runtime from
  // this base; the local program proxies it to the engine. Default matches the
  // proxy path, so a plain `mountEditor` works in the program.
  motionVendorBase?: string;
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
  // Hautumstellung: read/switch the chrome skin (new deep-water vs. old light).
  skin(): EditorSkin;
  setSkin(skin: EditorSkin): void;
  setBreakpoint(breakpoint: FrameBreakpoint): void;
  select(nodeId: string | null): void;
  openTab(tab: ExplorerTab): void;
  zoom(delta: number): void;
  resetZoom(): void;
  spotlight(query: string): SpotlightItem[];
  openSpotlight(open?: boolean): void;
  refresh(): void;
  message(): string | null;
  setSiteProfile(profile: MotionProfile): void;
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

// Aufgabe 29 ("Panelbreiten und Ziehen") for the running editor: two editable
// panels. The left one is the Inspektor (properties), the structure column
// beside it is the Explorer (Ebenenliste). The bounds and the defaults are the
// ones `ui-plan.md` names and `tokens.ts` carries — `--ed-w-inspector` (320px,
// 260 bis 420) and `--ed-w-explorer` (264px, 200 bis 360); they are read from
// `EDITOR_METRIC`, so there is no second number.
type PanelName = "inspector" | "explorer";
const PANEL_LIMITS: Record<PanelName, readonly [number, number]> = {
  inspector: [260, 420],
  explorer: [200, 360],
};
const PANEL_DEFAULTS: Record<PanelName, number> = {
  inspector: Number.parseInt(EDITOR_METRIC.inspector, 10),
  explorer: Number.parseInt(EDITOR_METRIC.explorer, 10),
};
const PANEL_STORAGE_KEY = "senify-editor-panelbreiten";
const PANEL_STEP = 8;

const CATEGORY_ORDER = ["structure", "content", "commerce", "media", "utility"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  structure: "Struktur",
  content: "Inhalte",
  commerce: "Commerce",
  media: "Medien",
  utility: "Werkzeuge",
};
// Aufgabe 3: the catalog card shows a real symbol per category instead of a
// blank swatch (names from `ui/icons.ts`).
const CATEGORY_ICON: Record<string, string> = {
  structure: "box",
  content: "text",
  commerce: "spark",
  media: "image",
  utility: "slider",
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

function formatTime(at: number): string {
  const date = new Date(at);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Baked contract, shared by canvas and live mode: reveal presets stamp
// `data-motion-pending` (the components do it, canvas and bake alike), so the
// first paint never flashes the un-animated state; the page script releases the
// attribute again, the failsafe and <noscript> cover the failure paths — the
// same rules Page.astro inlines.
const FRAME_PENDING_CSS = "[data-motion-pending]{opacity:0}";
const FRAME_PENDING_NOSCRIPT = "[data-motion-pending]{opacity:1 !important}";

// Frame document of one breakpoint: host stylesheets (theme tokens, section
// styles) load via frameStyles, the editor's own overlay rules stay inline.
// The bundled @font-face rules go in too, so the theme's content family (Sora)
// and the chrome family (Inter) resolve from the local files inside the frame —
// no network fetch, and `font-display: swap` keeps the first paint immediate.
function frameDoc(styles: readonly string[] = []): string {
  const links = styles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>
${FRAME_PENDING_CSS}
${editorFontFaceCss()}
html, body { margin: 0; padding: 0; }
body { font: 14px/1.5 var(--font-body, system-ui, sans-serif); background: var(--bg-base, #ffffff); }
[data-node-id] { position: relative; outline: 1px dashed transparent; outline-offset: -1px; }
[data-node-id]:hover { outline-color: rgba(208, 4, 212, .4); }
[data-node-id][data-hidden="true"] { opacity: .35; }
[data-node-id][data-selected="true"] { outline: 2px solid #d004d4; outline-offset: -2px; }
[data-inline] { cursor: text; }
[data-inline]:hover { background: rgba(208, 4, 212, .08); }
.senify-drop-line { position: fixed; left: 0; right: 0; height: 2px; background: #d004d4; z-index: 9999; pointer-events: none; }
.senify-frame-page { min-height: 100vh; }
</style><noscript><style>
${FRAME_PENDING_NOSCRIPT}
</style></noscript></head><body></body></html>`;
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
  // The site profile (ticket 20) and the last motion write's warnings (M3).
  let siteProfile: MotionProfile = options.site?.profile ?? "standard";
  let motionNotice: string | null = null;
  // The play preview (M4): the active frame runs the baked motion runtime on
  // demand in design mode; in live mode the page plays on its own (Stufe 1).
  let motionPlaying = state.mode === "live";
  const collapsed = new Set<string>();
  // Frame documents currently mounted: selection rings are written straight
  // into them so selecting never re-creates (and reloads) the iframes.
  const mountedFrames: MountedFrame[] = [];
  // Aufgabe 29: current panel widths in px (defaults from `tokens.ts`).
  const panelWidths: Record<PanelName, number> = {
    inspector: PANEL_DEFAULTS.inspector,
    explorer: PANEL_DEFAULTS.explorer,
  };

  const root = h(doc, "div", { className: "senify-editor" });
  // Aufgabe 1: the root node carries the new chrome token set. The attribute is
  // the selector `EDITOR_TOKEN_STYLES` scopes to (see `styles.ts`), so the whole
  // `--ed-*` vocabulary lands here; the old chrome keeps its own names.
  root.setAttribute(EDITOR_ROOT_ATTRIBUTE, "true");
  // Hautumstellung: the deep-water skin is on by default; `setSkin("alt")` puts
  // the previous light chrome back without touching structure or behaviour.
  let skin: EditorSkin = options.skin ?? EDITOR_SKIN_DEFAULT;
  applyEditorSkin(root, skin);
  // Live mode (M4 Stufe 1): the stage marks itself so the sheet sits in the
  // layout flow and only the iframe scrolls — native page scroll.
  const syncStageMode = (): void => {
    stage.setAttribute("data-mode", state.mode);
  };
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
  // Aufgabe 29: the two panel edges. They sit absolutely inside the grid (no
  // grid item of their own), so the column structure stays exactly as it was.
  const splitInspector = splitHandle("inspector");
  const splitExplorer = splitHandle("explorer");

  spotlight.appendChild(spotlightInput);
  spotlight.appendChild(spotlightList);
  stage.appendChild(framesHost);
  stage.appendChild(overlay);
  main.appendChild(panelHost);
  main.appendChild(rail);
  main.appendChild(stage);
  main.appendChild(splitInspector);
  main.appendChild(splitExplorer);
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
  let writes: Promise<void> = Promise.resolve();
  const redoMutations = new WeakMap<HistoryEntry, Mutation[]>();

  function enqueueWrite(write: () => Promise<void>): Promise<void> {
    const next = writes.then(write);
    writes = next.catch(() => undefined);
    return next;
  }

  function applyMutations(mutations: Mutation[], label: string): Promise<void> {
    return enqueueWrite(() => recordMutations(mutations, label));
  }

  async function recordMutations(mutations: Mutation[], label: string): Promise<void> {
    if (mutations.length === 0) return;
    const versionBefore = session.version;
    try {
      const response = await session.applyMutations(mutations);
      history.record({
        label,
        op: mutations[0]?.op ?? "updateNodeProps",
        mutations,
        undoPatch: [...response.results].reverse().flatMap((result) => result.undoPatch),
        batchId: response.undoBatchId,
        versionBefore,
        versionAfter: response.newDraftVersion,
      });
      // Surface the engine's motion warnings in the panel (M3): the write path
      // clamps and reports instead of failing, the editor shows it inline.
      if (mutations.some((mutation) => mutation.op === "setMotion" || mutation.op === "clearMotion")) {
        motionNotice = response.warnings.length > 0 ? response.warnings.join(" · ") : null;
      }
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

  // Aufgabe 3: one Phosphor mask icon per span, drawn from the local
  // `EDITOR_ICON_CSS` (the one source, mirrored by the preview). `size` is the
  // step from the plan (18 default, 16 menu, 14 row, 12, 10); `mod` carries
  // rotation classes such as `ic--back`.
  function icon(
    name: string,
    size?: 16 | 14 | 12 | 10,
    mod?: string,
  ): DomElement {
    const className = `ic ic--${name}${size === undefined ? "" : ` ic--${size}`}${
      mod === undefined ? "" : ` ${mod}`
    }`;
    const span = h(doc, "span", { className });
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  function iconButton(spec: {
    id: string;
    text?: string;
    icon?: string;
    iconSize?: 16 | 14 | 12 | 10;
    title?: string;
    active?: boolean;
    enabled?: boolean;
    onClick: () => void;
  }): DomElement {
    const button = h(doc, "button", {
      className: "senify-editor__button",
      data: {
        action: spec.id,
        ...(spec.active === undefined ? {} : { active: String(spec.active) }),
        ...(spec.enabled === undefined ? {} : { enabled: String(spec.enabled) }),
      },
      ...(spec.title === undefined ? {} : { attributes: { title: spec.title } }),
    });
    button.setAttribute("type", "button");
    if (spec.icon !== undefined) {
      button.appendChild(icon(spec.icon, spec.iconSize));
      // Ein Nur-Symbol-Ziel traegt einen vorlesbaren Namen (Aufgabe 45).
      if (spec.text === undefined && spec.title !== undefined) {
        button.setAttribute("aria-label", spec.title);
      }
    }
    if (spec.text !== undefined) button.appendChild(h(doc, "span", { text: spec.text }));
    if (spec.enabled === false) button.setAttribute("disabled", "disabled");
    button.addEventListener("click", spec.onClick);
    return button;
  }

  function menuItem(
    label: string,
    onClick: () => void,
    options?: {
      enabled?: boolean;
      active?: boolean;
      danger?: boolean;
      trailing?: string;
      icon?: string;
      iconSize?: 16 | 14 | 12 | 10;
    },
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
    if (options?.icon !== undefined) {
      item.appendChild(icon(options.icon, options.iconSize ?? 16));
    }
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
      menuItem(
        "Seiten-Einstellungen",
        () => {
          panelMode = "page";
          renderPanelHost();
        },
        { icon: "slider" },
      ),
    );
    menu.appendChild(
      menuItem(
        "Tastenkürzel anzeigen",
        () => {
          report(
            "Strg+Z/Y Undo/Redo · Strg+D Duplizieren · Entf Löschen · Strg+S Speichern · Esc Auswahl aufheben",
          );
          renderStatus();
        },
        { icon: "info" },
      ),
    );
    menu.appendChild(menuSeparator());
    menu.appendChild(
      menuItem("Spotlight öffnen · Strg+K", () => openSpotlight(true), { icon: "search" }),
    );
    return menu;
  }

  function historyMenu(): DomElement {
    const menu = h(doc, "div", { className: "senify-editor__menu", data: { menu: "history" } });
    menu.appendChild(
      menuItem("Rückgängig · Strg+Z", () => void instance.undo(), {
        enabled: history.canUndo,
        icon: "undo",
      }),
    );
    menu.appendChild(
      menuItem("Wiederholen · Strg+Y", () => void instance.redo(), {
        enabled: history.canRedo,
        icon: "redo",
      }),
    );
    const appliedEntries = history.applied();
    if (appliedEntries.length > 0) {
      menu.appendChild(menuSeparator());
      menu.appendChild(h(doc, "div", { className: "senify-editor__menu-label", text: "Verlauf" }));
      for (const entry of [...appliedEntries].reverse().slice(0, 12)) {
        menu.appendChild(
          menuItem(entry.label, () => void restoreTo(entry.id), {
            trailing: `v${entry.versionAfter} · ${formatTime(entry.at)}`,
            icon: "dot",
          }),
        );
      }
    }
    return menu;
  }

  function publishMenu(): DomElement {
    const menu = h(doc, "div", { className: "senify-editor__menu", data: { menu: "publish" } });
    menu.appendChild(
      menuItem("Zum Review senden", () => options.onCommand?.({ type: "publish" }), {
        icon: "publish",
      }),
    );
    menu.appendChild(
      menuItem("Vorschau öffnen", () => setMode("live"), { icon: "eye" }),
    );
    return menu;
  }

  async function replayHistory(direction: "undo" | "redo"): Promise<boolean> {
    const entry = direction === "undo" ? history.top() : history.future()[0];
    if (!entry) return false;
    try {
      const callback = direction === "undo" ? options.onUndo : options.onRedo;
      if (callback) {
        await callback(entry);
      } else {
        const mutations = direction === "undo"
          ? patchesToMutations(entry.undoPatch)
          : redoMutations.get(entry) ?? entry.mutations;
        const response = await session.applyMutations(mutations);
        const inverse = [...response.results].reverse().flatMap((result) => result.undoPatch);
        if (direction === "undo") redoMutations.set(entry, patchesToMutations(inverse));
      }
      if (direction === "undo") history.undo();
      else history.redo();
      report(null);
      render();
      return true;
    } catch (error) {
      reportError(error);
      renderStatus();
      return false;
    }
  }

  function restoreTo(entryId: string): Promise<void> {
    return enqueueWrite(async () => {
      let guard = 0;
      while (history.canUndo && history.top()?.id !== entryId && guard < 200) {
        if (!await replayHistory("undo")) break;
        guard += 1;
      }
      render();
    });
  }

  // The site profile select (ticket 20): the document is validated against the
  // new profile first — a change with violations is refused and listed (ticket
  // 21: nothing changes silently). The shell performs the write.
  async function changeSiteProfile(next: MotionProfile, select: DomElement): Promise<void> {
    if (next === siteProfile) return;
    const entries = Object.values(options.tree().nodes)
      .filter((node) => node.motion !== undefined)
      .map((node) => ({
        nodeId: node.id,
        preset: node.motion?.preset ?? "",
        ...(node.motion?.intensity === undefined ? {} : { intensity: node.motion.intensity }),
        ...(node.motion?.enabled === undefined ? {} : { enabled: node.motion.enabled }),
      }));
    const violations = motionProfileViolations(next, entries);
    if (violations.length > 0) {
      report(
        `Profil-Wechsel blockiert: ${violations.length} Verstoß${
          violations.length === 1 ? "" : "e"
        } — ${violations[0]?.message ?? ""}`,
        "error",
      );
      select.value = siteProfile;
      renderStatus();
      return;
    }
    try {
      await options.onSiteProfile?.(next);
      siteProfile = next;
      report(null);
    } catch (error) {
      reportError(error);
      select.value = siteProfile;
    }
    renderTopbar();
    renderPanelHost();
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
        icon: "plus",
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
      icon: "undo",
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
    if (options.site !== undefined || options.onSiteProfile !== undefined) {
      const profileWrap = h(doc, "label", {
        className: "senify-editor__profile",
        data: { role: "site-profile" },
        attributes: {
          title: `Site-Profil · Intensität ≤ ${MOTION_PROFILE_RULES[siteProfile].intensityCap}`,
        },
      });
      profileWrap.appendChild(
        h(doc, "span", { className: "senify-editor__label", text: "Profil" }),
      );
      const profileSelect = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "site-profile" },
      });
      for (const profile of MOTION_PROFILES) {
        const option = h(doc, "option", { text: profile, attributes: { value: profile } });
        if (profile === siteProfile) option.setAttribute("selected", "selected");
        profileSelect.appendChild(option);
      }
      if (options.onSiteProfile === undefined) profileSelect.setAttribute("disabled", "disabled");
      profileSelect.addEventListener("change", () => {
        void changeSiteProfile(profileSelect.value as MotionProfile, profileSelect);
      });
      profileWrap.appendChild(profileSelect);
      topbar.appendChild(profileWrap);
    }
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
    if (state.mode === "design") {
      topbar.appendChild(
        iconButton({
          id: "motion-play",
          text: "Motion",
          title: motionPlaying
            ? "Motion stoppen (aktiver Frame)"
            : "Motion im aktiven Frame abspielen",
          active: motionPlaying,
          onClick: () => toggleMotion(),
        }),
      );
    }
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
      data: { action: "publish-menu" },
    });
    publishCaret.setAttribute("type", "button");
    publishCaret.setAttribute("aria-label", "Veröffentlichungs-Menü");
    publishCaret.appendChild(icon("down", 14));
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

  /* ------------------------------------------------------- panel widths (29) */

  // Paint the panel widths onto the grid: `--ed-w-inspector` and
  // `--ed-w-explorer` sit on `main`, so the two columns and the two edges
  // (which are positioned from the same values) move together. A third state
  // attribute records the pair for the measurement, like the preview does.
  function paintPanels(): void {
    main.style.setProperty?.("--ed-w-inspector", `${panelWidths.inspector}px`);
    main.style.setProperty?.("--ed-w-explorer", `${panelWidths.explorer}px`);
    main.setAttribute("data-breiten", `${panelWidths.inspector}x${panelWidths.explorer}`);
  }

  function setPanelWidth(name: PanelName, value: number): void {
    const [min, max] = PANEL_LIMITS[name];
    panelWidths[name] = Math.round(Math.min(max, Math.max(min, value)));
    paintPanels();
    const handle = name === "inspector" ? splitInspector : splitExplorer;
    handle.setAttribute("aria-valuenow", String(panelWidths[name]));
  }

  function readPanelWidths(): void {
    try {
      const raw = win?.localStorage?.getItem(PANEL_STORAGE_KEY) ?? null;
      if (raw === null) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const name of Object.keys(PANEL_LIMITS) as PanelName[]) {
        const value = Math.round(Number(parsed[name]));
        const [min, max] = PANEL_LIMITS[name];
        if (Number.isFinite(value) && value >= min && value <= max) panelWidths[name] = value;
      }
    } catch {
      // No (or unreadable) storage: the defaults stay.
    }
  }

  function storePanelWidths(): void {
    try {
      win?.localStorage?.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelWidths));
    } catch {
      // A private window may refuse: the widths then last for this session only.
    }
  }

  // One edge: drag with the pointer, arrow keys without it, double click for the
  // default. The pointer delta widens the panel under it by exactly the distance
  // moved, so the edge stays under the finger and never jumps.
  function splitHandle(name: PanelName): DomElement {
    const [min, max] = PANEL_LIMITS[name];
    const label = name === "inspector" ? "Inspektor" : "Ebenenliste";
    const handle = h(doc, "div", {
      className: "senify-editor__split",
      data: { panel: name },
      attributes: {
        role: "separator",
        tabindex: "0",
        "aria-orientation": "vertical",
        "aria-label": `${label} ${min} bis ${max}px, Pfeiltasten oder Doppelklick auf ${PANEL_DEFAULTS[name]}px`,
        "aria-valuemin": String(min),
        "aria-valuemax": String(max),
        "aria-valuenow": String(panelWidths[name]),
      },
    });
    handle.addEventListener("pointerdown", (event: DomEvent) => {
      if (event.button !== 0) return;
      event.preventDefault?.();
      const startX = event.clientX ?? 0;
      const startWidth = panelWidths[name];
      handle.setAttribute("data-aktiv", "true");
      const move = (moveEvent: DomEvent): void => {
        setPanelWidth(name, startWidth + ((moveEvent.clientX ?? 0) - startX));
      };
      const up = (): void => {
        handle.removeAttribute("data-aktiv");
        doc.removeEventListener("pointermove", move);
        doc.removeEventListener("pointerup", up);
        storePanelWidths();
        renderOverlay();
      };
      doc.addEventListener("pointermove", move);
      doc.addEventListener("pointerup", up);
    });
    handle.addEventListener("dblclick", () => {
      setPanelWidth(name, PANEL_DEFAULTS[name]);
      storePanelWidths();
      renderOverlay();
    });
    handle.addEventListener("keydown", (event: DomEvent) => {
      const step =
        event.key === "ArrowLeft" ? -PANEL_STEP : event.key === "ArrowRight" ? PANEL_STEP : 0;
      if (step === 0) return;
      event.preventDefault?.();
      setPanelWidth(name, panelWidths[name] + step);
      storePanelWidths();
      renderOverlay();
    });
    return handle;
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
        attributes: { title: "Einfügen abbrechen", "aria-label": "Einfügen abbrechen" },
      });
      cancel.setAttribute("type", "button");
      cancel.appendChild(icon("close", 14));
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
          const swatch = h(doc, "span", { className: "senify-editor__widget-icon" });
          swatch.appendChild(icon(CATEGORY_ICON[category] ?? "box", 16));
          card.appendChild(swatch);
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
      data: { action: "settings-back" },
      attributes: { title: "Zurück zu den Elementen", "aria-label": "Zurück zu den Elementen" },
    });
    back.setAttribute("type", "button");
    back.appendChild(icon("caret", 14, "ic--back"));
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
    const motion = buildMotionPanel({
      definition,
      nodeId: node.id,
      tree: options.tree(),
      profile: siteProfile,
    });
    const group = h(doc, "div", { className: "senify-editor__panel", data: { group: "motion" } });
    group.appendChild(h(doc, "div", { className: "senify-editor__panel-title", text: "Motion" }));
    if (motion.presets.length === 0) {
      group.appendChild(
        h(doc, "div", { className: "senify-editor__empty", text: "Keine Motion-Presets" }),
      );
    } else {
      const allowsPreset = (preset: string): boolean =>
        motion.allowedPresets === "all" || motion.allowedPresets.includes(preset);
      group.appendChild(
        h(doc, "div", {
          className: "senify-editor__hint",
          data: { role: "motion-cap" },
          text: `Profil ${motion.profile} · Intensität ≤ ${motion.intensityCap}`,
        }),
      );
      if (motion.preset !== null && !allowsPreset(motion.preset)) {
        group.appendChild(
          h(doc, "div", {
            className: "senify-editor__warning",
            data: { role: "motion-profile" },
            text: `„${motion.preset}“ ist im Profil ${motion.profile} nicht erlaubt`,
          }),
        );
      }
      if (motionNotice !== null) {
        group.appendChild(
          h(doc, "div", {
            className: "senify-editor__warning",
            data: { role: "motion-notice" },
            text: motionNotice,
          }),
        );
      }
      const presetSelect = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "motion-preset" },
      });
      for (const preset of motion.presets) {
        const option = h(doc, "option", {
          text: allowsPreset(preset) ? preset : `${preset} · gesperrt`,
          attributes: { value: preset },
        });
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
      intensity.setAttribute("max", String(motion.intensityCap));
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
      const easeSelect = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "motion-ease" },
      });
      easeSelect.appendChild(h(doc, "option", { text: "Standard", attributes: { value: "" } }));
      for (const [name, value] of Object.entries(options.theme?.motion.ease ?? {})) {
        if (typeof value !== "string") continue;
        const option = h(doc, "option", { text: name, attributes: { value: name } });
        if (name === motion.tokens.ease) option.setAttribute("selected", "selected");
        easeSelect.appendChild(option);
      }
      const durationScale = h(doc, "input", {
        className: "senify-editor__control",
        value: String(motion.tokens.durationScale),
        data: { control: "motion-duration" },
      });
      durationScale.setAttribute("type", "number");
      durationScale.setAttribute("min", "0.1");
      durationScale.setAttribute("step", "0.05");
      const stagger = h(doc, "input", {
        className: "senify-editor__control",
        value: String(motion.tokens.stagger),
        data: { control: "motion-stagger" },
      });
      stagger.setAttribute("type", "number");
      stagger.setAttribute("min", "0");
      stagger.setAttribute("step", "0.05");
      const reducedSelect = h(doc, "select", {
        className: "senify-editor__control",
        data: { control: "motion-reduced" },
      });
      for (const policy of ["static", "fade", "off"] as const) {
        const option = h(doc, "option", { text: policy, attributes: { value: policy } });
        if (policy === motion.reducedMotion) option.setAttribute("selected", "selected");
        reducedSelect.appendChild(option);
      }
      let enabledValue = motion.enabled;
      const enabledBox = h(doc, "input", {
        className: "senify-editor__control",
        data: { control: "motion-enabled" },
      });
      enabledBox.setAttribute("type", "checkbox");
      if (motion.enabled) enabledBox.setAttribute("checked", "checked");
      const dispatch = (): void => {
        const rawIntensity = Number(intensity.value ?? motion.intensity) || motion.intensity;
        void runAction(
          {
            kind: "motion",
            nodeId: node.id,
            spec: {
              preset: presetSelect.value ?? motion.presets[0] ?? "",
              intensity: Math.min(motion.intensityCap, Math.max(1, rawIntensity)),
              trigger: (triggerSelect.value ?? motion.trigger) as
                | "load"
                | "scroll"
                | "viewport"
                | "hover",
              delay: Number(delay.value ?? motion.delay) || 0,
              tokens: {
                ...(easeSelect.value ? { ease: easeSelect.value } : {}),
                durationScale: Number(durationScale.value) || 1,
                stagger: Number(stagger.value) || 1,
              },
              reducedMotion: (reducedSelect.value ?? motion.reducedMotion) as
                | "static"
                | "fade"
                | "off",
              enabled: enabledValue,
            },
          },
          "Motion ändern",
        ).catch(() => undefined);
      };
      const row = (key: string, label: string, control: DomElement): DomElement => {
        const field = h(doc, "div", { className: "senify-editor__field", data: { key: `motion-${key}` } });
        field.appendChild(h(doc, "label", { className: "senify-editor__label", text: label }));
        field.appendChild(control);
        return field;
      };
      group.appendChild(row("preset", "Preset", presetSelect));
      group.appendChild(row("intensity", "Intensität", intensity));
      group.appendChild(row("trigger", "Auslöser", triggerSelect));
      group.appendChild(row("delay", "Verzögerung", delay));
      group.appendChild(row("ease", "Easing", easeSelect));
      group.appendChild(row("duration", "Dauer-Faktor", durationScale));
      group.appendChild(row("stagger", "Stagger-Faktor", stagger));
      group.appendChild(row("reduced", "Reduced Motion", reducedSelect));
      group.appendChild(row("enabled", "Aktiv", enabledBox));
      const controls = [
        presetSelect,
        intensity,
        triggerSelect,
        delay,
        easeSelect,
        durationScale,
        stagger,
        reducedSelect,
      ];
      // Tokens, RM and the switch only make sense on an existing spec; the
      // preset select is the way in.
      if (motion.preset === null) {
        for (const control of controls.slice(1)) control.setAttribute("disabled", "disabled");
        enabledBox.setAttribute("disabled", "disabled");
      }
      for (const control of controls) control.addEventListener("change", dispatch);
      enabledBox.addEventListener("change", () => {
        enabledValue = !enabledValue;
        dispatch();
      });
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
      data: { action: "page-back" },
      attributes: { title: "Zurück", "aria-label": "Zurück" },
    });
    back.setAttribute("type", "button");
    back.appendChild(icon("caret", 14, "ic--back"));
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
    });
    head.setAttribute("type", "button");
    head.setAttribute("aria-expanded", String(!isCollapsed));
    head.appendChild(icon("caret", 12, isCollapsed ? "ic--collapsed" : undefined));
    head.appendChild(h(doc, "span", { text: group.label }));
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
        if (motionPlaying && frame.breakpoint === state.activeBreakpoint) {
          injectMotion(body);
        }
      };
      iframe.addEventListener("load", mount);
      iframe.setAttribute("srcdoc", frameDoc(options.frameStyles));
      wrap.appendChild(iframe);
      framesHost.appendChild(wrap);
      mount();
    });
  }

  // The play preview (M4): inject the baked runtime contract into one frame
  // document. Lenis stays off in design mode; the vendor comes from the engine
  // route, and the runtime runs after its plugins — an inline script appended
  // first would see an empty `window.gsap`.
  function motionTokens(): MotionTokens {
    const resolved = options.theme === undefined ? undefined : resolveTheme(options.theme);
    const baseDuration = resolved?.motion.duration.base;
    return {
      ease: resolved?.motion.ease ?? {},
      baseDurationMs: baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
      baseStaggerMs: 80,
    };
  }

  // Lenis is part of the site profile (F6/F7, MOTION_PROFILE_RULES): the live
  // mode mirrors the release, so it honours the same switch the bake reads.
  function liveLenis(): boolean {
    return siteProfile !== "clean";
  }

  function injectMotion(body: DomElement): void {
    const frameDoc = body.ownerDocument;
    if (frameDoc === undefined) return;
    // Live mode runs the site profile's contract: Lenis is on except for the
    // clean profile (the bake reads the same table); design play stays without.
    const live = state.mode === "live";
    const withLenis = live && liveLenis();
    const { configs, warnings } = motionConfigsForTree(options.tree(), motionTokens());
    const firstWarning = warnings[0];
    if (firstWarning !== undefined) report(firstWarning.message);
    const payload = frameDoc.createElement("script");
    payload.setAttribute("type", "application/json");
    payload.setAttribute("id", "motion-data");
    payload.textContent = JSON.stringify(motionDataFor(configs));
    body.appendChild(payload);

    const needs = new Set(configs.flatMap((config) => config.needs ?? []));
    const names = [
      "gsap.min.js",
      ...(needs.has("scrolltrigger") ? ["ScrollTrigger.min.js"] : []),
      ...(needs.has("splittext") ? ["SplitText.min.js"] : []),
      ...(withLenis ? ["lenis.min.js"] : []),
    ];
    const base = options.motionVendorBase ?? "/api/motion-vendor";
    let remaining = names.length;
    const runRuntime = (): void => {
      const script = frameDoc.createElement("script");
      script.setAttribute("data-senify-motion", "runtime");
      script.textContent = renderPageScript({ lenis: withLenis });
      body.appendChild(script);
    };
    if (remaining === 0) {
      runRuntime();
      return;
    }
    for (const name of names) {
      const script = frameDoc.createElement("script");
      script.setAttribute("src", `${base}/${name}`);
      script.setAttribute("data-senify-motion", "vendor");
      const async = script as unknown as {
        async?: boolean;
        onload?: (() => void) | null;
        onerror?: (() => void) | null;
      };
      async.async = false;
      const done = (): void => {
        remaining -= 1;
        if (remaining === 0) runRuntime();
      };
      async.onload = done;
      async.onerror = done;
      body.appendChild(script);
    }
  }

  function toggleMotion(): void {
    motionPlaying = !motionPlaying;
    if (motionPlaying) {
      const mounted = mountedFrames.find(
        (entry) => entry.frame.breakpoint === state.activeBreakpoint,
      );
      if (mounted) injectMotion(mounted.body);
      report("Motion läuft im aktiven Frame");
    } else {
      // Recreating the frames drops every inline transform and opacity the
      // runtime wrote — the canvas returns to the baseline state.
      renderFrames();
      syncSelectionRing();
      renderOverlay();
      report(null);
    }
    renderTopbar();
    renderStatus();
  }

  function wireFrameBody(body: DomElement): void {
    body.addEventListener("click", (event: DomEvent) => {
      if (inline.session) return;
      // Live mode shows the real page: content keeps its own behaviour
      // (links, islands), the edit overlays stay in design mode.
      if (state.mode === "live") return;
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]");
      const nodeId = target?.getAttribute("data-node-id") ?? null;
      if (!nodeId) return;
      const next = event.altKey === true ? parentIdOf(nodeId) ?? nodeId : nodeId;
      if (next !== state.selectedNodeId) select(next);
      event.stopPropagation?.();
    });
    body.addEventListener("contextmenu", (event: DomEvent) => {
      if (inline.session) return;
      if (state.mode === "live") return;
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
      if (state.mode === "live") return;
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
      if (state.mode === "live") return;
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
      if (state.mode === "live" || dragWidget === null) return;
      event.preventDefault?.();
    });
    body.addEventListener("dragover", (event: DomEvent) => {
      if (state.mode === "live" || dragWidget === null) return;
      event.preventDefault?.();
      const target = (event.target as DomElement | null)?.closest?.("[data-node-id]") ?? null;
      showDropLine(body, target, event.clientY ?? 0);
    });
    body.addEventListener("dragleave", (event: DomEvent) => {
      if (state.mode === "live" || dragWidget === null) return;
      const related = (event as { relatedTarget?: unknown }).relatedTarget;
      if (related && body.contains?.(related) === true) return;
      clearDropLine(body);
    });
    body.addEventListener("drop", (event: DomEvent) => {
      if (state.mode === "live" || dragWidget === null) return;
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
    void finishInline();
    void enqueueWrite(async () => {
      inline.start({ nodeId, key, value: target.textContent ?? "" });
      target.setAttribute("contenteditable", "plaintext-only");
      target.focus?.();
      inlineElement = target;
      renderOverlay();
    });
  }

  // Enter or the toolbar's "Fertig": flush the pending write, keep the edit,
  // drop the editing mode.
  function finishInline(): Promise<void> {
    flushInlineCommit();
    return enqueueWrite(async () => {
      inlineElement?.removeAttribute("contenteditable");
      if (inline.session) inline.commit();
      inlineElement = null;
      renderOverlay();
    });
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

  function commitInline(value: string): Promise<void> {
    return enqueueWrite(() => writeInline(value));
  }

  async function writeInline(value: string): Promise<void> {
    if (!inline.session) return;
    if (value === inline.session.original && inline.session.entryId === null) return;
    const { mutation } = inline.type(value);
    const versionBefore = session.version;
    try {
      const response = await session.applyMutations([mutation]);
      inline.record({
        undoPatch: [...response.results].reverse().flatMap((result) => result.undoPatch),
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

  function revertInline(): Promise<void> {
    if (inlineTimer !== null) {
      clearTimeout(inlineTimer);
      inlineTimer = null;
    }
    return enqueueWrite(async () => {
      const current = inline.session;
      if (!current) return;
      try {
        if (current.entryId !== null) {
          await session.applyMutations([{
            op: "updateNodeProps", id: current.nodeId,
            patch: { [current.key]: current.original },
          }]);
        }
        inline.revert();
        if (inlineElement) inlineElement.textContent = current.original;
        inlineElement?.removeAttribute("contenteditable");
        inlineElement = null;
        report("Inline-Text zurückgesetzt");
        render();
      } catch (error) {
        reportError(error);
        renderStatus();
      }
    });
  }

  function handleButton(
    id: string,
    iconName: string,
    title: string,
    onClick: () => void,
    enabled = true,
  ): DomElement {
    const button = h(doc, "button", {
      className: `senify-editor__handle-btn${id === "grip" ? " senify-editor__handle-grip" : ""}`,
      data: { action: id },
      attributes: { title: enabled ? title : `${title} — gesperrt`, "aria-label": title },
    });
    button.setAttribute("type", "button");
    button.appendChild(icon(iconName, 14));
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
    const done = h(doc, "button", { data: { action: "inline-done" } });
    done.setAttribute("type", "button");
    done.appendChild(icon("check", 14));
    done.appendChild(h(doc, "span", { text: "Fertig" }));
    done.addEventListener("click", () => void finishInline());
    const discard = h(doc, "button", { data: { action: "inline-discard" } });
    discard.setAttribute("type", "button");
    discard.appendChild(icon("close", 14));
    discard.appendChild(h(doc, "span", { text: "Verwerfen" }));
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
          handleButton("grip", "grip", `${label} verschieben`, () => undefined, false),
        );
      }
      bar.appendChild(
        handleButton(
          "edit",
          "text",
          `${label} bearbeiten`,
          () => editNodeInline(nodeId),
          inlineTargetFor(nodeId) !== null,
        ),
      );
      if (!isRoot) {
        bar.appendChild(
          handleButton("duplicate", "copy", `${label} duplizieren`, () => duplicateNode(nodeId), !locked),
        );
        bar.appendChild(
          handleButton("delete", "trash", `${label} löschen`, () => removeNode(nodeId), !locked),
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
          data: { action: "insert-before" },
          attributes: { title: "Element davor einfügen", "aria-label": "Element davor einfügen" },
          style: { left: `${Math.max(0, center)}px`, top: `${Math.max(0, top - 13)}px` },
        });
        before.setAttribute("type", "button");
        before.appendChild(icon("plus", 14));
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
          data: { action: "insert-after" },
          attributes: { title: "Element danach einfügen", "aria-label": "Element danach einfügen" },
          style: { left: `${Math.max(0, center)}px`, top: `${Math.max(0, bottom - 13)}px` },
        });
        after.setAttribute("type", "button");
        after.appendChild(icon("plus", 14));
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
    options?: { danger?: boolean; enabled?: boolean; trailing?: string; icon?: string },
  ): DomElement {
    const item = h(doc, "button", {
      className: "senify-editor__context-item",
      data: {
        ...(options?.danger === undefined ? {} : { danger: String(options.danger) }),
        ...(options?.enabled === undefined ? {} : { enabled: String(options.enabled) }),
      },
    });
    item.setAttribute("type", "button");
    if (options?.icon !== undefined) item.appendChild(icon(options.icon, 16));
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
      contextItem(
        `Einstellungen${definition ? ` · ${definition.title}` : ""}`,
        () => {
          select(nodeId);
          panelMode = "settings";
          panelTab = "content";
          renderPanelHost();
        },
        { icon: "slider" },
      ),
    );
    menu.appendChild(
      contextItem(
        "Text bearbeiten",
        () => editNodeInline(nodeId),
        { enabled: inlineTargetFor(nodeId) !== null, icon: "text" },
      ),
    );
    menu.appendChild(menuSeparator());
    const placement = siblingPlacement(nodeId);
    menu.appendChild(
      contextItem("Duplizieren", () => duplicateNode(nodeId), {
        enabled: !isRoot && !locked,
        trailing: "Strg+D",
        icon: "copy",
      }),
    );
    menu.appendChild(
      contextItem("Nach oben", () => moveNode(nodeId, (placement?.index ?? 0) - 1), {
        enabled: !isRoot && !locked && placement !== null && placement.index > 0,
        icon: "edge-t",
      }),
    );
    menu.appendChild(
      contextItem("Nach unten", () => moveNode(nodeId, placement?.index ?? 0), {
        enabled:
          !isRoot &&
          !locked &&
          placement !== null &&
          placement.index < placement.count - 1,
        icon: "edge-b",
      }),
    );
    menu.appendChild(
      contextItem(hidden ? "Einblenden" : "Ausblenden", () => toggleHidden(nodeId), {
        enabled: !isRoot,
        icon: hidden ? "eye" : "eyeoff",
      }),
    );
    menu.appendChild(menuSeparator());
    menu.appendChild(
      contextItem("Löschen", () => removeNode(nodeId), {
        danger: true,
        enabled: !isRoot && !locked,
        trailing: "Entf",
        icon: "trash",
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
      if ((options.tree().nodes[options.tree().rootNodeId]?.children ?? []).length === 0) {
        list.appendChild(
          h(doc, "div", {
            className: "senify-editor__empty",
            text: "Noch keine Elemente — links im Katalog hinzufügen oder auf die Fläche ziehen.",
          }),
        );
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
      if (media.items.length === 0) {
        list.appendChild(
          h(doc, "div", { className: "senify-editor__empty", text: "Keine Medien gefunden" }),
        );
      }
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
    // Motion badge (ticket 19/M3): the spec is visible in the tree, not only
    // in the Advanced tab.
    if (item.motion) {
      row.appendChild(
        h(doc, "span", {
          className: "senify-editor__badge",
          text: "M",
          attributes: { title: "Motion-Spec gesetzt", "aria-label": "Motion" },
        }),
      );
    }
    const eyeLabel = item.hidden ? "Einblenden" : "Ausblenden";
    const eye = h(doc, "span", {
      className: `senify-editor__eye ic ic--${item.hidden ? "eyeoff" : "eye"} ic--14`,
      data: { eye: item.id },
      attributes: { role: "button", title: eyeLabel, "aria-label": eyeLabel, tabindex: "0" },
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
      zoomGroup.appendChild(iconButton({ id: "zoom-out", icon: "zoomout", title: "Herauszoomen", onClick: () => zoomByStep(-0.1) }));
      zoomGroup.appendChild(
        iconButton({
          id: "zoom-reset",
          text: `${Math.round(state.design.zoom * 100)} %`,
          title: "Zoom zurücksetzen",
          onClick: () => resetZoom(),
        }),
      );
      zoomGroup.appendChild(iconButton({ id: "zoom-in", icon: "zoomin", title: "Hineinzoomen", onClick: () => zoomByStep(0.1) }));
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
    syncStageMode();
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
    syncStageMode();
    if (state.mode === "live") {
      // Live = the real page: motion plays with the site profile (Lenis),
      // the play toggle stays paused so leaving live mode returns to rest.
      motionPlaying = true;
    } else if (motionPlaying) {
      motionPlaying = false;
      report(null);
    }
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
      if (state.mode !== "live") openSpotlight(true);
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
    // The live frame is a preview: keyboard edits and undo/redo stay in the
    // design mode (and in the frame's focus, which never reaches this handler).
    if (state.mode === "live") return;
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
    undo: () => {
      void finishInline();
      return enqueueWrite(async () => { await replayHistory("undo"); });
    },
    redo: () => {
      void finishInline();
      return enqueueWrite(async () => { await replayHistory("redo"); });
    },
    setMode,
    skin: () => skin,
    setSkin: (next: EditorSkin) => {
      skin = next;
      applyEditorSkin(root, next);
    },
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
    setSiteProfile: (profile: MotionProfile) => {
      siteProfile = profile;
      render();
    },
    destroy: () => {
      doc.removeEventListener("click", closeFloating);
      stage.removeEventListener("scroll", onStageScroll);
      if (win) win.removeEventListener("resize", onResize);
      keyboardTarget.removeEventListener("keydown", onKeydown);
      renderer.destroy();
      root.remove();
    },
  };

  // Aufgabe 29: restore the panel widths and paint them before the first render.
  readPanelWidths();
  paintPanels();
  syncStageMode();
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
