import { Value } from "@sinclair/typebox/value";
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { SenifyError } from "@senify/core";
import {
  MotionSpecSchema,
  type MotionSpec,
  type Node,
  type NodeId,
  type NodeOverride,
  type PropValue,
} from "@senify/section-sdk";

export const MUTATION_OPS = [
  "insertNode",
  "deleteNode",
  "duplicateNode",
  "moveNode",
  "wrapNode",
  "updateNodeProps",
  "updateNodeMeta",
  "setBreakpointOverride",
  "clearBreakpointOverride",
  "setMotion",
  "clearMotion",
  "updatePageMeta",
  "setSlotContent",
  "createCollectionEntry",
  "updateCollectionEntry",
] as const;

// The v2 editor operations (rebuild Phase 0, third slice). They extend the
// mutation vocabulary of this contract without touching the twelve section
// ops above: the editor document store (packages/editor/src/state) applies
// them to the widget-engine node tree, while the engine's own `apply` path
// keeps operating on the section `NodeTree`. Op names shared with the section
// set (insertNode, deleteNode, duplicateNode, moveNode) keep the same meaning;
// in the editor contract they address widget primitives (`primitive`).
export const EDITOR_MUTATION_OPS = [
  "setNodeProp",
  "clearNodeProp",
  "setNodeMeta",
  "setMotion",
  "clearMotion",
  "assignClass",
  "removeClass",
  "renameStyleRule",
  "upsertStyleRule",
  "deleteStyleRule",
  "reorderStyleRule",
  "insertNode",
  "duplicateNode",
  "moveNode",
  "deleteNode",
  "setSlotContent",
  "createCollectionEntry",
  "updateCollectionEntry",
] as const;

export type EditorMutationOp = (typeof EDITOR_MUTATION_OPS)[number];

export type MutationOp = (typeof MUTATION_OPS)[number] | EditorMutationOp;

export type PatchOp =
  | { patch: "insertRaw"; parent: ParentRef; index: number; nodes: Node[] }
  | { patch: "deleteRaw"; id: NodeId }
  | { patch: "moveRaw"; id: NodeId; target: ParentRef; index: number }
  | {
      patch: "setProps";
      id: NodeId;
      props: Record<string, PropValue | null>;
    }
  | {
      patch: "setNodeFields";
      id: NodeId;
      fields: {
        variant?: string | null;
        locked?: boolean | null;
        hidden?: boolean | null;
        classes?: string[] | null;
      };
    }
  | {
      patch: "setOverride";
      id: NodeId;
      breakpoint: OverrideBreakpoint;
      override: NodeOverride | null;
    }
  | { patch: "setMotion"; id: NodeId; spec: MotionSpec | null }
  | { patch: "setPageMeta"; title: string; path: string };

const PropRecordSchema = Type.Record(
  Type.String(),
  Type.Unsafe<PropValue>(Type.Any()),
);

const CLOSED = { additionalProperties: false } as const;

const NodeIdSchema = Type.String({ minLength: 1 });

// Style class names (Phase 2, ADR-0005): the assignment a node carries. The
// rule registry itself is site-wide and validated by the widget engine; here
// only the name shape is checked.
const ClassNameSchema = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
});

export const NodeSpecSchema = Type.Object(
  {
    type: Type.String({ minLength: 1 }),
    variant: Type.Optional(Type.String({ minLength: 1 })),
    props: Type.Optional(PropRecordSchema),
    id: Type.Optional(Type.String({ pattern: "^[A-Za-z0-9_-]{6,32}$" })),
    classes: Type.Optional(Type.Array(ClassNameSchema)),
    hidden: Type.Optional(Type.Boolean()),
    locked: Type.Optional(Type.Boolean()),
    // A fresh node may already carry its motion spec (ticket 19): the editor's
    // undo of a delete restores whole subtrees, motion included.
    motion: Type.Optional(MotionSpecSchema),
  },
  CLOSED,
);

export const ParentRefSchema = Type.Object(
  {
    nodeId: Type.String({ minLength: 1 }),
    slot: Type.Optional(Type.String({ minLength: 1 })),
  },
  CLOSED,
);

// Closed envelope for the API boundary. The value shapes inside (prop
// records) stay open by design — section-sdk owns the data shapes,
// this contract owns the transport shapes.
const ClosedNodeOverrideSchema = Type.Object(
  {
    props: Type.Optional(PropRecordSchema),
    hidden: Type.Optional(Type.Boolean()),
  },
  CLOSED,
);

export const BreakpointOverrideSchema = Type.Union([
  Type.Literal("tablet"),
  Type.Literal("mobile"),
]);

const InsertNodeSchema = Type.Object(
  {
    op: Type.Literal("insertNode"),
    parent: ParentRefSchema,
    index: Type.Optional(Type.Integer({ minimum: 0 })),
    node: NodeSpecSchema,
  },
  CLOSED,
);

const DeleteNodeSchema = Type.Object(
  {
    op: Type.Literal("deleteNode"),
    id: NodeIdSchema,
  },
  CLOSED,
);

