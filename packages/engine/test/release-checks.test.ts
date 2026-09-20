import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runReleasePreChecks } from "../src/release-checks.ts";

// Ticket 17 (O9): the static release curtain. It runs on the baked output —
// every local reference resolves, a stylesheet is linked, the heading order
// holds. The browser expansion (overflow, mobile, network) is Phase 5.

const dirs: string[] = [];

function build(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "senify-release-checks-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("release pre-checks", () => {
  it("passes a clean build", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head>
        <link rel="stylesheet" href="./assets/site.css">
        <script src="./assets/page.js"></script>
      </head><body>
        <h1>Start</h1><h2>Abschnitt</h2><h3>Fein</h3>
        <img src="/assets/img/hero.webp">
      </body></html>`,
      "assets/site.css": "body{}",
      "assets/page.js": "",
      "assets/img/hero.webp": "x",
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard).toEqual([]);
    expect(result.soft).toEqual([]);
  });

  it("names a broken local reference", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head>
        <link rel="stylesheet" href="./assets/site.css">
      </head><body><h1>Start</h1><img src="./assets/img/missing.webp"></body></html>`,
      "assets/site.css": "body{}",
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard.map((entry) => entry.code)).toContain("release-missing-file");
    expect(result.hard[0]?.message).toContain("missing.webp");
  });

  it("ignores external and data references", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head>
        <link rel="stylesheet" href="https://cdn.example.com/a.css">
      </head><body>
        <h1>Start</h1>
        <img src="data:image/png;base64,AAAA">
        <a href="mailto:hallo@example.com">Mail</a>
        <a href="#anker">Anker</a>
      </body></html>`,
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard).toEqual([]);
  });

  it("requires a linked stylesheet", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head></head><body><h1>Start</h1></body></html>`,
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard.map((entry) => entry.code)).toContain("release-no-stylesheet");
  });

  it("reports a heading order violation", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head>
        <link rel="stylesheet" href="./a.css">
      </head><body><h1>Start</h1><h3>Sprung</h3></body></html>`,
      "a.css": "",
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard.map((entry) => entry.code)).toContain("release-heading-order");
    expect(result.hard[0]?.message).toContain("h1 auf h3");
  });

  it("notes a first heading below h1 as soft", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head>
        <link rel="stylesheet" href="./a.css">
      </head><body><h2>Start</h2></body></html>`,
      "a.css": "",
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard).toEqual([]);
    expect(result.soft.map((entry) => entry.code)).toContain("release-heading-start");
    expect(result.soft[0]?.message).toContain("empfohlen ist h1");
  });

  it("notes a page without headings as soft", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head>
        <link rel="stylesheet" href="./a.css">
      </head><body><p>Nur Text</p></body></html>`,
      "a.css": "",
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard).toEqual([]);
    expect(result.soft.map((entry) => entry.code)).toContain("release-no-heading");
  });

  it("fails an empty build", () => {
    const dir = build({ "readme.txt": "nothing" });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard.map((entry) => entry.code)).toContain("release-empty");
  });

  it("checks every page, including nested routes", () => {
    const dir = build({
      "index.html": `<!doctype html><html><head><link rel="stylesheet" href="/a.css"></head><body><h1>Start</h1></body></html>`,
      "blog/index.html": `<!doctype html><html><head><link rel="stylesheet" href="/a.css"></head><body><h1>Blog</h1><h3>Sprung</h3></body></html>`,
      "a.css": "",
    });
    const result = runReleasePreChecks({ outDir: dir });
    expect(result.hard.map((entry) => entry.message)).toContainEqual(
      expect.stringContaining("blog/index.html"),
    );
  });
});
