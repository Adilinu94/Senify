// The save pipeline (ticket 13, O13 follow-up). Autosave, bundled.
//
// The canvas store reports every committed change through `onAction`; this
// module turns that stream into requests:
//
// - structure and value ops go to `POST /api/pages/:pageId/editor-mutations`
//   (the engine translates them to section mutations and writes the draft),
// - style rule ops go to the site routes (`/api/sites/:siteId/style-rules`),
//   because the registry is site-wide and does not belong to a page draft.
//
// Behaviour (decided 18.09.):
// - **Autosave, bundled:** a quiet period (default 400 ms) collects a burst;
//   `flush()` sends immediately. There is no Cmd+S.
// - **Conflict:** a `409` on the page batch pauses the pipeline and surfaces a
//   conflict state with the server version. `retry()` resends the pending
//   batch against the current version; the shell reloads and calls
//   `acceptVersion()` when the user chooses to.
// - **Undo/redo** are persisted too: the store's history entry carries the
//   patch lists, and `patchesToPending` translates them back into mutations.
// - **Every editor op is persistable now** (ticket 13 rest closed): slot and
//   collection changes travel as `insertNode`/`deleteNode`/`setNodeProp` on a
//   slot parent — the section tree knows slots, and the bridge knows the three
//   dedicated ops for callers that send them directly.
//
// The module is browser-safe and transport-agnostic: `request` is injected, so
// tests drive it with a fake and the shell passes `fetch`.

import type { Author } from "@senify/section-sdk";
import { baseKeyOf, type StyleRule } from "@senify/widget-engine";
import type { EditorMutation } from "@senify/engine/browser";
import type { DocumentPatch } from "./patches.ts";
import type { EditorNode, ParentRef } from "./document.ts";
import type { EditorStore, EditorStoreAction } from "./store.ts";

export type SaveRequest = {
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
};

export type SaveResponse = { status: number; body?: unknown };

export type SaveTransport = (request: SaveRequest) => Promise<SaveResponse>;

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export type SaveState = {
  status: SaveStatus;
  pending: number;
  version: number;
  // Op names the transport cannot persist. Empty today; the field stays as
  // the loud channel for future ops the page route rejects.
  unsupported: string[];
  message?: string;
};

export type SaveListener = (state: SaveState) => void;

export type SavePipelineOptions = {
  store: EditorStore;
  pageId: string;
  siteId: string;
  author: Author;
  request: SaveTransport;
  // Rule ids the server already knows. An upsert of a known id becomes a PATCH
  // (create with the same id would duplicate the registry entry).
  knownRuleIds?: Iterable<string>;
  debounceMs?: number;
};

export type SavePipeline = {
  state(): SaveState;
  subscribe(listener: SaveListener): () => void;
  // Resend after a conflict. Without a version the one parsed from the `409`
  // is used; if that is unknown too, the pipeline stays paused.
  retry(version?: number): Promise<void>;
  flush(): Promise<void>;
  // After a reload the shell hands in the fresh draft version.
  acceptVersion(version: number): void;
  markRuleKnown(id: string): void;
  dispose(): void;
};

// Ops the page route can persist today — the full editor vocabulary.
const PAGE_OPS = new Set<string>([
  "setNodeProp",
  "clearNodeProp",
  "setNodeMeta",
  "setMotion",
  "clearMotion",
  "assignClass",
  "removeClass",
  "insertNode",
  "deleteNode",
  "moveNode",
  "duplicateNode",
  "setSlotContent",
  "createCollectionEntry",
  "updateCollectionEntry",
]);

// Ops that belong to the site-wide registry.
const SITE_OPS = new Set<string>([
  "upsertStyleRule",
  "deleteStyleRule",
  "reorderStyleRule",
  "renameStyleRule",
]);

type PendingSite =
  | { kind: "upsert"; rule: StyleRule }
  | { kind: "delete"; id: string }
  | { kind: "reorder"; id: string; index: number }
  | { kind: "rename"; id: string; name: string };

type Pending =
  | { kind: "page"; mutation: EditorMutation }
  | { kind: "site"; op: PendingSite };

const DEFAULT_DEBOUNCE_MS = 400;

function deviceOfKey(key: string): { key: string; device?: "tablet" | "mobile" } {
  const base = baseKeyOf(key);
  if (base === key) return { key };
  return { key: base, device: key.slice(base.length + 1) as "tablet" | "mobile" };
}

