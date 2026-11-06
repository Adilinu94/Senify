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

export type HistoryEntryStatus = "committed" | "pending" | "failed";
export type HistoryDirection = "undo" | "redo";

export type HistoryEntry = {
  id: string;
  label: string;
  at: number;
  op: MutationOp | "inline-text" | "external";
  mutations: Mutation[];
  // Patches that restore the state *before* this entry.
  undoPatch: PatchOp[];
  batchId: string | null;
  versionBefore: number;
  versionAfter: number;
  coalesceKey: string | undefined;
  // External entries represent server-confirmed actions (e.g. variable rename)
  // that cannot be applied as local document patches alone. Pending entries are
  // in-flight and block history navigation until committed or failed.
  status: HistoryEntryStatus;
  external?: boolean;
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

export type ExternalRecordInput = {
  id?: string;
  label: string;
  op?: "external";
  mutations?: Mutation[];
  undoPatch?: PatchOp[];
  batchId?: string | null;
  versionBefore: number;
  versionAfter: number;
};

export type HistoryStackOptions = {
  limit?: number;
  now?: () => number;
  idFactory?: () => string;
};

export const HISTORY_LIMIT = 200;

export type HistorySnapshot = { format: 1; entries: HistoryEntry[]; cursor: number };

// Persisted history is data, never a live entry reference or pending lease.
export function isHistoryData(value: unknown, depth = 0): boolean {
  if (depth > 100) return false;
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isHistoryData(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).every(([key, item]) => !["__proto__", "constructor", "prototype"].includes(key) && isHistoryData(item, depth + 1));
}

function checkedSnapshot(input: unknown, limit: number): HistorySnapshot {
  const fail = (): never => { throw new SenifyError("validation", "Ungültiger History-Checkpoint", { field: "history" }); };
  if (!isHistoryData(input) || input === null || typeof input !== "object") return fail();
  const value = input as Partial<HistorySnapshot>;
  if (value.format !== 1 || !Array.isArray(value.entries) || value.entries.length > limit ||
      !Number.isSafeInteger(value.cursor) || value.cursor! < 0 || value.cursor! > value.entries.length) return fail();
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0 || ids.has(entry.id) ||
        typeof entry.label !== "string" || !Number.isFinite(entry.at) || typeof entry.op !== "string" || entry.op.length === 0 ||
        !Array.isArray(entry.mutations) || !Array.isArray(entry.undoPatch) || entry.status !== "committed" ||
        (entry.batchId !== null && typeof entry.batchId !== "string") ||
        !Number.isSafeInteger(entry.versionBefore) || entry.versionBefore < 1 || !Number.isSafeInteger(entry.versionAfter) || entry.versionAfter < 1 ||
        (entry.coalesceKey !== undefined && typeof entry.coalesceKey !== "string") ||
        (entry.external !== undefined && typeof entry.external !== "boolean") ||
        ((entry.external === true) !== (entry.op === "external")) ||
        (entry.external && (entry.mutations.length > 0 || entry.undoPatch.length > 0))) return fail();
    ids.add(entry.id);
  }
  return structuredClone(value as HistorySnapshot);
}

let fallbackCounter = 0;

// Retained history entries may still point at the old variable name. Structured
// `$token`/`$ref` values are unambiguous and can be rewritten in both
// directions. A CSS-text reference in an old patch cannot be proven safe (the
// value may no longer exist in the current document), so the caller discards
// the retained history instead of guessing.
export function renameHistoryReferences(entries: readonly HistoryEntry[], family: string, oldName: string, newName: string): HistoryEntry[] | null {
  const oldRef = `${family}.${oldName}`;
  const newRef = `${family}.${newName}`;
  const cssVariable = `--${family === "color" ? "color" : "space"}-${oldName}`;
  const cssReference = new RegExp(`[vV][aA][rR]\\(\\s*${cssVariable}(?=\\s|,|\\))`);
  let unsafe = false;
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      if (cssReference.test(item)) unsafe = true;
      return item;
    }
    if (item === null || typeof item !== "object") return item;
    if (Array.isArray(item)) return item.map(visit);
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
      (key === "$token" || key === "$ref") && child === oldRef ? newRef : visit(child),
    ]));
  };
  const migrated = entries.map((entry) => ({
    ...entry,
    mutations: visit(entry.mutations) as Mutation[],
    undoPatch: visit(entry.undoPatch) as PatchOp[],
  }));
  return unsafe ? null : migrated;
}

