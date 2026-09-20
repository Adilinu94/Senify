import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { imageDimensions } from "./media.ts";
import type { ReferenceDocuments } from "./types.ts";

// Reader for the local reference collection `Referenzsites/`: one folder per
// Framer template with info.md, design.md, design-guidelines.md,
// design-components.md and two hero screenshots. The reader stays free of HTTP
// and database access, so the import script is thin and this part is testable.

// The collection was captured on 19 September 2026 (README of the folder).
export const REFERENZSITES_CAPTURED_AT = "2026-09-19";

export type ReferenzSiteImage = {
  breakpoint: "desktop" | "mobile";
  bytes: Buffer;
  width: number;
  height: number;
  extension: "png" | "jpg" | "webp";
};

export type ReferenzSiteRecord = {
  slug: string;
  name: string;
  // "Business (Dev-Tool / KI)" reads as category plus subcategory.
  category: string;
  subcategory: string | null;
  creator: string | null;
  marketUrl: string | null;
  sourceUrl: string;
  description: string | null;
  capturedAt: string;
  documents: ReferenceDocuments;
  images: ReferenzSiteImage[];
};

export type ReferenzSiteIssue = {
  slug: string;
  reason: string;
};

export type ReferenzSitesReadResult = {
  records: ReferenzSiteRecord[];
  issues: ReferenzSiteIssue[];
};

const IMAGE_EXTENSIONS: readonly { extension: ReferenzSiteImage["extension"]; mime: string }[] = [
  { extension: "png", mime: "image/png" },
  { extension: "jpg", mime: "image/jpeg" },
  { extension: "webp", mime: "image/webp" },
];

function inline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A cell that carries a link (`[achilles](https://…)`): the target is the value.
function linkValue(value: string): string {
  const match = /\]\((https?:\/\/[^)]+)\)/.exec(value);
  return match === null ? inline(value) : (match[1] ?? "");
}

function readText(path: string): string | null {
  try {
    // The documents come from Windows editors: the repo works with LF.
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

// The metadata table of info.md: `| **Name** | Achilles |`. The value stays
// raw (link targets included); the callers pick inline text or link target.
function infoFields(info: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of info.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const key = inline(cells[0] ?? "").replace(/:$/, "");
    const value = cells[1] ?? "";
    if (key === "" || value === "" || /^-+$/.test(value)) continue;
    if (!fields.has(key)) fields.set(key, value);
  }
  return fields;
}

function field(fields: Map<string, string>, ...prefixes: string[]): string | null {
  for (const [key, value] of fields) {
    if (prefixes.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()))) {
      return value;
    }
  }
  return null;
}

// The "## Beschreibung" section of info.md: first real paragraph.
function description(info: string): string | null {
  let inSection = false;
  for (const block of info.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(block);
    if (heading !== null) {
      inSection = /beschreibung|description/i.test(heading[1] ?? "");
      continue;
    }
    if (!inSection) continue;
    const line = block.trim();
    if (line === "" || line.startsWith("[")) continue;
    return line;
  }
  return null;
}

// "Business (Dev-Tool / KI)" liest sich als Kategorie plus Klammerteil,
// "Business / SaaS" als Hauptkategorie (vor dem Schraegstrich) und Familie
// (danach). So entstehen die Kategorien des Katalogs, nicht ein Dutzend
// Zwischenschnitte.
function splitCategory(value: string): { category: string; subcategory: string | null } {
  const match = /^(.*?)\s*\((.*)\)\s*$/.exec(value);
  const head = (match === null ? value : (match[1] ?? "")).trim();
  const parenthetical = match === null ? "" : (match[2] ?? "").trim();
  const parts = head
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const slash = parts.slice(1).join(" / ");
  const family = parenthetical !== "" ? parenthetical : slash;
  return {
    category: parts[0] ?? value.trim(),
    subcategory: family === "" ? null : family,
  };
}

function loadImage(dir: string, base: string, breakpoint: ReferenzSiteImage["breakpoint"]): ReferenzSiteImage | null {
  for (const { extension, mime } of IMAGE_EXTENSIONS) {
    const path = join(dir, `${base}.${extension}`);
    let bytes: Buffer;
    try {
      if (!statSync(path).isFile()) continue;
      bytes = readFileSync(path);
    } catch {
      continue;
    }
    const dimensions = imageDimensions(bytes, mime);
    if (dimensions === undefined) continue;
    return {
      breakpoint,
      bytes,
      width: dimensions.width,
      height: dimensions.height,
      extension,
    };
  }
  return null;
}

