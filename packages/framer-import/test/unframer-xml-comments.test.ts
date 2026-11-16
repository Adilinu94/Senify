import { describe, expect, it } from "vitest";
import { mapUnframerProject, parseUnframerXml } from "../src/unframer-ir.ts";
import { mapDocument, normalize } from "../src/index.ts";

// Die Unframer-MCP schreibt Kommentare INNERHALB eines Tags (gemessen an
// fluffy-rectangle-418998, 14.11.2026): `<!-- the component id this instance
// uses -->` steht vor `componentId`. Ohne Bereinigung endet das Tag am `>`
// des Kommentar-Endes und verliert `componentId` — die Code-Component wäre
// nicht mehr als Widget erkennbar.

const PROJECT_XML = `<Project name="Fluffy">
  <Pages><Page nodeId="page-home" path="/" /></Pages>
  <CodeComponents>
    <CodeComponent codeFileId="cc-wave" path="WaveBackground.tsx" />
  </CodeComponents>
</Project>`;

const PAGE_XML = `<Desktop nodeId="d" width="1200px">
  <WaveBackground
      nodeId="n-wave"
      position="fixed"
      width="100%"
      height="100%"
      <!-- the component id this instance uses -->
      componentId="cc-wave"
   />
</Desktop>`;

describe("Unframer-XML mit Inline-Kommentaren", () => {
  it("parsst ein Tag mit Kommentar vor dem letzten Attribut", () => {
    const root = parseUnframerXml(PAGE_XML, "test");
    const wave = root.children.find((c) => c.name === "WaveBackground");
    expect(wave?.attrs["componentId"]).toBe("cc-wave");
    expect(wave?.attrs["position"]).toBe("fixed");
  });

  it("mappt die kommentierte Code-Component trotzdem als natives Widget", () => {
    const document = mapUnframerProject({
      projectXml: PROJECT_XML,
      pages: [{ path: "/", xml: PAGE_XML }],
      capturedAt: "2026-11-14T12:00:00.000Z",
    });
    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = Object.values(mapped.document.nodes) as { primitive: string }[];
    expect(nodes.some((n) => n.primitive === "wave-background")).toBe(true);
  });
});