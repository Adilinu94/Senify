import { describe, expect, it } from "vitest";
import { readCmsCollections } from "@senify/framer-import";
import { SenifyError } from "@senify/core";

// Die Abbildung der CMS-Sammlungen (ADR-0028, Block 4). Gelesen wird die
// Antwort von getCMSCollections. Gemessen am 02.11.2026 (MCP 1.8.0): Die
// Antwort stellt ihrem JSON einen Markdown-Vorspann voran, und der Vorspann
// enthaelt selbst ein JSON-Beispiel. Der Test haelt diese gemessene Form fest
// und prueft daneben die dokumentierte (Felder laut Format-Doku) sowie XML wie
// die Node-Werkzeuge. Alles Unbekannte wird ein Fehler oder ein Fund, nie eine
// stille Leere.

const DOCUMENTED_JSON = JSON.stringify([
  {
    id: "col-blog",
    name: "Blog",
    fields: [
      { id: "f-title", name: "Titel", type: "string", required: true },
      { id: "f-body", name: "Text", type: "string", multiline: true },
      { id: "f-date", name: "Datum", type: "date" },
      { id: "f-tags", name: "Tags", type: "enum", cases: [{ id: "a", name: "Architektur" }, { id: "d", name: "Design" }] },
      { id: "f-cover", name: "Bild", type: "image" },
      { id: "f-author", name: "Autor", type: "collectionReference", collectionId: "col-team" },
    ],
  },
  {
    id: "col-team",
    name: "Team",
    fields: [
      { id: "f-name", name: "Name", type: "string" },
      { id: "f-active", name: "Aktiv", type: "boolean" },
      { id: "f-color", name: "Farbe", type: "color" },
      { id: "f-link", name: "Website", type: "link" },
      { id: "f-bio", name: "Biografie", type: "formattedText" },
      { id: "f-file", name: "Lebenslauf", type: "file" },
      { id: "f-projects", name: "Projekte", type: "multiCollectionReference", collectionId: "col-blog" },
    ],
  },
]);

const DOCUMENTED_XML = `<Collections>
  <Collection id="col-blog" name="Blog">
    <Fields>
      <Field id="f-title" name="Titel" type="string" required="true" />
      <Field id="f-tags" name="Tags" type="enum">
        <Cases>
          <Case id="a" name="Architektur" />
          <Case id="d" name="Design" />
        </Cases>
      </Field>
    </Fields>
  </Collection>
  <Collection id="col-team" name="Team">
    <Field id="f-name" name="Name" type="string" />
    <Field id="f-author" name="Autor" type="collectionReference" collectionId="col-blog" />
  </Collection>
</Collections>`;