export type ReadReferenzsitesOptions = {
  // Slugs to read; everything else is skipped silently.
  only?: readonly string[];
  // Stop after this many records (for a test run).
  limit?: number;
};

export function readReferenzsites(
  root: string,
  options: ReadReferenzsitesOptions = {},
): ReferenzSitesReadResult {
  const only = options.only === undefined ? null : new Set(options.only);
  const records: ReferenzSiteRecord[] = [];
  const issues: ReferenzSiteIssue[] = [];
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const slug of entries) {
    if (only !== null && !only.has(slug)) continue;
    if (slug.startsWith(".")) continue;
    if (options.limit !== undefined && records.length >= options.limit) break;
    const dir = join(root, slug);
    const info = readText(join(dir, "info.md"));
    const design = readText(join(dir, "design.md"));
    if (info === null) {
      issues.push({ slug, reason: "info.md fehlt" });
      continue;
    }
    if (design === null) {
      issues.push({ slug, reason: "design.md fehlt" });
      continue;
    }
    const fields = infoFields(info);
    const name = inline(field(fields, "Name") ?? "") || slug;
    const categoryValue = inline(field(fields, "Kategorie") ?? "") || "Ohne Kategorie";
    const { category, subcategory } = splitCategory(categoryValue);
    const sourceUrl = linkValue(field(fields, "Live-Preview", "Live Preview", "Preview") ?? "");
    if (sourceUrl === "") {
      issues.push({ slug, reason: "Live-Preview fehlt in info.md" });
      continue;
    }
    const desktop = loadImage(dir, "hero-desktop", "desktop");
    if (desktop === null) {
      issues.push({ slug, reason: "hero-desktop.png fehlt oder ist unlesbar" });
      continue;
    }
    const mobile = loadImage(dir, "hero-mobile", "mobile");
    const creatorValue = field(fields, "Ersteller");
    const marketValue = field(fields, "Marktplatz-Seite");
    records.push({
      slug,
      name,
      category,
      subcategory,
      creator: creatorValue === null ? null : inline(creatorValue),
      marketUrl: marketValue === null ? null : linkValue(marketValue),
      sourceUrl,
      description: description(info),
      capturedAt: REFERENZSITES_CAPTURED_AT,
      documents: {
        design,
        guidelines: readText(join(dir, "design-guidelines.md")),
        components: readText(join(dir, "design-components.md")),
      },
      images: mobile === null ? [desktop] : [desktop, mobile],
    });
  }
  return { records, issues };
}

// ------------------------------------------------------------- import plan

export type ReferenzSitesCollectionPlan = {
  name: string;
  count: number;
  position: number;
  description: string;
};

export type ReferenzSitesEntryPlan = {
  slug: string;
  name: string;
  category: string;
  sourceUrl: string;
  family: string | null;
  note: string;
  capturedAt: string;
  documents: ReferenceDocuments;
  desktop: ReferenzSiteImage;
  mobile: ReferenzSiteImage | null;
};

export type ReferenzSitesPlan = {
  collections: ReferenzSitesCollectionPlan[];
  entries: ReferenzSitesEntryPlan[];
};

// What the import writes: one collection per category (largest first, then
// alphabetically, like the collection overview) and one entry per reference.
// A record always carries its desktop shot, the mobile one is optional.
export function planReferenzsites(records: readonly ReferenzSiteRecord[]): ReferenzSitesPlan {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
  }
  const capturedAt = records[0]?.capturedAt ?? REFERENZSITES_CAPTURED_AT;
  const collections = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .map(([name, count], position) => ({
      name,
      count,
      position,
      description: `${count} Framer-Vorlagen aus der Sammlung Referenzsites (Stand ${capturedAt}).`,
    }));

  const entries: ReferenzSitesEntryPlan[] = [];
  for (const record of records) {
    const desktop = record.images.find((image) => image.breakpoint === "desktop");
    if (desktop === undefined) continue;
    const note = [record.description, record.creator === null ? null : `Ersteller: ${record.creator}`]
      .filter((part): part is string => part !== null && part !== "")
      .join(" · ");
    entries.push({
      slug: record.slug,
      name: record.name,
      category: record.category,
      sourceUrl: record.sourceUrl,
      family: record.subcategory,
      note,
      capturedAt: record.capturedAt,
      documents: record.documents,
      desktop,
      mobile: record.images.find((image) => image.breakpoint === "mobile") ?? null,
    });
  }
  return { collections, entries };
}