const DuplicateNodeSchema = Type.Object(
  {
    op: Type.Literal("duplicateNode"),
    id: NodeIdSchema,
    target: Type.Optional(ParentRefSchema),
    index: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  CLOSED,
);

const MoveNodeSchema = Type.Object(
  {
    op: Type.Literal("moveNode"),
    id: NodeIdSchema,
    target: ParentRefSchema,
    // Index applies after removal from the old list (DOM insertBefore style
    // within the same list); out-of-range indexes are rejected, never clamped.
    index: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  CLOSED,
);

// Superset of artifacts/01 §5 `wrapNode(id, wrapperType)` by design:
// the wrapper carries variant + props so agents place finished nodes.
const WrapNodeSchema = Type.Object(
  {
    op: Type.Literal("wrapNode"),
    id: NodeIdSchema,
    wrapper: NodeSpecSchema,
  },
  CLOSED,
);

const UpdateNodePropsSchema = Type.Object(
  {
    op: Type.Literal("updateNodeProps"),
    id: NodeIdSchema,
    patch: PropRecordSchema,
  },
  CLOSED,
);

const UpdateNodeMetaSchema = Type.Object(
  {
    op: Type.Literal("updateNodeMeta"),
    id: NodeIdSchema,
    meta: Type.Object(
      {
        variant: Type.Optional(
          Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
        ),
        // `null` removes the field (undo-friendly), a value sets it.
        locked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
        hidden: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
        // Class assignment: `classes` replaces the whole list (`null` clears),
        // `addClasses` unions and `removeClasses` subtracts. The editor sends
        // whole lists (its patches carry them); a stateless caller can diff.
        classes: Type.Optional(
          Type.Union([Type.Array(ClassNameSchema), Type.Null()]),
        ),
        addClasses: Type.Optional(Type.Array(ClassNameSchema)),
        removeClasses: Type.Optional(Type.Array(ClassNameSchema)),
      },
      CLOSED,
    ),
  },
  CLOSED,
);

const SetBreakpointOverrideSchema = Type.Object(
  {
    op: Type.Literal("setBreakpointOverride"),
    id: NodeIdSchema,
    breakpoint: BreakpointOverrideSchema,
    override: ClosedNodeOverrideSchema,
  },
  CLOSED,
);

const ClearBreakpointOverrideSchema = Type.Object(
  {
    op: Type.Literal("clearBreakpointOverride"),
    id: NodeIdSchema,
    breakpoint: BreakpointOverrideSchema,
  },
  CLOSED,
);

const SetMotionSchema = Type.Object(
  {
    op: Type.Literal("setMotion"),
    id: NodeIdSchema,
    spec: MotionSpecSchema,
  },
  CLOSED,
);

const ClearMotionSchema = Type.Object(
  {
    op: Type.Literal("clearMotion"),
    id: NodeIdSchema,
  },
  CLOSED,
);

const UpdatePageMetaSchema = Type.Object(
  {
    op: Type.Literal("updatePageMeta"),
    title: Type.Optional(Type.String()),
    path: Type.Optional(Type.String()),
  },
  CLOSED,
);

// Slot and collection content (ticket 13 rest): the section form of the v2
// editor ops with the same names. The v2 side validates against the widget
// catalog; here the slot rules of the section registry apply.
const SetSlotContentSchema = Type.Object(
  {
    op: Type.Literal("setSlotContent"),
    id: NodeIdSchema,
    slot: Type.String({ minLength: 1 }),
    nodes: Type.Array(NodeSpecSchema),
  },
  CLOSED,
);

const CreateCollectionEntrySchema = Type.Object(
  {
    op: Type.Literal("createCollectionEntry"),
    id: NodeIdSchema,
    node: NodeSpecSchema,
    index: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  CLOSED,
);

const UpdateCollectionEntrySchema = Type.Object(
  {
    op: Type.Literal("updateCollectionEntry"),
    id: NodeIdSchema,
    index: Type.Integer({ minimum: 0 }),
    // A value sets, `null` removes the key (same contract as updateNodeProps).
    patch: PropRecordSchema,
  },
  CLOSED,
);

export const MUTATION_SCHEMA_BY_OP = {
  insertNode: InsertNodeSchema,
  deleteNode: DeleteNodeSchema,
  duplicateNode: DuplicateNodeSchema,
  moveNode: MoveNodeSchema,
  wrapNode: WrapNodeSchema,
  updateNodeProps: UpdateNodePropsSchema,
  updateNodeMeta: UpdateNodeMetaSchema,
  setBreakpointOverride: SetBreakpointOverrideSchema,
  clearBreakpointOverride: ClearBreakpointOverrideSchema,
  setMotion: SetMotionSchema,
  clearMotion: ClearMotionSchema,
  updatePageMeta: UpdatePageMetaSchema,
  setSlotContent: SetSlotContentSchema,
  createCollectionEntry: CreateCollectionEntrySchema,
  updateCollectionEntry: UpdateCollectionEntrySchema,
} satisfies Record<(typeof MUTATION_OPS)[number], TSchema>;

export const MutationSchema = Type.Union([
  InsertNodeSchema,
  DeleteNodeSchema,
  DuplicateNodeSchema,
  MoveNodeSchema,
  WrapNodeSchema,
  UpdateNodePropsSchema,
  UpdateNodeMetaSchema,
  SetBreakpointOverrideSchema,
  ClearBreakpointOverrideSchema,
  SetMotionSchema,
  ClearMotionSchema,
  UpdatePageMetaSchema,
  SetSlotContentSchema,
  CreateCollectionEntrySchema,
  UpdateCollectionEntrySchema,
]);

export type Mutation = Static<typeof MutationSchema>;
export type NodeSpec = Static<typeof NodeSpecSchema>;
export type ParentRef = Static<typeof ParentRefSchema>;
export type OverrideBreakpoint = "tablet" | "mobile";

// One author per batch by design (matches the apply_mutations contract):
// every audit entry of the batch carries this author.
export const AuthorSchema = Type.Object(
  {
    kind: Type.Union([Type.Literal("human"), Type.Literal("agent")]),
    id: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
  },
  CLOSED,
);
export type AuthorInput = Static<typeof AuthorSchema>;

export const ApplyMutationsBodySchema = Type.Object(
  {
    baseDraftVersion: Type.Integer({ minimum: 1 }),
    author: AuthorSchema,
    dry_run: Type.Optional(Type.Boolean()),
    mutations: Type.Array(MutationSchema, { minItems: 1, maxItems: 500 }),
  },
  CLOSED,
);
export type ApplyMutationsBody = Static<typeof ApplyMutationsBodySchema>;

export const CreateSiteBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    slug: Type.Optional(Type.String({ minLength: 1 })),
    profile: Type.Optional(
      Type.Union([
        Type.Literal("clean"),
        Type.Literal("standard"),
        Type.Literal("showcase"),
      ]),
    ),
  },
  CLOSED,
);
export type CreateSiteBody = Static<typeof CreateSiteBodySchema>;

export const CreatePageBodySchema = Type.Object(
  {
    title: Type.Optional(Type.String({ minLength: 1 })),
    path: Type.Optional(Type.String({ minLength: 1 })),
  },
  CLOSED,
);
export type CreatePageBody = Static<typeof CreatePageBodySchema>;

export const UpdateThemeBodySchema = Type.Object(
  {
    theme: Type.Unsafe<Record<string, unknown>>(Type.Any()),
    author: AuthorSchema,
  },
  CLOSED,
);
export type UpdateThemeBody = Static<typeof UpdateThemeBodySchema>;

export function formatField(path: string): string {
  const parts = path
    .replace(/^\//, "")
    .split("/")
    .filter((part) => part.length > 0);
  let out = "";
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      out += `[${part}]`;
    } else {
      out += out.length > 0 ? `.${part}` : part;
    }
  }
  return out || "body";
}

