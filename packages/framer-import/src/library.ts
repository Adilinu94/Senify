import { createHash } from "node:crypto";
import type { EditorDocument, EditorNode } from "@senify/editor/state";
import type { FramerIrDocument, IrFinding } from "./ir.ts";

export type ImportCandidate = {
  fingerprint: string;
  label: string;
  kind: "frame" | "component" | "section" | "unknown";
  occurrences: { nodeId: string; pagePath: string }[];
  reason: string;
  similarTo?: { fingerprint: string; label: string; similarity: number }[];
};

export type ImportResolution = {
  nodeKey: string;
  nodeId: string | null;
  kind: "rebuild" | "island" | "plate";
  reason: string;
  evidence: string;
  payloadId?: string;
};

type CandidateAccumulator = {
  fingerprint: string;
  label: string;
  kind: ImportCandidate["kind"];
  occurrences: ImportCandidate["occurrences"];
};

function primitiveKind(primitive: string): ImportCandidate["kind"] {
  if (primitive === "root") return "section";
  if (primitive === "frame") return "frame";
  if (primitive === "payload" || primitive === "embed") return "component";
  return "unknown";
}

function signature(
  node: EditorNode,
  allNodes: Record<string, EditorNode>,
  memo: Map<string, string>,
  active: Set<string> = new Set(),
): string {
  const cached = memo.get(node.id);
  if (cached !== undefined) return cached;
  if (active.has(node.id)) return "cycle";
  active.add(node.id);
  const props = Object.fromEntries(
    Object.entries(node.props ?? {})
      .filter(([key]) => !key.includes("asset") && key !== "src" && key !== "href")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
  const children = (node.children ?? [])
    .map((childId) => allNodes[childId])
    .filter((child): child is EditorNode => child !== undefined)
    .map((child) => signature(child, allNodes, memo, active));
  active.delete(node.id);
  const result = fingerprintOf({ primitive: node.primitive, props, children });
  memo.set(node.id, result);
  return result;
}

function labelFor(node: EditorNode): string {
  const text = node.props?.text;
  if (typeof text === "string" && text.trim() !== "") return text.trim().slice(0, 80);
  return node.primitive;
}

function visit(
  node: EditorNode,
  allNodes: Record<string, EditorNode>,
  memo: Map<string, string>,
  add: (fingerprint: string, node: EditorNode) => void,
): void {
  add(signature(node, allNodes, memo), node);
  for (const childId of node.children ?? []) {
    const child = allNodes[childId];
    if (child !== undefined) visit(child, allNodes, memo, add);
  }
}

export function candidatesOf(document: EditorDocument, pagePath: string): ImportCandidate[] {
  const groups = new Map<string, CandidateAccumulator>();
  const root = document.nodes[document.rootNodeId];
  if (root === undefined) return [];
  const memo = new Map<string, string>();
  const add = (fingerprint: string, node: EditorNode): void => {
    const current = groups.get(fingerprint);
    if (current === undefined) {
      groups.set(fingerprint, {
        fingerprint,
        label: labelFor(node),
        kind: primitiveKind(node.primitive),
        occurrences: [{ nodeId: node.id, pagePath }],
      });
      return;
    }
    if (!current.occurrences.some((occurrence) => occurrence.nodeId === node.id)) {
      current.occurrences.push({ nodeId: node.id, pagePath });
    }
  };
  visit(root, document.nodes, memo, (fingerprint, node) => add(fingerprint, node));
  return [...groups.values()]
    .filter((group) => group.occurrences.length >= 2)
    .map((group) => ({
      ...group,
      reason: `${group.occurrences.length} gleiche Strukturen; keine automatische Zusammenlegung.`,
    }));
}

function nodeIdForFinding(document: EditorDocument, finding: IrFinding): string | null {
  if (finding.nodeKey === null) return null;
  const direct = Object.values(document.nodes).find((node) => node.id === finding.nodeKey);
  if (direct !== undefined) return direct.id;
  return null;
}

export function resolutionsOf(
  document: EditorDocument,
  findings: readonly IrFinding[],
  source: FramerIrDocument,
): ImportResolution[] {
  const resolutions: ImportResolution[] = [];
  for (const finding of findings) {
    if (finding.kind !== "code-component" && finding.kind !== "shader" && finding.kind !== "unknown-node") {
      continue;
    }
    const kind: ImportResolution["kind"] = finding.kind === "unknown-node" ? "plate" : "plate";
    resolutions.push({
      nodeKey: finding.nodeKey ?? "unknown",
      nodeId: nodeIdForFinding(document, finding),
      kind,
      reason:
        finding.kind === "unknown-node"
          ? "Unbekannte Framer-Struktur als sichtbare Platte übernommen."
          : "Fremd-Code/Shader ohne gebündeltes Modul als Platte übernommen.",
      evidence: finding.evidence || source.source.url || "Framer-Import",
    });
  }
  return resolutions;
}

export function fingerprintOf(value: unknown): string {
  return `struct1:${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}
