import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCmsCollections } from "@senify/framer-import";
import {
  FIELD_TYPES,
  SUPPORTS_FLAGS,
  type Collection,
} from "../src/types.ts";
import {
  bootEngine,
  createTestSite,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// Das CMS-Mapping am Projekt-Import (ADR-0028, Block 4). Gelesen wird die
// Antwort von getCMSCollections. Was hier zaehlt:
// - Der Bericht nennt je Sammlung, ob sie angelegt wird oder schon besteht,
//   und wie viele Felder Senify abbilden kann.
// - Die Sammlungen entstehen im selben Commit wie die Seite (kein halbes
//   Schema); ein Fehler in der CMS-Antwort schreibt gar nichts.
// - Eine vorhandene Sammlung bleibt unberuehrt, auch wenn dieselbe Antwort
//   auf eine zweite Seite geht.
// - Was Senify nicht halten kann (Auswahl ohne Optionen, fehlendes
//   Verweisziel, unbekannter Typ), faellt mit einem Fund weg statt still.

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

const projectSource = (cms?: string) => ({
  project: {
    xml: PROJECT_XML,
    pageXml: PAGE_XML,
    page: "/",
    usage: "private" as const,
    ...(cms === undefined ? {} : { cms: { collections: cms } }),
  },
});

let env: BootEnv;
let siteId: string;

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
