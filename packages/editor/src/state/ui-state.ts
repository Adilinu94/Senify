// Editor UI state (E5, slice 1): what a reload must not lose.
//
// The session core owns the document, the selection, the history and the save
// state. This module owns the *view* half — the active device, the inspector
// tab, the canvas zoom and the selected node — and persists it per page. It is
// deliberately outside the undo history (Webstudio pattern): a device switch is
// a view change, never an edit.
//
// The storage is injected (the shell passes `localStorage`, tests pass a map),
// so the module stays browser-safe and testable without a DOM.

export const EDITOR_TAB_IDS = ["content", "style", "interactions", "advanced"] as const;
export type EditorTabId = (typeof EDITOR_TAB_IDS)[number];

export type EditorUiState = {
  device: "desktop" | "tablet" | "mobile";
  tab: EditorTabId;
  zoom: number;
  // Design/Live (Ticket 03 Punkt 6): the live mode survives a reload too.
  mode: "design" | "live";
  selectedId: string | null;
};

export const DEFAULT_UI_STATE: EditorUiState = {
  device: "desktop",
  tab: "content",
  zoom: 1,
  mode: "design",
  selectedId: null,
};

export type SessionStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export function uiStateKey(pageId: string): string {
  return `senify-editor-session:${pageId}`;
}

function isTabId(value: unknown): value is EditorTabId {
  return typeof value === "string" && (EDITOR_TAB_IDS as readonly string[]).includes(value);
}

function isDevice(value: unknown): value is EditorUiState["device"] {
  return value === "desktop" || value === "tablet" || value === "mobile";
}

function isMode(value: unknown): value is EditorUiState["mode"] {
  return value === "design" || value === "live";
}

// A stored state is trusted only field by field; anything else falls back to
// the default. A corrupt entry never blocks the editor.
export function parseUiState(input: unknown): EditorUiState {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_UI_STATE };
  }
  const record = input as Record<string, unknown>;
  return {
    device: isDevice(record["device"]) ? record["device"] : DEFAULT_UI_STATE.device,
    tab: isTabId(record["tab"]) ? record["tab"] : DEFAULT_UI_STATE.tab,
    zoom:
      typeof record["zoom"] === "number" && Number.isFinite(record["zoom"]) && record["zoom"] > 0
        ? record["zoom"]
        : DEFAULT_UI_STATE.zoom,
    mode: isMode(record["mode"]) ? record["mode"] : DEFAULT_UI_STATE.mode,
    selectedId: typeof record["selectedId"] === "string" ? record["selectedId"] : null,
  };
}

export function loadUiState(
  storage: SessionStorage | undefined,
  pageId: string,
): EditorUiState {
  if (storage === undefined) return { ...DEFAULT_UI_STATE };
  try {
    const raw = storage.get(uiStateKey(pageId));
    if (raw === null || raw === "") return { ...DEFAULT_UI_STATE };
    return parseUiState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_UI_STATE };
  }
}

export function saveUiState(
  storage: SessionStorage | undefined,
  pageId: string,
  state: EditorUiState,
): void {
  if (storage === undefined) return;
  try {
    storage.set(uiStateKey(pageId), JSON.stringify(state));
  } catch {
    // A private window may refuse the write; the editor keeps working.
  }
}
