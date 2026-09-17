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
import type { PropValue } from "@senify/section-sdk";
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
    locked: Type.Optional(Type.Boolean()),
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

const RenameClassSchema = Type.Object(
  {
    op: Type.Literal("renameClass"),
    from: ClassNameSchema,
    to: ClassNameSchema,
  },
  CLOSED,
);

const CreateStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("createStyleRule"),
    name: ClassNameSchema,
    props: PropRecordSchema,
  },
  CLOSED,
);

const UpdateStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("updateStyleRule"),
    name: ClassNameSchema,
    props: PropPatchSchema,
  },
  CLOSED,
);

const DeleteStyleRuleSchema = Type.Object(
  {
    op: Type.Literal("deleteStyleRule"),
    name: ClassNameSchema,
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
  assignClass: AssignClassSchema,
  removeClass: RemoveClassSchema,
  renameClass: RenameClassSchema,
  createStyleRule: CreateStyleRuleSchema,
  updateStyleRule: UpdateStyleRuleSchema,
  deleteStyleRule: DeleteStyleRuleSchema,
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
  AssignClassSchema,
  RemoveClassSchema,
  RenameClassSchema,
  CreateStyleRuleSchema,
  UpdateStyleRuleSchema,
  DeleteStyleRuleSchema,
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
    author: AuthorSchema,
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
