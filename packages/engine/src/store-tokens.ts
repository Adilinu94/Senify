// Die API-Tokens des Stores (ticket 18, ADR-0019): anlegen, lesen, widerrufen,
// ihre letzte Benutzung festhalten und die Art heilen. `Store` delegiert hier.
//
// Das Modul besitzt die Tabelle `api_tokens` vollstaendig - kein anderer
// Fachbereich schreibt hinein. Es hat keine Transaktion und keine Naht zum
// Store: alle acht Operationen rechnen nur mit `#db` und dem Token selbst.
// Deshalb bekommt es keine Konstruktor-Funktionen, sondern nur die Datenbank.
//
// Zwei Regeln, die hier stehen und nicht beim Aufrufer:
// - Ein Token braucht einen Namen und mindestens einen Scope. Die Pruefung
//   gehoert hierher, weil ein zweiter Aufrufer sonst eine zweite Kopie der
//   Regel schriebe.
// - Widerrufen ist idempotent, aber nicht stumm: eine unbekannte Id meldet
//   `not_found`, ein zweiter Widerruf derselben Id nicht. Ohne das waere ein
//   Tippfehler in der Id von einem bereits widerrufenen Token nicht zu
//   unterscheiden.
import { SenifyError } from "@senify/core";
import { generateToken } from "./auth.ts";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import {
  mapToken,
  type TokenRecordRow,
  type TokenRow,
} from "./store-token-mappers.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type { ApiToken, TokenKind, TokenRecord, TokenScope } from "./types.ts";

export type CreateTokenInput = {
  name: string;
  scopes: TokenScope[];
  expiresAt: string | null;
  kind?: TokenKind;
};

export class TokensRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async createToken(input: CreateTokenInput): Promise<{ token: ApiToken; secret: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new SenifyError("validation", "Token name is required", {
        field: "name",
        suggestion: "Give the client a name, e.g. \"Claude Code\".",
      });
    }
    const scopes = [...new Set(input.scopes)];
    if (scopes.length === 0) {
      throw new SenifyError("validation", "A token needs at least one scope", {
        field: "scopes",
        suggestion: 'Use one or more of "read", "write", "publish".',
      });
    }
    // Default "agent": a token created by hand is an integration, not the
    // program's own operator identity (ticket 18).
    const kind: TokenKind = input.kind ?? "agent";
    const generated = generateToken();
    const id = newEntityId();
    await this.#db.query(
      `INSERT INTO api_tokens
        (id, name, kind, scopes, token_hash, token_prefix, created_at, expires_at, last_used_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)`,
      [
        id,
        name,
        kind,
        toJsonParam(scopes),
        generated.hash,
        generated.prefix,
        new Date().toISOString(),
        input.expiresAt,
      ],
    );
    return { token: await this.getToken(id), secret: generated.secret };
  }

  async getToken(id: string): Promise<ApiToken> {
    const result = await this.#db.query<TokenRow>(
      `SELECT id, name, kind, scopes, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Token "${id}" does not exist`, {
        field: "tokenId",
        suggestion: "List tokens with `senify tokens list`.",
      });
    }
    return mapToken(row);
  }

  async listTokens(): Promise<ApiToken[]> {
    const result = await this.#db.query<TokenRow>(
      `SELECT id, name, kind, scopes, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens ORDER BY created_at DESC, id DESC`,
    );
    return result.rows.map(mapToken);
  }

  // The auth path: a presented secret is hashed and looked up here. Not finding
  // it is a normal outcome (`undefined`), not an error - the caller answers 401.
  async findTokenByHash(tokenHash: string): Promise<TokenRecord | undefined> {
    const result = await this.#db.query<TokenRecordRow>(
      `SELECT id, name, kind, scopes, token_hash, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { ...mapToken(row), tokenHash: row.token_hash };
  }

  async revokeToken(id: string): Promise<void> {
    const revoked = await this.#db.query<{ id: string }>(
      `UPDATE api_tokens SET revoked_at = $2
       WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [id, new Date().toISOString()],
    );
    if (revoked.rows.length > 0) return;
    // Unknown ids surface as not_found; revoking twice stays idempotent.
    await this.getToken(id);
  }

  async touchToken(id: string): Promise<void> {
    await this.#db.query(
      `UPDATE api_tokens SET last_used_at = $2 WHERE id = $1`,
      [id, new Date().toISOString()],
    );
  }

  // Self-healing for the program's own token (ticket 18): an installation from
  // before the `kind` column carries "agent" by default; the operator heals
  // its token to "human" on the next start instead of recreating it.
  async updateTokenKind(id: string, kind: TokenKind): Promise<void> {
    const updated = await this.#db.query<{ id: string }>(
      `UPDATE api_tokens SET kind = $2
       WHERE id = $1 AND kind <> $2 RETURNING id`,
      [id, kind],
    );
    if (updated.rows.length > 0) return;
    await this.getToken(id);
  }
}
