// Editor mutations v2 (rebuild Phase 0, third slice).
//
// The editor document store (`packages/editor/src/state`) writes through this
// vocabulary. It is additive to `contract.ts`: the twelve section ops stay
// untouched, and `EDITOR_MUTATION_OPS` (declared there) grows the op list. Each
// op has a TypeBox schema checked with the same `Value.Errors` machinery as the
// section contract, so a bad shape fails with the same `SenifyError` carrying a
// dotted field path (`mutations[3].device`).
//
// The schemas own the *transport* shape only; the semantic rules (child rules
// from the widget catalog, device inheritance, known class names) live in the
// editor operations and throw the same error form.

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { SenifyError } from "@senify/core";
import { MotionSpecSchema, type PropValue } from "@senify/section-sdk";
import { StyleRuleSchema } from "@senify/widget-engine";
import {
  AuthorSchema,
  EDITOR_MUTATION_OPS,
  ParentRefSchema,
  formatField,
  type EditorMutationOp,
} from "./contract.ts";
import { validateShape } from "./contract.ts";

const CLOSED = { additionalProperties: false } as const;

const NodeIdSchema = Type.String({ minLength: 1 });

const PropRecordSchema = Type.Record(
  Type.String(),
  Type.Unsafe<PropValue>(Type.Any()),
);

// A patch bag: a value sets, `null` removes the key.
const PropPatchSchema = Type.Record(
  Type.String(),
  Type.Union([Type.Unsafe<PropValue>(Type.Any()), Type.Null()]),
);

export const DeviceSchema = Type.Union([
  Type.Literal("desktop"),
  Type.Literal("tablet"),
  Type.Literal("mobile"),
]);

export const ClassNameSchema = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[A-Za-z][A-Za-z0-9_-]*$",
});

// A primitive spec: what a fresh node looks like before ids and defaults are
// resolved by the store.
export const EditorNodeSpecSchema = Type.Object(
  {
    primitive: Type.String({ minLength: 1 }),
    props: Type.Optional(PropRecordSchema),
    id: Type.Optional(Type.String({ pattern: "^[A-Za-z0-9_-]{6,32}$" })),
    classes: Type.Optional(Type.Array(ClassNameSchema)),
    hidden: Type.Optional(Type.Boolean()),
    // Ticket 11: the per-breakpoint hidden flags travel with a fresh node, so
    // duplicate and undo-restore keep them.
    hiddenDevices: Type.Optional(
      Type.Array(Type.Union([Type.Literal("tablet"), Type.Literal("mobile")])),
    ),
    locked: Type.Optional(Type.Boolean()),
    // A fresh node may already carry its motion spec (ticket 19): undo of a
    // delete restores whole subtrees, motion included.
    motion: Type.Optional(MotionSpecSchema),
  },
  CLOSED,
);
export type EditorNodeSpec = Static<typeof EditorNodeSpecSchema>;

const SetNodePropSchema = Type.Object(
  {
    op: Type.Literal("setNodeProp"),
    id: NodeIdSchema,
    key: Type.String({ minLength: 1 }),
    value: Type.Unsafe<PropValue>(Type.Any()),
    device: Type.Optional(DeviceSchema),
  },
  CLOSED,
);

const ClearNodePropSchema = Type.Object(
  {
    op: Type.Literal("clearNodeProp"),
    id: NodeIdSchema,
    key: Type.String({ minLength: 1 }),
    device: Type.Optional(DeviceSchema),
  },
  CLOSED,
);

const AssignClassSchema = Type.Object(
  {
    op: Type.Literal("assignClass"),
    id: NodeIdSchema,
    classId: ClassNameSchema,
  },
  CLOSED,
);

const RemoveClassSchema = Type.Object(
  {
    op: Type.Literal("removeClass"),
    id: NodeIdSchema,
    classId: ClassNameSchema,
  },
  CLOSED,
);

