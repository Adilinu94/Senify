import { Type, type Static } from "@sinclair/typebox";

const CLOSED = { additionalProperties: false } as const;

// Transport contracts for the form setup routes (T11). Submitting a form is
// unauthenticated and validated against the frozen snapshot, so it has no
// schema here.

export const FormCollectionPlanBodySchema = Type.Object(
  { formId: Type.String({ minLength: 1 }) },
  CLOSED,
);
export type FormCollectionPlanBody = Static<typeof FormCollectionPlanBodySchema>;

export const FormCollectionCreateBodySchema = Type.Object(
  {
    formId: Type.String({ minLength: 1 }),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  CLOSED,
);
export type FormCollectionCreateBody = Static<
  typeof FormCollectionCreateBodySchema
>;

export const FormTickBodySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
  CLOSED,
);
export type FormTickBody = Static<typeof FormTickBodySchema>;
