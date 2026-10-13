import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSchema, newEntityId, Store } from "@senify/engine";
import { CodePayloadsRepository, type CreateCodePayloadInput } from "../src/store-code-payloads.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: imported foreign code (ADR 0010) lives in `CodePayloadsRepository`; `Store` only delegates.
// The site existence check is handed in as a function, as in `CollectionsRepository`.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const site = await store.createSite({ name: "Demo" });
  const getSite = vi.fn((siteId: string) => store.getSite(siteId));
  return { site, getSite, repo: new CodePayloadsRepository(database.db, getSite) };
}

const input = (siteId: string, extra: Partial<CreateCodePayloadInput> = {}): CreateCodePayloadInput => ({
  id: newEntityId(),
  siteId,
  name: "hero-scene",
  kind: "module",
  bundle: "export default () => {};",
  provenance: { kind: "hand", sourceUrl: null, pagePath: null, irHash: null, capturedAt: null },
  license: { id: "unknown", note: null, assertedBy: null },
  ...extra,
});

describe("CodePayloadsRepository", () => {
  it("derives bytes and integrity from the stored bundle text", async () => {
    const { site, repo } = await fixture();
    const bundle = "export const gruss = 'Grüße';";
    const created = await repo.createCodePayload(input(site.id, { bundle }));
    expect(created).toMatchObject({
      siteId: site.id,
      kind: "module",
      version: 1,
      bytes: Buffer.byteLength(bundle, "utf8"),
      integrity: createHash("sha256").update(bundle, "utf8").digest("hex"),
    });
    expect(created.bytes).toBeGreaterThan(bundle.length);
    expect(await repo.getCodePayload(created.id)).toEqual(created);
  });

  it("returns the code only through getCodePayloadBundle", async () => {
    const { site, repo } = await fixture();
    const created = await repo.createCodePayload(input(site.id, { bundle: "export default 1;" }));
    expect(created).not.toHaveProperty("bundle");
    expect(await repo.getCodePayloadBundle(created.id)).toEqual({ payload: created, bundle: "export default 1;" });
  });

  it("lists newest first and checks the site first", async () => {
    const { site, getSite, repo } = await fixture();
    const first = await repo.createCodePayload(input(site.id, { name: "first" }));
    const second = await repo.createCodePayload(input(site.id, { name: "second" }));
    const listed = (await repo.listCodePayloads(site.id)).map((payload) => payload.id);
    expect(listed.sort()).toEqual([first.id, second.id].sort());
    expect(getSite).toHaveBeenCalledWith(site.id);
    await expect(repo.listCodePayloads("missing")).rejects.toMatchObject({ category: "not_found" });
  });

  it("checks the site before it inserts", async () => {
    const { repo } = await fixture();
    await expect(repo.createCodePayload(input("missing"))).rejects.toMatchObject({ category: "not_found" });
  });

  it("deletes a payload and returns what was removed", async () => {
    const { site, repo } = await fixture();
    const created = await repo.createCodePayload(input(site.id));
    expect(await repo.deleteCodePayload(created.id)).toEqual(created);
    await expect(repo.getCodePayload(created.id)).rejects.toMatchObject({
      category: "not_found",
      field: "payloadId",
    });
  });

  it("reports unknown payloads as not_found", async () => {
    const { repo } = await fixture();
    await expect(repo.getCodePayload("missing")).rejects.toMatchObject({ category: "not_found", field: "payloadId" });
    await expect(repo.getCodePayloadBundle("missing")).rejects.toMatchObject({
      category: "not_found",
      field: "payloadId",
    });
    await expect(repo.deleteCodePayload("missing")).rejects.toMatchObject({ category: "not_found" });
  });
});
