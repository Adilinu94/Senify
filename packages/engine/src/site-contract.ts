import { Type, type Static } from "@sinclair/typebox";
import { AuthorSchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

export const RenameSiteBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    author: AuthorSchema,
  },
  CLOSED,
);
export type RenameSiteBody = Static<typeof RenameSiteBodySchema>;

export const SiteEventBodySchema = Type.Object(
  {
    author: AuthorSchema,
  },
  CLOSED,
);
export type SiteEventBody = Static<typeof SiteEventBodySchema>;

export const DuplicateSiteBodySchema = Type.Object(
  {
    withContent: Type.Optional(Type.Boolean()),
    author: AuthorSchema,
  },
  CLOSED,
);
export type DuplicateSiteBody = Static<typeof DuplicateSiteBodySchema>;
