import { Type, type Static } from "@sinclair/typebox";

// Design contract (E26, R9): the project's design DNA. The PUT accepts a
// manual contract (constants/never/vocabulary) or an empty body to clear it;
// the reference-derived contract is written by the engine itself.
export const UpdateDesignContractBodySchema = Type.Object(
  {
    constants: Type.Optional(Type.Array(Type.String(), { maxItems: 12 })),
    never: Type.Optional(Type.Array(Type.String(), { maxItems: 12 })),
    vocabulary: Type.Optional(Type.Array(Type.String(), { maxItems: 12 })),
  },
  { additionalProperties: false },
);
export type UpdateDesignContractBody = Static<typeof UpdateDesignContractBodySchema>;
