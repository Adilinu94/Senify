import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readReferenzsites, planReferenzsites, REFERENZSITES_CAPTURED_AT } from "@senify/engine";

// The folder reader of the local reference collection: metadata out of info.md,
// the documents, both hero screenshots and the issues of an incomplete folder.

function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

const INFO = [
  "# Achilles - Info",
  "",
  "## Übersicht",
  "",
  "| Eigenschaft | Wert |",
  "|-------------|------|",
  "| **Name** | Achilles |",
  "| **Kategorie** | Business (Dev-Tool / KI) |",
  "| **Framer-Kategorie** | AI |",
  "| **Ersteller** | Arthur Duchesne ([@arthurdch](https://www.framer.com/@arthurdch/)) |",
  "| **Preis** | Kostenlos (Free) |",
  "| **Marktplatz-Seite** | [achilles](https://www.framer.com/marketplace/templates/achilles/) |",
  "| **Live-Preview (Framer)** | [https://getachilles.framer.ai/](https://getachilles.framer.ai/) |",
  "| **Remix-Link** | [Template duplizieren](https://framer.link/6qZJXsm) |",
  "",
  "## Beschreibung",
  "",
  "AI SaaS & Developer Tool Template by Arthur Duchesne",
  "",
  "> AI SaaS & Developer Tool Template.",
  "",
].join("\n");

