import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listSectionVariants, sectionThumbnailFile } from "../src/explorer/sections-model.ts";

// Jede Variante, die das Panel anbietet, hat ein Vorschaubild; `pnpm
// thumbnails:generate` erzeugt sie. Geprueft wird, dass die Dateien da und echte
// PNGs sind und dass keine Datei ohne Variante liegen bleibt, nicht die Pixel.

const DIR = fileURLToPath(new URL("../assets/section-thumbnails", import.meta.url));
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("section variant previews", () => {
  it("has a PNG for every variant the panel offers", () => {
    const missing: string[] = [];
    for (const entry of listSectionVariants()) {
      const file = join(DIR, sectionThumbnailFile(entry.type, entry.variant.key));
      if (!existsSync(file)) {
        missing.push(`${entry.type}/${entry.variant.key}`);
        continue;
      }
      const bytes = readFileSync(file);
      expect(Array.from(bytes.subarray(0, 8)), file).toEqual(PNG_MAGIC);
      expect(bytes.length, file).toBeGreaterThan(100);
    }
    expect(missing, "Fehlende Vorschaubilder: `pnpm thumbnails:generate` ausführen").toEqual([]);
  });

  it("keeps no preview that no variant asks for", () => {
    const wanted = new Set(
      listSectionVariants().map((entry) => sectionThumbnailFile(entry.type, entry.variant.key)),
    );
    const orphans = readdirSync(DIR).filter((file) => !wanted.has(file));
    expect(orphans).toEqual([]);
  });
});
