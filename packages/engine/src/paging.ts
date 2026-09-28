import { SenifyError } from "@senify/core";

// Paging (Fahrplan P3-3 Punkt 3, R8).
//
// The problem this solves is not "the lists are big". It is that a list route
// that returns everything is a list route an agent cannot finish: it cannot say
// "give me the next twenty" without knowing in advance how many there were, and
// on a site with 4000 assets it has to hold all 4000 in its context to read the
// last one.
//
// The rules, and why they are these rules:
//
//   - `limit` is optional and defaults to 50. A caller that asks for nothing
//     gets a bounded answer, not the whole table. 50 is a page a human can scan
//     and an agent can afford; the alternative (everything) is what made the
//     unbounded routes unusable.
//   - `limit` is capped at 200. Without a cap, `?limit=100000` is a way to ask
//     the server to build a very large response on purpose. The cap is a refusal
//     with a number in it, not a silent clamp - a silent clamp would make the
//     response disagree with the request without saying so.
//   - `offset` is validated, not clamped. A negative offset is a caller bug, and
//     a negative offset that silently became zero would return the first page
//     under the pretence of the tenth.
//
// Offset paging, not cursor paging: the lists here are all editable rows with a
// stable sort, an agent needs to be able to say "back to the second page", and
// cursor paging would answer neither. That is a deliberate trade, and it has a
// known cost - a row inserted during a walk can shift a page. For lists a human
// edits, a shift is recoverable; for an append-only log it would not be, and
// that is not one of these.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type Paging = {
  limit: number;
  offset: number;
};

export type Page<T> = {
  items: T[];
  page: Paging;
  /** How many rows the filter matched in total, ignoring the page. `-1` when
   *  the query does not count - see the note on `exactTotal` below. */
  total: number;
  /** Whether `total` is a real count or "at least this many". A route that
   *  cannot count says so instead of guessing, because a wrong total is worse
   *  than a missing one: a client that trusts it stops paging. */
  exactTotal: boolean;
  /** True when `items.length` reached `limit`, i.e. there may be more. Cheaper
   *  and more honest than asking for `limit + 1` and hiding the extra row. */
  hasMore: boolean;
};

export function parsePaging(params: URLSearchParams): Paging {
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");
  if (rawLimit === null && rawOffset === null) {
    return { limit: DEFAULT_PAGE_SIZE, offset: 0 };
  }
  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) {
      throw new SenifyError("validation", `limit must be a whole number, got "${rawLimit}"`, {
        field: "limit",
        suggestion: "Use a positive whole number, for example limit=50.",
      });
    }
    limit = Number(rawLimit);
    if (limit < 1) {
      throw new SenifyError("validation", "limit must be at least 1", {
        field: "limit",
        suggestion: "Use a positive whole number, for example limit=50.",
      });
    }
    if (limit > MAX_PAGE_SIZE) {
      // Refused, not clamped. A clamp would answer a different question than
      // the one that was asked, and the caller would not know.
      throw new SenifyError("validation", `limit must be at most ${MAX_PAGE_SIZE}`, {
        field: "limit",
        suggestion: `Ask for ${MAX_PAGE_SIZE} and follow \`offset\` for the rest.`,
      });
    }
  }
  let offset = 0;
  if (rawOffset !== null) {
    if (!/^\d+$/.test(rawOffset)) {
      throw new SenifyError("validation", `offset must be a whole number, got "${rawOffset}"`, {
        field: "offset",
        suggestion: "Use zero or a positive whole number.",
      });
    }
    offset = Number(rawOffset);
  }
  return { limit, offset };
}

/**
 * Cuts one page out of a list that is already in memory.
 *
 * Not every route can count cheaply - some filters run a subquery per row - and
 * for those `total` would cost more than the page. `exactTotal: false` with the
 * observed length is the honest answer there, and `hasMore` then means "the
 * page was full", which is the strongest thing that can be said without a count.
 */
export function paginate<T>(items: readonly T[], paging: Paging, total: number | null): Page<T> {
  const page = items.slice(paging.offset, paging.offset + paging.limit);
  const effectiveTotal = total ?? paging.offset + page.length;
  return {
    items: page,
    page: paging,
    total: effectiveTotal,
    exactTotal: total !== null,
    hasMore:
      total === null
        ? page.length === paging.limit
        : paging.offset + page.length < total,
  };
}
