import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { hashToken } from "../src/auth.ts";
import { TokensRepository } from "../src/store-tokens.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the API tokens live in `TokensRepository`; `Store` only delegates.
//
// This cut has no seam worth recording - the table belongs to the module alone.
// What is worth pinning down is the behaviour the auth path relies on and that
// was previously only visible in the Store: a token needs a name and a scope,
// an unknown id is `not_found`, and revoking twice is not an error while
// revoking a typo is.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const repo = new TokensRepository(database.db);
  return { db: database.db, store, repo };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

describe("TokensRepository: anlegen und lesen", () => {
  it("legt ein Token an und gibt das Geheimnis genau einmal heraus", async () => {
    const { repo } = await fixture();
    const { token, secret } = await repo.createToken({
      name: "Claude Code",
      scopes: ["read", "write"],
      expiresAt: null,
    });

    expect(token.name).toBe("Claude Code");
    expect(token.scopes).toEqual(["read", "write"]);
    // Ohne Angabe ist ein von Hand angelegtes Token eine Integration.
    expect(token.kind).toBe("agent");
    expect(token.revokedAt).toBeNull();
    expect(token.lastUsedAt).toBeNull();
    // Das Geheimnis steht NICHT im Token-Objekt, sondern nur hier.
    expect(secret.length).toBeGreaterThan(20);
    expect(JSON.stringify(token)).not.toContain(secret);
    // Der Prefix ist der Anfang des Geheimnisses, damit man es wiedererkennt.
    expect(secret.startsWith(token.prefix)).toBe(true);

    // Und das Geheimnis laesst sich ueber den Hash wiederfinden (der Auth-Pfad).
    const gefunden = await repo.findTokenByHash(hashToken(secret));
    expect(gefunden?.id).toBe(token.id);
    expect(gefunden?.scopes).toEqual(["read", "write"]);
  });

  it("entdoppelt die Scopes und weist ein Token ohne Scope ab", async () => {
    const { repo } = await fixture();

    const { token } = await repo.createToken({
      name: "Doppelt",
      scopes: ["read", "read", "write"],
      expiresAt: null,
    });
    expect(token.scopes).toEqual(["read", "write"]);

    const ohne = await rejected(repo.createToken({ name: "Leer", scopes: [], expiresAt: null }));
    expect(ohne).toBeInstanceOf(SenifyError);
    expect((ohne as SenifyError).category).toBe("validation");
    expect((ohne as SenifyError).field).toBe("scopes");
  });

  it("weist einen leeren Namen ab und beschneidet ihn", async () => {
    const { repo } = await fixture();

    const leer = await rejected(repo.createToken({ name: "   ", scopes: ["read"], expiresAt: null }));
    expect((leer as SenifyError).category).toBe("validation");
    expect((leer as SenifyError).field).toBe("name");

    const { token } = await repo.createToken({ name: "  Mit Rand  ", scopes: ["read"], expiresAt: null });
    expect(token.name).toBe("Mit Rand");
  });

  it("meldet ein unbekanntes Token als not_found mit Feld tokenId", async () => {
    const { repo } = await fixture();
    const fehler = await rejected(repo.getToken("gibt-es-nicht"));
    expect(fehler).toBeInstanceOf(SenifyError);
    expect((fehler as SenifyError).category).toBe("not_found");
    expect((fehler as SenifyError).field).toBe("tokenId");
  });

  it("listet die neuesten zuerst", async () => {
    const { repo } = await fixture();
    const erst = await repo.createToken({ name: "Erstes", scopes: ["read"], expiresAt: null });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const zweit = await repo.createToken({ name: "Zweites", scopes: ["read"], expiresAt: null });

    const alle = await repo.listTokens();
    expect(alle).toHaveLength(2);
    expect(alle[0]?.id).toBe(zweit.token.id);
    expect(alle[1]?.id).toBe(erst.token.id);
  });

  it("findet ein unbekanntes Geheimnis als undefined, nicht als Fehler", async () => {
    const { repo } = await fixture();
    // Der Auth-Pfad antwortet 401; ein Wurf waere hier die falsche Form.
    expect(await repo.findTokenByHash("kein-hash")).toBeUndefined();
  });
});

describe("TokensRepository: widerrufen und heilen", () => {
  it("widerruft einmal und bleibt beim zweiten Mal still", async () => {
    const { repo } = await fixture();
    const { token } = await repo.createToken({ name: "Widerruf", scopes: ["read"], expiresAt: null });

    await repo.revokeToken(token.id);
    const nachher = await repo.getToken(token.id);
    expect(nachher.revokedAt).not.toBeNull();

    // Ein zweiter Widerruf ist kein Fehler und setzt keinen neuen Zeitpunkt.
    await repo.revokeToken(token.id);
    expect((await repo.getToken(token.id)).revokedAt).toBe(nachher.revokedAt);

    // Eine unbekannte Id dagegen schon - sonst waere ein Tippfehler unsichtbar.
    const fehler = await rejected(repo.revokeToken("gibt-es-nicht"));
    expect((fehler as SenifyError).category).toBe("not_found");
  });

  it("haelt die letzte Benutzung fest", async () => {
    const { repo } = await fixture();
    const { token } = await repo.createToken({ name: "Benutzung", scopes: ["read"], expiresAt: null });
    expect(token.lastUsedAt).toBeNull();

    await repo.touchToken(token.id);
    expect((await repo.getToken(token.id)).lastUsedAt).not.toBeNull();
  });

  it("heilt die Art eines alten Tokens und laesst eine passende in Ruhe", async () => {
    const { repo } = await fixture();
    const { token } = await repo.createToken({ name: "Alt", scopes: ["read"], expiresAt: null });
    expect(token.kind).toBe("agent");

    await repo.updateTokenKind(token.id, "human");
    expect((await repo.getToken(token.id)).kind).toBe("human");

    // Zweiter Aufruf mit derselben Art: kein Fehler, kein Effekt.
    await repo.updateTokenKind(token.id, "human");
    expect((await repo.getToken(token.id)).kind).toBe("human");

    // Unbekannte Id: not_found.
    const fehler = await rejected(repo.updateTokenKind("gibt-es-nicht", "agent"));
    expect((fehler as SenifyError).category).toBe("not_found");
  });

  it("meldet ein Token mit ungueltigen Scopes beim Lesen, statt es zu verschweigen", async () => {
    const { repo, db } = await fixture();
    const { token } = await repo.createToken({ name: "Kaputt", scopes: ["read"], expiresAt: null });
    // Ein Scope, den es nicht gibt - so, als haette eine alte Fassung ihn
    // geschrieben. Der Mapper muss laut werden, nicht stillschweigend lesen.
    await db.query(`UPDATE api_tokens SET scopes = $2 WHERE id = $1`, [token.id, '["admin"]']);

    const fehler = await rejected(repo.getToken(token.id));
    expect(String(fehler)).toContain("token scopes are invalid");
  });
});
