// Design-Record als versioniertes Objekt (Fahrplan P2-4, R4).
//
// Der Befund, den diese Suite schließt: `buildDesignReport` lief im Publish-Gate
// und im Review, und das Ergebnis wurde danach **weggeworfen**. Damit war die
// Aussage "dieses Release war grün" nicht reproduzierbar: wer den Report
// später neu berechnet, bekommt den Score des *heutigen* Stands und schreibt
// damit die Geschichte um.
//
// Der Record ist die Gegenmaßnahme, und seine Regeln sind strenger als "wir
// speichern den Score":
//   1. Ein Record wird einmal geschrieben und nie geändert. Eine spätere
//      Messung ist ein neuer Record, keine Korrektur.
//   2. Er trägt den Stand, auf dem er gemessen wurde. Ein Record, dessen
//      Stand nicht mehr der Draft entspricht, ist *veraltet* - nicht falsch.
//   3. Manifest und Review zeigen auf **diesen** Record, statt neu zu rechnen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { designStateVersion } from "../src/design-report.ts";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
  type PageResponse,
} from "./helpers.ts";

type ManifestView = {
  designRecordId: string | null;
  designScore: number | null;
  designVerdict: string | null;
};

let env: BootEnv;

async function loadPage(pageId: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function insertHero(pageId: string, headline: string): Promise<void> {
  const page = await loadPage(pageId);
  const applied = await applyMutationsRequest(env.api, page, [
    {
      op: "insertNode",
      parent: { nodeId: page.draft.rootNodeId },
      node: { type: "hero", props: { headline } },
    },
  ]);
  expect(applied.status, JSON.stringify(applied.body)).toBe(200);
}

async function publish(siteId: string, note: string): Promise<{ id: string; manifest: ManifestView }> {
  const response = await env.api.request<{
    release: { id: string; manifest: ManifestView };
  } & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/releases`,
    body: { author: TEST_AUTHOR, note },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.release;
}

beforeAll(async () => {
  env = await bootEngine();
}, 30000);

afterAll(async () => {
  await env.close();
});
describe("designStateVersion (Fahrplan P2-4, R4)", () => {
  // The version is a fingerprint of the measured state, not a counter. These
  // are the properties a record depends on; without them "stale" is meaningless.
  it("bleibt gleich, wenn sich nichts ändert", () => {
    const pages = [
      { id: "a", draftVersion: 3 },
      { id: "b", draftVersion: 7 },
    ];
    const first = designStateVersion({ pages, themeVersion: 2 });
    // Reordering the input must not move it: the same state read in another
    // order is still the same state.
    const second = designStateVersion({ pages: [...pages].reverse(), themeVersion: 2 });
    expect(second).toBe(first);
  });

  it("bewegt sich, wenn sich eine Seite, ein Draft oder das Theme ändert", () => {
    const base = designStateVersion({
      pages: [{ id: "a", draftVersion: 3 }],
      themeVersion: 2,
    });
    expect(
      designStateVersion({ pages: [{ id: "a", draftVersion: 4 }], themeVersion: 2 }),
    ).not.toBe(base);
    expect(
      designStateVersion({ pages: [{ id: "b", draftVersion: 3 }], themeVersion: 2 }),
    ).not.toBe(base);
    expect(
      designStateVersion({ pages: [{ id: "a", draftVersion: 3 }], themeVersion: 3 }),
    ).not.toBe(base);
    // A second page at version 0 is still a second page.
    expect(
      designStateVersion({
        pages: [{ id: "a", draftVersion: 3 }, { id: "b", draftVersion: 0 }],
        themeVersion: 2,
      }),
    ).not.toBe(base);
  });
});

describe("Design-Record am Publish (Fahrplan P2-4, R4)", () => {
  it("friert den Report ein und legt ihn im Manifest ab", async () => {
    const site = await createTestSite(env.api, "Record");
    const page = await createTestPage(env.api, site.id, { title: "Start" });
    await insertHero(page.id, "Eingefroren");

    const release = await publish(site.id, "mit Record");
    // The manifest names the record and repeats the numbers. A reader of the
    // manifest alone sees the score that opened the gate.
    expect(release.manifest.designRecordId).toBeTruthy();
    expect(typeof release.manifest.designScore).toBe("number");
    expect(["green", "hint"]).toContain(release.manifest.designVerdict);

    const records = await env.engine.store.listDesignRecords(site.id, { stage: "publish" });
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.id).toBe(release.manifest.designRecordId);
    // The manifest and the record must agree - one is a pointer to the other,
    // not two measurements that happen to look alike.
    expect(record.report.score).toBe(release.manifest.designScore);
    expect(record.report.verdict).toBe(release.manifest.designVerdict);
  }, 60000);

  it("zeigt bei zwei Publishes desselben Stands denselben Score", async () => {
    // The property the whole step exists for: the same state measured twice
    // yields the same number, so the history cannot drift.
    const site = await createTestSite(env.api, "Zwei Publishes");
    const page = await createTestPage(env.api, site.id, { title: "Start" });
    await insertHero(page.id, "Gleich");

    const first = await publish(site.id, "erster");
    const second = await publish(site.id, "zweiter");
    expect(second.manifest.designScore).toBe(first.manifest.designScore);
    expect(second.manifest.designVerdict).toBe(first.manifest.designVerdict);
    // Two publishes are two releases and therefore two records - the second is
    // not a correction of the first.
    expect(second.manifest.designRecordId).not.toBe(first.manifest.designRecordId);

    const records = await env.engine.store.listDesignRecords(site.id, { stage: "publish" });
    expect(records).toHaveLength(2);
    expect(records[0]?.report.score).toBe(records[1]?.report.score);
  }, 90000);

  it("schreibt einen neuen Record, wenn sich der Draft bewegt hat", async () => {
    // A record is a statement about a moment. After a change the old one must
    // still read as what it was - the point is not that it becomes "wrong",
    // but that it stops describing the present.
    const site = await createTestSite(env.api, "Veralten");
    const page = await createTestPage(env.api, site.id, { title: "Start" });
    await insertHero(page.id, "Vorher");
    const before = await publish(site.id, "vor der Aenderung");
    const scoreBefore = before.manifest.designScore;

    await insertHero(page.id, "Nachher");
    const after = await publish(site.id, "nach der Aenderung");

    // The stored record is untouched: it still carries the old number.
    const stored = await env.engine.store.getDesignRecord(before.manifest.designRecordId ?? "");
    expect(stored.report.score).toBe(scoreBefore);
    expect(stored.draftVersion).not.toBe(
      (await env.engine.store.listDesignRecords(site.id, { stage: "publish" }))[0]?.draftVersion ??
        stored.draftVersion,
    );
    // And the new publish measured the new state.
    expect(after.manifest.designRecordId).not.toBe(before.manifest.designRecordId);
  }, 90000);
});

describe("Design-Record am Review (Fahrplan P2-4, R4)", () => {
  it("misst beim Review eigenständig und nennt den Store-Record", async () => {
    // Publish and review are two moments. They must not collapse into one
    // record, or a later draft state would silently rewrite what the publish
    // gate saw.
    const site = await createTestSite(env.api, "Review-Record");
    const page = await createTestPage(env.api, site.id, { title: "Start" });
    await insertHero(page.id, "Vor dem Review");

    const published = await publish(site.id, "vor dem Review");
    // The review refuses a draft that has not moved since the active release -
    // that is the product working, not a hurdle. So the draft changes first,
    // which also makes the two measurements genuinely different moments.
    await insertHero(page.id, "Nach dem Review");
    const submitted = await env.api.request<{ review: { id: string } } & ErrorResponse>({
      method: "POST",
      path: `/api/sites/${site.id}/reviews`,
      body: { author: TEST_AUTHOR },
    });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);

    const publishRecords = await env.engine.store.listDesignRecords(site.id, { stage: "publish" });
    const reviewRecords = await env.engine.store.listDesignRecords(site.id, { stage: "review" });
    expect(publishRecords).toHaveLength(1);
    expect(reviewRecords).toHaveLength(1);
    // Two separate measurements, not one copied twice.
    expect(reviewRecords[0]?.id).not.toBe(publishRecords[0]?.id);
    expect(reviewRecords[0]?.id).not.toBe(published.manifest.designRecordId);
    // The review measured the newer state, so its version differs - that is
    // what makes "stale" a computable fact rather than a guess.
    expect(reviewRecords[0]?.draftVersion).not.toBe(publishRecords[0]?.draftVersion);
  }, 90000);
});
