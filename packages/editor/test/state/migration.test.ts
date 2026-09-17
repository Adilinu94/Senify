import { describe, expect, it } from "vitest";
import {
  detectDocumentVersion,
  loadDocument,
  migrateV1ToV2,
  parseDocument,
  reindexDocument,
  restoreLastValid,
  serializeDocument,
  validateDocument,
  type EditorDocument,
} from "@senify/editor/state";
import { baseStore, emptyV2Document, v1Tree } from "./fixtures.ts";

describe("format version detection", () => {
  it("tells v1 and v2 apart", () => {
    expect(detectDocumentVersion(v1Tree())).toBe(1);
    expect(detectDocumentVersion(baseStore().document)).toBe(2);
    expect(detectDocumentVersion({})).toBeUndefined();
    expect(detectDocumentVersion("nope")).toBeUndefined();
  });
});

describe("v1 -> v2 migration", () => {
  it("renames the root, keeps values and folds overrides into device keys", () => {
    const document = migrateV1ToV2(v1Tree());
    expect(document.version).toBe(2);
    expect(document.nodes["page000001"]?.primitive).toBe("root");
    expect(document.nodes["frame000001"]?.props).toEqual({
      display: "flex",
      display_tablet: "grid",
    });
    expect(document.nodes["head000001"]?.props).toEqual({
      text: "Hi",
      fontSize: 24,
      fontSize_mobile: 16,
    });
    expect(document.classes).toEqual({});
    expect(validateDocument(document)).toEqual([]);
  });

  it("loads a v1 tree with the migrated status", () => {
    const result = loadDocument(v1Tree());
    expect(result.status).toBe("migrated");
    expect(result.issues).toEqual([]);
    expect(result.document.nodes["page000001"]?.primitive).toBe("root");
  });

  it("loads a v2 document with the loaded status", () => {
    const result = loadDocument(baseStore().document);
    expect(result.status).toBe("loaded");
  });
});

describe("reindexing", () => {
  it("drops dangling references and unreachable nodes", () => {
    const document: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["gone", "kept"] },
        kept: { id: "kept", primitive: "text", props: {} },
        orphan: { id: "orphan", primitive: "text", props: {} },
      },
      classes: {},
    };
    const reindexed = reindexDocument(document);
    expect(reindexed.nodes["root"]?.children).toEqual(["kept"]);
    expect(reindexed.nodes["orphan"]).toBeUndefined();
  });
});

describe("round-trip", () => {
  it("load, change, save, load again yields the same tree", () => {
    const store = baseStore();
    store.apply({ op: "createStyleRule", name: "cta", props: { background: "#f00" } });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 18,
      device: "tablet",
    });
    const saved = serializeDocument(store.document);
    const reloaded = loadDocument(parseDocument(saved));
    expect(reloaded.status).toBe("loaded");
    expect(reloaded.document).toEqual(store.document);
    // A second save/load cycle is stable.
    expect(serializeDocument(reloaded.document)).toBe(saved);
  });

  it("round-trips the migrated document", () => {
    const migrated = loadDocument(v1Tree()).document;
    const reloaded = loadDocument(parseDocument(serializeDocument(migrated)));
    expect(reloaded.document).toEqual(migrated);
  });
});

describe("rollback", () => {
  it("restores the last valid document when the load is broken", () => {
    const fallback = baseStore().document;
    const broken: unknown = {
      version: 2,
      rootNodeId: "root",
      // The root is not a "root" primitive, and reindexing cannot fix that.
      nodes: { root: { id: "root", primitive: "frame", props: {} } },
      classes: {},
    };
    const result = loadDocument(broken, { fallback });
    expect(result.status).toBe("restored");
    expect(result.document).toBe(fallback);
    expect(result.issues[0]).toMatch(/inconsistent/);
  });

  it("throws without a fallback", () => {
    expect(() =>
      loadDocument({ version: 2, rootNodeId: "r", nodes: {}, classes: {} }),
    ).toThrow(/inconsistent|missing/i);
  });

  it("restoreLastValid is the same rollback", () => {
    const fallback = emptyV2Document();
    const result = restoreLastValid({ junk: true }, fallback);
    expect(result.status).toBe("restored");
    expect(result.document).toBe(fallback);
  });
});
