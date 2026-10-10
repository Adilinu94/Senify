import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { ReferenceLibraryRepository } from "../src/store-reference-library.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the reference collections live in `ReferenceLibraryRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  return { db: database.db, store, repo: new ReferenceLibraryRepository(database.db) };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

// A manually stored reference that points at a collection (the counter and the delete path need rows).
const addReference = (store: Store, collectionId: string | null, name = "Ref") =>
  store.createReference({
    name,
    sourceUrl: "https://example.net/",
    method: "manual",
    provenance: {
      url: "https://example.net/",
      capturedAt: "2026-10-10T00:00:00.000Z",
      hash: "hash",
      method: "manual",
      note: null,
    },
    origin: "manual",
    status: "ready",
    collectionId,
  });

describe("ReferenceLibraryRepository: create and read", () => {
  it("creates a collection with the documented defaults and reads it back", async () => {
    const { repo } = await fixture();
    const created = await repo.createReferenceCollection({ name: "Handwerk" });
    expect(created).toMatchObject({
      name: "Handwerk",
      description: "",
      deployFor: "",
      vocabulary: [],
      risk: "",
      accent: "",
      imageStyle: "",
      recognize: [],
      examples: [],
      warning: null,
      kind: "collection",
      externalId: null,
      position: 0,
      referenceCount: 0,
    });
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(await repo.getReferenceCollection(created.id)).toEqual(created);
  });

  it("keeps every given field, including the style kind and an external id", async () => {
    const { repo } = await fixture();
    const created = await repo.createReferenceCollection({
      name: "Ruhig",
      description: "Viel Weißraum",
      deployFor: "Beratung",
      vocabulary: ["ruhig", "klar"],
      risk: "zu leer",
      accent: "#336699",
      imageStyle: "Fotografie",
      recognize: ["große Typografie"],
      examples: [],
      warning: "nur mit Fotos",
      kind: "style",
      externalId: "style-1",
      position: 4,
    });
    expect(created).toMatchObject({
      description: "Viel Weißraum",
      deployFor: "Beratung",
      vocabulary: ["ruhig", "klar"],
      risk: "zu leer",
      accent: "#336699",
      imageStyle: "Fotografie",
      recognize: ["große Typografie"],
      warning: "nur mit Fotos",
      kind: "style",
      externalId: "style-1",
      position: 4,
    });
  });

  it("answers an unknown collection with a not_found error on the collectionId field", async () => {
    const { repo } = await fixture();
    const error = await rejected(repo.getReferenceCollection("nope"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "collectionId" });
  });

  it("lists by position, then name, can filter by kind and counts the references of each", async () => {
    const { repo, store } = await fixture();
    const b = await repo.createReferenceCollection({ name: "B", position: 1 });
    const a = await repo.createReferenceCollection({ name: "A", position: 1 });
    const first = await repo.createReferenceCollection({ name: "Z", position: 0 });
    const style = await repo.createReferenceCollection({ name: "S", kind: "style", position: 2 });
    await addReference(store, a.id, "r1");
    await addReference(store, a.id, "r2");
    await addReference(store, b.id, "r3");
    await addReference(store, null, "r4");

    const all = await repo.listReferenceCollections();
    expect(all.map((collection) => collection.id)).toEqual([first.id, a.id, b.id, style.id]);
    expect(all.map((collection) => collection.referenceCount)).toEqual([0, 2, 1, 0]);
    expect((await repo.listReferenceCollections({ kind: "style" })).map((c) => c.id)).toEqual([style.id]);
    expect((await repo.getReferenceCollection(a.id)).referenceCount).toBe(2);
  });
});

describe("ReferenceLibraryRepository: update and delete", () => {
  it("changes only the given fields and clears the warning with null", async () => {
    const { repo } = await fixture();
    const created = await repo.createReferenceCollection({
      name: "Alt",
      description: "bleibt",
      warning: "weg damit",
      position: 3,
    });
    const renamed = await repo.updateReferenceCollection(created.id, { name: "Neu" });
    expect(renamed).toMatchObject({ name: "Neu", description: "bleibt", warning: "weg damit", position: 3 });

    const cleared = await repo.updateReferenceCollection(created.id, { warning: null, position: 7 });
    expect(cleared).toMatchObject({ name: "Neu", warning: null, position: 7 });
    expect(Number.isNaN(Date.parse(cleared.updatedAt))).toBe(false);

    const error = await rejected(repo.updateReferenceCollection("nope", { name: "x" }));
    expect(error).toMatchObject({ category: "not_found", field: "collectionId" });
  });

  it("deletes a collection, keeps its references without a collection and returns how many", async () => {
    const { repo, store } = await fixture();
    const collection = await repo.createReferenceCollection({ name: "Weg" });
    const other = await repo.createReferenceCollection({ name: "Bleibt" });
    const inside = await addReference(store, collection.id, "drin");
    const elsewhere = await addReference(store, other.id, "woanders");

    expect(await repo.deleteReferenceCollection(collection.id)).toBe(1);
    expect(await rejected(repo.getReferenceCollection(collection.id))).toMatchObject({
      category: "not_found",
      field: "collectionId",
    });
    expect((await store.getReference(inside.id)).collection).toBeNull();
    expect((await store.getReference(elsewhere.id)).collection?.id).toBe(other.id);
    expect(await rejected(repo.deleteReferenceCollection(collection.id))).toMatchObject({
      category: "not_found",
    });
  });
});

describe("ReferenceLibraryRepository: lookups for the references", () => {
  it("finds a collection by id or answers null, and maps all collections by id", async () => {
    const { repo, store } = await fixture();
    const collection = await repo.createReferenceCollection({ name: "Eine" });
    await addReference(store, collection.id);

    expect(await repo.findReferenceCollection("nope")).toBeNull();
    expect(await repo.findReferenceCollection(collection.id)).toEqual(
      await repo.getReferenceCollection(collection.id),
    );
    const byId = await repo.referenceCollections();
    expect([...byId.keys()]).toEqual([collection.id]);
    expect(byId.get(collection.id)?.referenceCount).toBe(1);
  });
});

describe("ReferenceLibraryRepository behind the Store facade", () => {
  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const { repo, store } = await fixture();
    const created = await store.createReferenceCollection({ name: "Fassade", kind: "style" });
    expect(await repo.getReferenceCollection(created.id)).toEqual(created);
    expect(await store.listReferenceCollections({ kind: "style" })).toEqual(
      await repo.listReferenceCollections({ kind: "style" }),
    );
    const updated = await store.updateReferenceCollection(created.id, { position: 9 });
    expect((await repo.getReferenceCollection(created.id)).position).toBe(updated.position);
    expect(await store.deleteReferenceCollection(created.id)).toBe(0);
    expect(await rejected(repo.getReferenceCollection(created.id))).toMatchObject({ category: "not_found" });
  });
});