function defaultId(): string {
  fallbackCounter += 1;
  return `hist_${fallbackCounter.toString(36)}`;
}

export class HistoryStack {
  readonly #entries: HistoryEntry[] = [];
  #cursor = 0;
  // History navigation or removal ends the previous typing/drag burst.
  #canCoalesce = false;
  #pendingExternal: HistoryEntry | null = null;
  #externalNavigation: { entryId: string; direction: HistoryDirection } | null = null;
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

  get pendingExternalId(): string | null {
    return this.#pendingExternal?.id ?? null;
  }

  get canUndo(): boolean {
    if (this.#pendingExternal !== null) return false;
    const entry = this.#entries[this.#cursor - 1];
    return entry?.status === "committed" && !entry.external;
  }

  get canRedo(): boolean {
    if (this.#pendingExternal !== null) return false;
    const entry = this.#entries[this.#cursor];
    return entry?.status === "committed" && !entry.external;
  }

  // Oldest first, including the redoable future.
  entries(): HistoryEntry[] {
    return [...this.#entries];
  }

  snapshot(): HistorySnapshot {
    if (this.#pendingExternal !== null) throw new SenifyError("conflict", "Ein externer Vorgang wird noch ausgeführt", { field: "history" });
    return structuredClone({ format: 1, entries: this.#entries, cursor: this.#cursor });
  }

  restore(input: unknown): void {
    if (this.#pendingExternal !== null) throw new SenifyError("conflict", "Ein externer Vorgang wird noch ausgeführt", { field: "history" });
    const snapshot = checkedSnapshot(input, this.#limit);
    this.#entries.splice(0, this.#entries.length, ...snapshot.entries);
    this.#cursor = snapshot.cursor;
    this.#canCoalesce = false;
  }

  // Migrates retained patches after a confirmed rename. A running external
  // navigation keeps its reserved route; migration then waits for it.
  renameReferences(family: string, oldName: string, newName: string): boolean {
    if (this.#externalNavigation !== null) return false;
    const migrated = renameHistoryReferences(this.#entries, family, oldName, newName);
    if (migrated === null) return false;
    this.#entries.splice(0, this.#entries.length, ...migrated);
    return true;
  }

  #newId(): string {
    const base = this.#idFactory();
    const ids = new Set(this.#entries.map((entry) => entry.id));
    if (this.#pendingExternal !== null) ids.add(this.#pendingExternal.id);
    let id = base;
    for (let suffix = 1; ids.has(id); suffix += 1) id = `${base}_${suffix}`;
    return id;
  }

  top(): HistoryEntry | null {
    return this.#entries[this.#cursor - 1] ?? null;
  }

  navigationEntry(direction: HistoryDirection): HistoryEntry | null {
    if (this.#pendingExternal !== null) return null;
    const entry = this.#entries[direction === "undo" ? this.#cursor - 1 : this.#cursor];
    return entry?.status === "committed" ? entry : null;
  }

  beginExternalNavigation(direction: HistoryDirection): HistoryEntry {
    const entry = this.navigationEntry(direction);
    if (!entry?.external) throw new SenifyError("conflict", "Kein externer Verlaufsschritt verfügbar", { field: "history" });
    const pending = this.beginExternal({ id: entry.id, label: entry.label, versionBefore: entry.versionBefore, versionAfter: entry.versionAfter });
    this.#externalNavigation = { entryId: entry.id, direction };
    return pending;
  }

  canConfirmExternalNavigation(pendingId: string, entryId: string, direction: HistoryDirection): boolean {
    const target = this.#entries[direction === "undo" ? this.#cursor - 1 : this.#cursor];
    return this.#pendingExternal?.id === pendingId && this.#externalNavigation?.entryId === entryId &&
      this.#externalNavigation.direction === direction && target?.id === entryId && target.external === true && target.status === "committed";
  }

  confirmExternalNavigation(pendingId: string, entryId: string, direction: HistoryDirection): HistoryEntry {
    if (!this.canConfirmExternalNavigation(pendingId, entryId, direction)) {
      throw new SenifyError("conflict", "Der reservierte Verlaufsschritt ist nicht mehr verfügbar", { field: "history" });
    }
    const entry = this.#entries[direction === "undo" ? this.#cursor - 1 : this.#cursor]!;
    this.#cursor += direction === "undo" ? -1 : 1;
    this.#pendingExternal = null;
    this.#externalNavigation = null;
    this.#canCoalesce = false;
    return entry;
  }

  record(input: RecordInput): HistoryEntry {
    if (this.#cursor < this.#entries.length) {
      this.#entries.splice(this.#cursor);
    }
    const previous = this.#entries[this.#cursor - 1];
    if (
      previous &&
      previous.status === "committed" &&
      !previous.external &&
      this.#canCoalesce &&
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
      id: this.#newId(),
      label: input.label,
      at: this.#now(),
      op: input.op,
      mutations: [...input.mutations],
      undoPatch: [...input.undoPatch],
      batchId: input.batchId,
      versionBefore: input.versionBefore,
      versionAfter: input.versionAfter,
      coalesceKey: input.coalesceKey,
      status: "committed",
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) {
      this.#entries.shift();
    }
    this.#cursor = this.#entries.length;
    this.#canCoalesce = true;
    return entry;
  }

  beginExternal(input: ExternalRecordInput): HistoryEntry {
    if (this.#pendingExternal !== null) {
      throw new SenifyError("conflict", "Ein externer Vorgang wird noch ausgeführt", {
        field: "history",
      });
    }
    // Tracked outside the committed stack so concurrent local document edits are
    // not blocked or spliced. Navigation (undo/redo/restore) is blocked until
    // resolved; commit inserts a non-local server-confirmed marker at the end.
    this.#canCoalesce = false;
    const entry: HistoryEntry = {
      id: input.id ?? this.#newId(),
      label: input.label,
      at: this.#now(),
      op: input.op ?? "external",
      mutations: [],
      undoPatch: [],
      batchId: input.batchId ?? null,
      versionBefore: input.versionBefore,
      versionAfter: input.versionAfter,
      coalesceKey: undefined,
      status: "pending",
      external: true,
    };
    this.#pendingExternal = entry;
    return entry;
  }

  canCommitExternal(id: string): boolean {
    return this.#pendingExternal?.id === id && this.#externalNavigation === null;
  }

  commitExternal(id: string, input: Partial<ExternalRecordInput> = {}): HistoryEntry {
    if (this.#pendingExternal?.id === id && this.#externalNavigation !== null) {
      throw new SenifyError("conflict", "Eine Verlaufsnavigation muss als Navigation bestätigt werden", { field: "history" });
    }
    const entry = this.#pendingExternal?.id === id ? this.#pendingExternal : this.#entries.find((item) => item.id === id && item.status === "pending" && item.external);
    if (!entry || entry.status !== "pending" || !entry.external) {
      throw new SenifyError("not_found", `Pending external entry "${id}" does not exist`, {
        field: "entryId",
      });
    }
    if (input.label !== undefined) entry.label = input.label;
    if (input.mutations !== undefined) entry.mutations = [...input.mutations];
    if (input.undoPatch !== undefined) entry.undoPatch = [...input.undoPatch];
    if (input.batchId !== undefined) entry.batchId = input.batchId;
    if (input.versionAfter !== undefined) entry.versionAfter = input.versionAfter;
    entry.status = "committed";
    entry.at = this.#now();
    this.#canCoalesce = false;
    if (this.#pendingExternal?.id === id) {
      this.#pendingExternal = null;
      // Drop redo branch and append the server-confirmed marker after current
      // local edits; local undo/redo across it remains blocked until async
      // server undo/redo is wired.
      if (this.#cursor < this.#entries.length) this.#entries.splice(this.#cursor);
      this.#entries.push(entry);
      if (this.#entries.length > this.#limit) this.#entries.shift();
      this.#cursor = this.#entries.length;
    }
    return entry;
  }

  failExternal(id: string): HistoryEntry | null {
    if (this.#pendingExternal?.id === id) {
      const entry = this.#pendingExternal;
      this.#pendingExternal = null;
      this.#externalNavigation = null;
      this.#canCoalesce = false;
      return entry;
    }
    const index = this.#entries.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [entry] = this.#entries.splice(index, 1);
    if (!entry || entry.status !== "pending" || !entry.external) {
      if (entry) this.#entries.splice(index, 0, entry);
      return null;
    }
    if (index < this.#cursor) this.#cursor -= 1;
    this.#cursor = Math.min(this.#cursor, this.#entries.length);
    this.#canCoalesce = false;
    return entry;
  }

  undo(): HistoryEntry | null {
    if (this.#pendingExternal !== null) return null;
    const entry = this.#entries[this.#cursor - 1];
    if (entry?.external) {
      throw new SenifyError("conflict", "Dieser Schritt wurde serverseitig ausgeführt und kann hier nicht lokal rückgängig gemacht werden", { field: "history" });
    }
    if (!entry || entry.status !== "committed") return null;
    this.#canCoalesce = false;
    this.#cursor -= 1;
    return entry;
  }

  redo(): HistoryEntry | null {
    if (this.#pendingExternal !== null) return null;
    const entry = this.#entries[this.#cursor];
    if (entry?.external) {
      throw new SenifyError("conflict", "Dieser Schritt wurde serverseitig ausgeführt und kann hier nicht lokal wiederholt werden", { field: "history" });
    }
    if (!entry || entry.status !== "committed") return null;
    this.#canCoalesce = false;
    this.#cursor += 1;
    return entry;
  }

  // Drops an entry without touching the cursor — used when an inline edit is
  // reverted with Escape (the revert itself is the undo).
  remove(entryId: string): HistoryEntry | null {
    const index = this.#entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return null;
    this.#canCoalesce = false;
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

  #routeTo(entryId: string): HistoryDirection | null {
    if (this.#pendingExternal !== null) return null;
    const index = this.#entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return null;
    const target = index + 1;
    if (target === this.#cursor) return null;
    return target < this.#cursor ? "undo" : "redo";
  }

  // The full path to `entryId`, in execution order. Each step is one
  // undo/redo: undo walks the applied stack down to the target, redo walks the
  // future stack up to it. A pending operation, an unknown entry or the current
  // state returns null.
  routeTo(entryId: string): { direction: HistoryDirection; entry: HistoryEntry }[] | null {
    const direction = this.#routeTo(entryId);
    if (direction === null) return null;
    const index = this.#entries.findIndex((entry) => entry.id === entryId);
    const target = index + 1;
    if (direction === "undo") {
      const route: { direction: HistoryDirection; entry: HistoryEntry }[] = [];
      for (let i = this.#cursor - 1; i >= target; i -= 1) {
        const entry = this.#entries[i];
        if (!entry || entry.status !== "committed") return null;
        route.push({ direction, entry });
      }
      return route;
    }
    const route: { direction: HistoryDirection; entry: HistoryEntry }[] = [];
    for (let i = this.#cursor; i < target; i += 1) {
      const entry = this.#entries[i];
      if (!entry || entry.status !== "committed") return null;
      route.push({ direction, entry });
    }
    return route;
  }

  // True when every step on the route is a committed local entry: the jump can
  // run synchronously through the store's patch gate.
  canRestoreTo(entryId: string): boolean {
    const route = this.routeTo(entryId);
    return route !== null && route.every((step) => !step.entry.external);
  }

  // True when the route exists and every step is either local or a confirmed
  // external entry. Executing it still requires a registered runner and a clean
  // save state for each external step.
  canRestoreToAsync(entryId: string): boolean {
    return this.routeTo(entryId) !== null;
  }

  // „Restore as Draft": the patches that roll the applied stack back to the
  // state right after `entryId` (apply them with `applyTreePatches`).
  restoreAsDraft(entryId: string): PatchOp[] {
    if (this.#pendingExternal !== null) {
      throw new SenifyError("conflict", "Ein externer Vorgang wird noch ausgeführt", { field: "history" });
    }
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
    const target = this.#entries[index];
    if (target?.external) {
      throw new SenifyError("conflict", "Zu einem serverseitig ausgeführten Schritt kann nicht lokal als Entwurf zurückgesprungen werden", { field: "entryId" });
    }
    const later = this.#entries.slice(index + 1, this.#cursor);
    if (later.some((entry) => entry.external)) {
      throw new SenifyError("conflict", "Der Verlauf enthält serverseitig ausgeführte Schritte und kann nicht lokal als Entwurf wiederhergestellt werden", { field: "history" });
    }
    const patches: PatchOp[] = [];
    for (let position = later.length - 1; position >= 0; position -= 1) {
      const entry = later[position];
      if (entry) patches.push(...entry.undoPatch);
    }
    return patches;
  }

  clear(options: { preservePendingExternal?: boolean } = {}): void {
    this.#entries.splice(0, this.#entries.length);
    this.#cursor = 0;
    this.#canCoalesce = false;
    if (!options.preservePendingExternal) {
      this.#pendingExternal = null;
      this.#externalNavigation = null;
    }
  }
}
