import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runImport } from "@senify/framer-import";
import { SenifyError } from "@senify/core";

// Der Projekt-Weg endet im selben Lauf wie URL, Mirror und HTML (ADR-0028,
// Schritt 3): IR, Normalisierer, Mapper, Bericht. Was hier zaehlt:
// - Die Quelle heisst im Bericht Framer-Projekt-XML, nicht SSR.
// - Keine Zeitsteuerung wird behauptet: der Fund `motion-absent` steht.
// - Eine kaputte oder nicht passende XML wirft; kein Rueckfall auf eine URL.

const FIXTURES = join(fileURLToPath(new URL("./fixtures/unframer", import.meta.url)));
const PROJECT_XML = readFileSync(join(FIXTURES, "project.xml"), "utf8");
const PAGE_XML = readFileSync(join(FIXTURES, "page-home.xml"), "utf8");

const source = (overrides: Partial<{ pageXml: string; pagePath: string }> = {}) => ({
  kind: "project" as const,
  projectXml: PROJECT_XML,
  pageXml: overrides.pageXml ?? PAGE_XML,
  pagePath: overrides.pagePath ?? "/",
});

describe("runImport mit Framer-Projekt", () => {
  it("laeuft durch IR, Normalisierer und Mapper und nennt die Quelle beim Namen", async () => {
    const run = await runImport({ source: source() });
    expect(run.document.ir).toBe(1);
    expect(run.normalized.stats.nodes).toBeGreaterThan(0);
    expect(run.mapped.document.nodes["root"]).toBeDefined();
    expect(run.irHash).toMatch(/^ir1:/);
    expect(run.report.steps[0]).toContain("Framer-Projekt-XML");
    expect(run.report.steps[0]).not.toContain("SSR-HTML");
  });

  it("sagt, dass die Projekt-XML keine Zeitsteuerung traegt", async () => {
    const run = await runImport({ source: source() });
    expect(run.report.findings.some((finding) => finding.kind === "motion-absent")).toBe(true);
  });

  it("wirft bei kaputter Projekt-XML statt halb zu importieren", async () => {
    await expect(
      runImport({
        source: { kind: "project", projectXml: "<Project", pageXml: PAGE_XML, pagePath: "/" },
      }),
    ).rejects.toBeInstanceOf(SenifyError);
  });

  it("wirft, wenn die Seiten-XML einen anderen Pfad traegt als uebergeben", async () => {
    await expect(runImport({ source: source({ pagePath: "/about" }) })).rejects.toThrow(
      "Seiten-XML traegt den Pfad /, uebergeben war /about",
    );
  });
});
