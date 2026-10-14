import { describe, expect, it } from "vitest";
import { buildInspector } from "@senify/editor";
import { bundledSections } from "@senify/registry";
import type { EditorNode } from "../src/state/document.ts";
import { baseStore } from "./state/fixtures.ts";
import type { InspectorField } from "../src/inspector/model.ts";
import {
  hasPropLabel,
  linkToText,
  linesToText,
  newRepeaterItem,
  sectionContentGroups,
  textToLines,
  textToLink,
} from "../src/inspector/section-fields.ts";

// The Content tab of a section node: before this a hero or a features block
// showed an empty tab, because the section's props live in the section registry
// and not in the primitive catalog.

function contentOf(
  primitive: string,
  props: Record<string, unknown>,
  assets?: { id: string; name: string; kind: string }[],
) {
  const store = baseStore();
  store.apply({
    op: "insertNode",
    parent: { nodeId: store.document.rootNodeId },
    node: { primitive, id: "sect000001", props: props as never },
  });
  const model = buildInspector({
    document: store.document,
    nodeId: "sect000001",
    breakpoint: "desktop",
    ...(assets === undefined ? {} : { assets }),
  });
  const tab = model?.tabs.find((entry) => entry.id === "content");
  return tab?.groups ?? [];
}

describe("Content tab of a section", () => {
  it("lists the section's own props with German labels", () => {
    const groups = contentOf("cta", { headline: "Los", sub: "Jetzt" }).filter(
      (group) => group.id !== "content/variant",
    );
    const fields = groups.flatMap((group) => group.fields);
    expect(fields.map((field) => field.key)).toEqual(["headline", "sub", "buttons"]);
    expect(fields.map((field) => field.label)).toEqual(["Überschrift", "Unterzeile", "Buttons"]);
    expect(fields[0]?.value).toBe("Los");
    expect(fields.every((field) => !field.responsive)).toBe(true);
  });

  it("offers the section's variants as a select at the top, named by the registry", () => {
    const groups = contentOf("cta", { headline: "Los" });
    expect(groups[0]?.id).toBe("content/variant");
    expect(groups[0]?.label).toBe("Variante");
    const field = groups[0]?.fields[0];
    expect(field?.key).toBe("variant");
    expect(field?.kind).toBe("select");
    expect(field?.commit).toEqual({ kind: "section-variant" });
    expect(field?.options).toEqual([
      { value: "simple", label: "Schlicht" },
      { value: "split", label: "Geteilt" },
      { value: "banner-cta", label: "Banner" },
    ]);
    // Not responsive, like the rest of the section content.
    expect(field?.responsive).toBe(false);
  });

  it("shows the default variant until one is set, then the node's own", () => {
    const valueOf = (variant: string | undefined) => {
      const store = baseStore();
      store.apply({
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: {
          primitive: "cta",
          id: "sect000001",
          props: { headline: "Los" },
          ...(variant === undefined ? {} : { variant }),
        },
      });
      const model = buildInspector({
        document: store.document,
        nodeId: "sect000001",
        breakpoint: "desktop",
      });
      const content = model?.tabs.find((entry) => entry.id === "content");
      return content?.groups[0]?.fields[0]?.value;
    };
    // The golden tree's variant is the section's default.
    expect(valueOf(undefined)).toBe("simple");
    expect(valueOf("split")).toBe("split");
  });

  it("gives a node without a section definition no variant select", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    const content = model?.tabs.find((entry) => entry.id === "content");
    expect(content?.groups.some((group) => group.id === "content/variant")).toBe(false);
  });

  it("turns a list of objects into a repeater with typed entry fields", () => {
    const groups = contentOf("features", {
      title: "Warum wir",
      items: [{ title: "Schnell", text: "In zwei Wochen online." }],
    });
    const items = groups.flatMap((group) => group.fields).find((field) => field.key === "items");
    expect(items?.kind).toBe("repeater");
    expect(items?.value).toEqual([{ title: "Schnell", text: "In zwei Wochen online." }]);
    const children = items?.fields ?? [];
    expect(children.map((child) => [child.key, child.kind, child.required])).toEqual([
      ["icon", "text", false],
      ["title", "text", true],
      ["text", "textarea", true],
      ["link", "url", false],
    ]);
    expect(children.find((child) => child.key === "link")?.shape).toBe("link");
  });

  it("starts a new entry with values that pass the schema", () => {
    const groups = contentOf("features", { title: "x" });
    const items = groups.flatMap((group) => group.fields).find((field) => field.key === "items");
    const entry = newRepeaterItem(items?.fields ?? []);
    expect(entry).toEqual({ title: "Titel", text: "Text" });
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "features", id: "feat000002", props: { title: "x", items: [entry] } as never },
    });
    expect(store.document.nodes["feat000002"]?.props["items"]).toEqual([entry]);
  });

  it("gives buttons a link field that starts on a valid address", () => {
    const groups = contentOf("cta", { headline: "Los" });
    const buttons = groups.flatMap((group) => group.fields).find((field) => field.key === "buttons");
    const entry = newRepeaterItem(buttons?.fields ?? []);
    expect(entry).toEqual({ label: "Beschriftung", link: { url: "/" } });
  });

  it("does not offer a Content field for the section's style keys", () => {
    const groups = contentOf("cta", { headline: "Los" });
    const keys = groups.flatMap((group) => group.fields.map((field) => field.key));
    expect(keys).not.toContain("background");
    expect(keys).not.toContain("paddingY");
  });
});

