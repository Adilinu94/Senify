import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapDocument, mapUnframerProject, normalize } from "@senify/framer-import";

const FLUFFY = join(fileURLToPath(new URL("./fixtures/unframer/fluffy", import.meta.url)));
const CAPTURED = "2026-11-05T12:00:00.000Z";

describe("Unframer-IR: Code-Komponenten (fluffy-rectangle, gemessen 05.11.2026)", () => {
  it("erkennt CodeComponents und mappt bekannte als natives Widget, unbekannte als Platte", () => {
    const document = mapUnframerProject({
      projectXml: readFileSync(join(FLUFFY, "project.xml"), "utf8"),
      pages: [{ path: "/", xml: readFileSync(join(FLUFFY, "page-home.xml"), "utf8") }],
      capturedAt: CAPTURED,
    });
    const root = document.pages[0]?.root;
    const desktop = root?.children[0];
    const wave = desktop?.children.find((n) => n.name === "WaveBackground");
    const form = desktop?.children.find((n) => n.name === "FormPopup");
    const frame = desktop?.children.find((n) => n.name === "Frame");
    expect(wave?.kind).toBe("placeholder");
    expect(wave?.componentType).toBe("WaveBackground.tsx");
    expect(form?.kind).toBe("placeholder");
    expect(form?.componentType).toBe("FormPopup.tsx");
    expect(frame?.kind).toBe("frame");
    const codeFindings = document.findings.filter((f) => f.kind === "code-component");
    expect(codeFindings).toHaveLength(2);
    expect(codeFindings[0]?.evidence).toContain("codeFileId=cc-wave");
    expect(codeFindings[1]?.evidence).toContain("codeFileId=cc-form");
    expect(codeFindings.every((f) => f.severity === "warn")).toBe(true);
    // propertyControls nicht gemessen/erfunden (siehe code-files.json, alle false)
    const facts = JSON.parse(readFileSync(join(FLUFFY, "code-files.json"), "utf8")) as { hasPropertyControls: boolean }[];
    expect(facts.every((f) => f.hasPropertyControls === false)).toBe(true);

    const normalized = normalize(document);
    const mapped = mapDocument(document, normalized.rules);
    const nodes = mapped.document.nodes as Record<string, { primitive: string; props: Record<string, unknown> }>;
    // WaveBackground ist portiert: natives, bearbeitbares Widget statt Platte.
    const waveId = mapped.nodeIdByIrKey["/#n-wave"];
    expect(waveId).toBeDefined();
    expect(nodes[waveId as string]?.primitive).toBe("wave-background");
    expect(String(nodes[waveId as string]?.props["label"] ?? "")).not.toContain("Platte");
    // FormPopup ist nicht portiert: bleibt eine ehrliche Platte.
    const formId = mapped.nodeIdByIrKey["/#n-form"];
    expect(formId).toBeDefined();
    expect(nodes[formId as string]?.primitive).toBe("payload");
    expect(String(nodes[formId as string]?.props["label"] ?? "")).toContain("Platte");
  });
});