// Structural node fields the canvas patches directly (`setNodeFields` in the
// editor document): the whole class list, hidden and locked. It mirrors the
// section `updateNodeMeta` shape, so the bridge stays a field mapping.
const SetNodeMetaSchema = Type.Object(
  {
    op: Type.Literal("setNodeMeta"),
    id: NodeIdSchema,
    meta: Type.Object(
      {
        classes: Type.Optional(
          Type.Union([Type.Array(ClassNameSchema), Type.Null()]),
        ),
        hidden: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
        locked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      },
      CLOSED,
    ),
  },
  CLOSED,
);

// Ticket 11: the breakpoints on which a node is additionally hidden. The list
// is authoritative — the bridge writes both devices idempotently.
const SetNodeHiddenDevicesSchema = Type.Object(
  {
    op: Type.Literal("setNodeHiddenDevices"),
    id: NodeIdSchema,
    devices: Type.Array(Type.Union([Type.Literal("tablet"), Type.Literal("mobile")])),
  },
  CLOSED,
);

// The motion authoring ops (ticket 19). The spec is the v2 shape (preset,
// intensity, tokens, trigger, reduced-motion policy, enabled); the bridge hands
// it to the section `setMotion` / `clearMotion` ops unchanged.
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

const RenameStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("renameStyleRule"),
    id: Type.String({ minLength: 1 }),
    name: ClassNameSchema,
  },
  CLOSED,
);

// The canonical rule, shared with the site registry (`widget-engine`
// `StyleRuleSchema`). One model: what the canvas edits is what the site stores.
const UpsertStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("upsertStyleRule"),
    rule: StyleRuleSchema,
  },
  CLOSED,
);

// Addressed by the stable rule id, exactly like the site routes.
const DeleteStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("deleteStyleRule"),
    id: Type.String({ minLength: 1 }),
  },
  CLOSED,
);

// Reordering is a permutation of the registry; `index` is the target position.
const ReorderStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("reorderStyleRule"),
    id: Type.String({ minLength: 1 }),
    index: Type.Integer({ minimum: 0 }),
  },
  CLOSED,
);

