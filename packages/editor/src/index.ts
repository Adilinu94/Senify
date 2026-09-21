// T13 — Visueller Editor. The program shell (T12) only calls
// `mountEditor(container, options)`; everything else is the editor's contract.

export { mountEditor, createStubRenderer, type EditorInstance, type EditorOptions, type FrameRenderContext, type FrameRenderer } from "./mount.ts";
export {
  EDITOR_ICON_BASE_CSS,
  EDITOR_ICON_STYLES,
  EDITOR_STYLES,
  EDITOR_TOKEN_STYLES,
  ensureEditorStyles,
} from "./styles.ts";
export {
  applyEditorSkin,
  EDITOR_SKIN_ALT,
  EDITOR_SKIN_ATTRIBUTE,
  EDITOR_SKIN_DEFAULT,
  EDITOR_SKIN_STYLES,
  EDITOR_SKIN_TIEFWASSER,
  isEditorSkin,
  type EditorSkin,
} from "./ui/skin.ts";
export {
  EDITOR_BUNDLED_FONT_FILES,
  EDITOR_CONTENT_FONT_FILES,
  EDITOR_FONT_FACE_CSS,
  EDITOR_FONT_FILES,
  editorFontFaceCss,
  type EditorFontFile,
} from "./ui/fonts.ts";
export { EDITOR_ROOT_ATTRIBUTE } from "./ui/tokens.ts";
export {
  createHttpTransport,
  DRAFT_CONFLICT_MESSAGE,
  DraftConflictError,
  EditorRequestError,
  MutationsSession,
  type FetchLike,
  type FetchResponseLike,
  type HttpTransportOptions,
  type MutationsSessionOptions,
} from "./client.ts";
export { emitBatch, emitMutations, type ActionContext } from "./mutations.ts";
export {
  activeView,
  clampZoom,
  createFrameState,
  DESIGN_FRAMES,
  DESIGN_ZOOM_START,
  effectiveProps,
  framePlacements,
  framesForState,
  FRAME_BREAKPOINTS,
  FRAME_GAP,
  hasOverride,
  isHiddenAt,
  mediaMaxWidthFor,
  mediaQueryFor,
  overrideFor,
  panBy,
  selectNode,
  setBreakpoint,
  setMode,
  setZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomBy,
  type FrameDescriptor,
  type FramePlacement,
  type FrameState,
  type FrameView,
} from "./frames.ts";
export {
  buildMotionPanel,
  buildPanels,
  tokenOptionsFor,
  type BuildPanelsInput,
  type MotionPanel,
  type PanelField,
  type PanelGroup,
  type PanelUiKind,
  type TokenOption,
} from "./panels.ts";
export {
  buildInspector,
  INSPECTOR_TABS,
  motionSpecFrom,
  numberPart,
  tokenRefOf,
  unitOfValue,
  type BuildInspectorInput,
  type InspectorCommit,
  type InspectorField,
  type InspectorFieldKind,
  type InspectorGroup,
  type InspectorModel,
  type InspectorMotion,
  type InspectorTab,
  type InspectorTabId,
} from "./inspector/model.ts";
export {
  createInspector,
  type InspectorInstance,
  type InspectorOptions,
} from "./inspector/inspector.ts";
export {
  ensureInspectorStyles,
  INSPECTOR_ICON_CSS,
  INSPECTOR_STYLES,
} from "./inspector/styles.ts";
export {
  HistoryStack,
  HISTORY_LIMIT,
  type HistoryEntry,
  type HistoryStackOptions,
  type RecordInput,
} from "./history.ts";
export {
  InlineEditing,
  INLINE_COALESCE_KEY,
  sanitizeInlineText,
  type InlineRecord,
  type InlineSession,
} from "./inline-text.ts";
export {
  deepLinksEqual,
  DEFAULT_DEEP_LINK,
  parseDeepLink,
  serializeDeepLink,
  type DeepLinkState,
} from "./deep-links.ts";
export {
  buildComponentList,
  buildLayerList,
  buildMediaTab,
  buildPageList,
  buildTemplatesSection,
  buildEditorLayerList,
  editorMenuItems,
  editorNodeLabel,
  editorNodeSnippet,
  EXPLORER_TABS,
  filterMedia,
  layerLabel,
  type ComponentListItem,
  type EditorLayerItem,
  type EditorMenuEntry,
  type ExplorerTab,
  type ExplorerTabSpec,
  type LayerItem,
  type MediaItem,
  type MediaQuery,
  type PageItem,
  type TemplateItem,
  type TemplateKind,
} from "./explorer.ts";
export {
  createExplorer,
  type ExplorerInstance,
  type ExplorerOptions,
} from "./explorer/panel.ts";
export {
  ensureExplorerStyles,
  EXPLORER_ICON_CSS,
  EXPLORER_STYLES,
} from "./explorer/styles.ts";
export {
  buildSpotlightIndex,
  buildEditorSpotlightIndex,
  matchesSpotlight,
  scoreSpotlight,
  searchSpotlight,
  SPOTLIGHT_ACTIONS,
  type EditorSpotlightInput,
  type PageRef,
  type SpotlightCommand,
  type SpotlightItem,
  type SpotlightKind,
} from "./spotlight.ts";
export {
  createSpotlightDialog,
  type SpotlightDialog,
  type SpotlightDialogOptions,
} from "./spotlight/dialog.ts";
export { ensureSpotlightStyles, SPOTLIGHT_STYLES } from "./spotlight/styles.ts";
export {
  isOverrideBreakpoint,
  OVERRIDE_BREAKPOINTS,
  type ApplyMutationsRequest,
  type ApplyMutationsResponse,
  type EditorAction,
  type EditorMode,
  type EditorPage,
  type EditorTransport,
  type FrameBreakpoint,
  type MutationResultPayload,
  type MutationWarningPayload,
  type OverrideBreakpoint,
} from "./types.ts";
export {
  getDocument,
  getWindow,
  requireDocument,
  type DomDocument,
  type DomElement,
  type DomEvent,
  type DomWindow,
} from "./dom.ts";
