import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiHarness, type ApiHarness } from "@senify/core/testing";
import { rebakeCount } from "@senify/engine";
import {
  bootEngine,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

type FieldResponse = {
  id: string;
  key: string;
  label: string;
  type: string;
  description: string;
  required?: boolean;
  deprecated?: boolean;
  options?: { value: string; label: string }[];
  targetCollections?: string[];
  subFields?: FieldResponse[];
};

type CollectionResponse = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  fields: FieldResponse[];
  titleField: string;
  dateField: string | null;
  urlPattern: string | null;
  supports: string[];
  listColumns: string[];
  description: string | null;
  deprecatedAt: string | null;
};

type EntryResponse = {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: string;
  cells: Record<string, unknown>;
  activeVersionId: string | null;
  version: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  deletedAt: string | null;
};

type VersionResponse = {
  id: string;
  entryId: string;
  versionNumber: number;
  cells: Record<string, unknown>;
  slug: string;
  status: string;
};

type PublishResponse = {
  entry: EntryResponse;
  version: VersionResponse;
  redirect: { fromPath: string; toPath: string } | null;
  rebake: { siteId: string; reason: string; queued: boolean };
};

type ResolutionResponse =
  | { status: "published"; entry: EntryResponse; collection: CollectionResponse }
  | { status: "redirect"; from: string; to: string }
  | { status: "not_found"; path: string };

type TickResponse = {
  published: { entryId: string; versionNumber: number }[];
  failed: { entryId: string; reason: string }[];
};

type SearchResponse = {
  query: string;
  results: { entry: EntryResponse; score: number }[];
};

let env: BootEnv;
let siteId: string;
let categoriesId: string;
let categoryEntryId: string;
let allTypesId: string;

const ALL_TYPE_FIELDS = [
  { id: "f-text", key: "text", label: "Text", type: "text", description: "Einzeiliger Text." },
  { id: "f-long", key: "longText", label: "Langtext", type: "longText", description: "Mehrzeiliger Text." },
  { id: "f-rich", key: "body", label: "Body", type: "richtext", description: "Markdown-Body (Suchgewicht C)." },
  { id: "f-number", key: "number", label: "Zahl", type: "number", description: "Gleitkommazahl." },
  { id: "f-bool", key: "boolean", label: "Flag", type: "boolean", description: "Wahrheitswert." },
  { id: "f-date", key: "date", label: "Datum", type: "date", description: "ISO-Datum." },
  { id: "f-datetime", key: "dateTime", label: "Zeitpunkt", type: "dateTime", description: "ISO-Datetime." },
  {
    id: "f-select",
    key: "select",
    label: "Auswahl",
    type: "select",
    description: "Einzelauswahl.",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  },
  {
    id: "f-multi",
    key: "multiSelect",
    label: "Tags",
    type: "multiSelect",
    description: "Mehrfachauswahl (Tags).",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  },
  { id: "f-url", key: "url", label: "Link", type: "url", description: "Absolute oder relative URL." },
  { id: "f-email", key: "email", label: "Mail", type: "email", description: "E-Mail-Adresse." },
  { id: "f-media", key: "media", label: "Bild", type: "media", description: "Ein Asset.", mediaKind: "image" },
  { id: "f-media-multi", key: "mediaMulti", label: "Galerie", type: "mediaMulti", description: "Mehrere Assets." },
  {
    id: "f-rel",
    key: "relation",
    label: "Kategorie",
    type: "relation",
    description: "Verweis auf eine Kategorie.",
    targetCollections: [] as string[],
  },
  {
    id: "f-rel-multi",
    key: "relationMulti",
    label: "Kategorien",
    type: "relationMulti",
    description: "Mehrere Kategorien.",
    targetCollections: [] as string[],
  },
  {
    id: "f-repeater",
    key: "repeater",
    label: "Positionen",
    type: "repeater",
    description: "Liste aus Unterfeldern (1 Ebene).",
    subFields: [
      { id: "s-label", key: "label", label: "Label", type: "text", description: "Beschriftung." },
    ],
  },
];

async function createCollection(
  body: Record<string, unknown>,
): Promise<{ status: number; body: CollectionResponse & ErrorResponse }> {
  return env.api.request<CollectionResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/collections`,
    body,
  });
}

async function createEntry(
  collectionId: string,
  cells: Record<string, unknown>,
  slug?: string,
): Promise<{ status: number; body: EntryResponse & ErrorResponse }> {
  return env.api.request<EntryResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/entries`,
    body: {
      collectionId,
      cells,
      author: TEST_AUTHOR,
      ...(slug === undefined ? {} : { slug }),
    },
  });
}