const InsertNodeSchema = Type.Object(
  {
    op: Type.Literal("insertNode"),
    parent: ParentRefSchema,
    index: Type.Optional(Type.Integer({ minimum: 0 })),
    node: EditorNodeSpecSchema,
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
    index: Type.Optional(Type.Integer({ minimum: 0 })),
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

const SetSlotContentSchema = Type.Object(
  {
    op: Type.Literal("setSlotContent"),
    id: NodeIdSchema,
    slot: Type.String({ minLength: 1 }),
    nodes: Type.Array(EditorNodeSpecSchema),
  },
  CLOSED,
);

const CreateCollectionEntrySchema = Type.Object(
  {
    op: Type.Literal("createCollectionEntry"),
    id: NodeIdSchema,
    node: EditorNodeSpecSchema,
    index: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  CLOSED,
);

const UpdateCollectionEntrySchema = Type.Object(
  {
    op: Type.Literal("updateCollectionEntry"),
    id: NodeIdSchema,
    index: Type.Integer({ minimum: 0 }),
    patch: PropPatchSchema,
  },
  CLOSED,
);

export const EDITOR_MUTATION_SCHEMA_BY_OP = {
  setNodeProp: SetNodePropSchema,
  clearNodeProp: ClearNodePropSchema,
  setNodeMeta: SetNodeMetaSchema,
  setNodeHiddenDevices: SetNodeHiddenDevicesSchema,
  setMotion: SetMotionSchema,
  clearMotion: ClearMotionSchema,
  assignClass: AssignClassSchema,
  removeClass: RemoveClassSchema,
  renameStyleRule: RenameStyleRuleSchema,
  upsertStyleRule: UpsertStyleRuleSchema,
  deleteStyleRule: DeleteStyleRuleSchema,
  reorderStyleRule: ReorderStyleRuleSchema,
  insertNode: InsertNodeSchema,
  duplicateNode: DuplicateNodeSchema,
  moveNode: MoveNodeSchema,
  deleteNode: DeleteNodeSchema,
  setSlotContent: SetSlotContentSchema,
  createCollectionEntry: CreateCollectionEntrySchema,
  updateCollectionEntry: UpdateCollectionEntrySchema,
} satisfies Record<EditorMutationOp, TSchema>;

export const EditorMutationSchema = Type.Union([
  SetNodePropSchema,
  ClearNodePropSchema,
  SetNodeMetaSchema,
  SetNodeHiddenDevicesSchema,
  SetMotionSchema,
  ClearMotionSchema,
  AssignClassSchema,
  RemoveClassSchema,
  RenameStyleRuleSchema,
  UpsertStyleRuleSchema,
  DeleteStyleRuleSchema,
  ReorderStyleRuleSchema,
  InsertNodeSchema,
  DuplicateNodeSchema,
  MoveNodeSchema,
  DeleteNodeSchema,
  SetSlotContentSchema,
  CreateCollectionEntrySchema,
  UpdateCollectionEntrySchema,
]);

export type EditorMutation = Static<typeof EditorMutationSchema>;

export function isEditorMutationOp(op: string): op is EditorMutationOp {
  return (EDITOR_MUTATION_OPS as readonly string[]).includes(op);
}

// Shape check of one editor mutation. Unknown ops fail first, the schema second;
// both report the op index and the dotted field, exactly like
// `parseApplyMutationsBody` does for the section ops.
export function parseEditorMutation(
  input: unknown,
  opIndex = 0,
): EditorMutation {
  const shaped = input as { op?: unknown } | null;
  const op = shaped?.op;
  if (typeof op !== "string" || !isEditorMutationOp(op)) {
    throw new SenifyError(
      "validation",
      `Unknown editor mutation "${typeof op === "string" ? op : "?"}"`,
      {
        field: `mutations[${opIndex}].op`,
        suggestion: `Use one of: ${EDITOR_MUTATION_OPS.join(", ")}.`,
        opIndex,
      },
    );
  }
  const context = `editor mutation "${op}"`;
  try {
    validateShape(EDITOR_MUTATION_SCHEMA_BY_OP[op], input, context);
  } catch (error) {
    if (error instanceof SenifyError) {
      const field = formatField(
        error.field === undefined
          ? `mutations[${opIndex}]`
          : `mutations[${opIndex}].${error.field}`,
      );
      throw new SenifyError(
        error.category,
        `Invalid ${context} at "${field}": ${error.message}`,
        { field, suggestion: error.suggestion, opIndex },
      );
    }
    throw error;
  }
  return input as EditorMutation;
}

export function parseEditorMutationBatch(input: readonly unknown[]): EditorMutation[] {
  return input.map((entry, index) => parseEditorMutation(entry, index));
}

// The request body of the editor's persistence sub-path
// (`POST /api/pages/:pageId/editor-mutations`, rebuild Phase 0, fifth slice).
// This is additive to the section `mutations` envelope: the same
// `baseDraftVersion` / `author` / `dry_run` fields, but the array carries the v2
// editor ops. The engine translates them into the section vocabulary and writes
// through the one existing `applyMutations` + `persistBatch` path, so the canvas
// has no storage of its own.
const ApplyEditorMutationsShapeSchema = Type.Object(
  {
    baseDraftVersion: Type.Integer({ minimum: 1 }),
    author: Type.Optional(AuthorSchema),
    dry_run: Type.Optional(Type.Boolean()),
    mutations: Type.Array(EditorMutationSchema, { minItems: 1, maxItems: 500 }),
  },
  CLOSED,
);

export type ApplyEditorMutationsBody = Static<typeof ApplyEditorMutationsShapeSchema>;

export function parseApplyEditorMutationsBody(
  body: unknown,
): ApplyEditorMutationsBody {
  validateShape(ApplyEditorMutationsShapeSchema, body, "editor mutations request");
  const shaped = body as { mutations: unknown[] };
  const mutations = parseEditorMutationBatch(shaped.mutations);
  return { ...(body as ApplyEditorMutationsBody), mutations };
}
