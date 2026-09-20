// Editor session (E5, slice 1): the one state core behind canvas, inspector
// and chrome.
//
// Before this module the shell wired the pieces by hand: an `EditorStore` for
// document/selection/history, a save pipeline for server version/pending/
// conflict, and separate locals for the view state. Every projection (canvas,
// inspector, chrome) had to know each piece — the "two truths" of L7.
//
// The session bundles them into one object with one subscription: the document
// and selection live in the store, the server version and pending queue in the
// pipeline, the view state (device, tab, zoom, selection) in `ui-state.ts`.
// Canvas and inspector are projections of the same session, and a reload
// restores the view through the injected storage.

import type { Author } from "@senify/section-sdk";
import type { Device } from "@senify/widget-engine";
import { EditorStore, type ApplyOptions, type ApplyOutcome } from "./store.ts";
import type { SelectionState } from "./selection.ts";
import {
  createSavePipeline,
  type SavePipeline,
  type SaveState,
  type SaveTransport,
} from "./persist.ts";
import type { EditorDocument } from "./document.ts";
import {
  DEFAULT_UI_STATE,
  loadUiState,
  saveUiState,
  type EditorTabId,
  type EditorUiState,
  type SessionStorage,
} from "./ui-state.ts";

export type EditorSessionOptions = {
  document: EditorDocument;
  pageId: string;
  siteId: string;
  author: Author;
  request: SaveTransport;
  initialVersion: number;
  knownRuleIds?: Iterable<string>;
  debounceMs?: number;
  storage?: SessionStorage;
  idFactory?: () => string;
};

export type SessionSnapshot = {
  version: number;
  save: SaveState;
  ui: EditorUiState;
  canUndo: boolean;
  canRedo: boolean;
};

export class EditorSession {
  readonly store: EditorStore;
  readonly pipeline: SavePipeline;
  readonly pageId: string;
  readonly siteId: string;
  readonly #storage: SessionStorage | undefined;
  #ui: EditorUiState;
  readonly #listeners = new Set<() => void>();
  #disposed = false;

  constructor(options: EditorSessionOptions) {
    this.pageId = options.pageId;
    this.siteId = options.siteId;
    this.#storage = options.storage;
    this.#ui = loadUiState(options.storage, options.pageId);
    this.store = new EditorStore({
      document: options.document,
      ...(options.idFactory === undefined ? {} : { idFactory: options.idFactory }),
    });
    this.pipeline = createSavePipeline({
      store: this.store,
      pageId: options.pageId,
      siteId: options.siteId,
      author: options.author,
      request: options.request,
      ...(options.knownRuleIds === undefined ? {} : { knownRuleIds: options.knownRuleIds }),
      ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    });
    this.pipeline.acceptVersion(options.initialVersion);
    this.store.subscribe(() => {
      // The selection is one truth (E5): wherever it changes — canvas click,
      // explorer, chrome — the session mirrors it into the persisted view
      // state, so a reload restores the node the user actually had selected.
      const selected =
        this.store.selection.focus ?? this.store.selection.selected[0] ?? null;
      if (selected !== this.#ui.selectedId) {
        this.#ui = { ...this.#ui, selectedId: selected };
        saveUiState(this.#storage, this.pageId, this.#ui);
      }
      this.#emit();
    });
    this.pipeline.subscribe(() => this.#emit());
  }

  /* ------------------------------------------------------------- document */

  get document(): EditorDocument {
    return this.store.document;
  }

  get selection(): SelectionState {
    return this.store.selection;
  }

  get canUndo(): boolean {
    return this.store.canUndo;
  }

  get canRedo(): boolean {
    return this.store.canRedo;
  }

  apply(mutation: unknown, options: ApplyOptions = {}): ApplyOutcome {
    return this.store.apply(mutation, options);
  }

  undo(): boolean {
    return this.store.undo();
  }

  redo(): boolean {
    return this.store.redo();
  }

  select(id: string | null): void {
    if (id === null) this.store.clearSelection();
    else this.store.select(id);
  }

  // After a reload: replace the document and hand the fresh server version in.
  // The view state survives; a selection that still exists is kept, a stale one
  // is dropped (the store subscription persists the outcome).
  replaceDocument(document: EditorDocument, version: number): void {
    const selected = this.#ui.selectedId;
    this.store.replaceDocument(document);
    this.pipeline.acceptVersion(version);
    if (selected !== null && document.nodes[selected] !== undefined) {
      this.store.select(selected);
    }
  }

  /* ----------------------------------------------------------------- save */

  get version(): number {
    return this.pipeline.state().version;
  }

  saveState(): SaveState {
    return this.pipeline.state();
  }

  flush(): Promise<void> {
    return this.pipeline.flush();
  }

  retry(version?: number): Promise<void> {
    return this.pipeline.retry(version);
  }

  acceptVersion(version: number): void {
    this.pipeline.acceptVersion(version);
  }

  /* ------------------------------------------------------------------- ui */

  ui(): EditorUiState {
    return this.#ui;
  }

  patchUi(partial: Partial<EditorUiState>): void {
    this.#ui = { ...this.#ui, ...partial };
    saveUiState(this.#storage, this.pageId, this.#ui);
    this.#emit();
  }

  setDevice(device: Device): void {
    this.patchUi({ device });
  }

  setTab(tab: EditorTabId): void {
    this.patchUi({ tab });
  }

  // Design/Live (Ticket 03 Punkt 6): the canvas mirrors the session, so the
  // mode is one truth and survives a reload.
  setMode(mode: EditorUiState["mode"]): void {
    this.patchUi({ mode });
  }

  setZoom(zoom: number): void {
    this.patchUi({ zoom });
  }

  snapshot(): SessionSnapshot {
    return {
      version: this.version,
      save: this.saveState(),
      ui: this.#ui,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    };
  }

  /* ---------------------------------------------------------- subscription */

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    if (this.#disposed) return;
    for (const listener of [...this.#listeners]) listener();
  }

  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
    this.pipeline.dispose();
  }
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  return new EditorSession(options);
}

// The default UI state, re-exported so the shell has one vocabulary.
export { DEFAULT_UI_STATE };
