import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import type { EngineEvents } from "./events.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import { newEntityId } from "./ids.ts";
import type { PageLocks } from "./locks.ts";
import {
  applyUndoBatch,
  type MutationWarning,
} from "./mutations/apply.ts";
import type { PatchOp } from "./mutations/contract.ts";
import { draftConflictError } from "./paths.ts";
import type { Store } from "./store.ts";
import type { AuditEntry } from "./types.ts";

// Agent undo (E17, slice 2): the server-side counterpart of the editor's
// Cmd+Z. The editor keeps its own HistoryStack and persists an undo as a
// fresh mutation batch; an agent has no local stack, so the engine keeps it:
// every batch sits in the append-only audit log with its inverse patches, and
// this module walks that log backwards.
//
// Rules (mirroring the editor):
// - Only the newest remaining batches can be undone. A batch older than an
//   already undone one would replay against a tree state that no longer
//   exists.
// - `baseDraftVersion` is the precondition: a stale undo is rejected with a
//   conflict instead of silently corrupting the draft.
// - Every undo is itself an audit entry (`undoBatch`). Server-side redo is
//   not offered: the undone batches keep their forward mutations in the audit
//   log, re-apply them to redo.

export type UndoBatchRequest = {
  baseDraftVersion: number;
  steps?: number;
  batchIds?: string[];
};

export type UndoneBatch = {
  batchId: string;
  mutations: string[];
  authors: string[];
};

export type UndoBatchOutcome = {
  newDraftVersion: number;
  undoBatchId: string;
  undone: UndoneBatch[];
  warnings: MutationWarning[];
};

export const UNDO_MUTATION = "undoBatch";
const AUDIT_SCAN_LIMIT = 500;
const MAX_STEPS = 50;

function validation(message: string, field: string, suggestion?: string): SenifyError {
  return new SenifyError("validation", message, {
    field,
    ...(suggestion === undefined ? {} : { suggestion }),
  });
}

export function parseUndoBatchBody(body: unknown): UndoBatchRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw validation("The undo request must be an object", "body");
  }
  const record = body as Record<string, unknown>;
  const baseDraftVersion = record.baseDraftVersion;
  if (
    typeof baseDraftVersion !== "number" ||
    !Number.isInteger(baseDraftVersion) ||
    baseDraftVersion < 0
  ) {
    throw validation(
      "baseDraftVersion must be a non-negative integer",
      "baseDraftVersion",
      "Send the draftVersion from get_page.",
    );
  }
  const request: UndoBatchRequest = { baseDraftVersion };
  if (record.steps !== undefined) {
    if (
      typeof record.steps !== "number" ||
      !Number.isInteger(record.steps) ||
      record.steps < 1 ||
      record.steps > MAX_STEPS
    ) {
      throw validation(
        `steps must be an integer between 1 and ${MAX_STEPS}`,
        "steps",
      );
    }
    request.steps = record.steps;
  }
  if (record.batchIds !== undefined) {
    if (
      !Array.isArray(record.batchIds) ||
      record.batchIds.some((id) => typeof id !== "string" || id.trim() === "")
    ) {
      throw validation(
        "batchIds must be an array of batch ids",
        "batchIds",
        "Read the batch ids from the page audit log.",
      );
    }
    request.batchIds = [...new Set(record.batchIds as string[])];
  }
  if (request.steps !== undefined && request.batchIds !== undefined) {
    throw validation(
      "Send either steps or batchIds, not both",
      "batchIds",
    );
  }
  return request;
}

type RemainingBatch = {
  batchId: string;
  entries: AuditEntry[];
};

// The audit log is newest first; reversing it yields the write order. Entries
// of one batch keep their op order. A later `undoBatch` entry consumes the
// batch it points at, so it can never be undone twice.
export function remainingBatches(
  entries: readonly AuditEntry[],
): RemainingBatch[] {
  const batches = new Map<string, RemainingBatch>();
  const order: string[] = [];
  const consumed = new Set<string>();
  for (const entry of [...entries].reverse()) {
    if (entry.mutation === UNDO_MUTATION) {
      const undoOf = entry.params.undoOf;
      if (typeof undoOf === "string") consumed.add(undoOf);
      if (Array.isArray(undoOf)) {
        for (const id of undoOf) {
          if (typeof id === "string") consumed.add(id);
        }
      }
      continue;
    }
    let batch = batches.get(entry.batchId);
    if (batch === undefined) {
      batch = { batchId: entry.batchId, entries: [] };
      batches.set(entry.batchId, batch);
      order.push(entry.batchId);
    }
    batch.entries.push(entry);
  }
  return order
    .filter((batchId) => !consumed.has(batchId))
    .map((batchId) => batches.get(batchId) as RemainingBatch);
}

