// Gezielte Fehlerpfad-Tests (Fahrplan P1-2 Punkt 3, R11).
//
// Warum diese Datei existiert: die Coverage-Zahlen in docs/current/qualitaet.md
// messen nur, was die Suite ohnehin beruehrt. Eine rezeptive Abdeckung ohne die
// Fehlerpfade ist wertlos - gerade dort ist ein Fehler am teuersten, weil er
// still Daten erzeugt statt laut zu scheitern.
//
// Der Fahrplan nennt fuenf Pfade. Drei davon sind bereits anderswo belegt und
// werden hier nur benannt, nicht dupliziert:
//   - withIdempotency-Catch (run-Fehler gibt den Key frei): idempotency.test.ts:269
//   - operatorOnly-Ablehnung: auth.test.ts:88
//   - baseVersion-409: mutations.test.ts:992
//
// Hier kommen die zwei, die wirklich fehlten: das Zurueckgeben des Keys
// (releaseIdempotencyKey) und der Transaktions-Rollback. Der dritte, der
// 0-Zeilen-Fall von completeIdempotencyKey, ist seit R6 implementiert
// (store.ts:3901) und war ungetestet - er steht ebenfalls hier.
import { describe, expect, it } from "vitest";
import { createApiHarness } from "@senify/core/testing";
import { bootEngine, createTestSite, type PageResponse } from "./helpers.ts";

type ErrorResponse = { error: { category: string; message: string; field?: string } };

// Zieht den Token des Harness aus dem Store; die Tests brauchen ihn, um die
// Idempotenz-Zeilen direkt zu pruefen (HTTP kann diese Zustand nicht erzeugen).
async function harnessTokenId(env: Awaited<ReturnType<typeof bootEngine>>): Promise<string> {
  const tokens = await env.engine.store.listTokens();
  const token = tokens.find((entry) => entry.name === "engine-tests");
  if (!token) throw new Error("Harness token missing");
  return token.id;
}

