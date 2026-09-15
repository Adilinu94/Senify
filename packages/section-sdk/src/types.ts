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

export type MotionTrigger = "load" | "scroll" | "viewport" | "hover";

export type MotionTokens = {
  ease?: string;
  durationScale?: number;
  stagger?: number;
};

export type MotionSpec = {
  preset: string;
  intensity?: number;
  tokens?: MotionTokens;
  trigger?: MotionTrigger;
  delay?: number;
};

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
