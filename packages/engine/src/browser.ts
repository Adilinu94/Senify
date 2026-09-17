// Browser-safe subset of the engine (Phase 0, fourth slice).
//
// The editor document store (`packages/editor/src/state`) runs in the browser
// bundle, so it must not reach the engine's package root — that pulls
// `node:http`, `pg` and `sharp` along. This module re-exports exactly what the
// store needs and nothing that touches a filesystem, a socket or the database:
// the editor mutation vocabulary and its shape check. The section patch shape
// (`PatchOp`, `Mutation`) is type-only and erased at build time.
export {
  EDITOR_MUTATION_SCHEMA_BY_OP,
  EditorMutationSchema,
  EditorNodeSpecSchema,
  DeviceSchema,
  ClassNameSchema,
  isEditorMutationOp,
  parseEditorMutation,
  parseEditorMutationBatch,
  type EditorMutation,
  type EditorNodeSpec,
} from "./mutations/editor-contract.ts";

export {
  EDITOR_MUTATION_OPS,
  MUTATION_OPS,
  type EditorMutationOp,
  type Mutation,
  type MutationOp,
  type PatchOp,
} from "./mutations/contract.ts";