async function updateEntry(
  entryId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: EntryResponse & ErrorResponse }> {
  return env.api.request<EntryResponse & ErrorResponse>({
    method: "PUT",
    path: `/api/entries/${entryId}`,
    body: { author: TEST_AUTHOR, ...body },
  });
}

async function publishEntry(
  entryId: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; body: PublishResponse & ErrorResponse }> {
  return env.api.request<PublishResponse & ErrorResponse>({
    method: "POST",
    path: `/api/entries/${entryId}/publish`,
    body: { author: TEST_AUTHOR, ...body },
  });
}

async function getEntry(
  entryId: string,
): Promise<{ status: number; body: EntryResponse & ErrorResponse }> {
  return env.api.request<EntryResponse & ErrorResponse>({
    method: "GET",
    path: `/api/entries/${entryId}`,
  });
}

async function listVersions(entryId: string): Promise<VersionResponse[]> {
  const response = await env.api.request<{ versions: VersionResponse[] }>({
    method: "GET",
    path: `/api/entries/${entryId}/versions`,
  });
  return response.body.versions;
}

async function listEntries(
  query: string,
): Promise<{ status: number; body: { entries: EntryResponse[] } & ErrorResponse }> {
  return env.api.request<{ entries: EntryResponse[] } & ErrorResponse>({
    method: "GET",
    path: `/api/sites/${siteId}/entries${query}`,
  });
}

async function resolve(
  path: string,
): Promise<{ status: number; body: ResolutionResponse & ErrorResponse }> {
  return env.api.request<ResolutionResponse & ErrorResponse>({
    method: "GET",
    path: `/api/sites/${siteId}/entries/resolve?path=${encodeURIComponent(path)}`,
  });
}

