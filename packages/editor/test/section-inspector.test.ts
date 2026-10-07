import { describe, expect, it } from "vitest";
import { buildInspector } from "@senify/editor";
import { baseStore } from "./state/fixtures.ts";
import {
  linkToText,
  linesToText,
  newRepeaterItem,
  textToLines,
  textToLink,
} from "../src/inspector/section-fields.ts";

// The Content tab of a section node: before this a hero or a features block
// showed an empty tab, because the section's props live in the section registry
// and not in the primitive catalog.

function contentOf(primitive: string, props: Record<string, unknown>) {
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
  });
  const tab = model?.tabs.find((entry) => entry.id === "content");
  return tab?.groups ?? [];
}

describe("Content tab of a section", () => {
  it("lists the section's own props with German labels", () => {
    const groups = contentOf("cta", { headline: "Los", sub: "Jetzt" });
    const fields = groups.flatMap((group) => group.fields);
    expect(fields.map((field) => field.key)).toEqual(["headline", "sub", "buttons"]);
    expect(fields.map((field) => field.label)).toEqual(["Überschrift", "Unterzeile", "Buttons"]);
    expect(fields[0]?.value).toBe("Los");
    expect(fields.every((field) => !field.responsive)).toBe(true);
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
});
