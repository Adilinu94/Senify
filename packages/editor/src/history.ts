import { SenifyError } from "@senify/core";
import type { Mutation, MutationOp, PatchOp } from "@senify/engine";
import type { Node } from "@senify/section-sdk";

// Undo/Redo runs on the canonical patches the engine hands back for every
// batch (artifacts/09 §6). Nothing is re-implemented: an undo replays
// `undoPatch`, a redo replays the forward mutations.

export function patchesToMutations(patches: readonly PatchOp[]): Mutation[] {
  const mutations: Mutation[] = [];
  for (const patch of patches) {
    switch (patch.patch) {
      case "setProps":
        mutations.push({ op: "updateNodeProps", id: patch.id, patch: patch.props });
        break;
      case "setPageMeta":
        mutations.push({ op: "updatePageMeta", title: patch.title, path: patch.path });
        break;
      case "setNodeFields":
        mutations.push({ op: "updateNodeMeta", id: patch.id, meta: {
          variant: patch.fields.variant ?? null,
          locked: patch.fields.locked ?? false,
          hidden: patch.fields.hidden ?? false,
        } });
        break;
      case "setOverride":
        mutations.push({ op: "clearBreakpointOverride", id: patch.id, breakpoint: patch.breakpoint });
        if (patch.override !== null) mutations.push({
          op: "setBreakpointOverride", id: patch.id, breakpoint: patch.breakpoint, override: patch.override,
        });
        break;
      case "setMotion":
        mutations.push(patch.spec === null
          ? { op: "clearMotion", id: patch.id }
          : { op: "setMotion", id: patch.id, spec: patch.spec });
        break;
      case "deleteRaw":
        mutations.push({ op: "deleteNode", id: patch.id });
        break;
      case "moveRaw":
        mutations.push({ op: "moveNode", id: patch.id, target: patch.target, index: patch.index });
        break;
      case "insertRaw": {
        const nodes = new Map(patch.nodes.map((node) => [node.id, node]));
        const seen = new Set<string>();
        const restore = (node: Node, parent: Extract<Mutation, { op: "insertNode" }>["parent"], index: number): void => {
          if (seen.has(node.id)) throw new Error("Ungültiger History-Baum");
          seen.add(node.id);
          mutations.push({ op: "insertNode", parent, index, node: {
            id: node.id, type: node.type, props: node.props,
            ...(node.variant === undefined ? {} : { variant: node.variant }),
          } });
          if (node.hidden !== undefined || node.locked !== undefined) {
            mutations.push({ op: "updateNodeMeta", id: node.id, meta: {
              ...(node.hidden === undefined ? {} : { hidden: node.hidden }),
              ...(node.locked === undefined ? {} : { locked: node.locked }),
            } });
          }
          for (const breakpoint of ["tablet", "mobile"] as const) {
            const override = node.overrides?.[breakpoint];
            if (override) mutations.push({ op: "setBreakpointOverride", id: node.id, breakpoint, override });
          }
          if (node.motion) mutations.push({ op: "setMotion", id: node.id, spec: node.motion });
          const children = (ids: string[], slot?: string): void => {
            ids.forEach((id, childIndex) => {
              const child = nodes.get(id);
              if (!child) throw new Error(`History-Knoten fehlt: ${id}`);
              restore(child, { nodeId: node.id, ...(slot === undefined ? {} : { slot }) }, childIndex);
            });
          };
          children(node.children ?? []);
          for (const [slot, ids] of Object.entries(node.slots ?? {})) children(ids, slot);
        };
        const root = patch.nodes[0];
        if (!root) throw new Error("Leerer History-Baum");
        restore(root, patch.parent, patch.index);
        break;
      }
    }
  }
  return mutations;
}

export type HistoryEntry = {
  id: string;
  label: string;
  at: number;
  op: MutationOp | "inline-text";
  mutations: Mutation[];
  // Patches that restore the state *before* this entry.
  undoPatch: PatchOp[];
  batchId: string | null;
  versionBefore: number;
  versionAfter: number;
  coalesceKey: string | undefined;
};

