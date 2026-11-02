import { describe, expect, it } from "vitest";
import { readCmsCollections, readCmsItems } from "@senify/framer-import";
import { SenifyError } from "@senify/core";

// Die Eintraege des Unframer-MCP (ADR-0028, Block 4). Gelesen wird die Antwort
// von getCMSItems. Gemessen am 02.11.2026 (MCP 1.8.0): reines JSON mit
// { message, pagination, items }, jedes Feld als fieldData-Eintrag
// { type, value }, und der Eintrag nennt seine Sammlung nicht - die Antwort
// gilt einer Sammlung. Der Test haelt diese gemessene Form fest und prueft
// daneben die dokumentierte (Felder ueber Framer-Id, Schluessel oder
// Beschriftung) sowie XML wie die Node-Werkzeuge. Alles Unbekannte wird ein
// Fund oder ein Fehler, nie eine stille Leere: ein Feld, das nicht passt,
// faellt MIT Grund weg, eine unbekannte Sammlung verwirft den Eintrag MIT
// Grund.

const COLLECTIONS = JSON.stringify([
  {
    id: "col-blog",
    name: "Blog",
    fields: [
      { id: "f-title", name: "Titel", type: "string", required: true },
      { id: "f-body", name: "Text", type: "string", multiline: true },
      { id: "f-date", name: "Datum", type: "date" },
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
      { id: "f-gallery", name: "Galerie", type: "file" },
    ],
  },
]);

const collectionPlan = () => readCmsCollections(COLLECTIONS);

const ITEMS_JSON = JSON.stringify([
  {
    // Angaben wie sie ein CMS-Eintrag traegt: die Sammlung ueber die
    // Framer-Id, die Felder ueber Framer-Id, Schluessel oder Beschriftung.
    id: "item-1",
    collectionId: "col-blog",
    slug: "erster-beitrag",
    fields: {
      "f-title": "Erster Beitrag",
      Text: "Ein langer Text aus Framer.",
      datum: "2026-10-01",
      "f-tags": "a",
      Bild: { url: "https://cdn.example/bild.png", alt: "Ein Bild" },
      "f-author": "member-1",
    },
  },
  {
    id: "item-2",
    collection: "blog",
    fields: {
      Titel: "Zweiter Beitrag",
      // Eine Auswahl darf auch die Beschriftung nennen: der Wert wird die Id.
      Tags: "Design",
      // Ein Verweis darf auch ein Objekt sein.
      Autor: { id: "member-2" },
      Galerie: [
        "https://cdn.example/eins.png",
        { url: "https://cdn.example/zwei.png" },
      ],
    },
  },
]);

