import type { AuthorInput, Mutation, MutationOp, NodeSpec, ParentRef, PatchOp } from "@senify/engine";
import type {
  Breakpoint,
  MotionSpec,
  NodeId,
  NodeTree,
  PropValue,
} from "@senify/section-sdk";

// The editor speaks the canonical mutation vocabulary of the engine
// (`apply_mutations`) — nothing else writes to a draft. These types are the
// shared spine between actions, undo/redo and the transport.

export type EditorMode = "design" | "live";

export type FrameBreakpoint = Breakpoint;

export type OverrideBreakpoint = "tablet" | "mobile";

export const OVERRIDE_BREAKPOINTS: readonly OverrideBreakpoint[] = [
  "tablet",
  "mobile",
];

export function isOverrideBreakpoint(value: Breakpoint): value is OverrideBreakpoint {
  return value !== "desktop";
}

export type EditorAction =
  | { kind: "insert"; parent: ParentRef; index?: number; node: NodeSpec }
  | { kind: "delete"; nodeId: NodeId }
  | { kind: "duplicate"; nodeId: NodeId; target?: ParentRef; index?: number }
  | { kind: "move"; nodeId: NodeId; target: ParentRef; index?: number }
  | { kind: "wrap"; nodeId: NodeId; wrapper: NodeSpec }
  | { kind: "prop"; nodeId: NodeId; key: string; value: PropValue; breakpoint: FrameBreakpoint }
  | {
      kind: "prop-patch";
      nodeId: NodeId;
      patch: Record<string, PropValue | null>;
      breakpoint: FrameBreakpoint;
    }
  | { kind: "override-reset"; nodeId: NodeId; key: string; breakpoint: OverrideBreakpoint }
  | { kind: "variant"; nodeId: NodeId; variant: string | null }
  | { kind: "lock"; nodeId: NodeId; locked: boolean }
  | { kind: "hide"; nodeId: NodeId; hidden: boolean; breakpoint?: FrameBreakpoint }
  | { kind: "motion"; nodeId: NodeId; spec: MotionSpec | null }
  | { kind: "inline-text"; nodeId: NodeId; key: string; value: string }
  | { kind: "page-meta"; title?: string; path?: string };

export type ApplyMutationsRequest = {
  baseDraftVersion: number;
  author: AuthorInput;
  dry_run?: boolean;
  mutations: Mutation[];
};

export type MutationResultPayload = {
  opIndex: number;
  op: MutationOp;
  undoPatch: PatchOp[];
};

export type MutationWarningPayload = {
  opIndex?: number;
  field?: string;
  message: string;
  suggestion?: string;
};

export type ApplyMutationsResponse = {
  newDraftVersion: number;
  undoBatchId: string | null;
  warnings: MutationWarningPayload[];
  results: MutationResultPayload[];
};

// The single seam to the program shell (T12): the editor never talks to a
// concrete HTTP client, it talks to this contract.
export type EditorTransport = {
  apply(request: ApplyMutationsRequest): Promise<ApplyMutationsResponse>;
};

export type EditorPage = {
  pageId: string;
  tree: NodeTree;
  draftVersion: number;
  title: string;
  path: string;
};
