import { EVIDENCE_LEVELS, type EvidenceLevel, type ReferenceEvidence } from "./types.ts";

// Evidence system of the pipeline (research/29 §3): every claim is tagged, and
// the tag is never upgraded — a claim may only get weaker when merged.

const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  inferred: 0,
  observed: 1,
  confirmed: 2,
};

export function evidenceRank(level: EvidenceLevel): number {
  return EVIDENCE_RANK[level];
}

export function capEvidenceLevel(
  level: EvidenceLevel,
  ceiling: EvidenceLevel,
): EvidenceLevel {
  return EVIDENCE_RANK[level] <= EVIDENCE_RANK[ceiling] ? level : ceiling;
}

export function weakestEvidenceLevel(levels: readonly EvidenceLevel[]): EvidenceLevel {
  let weakest: EvidenceLevel = "confirmed";
  for (const level of levels) {
    if (EVIDENCE_RANK[level] < EVIDENCE_RANK[weakest]) weakest = level;
  }
  return weakest;
}

// `subject = value` is the claim format: two claims about the same subject with
// different values are a contradiction and get marked on both sides.
export function tokenClaim(subject: string, value: string): string {
  return `${subject} = ${value}`;
}

function subjectOf(claim: string): string {
  const index = claim.lastIndexOf(" = ");
  return index === -1 ? claim : claim.slice(0, index);
}

function valueOf(claim: string): string {
  const index = claim.lastIndexOf(" = ");
  return index === -1 ? "" : claim.slice(index + 3);
}

export function evidenceClaim(
  claim: string,
  level: EvidenceLevel,
  source: string,
): ReferenceEvidence {
  return { claim, level, source };
}

// Marks contradictions: both the claim and its counterpart carry the other
// claim in `conflictWith`. Values are never invented to resolve a conflict.
export function markConflicts(
  evidence: readonly ReferenceEvidence[],
): ReferenceEvidence[] {
  const bySubject = new Map<string, ReferenceEvidence[]>();
  for (const entry of evidence) {
    const subject = subjectOf(entry.claim);
    const list = bySubject.get(subject) ?? [];
    list.push(entry);
    bySubject.set(subject, list);
  }
  return evidence.map((entry) => {
    const siblings = bySubject.get(subjectOf(entry.claim)) ?? [];
    const conflicting = siblings.find(
      (other) =>
        other.claim !== entry.claim && valueOf(other.claim) !== valueOf(entry.claim),
    );
    if (!conflicting) return entry;
    return { ...entry, conflictWith: conflicting.claim };
  });
}

// Merges claim lists, keeps the strongest level per claim, downgrades the
// weaker side of a conflict and never upgrades an existing level.
export function mergeEvidence(
  ...lists: readonly ReferenceEvidence[][]
): ReferenceEvidence[] {
  const byClaim = new Map<string, ReferenceEvidence>();
  for (const list of lists) {
    for (const entry of list) {
      const existing = byClaim.get(entry.claim);
      if (!existing) {
        byClaim.set(entry.claim, entry);
        continue;
      }
      const level =
        EVIDENCE_RANK[entry.level] >= EVIDENCE_RANK[existing.level]
          ? entry.level
          : existing.level;
      byClaim.set(entry.claim, { ...existing, level });
    }
  }
  return markConflicts([...byClaim.values()]);
}

export function isEvidenceLevel(value: unknown): value is EvidenceLevel {
  return (
    typeof value === "string" &&
    (EVIDENCE_LEVELS as readonly string[]).includes(value)
  );
}
