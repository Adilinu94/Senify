import { describe, expect, it } from "vitest";
import { mapUnframerProject } from "../src/unframer-ir.ts";
import { mapDocument, normalize } from "../src/index.ts";

// Drei MCP-Format-Eigenheiten, gemessen an fluffy-rectangle-418998 (14.11.2026):
// 1. ColorStyles tragen den Wert als `light`/`dark`, nicht als `value`/`color`.
// 2. Der WaveBackground-Wrapper trägt left:-860px; gerendert ist die Komponente
//    ein fixed Vollbild-Hintergrund (inset:0). Der Import normalisiert die Box.
// 3. TextStyles nennen die Familie ohne Fallback und mit Gewicht im Namen
//    (`FS;Manrope-regular`). Ohne Sans-Fallback rendert der Browser Serif, und
//    ein festes 700 überschreibt das Gewicht des Stils.

const PROJECT_XML = `<Project name="Fluffy">
  <Pages><Page nodeId="page-home" path="/" /></Pages>
  <ColorStyles>
    <ColorStyle path="/Colors/BG dark" light="rgb(17, 17, 17)" dark="" />
    <ColorStyle path="/Colors/Primary" light="rgb(140, 255, 46)" dark="" />
  </ColorStyles>
  <CodeComponents>
    <CodeComponent codeFileId="cc-wave" path="WaveBackground.tsx" />
  </CodeComponents>
  <TextStyles>
    <TextStyle path="/Text Styles/H2" font="FS;Manrope-regular" fontSize="92px" lineHeight="1em" tag="h2" />
  </TextStyles>
</Project>`;

const PAGE_XML = `<Desktop nodeId="d" width="1200px">
  <WaveBackground nodeId="n-wave" position="fixed" width="100%" height="100%" top="0px" left="-860px" componentId="cc-wave" />
  <Heading nodeId="n-title" inlineTextStyle="/Text Styles/H2">Hey, ich bin</Heading>
</Desktop>`;

function mapped(mode: "dna" | "fidelity" = "dna") {
  const document = mapUnframerProject({
    projectXml: PROJECT_XML,
    pages: [{ path: "/", xml: PAGE_XML }],
    capturedAt: "2026-11-14T12:00:00.000Z",
  });
  const normalized = normalize(document, { mode });
  return { document, mapped: mapDocument(document, normalized.rules, { mode }) };
}

describe("Unframer-MCP-Format", () => {
  it("liest ColorStyles aus dem light-Attribut", () => {
    const { document } = mapped();
    const colors = document.styles.colors;
    expect(colors.find((c) => c.id === "/Colors/BG dark")?.value).toBe("rgb(17, 17, 17)");
    expect(colors.find((c) => c.id === "/Colors/Primary")?.value).toBe("rgb(140, 255, 46)");
    expect(
      document.findings.some((f) => f.kind === "unsupported-declaration" && f.evidence.includes("/Colors/")),
    ).toBe(false);
  });

  it("behaelt das Gewicht des Textstils und gibt der Familie einen Sans-Fallback", () => {
    for (const mode of ["dna", "fidelity"] as const) {
      const { mapped: m } = mapped(mode);
      const nodes = Object.values(m.document.nodes) as {
        primitive: string;
        classes?: string[];
        props: Record<string, unknown>;
      }[];
      const heading = nodes.find((n) => n.primitive === "heading" && n.props["text"] === "Hey, ich bin");
      expect(heading, mode).toBeDefined();
      expect(heading?.props["fontWeight"], mode).toBe("400");
      const rule = m.document.styleRules.find((entry) => entry.name === heading?.classes?.[0]);
      expect(rule?.styles["fontWeight"], mode).toBe("400");
      expect(rule?.styles["fontFamily"], mode).toBe("Manrope-regular, system-ui, sans-serif");
    }
  });

  it("markiert Projektregeln, damit der Bake Typografie und Farbe behaelt", () => {
    const { mapped: m } = mapped("fidelity");
    const rule = m.document.styleRules.find((entry) => entry.styles["fontSize"] === "92px");
    expect(rule).toBeDefined();
    expect(rule?.origin).toMatchObject({ source: "framer-import", keepBase: true });
  });

  it("normalisiert die WaveBackground-Box auf vollflächig inset:0", () => {
    const { mapped: m } = mapped();
    const nodes = Object.values(m.document.nodes) as { primitive: string; props: Record<string, unknown> }[];
    const wave = nodes.find((n) => n.primitive === "wave-background");
    expect(wave).toBeDefined();
    expect(wave?.props["position"]).toBe("fixed");
    expect(wave?.props["left"]).toBe("0px");
    expect(wave?.props["top"]).toBe("0px");
    expect(wave?.props["width"]).toBe("100%");
    expect(wave?.props["height"]).toBe("100%");
  });
});