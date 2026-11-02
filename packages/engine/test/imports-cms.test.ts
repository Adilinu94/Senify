import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listenReachable } from "@senify/core/net";
import { readCmsCollections } from "@senify/framer-import";
import {
  FIELD_TYPES,
  SUPPORTS_FLAGS,
  type Collection,
  type Entry,
} from "../src/types.ts";
import {
  bootEngine,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// Das CMS-Mapping am Projekt-Import (ADR-0028, Block 4). Gelesen werden die
// Antworten von getCMSCollections und getCMSItems. Was hier zaehlt:
// - Der Bericht nennt je Sammlung, ob sie angelegt wird oder schon besteht,
//   und wie viele Felder Senify abbilden kann.
// - Die Sammlungen entstehen im selben Commit wie die Seite (kein halbes
//   Schema); ein Fehler in der CMS-Antwort schreibt gar nichts.
// - Eine vorhandene Sammlung bleibt unberuehrt, auch wenn dieselbe Antwort
//   auf eine zweite Seite geht.
// - Was Senify nicht halten kann (Auswahl ohne Optionen, fehlendes
//   Verweisziel, unbekannter Typ), faellt mit einem Fund weg statt still.
// - Eintraege landen als Drafts (Version 1) in denselben Commit. Ein Slug,
//   den die Sammlung schon hat, bleibt unberuehrt; Dubletten in derselben
//   Antwort bekommen -2, -3. Verweise loesen ueber die Framer-Id des
//   Eintrags auf, auch ueber die Antwort einer anderen Sammlung hinweg.

type ImportResponse = {
  job: { id: string; status: string; sourceKind: string };
  report: {
    dryRun: boolean;
    replayed: boolean;
    receiptId: string | null;
    pageId: string | null;
    newDraftVersion: number | null;
    findings: { kind: string; severity: string; message: string }[];
    steps: string[];
    cms?: {
      collections: {
        name: string;
        slug: string;
        fields: number;
        outcome: "create" | "existing";
      }[];
      fields: { mapped: number; dropped: number };
      items?: { planned: number; imported: number; existing: number; dropped: number };
      media?: { planned: number; downloaded: number; failed: number; skipped: number };
    };
  };
};

const PROJECT_XML = `<Project name="Mini">
  <Pages><Page nodeId="page-home" path="/" /></Pages>
  <TextStyles>
    <TextStyle path="/Heading/H1" tag="h1" fontSize="64px" lineHeight="1.1" />
  </TextStyles>
</Project>`;

const PAGE_XML = `<Page nodeId="page-home" path="/">
  <Container nodeId="hero" layout="stack" stackDirection="vertical" gap="16px">
    <Heading nodeId="title" inlineTextStyle="/Heading/H1" text="CMS aus dem Projekt" />
  </Container>
</Page>`;

// Zwei Sammlungen mit gegenseitigen Verweisen: Blog -> Team und Team -> Blog.
// So deckt der Test die Vorwaerts- wie die Rueckwaerts-Aufloesung ab.
const CMS_JSON = JSON.stringify([
  {
    id: "col-blog",
    name: "Blog",
    items: [{ id: "1" }, { id: "2" }],
    fields: [
      { id: "f-title", name: "Titel", type: "string", required: true },
      { id: "f-body", name: "Text", type: "string", multiline: true },
      {
        id: "f-tags",
        name: "Tags",
        type: "enum",
        cases: [
          { id: "a", name: "Architektur" },
          { id: "d", name: "Design" },
        ],
      },
      { id: "f-cover", name: "Bild", type: "image" },
      { id: "f-author", name: "Autor", type: "collectionReference", collectionId: "col-team" },
    ],
  },
  {
    id: "col-team",
    name: "Team",
    fields: [
      { id: "f-name", name: "Name", type: "string" },
      {
        id: "f-projects",
        name: "Projekte",
        type: "multiCollectionReference",
        collectionId: "col-blog",
      },
    ],
  },
]);

const LOSSY_CMS_JSON = JSON.stringify([
  {
    id: "col-katalog",
    name: "Katalog",
    fields: [
      { id: "f-title", name: "Titel", type: "string" },
      { id: "f-tags", name: "Tags", type: "enum" },
      { id: "f-author", name: "Autor", type: "collectionReference", collectionId: "col-fehlt" },
      { id: "f-weight", name: "Gewicht", type: "richNumber" },
    ],
  },
]);

const projectSource = (cms?: string, cmsItems?: string | string[]) => ({
  project: {
    xml: PROJECT_XML,
    pageXml: PAGE_XML,
    page: "/",
    usage: "private" as const,
    ...(cms === undefined
      ? {}
      : { cms: { collections: cms, ...(cmsItems === undefined ? {} : { items: cmsItems }) } }),
  },
});

// Die Eintraege in der am 02.11.2026 gemessenen Form: reines JSON mit
// fieldData als { type, value }, die Sammlung nur im message-Text. Zwei
// Antworten, weil getCMSItems je Sammlung antwortet; der Verweis von Blog
// auf Team loest deshalb nur auf, wenn beide Antworten in einem Lauf ankommen.
const itemsAnswers = (coverUrl: string | null) => [
  JSON.stringify({
    message: 'Retrieved 2 of 2 item(s) from collection "Blog"',
    pagination: { total: 2, skip: 0, limit: 100, returned: 2 },
    items: [
      {
        id: "blog-1",
        slug: "erster-beitrag",
        draft: false,
        fieldData: {
          "f-title": { type: "string", value: "Erster Beitrag" },
          "f-body": { type: "string", value: "Ein langer Text aus Framer." },
          "f-tags": { type: "enum", value: "Design" },
          ...(coverUrl === null
            ? {}
            : { "f-cover": { type: "image", value: coverUrl } }),
          "f-author": { type: "collectionReference", value: "team-1" },
        },
      },
      {
        id: "blog-2",
        slug: "zweiter-beitrag",
        draft: true,
        fieldData: {
          "f-title": { type: "string", value: "Zweiter Beitrag" },
          "f-tags": { type: "enum", value: "Architektur" },
        },
      },
    ],
  }),
  JSON.stringify({
    message: 'Retrieved 1 of 1 item(s) from collection "Team"',
    items: [
      {
        id: "team-1",
        slug: "anna",
        fieldData: { "f-name": { type: "string", value: "Anna" } },
      },
    ],
  }),
];

const DATE_CMS_JSON = JSON.stringify([
  {
    id: "col-date",
    name: "Termine",
    fields: [{ id: "f-date", name: "Datum", type: "date" }],
  },
]);

const DATE_ITEMS_JSON = JSON.stringify({
  message: 'Retrieved 1 of 1 item(s) from collection "Termine"',
  items: [
    {
      id: "date-1",
      slug: "termin-eins",
      fieldData: { "f-date": { type: "date", value: "2026-10-20T00:00:00.000Z" } },
    },
  ],
});

let env: BootEnv;
let siteId: string;
let entrySiteId: string;

beforeAll(async () => {
  env = await bootEngine();
  const site = await createTestSite(env.api, "CMS Werk");
  siteId = site.id;
});

afterAll(async () => {
  await env.close();
});

async function runImport(
  body: Record<string, unknown>,
  site = siteId,
): Promise<{ status: number; body: ImportResponse & ErrorResponse }> {
  return env.api.request<ImportResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${site}/imports/framer`,
    body,
  });
}

async function listCollections(site = siteId): Promise<Collection[]> {
  const response = await env.api.request<{ collections: Collection[] }>({
    method: "GET",
    path: `/api/sites/${site}/collections`,
  });
  expect(response.status).toBe(200);
  return response.body.collections;
}

async function listEntries(site = entrySiteId): Promise<Entry[]> {
  const response = await env.api.request<{ entries: Entry[] }>({
    method: "GET",
    path: `/api/sites/${site}/entries`,
  });
  expect(response.status).toBe(200);
  return response.body.entries;
}

describe("CMS-Mapping am Framer-Projekt", () => {
  it("dry run: nennt Sammlungen, Feldzahl und Funde, ohne zu schreiben", async () => {
    const response = await runImport({ source: projectSource(CMS_JSON) });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const report = response.body.report;
    expect(report.dryRun).toBe(true);
    expect(report.cms).toEqual({
      collections: [
        { name: "Blog", slug: "blog", fields: 5, outcome: "create" },
        { name: "Team", slug: "team", fields: 2, outcome: "create" },
      ],
      fields: { mapped: 7, dropped: 0 },
    });
    // Eintraege sind in diesem Schritt nicht Teil des Imports; der Fund sagt es.
    expect(
      report.findings.some((finding) => finding.kind === "cms-items-not-imported"),
    ).toBe(true);
    expect(report.steps.at(-1)).toContain("7 Felder abgebildet, 0 verworfen");
    expect(await listCollections()).toEqual([]);
  });

  it("write: legt beide Sammlungen mit Titelfeld und aufgeloesten Verweisen an", async () => {
    const response = await runImport({
      source: projectSource(CMS_JSON),
      write: true,
      pagePath: "/cms",
      assets: "skip",
      fonts: "skip",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.replayed).toBe(false);
    expect(response.body.report.cms?.collections.map((entry) => entry.outcome)).toEqual([
      "create",
      "create",
    ]);

    const collections = await listCollections();
    // Die Liste ordnet nach created_at und Id, nicht nach Einfuegereihenfolge.
    expect(collections.map((collection) => collection.slug).sort()).toEqual(["blog", "team"]);
    const blog = collections.find((collection) => collection.slug === "blog");
    const team = collections.find((collection) => collection.slug === "team");
    expect(blog).toBeDefined();
    expect(team).toBeDefined();
    if (blog === undefined || team === undefined) return;

    // Jede Senify-Sammlung traegt das eingebaute Titelfeld als erstes Feld.
    expect(blog.titleField).toBe("title");
    expect(blog.fields[0]).toMatchObject({ id: "title", key: "title", type: "text" });
    expect(blog.supports).toEqual([...SUPPORTS_FLAGS]);
    expect(blog.listColumns).toEqual([]);

    const byKey = (collection: Collection) =>
      new Map(collection.fields.map((field) => [field.key, field]));
    const blogFields = byKey(blog);
    expect(blogFields.get("titel")).toMatchObject({ type: "text", required: true });
    // Ein mehrzeiliger String wird zum langen Text, kein eigener Typ.
    expect(blogFields.get("text")?.type).toBe("longText");
    expect(blogFields.get("tags")).toMatchObject({
      type: "select",
      options: [
        { value: "a", label: "Architektur" },
        { value: "d", label: "Design" },
      ],
    });
    expect(blogFields.get("bild")).toMatchObject({ type: "media", mediaKind: "image" });
    // Der Verweis auf "col-team" zeigt auf die Id, die Team in diesem Lauf bekam.
    expect(blogFields.get("autor")).toMatchObject({
      type: "relation",
      targetCollections: [team.id],
    });
    expect(byKey(team).get("projekte")).toMatchObject({
      type: "relationMulti",
      targetCollections: [blog.id],
    });
  });

  it("derselbe Auftrag spielt den Receipt und legt die Sammlungen nicht doppelt an", async () => {
    const first = await runImport({
      source: projectSource(CMS_JSON),
      write: true,
      pagePath: "/cms",
      assets: "skip",
      fonts: "skip",
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.report.replayed).toBe(true);

    const collections = await listCollections();
    expect(collections.map((collection) => collection.slug).sort()).toEqual(["blog", "team"]);
  });

  it("dieselbe Antwort auf einer zweiten Seite: vorhandene Sammlungen bleiben unberuehrt", async () => {
    const before = await listCollections();
    const response = await runImport({
      source: projectSource(CMS_JSON),
      write: true,
      pagePath: "/cms-zwei",
      assets: "skip",
      fonts: "skip",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.replayed).toBe(false);
    // Felder werden weiter gezaehlt (Aussage ueber die Quelle), geschrieben wird nichts.
    expect(response.body.report.cms).toEqual({
      collections: [
        { name: "Blog", slug: "blog", fields: 5, outcome: "existing" },
        { name: "Team", slug: "team", fields: 2, outcome: "existing" },
      ],
      fields: { mapped: 7, dropped: 0 },
    });
    expect(response.body.report.steps.at(-1)).toContain("0 Sammlungen im Plan, 2 bereits vorhanden");

    const after = await listCollections();
    expect(after).toEqual(before);
  });

  it("verwirft Auswahl ohne Optionen, fehlendes Verweisziel und unbekannten Typ mit einem Fund", async () => {
    const site = await createTestSite(env.api, "CMS Funde");
    const response = await runImport(
      {
        source: projectSource(LOSSY_CMS_JSON),
        write: true,
        pagePath: "/funde",
        assets: "skip",
        fonts: "skip",
      },
      site.id,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const report = response.body.report;
    expect(report.cms).toEqual({
      collections: [{ name: "Katalog", slug: "katalog", fields: 1, outcome: "create" }],
      fields: { mapped: 1, dropped: 3 },
    });
    const kinds = report.findings.map((finding) => finding.kind);
    expect(kinds).toContain("cms-select-empty");
    expect(kinds).toContain("cms-reference-missing");
    expect(kinds).toContain("cms-field-type");
    expect(
      report.findings.find((finding) => finding.kind === "cms-field-type")?.message,
    ).toContain("richNumber");

    const collections = await listCollections(site.id);
    expect(collections).toHaveLength(1);
    // Das Schema bleibt nicht still duenn: der Bericht sagt die drei Ablagen,
    // die Sammlung selbst traegt nur das, was Senify halten kann.
    expect(collections[0]?.fields.map((field) => field.key)).toEqual(["title", "titel"]);
  });

  it("eine kaputte CMS-Antwort ist ein Fehler und schreibt weder Seite noch Sammlung", async () => {
    const site = await createTestSite(env.api, "CMS Kaputt");
    const response = await runImport(
      {
        source: projectSource("{ kein gueltiger abzug"),
        write: true,
        pagePath: "/kaputt",
        assets: "skip",
        fonts: "skip",
      },
      site.id,
    );
    expect(response.status).toBe(400);
    expect(response.body.error.category).toBe("validation");
    expect(response.body.error.field).toBe("source.project.cms.collections");
    expect(await listCollections(site.id)).toEqual([]);
    const pages = await env.api.request<{ pages: { path: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages`,
    });
    expect(pages.body.pages.some((page) => page.path === "/kaputt")).toBe(false);
  });

  it("jeder abgebildete Feld-Typ ist ein Senify-Feldtyp", () => {
    const plan = readCmsCollections(CMS_JSON);
    const types = plan.collections.flatMap((collection) =>
      collection.fields.map((field) => field.type),
    );
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(FIELD_TYPES).toContain(type);
    }
  });
});

