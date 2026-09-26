import { Type, type Static } from "@sinclair/typebox";
import { MAX_PAYLOAD_BYTES } from "./guardrails.ts";

const CLOSED = { additionalProperties: false } as const;

// Herkunft ist Pflicht (ADR-0010 §3): `kind` says where the code came from, the
// remaining fields name it. Without a source there is no payload — "the file
// came from somewhere" is not a provenance, and the import report and the
// "open in original" link both need it.
export const CodePayloadProvenanceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("framer-import"),
      Type.Literal("upload"),
      Type.Literal("hand"),
    ]),
    sourceUrl: Type.Optional(Type.String({ maxLength: 2048 })),
    pagePath: Type.Optional(Type.String({ maxLength: 512 })),
    irHash: Type.Optional(Type.String({ maxLength: 128 })),
    capturedAt: Type.Optional(Type.String({ maxLength: 40 })),
  },
  CLOSED,
);
export type CodePayloadProvenanceBody = Static<typeof CodePayloadProvenanceSchema>;

// Die Lizenz ist Pflicht und darf `unknown` sein — aber sichtbar (ADR-0010 §4):
// ein Payload ohne geprüfte Lizenz wandert nicht in die globale Bibliothek und
// wird im Release-Manifest als "Lizenz ungeprüft" geführt.
export const CodePayloadLicenseSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 64 }),
    note: Type.Optional(Type.String({ maxLength: 512 })),
    assertedBy: Type.Optional(Type.String({ maxLength: 200 })),
  },
  CLOSED,
);
export type CodePayloadLicenseBody = Static<typeof CodePayloadLicenseSchema>;

// The bundle is one self-contained ES module (ADR-0010 §2). The schema already
// caps it at the per-payload budget, so an oversized upload never reaches the
// store; the byte check on the engine side measures the *encoded* size, which
// the character count cannot.
export const CreateCodePayloadBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    kind: Type.Union([Type.Literal("module"), Type.Literal("webgl-scene")]),
    bundle: Type.String({ minLength: 1, maxLength: MAX_PAYLOAD_BYTES }),
    provenance: CodePayloadProvenanceSchema,
    license: CodePayloadLicenseSchema,
  },
  CLOSED,
);
export type CreateCodePayloadBody = Static<typeof CreateCodePayloadBodySchema>;