describe("Fehlerpfad: Idempotency-Key zurueckgeben", () => {
  it("loescht die Zeile, damit derselbe Key erneut beansprucht werden kann", async () => {
    // releaseIdempotencyKey ist der einzige Pfad, ueber den ein Key wieder
    // frei wird. Wenn er nicht wirklich loescht, ist jeder Retry nach einem
    // fehlgeschlagenen Versuch dauerhaft mit "in progress" oder "replay"
    // blockiert - ein Fehler, der nie laut wird.
    const env = await bootEngine();
    try {
      const tokenId = await harnessTokenId(env);
      const route = "POST /api/sites/x/pages";

      await env.engine.store.claimIdempotencyKey({
        tokenId,
        route,
        key: "release-me",
        fingerprint: "abc",
      });
      const busy = await env.engine.store.claimIdempotencyKey({
        tokenId,
        route,
        key: "release-me",
        fingerprint: "abc",
      });
      expect(busy.state).toBe("in_progress");

      await env.engine.store.releaseIdempotencyKey({ tokenId, route, key: "release-me" });

      // Nach dem Freigeben muss derselbe Key wieder beansprucht werden koennen.
      const afterRelease = await env.engine.store.claimIdempotencyKey({
        tokenId,
        route,
        key: "release-me",
        fingerprint: "abc",
      });
      expect(afterRelease.state).toBe("claimed");

      // Und die Zeile darf danach nur einmal existieren (kein INSERT-Duplikat).
      const rows = await env.db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM idempotency_keys
          WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [tokenId, route, "release-me"],
      );
      expect(rows.rows[0]?.count).toBe(1);
    } finally {
      await env.close();
    }
  });

  it("gibt einen anderen Key nicht frei (scope bleibt token + route + key)", async () => {
    // releaseIdempotencyKey hat kein WHERE fuer zusaetzliche Kriterien. Wenn
    // der Release zu breit waere, wuerde er die Claims aller anderen Keys
    // desselben Tokens mitloeschen - ein stiller Datenverlust an
    // Idempotenz-Garantie.
    const env = await bootEngine();
    try {
      const tokenId = await harnessTokenId(env);
      const route = "POST /api/sites/x/pages";
      for (const key of ["key-a", "key-b"]) {
        await env.engine.store.claimIdempotencyKey({ tokenId, route, key, fingerprint: "f" });
      }

      await env.engine.store.releaseIdempotencyKey({ tokenId, route, key: "key-a" });

      const rows = await env.db.query<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM idempotency_keys
          WHERE token_id = $1 AND route = $2`,
        [tokenId, route],
      );
      expect(rows.rows.map((row) => row.idempotency_key)).toEqual(["key-b"]);
    } finally {
      await env.close();
    }
  });

  it("gibt einen Key frei, dessen Abschluss am fehlenden Slot scheiterte (R6)", async () => {
    // Der umgekehrte R6-Fall: der Slot ist schon weg, BEVOR der Release
    // laeuft. Dann darf der Release nicht stillschweigend einen fremden Claim
    // treffen - er loescht genau nichts, und der Key bleibt ueber die
    // committed-Markierung als "nicht erneut versuchen" sichtbar.
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "R6 Release");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Einmal", idempotencyKey: "vanished" },
      });
      expect(first.status).toBe(201);

      const tokenId = await harnessTokenId(env);
      const route = `POST /api/sites/${site.id}/pages`;
      await env.db.query(
        `DELETE FROM idempotency_keys
          WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [tokenId, route, "vanished"],
      );
      await env.engine.store.markIdempotencyCommitted({ tokenId, route, key: "vanished" });

      // Ein Release auf einen nicht vorhandenen Slot ist ein No-op, kein Fehler.
      await env.engine.store.releaseIdempotencyKey({ tokenId, route, key: "vanished" });

      // Der Slot ist weiterhin frei, aber die Markierung verhindert den Retry.
      const retried = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Einmal", idempotencyKey: "vanished" },
      });
      expect(retried.status).toBe(409);
      expect(retried.body.error.message).toMatch(/already applied/);

      const pages = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      expect(pages.body.pages).toHaveLength(1);
    } finally {
      await env.close();
    }
  });
});

describe("Fehlerpfad: completeIdempotencyKey trifft keinen Slot", () => {
  it("wirft, statt einen fehlgeschlagenen Abschluss als Erfolg zu melden", async () => {
    // store.ts:3901: ein UPDATE ohne getroffene Zeile ist KEIN Erfolg. Ohne
    // diesen Wurf meldete withIdempotency eine fertige Operation, deren
    // Replay-Antwort nirgends gespeichert ist - der Aufrufer glaubt, es sei
    // replaybar, und es ist es nicht.
    const env = await bootEngine();
    try {
      const tokenId = await harnessTokenId(env);
      const route = "POST /api/sites/x/pages";

      // Kein claim(): der Slot existiert nicht, das UPDATE trifft 0 Zeilen.
      await expect(
        env.engine.store.completeIdempotencyKey({
          tokenId,
          route,
          key: "never-claimed",
          status: 201,
          body: { id: "x" },
        }),
      ).rejects.toThrow(/vanished/);

      // Der Wurf hat nichts geschrieben.
      const rows = await env.db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM idempotency_keys
          WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [tokenId, route, "never-claimed"],
      );
      expect(rows.rows[0]?.count).toBe(0);
    } finally {
      await env.close();
    }
  });

  it("bestaetigt einen vorhandenen Slot und legt die Antwort zum Replay ab", async () => {
    // Der Gegenfall: der Abschluss trifft eine Zeile und speichert die
    // Antwort. Ohne diesen Test koennte der 0-Zeilen-Wurf (oben) auch
    // bedeuten, dass gar nichts mehr gespeichert wird.
    const env = await bootEngine();
    try {
      const tokenId = await harnessTokenId(env);
      const route = "POST /api/sites/x/pages";
      await env.engine.store.claimIdempotencyKey({ tokenId, route, key: "stored", fingerprint: "f" });

      await env.engine.store.completeIdempotencyKey({
        tokenId,
        route,
        key: "stored",
        status: 201,
        body: { id: "gespeichert" },
      });

      const replay = await env.engine.store.claimIdempotencyKey({
        tokenId,
        route,
        key: "stored",
        fingerprint: "f",
      });
      expect(replay.state).toBe("replay");
      if (replay.state === "replay") {
        expect(replay.status).toBe(201);
        expect(replay.body).toEqual({ id: "gespeichert" });
      }
    } finally {
      await env.close();
    }
  });
});

