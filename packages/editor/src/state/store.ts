// Editor store (rebuild Phase 0, third slice).
//
// The store owns the document, the selection and the undo history, and it is the
// only place that writes the document ("all writes through one gate"). A caller
// hands in an editor mutation; the store validates its shape
// (`parseEditorMutation`), runs the operation, applies the forward patch list,
// checks the result against `validateDocument`, and only then records the change
// on the existing `HistoryStack` — the inverse patch as the undo, the forward
// list as the redo. A change that would break the document is rejected and
// nothing is written.
//
// `coalesceKey` reuses the stack's burst folding: a burst of typing on one
// property, or a drag of one node, folds into a single undo entry (one Cmd+Z).

import { SenifyError } from "@senify/core";
import {
  parseEditorMutation,
  type EditorMutation,
  type Mutation,
  type MutationOp,
  type PatchOp,
} from "@senify/engine/browser";
import { HistoryStack, type ExternalRecordInput, type HistoryDirection, type HistoryEntry } from "../history.ts";
import { newNodeId } from "./ids.ts";
import {
  createDocument,
  type EditorDocument,
  type NodeId,
} from "./document.ts";
import { validateDocument } from "./consistency.ts";
import { checkedEditorHistory } from "./history-checkpoint.ts";
import { applyEditorMutation, type OperationResult } from "./operations.ts";
import {
  applyDocumentPatches,
  type DocumentPatch,
} from "./patches.ts";
import {
  EMPTY_SELECTION,
  clearSelection as clearSelectionState,
  collapseNode,
  expandNode,
  expandToReveal,
  selectChildren as selectChildrenState,
  selectOne,
  selectParent as selectParentState,
  selectRange,
  toggleExpanded,
  toggleSelect,
  type SelectionState,
} from "./selection.ts";

export type EditorStoreOptions = {
  document?: EditorDocument;
  selection?: SelectionState;
  history?: HistoryStack;
  idFactory?: () => string;
  // Reports every committed change so a shell can mirror the canvas onto the
  // engine (Phase 0, fifth slice). Additive: the store never depends on it.
  onAction?: (event: EditorStoreAction) => void;
};

// One entry per committed store change. `apply` carries the editor mutation
// that was written, so a listener can forward exactly the batch that should be
// persisted; `undo` / `redo` carry the history entry, whose patch lists are
// what a persistence layer has to translate back into mutations.
export type EditorStoreAction =
  | { type: "apply"; mutation: EditorMutation; entry: HistoryEntry }
  | { type: "undo"; entry: HistoryEntry }
  | { type: "redo"; entry: HistoryEntry }
  | { type: "external-begin"; entry: HistoryEntry }
  | { type: "external-commit"; entry: HistoryEntry }
  | { type: "external-fail"; entry: HistoryEntry };

export type ApplyOptions = {
  coalesceKey?: string;
  label?: string;
};

export type ApplyOutcome = {
  changed: boolean;
  patches: DocumentPatch[];
  warnings: string[];
};

// Fold a typing burst on one property into one undo entry.
export function typingCoalesceKey(
  nodeId: NodeId,
  key: string,
  device = "desktop",
): string {
  return `typing:${nodeId}:${key}:${device}`;
}

// Fold a drag of one node into one undo entry.
export function dragCoalesceKey(nodeId: NodeId): string {
  return `drag:${nodeId}`;
}

function prefixField(error: unknown, opIndex: number): never {
  if (error instanceof SenifyError) {
    throw new SenifyError(error.category, error.message, {
      field:
        error.field === undefined
          ? `mutations[${opIndex}]`
          : `mutations[${opIndex}].${error.field}`,
      suggestion: error.suggestion,
      opIndex,
    });
  }
  throw error;
}

export class EditorStore {
  #document: EditorDocument;
  #selection: SelectionState;
  readonly #history: HistoryStack;
  readonly #idFactory: () => string;
  #onAction: ((event: EditorStoreAction) => void) | undefined;
  readonly #listeners = new Set<() => void>();

  constructor(options: EditorStoreOptions = {}) {
    this.#idFactory = options.idFactory ?? newNodeId;
    this.#document = options.document ?? createDocument(this.#idFactory);
    this.#selection = options.selection ?? EMPTY_SELECTION;
    this.#history = options.history ?? new HistoryStack();
    this.#onAction = options.onAction;
  }

