// Idempotency (plan.md S2.5): the second run over an unchanged source must be
// a no-op — same IR hash, same numbers. The engine-side write (S3.1) uses the
// hash as its idempotency key; this module is the pure comparison so CLI and
// MCP report it the same way.

import type { FramerIrDocument } from "./ir.ts";

export type RunSummary = {
  irHash: string;
  contentHash: string;
  nodes: number;
  rules: number;
  score: number;
  findingKinds: string[];
};

export function summaryOf(
  document: FramerIrDocument,
  summary: { irHash: string; nodes: number; rules: number; score: number },
): RunSummary {
  return {
    irHash: summary.irHash,
    contentHash: document.source.contentHash,
    nodes: summary.nodes,
    rules: summary.rules,
    score: summary.score,
    findingKinds: document.findings.map((finding) => finding.kind),
  };
}

export function compareSummaries(
  first: RunSummary,
  second: RunSummary,
): { identical: boolean; changes: string[] } {
  const changes: string[] = [];
  if (first.irHash !== second.irHash) changes.push("irHash unterscheidet sich");
  if (first.nodes !== second.nodes) changes.push(`Knoten ${first.nodes} → ${second.nodes}`);
  if (first.rules !== second.rules) changes.push(`Regeln ${first.rules} → ${second.rules}`);
  if (first.score !== second.score) changes.push(`Score ${first.score} → ${second.score}`);
  return { identical: changes.length === 0, changes };
}
