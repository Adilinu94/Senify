import { Type, type Static } from "@sinclair/typebox";
import { SITE_PROFILES, SMTP_TLS_MODES } from "./types.ts";

const CLOSED = { additionalProperties: false } as const;

const TlsSchema = Type.Union(SMTP_TLS_MODES.map((mode) => Type.Literal(mode)));

const ProfileSchema = Type.Union(
  SITE_PROFILES.map((profile) => Type.Literal(profile)),
);

// Email settings: `password` is optional. A string stores a new password, null
// clears it, leaving it out keeps the stored one (never returned).
export const SmtpSettingsBodySchema = Type.Object(
  {
    host: Type.Optional(Type.String()),
    port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
    tls: Type.Optional(TlsSchema),
    user: Type.Optional(Type.String()),
    password: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    from: Type.Optional(Type.String()),
  },
  CLOSED,
);
export type SmtpSettingsBody = Static<typeof SmtpSettingsBodySchema>;

export const EngineDefaultsBodySchema = Type.Object(
  {
    defaultProfile: Type.Optional(ProfileSchema),
    defaultLayout: Type.Optional(Type.String({ minLength: 1 })),
    autostart: Type.Optional(Type.Boolean()),
  },
  CLOSED,
);
export type EngineDefaultsBody = Static<typeof EngineDefaultsBodySchema>;

export const BackupSettingsBodySchema = Type.Object(
  {
    targetDir: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
  },
  CLOSED,
);
export type BackupSettingsBody = Static<typeof BackupSettingsBodySchema>;

// House DNA (T14): the principles under every collection, plus the No-gos.
export const ReferenceDnaBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ maxLength: 120 })),
    description: Type.Optional(Type.String({ maxLength: 2000 })),
    constants: Type.Optional(
      Type.Array(Type.String({ maxLength: 200 }), { maxItems: 50 }),
    ),
    never: Type.Optional(
      Type.Array(Type.String({ maxLength: 200 }), { maxItems: 50 }),
    ),
  },
  CLOSED,
);
export type ReferenceDnaBody = Static<typeof ReferenceDnaBodySchema>;

// Preferences of the briefs: House DNA on/off and the project notes.
export const ReferencePreferencesBodySchema = Type.Object(
  {
    includeDna: Type.Optional(Type.Boolean()),
    overrides: Type.Optional(Type.String({ maxLength: 4000 })),
  },
  CLOSED,
);
export type ReferencePreferencesBody = Static<
  typeof ReferencePreferencesBodySchema
>;

export const UpdateSettingsBodySchema = Type.Object(
  {
    email: Type.Optional(SmtpSettingsBodySchema),
    defaults: Type.Optional(EngineDefaultsBodySchema),
    backup: Type.Optional(BackupSettingsBodySchema),
    referenceDna: Type.Optional(ReferenceDnaBodySchema),
    referencePreferences: Type.Optional(ReferencePreferencesBodySchema),
  },
  CLOSED,
);
export type UpdateSettingsBody = Static<typeof UpdateSettingsBodySchema>;

export const TestMailBodySchema = Type.Object(
  {
    to: Type.String({ minLength: 3 }),
  },
  CLOSED,
);
export type TestMailBody = Static<typeof TestMailBodySchema>;
