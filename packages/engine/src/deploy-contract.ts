import { Type, type Static } from "@sinclair/typebox";
import { AuthorSchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

export const CreateDeploymentBodySchema = Type.Object(
  {
    // The provider seam (E14): "static" copies the active release's build into
    // targetDir; "netlify" ships it through the Netlify API; "vercel" through
    // the Vercel deployments API (settings carry project id + encrypted token).
    provider: Type.Optional(
      Type.Union([
        Type.Literal("static"),
        Type.Literal("netlify"),
        Type.Literal("vercel"),
      ]),
    ),
    targetDir: Type.Optional(Type.String({ minLength: 1 })),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type CreateDeploymentBody = Static<typeof CreateDeploymentBodySchema>;

// Deploy settings per site (E14): the hosted provider target. A new token is
// encrypted engine-side; null clears it; omitting keeps it. The plaintext
// never persists and never returns.
export const UpdateDeploySettingsBodySchema = Type.Object(
  {
    provider: Type.Optional(
      Type.Union([
        Type.Literal("static"),
        Type.Literal("netlify"),
        Type.Literal("vercel"),
      ]),
    ),
    netlifySiteId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
    netlifyToken: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
    vercelProjectId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
    vercelToken: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  },
  CLOSED,
);
export type UpdateDeploySettingsBody = Static<typeof UpdateDeploySettingsBodySchema>;
