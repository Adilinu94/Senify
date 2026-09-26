import { Type, type Static } from "@sinclair/typebox";
import type { NodeTree } from "@senify/section-sdk";

const CLOSED = { additionalProperties: false } as const;
const Author = Type.Object({ kind: Type.Union([Type.Literal("human"), Type.Literal("agent")]), id: Type.String(), label: Type.String() }, CLOSED);
const NodeTreeSchema = Type.Object({ rootNodeId: Type.String(), nodes: Type.Record(Type.String(), Type.Unknown()) }, CLOSED);

export const CreateLibraryComponentBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  kind: Type.Optional(Type.Union([Type.Literal("frame"), Type.Literal("section"), Type.Literal("component")])),
  definition: NodeTreeSchema,
  fingerprint: Type.String({ minLength: 1, maxLength: 128 }),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 60 }), { maxItems: 20 })),
  provenance: Type.Optional(Type.Object({ kind: Type.Union([Type.Literal("framer-import"), Type.Literal("hand")]), sourceUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])), pagePath: Type.Optional(Type.Union([Type.String(), Type.Null()])), irHash: Type.Optional(Type.Union([Type.String(), Type.Null()])) }, CLOSED)),
  license: Type.Optional(Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }), note: Type.Optional(Type.Union([Type.String(), Type.Null()])), status: Type.Optional(Type.Union([Type.Literal("verified"), Type.Literal("unknown")])) }, CLOSED)),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
  author: Author,
}, CLOSED);
export type CreateLibraryComponentBody = Static<typeof CreateLibraryComponentBodySchema> & { definition: NodeTree };

export const UpdateLibraryComponentBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 60 }), { maxItems: 20 })),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
  license: Type.Optional(Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }), note: Type.Optional(Type.Union([Type.String(), Type.Null()])), status: Type.Optional(Type.Union([Type.Literal("verified"), Type.Literal("unknown")])) }, CLOSED)),
  deprecated: Type.Optional(Type.Boolean()),
  author: Author,
}, CLOSED);
export type UpdateLibraryComponentBody = Static<typeof UpdateLibraryComponentBodySchema>;

export const InstallLibraryComponentBodySchema = Type.Object({
  componentId: Type.String({ minLength: 1 }),
  mode: Type.Optional(Type.Union([Type.Literal("linked"), Type.Literal("copied")])),
  pageId: Type.Optional(Type.String({ minLength: 1 })),
  parentNodeId: Type.Optional(Type.String({ minLength: 1 })),
  author: Author,
}, CLOSED);
export type InstallLibraryComponentBody = Static<typeof InstallLibraryComponentBodySchema>;