async function search(
  body: Record<string, unknown>,
): Promise<{ status: number; body: SearchResponse & ErrorResponse }> {
  return env.api.request<SearchResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/entries/search`,
    body,
  });
}

async function schedule(
  entryId: string,
  scheduledAt: string,
): Promise<{ status: number; body: EntryResponse & ErrorResponse }> {
  const entry = await getEntry(entryId);
  return updateEntry(entryId, {
    baseVersion: entry.body.version,
    status: "scheduled",
    scheduledAt,
  });
}

async function inOneHour(): Promise<string> {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

// Simulates the clock: the API refuses a past scheduledAt on purpose, so the
// tick test moves the stored timestamp into the past instead of waiting.
async function forceDue(entryId: string, scheduledAt: string): Promise<void> {
  const entry = await env.engine.store.getEntry(entryId);
  await env.engine.store.updateEntryRow({
    entryId,
    expectedVersion: entry.version,
    changes: {
      slug: entry.slug,
      status: "scheduled",
      cells: entry.cells,
      activeVersionId: entry.activeVersionId,
      author: TEST_AUTHOR,
      searchText: entry.slug,
      publishedAt: entry.publishedAt,
      scheduledAt,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function scopedApi(scopes: string[]): Promise<ApiHarness> {
  const created = await env.api.request<{ secret: string }>({
    method: "POST",
    path: "/api/tokens",
    body: { name: `content-test-${scopes.join("-")}`, scopes },
  });
  if (created.status !== 201) {
    throw new Error(`Token setup failed: ${JSON.stringify(created.body)}`);
  }
  return createApiHarness(env.server.origin, { token: created.body.secret });
}

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api, "Content Studio")).id;
  // Categories are a collection + relation field (artifacts/22 §"Kategorien").
  const categories = await createCollection({
    name: "Kategorien",
    slug: "kategorien",
    fields: [
      {
        id: "c-color",
        key: "color",
        label: "Farbe",
        type: "text",
        description: "Akzentfarbe der Kategorie.",
      },
    ],
  });
  categoriesId = categories.body.id;
  const categoryEntry = await createEntry(categoriesId, {
    title: "Technik",
    "c-color": "blau",
  });
  categoryEntryId = categoryEntry.body.id;
});

afterAll(async () => {
  await env.close();
});

describe("collections and the field system", () => {
  it("creates a collection covering all 16 field types", async () => {
    const response = await createCollection({
      name: "Beiträge",
      slug: "beitraege",
      urlPattern: "/blog/{slug}",
      description: "Alle Feldtypen in einer Collection.",
      fields: ALL_TYPE_FIELDS.map((field) =>
        field.id === "f-rel" || field.id === "f-rel-multi"
          ? { ...field, targetCollections: [categoriesId] }
          : field,
      ),
    });
    expect(response.status).toBe(201);
    allTypesId = response.body.id;
    const fields = response.body.fields;
    // The built-in title field is always added.
    expect(fields).toHaveLength(17);
    expect(fields[0]?.id).toBe("title");
    expect(response.body.titleField).toBe("title");
    expect(response.body.urlPattern).toBe("/blog/{slug}");
    expect(response.body.supports).toEqual([
      "drafts",
      "versions",
      "scheduling",
      "seo",
      "search",
    ]);
    expect(new Set(fields.map((field) => field.type)).size).toBe(16);
    // Every field is agent-readable.
    expect(fields.every((field) => field.description.length > 3)).toBe(true);
  });

  it("accepts a valid entry for every field type and rejects wrong cells", async () => {
    const valid = await createEntry(allTypesId, {
      title: "Alle Felder",
      "f-text": "Hallo",
      "f-long": "Ein längerer Text",
      "f-rich": "## Markdown",
      "f-number": 42,
      "f-bool": true,
      "f-date": "2026-10-01",
      "f-datetime": "2026-10-01T09:00:00Z",
      "f-select": "a",
      "f-multi": ["a", "b"],
      "f-url": "https://example.test/beitrag",
      "f-email": "wer@example.test",
      "f-media": { assetId: "asset-1", focal: { x: 0.4, y: 0.6 } },
      "f-media-multi": [{ assetId: "asset-2" }, { assetId: "asset-3" }],
      "f-rel": categoryEntryId,
      "f-rel-multi": [categoryEntryId],
      "f-repeater": [{ id: "item-1", cells: { "s-label": "Erste Zeile" } }],
    });
    expect(valid.status).toBe(201);
    expect(valid.body.slug).toBe("alle-felder");
    expect(valid.body.status).toBe("draft");
    expect(valid.body.version).toBe(1);

    const wrongType = await createEntry(allTypesId, {
      title: "Kaputt",
      "f-number": "keine Zahl",
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.category).toBe("validation");
    expect(wrongType.body.error.field).toBe("cells.f-number");

    const unknownField = await createEntry(allTypesId, {
      title: "Kaputt",
      "f-nope": "x",
    });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.error.field).toBe("cells.f-nope");
    expect(unknownField.body.error.suggestion).toContain("f-number");

    const badOption = await createEntry(allTypesId, {
      title: "Kaputt",
      "f-select": "c",
    });
    expect(badOption.status).toBe(400);
    expect(badOption.body.error.suggestion).toContain("a, b");

    const foreignRelation = await createEntry(allTypesId, {
      title: "Kaputt",
      "f-rel": "entry-does-not-exist",
    });
    expect(foreignRelation.status).toBe(400);
    expect(foreignRelation.body.error.field).toBe("cells.f-rel");

    const nestedRepeater = await createEntry(allTypesId, {
      title: "Kaputt",
      "f-repeater": [{ id: "i1", cells: { "s-nope": "x" } }],
    });
    expect(nestedRepeater.status).toBe(400);
    expect(nestedRepeater.body.error.field).toBe("cells.f-repeater[0].cells.s-nope");
  });

  it("refuses field definitions it cannot execute", async () => {
    const unknownType = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [
        { id: "x", key: "x", label: "X", type: "geolocation", description: "Gibt es nicht." },
      ],
    });
    expect(unknownType.status).toBe(400);

    const withoutDescription = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [{ id: "x", key: "x", label: "X", type: "text" }],
    });
    expect(withoutDescription.status).toBe(400);
    expect(withoutDescription.body.error.field).toBe("fields[0].description");

    const withoutId = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [
        { key: "x", label: "X", type: "text", description: "Ohne id." },
      ],
    });
    expect(withoutId.status).toBe(400);
    expect(withoutId.body.error.field).toBe("fields[0].id");
    expect(withoutId.body.error.suggestion).toContain("from-fields");

    const relationWithoutTarget = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [
        {
          id: "r",
          key: "r",
          label: "R",
          type: "relation",
          description: "Ohne Ziel.",
        },
      ],
    });
    expect(relationWithoutTarget.status).toBe(400);

    const relationWithUnknownTarget = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [
        {
          id: "r",
          key: "r",
          label: "R",
          type: "relation",
          description: "Ziel existiert nicht.",
          targetCollections: ["nope-id"],
        },
      ],
    });
    expect(relationWithUnknownTarget.status).toBe(400);
    expect(relationWithUnknownTarget.body.error.field).toBe(
      "fields[0].targetCollections[0]",
    );

    const nestedRepeater = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [
        {
          id: "rep",
          key: "rep",
          label: "Rep",
          type: "repeater",
          description: "Verschachtelt.",
          subFields: [
            {
              id: "inner",
              key: "inner",
              label: "Inner",
              type: "repeater",
              description: "Verboten.",
              subFields: [
                {
                  id: "leaf",
                  key: "leaf",
                  label: "Leaf",
                  type: "text",
                  description: "Blatt.",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(nestedRepeater.status).toBe(400);

    const duplicateKeys = await createCollection({
      name: "Nope",
      slug: "nope",
      fields: [
        { id: "a", key: "gleich", label: "A", type: "text", description: "A." },
        { id: "b", key: "gleich", label: "B", type: "text", description: "B." },
      ],
    });
    expect(duplicateKeys.status).toBe(400);
    expect(duplicateKeys.body.error.field).toBe("fields[1].key");

    const brokenUrlPattern = await createCollection({
      name: "Nope",
      slug: "nope",
      urlPattern: "/blog/ohne-platzhalter",
      fields: [
        { id: "a", key: "a", label: "A", type: "text", description: "A." },
      ],
    });
    expect(brokenUrlPattern.status).toBe(400);
    expect(brokenUrlPattern.body.error.field).toBe("urlPattern");
  });

  it("updates a collection additively and deprecates instead of deleting", async () => {
    const created = await createCollection({
      name: "Update Test",
      slug: "update-test",
      fields: [
        {
          id: "u-a",
          key: "a",
          label: "Alt",
          type: "text",
          description: "Wird umbenannt.",
        },
      ],
    });
    const collectionId = created.body.id;

    const updated = await env.api.request<CollectionResponse>({
      method: "PUT",
      path: `/api/collections/${collectionId}`,
      body: {
        name: "Update Test 2",
        fields: [
          {
            id: "u-a",
            key: "a",
            label: "Neu",
            type: "text",
            description: "Umbenannt, gleicher Typ.",
          },
          {
            id: "u-b",
            key: "b",
            label: "Zusatz",
            type: "number",
            description: "Neues Feld.",
          },
        ],
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Update Test 2");
    expect(updated.body.fields.map((field) => field.id)).toEqual([
      "title",
      "u-a",
      "u-b",
    ]);
    expect(updated.body.fields[1]?.label).toBe("Neu");

    // Removal is refused: the field stays, the payload omits it.
    const additive = await env.api.request<CollectionResponse>({
      method: "PUT",
      path: `/api/collections/${collectionId}`,
      body: {
        fields: [
          { id: "u-a", key: "a", label: "Neu", type: "text", description: "Bleibt.", deprecated: true },
        ],
      },
    });
    expect(additive.status).toBe(200);
    expect(additive.body.fields.map((field) => field.id)).toEqual([
      "title",
      "u-a",
      "u-b",
    ]);
    expect(additive.body.fields[1]?.deprecated).toBe(true);

    const typeChange = await env.api.request<ErrorResponse>({
      method: "PUT",
      path: `/api/collections/${collectionId}`,
      body: {
        fields: [{ id: "u-a", key: "a", label: "Neu", type: "number", description: "Typwechsel." }],
      },
    });
    expect(typeChange.status).toBe(400);
    expect(typeChange.body.error.suggestion).toContain("immutable");

    const deprecated = await env.api.request<CollectionResponse>({
      method: "PUT",
      path: `/api/collections/${collectionId}`,
      body: { deprecated: true },
    });
    expect(deprecated.status).toBe(200);
    expect(deprecated.body.deprecatedAt).not.toBeNull();

    // A deprecated collection takes no new entries.
    const refused = await createEntry(collectionId, { title: "Nein" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain("deprecated");
  });

  it("creates a collection from loose field specs (T11 preparation)", async () => {
    const response = await env.api.request<CollectionResponse & ErrorResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/collections/from-fields`,
      body: {
        name: "Formular-Eingänge",
        fields: [
          { label: "Betreff", type: "text", description: "Betreff der Nachricht." },
          { label: "Lesezeit", type: "number", description: "Geschätzte Minuten." },
        ],
      },
    });
    expect(response.status).toBe(201);
    const fields = response.body.fields;
    expect(fields.map((field) => field.id)).toEqual(["title", expect.any(String), expect.any(String)]);
    expect(fields.map((field) => field.key)).toEqual([
      "title",
      "betreff",
      "lesezeit",
    ]);
    const entry = await createEntry(response.body.id, {
      title: "Anfrage",
      [fields[1]?.id ?? ""]: "Rückruf bitte",
      [fields[2]?.id ?? ""]: 5,
    });
    expect(entry.status).toBe(201);
    expect(entry.body.cells[fields[1]?.id ?? ""]).toBe("Rückruf bitte");
  });
});

