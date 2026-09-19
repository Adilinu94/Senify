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
import { HistoryStack, type HistoryEntry } from "../history.ts";
import { newNodeId } from "./ids.ts";
import {
  createDocument,
  type EditorDocument,
  type NodeId,
} from "./document.ts";
import { validateDocument } from "./consistency.ts";
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
  | { type: "redo"; entry: HistoryEntry };

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

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
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
    this.#emit();
    this.#onAction?.({ type: "apply", mutation, entry });
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

  undo(): boolean {
    const entry = this.#history.undo();
    if (entry === null) return false;
    this.#document = applyDocumentPatches(
      this.#document,
      entry.undoPatch as unknown as DocumentPatch[],
    );
    this.#emit();
    this.#onAction?.({ type: "undo", entry });
    return true;
  }

  redo(): boolean {
    const entry = this.#history.redo();
    if (entry === null) return false;
    this.#document = applyDocumentPatches(
      this.#document,
      entry.mutations as unknown as DocumentPatch[],
    );
    this.#emit();
    this.#onAction?.({ type: "redo", entry });
    return true;
  }

  // Replaces the document (after a load/migration) and clears the history.
  replaceDocument(document: EditorDocument): void {
    this.#document = document;
    this.#selection = EMPTY_SELECTION;
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
}