export function validateShape(
  schema: TSchema,
  body: unknown,
  context: string,
): void {  const errors = [...Value.Errors(schema, body)];
  if (errors.length > 0) {
    const first = errors[0];
    const field = first ? formatField(first.path) : context;
    throw new SenifyError(
      "validation",
      `Invalid ${context}: ${first?.message ?? "value does not match the schema"}`,
      {
        field,
        suggestion: "Check the value against the documented shape.",
      },
    );
  }
}

export function parseBody<T>(
  schema: TSchema,
  body: unknown,
  context: string,
): T {
  validateShape(schema, body, context);
  return body as T;
}

export function assertKnownMutation(
  mutation: { op: string },
  opIndex: number,
): (typeof MUTATION_OPS)[number] {
  const knownOps: readonly string[] = MUTATION_OPS;
  if (!knownOps.includes(mutation.op)) {
    throw new SenifyError(
      "validation",
      `Unknown mutation "${mutation.op}"`,
      {
        field: `mutations[${opIndex}].op`,
        suggestion: `Use one of: ${knownOps.join(", ")}.`,
      },
    );
  }
  return mutation.op as (typeof MUTATION_OPS)[number];
}

const ApplyMutationsShapeSchema = Type.Object(
  {
    baseDraftVersion: Type.Integer({ minimum: 1 }),
    author: AuthorSchema,
    dry_run: Type.Optional(Type.Boolean()),
    mutations: Type.Array(Type.Object({ op: Type.String() }), {
      minItems: 1,
      maxItems: 500,
    }),
  },
  CLOSED,
);

export function parseApplyMutationsBody(body: unknown): ApplyMutationsBody {
  validateShape(ApplyMutationsShapeSchema, body, "mutations request");
  const shaped = body as { mutations: { op: string }[] };
  shaped.mutations.forEach((entry, opIndex) => {
    const op = assertKnownMutation(entry, opIndex);
    try {
      validateShape(MUTATION_SCHEMA_BY_OP[op], entry, `mutation "${op}"`);
    } catch (error) {
      if (error instanceof SenifyError && error.field !== undefined) {
        throw new SenifyError(error.category, error.message, {
          field: `mutations[${opIndex}].${error.field}`,
          suggestion: error.suggestion,
        });
      }
      throw error;
    }
  });
  return body as ApplyMutationsBody;
}
