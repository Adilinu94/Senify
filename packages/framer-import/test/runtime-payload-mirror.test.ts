import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runImport } from "../src/import.ts";

// The runtime payload of an OFFLINE import (step 2 of
// `docs/fahrplan-framer-1zu1.md`).
//
// The mirror carries the runtime files itself. They are read from the mirror
// and from nowhere else (ADR-0016): a path that leaves the mirror folder is
// refused, and the import stays offline.

const RUNTIME = `
import { helper } from "./chunk.mjs";
globalThis.__framerRuntime = { helper, main: document.getElementById("main") };
`;

function mirror(html: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "senify-mirror-"));
  writeFileSync(join(root, "index.html"), html, "utf8");
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return root;
}

const page = (entry: string): string => `<!doctype html>
<html lang="de"><head><title>Spiegel</title>
<script type="module" data-framer-bundle src="${entry}"></script>
</head><body>
<div id="main" data-framer-hydrate-v2='{"routeId":"abc"}'><p>Text</p></div>
</body></html>`;

describe("the runtime payload of a mirror", () => {
  it("reads the runtime from the mirror and bundles it", async () => {
    const root = mirror(
      page("scripts/_script0.mjs"),
      {
        "scripts/_script0.mjs": RUNTIME,
        "scripts/chunk.mjs": `export const helper = "chunk";`,
      },
    );
    const run = await runImport({ source: { kind: "mirror", rootDir: root } });
    const payload = run.payloads.find((entry) => entry.scope === "page");
    expect(payload).toBeDefined();
    // The runtime is inside the bundle — the release loads one file.
    expect(payload?.bundle).toContain("__framerRuntime");
    expect(payload?.integrity).toMatch(/^[0-9a-f]{64}$/);
    // The carrier stands in the tree and covers the page.
    const carrier = Object.values(run.mapped.document.nodes).find(
      (node) => node.primitive === "payload",
    );
    expect(carrier).toBeDefined();
    expect(carrier?.props["coversPage"]).toBe(true);
    expect(carrier?.props["framerPayloadKey"]).toBe(payload?.integrity);
  });

  it("says so when the mirror names a runtime it does not have", async () => {
    // The address is absolute (the CDN): offline, there is nothing to read.
    const root = mirror(page("https://framerusercontent.com/sites/abc/_script0.mjs"), {});
    const run = await runImport({ source: { kind: "mirror", rootDir: root } });
    expect(run.payloads.filter((entry) => entry.scope === "page")).toEqual([]);
    // The report names it — no silent drop.
    const finding = run.report.findings.find((entry) => entry.message.includes("Runtime"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warn");
  });

  it("leaves a page without a runtime alone", async () => {
    const root = mirror("<!doctype html><html><body><p>Text</p></body></html>", {});
    const run = await runImport({ source: { kind: "mirror", rootDir: root } });
    expect(run.payloads.filter((entry) => entry.scope === "page")).toEqual([]);
    expect(run.report.findings.filter((entry) => entry.message.includes("Runtime"))).toEqual([]);
  });
});
