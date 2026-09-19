import type { MotionSpec } from "./schema.ts";

export const PAGE_ROOT_TYPE = "page";

export type NodeId = string;

export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | { [key: string]: PropValue };

export type Author = {
  kind: "human" | "agent";
  id: string;
  label: string;
};

export type Breakpoint = "desktop" | "tablet" | "mobile";

export type NodeOverride = {
  props?: Record<string, PropValue>;
  hidden?: boolean;
};

export type Node = {
  id: NodeId;
  type: string;
  variant?: string;
  props: Record<string, PropValue>;
  children?: NodeId[];
  slots?: Record<string, NodeId[]>;
  overrides?: { tablet?: NodeOverride; mobile?: NodeOverride };
  motion?: MotionSpec;
  locked?: boolean;
  hidden?: boolean;
  // Style class names assigned to this node (Phase 2, ADR-0005). The rules
  // themselves live in the site-wide registry (`sites.style_rules_json`); the
  // node only carries the assignment, exactly like the editor document.
  classes?: string[];
};

export type NodeTree = {
  rootNodeId: NodeId;
  nodes: Record<NodeId, Node>;
};

export type GoldenNode = {
  type: string;
  variant?: string;
  props: Record<string, PropValue>;
  children?: GoldenNode[];
};
