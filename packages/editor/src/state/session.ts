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
import type { ExternalRecordInput, HistoryEntry } from "../history.ts";
import type { Device } from "@senify/widget-engine";
import { EditorStore, type ApplyOptions, type ApplyOutcome } from "./store.ts";
import type { SelectionState } from "./selection.ts";
import {
  createSavePipeline,
  type SavePipeline,
  type SaveState,
  type SaveTransport,
  type ExternalVersions,
} from "./persist.ts";
import type { EditorDocument } from "./document.ts";
import { ExternalHistoryController, type ExternalHistoryRunner, type ExternalHistoryState } from "./external-history.ts";
import { matchingHistoryCheckpoint, type SessionHistoryCheckpoint } from "./history-checkpoint.ts";
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
  styleRegistryVersion?: number;
  themeVersion?: number;
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
  pendingExternalId: string | null;
  externalHistory: ExternalHistoryState;
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
  #confirming = false;
  readonly #externalHistory: ExternalHistoryController;

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
      ...(options.styleRegistryVersion === undefined
        ? {}
        : { styleRegistryVersion: options.styleRegistryVersion }),
      ...(options.themeVersion === undefined ? {} : { themeVersion: options.themeVersion }),
      ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    });
    this.pipeline.acceptVersion(options.initialVersion);
    this.#externalHistory = new ExternalHistoryController(this.store, this.pipeline, () => this.#emit());
    this.store.subscribe(() => {
      this.#externalHistory.reconcile();
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

  get pendingExternalId(): string | null {
    return this.store.pendingExternalId;
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

  get canUndoAsync(): boolean { return this.#externalHistory.canNavigate("undo"); }
  get canRedoAsync(): boolean { return this.#externalHistory.canNavigate("redo"); }
  undoAsync(): Promise<boolean> { return this.#externalHistory.navigate("undo"); }
  redoAsync(): Promise<boolean> { return this.#externalHistory.navigate("redo"); }
  registerExternalHistory(entryId: string, runner: ExternalHistoryRunner): void { this.#externalHistory.register(entryId, runner); }
  retryExternalHistory(): Promise<boolean> { return this.#externalHistory.retry(); }
  externalHistoryState(): ExternalHistoryState { return this.#externalHistory.state(); }

  historyCheckpoint(): SessionHistoryCheckpoint | null {
    const save = this.saveState();
    if (this.#disposed || this.pendingExternalId !== null || save.pending > 0 || save.unsupported.length > 0 || ["saving", "conflict", "error"].includes(save.status)) return null;
    return structuredClone({ format: 1, pageId: this.pageId, siteId: this.siteId, versions: this.pipeline.externalVersions(), document: this.document, history: this.store.history.snapshot(), classDeletionReceipts: this.pipeline.historyDeletionReceipts() });
  }

  restoreHistoryCheckpoint(input: unknown): boolean {
    if (this.store.history.size > 0 || this.historyCheckpoint() === null) return false;
    try {
      const checkpoint = matchingHistoryCheckpoint(input, this.pageId, this.siteId, this.pipeline.externalVersions(), this.document);
      if (checkpoint === null) return false;
      return this.pipeline.restoreHistory(checkpoint.history, checkpoint.classDeletionReceipts);
    } catch { return false; }
  }

  beginExternalAction(input: ExternalRecordInput): HistoryEntry {
    return this.store.beginExternalAction(input);
  }

  commitExternalAction(id: string, input: Partial<ExternalRecordInput> = {}): HistoryEntry {
    return this.store.commitExternalAction(id, input);
  }

  failExternalAction(id: string): HistoryEntry | null {
    return this.store.failExternalAction(id);
  }

  // For document-preserving external actions. Observers see the new versions
  // and committed entry together, never an intermediate request base.
  confirmExternalAction(id: string, document: EditorDocument, base: Readonly<ExternalVersions>, next: Readonly<ExternalVersions>): boolean {
    if (this.#disposed) return false;
    this.#confirming = true;
    try {
      return this.pipeline.confirmExternalAction(id, document, base, next);
    } finally { this.#confirming = false; this.#emit(); }
  }

  // Document-changing external confirmation (rename): new document, committed
  // entry and all versions are adopted together.
  confirmExternalReplacement(id: string, original: EditorDocument, base: Readonly<ExternalVersions>, next: Readonly<ExternalVersions>, document: EditorDocument): boolean {
    if (this.#disposed) return false;
    this.#confirming = true;
    try {
      return this.pipeline.confirmExternalReplacement(id, original, base, next, document);
    } finally { this.#confirming = false; this.#emit(); }
  }

  // The application must first confirm its idempotent request and all server
  // contents. A pending request alone is not authority to rebind a checkpoint.
  // This only imports into the fresh, empty session created by a reload.
  confirmExternalHistoryRecovery(id: string, input: unknown, base: Readonly<ExternalVersions>): boolean {
    if (this.#disposed || this.pendingExternalId !== id || this.store.history.size !== 0) return false;
    let checkpoint: SessionHistoryCheckpoint;
    try {
      const next = (input as SessionHistoryCheckpoint)?.versions;
      if (!next) return false;
      const matched = matchingHistoryCheckpoint(input, this.pageId, this.siteId, next, this.document);
      if (matched === null) return false;
      checkpoint = matched;
    } catch { return false; }
    this.#confirming = true;
    try {
      return this.pipeline.confirmExternalHistoryRecovery(id, checkpoint.history, base, checkpoint.versions, checkpoint.classDeletionReceipts);
    } finally { this.#confirming = false; this.#emit(); }
  }

  confirmExternalHistoryReplacement(id: string, input: unknown, base: Readonly<ExternalVersions>, document: EditorDocument): boolean {
    if (this.#disposed || this.pendingExternalId !== id || this.store.history.size !== 0) return false;
    let checkpoint: SessionHistoryCheckpoint;
    try {
      const next = (input as SessionHistoryCheckpoint)?.versions;
      if (!next) return false;
      const matched = matchingHistoryCheckpoint(input, this.pageId, this.siteId, next, document);
      if (matched === null) return false;
      checkpoint = matched;
    } catch { return false; }
    this.#confirming = true;
    try {
      return this.pipeline.confirmExternalHistoryReplacement(id, checkpoint.history, base, checkpoint.versions, document, checkpoint.classDeletionReceipts);
    } finally { this.#confirming = false; this.#emit(); }
  }

  resetExternalHistory(id: string, original: EditorDocument, base: Readonly<ExternalVersions>, document: EditorDocument, next: Readonly<ExternalVersions>, beforeCommit: () => void): boolean {
    if (this.#disposed) return false;
    this.#confirming = true;
    try {
      return this.pipeline.resetExternalHistory(id, original, base, document, next, beforeCommit);
    } finally { this.#confirming = false; this.#emit(); }
  }

  select(id: string | null): void {
    if (id === null) this.store.clearSelection();
    else this.store.select(id);
  }

  // After a reload: replace the document and hand the fresh server version in.
  // The view state survives; a selection that still exists is kept, a stale one
  // is dropped (the store subscription persists the outcome).
  replaceDocument(document: EditorDocument, version: number, registryVersion?: number, options?: { preserveHistory?: boolean }): void {
    const selected = this.#ui.selectedId;
    if (options?.preserveHistory) this.store.replaceDocumentPreservingHistory(document);
    else this.store.replaceDocument(document);
    this.pipeline.acceptVersion(version);
    if (registryVersion !== undefined) this.pipeline.acceptStyleRegistry(registryVersion, document.styleRules.map((rule) => rule.id));
    if (selected !== null && document.nodes[selected] !== undefined) {
      this.store.select(selected);
    }
  }

  migrateHistoryReferences(family: string, oldName: string, newName: string): boolean {
    return this.store.migrateHistoryReferences(family, oldName, newName);
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

  acceptThemeVersion(version: number): void {
    this.pipeline.acceptThemeVersion(version);
  }

  acceptStyleRegistry(version: number, ruleIds: Iterable<string>): void {
    this.pipeline.acceptStyleRegistry(version, ruleIds);
  }

  acceptExternalVersions(basePageVersion: number, baseThemeVersion: number, pageVersion: number, themeVersion: number): boolean {
    return this.pipeline.acceptExternalVersions(basePageVersion, baseThemeVersion, pageVersion, themeVersion);
  }

  // The conflict choice "load the server": the fresh document replaces the
  // local one, so the pending batch is dropped instead of being resent.
  discardPending(): void {
    this.pipeline.discardPending();
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
      pendingExternalId: this.pendingExternalId,
      externalHistory: this.externalHistoryState(),
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
    if (this.#disposed || this.#confirming || this.#externalHistory.isCommitting) return;
    for (const listener of [...this.#listeners]) listener();
  }

  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
    this.#externalHistory.dispose();
    this.pipeline.dispose();
  }
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  return new EditorSession(options);
}

// The default UI state, re-exported so the shell has one vocabulary.
export { DEFAULT_UI_STATE };