export type RecordInput = {
  label: string;
  op: MutationOp | "inline-text";
  mutations: Mutation[];
  undoPatch: PatchOp[];
  batchId: string | null;
  versionBefore: number;
  versionAfter: number;
  coalesceKey?: string;
};

export type HistoryStackOptions = {
  limit?: number;
  now?: () => number;
  idFactory?: () => string;
};

export const HISTORY_LIMIT = 200;

let fallbackCounter = 0;

function defaultId(): string {
  fallbackCounter += 1;
  return `hist_${fallbackCounter.toString(36)}`;
}

export class HistoryStack {
  readonly #entries: HistoryEntry[] = [];
  #cursor = 0;
  readonly #limit: number;
  readonly #now: () => number;
  readonly #idFactory: () => string;

  constructor(options?: HistoryStackOptions) {
    this.#limit = options?.limit ?? HISTORY_LIMIT;
    this.#now = options?.now ?? (() => Date.now());
    this.#idFactory = options?.idFactory ?? defaultId;
  }

  get size(): number {
    return this.#entries.length;
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#entries.length;
  }

  // Oldest first, including the redoable future.
  entries(): HistoryEntry[] {
    return [...this.#entries];
  }

  top(): HistoryEntry | null {
    return this.#entries[this.#cursor - 1] ?? null;
  }

  record(input: RecordInput): HistoryEntry {
    if (this.#cursor < this.#entries.length) {
      this.#entries.splice(this.#cursor);
    }
    const previous = this.#entries[this.#cursor - 1];
    if (
      previous &&
      input.coalesceKey !== undefined &&
      previous.coalesceKey === input.coalesceKey
    ) {
      // A coalesced burst keeps the FIRST undo patch: one Cmd+Z restores the
      // state before the burst (inline typing, artifacts/24 §2).
      previous.mutations = [...previous.mutations, ...input.mutations];
      previous.versionAfter = input.versionAfter;
      previous.label = input.label;
      previous.at = this.#now();
      return previous;
    }
    const entry: HistoryEntry = {
      id: this.#idFactory(),
      label: input.label,
      at: this.#now(),
      op: input.op,
      mutations: [...input.mutations],
      undoPatch: [...input.undoPatch],
      batchId: input.batchId,
      versionBefore: input.versionBefore,
      versionAfter: input.versionAfter,
      coalesceKey: input.coalesceKey,
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) {
      this.#entries.shift();
    }
    this.#cursor = this.#entries.length;
    return entry;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo) return null;
    this.#cursor -= 1;
    return this.#entries[this.#cursor] ?? null;
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo) return null;
    const entry = this.#entries[this.#cursor] ?? null;
    this.#cursor += 1;
    return entry;
  }

  // Drops an entry without touching the cursor — used when an inline edit is
  // reverted with Escape (the revert itself is the undo).
  remove(entryId: string): HistoryEntry | null {
    const index = this.#entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return null;
    const [removed] = this.#entries.splice(index, 1);
    if (index < this.#cursor) this.#cursor -= 1;
    return removed ?? null;
  }

  applied(): HistoryEntry[] {
    return this.#entries.slice(0, this.#cursor);
  }

  future(): HistoryEntry[] {
    return this.#entries.slice(this.#cursor);
  }

  // „Restore as Draft": the patches that roll the applied stack back to the
  // state right after `entryId` (apply them with `applyTreePatches`).
  restoreAsDraft(entryId: string): PatchOp[] {
    const index = this.#entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) {
      throw new SenifyError("not_found", `History entry "${entryId}" does not exist`, {
        field: "entryId",
      });
    }
    if (index >= this.#cursor) {
      throw new SenifyError(
        "validation",
        "Only applied history entries can be restored as draft",
        {
          field: "entryId",
          suggestion: "Redo the entry first, then restore it.",
        },
      );
    }
    const later = this.#entries.slice(index + 1, this.#cursor);
    const patches: PatchOp[] = [];
    for (let position = later.length - 1; position >= 0; position -= 1) {
      const entry = later[position];
      if (entry) patches.push(...entry.undoPatch);
    }
    return patches;
  }

  clear(): void {
    this.#entries.splice(0, this.#entries.length);
    this.#cursor = 0;
  }
}