describe("value and text round trips", () => {
  it("shows a link as its address and keeps the new-tab flag on edit", () => {
    expect(linkToText({ url: "/kontakt", newTab: true })).toBe("/kontakt");
    expect(linkToText({ pageId: "pg1" })).toBe("seite:pg1");
    expect(linkToText(undefined)).toBe("");
    expect(textToLink(" /preise ", { url: "/kontakt", newTab: true })).toEqual({
      url: "/preise",
      newTab: true,
    });
    expect(textToLink("seite:pg2", undefined)).toEqual({ pageId: "pg2" });
    expect(textToLink("https://example.com", { url: "/x" })).toEqual({ url: "https://example.com" });
  });

  it("shows a list of strings one per line", () => {
    expect(linesToText(["a", "b"])).toBe("a\nb");
    expect(textToLines(" a \n\n b ")).toEqual(["a", "b"]);
  });
  describe("an image prop (asset)", () => {
    const library = [
      { id: "ast-bild-eins", name: "Titelbild.jpg", kind: "image" },
      { id: "ast-film", name: "Clip.mp4", kind: "video" },
      { id: "ast-bild-zwei", name: "Team.png", kind: "image" },
      { id: "ast-pdf", name: "Preise.pdf", kind: "document" },
    ];
    const imageField = (props: Record<string, unknown>, assets = library) =>
      contentOf("media", props, assets)
        .flatMap((group) => group.fields)
        .find((field) => field.key === "asset");

    it("is a select over the site's pictures, with \"no image\" first", () => {
      const field = imageField({ asset: { assetId: "ast-bild-zwei" } });
      expect(field?.kind).toBe("select");
      expect(field?.shape).toBe("asset");
      expect(field?.label).toBe("Bild");
      expect(field?.value).toBe("ast-bild-zwei");
      // Videos and documents are not pictures.
      expect(field?.options).toEqual([
        { value: "", label: "Kein Bild" },
        { value: "ast-bild-eins", label: "Titelbild.jpg" },
        { value: "ast-bild-zwei", label: "Team.png" },
      ]);
    });

    it("shows an empty value while no image is set, and still offers \"no image\" without a library", () => {
      expect(imageField({})?.value).toBe("");
      expect(imageField({}, [])?.options).toEqual([{ value: "", label: "Kein Bild" }]);
    });

    it("keeps a picture that left the library as the current value", () => {
      const field = imageField({ asset: { assetId: "ast-geloescht" } });
      expect(field?.value).toBe("ast-geloescht");
      expect(field?.options?.some((option) => option.value === "ast-geloescht")).toBe(false);
    });

    it("exists on the card cover too", () => {
      const field = contentOf("card", { title: "Karte", cover: { assetId: "ast-bild-eins" } }, library)
        .flatMap((group) => group.fields)
        .find((entry) => entry.key === "cover");
      expect(field?.shape).toBe("asset");
      expect(field?.value).toBe("ast-bild-eins");
    });
  });
});

// The registry describes its props in English, the editor speaks German: every
// key a section offers (and every field of a list entry) needs a German name in
// the editor, or one the registry already writes in German. A new prop without
// either shows up here instead of reaching the inspector in English.
describe("German names of section props", () => {
  const WRITTEN_IN_GERMAN_BY_THE_REGISTRY = new Set([
    "emptyText",
    "excludeCurrent",
    "filterField",
    "filterOp",
    "filterValue",
    "hint",
    "orderByDirection",
    "orderByField",
    "pagination",
    "paramName",
    "cover",
  ]);

  it("covers every prop and every list-entry field of every registry section", () => {
    const missing: string[] = [];
    const visit = (section: string, field: InspectorField) => {
      if (!hasPropLabel(field.key) && !WRITTEN_IN_GERMAN_BY_THE_REGISTRY.has(field.key)) {
        missing.push(`${section}: ${field.key} (${field.label})`);
      }
      for (const inner of field.fields ?? []) visit(section, inner);
    };
    for (const section of bundledSections) {
      const node = { id: "n", primitive: section.type, props: {} } as unknown as EditorNode;
      const groups = sectionContentGroups(section, node, section.title, () => {});
      for (const field of groups.flatMap((group) => group.fields)) visit(section.type, field);
    }
    expect(missing).toEqual([]);
  });

  it("names the form field kinds and the marquee direction in German", () => {
    const contact = contentOf("contact", {});
    const fields = contact.flatMap((group) => group.fields).find((field) => field.key === "fields");
    const kind = fields?.fields?.find((field) => field.key === "kind");
    expect(kind?.label).toBe("Art");
    expect(kind?.options?.map((option) => option.label)).toEqual([
      "Text",
      "E-Mail",
      "Telefon",
      "Mehrzeiliger Text",
      "Auswahlliste",
      "Optionsfelder",
      "Kontrollkästchen",
      "Datum",
      "Zahl",
    ]);
    const marquee = contentOf("marquee", {})
      .flatMap((group) => group.fields)
      .find((field) => field.key === "direction");
    expect(marquee?.label).toBe("Richtung");
    expect(marquee?.options?.map((option) => option.label)).toEqual(["Links", "Rechts"]);
  });

  it("labels the privacy and notification props of a form in German", () => {
    const labels = contentOf("newsletter", {})
      .flatMap((group) => group.fields)
      .map((field) => field.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Datenschutzseite",
        "Danke-Seite",
        "Honeypot-Feld",
        "Empfänger der Benachrichtigung",
        "Datenschutzhinweis",
      ]),
    );
  });
});
