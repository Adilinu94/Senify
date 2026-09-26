import { describe, expect, it } from "vitest";
import { candidatesOf, fingerprintOf } from "@senify/framer-import";

function documentWithRoots() {
  const nodes = {
    root: { id: "root", primitive: "root", props: { title: "Test" }, children: ["a", "b"] },
    a: { id: "a", primitive: "frame", props: { semantic: "section" }, children: ["a-child"] },
    "a-child": { id: "a-child", primitive: "heading", props: { text: "Titel" } },
    b: { id: "b", primitive: "frame", props: { semantic: "section" }, children: ["b-child"] },
    "b-child": { id: "b-child", primitive: "heading", props: { text: "Titel" } },
  };
  return { version: 2 as const, rootNodeId: "root", nodes, styleRules: [] };
}

describe("Kandidaten und Fingerprints", () => {
  it("erkennt gleiche Teilbäume ab zwei Vorkommen", () => {
    const candidates = candidatesOf(documentWithRoots(), "/");
    const candidate = candidates.find((entry) => entry.occurrences.length === 2);
    expect(candidate).toBeDefined();
    expect(candidate?.fingerprint).toMatch(/^struct1:/);
    expect(candidate?.reason).toContain("keine automatische");
  });

  it("ändert den Fingerprint nicht durch Node-IDs oder Asset-URLs", () => {
    const first = documentWithRoots();
    const second = {
      ...first,
      nodes: {
        ...first.nodes,
        a: { ...first.nodes.a, id: "renamed-a", children: ["renamed-child"] },
        b: { ...first.nodes.b, id: "renamed-b", children: ["renamed-child"] },
        "renamed-child": { id: "renamed-child", primitive: "heading", props: { text: "Titel" } },
        "a-child": { id: "a-child", primitive: "heading", props: { text: "Titel", assetId: "asset-1" } },
      },
    };
    const firstCandidate = candidatesOf(first, "/").find((entry) => entry.occurrences.length === 2);
    const secondCandidate = candidatesOf(second, "/").find((entry) => entry.occurrences.length === 2);
    expect(secondCandidate?.fingerprint).toBe(firstCandidate?.fingerprint);
  });

  it("ein einzelnes Vorkommen wird nicht als Kandidat gemeldet", () => {
    const document = {
      version: 2 as const,
      rootNodeId: "root",
      styleRules: [],
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["only"] },
        only: { id: "only", primitive: "frame", props: {}, children: [] },
      },
    };
    expect(candidatesOf(document, "/")).toHaveLength(0);
  });

  it("hashet denselben Wert stabil", () => {
    expect(fingerprintOf({ primitive: "frame", children: ["a"] })).toBe(
      fingerprintOf({ primitive: "frame", children: ["a"] }),
    );
  });
});