describe("entry workflow and conflict protection", () => {
  it("writes drafts without versions and demands baseVersion", async () => {
    const created = await createEntry(categoriesId, { title: "Draft-Test" });
    const entryId = created.body.id;
    const first = await getEntry(entryId);
    expect(first.body.version).toBe(1);
    expect(await listVersions(entryId)).toEqual([]);

    const updated = await updateEntry(entryId, {
      baseVersion: 1,
      cells: { "c-color": "grün" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);
    // Autosave writes never create a version.
    expect(await listVersions(entryId)).toEqual([]);

    const stale = await updateEntry(entryId, {
      baseVersion: 1,
      cells: { "c-color": "rot" },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.category).toBe("conflict");
    expect(stale.body.error.field).toBe("baseVersion");
    expect(stale.body.error.suggestion?.toLowerCase()).toContain("reload");

    const withoutVersion = await env.api.request<ErrorResponse>({
      method: "PUT",
      path: `/api/entries/${entryId}`,
      body: { author: TEST_AUTHOR, cells: { "c-color": "rot" } },
    });
    expect(withoutVersion.status).toBe(400);

    const publishViaUpdate = await updateEntry(entryId, {
      baseVersion: 2,
      status: "published",
    });
    expect(publishViaUpdate.status).toBe(400);
    expect(publishViaUpdate.body.error.suggestion).toContain("/publish");

    const clearing = await updateEntry(entryId, {
      baseVersion: 2,
      cells: { "c-color": null },
    });
    expect(clearing.status).toBe(200);
    expect(clearing.body.cells["c-color"]).toBeUndefined();
  });

  it("publishes with a version, a redirect slot and a rebake trigger", async () => {
    const created = await createEntry(categoriesId, { title: "Publish-Test" });
    const entryId = created.body.id;

    const published = await publishEntry(entryId);
    expect(published.status).toBe(200);
    expect(published.body.entry.status).toBe("published");
    expect(published.body.entry.activeVersionId).toBe(published.body.version.id);
    expect(published.body.entry.publishedAt).not.toBeNull();
    expect(published.body.version.versionNumber).toBe(1);
    expect(published.body.version.status).toBe("published");
    expect(published.body.redirect).toBeNull();
    expect(published.body.rebake.queued).toBe(true);
    expect(rebakeCount(siteId)).toBeGreaterThan(0);
    expect(await listVersions(entryId)).toHaveLength(1);

    // Publish without a change: a new version, the same content.
    const again = await publishEntry(entryId);
    expect(again.status).toBe(200);
    expect(again.body.version.versionNumber).toBe(2);
    expect(await listVersions(entryId)).toHaveLength(2);

    const stale = await publishEntry(entryId, { baseVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.field).toBe("baseVersion");

    // Required fields gate the publish, drafts stay writable.
    const required = await createCollection({
      name: "Pflichtfelder",
      slug: "pflichtfelder",
      fields: [
        {
          id: "p-required",
          key: "required",
          label: "Pflicht",
          type: "text",
          description: "Muss gesetzt sein.",
          required: true,
        },
      ],
    });
    const incomplete = await createEntry(required.body.id, { title: "Unvollständig" });
    expect(incomplete.status).toBe(201);
    const blocked = await publishEntry(incomplete.body.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.field).toBe("cells.p-required");
    expect(blocked.body.error.message).toContain("required");
  });

  it("enforces unique fields and slug collisions at publish", async () => {
    const collection = await createCollection({
      name: "Unique",
      slug: "unique-test",
      fields: [
        {
          id: "u-code",
          key: "code",
          label: "Code",
          type: "text",
          description: "Muss eindeutig sein.",
          unique: true,
        },
      ],
    });
    const first = await createEntry(collection.body.id, {
      title: "Erster",
      "u-code": "ABC",
    });
    expect((await publishEntry(first.body.id)).status).toBe(200);

    const second = await createEntry(collection.body.id, {
      title: "Zweiter",
      "u-code": "ABC",
    });
    const clash = await publishEntry(second.body.id);
    expect(clash.status).toBe(409);
    expect(clash.body.error.field).toBe("cells.u-code");
    expect(clash.body.error.message).toContain("already used");

    const duplicateSlug = await createEntry(
      collection.body.id,
      { title: "Andere", "u-code": "XYZ" },
      "zweiter",
    );
    expect(duplicateSlug.status).toBe(409);
    expect(duplicateSlug.body.error.field).toBe("slug");
  });

  it("keeps at most 50 versions per entry (retention)", async () => {
    const created = await createEntry(categoriesId, { title: "Retention" });
    const entryId = created.body.id;
    for (let index = 0; index < 52; index += 1) {
      const response = await publishEntry(entryId);
      expect(response.status).toBe(200);
    }
    const versions = await listVersions(entryId);
    expect(versions).toHaveLength(50);
    expect(versions[0]?.versionNumber).toBe(52);
    expect(versions.at(-1)?.versionNumber).toBe(3);
  }, 60000);

  it("restores a version into the draft without publishing", async () => {
    const created = await createEntry(categoriesId, {
      title: "Restore",
      "c-color": "erste Fassung",
    });
    const entryId = created.body.id;
    const first = await publishEntry(entryId);
    expect(first.status).toBe(200);

    const entry = await getEntry(entryId);
    await updateEntry(entryId, {
      baseVersion: entry.body.version,
      cells: { "c-color": "zweite Fassung" },
    });
    const second = await publishEntry(entryId);
    expect(second.status).toBe(200);
    expect(second.body.version.cells["c-color"]).toBe("zweite Fassung");

    const restored = await env.api.request<EntryResponse & ErrorResponse>({
      method: "POST",
      path: `/api/entries/${entryId}/restore-version/${first.body.version.id}`,
      body: { author: TEST_AUTHOR },
    });
    expect(restored.status).toBe(200);
    expect(restored.body.cells["c-color"]).toBe("erste Fassung");
    // Restore is a draft write: the entry stays published and no new version
    // appears.
    expect(restored.body.status).toBe("published");
    expect(restored.body.activeVersionId).toBe(second.body.version.id);
    expect(await listVersions(entryId)).toHaveLength(2);

    const foreign = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/entries/${entryId}/restore-version/${created.body.id}`,
      body: { author: TEST_AUTHOR },
    });
    expect(foreign.status).toBe(404);
  });

  it("publishes scheduled entries on the tick and falls back to draft", async () => {
    // Unpublishable: the required field is missing, so the tick falls back to
    // draft instead of leaving the entry stuck in "scheduled".
    const required = await createCollection({
      name: "Tick-Pflicht",
      slug: "tick-pflicht",
      fields: [
        {
          id: "t-req",
          key: "req",
          label: "Pflicht",
          type: "text",
          description: "Muss gesetzt sein.",
          required: true,
        },
      ],
    });
    const created = await createEntry(required.body.id, {
      title: "Scheduled kaputt",
    });
    const brokenId = created.body.id;
    expect((await schedule(brokenId, await inOneHour())).status).toBe(200);

    const ticked = await env.api.request<TickResponse>({
      method: "POST",
      path: "/api/entries/tick",
      body: { siteId },
    });
    expect(ticked.status).toBe(200);
    // Not due yet: nothing happens.
    expect(ticked.body.published).toEqual([]);
    expect(ticked.body.failed).toEqual([]);

    const broken = await getEntry(brokenId);
    expect(broken.body.status).toBe("scheduled");
    expect(broken.body.scheduledAt).not.toBeNull();

    const past = new Date(Date.now() - 1000).toISOString();
    await forceDue(brokenId, past);
    const failing = await env.api.request<TickResponse>({
      method: "POST",
      path: "/api/entries/tick",
      body: { siteId },
    });
    expect(failing.body.failed.map((item) => item.entryId)).toContain(brokenId);
    expect(failing.body.failed[0]?.reason).toContain("required");
    const fallenBack = await getEntry(brokenId);
    expect(fallenBack.body.status).toBe("draft");
    expect(fallenBack.body.scheduledAt).toBeNull();

    // The audit log keeps the note for the operator.
    const audit = await env.api.request<{
      entries: { mutation: string; params: Record<string, unknown> }[];
    }>({ method: "GET", path: `/api/sites/${siteId}/audit?limit=20` });
    expect(
      audit.body.entries.some((entry) => entry.mutation === "schedule_failed"),
    ).toBe(true);

    // A valid entry publishes on the tick.
    const ok = await createEntry(categoriesId, { title: "Scheduled ok" });
    const okId = ok.body.id;
    expect((await schedule(okId, await inOneHour())).status).toBe(200);
    await forceDue(okId, past);
    const published = await env.api.request<TickResponse>({
      method: "POST",
      path: "/api/entries/tick",
      body: { siteId },
    });
    expect(published.body.published.map((item) => item.entryId)).toContain(okId);
    const publishedEntry = await getEntry(okId);
    expect(publishedEntry.body.status).toBe("published");
    expect(publishedEntry.body.scheduledAt).toBeNull();
    expect(await listVersions(okId)).toHaveLength(1);

    // A schedule in the past is refused: publish now instead.
    const refused = await schedule(okId, past);
    expect(refused.status).toBe(400);
    expect(refused.body.error.field).toBe("scheduledAt");
  }, 30000);
});

describe("slugs, redirects and resolve", () => {
  it("answers published paths, leaves a 301 on a slug change and 404s drafts", async () => {
    const collection = await createCollection({
      name: "Blog",
      slug: "blog",
      urlPattern: "/blog/{slug}",
      fields: [
        {
          id: "b-body",
          key: "body",
          label: "Body",
          type: "richtext",
          description: "Markdown-Body.",
        },
      ],
    });
    const collectionId = collection.body.id;
    const created = await createEntry(
      collectionId,
      { title: "Erster Beitrag", "b-body": "Text" },
      "erster-beitrag",
    );
    const entryId = created.body.id;

    // A draft slug does not resolve.
    const draft = await resolve("/blog/erster-beitrag");
    expect(draft.body.status).toBe("not_found");

    expect((await publishEntry(entryId)).status).toBe(200);
    const published = await resolve("/blog/erster-beitrag");
    expect(published.body.status).toBe("published");
    if (published.body.status !== "published") throw new Error("unreachable");
    expect(published.body.entry.id).toBe(entryId);
    expect(published.body.collection.id).toBe(collectionId);

    // Unpublishing hides the route again.
    await env.api.request({
      method: "POST",
      path: `/api/entries/${entryId}/unpublish`,
      body: { author: TEST_AUTHOR },
    });
    expect((await resolve("/blog/erster-beitrag")).body.status).toBe("not_found");
    const status = await getEntry(entryId);
    expect(status.body.status).toBe("unpublished");
    expect((await publishEntry(entryId)).status).toBe(200);

    // Rename as a draft: the published URL still answers.
    const current = await getEntry(entryId);
    const renamed = await updateEntry(entryId, {
      baseVersion: current.body.version,
      slug: "zweiter-beitrag",
    });
    expect(renamed.status).toBe(200);
    expect((await resolve("/blog/erster-beitrag")).body.status).toBe("published");

    const republished = await publishEntry(entryId);
    expect(republished.status).toBe(200);
    expect(republished.body.redirect).toMatchObject({
      fromPath: "/blog/erster-beitrag",
      toPath: "/blog/zweiter-beitrag",
    });

    const redirect = await resolve("/blog/erster-beitrag");
    expect(redirect.body).toEqual({
      status: "redirect",
      from: "/blog/erster-beitrag",
      to: "/blog/zweiter-beitrag",
    });
    const moved = await resolve("/blog/zweiter-beitrag");
    expect(moved.body.status).toBe("published");

    const unknown = await resolve("/blog/gibt-es-nicht");
    expect(unknown.body).toEqual({
      status: "not_found",
      path: "/blog/gibt-es-nicht",
    });

    // Another collection without a urlPattern resolves under its own slug.
    const other = await createEntry(categoriesId, { title: "Kategorie-Pfad" });
    const otherPath = `/kategorien/${other.body.slug}`;
    expect((await resolve(otherPath)).body.status).toBe("not_found");
    expect((await publishEntry(other.body.id)).status).toBe(200);
    expect((await resolve(otherPath)).body.status).toBe("published");
  }, 30000);
});

describe("trash, purge and search", () => {
  it("keeps trash reversibly and reserves purge for the publish scope", async () => {
    const created = await createEntry(categoriesId, { title: "Trash-Test" });
    const entryId = created.body.id;
    expect((await publishEntry(entryId)).status).toBe(200);

    const trashed = await env.api.request<EntryResponse>({
      method: "DELETE",
      path: `/api/entries/${entryId}`,
      body: { author: TEST_AUTHOR },
    });
    expect(trashed.status).toBe(200);
    expect(trashed.body.deletedAt).not.toBeNull();

    const publishedList = await listEntries(
      `?collectionId=${categoriesId}&status=published`,
    );
    expect(publishedList.body.entries.map((entry) => entry.id)).not.toContain(
      entryId,
    );
    const trashList = await listEntries(`?collectionId=${categoriesId}&trashed=true`);
    expect(trashList.body.entries.map((entry) => entry.id)).toContain(entryId);

    // A trashed entry is not writable.
    const blocked = await updateEntry(entryId, {
      baseVersion: trashed.body.version,
      cells: { "c-color": "rot" },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.suggestion).toContain("restore");

    // The slug is free again while the entry sits in the trash.
    const replacement = await createEntry(
      categoriesId,
      { title: "Ersatz" },
      trashed.body.slug,
    );
    expect(replacement.status).toBe(201);

    const conflictingRestore = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/entries/${entryId}/restore`,
      body: { author: TEST_AUTHOR },
    });
    expect(conflictingRestore.status).toBe(409);
    expect(conflictingRestore.body.error.field).toBe("slug");

    // Purge is permanent: the write scope is not enough for it.
    await env.api.request({
      method: "DELETE",
      path: `/api/entries/${replacement.body.id}`,
      body: { author: TEST_AUTHOR },
    });
    const writeApi = await scopedApi(["read", "write"]);
    const denied = await writeApi.request<ErrorResponse>({
      method: "POST",
      path: `/api/entries/${replacement.body.id}/purge`,
      body: { author: TEST_AUTHOR },
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.category).toBe("auth");
    expect(denied.body.error.suggestion).toContain("publish");

    const purgedReplacement = await env.api.request<{ purged: string }>({
      method: "POST",
      path: `/api/entries/${replacement.body.id}/purge`,
      body: { author: TEST_AUTHOR },
    });
    expect(purgedReplacement.status).toBe(200);

    const restored = await env.api.request<EntryResponse>({
      method: "POST",
      path: `/api/entries/${entryId}/restore`,
      body: { author: TEST_AUTHOR },
    });
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();

    // Purge needs the trash first, even for the publish scope.
    const livePurge = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/entries/${entryId}/purge`,
      body: { author: TEST_AUTHOR },
    });
    expect(livePurge.status).toBe(422);
    expect(livePurge.body.error.category).toBe("guardrail");

    await env.api.request({
      method: "DELETE",
      path: `/api/entries/${entryId}`,
      body: { author: TEST_AUTHOR },
    });
    const purged = await env.api.request<{ purged: string }>({
      method: "POST",
      path: `/api/entries/${entryId}/purge`,
      body: { author: TEST_AUTHOR },
    });
    expect(purged.status).toBe(200);
    expect(purged.body.purged).toBe(entryId);
    expect((await getEntry(entryId)).status).toBe(404);
    expect(await listVersions(entryId)).toEqual([]);
  }, 30000);

  it("ranks search hits by weight: title, then slug, then body", async () => {
    const collection = await createCollection({
      name: "Suche",
      slug: "suche",
      fields: [
        {
          id: "s-body",
          key: "body",
          label: "Body",
          type: "richtext",
          description: "Markdown-Body (Gewicht C).",
        },
        {
          id: "s-note",
          key: "note",
          label: "Notiz",
          type: "longText",
          description: "Wird nur gefunden, nicht gewichtet.",
        },
      ],
    });
    const collectionId = collection.body.id;
    const titleHit = await createEntry(
      collectionId,
      { title: "Zustellung heute", "s-body": "Text", "s-note": "Nichts" },
      "a-beitrag",
    );
    const slugHit = await createEntry(
      collectionId,
      { title: "Logistik", "s-body": "Text", "s-note": "Nichts" },
      "zustellung-b",
    );
    const bodyHit = await createEntry(
      collectionId,
      { title: "Logistik", "s-body": "Über die Zustellung", "s-note": "Nichts" },
      "c-beitrag",
    );
    const noteHit = await createEntry(
      collectionId,
      { title: "Logistik", "s-body": "Text", "s-note": "Zustellung intern" },
      "d-beitrag",
    );
    const unrelated = await createEntry(
      collectionId,
      { title: "Anderes", "s-body": "Text", "s-note": "Nichts" },
      "e-beitrag",
    );
    expect(unrelated.status).toBe(201);
    for (const created of [titleHit, slugHit, bodyHit, noteHit]) {
      expect((await publishEntry(created.body.id)).status).toBe(200);
    }

    const hits = await search({ q: "zustellung", collectionId });
    expect(hits.status).toBe(200);
    expect(hits.body.results.map((hit) => hit.score)).toEqual([3, 2, 1, 0]);
    expect(hits.body.results.map((hit) => hit.entry.id)).toEqual([
      titleHit.body.id,
      slugHit.body.id,
      bodyHit.body.id,
      noteHit.body.id,
    ]);

    // Multi-word queries narrow the haystack (all tokens must match).
    const multi = await search({ q: "Logistik Zustellung", collectionId });
    expect(multi.body.results.map((hit) => hit.entry.id)).toEqual([
      slugHit.body.id,
      bodyHit.body.id,
      noteHit.body.id,
    ]);

    const empty = await search({ q: "zahnarzt", collectionId });
    expect(empty.body.results).toEqual([]);

    // The list route ranks the same way when q is set.
    const listed = await listEntries(
      `?collectionId=${collectionId}&q=zustellung`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.entries[0]?.id).toBe(titleHit.body.id);
    expect(listed.body.entries[1]?.id).toBe(slugHit.body.id);
    expect(listed.body.entries[2]?.id).toBe(bodyHit.body.id);
  }, 30000);
});
