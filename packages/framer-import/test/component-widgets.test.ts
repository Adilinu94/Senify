import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapDocument, mapUnframerProject, normalize } from "@senify/framer-import";

const FIXTURE = fileURLToPath(new URL("./fixtures/unframer/components", import.meta.url));
const CAPTURED = "2026-11-15T12:00:00.000Z";

type MappedNode = { primitive: string; props: Record<string, unknown> };

describe("Projekt-XML: benannte Framer-Komponenten als DOM-Widgets (ADR-0038)", () => {
  it("bildet Navbar, Step 2, Ticker reviews item und Footer 2 auf Widgets ab", () => {
    const document = mapUnframerProject({
      projectXml: readFileSync(`${FIXTURE}/project.xml`, "utf8"),
      pages: [{ path: "/", xml: readFileSync(`${FIXTURE}/page.xml`, "utf8") }],
      capturedAt: CAPTURED,
    });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = Object.values(mapped.document.nodes) as MappedNode[];
    const byPrimitive = new Map(nodes.map((node) => [node.primitive, node]));

    expect(byPrimitive.has("framer-navbar")).toBe(true);
    expect(byPrimitive.has("framer-footer")).toBe(true);
    expect(byPrimitive.has("framer-reviews")).toBe(true);
    const step = byPrimitive.get("framer-step");
    expect(step).toBeDefined();
    expect(step?.props["nr"]).toBe("01");
    expect(step?.props["title"]).toBe("Webdesign");
    expect(step?.props["text"]).toBe("Ich gestalte Webseiten.");
    expect(step?.props["points"]).toEqual([
      { label: "Klare Layouts:", text: "Ruhige Farben." },
      { label: "Responsiv:", text: "Auf jedem Gerät." },
    ]);

    // Keine Platte für diese vier: der Placeholder-Zähler bleibt bei null.
    expect(mapped.stats.placeholders).toBe(0);
    const info = mapped.findings.filter((finding) => finding.kind === "code-component" && finding.severity === "info");
    expect(info).toHaveLength(4);
    expect(info.map((finding) => finding.message).join("\n")).toContain("framer-footer");
  });

  it("lässt unbekannte Komponenten weiter als Rahmen stehen", () => {
    const document = mapUnframerProject({
      projectXml: `<Project><Pages><Page nodeId="p" path="/" /></Pages><Components><Component nodeId="c" name="Mystery" /></Components></Project>`,
      pages: [{ path: "/", xml: `<Desktop nodeId="d" width="1200px"><Mystery nodeId="m" width="1fr" componentId="c" /></Desktop>` }],
      capturedAt: CAPTURED,
    });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = Object.values(mapped.document.nodes) as MappedNode[];
    expect(nodes.some((node) => node.primitive === "frame")).toBe(true);
    expect(nodes.some((node) => node.primitive.startsWith("framer-"))).toBe(false);
  });
});
