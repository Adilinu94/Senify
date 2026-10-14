// Redesign proposals of the Store (ADR 0019, ADR-0012): the offered directions of a source page, the one human decision (claim) and the apply result. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import {
  isRedesignProposalStatus,
  type DirectionCard,
  type DirectionDecision,
  type RedesignProposal,
  type RedesignProposalApplyResult,
  type RedesignProposalBasis,
  type RedesignProposalStatus,
} from "./redesign-proposal-contract.ts";
import { toIso, toJson, toJsonParam } from "./store-row-utils.ts";

type RedesignProposalRow = {
  id: string;
  source_page_id: string;
  status: string;
  cards: unknown;
  basis: unknown;
  decision: unknown;
  apply_result: unknown;
  created_at: unknown;
  expires_at: unknown;
};

const REDESIGN_PROPOSAL_COLUMNS =
  "id, source_page_id, status, cards, basis, decision, apply_result, created_at, expires_at";

// How long a direction stays decidable (Fahrplan P2-3, R2). A proposal is
// offered against a pinned draft and theme version, so a decision taken weeks
// later would apply a plan to a source that has moved on. Seven days is long
// enough for a human to come back to it and short enough that the inbox does
// not fill with proposals nobody will ever read.
const DEFAULT_PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function mapRedesignProposal(row: RedesignProposalRow): RedesignProposal {
  if (!isRedesignProposalStatus(row.status)) {
    throw new Error(`Stored redesign proposal status is invalid: ${row.status}`);
  }
  const basis = toJson<RedesignProposalBasis>(row.basis);
  return {
    id: row.id,
    sourcePageId: row.source_page_id,
    status: row.status,
    source: basis.source,
    cards: toJson<DirectionCard[]>(row.cards),
    decision: row.decision === null || row.decision === undefined
      ? null
      : toJson<DirectionDecision>(row.decision),
    applyResult:
      row.apply_result === null || row.apply_result === undefined
        ? null
        : toJson<RedesignProposalApplyResult>(row.apply_result),
    createdAt: toIso(row.created_at),
    expiresAt: row.expires_at === null || row.expires_at === undefined
      ? null
      : toIso(row.expires_at),
  };
}

export type CreateRedesignProposalInput = {
  // The caller owns the id: the card images are written into the proposal's
  // own folder before the row exists, so both must share one identity.
  id: string;
  sourcePageId: string;
  cards: DirectionCard[];
  basis: RedesignProposalBasis;
  // How long the human has to decide. The proposal is offered against a
  // pinned draft and theme version, so a decision made long after the fact
  // would apply to a source that has moved on; the sweep below moves the row
  // to `expired` instead of letting it linger and half-write (P2-3, R2).
  ttlMs?: number;
};

export type ListRedesignProposalsOptions = { status?: RedesignProposalStatus };

export type ClaimRedesignProposalInput = {
  proposalId: string;
  directionId: string;
  decision: DirectionDecision;
};

export type ClaimRedesignProposalResult =
  | { state: "claimed"; proposal: RedesignProposal }
  | { state: "already_decided"; proposal: RedesignProposal }
  | { state: "expired"; proposal: RedesignProposal };

export type FinalizeRedesignProposalInput = {
  proposalId: string;
  status: "applied" | "failed";
  applyResult: RedesignProposalApplyResult;
};

export type RecordMediaNeedResolutionsInput = {
  proposalId: string;
  openMediaNeeds: RedesignProposalApplyResult["openMediaNeeds"];
};