function selectBatches(
  remaining: readonly RemainingBatch[],
  request: UndoBatchRequest,
): RemainingBatch[] {
  if (request.batchIds !== undefined) {
    const ids = request.batchIds;
    if (ids.length === 0) {
      throw validation("batchIds must not be empty", "batchIds");
    }
    const tail = remaining.slice(-ids.length).map((batch) => batch.batchId);
    const matches =
      ids.length === tail.length && ids.every((id) => tail.includes(id));
    if (!matches) {
      throw new SenifyError(
        "conflict",
        "Only the newest remaining batches can be undone",
        {
          field: "batchIds",
          suggestion:
            tail.length === 0
              ? "There is nothing left to undo on this page."
              : `The newest remaining batches are: ${tail.join(", ")}.`,
        },
      );
    }
    return remaining.slice(-ids.length);
  }
  const steps = request.steps ?? 1;
  if (remaining.length < steps) {
    throw validation(
      `Only ${remaining.length} batches remain undoable`,
      "steps",
      "Undo fewer steps or reload the page.",
    );
  }
  return remaining.slice(-steps);
}

function touchedNodeIds(patches: readonly PatchOp[]): string[] {
  const ids = new Set<string>();
  for (const patch of patches) {
    if (patch.patch === "setPageMeta") continue;
    if (patch.patch === "insertRaw") {
      for (const node of patch.nodes) ids.add(node.id);
      ids.add(patch.parent.nodeId);
      continue;
    }
    ids.add(patch.id);
  }
  return [...ids];
}

export async function undoBatches(
  context: { store: Store; locks: PageLocks; events: EngineEvents },
  pageId: string,
  request: UndoBatchRequest,
  author: Author,
): Promise<UndoBatchOutcome> {
  return context.locks.run(pageId, async () => {
    const page = await context.store.getPage(pageId);
    if (request.baseDraftVersion !== page.draftVersion) {
      throw draftConflictError(request.baseDraftVersion, page.draftVersion);
    }
    const remaining = remainingBatches(
      await context.store.listAudit(pageId, AUDIT_SCAN_LIMIT),
    );
    if (remaining.length === 0) {
      throw new SenifyError("conflict", "There is nothing to undo on this page", {
        field: "pageId",
        suggestion: "The audit log has no remaining batches; reload the page.",
      });
    }
    const selected = selectBatches(remaining, request);
    const undoPatches = selected.flatMap((batch) =>
      batch.entries.flatMap((entry) => entry.undoPatch),
    );
    const outcome = applyUndoBatch({
      tree: page.draft,
      title: page.title,
      path: page.path,
      batch: selected.flatMap((batch) =>
        batch.entries.map((entry) => ({ undoPatch: entry.undoPatch })),
      ),
    });
    // Guardrails are a forward-write gate; an undo restores a state that was
    // accepted when it was written. A profile change can still make the old
    // state violate the current caps — that surfaces as a warning, not a block.
    const site = await context.store.getSite(page.siteId);
    for (const violation of hardGuardrailsForTree(outcome.tree, site.profile)) {
      outcome.warnings.push({
        field: violation.field,
        message: violation.message,
        suggestion: violation.suggestion,
      });
    }
    const undoBatchId = newEntityId();
    const newVersion = await context.store.persistBatch({
      pageId,
      expectedVersion: page.draftVersion,
      draft: outcome.tree,
      title: outcome.title,
      path: outcome.path,
      entries: selected.map((batch, index) => ({
        siteId: page.siteId,
        pageId,
        batchId: undoBatchId,
        opIndex: index,
        mutation: UNDO_MUTATION,
        params: {
          undoOf: batch.batchId,
          mutations: batch.entries.map((entry) => entry.mutation),
        },
        author,
        undoPatch: [],
        draftVersionAfter: 0,
      })),
    });
    context.events.publish({
      kind: "draft.changed",
      siteId: page.siteId,
      pageId,
      nodeIds: touchedNodeIds(undoPatches),
      action: UNDO_MUTATION,
      actor: author,
    });
    return {
      newDraftVersion: newVersion,
      undoBatchId,
      undone: selected.map((batch) => ({
        batchId: batch.batchId,
        mutations: batch.entries.map((entry) => entry.mutation),
        authors: [...new Set(batch.entries.map((entry) => entry.author.label))],
      })),
      warnings: outcome.warnings,
    };
  });
}