describe("CMS-Sammlungen: die dokumentierte Form", () => {
  it("bildet die Feld-Typen der Format-Doku auf Senify-Typen ab", () => {
    const plan = readCmsCollections(DOCUMENTED_JSON);
    expect(plan.collections.map((collection) => collection.slug)).toEqual(["blog", "team"]);
    const blog = plan.collections[0];
    expect(blog?.framerId).toBe("col-blog");
    expect(blog?.fields.map((field) => [field.key, field.type])).toEqual([
      ["titel", "text"],
      ["text", "longText"],
      ["datum", "date"],
      ["tags", "select"],
      ["bild", "media"],
      ["autor", "relation"],
    ]);
    const tags = blog?.fields.find((field) => field.key === "tags");
    expect(tags?.options).toEqual([
      { value: "a", label: "Architektur" },
      { value: "d", label: "Design" },
    ]);
    const cover = blog?.fields.find((field) => field.key === "bild");
    expect(cover?.mediaKind).toBe("image");
    const author = blog?.fields.find((field) => field.key === "autor");
    expect(author?.targetFramerCollectionId).toBe("col-team");

    const team = plan.collections[1];
    expect(team?.fields.map((field) => [field.key, field.type])).toEqual([
      ["name", "text"],
      ["aktiv", "boolean"],
      ["farbe", "text"],
      ["website", "url"],
      ["biografie", "richtext"],
      ["lebenslauf", "media"],
      ["projekte", "relationMulti"],
    ]);
    expect(team?.fields.find((field) => field.key === "lebenslauf")?.mediaKind).toBe("any");
    expect(plan.findings).toEqual([]);
  });

  it("nimmt auch den Umschlag { collections: [...] } an", () => {
    const plan = readCmsCollections(JSON.stringify({ collections: [{ name: "Neuigkeiten" }] }));
    expect(plan.collections.map((collection) => collection.slug)).toEqual(["neuigkeiten"]);
    expect(plan.collections[0]?.fields).toEqual([]);
  });

  it("liest die gemessene Antwort: Vorspann mit JSON-Beispiel, dahinter das echte JSON", () => {
    // So antwortet getCMSItems am 02.11.2026: eine kurze Anleitung, ein
    // Beispielobjekt und erst danach die Sammlungen. Der Scanner muss das
    // letzte vollstaendige JSON nehmen, nicht das Beispiel.
    const answer = [
      "## Working with CMS Items",
      "",
      "Each field is an object:",
      "",
      JSON.stringify({ fieldId: { type: "string", value: "My Title" } }, null, 2),
      "",
      JSON.stringify(
        {
          message: "Found 1 CMS collection(s)",
          collections: [
            {
              id: "col-blog",
              name: "Blog",
              readonly: false,
              fields: [
                {
                  id: "f-headline",
                  name: "Headline",
                  type: "string",
                  comment: 'JSON string - Plain text value (e.g., "Hello World")',
                },
                { id: "f-body", name: "Body", type: "formattedText" },
                { id: "f-date", name: "Publication Date", type: "date" },
              ],
            },
          ],
        },
        null,
        2,
      ),
    ].join("\n");
    const plan = readCmsCollections(answer);
    expect(plan.collections.map((collection) => collection.slug)).toEqual(["blog"]);
    expect(plan.collections[0]?.framerId).toBe("col-blog");
    expect(plan.collections[0]?.fields.map((field) => [field.key, field.type])).toEqual([
      ["headline", "text"],
      ["body", "richtext"],
      ["publication-date", "date"],
    ]);
    expect(plan.findings).toEqual([]);
  });

  it("liest dieselbe Sammlung aus XML, Felder direkt oder in <Fields>", () => {
    const plan = readCmsCollections(DOCUMENTED_XML);
    expect(plan.collections.map((collection) => collection.name)).toEqual(["Blog", "Team"]);
    expect(plan.collections[0]?.fields.map((field) => field.type)).toEqual(["text", "select"]);
    expect(plan.collections[0]?.fields[0]?.required).toBe(true);
    expect(plan.collections[0]?.fields[1]?.options).toEqual([
      { value: "a", label: "Architektur" },
      { value: "d", label: "Design" },
    ]);
    // Direkte <Field>-Kinder gelten wie die Gruppe <Fields>.
    expect(plan.collections[1]?.fields.map((field) => field.key)).toEqual(["name", "autor"]);
    expect(plan.collections[1]?.fields[1]?.targetFramerCollectionId).toBe("col-blog");
  });

  it("macht aus einem unbekannten Feld-Typ einen Fund und laesst die anderen Felder stehen", () => {
    const plan = readCmsCollections(
      JSON.stringify([
        { name: "Katalog", fields: [
          { name: "Titel", type: "string" },
          { name: "Gewicht", type: "richNumber" },
        ] },
      ]),
    );
    expect(plan.collections[0]?.fields.map((field) => field.key)).toEqual(["titel"]);
    // Der Parser zaehlt selbst, was er nicht abbilden kann; der Engine-Bericht
    // uebernimmt diese Zahl, statt sie still zu verlieren.
    expect(plan.collections[0]?.dropped).toBe(1);
    expect(plan.findings).toEqual([
      expect.objectContaining({ kind: "cms-field-type", severity: "warn" }),
    ]);
    expect(plan.findings[0]?.evidence).toContain("richNumber");
  });

  it("haelt die Zahl der mitgelieferten Eintraege fest, ohne sie zu lesen", () => {
    // Der Parser liest hier nur das Schema. Ob die Eintraege mitkommen,
    // entscheidet die Engine an der getCMSItems-Antwort; die Zahl bleibt am
    // Plan, damit der Bericht ohne diese Antwort sagen kann, was offen ist.
    const plan = readCmsCollections(
      JSON.stringify([
        { name: "Blog", fields: [{ name: "Titel", type: "string" }], items: [{ id: "1" }, { id: "2" }] },
      ]),
    );
    expect(plan.collections[0]?.sourceItems).toBe(2);
    expect(plan.findings).toEqual([]);
  });

  it("reserviert den Schluessel und die Id des eingebauten Titelfelds", () => {
    const plan = readCmsCollections(
      JSON.stringify([
        { name: "Seiten", fields: [
          { id: "title", name: "Title", type: "string" },
          { name: "Titel", type: "string" },
        ] },
      ]),
    );
    expect(plan.collections[0]?.fields.map((field) => [field.id, field.key])).toEqual([
      ["title-2", "title-2"],
      ["titel", "titel"],
    ]);
  });

  it("wirft bei leerer, unlesbarer oder fremder Antwort", () => {
    expect(() => readCmsCollections("   ")).toThrow(SenifyError);
    expect(() => readCmsCollections("kein json und kein xml")).toThrow(
      "weder XML noch JSON",
    );
    expect(() => readCmsCollections("<Project><Pages /></Project>")).toThrow(
      "nicht mit <Collections>",
    );
    expect(() => readCmsCollections(JSON.stringify([{ fields: [] }]))).toThrow(
      "Sammlung ohne Namen",
    );
    expect(() =>
      readCmsCollections(JSON.stringify([{ name: "Blog", fields: "keine Liste" }])),
    ).toThrow("keine Liste");
  });
});
