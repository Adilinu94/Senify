// Proposal-TTL und Aufräumen (Fahrplan P2-3, R2).
//
// Der Befund, den dieser Test schließt: `redesign_proposals` hatte kein
// `expires_at`. Ein `proposed`-Vorschlag, den niemand je bestätigt, lag
// unbegrenzt in der Inbox. Weil der Vorschlag gegen einen *gepinnten*
// Draft- und Theme-Stand abgeleitet ist, ist ein alter Vorschlag nicht nur
// Ungeballast, sondern eine Falle: eine Entscheidung darauf würde einen Plan
// auf eine Quellseite anwenden, die sich inzwischen bewegt hat.
//
// Die Regel, die hier festgeschrieben wird: ein Vorschlag **altert aus**,
// er wird nicht gelöscht. "Der Mensch hat nicht entschieden" ist eine
// Tatsache, die die Historie behalten muss - und ein Apply auf einem
// abgelaufenen Vorschlag muss mit `conflict` scheitern, nicht mit einem
// halben Write.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// Eine Referenz braucht ein Bild und ein Design-Dokument, sonst lehnt der
// Server die Anlage ab. Der Vorschlag wird server-seitig aus genau diesen
// Daten abgeleitet, deshalb ist das Setup hier dasselbe wie in der
// Proposal-Suite - geteilt wäre es eine weitere Wahrheit über dieselbe Sache.
function pngImage(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function designDocument(brand: string, font: string): string {
  return [
    "# Vorschlag",
    "",
    "## Colors",
    "| Token | Value |",
    "|---|---|",
    `| brand | ${brand} |`,
    "",
    "## Typography",
    `Font family: **${font}, Inter**`,
    "",
    "| Style | Size | Weight |",
    "|---|---|---|",
    "| Body | 15px | 400 |",
  ].join("\n");
}

type ProposalView = {
  id: string;
  status: string;
  cards: { id: string }[];
  applyResult: { siteId: string | null } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

let env: BootEnv;
let referenceId: string;
let siteId: string;
let pageId: string;

async function createReference(name: string, brand: string, font: string): Promise<string> {
  const stored = await env.api.request<{ reference: { id: string } }>({
    method: "POST",
    path: "/api/references/manual",
    body: {
      name,
      image: pngImage(1920, 1080),
      documents: { design: designDocument(brand, font), guidelines: null, components: null },
      author: TEST_AUTHOR,
    },
  });
  expect(stored.status, JSON.stringify(stored.body)).toBe(201);
  return stored.body.reference.id;
}

async function createProposal(key: string): Promise<ProposalView> {
  const response = await env.api.request<{ proposal: ProposalView }>({
    method: "POST",
    path: `/api/pages/${pageId}/redesign-proposals`,
    body: { referenceIds: [referenceId], idempotencyKey: key },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.proposal;
}

async function backdateDeadline(id: string): Promise<void> {
  await env.db.query(
    `UPDATE redesign_proposals SET expires_at = $2 WHERE id = $1`,
    [id, new Date(Date.now() - DAY_MS).toISOString()],
  );
}

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "TTL-Suite");
  siteId = site.id;
  const page = await createTestPage(env.api, siteId, { title: "Start", path: "/" });
  pageId = page.id;
  referenceId = await createReference("Helle Richtung", "#fbf7f0", "Fraunces");
}, 30000);

afterAll(async () => {
  await env.close();
});

describe("Proposal-TTL (Fahrplan P2-3, R2)", () => {
  it("gibt eine abgelaufene Frist bei der Erstellung mit", async () => {
    const proposal = await createProposal("ttl-create");
    expect(proposal.status).toBe("proposed");
    // The row carries a deadline from the start - the sweep only has to act
    // on a fact that is already in the table, it does not have to invent one.
    const row = await env.db.query<{ expires_at: string | null }>(
      `SELECT expires_at FROM redesign_proposals WHERE id = $1`,
      [proposal.id],
    );
    expect(row.rows[0]?.expires_at).toBeTruthy();
    const expiresAt = Date.parse(String(row.rows[0]?.expires_at));
    // Seven days, with a generous tolerance for clock skew in the harness.
    expect(expiresAt).toBeGreaterThan(Date.now() + 6 * DAY_MS);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 8 * DAY_MS);
  });

  it("altert einen alten Vorschlag aus und nimmt ihn aus der offenen Liste", async () => {
    const proposal = await createProposal("ttl-sweep");
    await backdateDeadline(proposal.id);

    // Reading the inbox runs the sweep first.
    const listed = await env.api.request<{ proposals: ProposalView[] }>({
      method: "GET",
      path: `/api/pages/${pageId}/redesign-proposals`,
    });
    expect(listed.status).toBe(200);
    // It is still *there* - the row was not deleted - but no longer open.
    const inInbox = listed.body.proposals.find((entry) => entry.id === proposal.id);
    expect(inInbox).toBeDefined();
    expect(inInbox?.status).toBe("expired");

    // And the open-only filter does not offer it any more.
    const open = await env.api.request<{ proposals: ProposalView[] }>({
      method: "GET",
      path: `/api/pages/${pageId}/redesign-proposals?status=proposed`,
    });
    expect(open.status).toBe(200);
    expect(open.body.proposals.some((entry) => entry.id === proposal.id)).toBe(false);
  });

  it("lehnt eine Bestätigung auf einem abgelaufenen Vorschlag mit conflict ab", async () => {
    // Das ist der eigentliche Sicherheitsgewinn: kein halber Write. Ohne diese
    // Prüfung würde ein Apply auf einem abgelaufenen Vorschlag einen Plan
    // anwenden, der gegen einen uralten Draft-Stand abgeleitet ist.
    const proposal = await createProposal("ttl-confirm-expired");
    const directionId = proposal.cards[0]?.id;
    expect(directionId).toBeTruthy();
    await backdateDeadline(proposal.id);

    const sitesBefore = await env.api.request<{ sites: { id: string }[] }>({
      method: "GET",
      path: "/api/sites",
    });
    const countBefore = sitesBefore.body.sites.length;

    const confirmed = await env.humanApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId, idempotencyKey: "confirm-expired" },
    });
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.error.message).toMatch(/abgelaufen/i);

    // No site was created: the failed confirm left nothing behind.
    const sitesAfter = await env.api.request<{ sites: { id: string }[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(sitesAfter.body.sites).toHaveLength(countBefore);
  });

  it("lässt eine Bestätigung vor Ablauf gelten", async () => {
    // Der Gegenbeweis, sonst wäre jeder Vorschlag sofort tot: die Frist
    // begrenzt Wartezeit, sie widerruft keine gültige Entscheidung.
    const proposal = await createProposal("ttl-confirm-fresh");
    const confirmed = await env.humanApi.request<{
      state: string;
      proposal: ProposalView;
    }>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId: proposal.cards[0]?.id, idempotencyKey: "confirm-fresh" },
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(confirmed.body.state).toBe("confirmed");
    expect(confirmed.body.proposal.status).toBe("applied");
    expect(confirmed.body.proposal.applyResult?.siteId).toBeTruthy();
  });

  it("lässt eine bereits entschiedene Richtung vom Sweep unberührt", async () => {
    // Der Sweep darf nur `proposed` bewegen. Eine `applied`-Zeile zu löschen
    // oder umzubenennen würde die Historie zerstören, an der sich die
    // Nachvollziehbarkeit ("dieses Release kam aus diesem Vorschlag") festmacht.
    const proposal = await createProposal("ttl-decided");
    const confirmed = await env.humanApi.request<{ proposal: ProposalView }>({
      method: "POST",
      path: `/api/redesign-proposals/${proposal.id}/confirm`,
      body: { directionId: proposal.cards[0]?.id, idempotencyKey: "ttl-decided-confirm" },
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(confirmed.body.proposal.status).toBe("applied");

    // Even with a deadline long gone, the finished row keeps its state.
    await backdateDeadline(proposal.id);
    const listed = await env.api.request<{ proposals: ProposalView[] }>({
      method: "GET",
      path: `/api/pages/${pageId}/redesign-proposals`,
    });
    const after = listed.body.proposals.find((entry) => entry.id === proposal.id);
    expect(after?.status).toBe("applied");
  });

  it("lässt eine Zeile ohne Frist unangetastet", async () => {
    // Eine Zeile aus der Zeit vor der Spalte hat `expires_at` NULL. Sie zu
    // altern wäre eine Vermutung über eine Frist, die niemand vergeben hat -
    // der Sweep fasst genau solche Zeilen nicht an.
    const proposal = await createProposal("ttl-legacy");
    await env.db.query(`UPDATE redesign_proposals SET expires_at = NULL WHERE id = $1`, [
      proposal.id,
    ]);

    const listed = await env.api.request<{ proposals: ProposalView[] }>({
      method: "GET",
      path: `/api/pages/${pageId}/redesign-proposals`,
    });
    const row = listed.body.proposals.find((entry) => entry.id === proposal.id);
    expect(row?.status).toBe("proposed");
  });
});
