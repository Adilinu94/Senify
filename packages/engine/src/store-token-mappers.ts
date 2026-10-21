// Zeilentypen und Mapper der API-Tokens (P3-2): nur vom Token-Modul gebraucht,
// aber getrennt wie bei den anderen Fachgebieten - die Zeilentypen gehoeren zum
// Speicherformat, die Operationen zum Verhalten.
import type { ApiToken, TokenScope } from "./types.ts";
import { toIso, toJson, toNullableIso } from "./store-row-utils.ts";

export type TokenRow = {
  id: string;
  name: string;
  kind: unknown;
  scopes: unknown;
  token_prefix: string;
  created_at: unknown;
  expires_at: unknown;
  last_used_at: unknown;
  revoked_at: unknown;
};

export type TokenRecordRow = TokenRow & { token_hash: string };

export function mapToken(row: TokenRow): ApiToken {
  const scopes = toJson<unknown>(row.scopes);
  if (
    !Array.isArray(scopes) ||
    scopes.some(
      (scope) => scope !== "read" && scope !== "write" && scope !== "publish",
    )
  ) {
    throw new Error(`Stored token scopes are invalid: ${String(row.scopes)}`);
  }
  if (row.kind !== "human" && row.kind !== "agent") {
    throw new Error(`Stored token kind is invalid: ${String(row.kind)}`);
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    scopes: scopes as TokenScope[],
    prefix: row.token_prefix,
    createdAt: toIso(row.created_at),
    expiresAt: toNullableIso(row.expires_at),
    lastUsedAt: toNullableIso(row.last_used_at),
    revokedAt: toNullableIso(row.revoked_at),
  };
}