// The editor node as the transport spec (`EditorNodeSpec`).
function nodeSpec(node: EditorNode): EditorMutation["op"] extends never ? never : Record<string, unknown> {
  return {
    primitive: node.primitive,
    id: node.id,
    props: { ...node.props },
    ...(node.classes === undefined ? {} : { classes: [...node.classes] }),
    ...(node.hidden === undefined ? {} : { hidden: node.hidden }),
    ...(node.hiddenDevices === undefined ? {} : { hiddenDevices: [...node.hiddenDevices] }),
    ...(node.locked === undefined ? {} : { locked: node.locked }),
    ...(node.motion === undefined ? {} : { motion: structuredClone(node.motion) }),
  };
}

// `insertNodes` restores a whole subtree; the transport inserts one node at a
// time, so the list is replayed parents-first with the recorded parent refs.
function insertMutationsFor(
  patch: Extract<DocumentPatch, { patch: "insertNodes" }>,
): EditorMutation[] {
  const nodes = patch.nodes;
  const root = nodes[0];
  if (root === undefined) return [];
  const known = new Set(nodes.map((node) => node.id));
  const where = new Map<string, { parent: ParentRef; index: number }>();
  where.set(root.id, { parent: patch.parent, index: patch.index });
  for (const node of nodes) {
    (node.children ?? []).forEach((childId, index) => {
      if (known.has(childId)) where.set(childId, { parent: { nodeId: node.id }, index });
    });
    for (const [slot, list] of Object.entries(node.slots ?? {})) {
      list.forEach((childId, index) => {
        if (known.has(childId)) where.set(childId, { parent: { nodeId: node.id, slot }, index });
      });
    }
  }
  const mutations: EditorMutation[] = [];
  for (const node of nodes) {
    const place = where.get(node.id);
    if (place === undefined) continue;
    mutations.push({
      op: "insertNode",
      parent: place.parent,
      index: place.index,
      node: nodeSpec(node),
    } as EditorMutation);
  }
  return mutations;
}

// Patch list -> what has to be sent. Used for undo and redo, where the store
// hands in the history entry instead of the original mutation.
export function patchesToPending(patches: readonly DocumentPatch[]): {
  pending: Pending[];
  unsupported: string[];
} {
  const pending: Pending[] = [];
  const unsupported: string[] = [];

  for (const patch of patches) {
    switch (patch.patch) {
      case "setNodeProps": {
        for (const [storeKey, value] of Object.entries(patch.props)) {
          const { key, device } = deviceOfKey(storeKey);
          if (value === null) {
            pending.push({
              kind: "page",
              mutation: { op: "clearNodeProp", id: patch.id, key, ...(device === undefined ? {} : { device }) },
            });
          } else {
            pending.push({
              kind: "page",
              mutation: {
                op: "setNodeProp",
                id: patch.id,
                key,
                value,
                ...(device === undefined ? {} : { device }),
              },
            });
          }
        }
        break;
      }
      case "insertNodes": {
        for (const mutation of insertMutationsFor(patch)) {
          pending.push({ kind: "page", mutation });
        }
        break;
      }
      case "deleteNode":
        pending.push({ kind: "page", mutation: { op: "deleteNode", id: patch.id } });
        break;
      case "moveNode":
        pending.push({
          kind: "page",
          mutation: { op: "moveNode", id: patch.id, target: patch.target, index: patch.index },
        });
        break;
      case "upsertStyleRule":
        pending.push({ kind: "site", op: { kind: "upsert", rule: patch.rule } });
        break;
      case "deleteStyleRule":
        pending.push({ kind: "site", op: { kind: "delete", id: patch.id } });
        break;
      case "reorderStyleRule":
        pending.push({ kind: "site", op: { kind: "reorder", id: patch.id, index: patch.index } });
        break;
      case "renameStyleRule":
        pending.push({ kind: "site", op: { kind: "rename", id: patch.id, name: patch.name } });
        break;
      case "setNodeFields": {
        // Structural fields travel as one `setNodeMeta` op; the bridge maps it
        // field by field onto the section `updateNodeMeta`.
        const meta = {
          ...(patch.fields.classes === undefined ? {} : { classes: patch.fields.classes }),
          ...(patch.fields.hidden === undefined ? {} : { hidden: patch.fields.hidden }),
          ...(patch.fields.locked === undefined ? {} : { locked: patch.fields.locked }),
        };
        if (Object.keys(meta).length > 0) {
          pending.push({
            kind: "page",
            mutation: { op: "setNodeMeta", id: patch.id, meta },
          });
        }
        // Ticket 11: the per-breakpoint hidden flags have their own op; the
        // bridge writes both devices idempotently.
        if (patch.fields.hiddenDevices !== undefined) {
          pending.push({
            kind: "page",
            mutation: {
              op: "setNodeHiddenDevices",
              id: patch.id,
              devices: [...(patch.fields.hiddenDevices ?? [])],
            },
          });
        }
        break;
      }
      case "setNodeMotion": {
        // The motion patch maps 1:1 onto the section op; `null` is the clear.
        pending.push({
          kind: "page",
          mutation:
            patch.spec === null
              ? { op: "clearMotion", id: patch.id }
              : { op: "setMotion", id: patch.id, spec: patch.spec },
        });
        break;
      }
    }
  }

  return { pending, unsupported };
}

