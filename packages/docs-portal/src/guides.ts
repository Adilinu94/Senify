import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SenifyError } from "@senify/core";
import type { DocsGroup, DocsPage } from "./model.ts";

// The guides directory must resolve from source runs, from Astro's bundled
// prerender chunks (dist/.prerender/chunks) and from the MCP runtime, so it
// anchors on this package's package.json instead of import.meta.url alone.
function defaultGuidesDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
        name?: string;
      };
      if (parsed.name === "@senify/docs-portal") {
        return join(dir, "content", "docs");
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new SenifyError(
        "not_found",
        "Could not locate the docs-portal package root",
        { suggestion: "Run the portal from inside the Senify workspace." },
      );
    }
    dir = parent;
  }
}

const GROUPS: DocsGroup[] = [
  "Getting Started",
  "Platform",
  "Reference",
  "Guides",
  "Changelog",
];

function parseFrontmatter(
  source: string,
  file: string,
): { data: Record<string, string>; body: string } {
  // A Windows checkout (git autocrlf) turns every line break into CRLF.
  const raw = source.replaceAll("\r\n", "\n");
  const end = raw.startsWith("---\n") ? raw.indexOf("\n---\n", 4) : -1;
  if (end === -1) {
    throw new SenifyError("validation", `Guide "${file}" has no frontmatter`, {
      field: "frontmatter",
      suggestion:
        "Start the file with a --- block (title, description, path, group, order).",
    });
  }
  const data: Record<string, string> = {};
  for (const line of raw.slice(4, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    if (key !== "") data[key] = value;
  }
  return { data, body: raw.slice(end + 5).trim() };
}

function guidePage(file: string, raw: string): DocsPage {
  const { data, body } = parseFrontmatter(raw, file);
  const need = (key: string): string => {
    const value = data[key];
    if (value === undefined || value === "") {
      throw new SenifyError(
        "validation",
        `Guide "${file}" is missing "${key}"`,
        { field: key },
      );
    }
    return value;
  };
  const group = need("group");
  if (!GROUPS.includes(group as DocsGroup)) {
    throw new SenifyError(
      "validation",
      `Guide "${file}" has unknown group "${group}"`,
      {
        field: "group",
        suggestion: `Use one of: ${GROUPS.join(", ")}.`,
      },
    );
  }
  const order = Number.parseInt(data.order ?? "0", 10);
  return {
    path: need("path"),
    title: need("title"),
    description: need("description"),
    group: group as DocsGroup,
    order: Number.isFinite(order) ? order : 0,
    body,
  };
}

// Curated guides live as plain markdown files: the same files feed the portal
// pages, the `.md` exports and the docs tools.
export function loadGuidePages(dir: string = defaultGuidesDir()): DocsPage[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => guidePage(name, readFileSync(join(dir, name), "utf8")));
}
