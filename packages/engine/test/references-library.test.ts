import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MANUAL_REFERENCE_MAX_BYTES } from "@senify/engine";
import { bootEngine, TEST_AUTHOR, TOKEN_AUTHOR, type BootEnv, type ErrorResponse } from "./helpers.ts";

// Header-only PNG (IHDR): the manual upload sniffs the 8-byte signature and
// reads the size at offsets 16/20, so magic plus IHDR bytes are enough.
function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function pngImage(width = 1440, height = 900): string {
  return `data:image/png;base64,${pngBytes(width, height).toString("base64")}`;
}

// Cut-down import documents: the tables the profile reader understands.
const IMPORT_DESIGN = [
  "# Achilles Design System - Token Reference",
  "",
  "Achilles is a dark-themed Framer template design system with mono typography and terminal UI.",
  "",
  "## Colors",
  "",
  "| Role | Hex | Usage |",
  "|------|-----|-------|",
  "| primary | `#00E07A` | CTAs |",
  "| background | `#141414` | Page canvas |",
  "| ink | `#FFFFFF` | Headlines |",
  "",
  "## Typography",
  "",
  "Font family: **Geist Mono, Inter**, fallback `system-ui, sans-serif`.",
  "",
  "| Style | Size | Weight | Line Height | Spacing |",
  "|-------|------|--------|-------------|---------|",
  "| Body | 14px | 400 | 1.6 | 0 |",
  "",
  "## Shape",
  "",
  "| Token | Radius | Components |",
  "|-------|--------|------------|",
  "| Base | 0px | Cards |",
  "",
].join("\n");

const IMPORT_GUIDELINES = [
  "# Achilles - Guidelines",
  "",
  "## Don'ts",
  "",
  "- Never place two green CTAs in one viewport.",
  "",
].join("\n");

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Json = Record<string, unknown>;

type CollectionBody = { collection: Json };
type ReferenceBody = { reference: Json };

type ReferenceListBody = {
  references: Json[];
  collections: Json[];
  counts: { references: number; inView: number; collections: number; styles: number };
  footer: { total: number; inView: number; query: string | null; text: string };
  styleCatalog: Json;
};

type BriefBody = {
  brief: {
    kind: string;
    text: string;
    status: string;
    referenceIds: string[];
    collectionId: string | null;
  };
  imagePrompt: string | null;
  vocabulary: string | null;
};

const EMPTY_COLLECTION = "Ohne Rezept";