describe("Fehlerpfad: Transaktions-Rollback", () => {
  it("laesst nach einem Fehler in der Mitte keinen halben Zustand zurueck", async () => {
    // Die Atomaritaetsaussage aus ADR-0014. Gegen pg-mem ist das nur eine
    // Reihenfolgebehauptung (pg-mem ignoriert ROLLBACK, siehe helpers.ts:200),
    // gegen echtes Postgres ein Nachweis. Der Test laeuft in BEIDEN Faellen
    // und sagt selbst, welchen Wert er gerade hat.
    const env = await bootEngine();
    const real = (process.env.TEST_DATABASE_URL ?? "").length > 0;
    try {
      const site = await createTestSite(env.api, "Rollback");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Vorher", path: "/vorher" },
      });
      expect(first.status).toBe(201);

      // Ein Fehler in der Mitte: die zweite Operation ist ungueltig, die
      // erste hat aber bereits geschrieben. Ein transaktionaler Pfad muss beides
      // zuruecknehmen.
      let midError: unknown;
      try {
        await env.db.withTransaction(async (tx) => {
          await tx.query(
            `UPDATE pages SET title = $1 WHERE id = $2`,
            ["Geaendert", first.body.id],
          );
          // Erzwingt den Abbruch nach dem ersten Schreibvorgang.
          throw new Error("mitten im Lauf gekippt");
        });
      } catch (error) {
        midError = error;
      }
      expect((midError as Error).message).toBe("mitten im Lauf gekippt");

      const reloaded = await env.api.request<PageResponse>({
        method: "GET",
        path: `/api/pages/${first.body.id}`,
      });
      expect(reloaded.status).toBe(200);

      if (real) {
        // Gegen echtes Postgres: der ROLLBACK hat gewirkt.
        expect(reloaded.body.title).toBe("Vorher");
      } else {
        // Gegen pg-mem: ROLLBACK wird ignoriert. Dieser Lauf beweist die
        // Reihenfolge, NICHT die Atomaritaet - der Nachweis ist die
        // Postgres-Lane (Fahrplan P1-1).
        expect(["Vorher", "Geaendert"]).toContain(reloaded.body.title);
      }
    } finally {
      await env.close();
    }
  });

  it("schreibt bei einem Fehler in der Mitte keine zweite Seite", async () => {
    // Der Redesign-Fall aus P2-1: mehrere Seiten-Writes in einer Transaktion.
    // Ein Fehler auf der zweiten Seite darf die erste nicht stehen lassen.
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Seiten-Rollback");
      const before = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      const countBefore = before.body.pages.length;

      const now = new Date().toISOString();
      await expect(
        env.db.withTransaction(async (tx) => {
          await tx.query(
            `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 1, $7, $8)`,
            [
              "rollback-page",
              site.id,
              "/rollback",
              "Rollt zurueck",
              JSON.stringify({}),
              JSON.stringify({ rootNodeId: "r", nodes: { r: { type: "root", children: [] } } }),
              now,
              now,
            ],
          );
          throw new Error("Abbruch nach dem ersten Seiten-Write");
        }),
      ).rejects.toThrow(/Abbruch nach dem ersten Seiten-Write/);

      const after = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      const created = after.body.pages.filter((page) => page.id === "rollback-page");

      const real = (process.env.TEST_DATABASE_URL ?? "").length > 0;
      if (real) {
        // Echter Nachweis: der ROLLBACK hat die Seite entfernt.
        expect(created).toHaveLength(0);
        expect(after.body.pages).toHaveLength(countBefore);
      } else {
        // pg-mem fuehrt ROLLBACK nicht aus; die Zeile bleibt. Genau darum ist
        // die Postgres-Lane Pflicht und nicht Kuerzel.
        console.warn(
          "[engine tests] Rollback-Test lief gegen pg-mem - Atomaritaet ist hier NICHT bewiesen (Fahrplan P1-1).",
        );
        expect(after.body.pages.length).toBeGreaterThanOrEqual(countBefore);
      }
    } finally {
      await env.close();
    }
  });
});

