import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

const html = `<html lang="de"><head><title>t</title><style>.btn{background-color:#111;color:#eee}.btn:hover{background-color:#f00}.btn:focus-visible{color:#0f0}</style></head><body><div id="main" data-framer-hydrate-v2><div class="btn"><div>Los</div></div></div></body></html>`;

describe("interaction states reach the baked page", () => {
  it("writes hover and focus as pseudo-class rules after the base declarations", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-hover-"));
    try {
      const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "hover",
          baseUrl: "https://hover.local",
          pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: out, selfContained: true },
      );
      const files = [join(out, "index.html"), ...readdirSync(join(out, "assets")).filter((name) => name.endsWith(".css")).map((name) => join(out, "assets", name))];
      const css = files.map((file) => readFileSync(file, "utf8")).join("\n");
      expect(css).toMatch(/\.framer-[0-9a-f]{6}-\d+:hover\s*\{[^}]*background-color:\s*#f00/);
      expect(css).toMatch(/\.framer-[0-9a-f]{6}-\d+:focus\s*\{[^}]*color:\s*(#0f0|#00ff00)/);
      expect(css.indexOf(":hover")).toBeGreaterThan(css.indexOf("background-color: #111"));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
