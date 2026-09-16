import type { Mutation, PatchOp } from "@senify/engine";
import type { NodeId } from "@senify/section-sdk";
import { SenifyError } from "@senify/core";
import type { HistoryStack } from "./history.ts";

// Inline text editing (artifacts/24 §2): double click → contentEditable
// (plaintext only), every keystroke commits through `updateNodeProps` so the
// change shows in all breakpoints, Escape reverts the whole burst as one
// undo entry.

export const INLINE_COALESCE_KEY = "inline-text";

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function sanitizeInlineText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (match) => ENTITIES[match] ?? match)
    .replace(/\r\n?/g, "\n");
}

export type InlineSession = {
  nodeId: NodeId;
  key: string;
  original: string;
  value: string;
  entryId: string | null;
  active: boolean;
};

export type InlineRecord = {
  undoPatch: PatchOp[];
  batchId: string | null;
  versionBefore: number;
  versionAfter: number;
};

export class InlineEditing {
  readonly #history: HistoryStack;
  #session: InlineSession | null = null;

  constructor(history: HistoryStack) {
    this.#history = history;
  }

  get session(): InlineSession | null {
    return this.#session;
  }

  start(input: { nodeId: NodeId; key: string; value: string }): InlineSession {
    const session: InlineSession = {
      nodeId: input.nodeId,
      key: input.key,
      original: input.value,
      value: input.value,
      entryId: null,
      active: true,
    };
    this.#session = session;
    return session;
  }

  require(): InlineSession {
    if (!this.#session) {
      throw new SenifyError("validation", "No inline edit is running", {
        field: "session",
        suggestion: "Start the edit with a double click first.",
      });
    }
    return this.#session;
  }

  #mutationFor(session: InlineSession, value: string): Mutation {
    return {
      op: "updateNodeProps",
      id: session.nodeId,
      patch: { [session.key]: value },
    };
  }

  // One keystroke (or a whole paste) → one canonical mutation + the sanitized
  // plaintext value. Rich text never enters the inline path.
  type(text: string): { session: InlineSession; mutation: Mutation; value: string } {
    const session = this.require();
    const value = sanitizeInlineText(text);
    session.value = value;
    return { session, mutation: this.#mutationFor(session, value), value };
  }

  // Records the server result of the last keystroke. The burst coalesces into
  // exactly one history entry.
  record(record: InlineRecord): string {
    const session = this.require();
    const entry = this.#history.record({
      label: `Text bearbeiten · ${session.key}`,
      op: "inline-text",
      mutations: [this.#mutationFor(session, session.value)],
      undoPatch: record.undoPatch,
      batchId: record.batchId,
      versionBefore: record.versionBefore,
      versionAfter: record.versionAfter,
      coalesceKey: INLINE_COALESCE_KEY,
    });
    session.entryId = entry.id;
    return entry.id;
  }

  commit(): InlineSession {
    const session = this.require();
    session.active = false;
    this.#session = null;
    return session;
  }

  // Escape: back to the original text with a single mutation; the coalesced
  // entry is consumed, so Cmd+Z afterwards undoes the *previous* action.
  revert(): { session: InlineSession; mutation: Mutation | null; removedEntryId: string | null } {
    const session = this.require();
    const changed = session.value !== session.original;
    const mutation = changed ? this.#mutationFor(session, session.original) : null;
    const removedEntryId = session.entryId;
    if (removedEntryId) this.#history.remove(removedEntryId);
    session.value = session.original;
    session.active = false;
    session.entryId = null;
    this.#session = null;
    return { session, mutation, removedEntryId };
  }

  cancel(): void {
    this.#session = null;
  }
}