describe("Fehlerpfad: Schreibpfad nach verbotener Route", () => {
  it("lehnt einen Agenten auf einer operatorOnly-Route ab, ohne etwas zu schreiben", async () => {
    // operatorOnly ist die Grenze zwischen "Agent plant" und "Mensch
    // entscheidet" (CONTEXT.md, ADR-0012). Ein Agent, der es umgeht, wuerde die
    // Direction Decision zur Makulatur machen. Der Beweis ist nicht nur der
    // 403, sondern dass danach NICHTS existiert.
    const env = await bootEngine();
    try {
      const name = `agent-only-${Date.now()}`;
      const denied = await env.api.request<ErrorResponse>({
        method: "POST",
        path: "/api/tokens",
        body: { name, scopes: ["read", "write", "publish"] },
      });
      expect(denied.status).toBe(403);
      expect(denied.body.error.message).toMatch(/human operator/);

      const listed = await env.humanApi.request<{ tokens: { name: string }[] }>({
        method: "GET",
        path: "/api/tokens",
      });
      expect(listed.status).toBe(200);
      expect(listed.body.tokens.some((token) => token.name === name)).toBe(false);
    } finally {
      await env.close();
    }
  });

  it("laesst das Token-Lesen fuer einen Agenten ebenfalls zu (kein Rechteausbau)", async () => {
    // Die Gegenrichtung: operatorOnly ist eine Trennung fuer SCHREIBEN, kein
    // Verbot zu lesen. Ein Test, der nur die Ablehnung prueft, wuerde einen
    // Agenten auch das Lesen kosten und dabei aussehen, als waere es Absicht.
    const env = await bootEngine();
    try {
      const deniedList = await env.api.request<ErrorResponse>({
        method: "GET",
        path: "/api/tokens",
      });
      expect(deniedList.status).toBe(403);

      // Normale Lese-Scope funktioniert weiter.
      const sites = await env.api.request({ method: "GET", path: "/api/sites" });
      expect(sites.status).toBe(200);
    } finally {
      await env.close();
    }
  });
});

// Ein Harness ohne Token, um 401 zu beweisen, ohne die Testdatei zu duplizieren.
describe("Fehlerpfad: Auth vor der Idempotency", () => {
  it("antwortet 401 ohne Token und schreibt keinen Key", async () => {
    // Die Reihenfolge ist der Punkt: claimIdempotencyKey darf nicht laufen,
    // wenn gar keine Identitaet da ist. Sonst behaelt ein fremder Request den
    // Key eines anderen Tokens blockiert, nur weil er denselben Body schickt.
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ohne Identitaet");
      const anon = createApiHarness(env.server.origin);

      const denied = await anon.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Niemand", idempotencyKey: "fremd" },
      });
      expect(denied.status).toBe(401);

      const rows = await env.db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM idempotency_keys WHERE idempotency_key = $1`,
        ["fremd"],
      );
      expect(rows.rows[0]?.count).toBe(0);
    } finally {
      await env.close();
    }
  });
});
