import { describe, expect, it } from "vitest";
import {
  mapAsset,
  mapAssetVariant,
  mapCodePayload,
  mapCollection,
  mapEntry,
  mapEntryVersion,
  type AssetRow,
  type AssetVariantRow,
  type CodePayloadRow,
  type CollectionRow,
  type EntryRow,
  type EntryVersionRow,
} from "../src/store-record-mappers.ts";

const at = "2026-10-21T12:00:00.000Z";
const asset: AssetRow = {
  id: "asset", site_id: "site", filename: "photo.png", mime: "image/png",
  kind: "image", byte_size: "128", width: "640", height: null, hash: "hash",
  alt_text: null, decorative: "true", folder_id: null, tags: '["cover"]',
  storage_ref: "assets/photo.png", status: "ready", replaced_at: null,
  trashed_at: null, created_at: at, updated_at: at,
};
const variant: AssetVariantRow = {
  id: "variant", asset_id: "asset", width: "320", format: "webp",
  storage_ref: "assets/320.webp", byte_size: "64", created_at: at,
};
const payload: CodePayloadRow = {
  id: "payload", site_id: "site", name: "Scene", kind: "module", bytes: "256",
  integrity: "sha256-hash", version: "1", provenance: {}, license: {},
  created_at: at, updated_at: at,
};
const collection: CollectionRow = {
  id: "collection", site_id: "site", name: "Beiträge", slug: "beitraege",
  fields: [{ id: "title", type: "text" }], title_field: "title", date_field: null,
  url_pattern: null, supports: ["drafts"], list_columns: ["title"],
  description: null, deprecated_at: null, created_at: at, updated_at: at,
};
const entry: EntryRow = {
  id: "entry", site_id: "site", collection_id: "collection", slug: "beitrag",
  status: "draft", cells: { title: "Beitrag" }, active_version_id: null,
  version: "1", author: { kind: "human", name: "Test" }, published_at: null,
  scheduled_at: null, deleted_at: null, created_at: at, updated_at: at,
};
const version: EntryVersionRow = {
  id: "version", entry_id: "entry", site_id: "site", version_number: "1",
  cells: entry.cells, slug: entry.slug, status: entry.status, author: entry.author,
  created_at: at,
};

describe("gespeicherte Records validieren", () => {
  it("konvertiert DB-Zahlen und optionale Asset-Felder ohne Ableitungen zu erfinden", () => {
    expect(mapAsset(asset)).toMatchObject({
      kind: "image", byteSize: 128, width: 640, height: null,
      decorative: true, tags: ["cover"], variants: [], blurhash: null,
    });
    expect(mapAssetVariant(variant)).toMatchObject({ width: 320, byteSize: 64, format: "webp" });
    expect(mapCodePayload({ ...payload, kind: "webgl-scene" })).toMatchObject({
      kind: "webgl-scene", bytes: 256, version: 1,
    });
  });

  it("weist unbekannte Asset-, Variant- und Payload-Arten zurück", () => {
    expect(() => mapAsset({ ...asset, kind: "unknown" })).toThrow("Stored asset kind is invalid: unknown");
    expect(() => mapAssetVariant({ ...variant, format: "png" })).toThrow("Stored asset variant format is invalid: png");
    expect(() => mapCodePayload({ ...payload, kind: "script" })).toThrow("Stored payload kind is invalid: script");
  });

  it.each([null, {}, '"text"'])("weist eine nicht-arrayförmige Feldliste zurück: %j", (fields) => {
    expect(() => mapCollection({ ...collection, fields })).toThrow("Stored collection fields are not an array");
  });

  it.each([null, 1, {}, { id: 1, type: "text" }, { id: "x", type: 1 }, { id: "x", type: "unknown" }])(
    "weist ungültige Felddefinitionen zurück: %j",
    (field) => {
      expect(() => mapCollection({ ...collection, fields: [field] })).toThrow("Stored collection field is invalid");
    },
  );

  it.each([null, {}, ["unknown"]])("weist ungültige Supports zurück: %j", (supports) => {
    expect(() => mapCollection({ ...collection, supports })).toThrow("Stored collection supports are invalid");
  });

  it("erhält gültige Collection-Felder und prüft den Status beider Entry-Lesewege", () => {
    expect(mapCollection(collection)).toMatchObject({
      fields: collection.fields, supports: ["drafts"], titleField: "title",
    });
    expect(mapEntry(entry)).toMatchObject({ status: "draft", cells: entry.cells, version: 1 });
    expect(mapEntryVersion(version)).toMatchObject({ status: "draft", versionNumber: 1 });
    expect(() => mapEntry({ ...entry, status: "unknown" })).toThrow("Stored entry status is invalid: unknown");
    expect(() => mapEntryVersion({ ...version, status: "unknown" })).toThrow("Stored entry status is invalid: unknown");
  });
});
