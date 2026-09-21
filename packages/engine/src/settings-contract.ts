import { Type, type Static } from "@sinclair/typebox";
import {
  IMAGE_FALLBACK_PROVIDERS,
  IMAGE_PROVIDERS,
  SITE_PROFILES,
  SMTP_TLS_MODES,
} from "./types.ts";

const CLOSED = { additionalProperties: false } as const;

const TlsSchema = Type.Union(SMTP_TLS_MODES.map((mode) => Type.Literal(mode)));

const ProfileSchema = Type.Union(
  SITE_PROFILES.map((profile) => Type.Literal(profile)),
);

const ImageProviderSchema = Type.Union(
  IMAGE_PROVIDERS.map((provider) => Type.Literal(provider)),
);

const ImageFallbackProviderSchema = Type.Union(
  IMAGE_FALLBACK_PROVIDERS.map((provider) => Type.Literal(provider)),
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

// Image generation (S1, ADR-0008): provider chain and the ComfyUI fallback
// configuration. No secrets; an empty cliPath keeps the operator default.
export const ImageSettingsBodySchema = Type.Object(
  {
    provider: Type.Optional(ImageProviderSchema),
    fallbackProvider: Type.Optional(ImageFallbackProviderSchema),
    cooldownMinutes: Type.Optional(Type.Integer({ minimum: 0, maximum: 1440 })),
    cliPath: Type.Optional(Type.String({ maxLength: 500 })),
    baseUrl: Type.Optional(Type.String({ maxLength: 500 })),
    diffusionModel: Type.Optional(Type.String({ maxLength: 200 })),
    textEncoder: Type.Optional(Type.String({ maxLength: 200 })),
    vae: Type.Optional(Type.String({ maxLength: 200 })),
    defaultSteps: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    maxPixels: Type.Optional(
      Type.Integer({ minimum: 32 * 32, maximum: 4096 * 4096 }),
    ),
    timeoutMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1440 })),
  },
  CLOSED,
);
export type ImageSettingsBody = Static<typeof ImageSettingsBodySchema>;

export const UpdateSettingsBodySchema = Type.Object(
  {
    email: Type.Optional(SmtpSettingsBodySchema),
    defaults: Type.Optional(EngineDefaultsBodySchema),
    backup: Type.Optional(BackupSettingsBodySchema),
    referenceDna: Type.Optional(ReferenceDnaBodySchema),
    referencePreferences: Type.Optional(ReferencePreferencesBodySchema),
    image: Type.Optional(ImageSettingsBodySchema),
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
