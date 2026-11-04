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
  // Set while `status === "conflict"` (L17): the version the failed batch was
  // based on and the version the server reported. `null` when the `409` carried
  // no parseable version.
  conflict?: { expectedVersion: number; serverVersion: number | null; scope: "page" | "style" };
};

// The conflict dialog's data (L17): one pure model the shell renders — what
// happened, and what each choice does. Kept here so the wording and the
// numbers are testable without a DOM.
export type ConflictDialogModel = {
  title: string;
  hint: string;
  expectedVersion: number;
  serverVersion: number | null;
  pending: number;
  reloadLabel: string;
  retryLabel: string;
  retryAllowed: boolean;
  dismissLabel: string;
};

export function conflictDialogModel(
  state: SaveState,
): ConflictDialogModel | null {
  if (state.status !== "conflict" || state.conflict === undefined) return null;
  if (state.conflict.scope === "style") {
    return {
      title: "Klassen wurden inzwischen geändert",
      hint: `${state.message ?? "Die Klassen konnten nicht gespeichert werden."} Der aktuelle Stand der Klassen muss neu geladen werden. Dabei werden deine offenen Änderungen verworfen.`,
      expectedVersion: state.conflict.expectedVersion,
      serverVersion: null,
      pending: state.pending,
      reloadLabel: "Server laden (eigene Änderungen verwerfen)",
      retryLabel: "Erneut senden",
      retryAllowed: false,
      dismissLabel: "Später",
    };
  }
  const server =
    state.conflict.serverVersion === null
      ? "unbekannter Version"
      : `Version ${state.conflict.serverVersion}`;
  return {
    title: "Entwurf wurde inzwischen geändert",
    hint: `Der Server steht auf ${server}, deine Änderungen basieren auf Version ${state.conflict.expectedVersion}. „Server laden“ verwirft deine offenen Änderungen; „Eigene senden“ wendet sie auf den Server-Stand an.`,
    expectedVersion: state.conflict.expectedVersion,
    serverVersion: state.conflict.serverVersion,
    pending: state.pending,
    reloadLabel: "Server laden (eigene Änderungen verwerfen)",
    retryLabel: `Eigene Änderungen senden (${state.pending})`,
    retryAllowed: true,
    dismissLabel: "Später",
  };
}

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
  styleRegistryVersion?: number;
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
  acceptStyleRegistry(version: number, ruleIds: Iterable<string>): void;
  // The conflict choice "load the server": the local batch is dropped instead
  // of being resent later (the reload replaces the document anyway).
  discardPending(): void;
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
  | { kind: "reorder"; id: string; index: number; classIndex?: number }
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
    ...(node.variant === undefined ? {} : { variant: node.variant }),
    props: { ...node.props },
    ...(node.classes === undefined ? {} : { classes: [...node.classes] }),
    ...(node.hidden === undefined ? {} : { hidden: node.hidden }),
    ...(node.hiddenDevices === undefined ? {} : { hiddenDevices: [...node.hiddenDevices] }),
    ...(node.shownDevices === undefined ? {} : { shownDevices: [...node.shownDevices] }),
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
              ...(patch.fields.shownDevices === undefined ? {} : { shownDevices: [...(patch.fields.shownDevices ?? [])] }),
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
    // A scoped rule names its node, not a scope object: the create route
    // derives name and selector from it (`buildStyleRule`). Later upserts are
    // PATCHes and keep the scope server-side (the patch schema has no scope).
    ...(rule.kind === "scoped" && rule.scope !== undefined
      ? { nodeId: rule.scope.nodeId }
      : {}),
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
    replaceStyleValues: true,
    ...(rule.kind === "class" && rule.scope === undefined ? { name: rule.name } : {}),
    ...(rule.kind === "ambient" ? { selector: rule.selector } : {}),
    ...(rule.description === undefined ? {} : { description: rule.description }),
    styles: { ...rule.styles },
    stylePriorities: { ...rule.stylePriorities },
    states: { ...rule.states },
    statePriorities: { ...rule.statePriorities },
    contextStyles: { ...rule.contextStyles },
    contextStylePriorities: { ...rule.contextStylePriorities },
    ...(rule.rawCss === undefined ? {} : { rawCss: rule.rawCss }),
    ...(rule.authoredBy === undefined ? {} : { authoredBy: rule.authoredBy }),
  };
}