describe("CMS-Eintraege am Framer-Projekt", () => {
  // Ein eigener Bild-Server: der Eintrag nennt eine echte Adresse, und der
  // Import holt sie durch dieselbe Medien-Pipeline wie die Seitenbilder.
  let imageServer: ReturnType<typeof createServer>;
  let origin: string;

  beforeAll(async () => {
    const site = await createTestSite(env.api, "CMS Eintraege");
    entrySiteId = site.id;
    imageServer = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" }).end("cms-eintrag-bild");
    });
    await new Promise<void>((done) =>
      listenReachable(imageServer, 0, "127.0.0.1").then(() => done()),
    );
    const address = imageServer.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => imageServer.close(() => done()));
  });

  it("dry run: zaehlt Eintraege und Bilder, ohne Sammlungen oder Eintraege zu schreiben", async () => {
    const response = await runImport(
      { source: projectSource(CMS_JSON, itemsAnswers(`${origin}/bild.png`)) },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const report = response.body.report;
    expect(report.dryRun).toBe(true);
    expect(report.cms?.items).toEqual({ planned: 3, imported: 0, existing: 0, dropped: 0 });
    expect(report.cms?.media).toEqual({ planned: 1, downloaded: 0, failed: 0, skipped: 0 });
    expect(report.steps.some((step) => step.includes("CMS-Eintraege: 3 im Plan, 0 angelegt"))).toBe(
      true,
    );
    expect(
      report.steps.some((step) => step.includes("CMS-Bilder: 0 geladen, 0 fehlgeschlagen")),
    ).toBe(true);
    // Mit der getCMSItems-Antwort darf der Hinweis auf zurueckbleibende
    // Eintraege nicht erscheinen, auch wenn die Sammlungen Eintraege melden.
    expect(report.findings.some((finding) => finding.kind === "cms-items-not-imported")).toBe(
      false,
    );
    expect(await listCollections(entrySiteId)).toEqual([]);
    expect(await listEntries()).toEqual([]);
  });

  it("write: legt Eintraege als Drafts an, laedt das Titelbild und loest den Verweis", async () => {
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, itemsAnswers(`${origin}/bild.png`)),
        write: true,
        pagePath: "/cms-eintraege",
        assets: "upload",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const report = response.body.report;
    expect(report.replayed).toBe(false);
    expect(report.cms?.items).toEqual({ planned: 3, imported: 3, existing: 0, dropped: 0 });
    expect(report.cms?.media).toEqual({ planned: 1, downloaded: 1, failed: 0, skipped: 0 });

    const entries = await listEntries();
    expect(entries).toHaveLength(3);
    const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
    const teamEntry = bySlug.get("anna");
    const first = bySlug.get("erster-beitrag");
    const second = bySlug.get("zweiter-beitrag");
    expect(teamEntry).toBeDefined();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (teamEntry === undefined || first === undefined || second === undefined) return;

    // Eintraege sind Inhalt, kein Schema: sie landen als Draft, Version 1.
    expect(first.status).toBe("draft");
    expect(first.version).toBe(1);
    expect(first.cells["title"]).toBe("Erster Beitrag");
    expect(first.cells["f-title"]).toBe("Erster Beitrag");
    expect(first.cells["f-body"]).toBe("Ein langer Text aus Framer.");
    // Die Beschriftung "Design" aus fieldData wird zur Options-Id "d".
    expect(first.cells["f-tags"]).toBe("d");
    // Der Verweis nennt die Framer-Id; geschrieben wird die Senify-Id.
    expect(first.cells["f-author"]).toBe(teamEntry.id);
    const cover = first.cells["f-cover"];
    expect(cover).toMatchObject({ assetId: expect.any(String) });
    const assetId = (cover as { assetId: string }).assetId;
    const assets = await env.engine.store.listAssets(entrySiteId, {});
    expect(assets.some((asset) => asset.id === assetId)).toBe(true);

    expect(second.cells["title"]).toBe("Zweiter Beitrag");
    expect(second.cells["f-tags"]).toBe("a");
    expect(second.cells["f-cover"]).toBeUndefined();
    // Auch die zweite Sammlung der Antwort bekommt ihren Eintrag; der Titel
    // kommt aus dem ersten Textfeld der Quelle.
    expect(teamEntry.cells["title"]).toBe("Anna");
    expect(teamEntry.cells["f-name"]).toBe("Anna");
  });

  it("derselbe Auftrag spielt den Receipt und legt keine zweiten Eintraege an", async () => {
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, itemsAnswers(`${origin}/bild.png`)),
        write: true,
        pagePath: "/cms-eintraege",
        assets: "upload",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.replayed).toBe(true);
    expect(await listEntries()).toHaveLength(3);
  });

  it("dieselbe Antwort auf einer zweiten Seite: vorhandene Eintraege bleiben stehen", async () => {
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, itemsAnswers(null)),
        write: true,
        pagePath: "/cms-eintraege-zwei",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.cms?.items).toEqual({
      planned: 3,
      imported: 0,
      existing: 3,
      dropped: 0,
    });
    expect(response.body.report.cms?.collections.map((entry) => entry.outcome)).toEqual([
      "existing",
      "existing",
    ]);
    expect(await listEntries()).toHaveLength(3);
  });

  it("vergibt fuer zwei gleiche Slugs in einer Antwort -2, statt einen zu verlieren", async () => {
    const duplicates = JSON.stringify({
      message: 'Retrieved 2 of 2 item(s) from collection "Blog"',
      items: [
        {
          id: "dup-1",
          slug: "doppelt",
          fieldData: { "f-title": { type: "string", value: "Doppelt Eins" } },
        },
        {
          id: "dup-2",
          slug: "doppelt",
          fieldData: { "f-title": { type: "string", value: "Doppelt Zwei" } },
        },
      ],
    });
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, duplicates),
        write: true,
        pagePath: "/cms-doppelt",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.cms?.items).toEqual({
      planned: 2,
      imported: 2,
      existing: 0,
      dropped: 0,
    });
    const slugs = (await listEntries())
      .filter((entry) => entry.slug.startsWith("doppelt"))
      .map((entry) => entry.slug)
      .sort();
    expect(slugs).toEqual(["doppelt", "doppelt-2"]);
  });

  it("ohne Assets schreibt der Eintrag ohne Bild und nennt den Fund", async () => {
    const answer = JSON.stringify({
      message: 'Retrieved 1 of 1 item(s) from collection "Blog"',
      items: [
        {
          id: "skip-1",
          slug: "ohne-bild",
          fieldData: {
            "f-title": { type: "string", value: "Ohne Bild" },
            "f-cover": { type: "image", value: `${origin}/bild.png` },
          },
        },
      ],
    });
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, answer),
        write: true,
        pagePath: "/cms-ohne-bild",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.report.cms?.media).toEqual({
      planned: 1,
      downloaded: 0,
      failed: 0,
      skipped: 1,
    });
    expect(
      response.body.report.findings.some(
        (finding) => finding.kind === "cms-item-media-skipped",
      ),
    ).toBe(true);
    const entry = (await listEntries()).find((candidate) => candidate.slug === "ohne-bild");
    expect(entry).toBeDefined();
    expect(entry?.cells["title"]).toBe("Ohne Bild");
    expect(entry?.cells["f-cover"]).toBeUndefined();
  });

  it("ein fehlendes Verweisziel ist ein Fund, der Eintrag entsteht trotzdem", async () => {
    const answer = JSON.stringify({
      message: 'Retrieved 1 of 1 item(s) from collection "Blog"',
      items: [
        {
          id: "ref-1",
          slug: "ohne-verweis",
          fieldData: {
            "f-title": { type: "string", value: "Ohne Verweis" },
            "f-author": { type: "collectionReference", value: "fehlt" },
          },
        },
      ],
    });
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, answer),
        write: true,
        pagePath: "/cms-ohne-verweis",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(
      response.body.report.findings.some(
        (finding) => finding.kind === "cms-item-relation-missing",
      ),
    ).toBe(true);
    const entry = (await listEntries()).find((candidate) => candidate.slug === "ohne-verweis");
    expect(entry).toBeDefined();
    expect(entry?.cells["title"]).toBe("Ohne Verweis");
    expect(entry?.cells["f-author"]).toBeUndefined();
  });

  it("kuerzt einen Framer-Zeitstempel auf den Tag einer date-Zelle", async () => {
    const response = await runImport(
      {
        source: projectSource(DATE_CMS_JSON, DATE_ITEMS_JSON),
        write: true,
        pagePath: "/cms-termine",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const entry = (await listEntries()).find((candidate) => candidate.slug === "termin-eins");
    expect(entry).toBeDefined();
    expect(entry?.cells["f-date"]).toBe("2026-10-20");
  });

  it("eine kaputte getCMSItems-Antwort ist ein Fehler und schreibt nichts", async () => {
    const response = await runImport(
      {
        source: projectSource(CMS_JSON, "kein json und kein xml"),
        write: true,
        pagePath: "/cms-eintraege-kaputt",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status).toBe(400);
    expect(response.body.error.category).toBe("validation");
    expect(response.body.error.field).toBe("source.project.cms.items");
    const pages = await env.api.request<{ pages: { path: string }[] }>({
      method: "GET",
      path: `/api/sites/${entrySiteId}/pages`,
    });
    expect(pages.body.pages.some((page) => page.path === "/cms-eintraege-kaputt")).toBe(false);
  });

  it("Eintraege ohne Sammlungs-Antwort weist die Anfrage ab", async () => {
    const response = await runImport(
      {
        source: {
          project: {
            xml: PROJECT_XML,
            pageXml: PAGE_XML,
            page: "/",
            usage: "private" as const,
            cms: { items: itemsAnswers(null) },
          },
        },
        write: true,
        pagePath: "/cms-ohne-sammlungen",
        assets: "skip",
        fonts: "skip",
      },
      entrySiteId,
    );
    expect(response.status).toBe(400);
    expect(response.body.error.category).toBe("validation");
  });
});
