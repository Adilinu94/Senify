import { describe, expect, it } from "vitest";
import { loadDocument, serializeDocument, toCssDocument } from "@senify/editor/state";
import { compileCssReport } from "@senify/widget-engine";
import { styleRulesReport } from "@senify/renderer";
import type { NodeTree } from "@senify/section-sdk";
import { editorDocumentToNodeTree } from "../src/imports.ts";
import { cloneTree, toNodeTree } from "../src/mutations/tree.ts";

describe("versionierter Framer-Ausgabezustand", () => {
  it("übersteht Editor-Laden, Serialisierung und Baumkonvertierung ohne CSS-Ausgabe", () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: {
          id: "root", type: "page", props: { color: "#112233" }, children: ["heading"],
          framerImport: { output: "structure" },
        },
        heading: { id: "heading", type: "heading", props: { text: "Hallo" } },
      },
    };
    const loaded = loadDocument(tree).document;
    expect(loaded.nodes.root?.framerImport).toEqual({ output: "structure" });
    const reloaded = loadDocument(JSON.parse(serializeDocument(loaded))).document;
    expect(reloaded.nodes.root?.framerImport).toEqual({ output: "structure" });
    const roundtrip = editorDocumentToNodeTree(reloaded);
    expect(roundtrip.nodes.root?.framerImport).toEqual({ output: "structure" });
    expect(toNodeTree(cloneTree(roundtrip)).nodes.root?.framerImport).toEqual({ output: "structure" });
    const editorCss = compileCssReport(toCssDocument(reloaded));
    const releaseCss = styleRulesReport([{ path: "/", tree: roundtrip }], []);
    expect(editorCss.css).toContain("#112233");
    expect(releaseCss.css).toContain("#112233");
    expect(editorCss.css).not.toMatch(/framer|structure/i);
    expect(releaseCss.css).not.toMatch(/framer|structure/i);
    expect(editorCss.diagnostics).toEqual([]);
    expect(releaseCss.diagnostics).toEqual([]);
  });
});
