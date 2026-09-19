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
    expect(document.styleRules).toEqual([]);
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

  it("carries a v1 motion spec into the document", () => {
    const tree = v1Tree();
    const heading = tree.nodes["head000001"];
    expect(heading).toBeDefined();
    if (heading === undefined) return;
    heading.motion = { preset: "fade-up", intensity: 7 };
    const document = migrateV1ToV2(tree);
    expect(document.nodes["head000001"]?.motion).toEqual({
      preset: "fade-up",
      intensity: 7,
    });
    expect(validateDocument(document)).toEqual([]);
  });

  it("lifts the per-breakpoint hidden flags into hiddenDevices (ticket 11)", () => {
    const tree = v1Tree();
    const frame = tree.nodes["frame000001"];
    expect(frame).toBeDefined();
    if (frame === undefined) return;
    frame.overrides = { ...frame.overrides, mobile: { hidden: true } };
    const document = migrateV1ToV2(tree);
    const migrated = document.nodes["frame000001"];
    expect(migrated?.hiddenDevices).toEqual(["mobile"]);
    // The lift is additive: props of the same override still become device keys.
    expect(migrated?.props).toEqual({ display: "flex", display_tablet: "grid" });
    expect(validateDocument(document)).toEqual([]);
    // The load path keeps the field (serialize -> parse -> load).
    const reloaded = loadDocument(parseDocument(serializeDocument(document)));
    expect(reloaded.status).toBe("loaded");
    expect(reloaded.document.nodes["frame000001"]?.hiddenDevices).toEqual(["mobile"]);
  });
});

// The real pages of the running engine name their nodes by section type and use
// slots (a `hero` with a `visual` slot, a `navbar` with breakpoint overrides).
// Those are not catalog primitives, so the load must tolerate them and migrate,
// not abort (rebuild Phase 0, fifth slice; page draft of site `jEg_UhCBhjc3m1`).
describe("legacy section migration", () => {
  it("lifts a v1 page with legacy sections and a slot instead of aborting", () => {
    const tree = {
      rootNodeId: "page",
      nodes: {
        page: { id: "page", type: "page", props: {}, children: ["navbar", "hero"] },
        navbar: { id: "navbar", type: "navbar", props: { logo: "Nick" }, hidden: false },
        hero: {
          id: "hero",
          type: "hero",
          props: { headline: "Hallo" },
          slots: { visual: ["pic"] },
          overrides: { mobile: { props: { headline: "Kurz" } } },
        },
        pic: { id: "pic", type: "media", props: { aspect: "1/1" } },
      },
    };
    const result = loadDocument(tree);
    expect(result.status).toBe("migrated");
    expect(result.issues).toEqual([]);
    expect(validateDocument(result.document)).toEqual([]);
    // Nothing is dropped: the slot and the device override survive.
    expect(result.document.nodes["hero"]?.slots).toEqual({ visual: ["pic"] });
    expect(result.document.nodes["hero"]?.props["headline_mobile"]).toBe("Kurz");
    expect(result.document.nodes["page"]?.primitive).toBe("root");
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
      styleRules: [],
    };
    const reindexed = reindexDocument(document);
    expect(reindexed.nodes["root"]?.children).toEqual(["kept"]);
    expect(reindexed.nodes["orphan"]).toBeUndefined();
  });
});

describe("style rule lift", () => {
  it("lifts an old v2 document with a classes value bag", () => {
    const legacy = {
      version: 2,
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["btn"] },
        btn: { id: "btn", primitive: "button", props: {}, classes: ["cta"] },
      },
      classes: { cta: { background: "#f00" }, ghost: {} },
    };
    const result = loadDocument(legacy);
    expect(result.status).toBe("loaded");
    expect(result.document.styleRules.map((rule) => rule.name)).toEqual(["cta", "ghost"]);
    const cta = result.document.styleRules[0];
    expect(cta?.kind).toBe("class");
    expect(cta?.selector).toBe(".cta");
    expect(cta?.styles).toEqual({ background: "#f00" });
    expect(cta?.order).toBe(0);
    // The assignment still resolves against the lifted rule.
    expect(validateDocument(result.document)).toEqual([]);
    // A second cycle is stable.
    const again = loadDocument(parseDocument(serializeDocument(result.document)));
    expect(again.document).toEqual(result.document);
  });

  it("drops a corrupt entry but keeps the rest of the registry", () => {
    const result = loadDocument({
      version: 2,
      rootNodeId: "root",
      nodes: { root: { id: "root", primitive: "root", props: {} } },
      styleRules: [
        { id: "r1", name: "good", kind: "class", selector: ".good", order: 0, styles: {}, contextStyles: {} },
        { name: "no-id" },
        "junk",
      ],
    });
    expect(result.document.styleRules.map((rule) => rule.id)).toEqual(["r1"]);
  });
});

describe("round-trip", () => {
  it("load, change, save, load again yields the same tree", () => {
    const store = baseStore();
    store.apply({
      op: "upsertStyleRule",
      rule: {
        id: "r-cta",
        name: "cta",
        kind: "class",
        selector: ".cta",
        order: 0,
        styles: { background: "#f00" },
        states: { hover: { background: "#0f0" } },
        contextStyles: {},
        authoredBy: "agent",
      },
    });
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
      styleRules: [],
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
