import type { Node, NodeTree } from "@senify/section-sdk";

// The outline keeps list tools token-efficient: sections carry IDs, type,
// variant and a short content summary; full props stay behind get_nodes.
const SUMMARY_KEYS = ["title", "headline", "text", "intro", "eyebrow", "label"];

export type PageSummaryInput = {
  id: string;
  path: string;
  title: string;
  draftVersion: number;
  draft: NodeTree;
};

export type OutlineSection = {
  id: string;
  type: string;
  variant?: string;
  hidden?: boolean;
  summary: string;
};

export type PageOutline = {
  pageId: string;
  path: string;
  title: string;
  draftVersion: number;
  sections: OutlineSection[];
};

function truncate(value: string, limit = 60): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function sectionSummary(node: Node): string {
  const parts: string[] = [];
  for (const key of SUMMARY_KEYS) {
    const value = node.props[key];
    if (typeof value === "string" && value.trim() !== "") {
      parts.push(`${key}: ${truncate(value)}`);
    }
  }
  for (const [key, value] of Object.entries(node.props)) {
    if (Array.isArray(value)) parts.push(`${key}: ${value.length} items`);
  }
  return parts.join(" · ");
}

export function pageOutline(page: PageSummaryInput): PageOutline {
  const root = page.draft.nodes[page.draft.rootNodeId];
  const sections: OutlineSection[] = (root?.children ?? []).map((id) => {
    const node = page.draft.nodes[id];
    if (!node) {
      return { id, type: "missing", summary: "node is not part of the tree" };
    }
    return {
      id: node.id,
      type: node.type,
      ...(node.variant === undefined ? {} : { variant: node.variant }),
      ...(node.hidden === true ? { hidden: true } : {}),
      summary: sectionSummary(node),
    };
  });
  return {
    pageId: page.id,
    path: page.path,
    title: page.title,
    draftVersion: page.draftVersion,
    sections,
  };
}

export function selectNodes(
  page: PageSummaryInput,
  ids: string[],
): { nodes: Node[]; missing: string[] } {
  const nodes: Node[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const node = page.draft.nodes[id];
    if (node) nodes.push(node);
    else missing.push(id);
  }
  return { nodes, missing };
}