describe("reference library (T14, collections and briefs)", () => {
  let env: BootEnv;
  // The fixture library: one collection, three named references. The names all
  // carry "Sort-Test" so a search isolates exactly this set.
  let werkschauId = "";
  let alpha = "";
  let beta = "";
  let zebra = "";

  beforeAll(async () => {
    env = await bootEngine();
    const collection = await env.api.request<CollectionBody>({
      method: "POST",
      path: "/api/reference-collections",
      body: {
        name: "Werkschau",
        description: "A different point of view. Saved for the right project.",
        deployFor: "Portfolios and studio sites",
        vocabulary: ["restraint", "tight tracking"],
        risk: "A direction to explore: never get loud.",
        accent: "#6346d7",
        imageStyle: "Editorial portrait of [SUBJECT], muted accent, neutral ground.",
      },
    });
    expect(collection.status).toBe(201);
    werkschauId = String(collection.body.collection.id);

    const create = async (body: Json): Promise<string> => {
      const created = await env.api.request<ReferenceBody>({
        method: "POST",
        path: "/api/references/manual",
        body: { image: pngImage(), author: TEST_AUTHOR, ...body },
      });
      expect(created.status).toBe(201);
      return String(created.body.reference.id);
    };

    alpha = await create({
      name: "Sort-Test Alpha",
      collectionId: werkschauId,
      note: "quiet grid",
      vocabulary: ["restraint"],
    });
    await delay(12);
    beta = await create({
      name: "Sort-Test Beta",
      note: "raw edges and loud type",
      vocabulary: ["raw edges"],
    });
    await delay(12);
    zebra = await create({
      name: "Sort-Test Zebra",
      collectionId: werkschauId,
      note: "calm neutral ground",
      vocabulary: ["muted accent"],
    });

    // The family is a library field of its own ("Familie" of the card).
    for (const [id, family] of [
      [alpha, "Editorial Minimalism"],
      [beta, "Neo Brutalism"],
      [zebra, "Editorial Minimalism"],
    ] as [string, string][]) {
      const patched = await env.api.request<ReferenceBody>({
        method: "PATCH",
        path: `/api/references/${id}`,
        body: { family },
      });
      expect(patched.status).toBe(200);
      expect(patched.body.reference.family).toBe(family);
    }
  });

  afterAll(async () => {
    await env.close();
  });

  async function list(query = ""): Promise<ReferenceListBody> {
    const response = await env.api.request<ReferenceListBody>({
      method: "GET",
      path: `/api/references${query === "" ? "" : `?${query}`}`,
    });
    expect(response.status).toBe(200);
    return response.body;
  }

  // The seed runs first: it counts what is already there, so an earlier style
  // collection would show up as "existing" instead of a fresh family.
  it("seeds the style families once and never overwrites them", async () => {
    const first = await env.api.request<{
      seed: { created: number; existing: number; total: number };
      styleCatalog: Json;
    }>({ method: "POST", path: "/api/reference-collections/styles" });
    expect(first.status).toBe(201);
    expect(first.body.seed).toEqual({ created: 18, existing: 0, total: 18 });
    expect(first.body.styleCatalog.total).toBe(18);
    expect(String(first.body.styleCatalog.license)).toContain("MIT");
    expect(String(first.body.styleCatalog.source)).toContain("styles.json");
    expect(String(first.body.styleCatalog.description)).toContain(
      "standard aesthetic families",
    );

    const seeded = await env.api.request<{ collections: Json[] }>({
      method: "GET",
      path: "/api/reference-collections?kind=style",
    });
    expect(seeded.body.collections).toHaveLength(18);
    expect(seeded.body.collections.every((entry) => entry.kind === "style")).toBe(true);
    expect(
      (seeded.body.collections as { position: number }[]).map((entry) => entry.position),
    ).toEqual([...Array(18).keys()]);
    const editorial = seeded.body.collections.find(
      (entry) => entry.externalId === "editorial-minimalism",
    );
    expect(editorial?.name).toBe("Editorial Minimalism");
    expect((editorial?.recognize as string[]).length).toBeGreaterThan(0);
    expect((editorial?.vocabulary as string[]).length).toBeGreaterThan(0);
    expect((editorial?.examples as Json[]).length).toBeGreaterThan(0);
    expect((editorial?.deployFor as string).length).toBeGreaterThan(0);
    expect((editorial?.imageStyle as string).length).toBeGreaterThan(0);
    expect((editorial?.risk as string).length).toBeGreaterThan(0);
    expect(editorial?.referenceCount).toBe(0);

    // Ownership stays with the collection: a rename is left alone.
    const renamed = await env.api.request<CollectionBody>({
      method: "PATCH",
      path: `/api/reference-collections/${String(editorial?.id)}`,
      body: { name: "Editorial Ruhe" },
    });
    expect(renamed.body.collection.name).toBe("Editorial Ruhe");

    const before = (await env.api.request<{ collections: Json[] }>({
      method: "GET",
      path: "/api/reference-collections?kind=style",
    })).body.collections;

    const second = await env.api.request<{ seed: Json }>({
      method: "POST",
      path: "/api/reference-collections/styles",
    });
    expect(second.body.seed).toEqual({ created: 0, existing: 18, total: 18 });

    const after = (await env.api.request<{ collections: Json[] }>({
      method: "GET",
      path: "/api/reference-collections?kind=style",
    })).body.collections;
    // Idempotent: the second run does not touch a single row.
    expect(after.map((entry) => [entry.id, entry.name, entry.updatedAt])).toEqual(
      before.map((entry) => [entry.id, entry.name, entry.updatedAt]),
    );
    expect(
      after.find((entry) => entry.externalId === "editorial-minimalism")?.name,
    ).toBe("Editorial Ruhe");
  }, 30000);

  it("creates, edits and deletes a collection without losing its references", async () => {
    const created = await env.api.request<CollectionBody>({
      method: "POST",
      path: "/api/reference-collections",
      body: {
        name: "Editorial Studio",
        description: "A different point of view. Saved for the right project.",
        deployFor: "Portfolios and studio sites",
        vocabulary: ["restraint", "tight tracking"],
        risk: "A direction to explore.",
        accent: "#6346d7",
        imageStyle: "Editorial portrait of [SUBJECT].",
      },
    });
    expect(created.status).toBe(201);
    const collection = created.body.collection;
    expect(collection.kind).toBe("collection");
    expect(collection.referenceCount).toBe(0);
    expect(collection.externalId).toBeNull();
    expect(collection.warning).toBeNull();
    expect(collection.recognize).toEqual([]);
    expect(collection.examples).toEqual([]);
    const collectionId = String(collection.id);

    // An unknown kind and an empty name are rejected, nothing is stored.
    const badKind = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/reference-collections",
      body: { name: "Falsche Art", kind: "moodboard" },
    });
    expect(badKind.status).toBe(400);
    expect(badKind.body.error.field).toBe("kind");

    const stored = await env.api.request<{ reference: Json }>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name: "Nordlicht Portfolio",
        collectionId,
        note: "Ruhe und Praezision",
        image: pngImage(),
        author: TEST_AUTHOR,
      },
    });
    expect(stored.status).toBe(201);
    expect(stored.body.reference.collectionId).toBe(collectionId);
    expect((stored.body.reference.collection as Json).name).toBe("Editorial Studio");
    const referenceId = String(stored.body.reference.id);

    // A mistyped collection id is an error, not a silent detach.
    const mistyped = await env.api.request<ErrorResponse>({
      method: "PATCH",
      path: `/api/references/${referenceId}`,
      body: { collectionId: "does-not-exist" },
    });
    expect(mistyped.status).toBe(404);
    expect(mistyped.body.error.field).toBe("collectionId");

    // The counter of the sidebar counts the assigned references.
    const listed = await env.api.request<{ collections: Json[] }>({
      method: "GET",
      path: "/api/reference-collections",
    });
    const withReference = listed.body.collections.find(
      (entry) => entry.id === collectionId,
    );
    expect(withReference?.referenceCount).toBe(1);
    expect(
      listed.body.collections.find((entry) => entry.id === werkschauId)?.referenceCount,
    ).toBe(2);

    // Renaming keeps everything else and the counter.
    const renamed = await env.api.request<CollectionBody>({
      method: "PATCH",
      path: `/api/reference-collections/${collectionId}`,
      body: { name: "Editorial Studio Nord", accent: "#4b2fbf" },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.collection.name).toBe("Editorial Studio Nord");
    expect(renamed.body.collection.accent).toBe("#4b2fbf");
    expect(renamed.body.collection.referenceCount).toBe(1);
    expect(renamed.body.collection.description).toContain("A different point of view");

    const emptyName = await env.api.request<ErrorResponse>({
      method: "PATCH",
      path: `/api/reference-collections/${collectionId}`,
      body: { name: "   " },
    });
    expect(emptyName.status).toBe(400);
    expect(emptyName.body.error.field).toBe("name");

    // Deleting the collection keeps the reference and reports the affected rows.
    const deleted = await env.api.request<{ deleted: string; affectedReferences: number }>({
      method: "DELETE",
      path: `/api/reference-collections/${collectionId}`,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(collectionId);
    expect(deleted.body.affectedReferences).toBe(1);

    const after = await env.api.request<Json>({
      method: "GET",
      path: `/api/references/${referenceId}`,
    });
    expect(after.status).toBe(200);
    expect(after.body.name).toBe("Nordlicht Portfolio");
    expect(after.body.collectionId).toBeNull();
    expect(after.body.collection).toBeNull();

    // It shows up in the "without collection" view of the sidebar.
    const orphans = await list(`collection=none&q=Nordlicht`);
    expect(orphans.references.map((entry) => entry.id)).toEqual([referenceId]);

    const gone = await env.api.request<ErrorResponse>({
      method: "DELETE",
      path: `/api/reference-collections/${collectionId}`,
    });
    expect(gone.status).toBe(404);
    expect(gone.body.error.field).toBe("collectionId");
  });

  it("filters by collection, searches title, family, note, vocabulary and collection name", async () => {
    const all = await list("q=Sort-Test");
    expect(all.references).toHaveLength(3);

    // Title, case-insensitive.
    expect((await list("q=sort-test ze")).references.map((entry) => entry.id)).toEqual([
      zebra,
    ]);
    // Note.
    expect((await list("q=quiet grid")).references.map((entry) => entry.id)).toEqual([
      alpha,
    ]);
    // Vocabulary of the reference.
    expect((await list("q=raw edges")).references.map((entry) => entry.id)).toEqual([
      beta,
    ]);
    // Family of the reference.
    expect((await list("q=Neo Brutalism")).references.map((entry) => entry.id)).toEqual([
      beta,
    ]);
    // Collection name reaches every reference of that collection.
    expect(
      (await list("q=Werkschau")).references.map((entry) => entry.id).sort(),
    ).toEqual([alpha, zebra].sort());

    // The collection filter, "none" for references without a collection.
    expect(
      (await list(`collection=${werkschauId}&q=Sort-Test`)).references.map(
        (entry) => entry.id,
      ),
    ).toEqual([zebra, alpha]);
    expect(
      (await list("collection=none&q=Sort-Test")).references.map((entry) => entry.id),
    ).toEqual([beta]);

    // A mistyped collection id and a mistyped sort are errors.
    const unknownCollection = await env.api.request<ErrorResponse>({
      method: "GET",
      path: "/api/references?collection=does-not-exist",
    });
    expect(unknownCollection.status).toBe(404);
    const unknownSort = await env.api.request<ErrorResponse>({
      method: "GET",
      path: "/api/references?sort=oldest",
    });
    expect(unknownSort.status).toBe(400);
    expect(unknownSort.body.error.field).toBe("sort");

    // "Name A-Z" and "Newest first" of the toolbar.
    expect(
      (await list("q=Sort-Test&sort=name")).references.map((entry) => entry.name),
    ).toEqual(["Sort-Test Alpha", "Sort-Test Beta", "Sort-Test Zebra"]);
    expect(
      (await list("q=Sort-Test&sort=newest")).references.map((entry) => entry.name),
    ).toEqual(["Sort-Test Zebra", "Sort-Test Beta", "Sort-Test Alpha"]);

    // The family filter of the toolbar stays intact.
    expect(
      (await list("family=Neo%20Brutalism")).references.map((entry) => entry.id),
    ).toEqual([beta]);
    expect(
      (await list("status=analyzing")).references.map((entry) => entry.id),
    ).toEqual([]);
  });

  it("counts the library and words the footer line", async () => {
    const filtered = await list("q=Sort-Test");
    expect(filtered.counts.inView).toBe(3);
    expect(filtered.footer.query).toBe("Sort-Test");
    expect(filtered.footer.text).toBe("3 references matching “Sort-Test”");

    const unfiltered = await list();
    expect(unfiltered.footer.query).toBeNull();
    expect(unfiltered.footer.text).toBe(
      `${unfiltered.references.length} references in view`,
    );
    expect(unfiltered.counts.inView).toBe(unfiltered.references.length);
    expect(unfiltered.counts.references).toBe(unfiltered.footer.total);
    expect(unfiltered.counts.collections).toBe(unfiltered.collections.length);
    expect(unfiltered.counts.styles).toBe(
      unfiltered.collections.filter((entry) => entry.kind === "style").length,
    );
    // The style guide header travels with the list.
    expect(unfiltered.styleCatalog.total).toBe(18);
    expect(String(unfiltered.styleCatalog.license)).toContain("MIT");
  });

  it("stores a manual reference and rejects invalid uploads", async () => {
    const stored = await env.api.request<ReferenceBody>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name: "  Handbuch Seite  "
        ,
        note: "  Grosszuegige Ränder  ",
        vocabulary: ["restraint", " restraint ", "tight tracking"],
        imageRecipe: "Studio shot of [SUBJECT].",
        heroUsage: "Full-bleed to the left.",
        image: pngImage(1200, 640),
        author: TEST_AUTHOR,
      },
    });
    expect(stored.status).toBe(201);
    const reference = stored.body.reference;
    expect(reference.name).toBe("Handbuch Seite");
    expect(reference.origin).toBe("manual");
    expect(reference.method).toBe("manual");
    expect(reference.status).toBe("ready");
    expect(reference.stage).toBe("ready");
    expect(reference.progress).toBe(100);
    expect(reference.sourceUrl).toBe("");
    expect(reference.profile).toBeNull();
    expect(reference.note).toBe("Grosszuegige Ränder");
    expect(reference.vocabulary).toEqual(["restraint", "tight tracking"]);
    expect(reference.imageRecipe).toBe("Studio shot of [SUBJECT].");
    expect(reference.heroUsage).toBe("Full-bleed to the left.");
    expect(reference.usedInProjects).toEqual([]);
    const snapshots = reference.snapshots as {
      breakpoint: string;
      kind: string;
      width: number;
      height: number;
      previewPath?: string;
    }[];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.breakpoint).toBe("manual");
    expect(snapshots[0]?.kind).toBe("fullpage");
    expect(snapshots[0]?.width).toBe(1200);
    expect(snapshots[0]?.height).toBe(640);
    expect(snapshots[0]?.previewPath).toBe(
      `/api/references/${String(reference.id)}/snapshots/manual-fullpage-1.png`,
    );
    expect((reference.provenance as Json).method).toBe("manual");
    expect((reference.provenance as Json).author).toEqual(TOKEN_AUTHOR);

    const wrongType = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name: "Kein Bild",
        image: `data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`,
        author: TEST_AUTHOR,
      },
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.category).toBe("validation");
    expect(wrongType.body.error.field).toBe("image");
    expect(wrongType.body.error.message).toContain("PNG, JPEG und WebP");

    // One byte over the cap of the reference library (20 MB).
    const oversized = Buffer.alloc(MANUAL_REFERENCE_MAX_BYTES + 1);
    oversized.writeUInt32BE(0x89504e47, 0);
    oversized.writeUInt32BE(0x0d0a1a0a, 4);
    const tooLarge = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/manual",
      body: { name: "Zu gross", image: oversized.toString("base64"), author: TEST_AUTHOR },
    });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.field).toBe("image");
    expect(tooLarge.body.error.message).toContain("zu groß");

    const noName = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/manual",
      body: { image: pngImage(), author: TEST_AUTHOR },
    });
    expect(noName.status).toBe(400);
    expect(noName.body.error.field).toBe("name");

    // Since ticket 18 the token carries the identity; the body author is a
    // suggestion and may be omitted entirely.
    const noAuthor = await env.api.request<ReferenceBody>({
      method: "POST",
      path: "/api/references/manual",
      body: { name: "Ohne Autor", image: pngImage() },
    });
    expect(noAuthor.status).toBe(201);

    const noImage = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/manual",
      body: { name: "Ohne Bild", author: TEST_AUTHOR },
    });
    expect(noImage.status).toBe(400);
    expect(noImage.body.error.field).toBe("image");

    const brokenBase64 = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/manual",
      body: { name: "Kaputt", image: "das ist kein base64!", author: TEST_AUTHOR },
    });
    expect(brokenBase64.status).toBe(400);
    expect(brokenBase64.body.error.field).toBe("image");
    expect(brokenBase64.body.error.message).toContain("Base64");
  }, 30000);

  it("stores an imported reference with documents, mobile shot and profile", async () => {
    const imported = await env.api.request<ReferenceBody>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name: "Import-Test Achilles",
        sourceUrl: "https://getachilles.framer.ai/",
        family: "Dev-Tool / KI",
        note: "AI SaaS template von Arthur Duchesne",
        capturedAt: "2026-09-19T00:00:00.000Z",
        documents: {
          design: IMPORT_DESIGN,
          guidelines: IMPORT_GUIDELINES,
          components: "## Actions\n\n### Button (Primary)\n",
        },
        image: pngImage(1920, 1080),
        imageMobile: pngImage(360, 800),
        author: TEST_AUTHOR,
      },
    });
    expect(imported.status).toBe(201);
    const reference = imported.body.reference;
    expect(reference.sourceUrl).toBe("https://getachilles.framer.ai/");
    expect(reference.documents).toEqual({
      design: IMPORT_DESIGN,
      guidelines: IMPORT_GUIDELINES,
      components: "## Actions\n\n### Button (Primary)\n",
    });
    const snapshots = reference.snapshots as { breakpoint: string; previewPath?: string }[];
    expect(snapshots.map((entry) => entry.breakpoint)).toEqual(["manual", "mobile"]);
    expect(snapshots[1]?.previewPath).toBe(
      `/api/references/${String(reference.id)}/snapshots/mobile-fullpage-2.png`,
    );
    expect((reference.provenance as Json).note).toContain("Design-Dokumenten");

    // The profile is read out of the documents, so theme derivation works
    // without a live capture.
    const profile = reference.profile as {
      tokens: { color: Json[]; type: Json[]; radius: Json[]; families: Json[] };
      rules: { constants: string[]; never: string[] };
      styleBrief: string;
      reduced: boolean;
    };
    expect(profile.reduced).toBe(false);
    expect(profile.tokens.color).toHaveLength(3);
    expect((profile.tokens.type[0] as Json).role).toBe("body");
    expect((profile.tokens.radius[0] as Json).value).toBe("0px");
    expect((profile.tokens.families[0] as Json).value).toBe("Geist Mono");
    expect(profile.rules.never).toEqual(["Never place two green CTAs in one viewport."]);
    expect(profile.styleBrief).toContain("https://getachilles.framer.ai/");
    expect(reference.evidence).toHaveLength(7);
    expect((reference.evidence as Json[])[0]?.claim).toBe("color.primary = #00E07A");
    expect(reference.revision).toBe(1);

    // The revision carries the note of the reader.
    const revisions = await env.api.request<{ revisions: { note: string | null }[] }>({
      method: "GET",
      path: `/api/references/${String(reference.id)}/revisions`,
    });
    expect(revisions.body.revisions[0]?.note).toBe("Aus Design.md gelesen");

    // A second import run refreshes the documents over the same route.
    const refreshed = await env.api.request<ReferenceBody>({
      method: "PATCH",
      path: `/api/references/${String(reference.id)}`,
      body: {
        sourceUrl: "https://getachilles.framer.ai/updated",
        documents: { design: IMPORT_DESIGN, guidelines: null, components: null },
      },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.reference.sourceUrl).toBe("https://getachilles.framer.ai/updated");
    expect(refreshed.body.reference.documents).toEqual({
      design: IMPORT_DESIGN,
      guidelines: null,
      components: null,
    });

    // The list stays lean: documents reach the detail view only.
    const listed = await list("q=Achilles");
    const card = listed.references.find((entry) => entry.id === reference.id);
    expect(card).toBeDefined();
    expect(card?.documents).toBeUndefined();
  }, 30000);

  it("builds the single, combined, collection and style brief", async () => {
    const single = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/references/${alpha}/brief`,
    });
    expect(single.status).toBe(200);
    const brief = single.body.brief;
    expect(brief.kind).toBe("reference");
    expect(brief.referenceIds).toEqual([alpha]);
    expect(brief.collectionId).toBe(werkschauId);
    expect(brief.text).toContain("Reference: Sort-Test Alpha");
    expect(brief.text).toContain(
      `Screenshot: /api/references/${alpha}/snapshots/manual-fullpage-1.png`,
    );
    // The family of the reference carries the collection as the aesthetic.
    expect(brief.text).toContain("Aesthetic: Editorial Minimalism (Werkschau)");
    expect(brief.text).toContain("Vocabulary: restraint");
    expect(brief.text).toContain("What to borrow: quiet grid");
    expect(brief.text).toContain("Composition: Use the reference image for composition.");
    // The recipe of the collection steps in when the reference has none.
    expect(brief.text).toContain("Image recipe: Editorial portrait of [SUBJECT]");
    expect(brief.status).toBe("Reference-led brief · House DNA is off.");

    // The image prompt of the same reference, built from the same fallbacks.
    expect(single.body.imagePrompt).toContain("Editorial portrait of [SUBJECT]");
    expect(single.body.imagePrompt).toContain("Composition: Use the reference composition.");
    expect(single.body.imagePrompt).toContain(
      `Use /api/references/${alpha}/snapshots/manual-fullpage-1.png as a style reference.`,
    );
    expect(single.body.vocabulary).toBeNull();

    // A reference without a collection falls back to the empty defaults.
    const orphan = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/references/${beta}/brief`,
    });
    expect(orphan.body.brief.text).toContain("Aesthetic: Neo Brutalism");
    expect(orphan.body.brief.text).toContain("What to borrow: raw edges and loud type");
    expect(orphan.body.imagePrompt).toBeNull();

    const combined = await env.api.request<BriefBody>({
      method: "POST",
      path: "/api/references/brief",
      body: { referenceIds: [alpha, beta] },
    });
    expect(combined.status).toBe(200);
    expect(combined.body.brief.kind).toBe("reference");
    expect(combined.body.brief.referenceIds).toEqual([alpha, beta]);
    expect(combined.body.brief.collectionId).toBe(werkschauId);
    expect(combined.body.brief.text).toContain("Reference: Sort-Test Alpha");
    expect(combined.body.brief.text).toContain("Reference: Sort-Test Beta");
    // Several references are a set, never a blend.
    expect(combined.body.brief.text).toContain(
      "Use these as a reference set. If they represent different aesthetics, create one direction per reference before choosing one; do not automatically blend them.",
    );
    expect(combined.body.imagePrompt).toBeNull();

    const emptyBrief = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/references/brief",
      body: { referenceIds: [] },
    });
    expect(emptyBrief.status).toBe(400);

    // The collection brief: head with name, description, vocabulary and the
    // direction to explore, then the entry briefs of all its references.
    const collectionBrief = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/reference-collections/${werkschauId}/brief`,
    });
    expect(collectionBrief.status).toBe(200);
    expect(collectionBrief.body.brief.kind).toBe("collection");
    expect(collectionBrief.body.brief.collectionId).toBe(werkschauId);
    expect(collectionBrief.body.brief.text).toContain("Collection: Werkschau");
    expect(collectionBrief.body.brief.text).toContain(
      "A different point of view. Saved for the right project.",
    );
    expect(collectionBrief.body.brief.text).toContain(
      "Vocabulary: restraint, tight tracking",
    );
    expect(collectionBrief.body.brief.text).toContain(
      "Direction to explore: A direction to explore: never get loud.",
    );
    // The references of the collection follow with their own sections; a
    // reference of another collection stays out.
    expect(collectionBrief.body.brief.text).toContain("Reference: Sort-Test Alpha");
    expect(collectionBrief.body.brief.text).toContain(
      "Aesthetic: Editorial Minimalism (Werkschau)",
    );
    expect(collectionBrief.body.brief.text).toContain("Reference: Sort-Test Zebra");
    expect(collectionBrief.body.brief.text).not.toContain("Reference: Sort-Test Beta");
    // The style lines belong to the style brief, not to a plain collection.
    expect(collectionBrief.body.brief.text).not.toContain("Image direction:");
    expect(collectionBrief.body.vocabulary).toBe("restraint, tight tracking");
    expect(collectionBrief.body.imagePrompt).toBeNull();

    // A bare collection: a name only, so description and direction drop out and
    // the brief stays one clean block without empty lines.
    const bare = await env.api.request<CollectionBody>({
      method: "POST",
      path: "/api/reference-collections",
      body: { name: EMPTY_COLLECTION },
    });
    const bareBrief = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/reference-collections/${String(bare.body.collection.id)}/brief`,
    });
    expect(bareBrief.body.brief.text).toContain(`Collection: ${EMPTY_COLLECTION}`);
    expect(bareBrief.body.brief.text).toContain(
      "Build [describe the website or product] for [audience].",
    );
    expect(bareBrief.body.brief.text).not.toContain("Vocabulary:");
    expect(bareBrief.body.brief.text).not.toContain("References:");
    expect(bareBrief.body.brief.text).not.toContain("Direction to explore:");
    expect(bareBrief.body.brief.text).not.toContain("\n\n\n");

    // A style family is a collection of kind "style" and briefs from the style
    // guide instead of listing entry sections.
    const style = await env.api.request<CollectionBody>({
      method: "POST",
      path: "/api/reference-collections",
      body: {
        name: "Neo Brutalism",
        kind: "style",
        recognize: ["raw edges", "loud type"],
        examples: [{ name: "linear.app", url: "https://linear.app" }],
        warning: "Nur sparsam einsetzen.",
      },
    });
    expect(style.body.collection.kind).toBe("style");
    const styleBrief = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/reference-collections/${String(style.body.collection.id)}/brief`,
    });
    expect(styleBrief.body.brief.text).toContain("Build [project] for [audience].");
    expect(styleBrief.body.brief.text).toContain("Aesthetic: Neo Brutalism");
    expect(styleBrief.body.brief.text).toContain(
      "References: linear.app https://linear.app",
    );
    expect(styleBrief.body.brief.text).toContain(
      "Image direction: Use type and layout to lead.",
    );
    expect(styleBrief.body.brief.text).toContain(
      "Implement as a responsive interface and verify desktop and mobile in a browser.",
    );

    const missing = await env.api.request<ErrorResponse>({
      method: "GET",
      path: "/api/reference-collections/does-not-exist/brief",
    });
    expect(missing.status).toBe(404);
  });

  it("keeps the House DNA block behind the switch of the preferences", async () => {
    const off = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/references/${alpha}/brief`,
    });
    expect(off.body.brief.text).not.toContain("General preferences");

    const saved = await env.api.request<{
      referenceDna: Json;
      referencePreferences: Json;
    }>({
      method: "PUT",
      path: "/api/settings",
      body: {
        referenceDna: {
          name: "Haus-DNA",
          description: "Die Grundsaetze unter jeder Sammlung.",
          constants: ["Body copy stays left aligned."],
          never: ["Full-bleed stock photos"],
        },
        referencePreferences: {
          includeDna: true,
          overrides: "Fuer dieses Projekt: ruhig bleiben.",
        },
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.referencePreferences.includeDna).toBe(true);
    expect(saved.body.referenceDna.constants).toEqual([
      "Body copy stays left aligned.",
    ]);

    const on = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/references/${alpha}/brief`,
    });
    expect(on.body.brief.text).toContain(
      "General preferences (defaults, not absolute rules):",
    );
    expect(on.body.brief.text).toContain("- Body copy stays left aligned.");
    expect(on.body.brief.text).toContain("Usually avoid: Full-bleed stock photos.");
    expect(on.body.brief.text).toContain(
      "Project-specific directions (take priority):\nFuer dieses Projekt: ruhig bleiben.",
    );
    expect(on.body.brief.status).toBe(
      "Includes your general preferences. Project notes included.",
    );

    const withoutDna = await env.api.request<{ referencePreferences: Json }>({
      method: "PUT",
      path: "/api/settings",
      body: { referencePreferences: { includeDna: false } },
    });
    expect(withoutDna.status).toBe(200);
    expect(withoutDna.body.referencePreferences.includeDna).toBe(false);
    // The project notes survive the switch and keep their own hint.
    const notesOnly = await env.api.request<BriefBody>({
      method: "GET",
      path: `/api/references/${alpha}/brief`,
    });
    expect(notesOnly.body.brief.text).not.toContain("General preferences");
    expect(notesOnly.body.brief.text).toContain(
      "Project-specific directions (take priority):",
    );
    expect(notesOnly.body.brief.status).toBe(
      "Reference-led brief · House DNA is off. Project notes included.",
    );
  });
});