describe("referenzsites reader", () => {
  let root = "";

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "senify-referenzsites-"));
    const complete = join(root, "achilles");
    mkdirSync(complete);
    writeFileSync(join(complete, "info.md"), INFO, "utf8");
    writeFileSync(join(complete, "design.md"), "# Achilles\n\n## Colors\n", "utf8");
    writeFileSync(join(complete, "design-guidelines.md"), "# Guidelines\n", "utf8");
    writeFileSync(join(complete, "design-components.md"), "# Components\n", "utf8");
    writeFileSync(join(complete, "hero-desktop.png"), pngBytes(1920, 1080));
    writeFileSync(join(complete, "hero-mobile.png"), pngBytes(360, 800));

    // A folder without info.md and one without a preview link.
    mkdirSync(join(root, "ohne-info"));
    writeFileSync(join(root, "ohne-info", "design.md"), "# Leer\n", "utf8");
    mkdirSync(join(root, "ohne-url"));
    writeFileSync(
      join(root, "ohne-url", "info.md"),
      "| **Name** | Ohne URL |\n",
      "utf8",
    );
    writeFileSync(join(root, "ohne-url", "design.md"), "# Leer\n", "utf8");

    // A folder without a desktop shot, and one without a mobile shot.
    mkdirSync(join(root, "ohne-bild"));
    writeFileSync(join(root, "ohne-bild", "info.md"), INFO, "utf8");
    writeFileSync(join(root, "ohne-bild", "design.md"), "# Leer\n", "utf8");
    mkdirSync(join(root, "nur-desktop"));
    writeFileSync(join(root, "nur-desktop", "info.md"), INFO, "utf8");
    writeFileSync(join(root, "nur-desktop", "design.md"), "# Leer\n", "utf8");
    writeFileSync(join(root, "nur-desktop", "hero-desktop.png"), pngBytes(1920, 1080));

    // A second complete folder of another category, so the collection order
    // (size first, then alphabetically) is testable.
    mkdirSync(join(root, "atelier"));
    writeFileSync(
      join(root, "atelier", "info.md"),
      INFO.replace("| **Kategorie** | Business (Dev-Tool / KI) |", "| **Kategorie** | Portfolio (Fotografie) |"),
      "utf8",
    );
    writeFileSync(join(root, "atelier", "design.md"), "# Leer\n", "utf8");
    writeFileSync(join(root, "atelier", "hero-desktop.png"), pngBytes(1920, 1080));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads metadata, documents and both screenshots", () => {
    const { records, issues } = readReferenzsites(root, { only: ["achilles"] });
    expect(issues).toEqual([]);
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record?.name).toBe("Achilles");
    expect(record?.category).toBe("Business");
    expect(record?.subcategory).toBe("Dev-Tool / KI");
    expect(record?.creator).toContain("Arthur Duchesne");
    expect(record?.marketUrl).toContain("framer.com/marketplace");
    expect(record?.sourceUrl).toBe("https://getachilles.framer.ai/");
    expect(record?.description).toBe("AI SaaS & Developer Tool Template by Arthur Duchesne");
    expect(record?.capturedAt).toBe(REFERENZSITES_CAPTURED_AT);
    expect(record?.documents.design).toContain("## Colors");
    expect(record?.documents.guidelines).toContain("# Guidelines");
    expect(record?.documents.components).toContain("# Components");
    expect(record?.images.map((image) => [image.breakpoint, image.width, image.height])).toEqual([
      ["desktop", 1920, 1080],
      ["mobile", 360, 800],
    ]);
  });

  it("keeps reading when the mobile shot is missing", () => {
    const { records } = readReferenzsites(root, { only: ["nur-desktop"] });
    expect(records[0]?.images.map((image) => image.breakpoint)).toEqual(["desktop"]);
  });

  it("reports incomplete folders instead of skipping them silently", () => {
    const { records, issues } = readReferenzsites(root);
    const reasons = new Map(issues.map((issue) => [issue.slug, issue.reason]));
    expect(reasons.get("ohne-info")).toBe("info.md fehlt");
    expect(reasons.get("ohne-url")).toBe("Live-Preview fehlt in info.md");
    expect(reasons.get("ohne-bild")).toBe("hero-desktop.png fehlt oder ist unlesbar");
    // The two readers above stay clean, the other two folders are read as well.
    expect(records.map((record) => record.slug)).toEqual(["achilles", "atelier", "nur-desktop"]);
  });

  it("honours limit and only", () => {
    expect(readReferenzsites(root, { limit: 1 }).records).toHaveLength(1);
    expect(readReferenzsites(root, { only: ["gibt-es-nicht"] }).records).toEqual([]);
  });

  it("splits the category into main category and family", () => {
    const categoryOf = (value: string): { category: string; subcategory: string | null } => {
      const dir = mkdtempSync(join(root, "kategorie-"));
      writeFileSync(
        join(dir, "info.md"),
        INFO.replace("Business (Dev-Tool / KI)", value),
        "utf8",
      );
      writeFileSync(join(dir, "design.md"), "# Leer\n", "utf8");
      writeFileSync(join(dir, "hero-desktop.png"), pngBytes(1920, 1080));
      const { records } = readReferenzsites(root, { only: [basename(dir)] });
      rmSync(dir, { recursive: true, force: true });
      const found = records[0];
      return { category: found?.category ?? "", subcategory: found?.subcategory ?? null };
    };
    // "Business (Dev-Tool / KI)": the parenthesis carries the family.
    expect(categoryOf("Business (Dev-Tool / KI)")).toEqual({
      category: "Business",
      subcategory: "Dev-Tool / KI",
    });
    // "Business / SaaS": the slash separates main category and family.
    expect(categoryOf("Business / SaaS")).toEqual({ category: "Business", subcategory: "SaaS" });
    // A category without either simply stays whole.
    expect(categoryOf("Portfolio")).toEqual({ category: "Portfolio", subcategory: null });
  });

  it("plans collections by size and entries with their documents", () => {
    const { records } = readReferenzsites(root);
    const plan = planReferenzsites(records);
    // Two Business folders win over the single Portfolio folder.
    expect(plan.collections).toEqual([
      {
        name: "Business",
        count: 2,
        position: 0,
        description: expect.stringContaining("Stand 2026-09-19"),
      },
      {
        name: "Portfolio",
        count: 1,
        position: 1,
        description: expect.stringContaining("1 Framer-Vorlagen"),
      },
    ]);
    const achilles = plan.entries.find((entry) => entry.slug === "achilles");
    expect(achilles?.family).toBe("Dev-Tool / KI");
    expect(achilles?.note).toBe(
      "AI SaaS & Developer Tool Template by Arthur Duchesne · Ersteller: Arthur Duchesne (@arthurdch)",
    );
    expect(achilles?.documents.design).toContain("## Colors");
    expect(achilles?.desktop.width).toBe(1920);
    expect(achilles?.mobile?.width).toBe(360);
    const withoutMobile = plan.entries.find((entry) => entry.slug === "nur-desktop");
    expect(withoutMobile?.mobile).toBeNull();
  });
});
