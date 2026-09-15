import { createHash, randomBytes } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { SenifyError, type SenifyErrorDetails } from "@senify/core";
import type { TokenScope } from "./types.ts";

// 401 = credentials missing/unknown/expired, 403 = known token without the
// required scope. Both carry the agent-readable suggestion.
export class AuthError extends SenifyError {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string, details: SenifyErrorDetails = {}) {
    super("auth", message, details);
    this.name = "AuthError";
    this.status = status;
  }
}

export const SCOPES: readonly TokenScope[] = ["read", "write", "publish"];

export const TokenScopeSchema = Type.Union([
  Type.Literal("read"),
  Type.Literal("write"),
  Type.Literal("publish"),
]);

const CLOSED = { additionalProperties: false } as const;

export const CreateTokenBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    scopes: Type.Optional(Type.Array(TokenScopeSchema, { minItems: 1 })),
    expires: Type.Optional(Type.String({ minLength: 1 })),
  },
  CLOSED,
);
export type CreateTokenBody = Static<typeof CreateTokenBodySchema>;

export const McpAuditBodySchema = Type.Object(
  {
    client: Type.Optional(Type.String({ minLength: 1 })),
    tool: Type.String({ minLength: 1 }),
    args: Type.Optional(
      Type.Record(Type.String(), Type.Unsafe<unknown>(Type.Any())),
    ),
    result: Type.Union([Type.Literal("ok"), Type.Literal("error")]),
    entity: Type.Optional(Type.String({ minLength: 1 })),
    durationMs: Type.Optional(Type.Number({ minimum: 0 })),
  },
  CLOSED,
);
export type McpAuditBody = Static<typeof McpAuditBodySchema>;

// Secrets are high-entropy random strings; a SHA-256 digest is enough and
// keeps verification cheap. The plain secret never touches the database.
export function generateToken(): {
  secret: string;
  hash: string;
  prefix: string;
} {
  const secret = `snfy_${randomBytes(24).toString("base64url")}`;
  return { secret, hash: hashToken(secret), prefix: secret.slice(0, 12) };
}

export function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function parseExpires(
  value: string | undefined,
  now: Date = new Date(),
): string | null {
  if (value === undefined) return null;
  const match = value.trim().match(/^(\d+)d$/);
  const days = match ? Number.parseInt(match[1] ?? "0", 10) : Number.NaN;
  if (!match || !Number.isInteger(days) || days <= 0) {
    throw new SenifyError("validation", `Invalid expiry "${value}"`, {
      field: "expires",
      suggestion: 'Use a day count like "90d".',
    });
  }
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// Secrets never reach the audit log: values of token-like keys are redacted.
export function redactArgs(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!args) return {};
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    redacted[key] = /token|secret|password|authorization/i.test(key)
      ? "[redacted]"
      : value;
  }
  return redacted;
}
