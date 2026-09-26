import { Type, type Static } from "@sinclair/typebox";
import { AuthorSchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

// A layout template carries no label of its own: the read side uses the page
// title, so a stored label could only drift from it.
const LayoutTemplateSchema = Type.Object(
  {
    kind: Type.Literal("layout"),
  },
  CLOSED,
);

const CollectionTemplateSchema = Type.Object(
  {
    kind: Type.Literal("collection"),
    collectionIds: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
    }),
    priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000 })),
  },
  CLOSED,
);

export const PutPageTemplateBodySchema = Type.Object(
  {
    // null removes the mark; the page then only keeps its layout choice.
    template: Type.Optional(
      Type.Union([LayoutTemplateSchema, CollectionTemplateSchema, Type.Null()]),
    ),
    layoutId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type PutPageTemplateBody = Static<typeof PutPageTemplateBodySchema>;
