import { Type, type Static } from "@sinclair/typebox";
import { AuthorSchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

export const PublishReleaseBodySchema = Type.Object(
  {
    author: Type.Optional(AuthorSchema),
    note: Type.Optional(Type.String()),
    basisReleaseId: Type.Optional(Type.String({ minLength: 1 })),
  },
  CLOSED,
);
export type PublishReleaseBody = Static<typeof PublishReleaseBodySchema>;

export const RestoreRevisionBodySchema = Type.Object(
  {
    author: Type.Optional(AuthorSchema),
    revisionId: Type.String({ minLength: 1 }),
  },
  CLOSED,
);
export type RestoreRevisionBody = Static<typeof RestoreRevisionBodySchema>;

export const CreatePreviewBodySchema = Type.Object(
  {
    author: Type.Optional(AuthorSchema),
    ttlDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 90 })),
  },
  CLOSED,
);
export type CreatePreviewBody = Static<typeof CreatePreviewBodySchema>;

export const SubmitReviewBodySchema = Type.Object(
  {
    author: Type.Optional(AuthorSchema),
    note: Type.Optional(Type.String()),
    pageIds: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    ),
  },
  CLOSED,
);
export type SubmitReviewBody = Static<typeof SubmitReviewBodySchema>;

export const ReviewActionBodySchema = Type.Object(
  {
    author: Type.Optional(AuthorSchema),
    note: Type.Optional(Type.String()),
  },
  CLOSED,
);
export type ReviewActionBody = Static<typeof ReviewActionBodySchema>;
