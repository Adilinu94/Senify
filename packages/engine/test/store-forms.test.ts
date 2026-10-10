import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import type { FormSnapshot } from "@senify/renderer";
import { ensureSchema, Store } from "@senify/engine";
import { FormsRepository } from "../src/store-forms.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the form operations live in `FormsRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new FormsRepository(database.db) };
}

const snapshot = (overrides: Partial<FormSnapshot> = {}): FormSnapshot => ({
  siteId: "site-1",
  pageId: "page-1",
  nodeId: "node-1",
  pagePath: "/kontakt",
  sectionType: "contact",
  mode: "message",
  name: "Kontakt",
  fields: [{ key: "email", label: "E-Mail", kind: "email", required: true }],
  targetCollectionId: null,
  consent: null,
  successMessage: "Danke",
  successPageId: null,
  honeypotKey: "company",
  notifyEmail: null,
  ...overrides,
});

const save = (
  repo: FormsRepository,
  input: { id: string; formId: string; siteId?: string; nodeId?: string },
) =>
  repo.saveFormSnapshot({
    id: input.id,
    formId: input.formId,
    siteId: input.siteId ?? "site-1",
    pageId: "page-1",
    nodeId: input.nodeId ?? "node-1",
    pagePath: "/kontakt",
    sectionType: "contact",
    snapshot: snapshot({ siteId: input.siteId ?? "site-1", nodeId: input.nodeId ?? "node-1" }),
  });

describe("FormsRepository", () => {
  it("creates the signing secret once and returns the same one afterwards", async () => {
    const { db, repo } = await fixture();
    const first = await repo.getOrCreateFormSecret();
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(await repo.getOrCreateFormSecret()).toBe(first);
    expect((await db.query(`SELECT 1 FROM form_settings`)).rows).toHaveLength(1);
  });

  it("keeps the form id stable per site, page and node, and mints a new one for an unknown node", async () => {
    const { repo } = await fixture();
    await save(repo, { id: "snap-1", formId: "form-a" });
    expect(await repo.resolveFormId({ siteId: "site-1", pageId: "page-1", nodeId: "node-1" })).toBe(
      "form-a",
    );
    const fresh = await repo.resolveFormId({ siteId: "site-1", pageId: "page-1", nodeId: "node-2" });
    expect(fresh).not.toBe("form-a");
    expect(fresh.length).toBeGreaterThan(0);
  });

  it("stores a snapshot and reads it back by id, by form and per site, newest first", async () => {
    const { repo } = await fixture();
    const saved = await save(repo, { id: "snap-1", formId: "form-a" });
    expect(saved).toMatchObject({
      id: "snap-1",
      formId: "form-a",
      siteId: "site-1",
      pagePath: "/kontakt",
      sectionType: "contact",
    });
    expect(saved.snapshot.name).toBe("Kontakt");

    await new Promise((resolve) => setTimeout(resolve, 5));
    await save(repo, { id: "snap-2", formId: "form-a" });
    await save(repo, { id: "snap-3", formId: "form-b", siteId: "site-2", nodeId: "node-9" });

    expect((await repo.getFormSnapshot("snap-1")).id).toBe("snap-1");
    expect((await repo.getFormSnapshotForForm("form-a"))?.id).toBe("snap-2");
    expect(await repo.getFormSnapshotForForm("missing")).toBeUndefined();
    expect((await repo.listFormSnapshots("site-1")).map((record) => record.id)).toEqual([
      "snap-2",
      "snap-1",
    ]);
  });

  it("answers an unknown snapshot id with a not_found error that names the field", async () => {
    const { repo } = await fixture();
    const error = await repo.getFormSnapshot("nope").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found" });
  });

  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    await save(repo, { id: "snap-1", formId: "form-a" });
    expect(await store.getFormSnapshot("snap-1")).toEqual(await repo.getFormSnapshot("snap-1"));
    expect(await store.getOrCreateFormSecret()).toBe(await repo.getOrCreateFormSecret());
    expect(await store.listFormSnapshots("site-1")).toEqual(await repo.listFormSnapshots("site-1"));
  });
});