  // Late binding for the persistence layer: the save pipeline is created after
  // the store (it needs the store), so the constructor option is not always
  // available. Passing `undefined` detaches the listener.
  setActionListener(
    listener: ((event: EditorStoreAction) => void) | undefined,
  ): void {
    this.#onAction = listener;
  }

  // The canvas follows the store instead of polling it: every write, undo,
  // redo and selection change notifies the listeners (Phase 0, fourth slice).
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  get document(): EditorDocument {
    return this.#document;
  }

  get selection(): SelectionState {
    return this.#selection;
  }

  get history(): HistoryStack {
    return this.#history;
  }

  get version(): number {
    return this.#history.applied().length + 1;
  }

  get pendingExternalId(): string | null {
    return this.#history.pendingExternalId;
  }

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  // Recovery may resolve its own lease, but validation precedes every write
  // and observers only see the completely imported history.
  restoreHistory(input: unknown, pendingId?: string): void {
    if (this.#history.size > 0 || this.pendingExternalId !== (pendingId ?? null)) throw new SenifyError("conflict", "Die aktuelle History darf nicht ersetzt werden", { field: "history" });
    const snapshot = checkedEditorHistory(input, this.#document);
    if (pendingId !== undefined) this.#history.failExternal(pendingId);
    this.#history.restore(snapshot);
    this.#emit();
  }

  // The single write gate. Returns the patches of the change, or `changed: false`
  // when the op was a no-op.
  apply(input: unknown, options: ApplyOptions = {}): ApplyOutcome {
    const mutation = parseEditorMutation(input);
    const result = this.#run(mutation);

    if (result.forward.length === 0) {
      return { changed: false, patches: [], warnings: result.warnings };
    }

    const next = applyDocumentPatches(this.#document, result.forward);
    const issue = validateDocument(next)[0];
    if (issue !== undefined) {
      throw new SenifyError(
        "validation",
        `Refusing an inconsistent change: ${issue.message}`,
        {
          field: "document",
          suggestion: "The mutation would break the document; nothing was written.",
        },
      );
    }

    const versionBefore = this.version;
    const entry = this.#history.record({
      label: options.label ?? mutation.op,
      op: mutation.op as MutationOp,
      mutations: result.forward as unknown as Mutation[],
      undoPatch: result.inverse as unknown as PatchOp[],
      batchId: null,
      versionBefore,
      versionAfter: versionBefore + 1,
      ...(options.coalesceKey === undefined
        ? {}
        : { coalesceKey: options.coalesceKey }),
    });
    this.#document = next;
    entry.versionAfter = this.version;
    // Queue persistence before projections can export the changed document.
    this.#onAction?.({ type: "apply", mutation, entry });
    this.#emit();
    return { changed: true, patches: result.forward, warnings: result.warnings };
  }

  // Runs the operation, turning any semantic error into an op-indexed one.
  #run(mutation: EditorMutation): OperationResult {
    try {
      return applyEditorMutation(this.#document, mutation, {
        idFactory: this.#idFactory,
      });
    } catch (error) {
      prefixField(error, 0);
    }
  }

  // Several operations in one atomic step (e.g. wrap: insert a container, then
  // move the node into it). The patches of every step land in one history
  // entry — undo restores the state before the whole action, and the save
  // pipeline forwards the combined patch list like any other change.
  applyBatch(inputs: readonly unknown[], options: ApplyOptions = {}): ApplyOutcome {
    const mutations = inputs.map((input) => parseEditorMutation(input));
    const first = mutations[0];
    if (first === undefined) return { changed: false, patches: [], warnings: [] };
    if (mutations.length > 1) {
      const globalClasses = new Set(this.#document.styleRules.filter((rule) => rule.kind === "class" && rule.scope === undefined).map((rule) => rule.id));
      for (const mutation of mutations) {
        if (mutation.op === "upsertStyleRule" && mutation.rule.kind === "class" && mutation.rule.scope === undefined) globalClasses.add(mutation.rule.id);
        if (mutation.op === "deleteStyleRule" && globalClasses.has(mutation.id)) {
          throw new SenifyError("validation", "Eine globale Klasse muss in einem eigenen Schritt gelöscht werden", { field: "mutations" });
        }
      }
    }
    let document = this.#document;
    const forward: DocumentPatch[] = [];
    const inverse: DocumentPatch[] = [];
    const warnings: string[] = [];
    mutations.forEach((mutation, index) => {
      let result: OperationResult;
      try {
        result = applyEditorMutation(document, mutation, { idFactory: this.#idFactory });
      } catch (error) {
        prefixField(error, index);
      }
      if (result.forward.length === 0) return;
      document = applyDocumentPatches(document, result.forward);
      forward.push(...result.forward);
      // Undo runs the inverses in reverse order: the last step first, so an
      // inserted container is emptied before it is removed.
      inverse.unshift(...result.inverse);
      warnings.push(...result.warnings);
    });
    if (forward.length === 0) return { changed: false, patches: [], warnings };
    const issue = validateDocument(document)[0];
    if (issue !== undefined) {
      throw new SenifyError(
        "validation",
        `Refusing an inconsistent change: ${issue.message}`,
        {
          field: "document",
          suggestion: "The mutations would break the document; nothing was written.",
        },
      );
    }
    const versionBefore = this.version;
    const entry = this.#history.record({
      label: options.label ?? first.op,
      op: first.op as MutationOp,
      mutations: forward as unknown as Mutation[],
      undoPatch: inverse as unknown as PatchOp[],
      batchId: null,
      versionBefore,
      versionAfter: versionBefore + 1,
      ...(options.coalesceKey === undefined
        ? {}
        : { coalesceKey: options.coalesceKey }),
    });
    this.#document = document;
    entry.versionAfter = this.version;
    this.#onAction?.({ type: "apply", mutation: first, entry });
    this.#emit();
    return { changed: true, patches: forward, warnings };
  }

  undo(): boolean {
    const entry = this.#history.undo();
    if (entry === null) return false;
    this.#document = applyDocumentPatches(
      this.#document,
      entry.undoPatch as unknown as DocumentPatch[],
    );
    this.#onAction?.({ type: "undo", entry });
    this.#emit();
    return true;
  }

  redo(): boolean {
    const entry = this.#history.redo();
    if (entry === null) return false;
    this.#document = applyDocumentPatches(
      this.#document,
      entry.mutations as unknown as DocumentPatch[],
    );
    this.#onAction?.({ type: "redo", entry });
    this.#emit();
    return true;
  }

  beginExternalNavigation(direction: HistoryDirection): HistoryEntry {
    const entry = this.#history.beginExternalNavigation(direction);
    this.#emit();
    this.#onAction?.({ type: "external-begin", entry });
    return entry;
  }

  confirmExternalNavigation(pendingId: string, entryId: string, direction: HistoryDirection, document = this.#document): HistoryEntry {
    const issue = validateDocument(document)[0];
    if (issue !== undefined) throw new SenifyError("validation", issue.message, { field: "document" });
    const entry = this.#history.confirmExternalNavigation(pendingId, entryId, direction);
    this.#document = document;
    if (this.#selection.selected.some((id) => document.nodes[id] === undefined)) this.#selection = EMPTY_SELECTION;
    this.#emit();
    // The external runner already persisted this step; never enqueue patches.
    this.#onAction?.({ type: "external-commit", entry });
    return entry;
  }

  // The history dialog (ticket 03 point 5): jump to the state right after
  // `entryId`. Runs through the ordinary undo/redo gate, so document, cursor
  // and save pipeline stay in step — no second restore path.
  restoreTo(entryId: string): boolean {
    const index = this.#history.entries().findIndex((entry) => entry.id === entryId);
    if (index < 0 || this.pendingExternalId !== null) return false;
    // Check the whole route before the first write or persistence event.
    if (!this.#history.canRestoreTo(entryId)) {
      throw new SenifyError("conflict", "Der Verlauf enthält serverseitig ausgeführte Schritte und kann nicht lokal wiederhergestellt werden", { field: "history" });
    }
    let changed = false;
    while (this.#history.applied().length > index + 1) {
      if (!this.undo()) break;
      changed = true;
    }
    while (this.#history.applied().length < index + 1) {
      if (!this.redo()) break;
      changed = true;
    }
    return changed;
  }

  // The server normalizes `order` to the position in the full site registry,
  // while this page's document holds only its own subset. Server responses
  // carry the authoritative numbers, so local copies mirror them; the content
  // stays local so a still-pending batch is never overwritten.
  reconcileStyleRuleOrder(rules: readonly unknown[]): void {
    const orders = new Map<string, number>();
    for (const rule of rules) {
      if (rule === null || typeof rule !== "object") continue;
      const id = (rule as { id?: unknown }).id;
      const order = (rule as { order?: unknown }).order;
      if (typeof id === "string" && Number.isSafeInteger(order) && (order as number) >= 0) orders.set(id, order as number);
    }
    this.#commitStyleRuleOrder(this.#document.styleRules.map((rule) => {
      const order = orders.get(rule.id);
      return order === undefined || order === rule.order ? rule : { ...rule, order };
    }));
  }

  // A delete removes one position from the full registry, a restore inserts one
  // back; every rule behind it shifts by one. Hidden scoped rules of other pages
  // do not change that relative shift, so the known position is enough.
  reconcileStyleRuleOrderShift(order: number | undefined, delta: 1 | -1, targetId?: string): void {
    if (order === undefined || !Number.isSafeInteger(order) || order < 0) return;
    this.#commitStyleRuleOrder(this.#document.styleRules.map((rule) => {
      if (targetId !== undefined && rule.id === targetId) return { ...rule, order };
      const affected = delta === 1 ? rule.order >= order : rule.order > order;
      return affected ? { ...rule, order: rule.order + delta } : rule;
    }));
  }

  #commitStyleRuleOrder(styleRules: EditorDocument["styleRules"]): void {
    const sorted = [...styleRules].sort((left, right) => left.order - right.order);
    const current = this.#document.styleRules;
    if (current.length === sorted.length && current.every((rule, index) => rule === sorted[index])) return;
    this.#document = { ...this.#document, styleRules: sorted };
    this.#emit();
  }

  // Replaces the document and clears its local history. A server operation
  // remains unresolved across loads until its owner explicitly resolves it.
  replaceDocument(document: EditorDocument): void {
    this.#document = document;
    this.#selection = EMPTY_SELECTION;
    this.#history.clear({ preservePendingExternal: true });
    this.#emit();
  }

  // Explicit recovery resolves only its own lease. No observer can write
  // between clearing the old history and installing the replacement.
  resetExternalHistory(id: string, document: EditorDocument): void {
    if (this.pendingExternalId !== id) throw new SenifyError("conflict", "Der Verlaufsvorgang hat sich geändert", { field: "history" });
    const issue = validateDocument(document)[0];
    if (issue !== undefined) throw new SenifyError("validation", issue.message, { field: "document" });
    this.#document = document;
    if (this.#selection.selected.some((nodeId) => document.nodes[nodeId] === undefined)) this.#selection = EMPTY_SELECTION;
    this.#history.clear();
    this.#emit();
  }

  setSelection(selection: SelectionState): void {
    this.#selection = selection;
    this.#emit();
  }

  select(id: NodeId): void {
    this.#selection = expandToReveal(selectOne(this.#selection, id), this.#document, id);
    this.#emit();
  }

  toggle(id: NodeId): void {
    this.#selection = toggleSelect(this.#selection, id);
    this.#emit();
  }

  selectTo(id: NodeId): void {
    this.#selection = selectRange(this.#selection, this.#document, id);
    this.#emit();
  }

  expand(id: NodeId): void {
    this.#selection = expandNode(this.#selection, id);
    this.#emit();
  }

  collapse(id: NodeId): void {
    this.#selection = collapseNode(this.#selection, id);
    this.#emit();
  }

  toggleExpanded(id: NodeId): void {
    this.#selection = toggleExpanded(this.#selection, id);
    this.#emit();
  }

  selectParent(): void {
    this.#selection = selectParentState(this.#selection, this.#document);
    this.#emit();
  }

  selectChildren(): void {
    this.#selection = selectChildrenState(this.#selection, this.#document);
    this.#emit();
  }

  clearSelection(): void {
    this.#selection = clearSelectionState(this.#selection);
    this.#emit();
  }

  beginExternalAction(input: ExternalRecordInput): HistoryEntry {
    const entry = this.#history.beginExternal(input);
    this.#emit();
    this.#onAction?.({ type: "external-begin", entry });
    return entry;
  }

  commitExternalAction(id: string, input: Partial<ExternalRecordInput> = {}): HistoryEntry {
    const entry = this.#history.commitExternal(id, input);
    this.#emit();
    this.#onAction?.({ type: "external-commit", entry });
    return entry;
  }

  failExternalAction(id: string): HistoryEntry | null {
    const entry = this.#history.failExternal(id);
    if (entry === null) return null;
    this.#emit();
    this.#onAction?.({ type: "external-fail", entry });
    return entry;
  }
}