export class RedesignProposalsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  // -------------------------------------------------- redesign proposals (ADR-0012)
  // Cards and basis are written once and never change; only status, decision
  // and apply_result move. The claim below is the whole "exactly one human
  // decision" guarantee: the row is locked, and a proposal that is not
  // `proposed` can no longer be claimed.
  async createRedesignProposal(input: CreateRedesignProposalInput): Promise<RedesignProposal> {
    const { id } = input;
    const createdAt = new Date();
    const ttl = input.ttlMs ?? DEFAULT_PROPOSAL_TTL_MS;
    const expiresAt = new Date(createdAt.getTime() + ttl).toISOString();
    const result = await this.#db.query<RedesignProposalRow>(
      `INSERT INTO redesign_proposals
        (id, source_page_id, status, cards, basis, decision, apply_result, created_at, expires_at)
       VALUES ($1, $2, 'proposed', $3, $4, NULL, NULL, $5, $6)
       RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
      [
        id,
        input.sourcePageId,
        toJsonParam(input.cards),
        toJsonParam(input.basis),
        createdAt.toISOString(),
        expiresAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Redesign proposal insert returned no row");
    return mapRedesignProposal(row);
  }

  async getRedesignProposal(id: string): Promise<RedesignProposal> {
    // The sweep runs here too, so a single-proposal read cannot show a
    // direction as still open when its deadline has passed. Reading the inbox
    // and reading one proposal must not disagree about whether it is alive.
    await this.expireStaleRedesignProposals();
    const result = await this.#db.query<RedesignProposalRow>(
      `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Redesign proposal "${id}" does not exist`, {
        field: "proposalId",
        suggestion: "Die Id kommt aus create_redesign_proposal.",
      });
    }
    return mapRedesignProposal(row);
  }

  // The inbox of a source page: the open proposals first, then the finished
  // ones for the history. `status: null` asks for everything.
  //
  // The sweep runs first: an undecided proposal past its deadline is `expired`
  // before anyone reads the list, so the inbox never offers a direction that
  // can no longer be taken. A row created before the column existed has
  // `expires_at` NULL and is deliberately left alone - ageing out rows we never
  // gave a deadline would be a guess.
  async listRedesignProposals(
    sourcePageId: string,
    options: ListRedesignProposalsOptions = {},
  ): Promise<RedesignProposal[]> {
    await this.expireStaleRedesignProposals();
    const openFirst =
      "ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'applying' THEN 1 ELSE 2 END, created_at DESC, id DESC";
    const result =
      options.status === undefined
        ? await this.#db.query<RedesignProposalRow>(
            `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals
             WHERE source_page_id = $1 ${openFirst}`,
            [sourcePageId],
          )
        : await this.#db.query<RedesignProposalRow>(
            `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals
             WHERE source_page_id = $1 AND status = $2 ${openFirst}`,
            [sourcePageId, options.status],
          );
    return result.rows.map(mapRedesignProposal);
  }

  // Ages out the proposals nobody decided (Fahrplan P2-3, R2).
  //
  // Only `proposed` rows are touched. An `applying` row is a run in flight and
  // an `applied`/`failed` row is history; moving either would destroy the fact
  // that the human decided, or would race a transaction that is about to write
  // its effects. The rows are marked `expired`, never deleted: "the human never
  // chose this" is worth keeping, and a confirm against an expired proposal
  // must fail loudly (see the claim below) instead of half-writing.
  //
  // Returns the ids it moved, so a caller can log or audit the sweep.
  async expireStaleRedesignProposals(
    now: string = new Date().toISOString(),
  ): Promise<string[]> {
    const result = await this.#db.query<{ id: string }>(
      `UPDATE redesign_proposals
          SET status = 'expired'
        WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at <= $1
        RETURNING id`,
      [now],
    );
    return result.rows.map((row) => row.id);
  }

  // The human decision, stored before the first effect. Returns "claimed"
  // only for the caller that moved the row; a second confirm of the same
  // proposal loses and must not run the apply again.
  async claimRedesignProposal(
    input: ClaimRedesignProposalInput,
  ): Promise<ClaimRedesignProposalResult> {
    return this.#db.withTransaction(async (tx) => {
      const locked = await tx.query<RedesignProposalRow>(
        `SELECT ${REDESIGN_PROPOSAL_COLUMNS} FROM redesign_proposals WHERE id = $1 FOR UPDATE`,
        [input.proposalId],
      );
      const row = locked.rows[0];
      if (!row) {
        throw new SenifyError("not_found", `Redesign proposal "${input.proposalId}" does not exist`, {
          field: "proposalId",
        });
      }
      const current = mapRedesignProposal(row);
      if (current.status === "expired") {
        // Aged out (P2-3, R2). A distinct state, not `already_decided`: the
        // caller must answer "this direction can no longer be taken, create a
        // new proposal" rather than replaying a decision that never happened.
        return { state: "expired" as const, proposal: current };
      }
      if (current.status !== "proposed") {
        return { state: "already_decided" as const, proposal: current };
      }
      const result = await tx.query<RedesignProposalRow>(
        `UPDATE redesign_proposals
         SET status = 'applying', decision = $2
         WHERE id = $1
         RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
        [input.proposalId, toJsonParam(input.decision)],
      );
      const updated = result.rows[0];
      if (!updated) throw new Error("Redesign proposal claim returned no row");
      return { state: "claimed" as const, proposal: mapRedesignProposal(updated) };
    });
  }

  async finalizeRedesignProposal(input: FinalizeRedesignProposalInput): Promise<RedesignProposal> {
    const result = await this.#db.query<RedesignProposalRow>(
      `UPDATE redesign_proposals
       SET status = $2, apply_result = $3
       WHERE id = $1 AND status = 'applying'
       RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
      [input.proposalId, input.status, toJsonParam(input.applyResult)],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError(
        "conflict",
        `Redesign proposal "${input.proposalId}" is not in the applying state`,
        {
          field: "proposalId",
          suggestion:
            "Der Lauf wurde bereits abgeschlossen oder abgebrochen; Status mit get_redesign_proposal prüfen.",
        },
      );
    }
    return mapRedesignProposal(row);
  }

  // Replaces the open media needs an apply left (Fahrplan P2-2). Only the
  // `apply_result` column moves, and only its `openMediaNeeds` list: the
  // proposal's status, decision, cards and the rest of the result are the
  // record of what happened and must not shift when someone later closes a
  // need. A closing is a follow-up act, not a rewrite of history.
  async recordMediaNeedResolutions(input: RecordMediaNeedResolutionsInput): Promise<RedesignProposal> {
    const result = await this.#db.query<{ apply_result: unknown }>(
      `SELECT apply_result FROM redesign_proposals WHERE id = $1`,
      [input.proposalId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Redesign proposal "${input.proposalId}" does not exist`, {
        field: "proposalId",
      });
    }
    const current =
      row.apply_result === null || row.apply_result === undefined
        ? null
        : toJson<RedesignProposalApplyResult>(row.apply_result);
    if (current === null) {
      throw new SenifyError("conflict", "Dieser Vorschlag hat kein Apply-Ergebnis.", {
        field: "proposalId",
      });
    }
    const next = { ...current, openMediaNeeds: input.openMediaNeeds };
    // `sectionPlanApplied` deliberately stays as the apply left it. Closing the
    // last need makes the run COMPLETE, not retroactive: a run that wrote no
    // rebuild does not get to claim it did just because someone supplied the
    // missing image afterwards. The client reads `openMediaNeeds` for "what is
    // left", `sectionPlanApplied` for "what the run did".
    const updated = await this.#db.query<RedesignProposalRow>(
      `UPDATE redesign_proposals SET apply_result = $2 WHERE id = $1
       RETURNING ${REDESIGN_PROPOSAL_COLUMNS}`,
      [input.proposalId, toJsonParam(next)],
    );
    const stored = updated.rows[0];
    if (!stored) throw new Error("Redesign proposal media-need update returned no row");
    return mapRedesignProposal(stored);
  }
}