export function createSavePipeline(options: SavePipelineOptions): SavePipeline {
  const { store, pageId, siteId, author, request } = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  // Rules loaded with the document already exist on the server. Treating
  // their first edit as a create makes the class manager hit a duplicate ID.
  const knownRuleIds = new Set<string>(options.knownRuleIds ?? store.document.styleRules.map((rule) => rule.id));

  let pending: Pending[] = [];
  let version = 1;
  let styleRegistryVersion = options.styleRegistryVersion ?? 0;
  let hasStyleRegistryVersion = options.styleRegistryVersion !== undefined;
  let status: SaveStatus = "idle";
  let message: string | undefined;
  let conflictVersion: number | undefined;
  let conflictScope: "page" | "style" | undefined;
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
    ...(status === "conflict"
      ? {
          conflict: {
            expectedVersion: conflictScope === "style" ? styleRegistryVersion : version,
            serverVersion: conflictVersion ?? null,
            scope: conflictScope ?? "page",
          },
        }
      : {}),
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
    for (const item of translated.pending) {
      if (item.kind !== "site" || item.op.kind !== "reorder") continue;
      const classes = store.document.styleRules.filter((rule) => rule.kind === "class" && rule.scope === undefined);
      const id = item.op.id;
      const classIndex = classes.findIndex((rule) => rule.id === id);
      if (classIndex >= 0) item.op.classIndex = classIndex;
    }
    pending.push(...translated.pending);
    recordUnsupported(translated.unsupported);
    if (translated.pending.length === 0 && translated.unsupported.length === 0) return;
    if (status === "saved") status = "idle";
    emit();
    schedule();
  };

  const siteRequestFor = (op: PendingSite): SaveRequest => {
    const base = `/api/sites/${siteId}/style-rules`;
    const versionBody = { baseVersion: styleRegistryVersion, author };
    switch (op.kind) {
      case "upsert":
        return knownRuleIds.has(op.rule.id)
          ? { method: "PATCH", path: `${base}/${op.rule.id}`, body: { ...rulePatch(op.rule), ...versionBody } }
          : { method: "POST", path: base, body: { ...transportRule(op.rule), ...versionBody } };
      case "delete":
        return { method: "DELETE", path: `${base}/${op.id}`, body: versionBody };
      case "reorder":
        return { method: "POST", path: `${base}/${op.id}/reorder`, body: { ...(op.classIndex === undefined ? { index: op.index } : { classIndex: op.classIndex }), ...versionBody } };
      case "rename":
        return { method: "PATCH", path: `${base}/${op.id}`, body: { name: op.name, pageContext: { pageId, baseDraftVersion: version }, ...versionBody } };
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

    // Keep page and site operations in their original order. A new class must
    // exist before its assignment is saved; on failure only unsent operations
    // remain queued, since the two HTTP resources are not one transaction.
    let index = 0;
    while (index < batch.length) {
      const entry = batch[index];
      if (entry === undefined) break;
      let nextIndex = index + 1;
      let saveRequest: SaveRequest;
      if (entry.kind === "page") {
        const mutations = [entry.mutation];
        while (nextIndex < batch.length) {
          const next = batch[nextIndex];
          if (next?.kind !== "page") break;
          mutations.push(next.mutation);
          nextIndex += 1;
        }
        saveRequest = {
          method: "POST",
          path: `/api/pages/${pageId}/editor-mutations`,
          body: { baseDraftVersion: version, ...(hasStyleRegistryVersion ? { baseStyleRegistryVersion: styleRegistryVersion } : {}), author, mutations },
        };
      } else saveRequest = siteRequestFor(entry.op);

      let response: SaveResponse;
      try {
        response = await request(saveRequest);
      } catch (error) {
        pending = [...batch.slice(index), ...pending];
        running = false;
        setStatus("error", error instanceof Error ? error.message : "Speichern fehlgeschlagen");
        return;
      }
      if (response.status >= 400) {
        pending = [...batch.slice(index), ...pending];
        running = false;
        if (response.status === 409) {
          paused = true;
          const field = (response.body as { error?: { field?: unknown } } | undefined)?.error?.field;
          conflictScope = entry.kind === "page" && field !== "baseStyleRegistryVersion" ? "page" : "style";
          conflictVersion = conflictScope === "page" ? readConflictVersion(response.body) : undefined;
          setStatus("conflict", conflictScope === "page"
            ? `Draft has changed (expected v${version}, current v${conflictVersion ?? "?"})`
            : field === "name" ? messageOf(response.body, "Der Klassenname ist nicht verfügbar.") : "Die Style-Registry wurde zwischenzeitlich geändert");
        } else setStatus("error", messageOf(response.body, `Save failed (${response.status})`));
        return;
      }
      if (entry.kind === "page") {
        const nextVersion = readVersion(response.body);
        if (nextVersion !== undefined) version = nextVersion;
      } else {
        const responseBody = response.body as { version?: unknown; pageDraftVersion?: unknown } | undefined;
        styleRegistryVersion =
          typeof responseBody?.version === "number" ? responseBody.version : styleRegistryVersion + 1;
        if (entry.op.kind === "rename" && typeof responseBody?.pageDraftVersion === "number") version = responseBody.pageDraftVersion;
        if (entry.op.kind === "upsert") knownRuleIds.add(entry.op.rule.id);
        if (entry.op.kind === "delete") knownRuleIds.delete(entry.op.id);
      }
      index = nextIndex;
    }
    running = false;
    setStatus(pending.length > 0 ? "idle" : "saved");
    // An autosave timer can expire while another request is still in flight.
    if (pending.length > 0) schedule();
  }

  const retry = async (nextVersion?: number): Promise<void> => {
    if (conflictScope === "style") {
      setStatus("conflict", "Lade die Style-Registry neu, bevor du weiterarbeitest.");
      return;
    }
    const target = nextVersion ?? conflictVersion;
    if (target !== undefined) version = target;
    if (conflictVersion === undefined && nextVersion === undefined && status === "conflict") {
      setStatus("conflict", "Reload the page to get the current draft version, then retry.");
      return;
    }
    paused = false;
    conflictVersion = undefined;
    conflictScope = undefined;
    await flush();
  };

  const acceptVersion = (next: number): void => {
    version = next;
    conflictVersion = undefined;
    conflictScope = undefined;
    paused = false;
    emit();
  };

  const discardPending = (): void => {
    pending = [];
    conflictVersion = undefined;
    conflictScope = undefined;
    paused = false;
    if (status === "conflict") status = "idle";
    message = undefined;
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
    acceptStyleRegistry(next, ids) {
      styleRegistryVersion = next;
      hasStyleRegistryVersion = true;
      knownRuleIds.clear();
      for (const id of ids) knownRuleIds.add(id);
    },
    discardPending,
    markRuleKnown(id) {
      knownRuleIds.add(id);
    },
    dispose,
  };
}
