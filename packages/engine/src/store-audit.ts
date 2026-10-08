import { newEntityId } from "./ids.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type { AuditEntry } from "./types.ts";
import type { Author } from "@senify/section-sdk";

// One entry in the append-only audit log that every write path feeds — page
// mutations, theme writes, style-rule writes, settings. `pageId: null` marks
// a site-wide change (a style rule is site-wide, so it logs here with null).
//
// It lives in its own module because two writers need it: the `Store` itself
// and the style-rule registry, which writes its rules through the same log.
// A second copy of the INSERT would drift the moment a column is added.
export type NewAuditEntry = {
  siteId: string;
  pageId: string | null;
  batchId: string;
  opIndex: number;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  undoPatch: AuditEntry["undoPatch"];
  draftVersionAfter: number;
};

// Builds one multi-row INSERT for the audit log. The statement text is
// constant apart from the value tuples, so a batch costs one round trip.
export function buildAuditInsert(entries: NewAuditEntry[]): {
  text: string;
  params: unknown[];
} {
  const values: string[] = [];
  const params: unknown[] = [];
  entries.forEach((entry, index) => {
    const base = index * 11;
    const refs = Array.from({ length: 11 }, (_, offset) => `$${base + offset + 1}`);
    values.push(`(${refs.join(", ")})`);
    params.push(
      newEntityId(),
      entry.siteId,
      entry.pageId,
      entry.batchId,
      entry.opIndex,
      entry.mutation,
      toJsonParam(entry.params),
      toJsonParam(entry.author),
      toJsonParam(entry.undoPatch),
      entry.draftVersionAfter,
      new Date().toISOString(),
    );
  });
  return {
    text: `INSERT INTO audit_entries
      (id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at)
      VALUES ${values.join(", ")}`,
    params,
  };
}