describe("CMS-Eintraege: die dokumentierte Form", () => {
  it("liest JSON-Eintraege und ordnet die Felder ueber Id, Schluessel und Beschriftung zu", () => {
    const plan = readCmsItems(ITEMS_JSON, collectionPlan().collections);
    expect(plan.findings).toEqual([]);
    expect(plan.items).toHaveLength(2);

    const first = plan.items[0];
    expect(first?.collectionSlug).toBe("blog");
    expect(first?.framerId).toBe("item-1");
    expect(first?.slug).toBe("erster-beitrag");
    expect(first?.cells).toEqual({
      titel: { kind: "text", value: "Erster Beitrag" },
      text: { kind: "text", value: "Ein langer Text aus Framer." },
      datum: { kind: "text", value: "2026-10-01" },
      tags: { kind: "select", value: "a" },
      bild: { kind: "media", url: "https://cdn.example/bild.png", alt: "Ein Bild" },
      autor: { kind: "relation", target: "member-1" },
    });
    expect(first?.dropped).toBe(0);

    const second = plan.items[1];
    // Ohne eigenes Slug-Feld bleibt der Slug offen; die Engine leitet ihn aus
    // dem Titel ab (dieselbe Regel wie createEntry).
    expect(second?.slug).toBeNull();
    expect(second?.cells).toEqual({
      titel: { kind: "text", value: "Zweiter Beitrag" },
      // Die Beschriftung "Design" wird zur Options-Id "d".
      tags: { kind: "select", value: "d" },
      autor: { kind: "relation", target: "member-2" },
      galerie: {
        kind: "mediaList",
        items: [
          { url: "https://cdn.example/eins.png", alt: null },
          { url: "https://cdn.example/zwei.png", alt: null },
        ],
      },
    });
  });

  it("liest die gemessene Antwort: fieldData mit { type, value }, Sammlung ueber die Feld-Ids", () => {
    // So antwortet getCMSItems am 02.11.2026: keine Sammlungs-Id am Eintrag,
    // dafuer fieldData als Objekt von Feld-Id auf { type, value }.
    const answer = JSON.stringify({
      message: 'Retrieved 1 of 1 item(s) from collection "Blog"',
      pagination: { total: 1, skip: 0, limit: 100, returned: 1 },
      items: [
        {
          id: "bl49TFrmF",
          slug: "small-steps",
          draft: false,
          fieldData: {
            "f-title": { type: "string", value: "Kleine Schritte" },
            "f-body": { type: "string", value: "Ein langer Text." },
            "f-date": { type: "date", value: "2026-10-20T00:00:00.000Z" },
            "f-tags": { type: "enum", value: "Design" },
            "f-cover": { type: "image", value: "https://cdn.example/bild.jpg" },
            "f-author": { type: "collectionReference", value: "member-1" },
          },
        },
      ],
    });
    const plan = readCmsItems(answer, collectionPlan().collections);
    expect(plan.findings).toEqual([]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.collectionSlug).toBe("blog");
    expect(plan.items[0]?.framerId).toBe("bl49TFrmF");
    expect(plan.items[0]?.slug).toBe("small-steps");
    expect(plan.items[0]?.cells).toEqual({
      titel: { kind: "text", value: "Kleine Schritte" },
      text: { kind: "text", value: "Ein langer Text." },
      // Das Datum bleibt der volle Zeitstempel; die Engine kuerzt ihn fuer
      // eine date-Zelle auf den Tag.
      datum: { kind: "text", value: "2026-10-20T00:00:00.000Z" },
      tags: { kind: "select", value: "d" },
      bild: { kind: "media", url: "https://cdn.example/bild.jpg", alt: null },
      autor: { kind: "relation", target: "member-1" },
    });
  });

  it("ordnet einen Eintrag ohne Sammlungsangabe ueber seine Feld-Ids zu", () => {
    const plan = readCmsItems(
      JSON.stringify({
        items: [
          { id: "ohne-hinweis", fieldData: { "f-title": { type: "string", value: "Nur Felder" } } },
        ],
      }),
      collectionPlan().collections,
    );
    expect(plan.findings).toEqual([]);
    expect(plan.items[0]?.collectionSlug).toBe("blog");
  });

  it("nimmt den Sammlungsnamen der Antwort als Rueckfall fuer einen Eintrag ohne Felder", () => {
    const plan = readCmsItems(
      JSON.stringify({
        message: 'Retrieved 1 of 1 item(s) from collection "Blog"',
        items: [{ id: "leer", slug: "leer" }],
      }),
      collectionPlan().collections,
    );
    expect(plan.findings).toEqual([]);
    expect(plan.items[0]?.collectionSlug).toBe("blog");
    expect(plan.items[0]?.cells).toEqual({});
  });

  it("liest dieselbe Form aus XML", () => {
    const xml = `<Items>
      <Item id="item-1" collectionId="col-blog" slug="erster-beitrag">
        <Field name="Titel">Erster Beitrag</Field>
        <Field name="Datum">2026-10-01</Field>
        <Field name="Tags" value="a" />
        <Field name="Bild"><Value url="https://cdn.example/bild.png" alt="Ein Bild" /></Field>
        <Field name="Autor"><Relation id="member-1" /></Field>
      </Item>
    </Items>`;
    const plan = readCmsItems(xml, collectionPlan().collections);
    expect(plan.findings).toEqual([]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.cells).toEqual({
      titel: { kind: "text", value: "Erster Beitrag" },
      datum: { kind: "text", value: "2026-10-01" },
      tags: { kind: "select", value: "a" },
      bild: { kind: "media", url: "https://cdn.example/bild.png", alt: "Ein Bild" },
      autor: { kind: "relation", target: "member-1" },
    });
  });

  it("verwirft einen Eintrag mit unbekannter Sammlung mit einem Fund", () => {
    const plan = readCmsItems(
      JSON.stringify([{ id: "x", collectionId: "col-fehlt", fields: { Titel: "Weg" } }]),
      collectionPlan().collections,
    );
    expect(plan.items).toEqual([]);
    expect(plan.findings).toEqual([
      expect.objectContaining({ kind: "cms-item-collection-unknown", severity: "warn" }),
    ]);
  });

  it("verwirft ein unbekanntes Feld mit einem Fund und laesst die anderen stehen", () => {
    const plan = readCmsItems(
      JSON.stringify([
        {
          id: "item-1",
          collectionId: "col-blog",
          fields: { Titel: "Bleibt", Erfunden: "weg" },
        },
      ]),
      collectionPlan().collections,
    );
    expect(plan.items[0]?.cells).toEqual({ titel: { kind: "text", value: "Bleibt" } });
    expect(plan.items[0]?.dropped).toBe(1);
    expect(plan.findings).toEqual([
      expect.objectContaining({ kind: "cms-item-field-unknown", severity: "warn" }),
    ]);
    expect(plan.findings[0]?.evidence).toContain("Erfunden");
  });

  it("verwirft einen Wert, der nicht zur Feldart passt, mit einem Fund", () => {
    const plan = readCmsItems(
      JSON.stringify([
        {
          id: "item-1",
          collectionId: "col-blog",
          fields: {
            // Ein Objekt ohne Adresse ist kein Bild und kein Text.
            Bild: { width: 100 },
            // Eine Auswahl ausserhalb der Optionen ist kein gueltiger Wert.
            Tags: "Unbekannt",
          },
        },
      ]),
      collectionPlan().collections,
    );
    expect(plan.items[0]?.cells).toEqual({});
    expect(plan.items[0]?.dropped).toBe(2);
    expect(plan.findings.map((finding) => finding.kind)).toEqual([
      "cms-item-value",
      "cms-item-value",
    ]);
  });

  it("wirft bei leerer, unlesbarer oder fremder Antwort", () => {
    const collections = collectionPlan().collections;
    expect(() => readCmsItems("   ", collections)).toThrow(SenifyError);
    expect(() => readCmsItems("kein json und kein xml", collections)).toThrow(
      "weder XML noch JSON",
    );
    expect(() => readCmsItems("<Collections><Collection /></Collections>", collections)).toThrow(
      "nicht mit <Items>",
    );
  });
});
