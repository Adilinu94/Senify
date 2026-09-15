import { describe, expect, it } from "vitest";
import { bundledSections } from "@senify/registry";
import type { Node, NodeTree } from "@senify/section-sdk";
import {
  expandPageTree,
  resolveNodeProps,
  type BindingEntry,
  type BindingSource,
} from "@senify/renderer";

const definitions = new Map(
  bundledSections.map((section) => [section.type, section]),
);

const FIELDS = [
  { id: "title", key: "title", type: "text" },
  { id: "f-body", key: "body", type: "richtext" },
  { id: "f-cover", key: "cover", type: "media" },
  { id: "f-author", key: "author", type: "relation" },
  { id: "f-url", key: "link", type: "url" },
];

const author: BindingEntry = {
  id: "e2",
  path: "/team/anna",
  slug: "anna",
  fields: [{ id: "title", key: "title", type: "text" }],
  cells: { title: "Anna" },
};

const entry: BindingEntry = {
  id: "e1",
  path: "/blog/erster",
  slug: "erster",
  titleField: "title",
  fields: FIELDS,
  cells: {
    title: "Erster Beitrag",
    "f-body": "**Fett** und <script>alert(1)</script>",
    "f-cover": { assetId: "a1" },
    "f-author": "e2",
    "f-url": "https://example.test/ziel",
  },
};

function source(): BindingSource {
  return {
    entry,
    site: { name: "Musterstudio" },
    query: { seite: "2" },
    entries: { e2: author },
  };
}

function node(type: string, props: Record<string, unknown>): Node {
  return { id: `n-${type}`, type, props: props as Node["props"] };
}

describe("binding resolver", () => {
  it("resolves whole-prop bindings including dotted relation paths", () => {
    const result = resolveNodeProps({
      node: node("content", {
        title: { $entry: "title" },
        body: { $entry: "body" },
        background: { $entry: "author.title" },
      }),
      definition: definitions.get("content"),
      source: source(),
    });
    expect(result.issues).toEqual([]);
    expect(result.props.title).toBe("Erster Beitrag");
    expect(result.props.background).toBe("Anna");
  });

  it("renders markdown bodies through the sanitizer", () => {
    const result = resolveNodeProps({
      node: node("content", { body: { $entry: "body" } }),
      definition: definitions.get("content"),
      source: source(),
    });
    expect(result.issues).toEqual([]);
    const html = String(result.props.body);
    expect(html).toContain("<strong>Fett</strong>");
    expect(html).not.toContain("<script>");
  });

  it("fills text-mix tokens from entry, site and route query", () => {
    const result = resolveNodeProps({
      node: node("card", {
        title: "Neues von {entry.title}",
        text: "{site.name}: Seite {route.query.seite} — {parentEntry.title}",
      }),
      definition: definitions.get("card"),
      source: { ...source(), parentEntry: author },
    });
    expect(result.issues).toEqual([]);
    expect(result.props.title).toBe("Neues von Erster Beitrag");
    expect(result.props.text).toBe("Musterstudio: Seite 2 — Anna");
  });

  it("reports type mismatches and unknown fields as issues", () => {
    const mismatch = resolveNodeProps({
      node: node("content", { body: { $entry: "cover" } }),
      definition: definitions.get("content"),
      source: source(),
    });
    expect(mismatch.issues[0]?.field).toBe("props.body");
    expect(mismatch.issues[0]?.message).toContain("media");

    const unknown = resolveNodeProps({
      node: node("content", { body: { $entry: "gibt-es-nicht" } }),
      definition: definitions.get("content"),
      source: source(),
    });
    expect(unknown.issues[0]?.field).toBe("props.body");

    const unknownToken = resolveNodeProps({
      node: node("card", { title: "Text {entry.nope}" }),
      definition: definitions.get("card"),
      source: source(),
    });
    expect(unknownToken.issues[0]?.message).toContain("entry.nope");
  });

  it("converts a url field bound to a link prop", () => {
    const result = resolveNodeProps({
      node: node("card", { link: { $entry: "link" } }),
      definition: definitions.get("card"),
      source: source(),
    });
    expect(result.issues).toEqual([]);
    expect(result.props.link).toEqual({ url: "https://example.test/ziel" });
  });

  it("expands a collection-list into one resolved card per entry", () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["list"] },
        list: {
          id: "list",
          type: "collection-list",
          variant: "grid",
          props: { title: "Blog", pagination: "pages" },
          slots: { item: ["card-1"] },
        },
        "card-1": {
          id: "card-1",
          type: "card",
          variant: "horizontal",
          props: {
            title: { $entry: "title" },
            text: "Neues von {entry.title}",
            background: { $token: "bg.muted" },
          },
        },
      },
    };
    const expanded = expandPageTree({
      tree,
      definitions,
      source: source(),
      lists: {
        list: {
          entries: [entry, author],
          page: 2,
          pageCount: 3,
          paramName: "seite",
          path: "/blog",
        },
      },
    });
    expect(expanded.issues).toEqual([]);
    const listNode = expanded.tree.nodes.list;
    const items = listNode?.props.items as { variant: string; props: Record<string, unknown> }[];
    expect(items).toHaveLength(2);
    expect(items[0]?.variant).toBe("horizontal");
    expect(items[0]?.props.title).toBe("Erster Beitrag");
    expect(items[0]?.props.text).toBe("Neues von Erster Beitrag");
    expect(items[1]?.props.title).toBe("Anna");
    expect(listNode?.props.itemTemplate).toMatchObject({
      variant: "horizontal",
      styleProps: { background: { $token: "bg.muted" } },
    });
    expect(listNode?.props.pageInfo).toEqual({
      current: 2,
      count: 3,
      urls: ["/blog", "/blog/seite/2", "/blog/seite/3"],
    });
  });
});