function readVersion(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)["newDraftVersion"];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// The `409` envelope carries the current version in its message
// ("expected v3, current v7"); the field is not part of the error shape.
function readConflictVersion(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const error = (body as { error?: { message?: unknown } }).error;
  if (typeof error?.message !== "string") return undefined;
  const match = /current v(\d+)/.exec(error.message);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function messageOf(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message !== "") return error.message;
  }
  return fallback;
}

function transportRule(rule: StyleRule): Record<string, unknown> {
  return {
    id: rule.id,
    name: rule.name,
    kind: rule.kind,
    selector: rule.selector,
    ...(rule.description === undefined ? {} : { description: rule.description }),
    styles: { ...rule.styles },
    ...(rule.stylePriorities === undefined ? {} : { stylePriorities: { ...rule.stylePriorities } }),
    ...(rule.states === undefined ? {} : { states: { ...rule.states } }),
    ...(rule.statePriorities === undefined ? {} : { statePriorities: { ...rule.statePriorities } }),
    contextStyles: { ...rule.contextStyles },
    ...(rule.contextStylePriorities === undefined
      ? {}
      : { contextStylePriorities: { ...rule.contextStylePriorities } }),
    ...(rule.rawCss === undefined ? {} : { rawCss: rule.rawCss }),
    ...(rule.authoredBy === undefined ? {} : { authoredBy: rule.authoredBy }),
  };
}

// PATCH carries only the mutable fields; id, kind and order are the route's.
function rulePatch(rule: StyleRule): Record<string, unknown> {
  return {
    ...(rule.kind === "class" && rule.scope === undefined ? { name: rule.name } : {}),
    ...(rule.kind === "ambient" ? { selector: rule.selector } : {}),
    ...(rule.description === undefined ? {} : { description: rule.description }),
    styles: { ...rule.styles },
    ...(rule.stylePriorities === undefined ? {} : { stylePriorities: { ...rule.stylePriorities } }),
    ...(rule.states === undefined ? {} : { states: { ...rule.states } }),
    ...(rule.statePriorities === undefined ? {} : { statePriorities: { ...rule.statePriorities } }),
    contextStyles: { ...rule.contextStyles },
    ...(rule.contextStylePriorities === undefined
      ? {}
      : { contextStylePriorities: { ...rule.contextStylePriorities } }),
    ...(rule.rawCss === undefined ? {} : { rawCss: rule.rawCss }),
    ...(rule.authoredBy === undefined ? {} : { authoredBy: rule.authoredBy }),
  };
}

