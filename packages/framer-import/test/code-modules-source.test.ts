import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { captureFixture } from "@senify/framer-import";

// Woher der Import den Code einer Framer-Komponente erfährt, ist die Frage, an
// der S3b hängt. `capture-html.ts` liest dafür `data-framer-module` und seine
// Geschwister (`-kind`, `-license`, `-adapter`, `-poster`). Diese Attribute
// erfindet der Import - KEIN echter Framer-Export schreibt sie.
//
// Gemessen am 22.10.2026 an den drei gespeicherten Exporten (auch an der
// ungetrimmten Quelle in `C:\Users\adini\FramerExport`, also mit `scripts/`):
//   * `data-framer-module=` kommt in allen drei `index.html` 0-mal vor,
//   * die Code-Module liegen unter `scripts/modules/*.js`, referenziert von
//     keiner Datei des Exports,
//   * im gerenderten DOM der veröffentlichten Earn-Seite kommt es ebenfalls
//     0-mal vor - auch nicht an den fünf Sternen, der bekannten
//     Code-Komponente. Die Sterne stehen dort als reines `<svg>` in einem
//     `<div class="framer-ey6ty2-container">`.
//
// Der einzige Ort im Repo, der das Attribut schreibt, ist
// `packages/engine/test/imports.test.ts` - ein selbstgebautes HTML. Der
// Adapter-Vertrag ist damit gegen eine Quelle belegt, die es nicht gibt. Dieser
// Test hält den Befund fest, damit die Zeile "S3b belegt" nicht zurückkehrt.

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const MODULE_ATTR = "data-framer-module";

describe("Framer-Code-Module: was der Export wirklich hergibt", () => {
  for (const fixture of ["framer-fluffy-rectangle-418998", "framer-easier-train-154753", "framer-stupendous-football-158496"]) {
    it(`${fixture}: kein Knoten trägt data-framer-module, also entsteht kein codeModule`, () => {
      const document = captureFixture(join(FIXTURES, fixture), "/");
      // The attribute the importer looks for is not in the source.
      const nodes: unknown[] = [];
      const visit = (node: { children: unknown[]; codeModule?: unknown }): void => {
        nodes.push(node);
        for (const child of node.children as { children: unknown[]; codeModule?: unknown }[]) visit(child);
      };
      visit(document.pages[0]?.root as never);
      expect(nodes.filter((node) => (node as { codeModule?: unknown }).codeModule !== undefined)).toHaveLength(0);
    });
  }

  it("ein Export mit scripts/ bleibt ohne codeModule, weil das HTML die Module nicht nennt", () => {
    // Ein Mirror MIT dem Skript-Ordner: die Dateien liegen da, das HTML sagt
    // aber nichts von ihnen. Der Import kann sie also nicht zuordnen - und
    // erfindet nichts.
    const fixture = join(FIXTURES, "framer-stupendous-football-158496");
    const work = mkdtempSync(join(tmpdir(), "senify-modules-"));
    try {
      cpSync(fixture, work, { recursive: true });
      const document = captureFixture(work, "/");
      const withModule: unknown[] = [];
      const visit = (node: { children: unknown[]; codeModule?: unknown }): void => {
        if (node.codeModule !== undefined) withModule.push(node);
        for (const child of node.children as { children: unknown[]; codeModule?: unknown }[]) visit(child);
      };
      visit(document.pages[0]?.root as never);
      expect(withModule).toHaveLength(0);
      // The import reports the gap instead of silently dropping it: without a
      // module reference there is no payload, and no finding claims one.
      expect(document.findings.some((finding) => finding.kind === "code-component")).toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("die Fundstelle des Attributs ist der Import selbst, nicht Framer", () => {
    // Der Nachweis als Text: der Name taucht in keiner Fixture auf. Ändert
    // sich das (ein echter Export mit Modulverweis), wird dieser Test rot und
    // zwingt zur Neubewertung von S3b.
    for (const fixture of ["framer-fluffy-rectangle-418998", "framer-easier-train-154753", "framer-stupendous-football-158496"]) {
      const document = captureFixture(join(FIXTURES, fixture), "/");
      expect(JSON.stringify(document)).not.toContain(MODULE_ATTR);
    }
  });
});
