import { describe, expect, it } from "vitest";
import { IR_VERSION, parseIr, type FramerIrDocument } from "@senify/framer-import";

// The IR parser is tolerant (the `parseStyleRule` stance): a broken entry
// drops, a broken document reports why — it never throws.

function validDocument(): FramerIrDocument {
  return {
    ir: IR_VERSION,
    source: {
      kind: "html",
      url: null,
      projectId: null,
      capturedAt: "2026-09-23T00:00:00.000Z",
      contentHash: "abc123",
    },
    breakpoints: [{ id: "72rtr7", minWidth: 1200, maxWidth: null, name: null }],
    pages: [
      {
        path: "/",
        title: null,
        root: {
          key: "root",
          kind: "frame",
          name: null,
          componentType: null,
          baseClasses: [],
          tag: "root",
          href: null,
          states: [],
          children: [
            {
              key: "n1",
              kind: "text",
              name: "Titel",
              componentType: null,
              baseClasses: ["framer-abc"],
              tag: "h2",
              href: null,
              states: [
                {
                  device: "desktop",
                  hiddenAt: [],
                  variantHash: null,
                  visual: { color: "#111" },
                  layout: null,
                  box: null,
                  text: {
                    content: "Hallo",
                    presetId: null,
                    inline: { fontSize: "32px" },
                    tag: "h2",
                  },
                },
              ],
              children: [],
              appearId: null,
              stylesPresetId: null,
              svg: null,
            },
          ],
          appearId: null,
          stylesPresetId: null,
          svg: null,
        },
      },
    ],
    styles: {
      colors: [{ id: "tok-1", name: null, value: "#d7ff6f" }],
      textPresets: [],
      fonts: [],
    },
    assets: [],
    motion: [],
    findings: [],
  };
}

describe("parseIr", () => {
  it("accepts a valid document round-trip", () => {
    const document = validDocument();
    const result = parseIr(JSON.parse(JSON.stringify(document)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.pages[0]?.root.children[0]?.name).toBe("Titel");
      expect(result.document.styles.colors[0]?.value).toBe("#d7ff6f");
    }
  });

  it("rejects a wrong version with a reason", () => {
    const document = { ...validDocument(), ir: 2 };
    const result = parseIr(document);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("version");
  });

  it("rejects a document without a content hash", () => {
    const document = validDocument();
    document.source.contentHash = "";
    const result = parseIr(document);
    expect(result.ok).toBe(false);
  });

  it("drops broken nodes but keeps the rest", () => {
    const document = validDocument() as unknown as Record<string, unknown>;
    const pages = document.pages as { root: Record<string, unknown> }[];
    const root = pages[0]?.root;
    expect(root).toBeDefined();
    if (root === undefined) return;
    root.children = [
      { key: "ok", kind: "frame", states: [], children: [], baseClasses: [] },
      { noKey: true },
      { key: "", kind: "frame" },
      { key: "bad-kind", kind: "teleport", states: [], children: [], baseClasses: [] },
    ];
    const result = parseIr(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.pages[0]?.root.children).toHaveLength(1);
    }
  });

  it("normalizes unknown finding kinds and severities", () => {
    const document = validDocument() as unknown as Record<string, unknown>;
    document.findings = [
      { kind: "mystery", message: "x", severity: "loud", evidence: "", suggestion: "" },
    ];
    const result = parseIr(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const finding = result.document.findings[0];
      expect(finding?.kind).toBe("unknown-node");
      expect(finding?.severity).toBe("warn");
    }
  });

  it("keeps only known motion libraries", () => {
    const document = validDocument() as unknown as Record<string, unknown>;
    document.motion = [
      { nodeKey: "n1", library: "lenis", trigger: "scroll", params: {}, raw: "x" },
      { nodeKey: "n1", library: "quantum", trigger: "hover", params: {}, raw: "y" },
    ];
    const result = parseIr(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.motion[0]?.library).toBe("lenis");
      expect(result.document.motion[1]?.library).toBe("unknown");
    }
  });
});
