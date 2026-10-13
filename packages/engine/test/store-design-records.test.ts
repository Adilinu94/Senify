import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import type { DesignReport } from "../src/design-report.ts";
import { DesignRecordsRepository } from "../src/store-design-records.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: design records live in `DesignRecordsRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new DesignRecordsRepository(database.db) };
}

const report = (siteId = "s1", score = 80): DesignReport => ({
  siteId,
  siteName: "Site",
  profile: "clean",
  score,
  verdict: "green",
  thresholds: { green: 75, gate: 55 },
  dimensions: [{ key: "rhythm", label: "Rhythmus", max: 20, score: 18, detail: "ok" }],
  findings: [],
  penalty: 0,
  metrics: {
    pages: 1,
    sections: 3,
    distinctSectionTypes: 3,
    maxConsecutiveSameType: 1,
    cardShare: 0,
    sameVariantShare: 0,
    centeredHero: false,
    hasCta: true,
    hasHeadline: true,
    literalColors: [],
    gradients: 0,
    emojiProps: 0,
    placeholderProps: 0,
    images: 1,
    imagesWithAlt: 1,
    motionEntries: 0,
    dominantPresetShare: 0,
    typeBase: null,
    typeRatio: null,
    spacingBase: null,
    fontFamilies: 1,
    contrastFailures: 0,
  },
  openMediaNeeds: [],
});

const record = (siteId = "s1", stage: "publish" | "review" = "publish", score = 80) => ({
  siteId,
  stage,
  draftVersion: 3,
  themeVersion: 2,
  report: report(siteId, score),
});

describe("DesignRecordsRepository", () => {
  it("writes a record once and reads it back unchanged", async () => {
    const { repo } = await fixture();
    const created = await repo.createDesignRecord(record());
    expect(created).toMatchObject({ siteId: "s1", stage: "publish", draftVersion: 3, themeVersion: 2 });
    expect(created.report).toEqual(report());
    expect(await repo.getDesignRecord(created.id)).toEqual(created);
  });

  it("answers an unknown id with not_found on recordId", async () => {
    const { repo } = await fixture();
    const error = await repo.getDesignRecord("missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "recordId" });
  });

  it("lists a site's records newest first, filtered by stage and limited", async () => {
    const { db, repo } = await fixture();
    const oldest = await repo.createDesignRecord(record("s1", "publish", 60));
    const middle = await repo.createDesignRecord(record("s1", "review", 70));
    const newest = await repo.createDesignRecord(record("s1", "publish", 90));
    const other = await repo.createDesignRecord(record("s2"));
    for (const [id, at] of [
      [oldest.id, "2026-10-01T10:00:00.000Z"],
      [middle.id, "2026-10-02T10:00:00.000Z"],
      [newest.id, "2026-10-03T10:00:00.000Z"],
      [other.id, "2026-10-04T10:00:00.000Z"],
    ] as const) {
      await db.query(`UPDATE design_records SET created_at = $2 WHERE id = $1`, [id, at]);
    }
    expect((await repo.listDesignRecords("s1")).map((r) => r.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect((await repo.listDesignRecords("s1", { stage: "publish" })).map((r) => r.id)).toEqual([
      newest.id,
      oldest.id,
    ]);
    expect((await repo.listDesignRecords("s1", { limit: 1 })).map((r) => r.id)).toEqual([newest.id]);
    expect((await repo.listDesignRecords("s2")).map((r) => r.id)).toEqual([other.id]);
  });

  it("refuses to read a row whose stage is not publish or review", async () => {
    const { db, repo } = await fixture();
    const created = await repo.createDesignRecord(record());
    await db.query(`UPDATE design_records SET stage = 'bogus' WHERE id = $1`, [created.id]);
    await expect(repo.getDesignRecord(created.id)).rejects.toThrow("Stored design record stage is invalid: bogus");
  });

  it("is what Store delegates to: both see the same records", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    const viaStore = await store.createDesignRecord(record());
    expect(await repo.getDesignRecord(viaStore.id)).toEqual(viaStore);
    const viaRepo = await repo.createDesignRecord(record("s1", "review"));
    expect(await store.getDesignRecord(viaRepo.id)).toEqual(viaRepo);
    expect(await store.listDesignRecords("s1", { stage: "review" })).toEqual(
      await repo.listDesignRecords("s1", { stage: "review" }),
    );
  });
});
