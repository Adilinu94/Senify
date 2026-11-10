import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editorDocumentToNodeTree } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

const html =
  `<html lang="de"><head><title>t</title></head><body>` +
  `<div id="main" data-framer-hydrate-v2><div>` +
  `<a href="/x">Hallo <strong>Welt</strong> fertig</a>` +
  `</div></div></body></html>`;

describe("text link content in the build", () => {
  it("bakes the full mixed text and its inline markup", async () => {
    const out = mkdtempSync(join(tmpdir(), "senify-textlink-"));
    try {
      const run = await runImport({ source: { kind: "html", html }, mode: "fidelity" });
      const resolved = resolveTheme(defaultTheme());
      await bakeSite(
        {
          siteName: "textlink",
          baseUrl: "https://textlink.local",
          pages: [{ id: "p", path: "/", title: "t", tree: editorDocumentToNodeTree(run.mapped.document) }],
          themeCss: emitCss(resolved),
          styleRules: run.mapped.rules,
          motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: out, selfContained: true },
      );
      const page = readFileSync(join(out, "index.html"), "utf8");
      expect(page).toContain("Hallo");
      expect(page).toContain("<strong>Welt</strong>");
      expect(page).toContain("fertig");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);
});
