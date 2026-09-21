import { Type, type Static } from "@sinclair/typebox";
import { IMAGE_PROVIDERS } from "./types.ts";
import { IdempotencyKeySchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

const ImageProviderSchema = Type.Union(
  IMAGE_PROVIDERS.map((provider) => Type.Literal(provider)),
);

// POST /api/sites/:siteId/images/jobs (S2): a prompt or a referenceId with a
// stored recipe is required; the rest carries the asset metadata of the
// generated file. The provider override starts the chain at that provider.
export const CreateImageJobBodySchema = Type.Object(
  {
    prompt: Type.Optional(Type.String({ minLength: 1, maxLength: 8000 })),
    referenceId: Type.Optional(Type.String({ minLength: 1 })),
    provider: Type.Optional(ImageProviderSchema),
    width: Type.Optional(Type.Integer({ minimum: 32, maximum: 4096 })),
    height: Type.Optional(Type.Integer({ minimum: 32, maximum: 4096 })),
    steps: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    seed: Type.Optional(Type.Integer({ minimum: 0 })),
    filename: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    altText: Type.Optional(Type.String({ maxLength: 500 })),
    decorative: Type.Optional(Type.Boolean()),
    folderId: Type.Optional(Type.String({ minLength: 1 })),
    tags: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { maxItems: 30 }),
    ),
    idempotencyKey: Type.Optional(IdempotencyKeySchema),
  },
  CLOSED,
);
export type CreateImageJobBody = Static<typeof CreateImageJobBodySchema>;