export function createSavePipeline(options: SavePipelineOptions): SavePipeline {
  const { store, pageId, siteId, author, request } = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const knownRuleIds = new Set<string>(options.knownRuleIds ?? []);

  let pending: Pending[] = [];
  let version = 1;
  let status: SaveStatus = "idle";
  let message: string | undefined;
  let conflictVersion: number | undefined;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const unsupported = new Set<string>();
  const listeners = new Set<SaveListener>();

  const state = (): SaveState => ({
    status,
    pending: pending.length,
    version,
    unsupported: [...unsupported],
    ...(message === undefined ? {} : { message }),
  });

  const emit = (): void => {
    const snapshot = state();
    for (const listener of [...listeners]) listener(snapshot);
  };

  const setStatus = (next: SaveStatus, nextMessage?: string): void => {
    status = next;
    message = nextMessage;
    emit();
  };

  const recordUnsupported = (names: string[]): void => {
    let changed = false;
    for (const name of names) {
      if (unsupported.has(name)) continue;
      unsupported.add(name);
      changed = true;
    }
    if (changed) emit();
  };

  const schedule = (): void => {
    if (paused) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, debounceMs);
  };

  const record = (event: EditorStoreAction): void => {
    // Always translate the *patches*, never the raw mutation: an operation may
    // generate ids (an insert does), and only the forward patch carries them.
    // Sending the raw mutation would leave the engine with different ids than
    // the undo patch refers to.
    if (event.type === "apply") {
      const op = event.mutation.op;
      if (!PAGE_OPS.has(op) && !SITE_OPS.has(op)) {
        recordUnsupported([op]);
        return;
      }
    }
    const patches =
      event.type === "undo" ? event.entry.undoPatch : event.entry.mutations;
    const translated = patchesToPending(patches as unknown as DocumentPatch[]);
    pending.push(...translated.pending);
    recordUnsupported(translated.unsupported);
    if (translated.pending.length === 0 && translated.unsupported.length === 0) return;
    if (status === "saved") status = "idle";
    emit();
    schedule();
  };

  const siteRequestFor = (op: PendingSite): SaveRequest => {
    const base = `/api/sites/${siteId}/style-rules`;
    switch (op.kind) {
      case "upsert":
        return knownRuleIds.has(op.rule.id)
          ? { method: "PATCH", path: `${base}/${op.rule.id}`, body: { ...rulePatch(op.rule), author } }
          : { method: "POST", path: base, body: { ...transportRule(op.rule), author } };
      case "delete":
        return { method: "DELETE", path: `${base}/${op.id}`, body: { author } };
      case "reorder":
        return { method: "POST", path: `${base}/${op.id}/reorder`, body: { index: op.index, author } };
      case "rename":
        return { method: "PATCH", path: `${base}/${op.id}`, body: { name: op.name, author } };
    }
  };

  async function flush(): Promise<void> {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (paused || running || pending.length === 0) return;
    running = true;
    const batch = pending;
    pending = [];
    setStatus("saving");

    let failed: Pending[] = [];
    const pageMutations = batch
      .filter((entry): entry is Extract<Pending, { kind: "page" }> => entry.kind === "page")
      .map((entry) => entry.mutation);
    const siteOps = batch.filter(
      (entry): entry is Extract<Pending, { kind: "site" }> => entry.kind === "site",
    );

    if (pageMutations.length > 0) {
      const response = await request({
        method: "POST",
        path: `/api/pages/${pageId}/editor-mutations`,
        body: { baseDraftVersion: version, author, mutations: pageMutations },
      });
      if (response.status === 409) {
        conflictVersion = readConflictVersion(response.body);
        paused = true;
        pending = batch;
        running = false;
        setStatus(
          "conflict",
          `Draft has changed (expected v${version}, current v${conflictVersion ?? "?"})`,
        );
        return;
      }
      if (response.status >= 400) {
        pending = batch;
        running = false;
        setStatus("error", messageOf(response.body, `Save failed (${response.status})`));
        return;
      }
      const next = readVersion(response.body);
      if (next !== undefined) version = next;
    }

    for (let index = 0; index < siteOps.length; index += 1) {
      const entry = siteOps[index];
      if (entry === undefined) continue;
      const response = await request(siteRequestFor(entry.op));
      if (response.status >= 400) {
        failed = siteOps.slice(index).map((unsent) => ({ ...unsent }));
        break;
      }
      if (entry.op.kind === "upsert") knownRuleIds.add(entry.op.rule.id);
    }

    pending = [...failed, ...pending];
    running = false;
    if (failed.length > 0) {
      setStatus("error", "A style rule could not be saved");
      return;
    }
    setStatus(pending.length > 0 ? "idle" : "saved");
  }

  const retry = async (nextVersion?: number): Promise<void> => {
    const target = nextVersion ?? conflictVersion;
    if (target !== undefined) version = target;
    if (conflictVersion === undefined && nextVersion === undefined && status === "conflict") {
      setStatus("conflict", "Reload the page to get the current draft version, then retry.");
      return;
    }
    paused = false;
    conflictVersion = undefined;
    await flush();
  };

  const acceptVersion = (next: number): void => {
    version = next;
    conflictVersion = undefined;
    paused = false;
    emit();
  };

  const dispose = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    listeners.clear();
  };

  store.setActionListener(record);
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry,
    flush,
    acceptVersion,
    markRuleKnown(id) {
      knownRuleIds.add(id);
    },
    dispose,
  };
}
