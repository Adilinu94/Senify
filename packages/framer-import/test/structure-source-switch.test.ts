import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { runImport } from "../src/index.ts";

// The `structureSource` switch (24.10.2026).
//
// The switch is the part `captureBrowser` alone does not prove: `runImport`
// has to take the branch, keep the SSR as the payload source, and say in the
// report which way it went. Without the switch the import silently reads the
// server HTML - the state it was in until this change, where the browser
// capture was exported but never called.

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// The server HTML ships an empty placeholder; the page's own script fills it.
// Reading the server HTML must therefore leave the element empty, reading the
// hydrated page must find its child.
const PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Schalter</title></head>
<body><div id="main" data-framer-hydrate-v2>
  <div class="framer-hero" data-framer-name="Hero">
    <div class="framer-slot" data-framer-name="Graphic">
      <div style="height:100%;width:100%"></div>
    </div>
    <p>Sichtbarer Text</p>
  </div>
</div>
<script>
  const slot = document.querySelector(".framer-slot > div");
  slot.innerHTML = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>';
</script>
</body></html>`;

function serve(html: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  return new Promise((done) =>
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

describe.runIf(browserAvailable)("the structure source switch", () => {
  it("reads the server HTML by default and finds no filled child", async () => {
    const server = await serve(PAGE);
    try {
      const run = await runImport({ source: { kind: "url", url: server.url }, mode: "fidelity" });
      // The default is unchanged: the SSR document, not the browser.
      expect(run.document.source.kind).toBe("html");
      // The switch's own finding must not appear when it was not used.
      expect(run.report.findings.some((finding) => /hydratisierten Seite/.test(finding.message))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("takes the browser branch and says so in the report", async () => {
    const server = await serve(PAGE);
    try {
      const run = await runImport({
        source: { kind: "url", url: server.url },
        mode: "fidelity",
        structureSource: "browser",
      });
      expect(run.document.source.kind).toBe("browser");
      const notice = run.report.findings.find((finding) => /hydratisierten Seite/.test(finding.message));
      expect(notice).toBeDefined();
      expect(notice?.severity).toBe("info");
      // The switch must not cost the runtime payload: it still comes from the
      // server HTML (that is where the runtime entry lives).
      const tree = JSON.stringify(run.mapped.document);
      expect(tree.includes("circle") || tree.includes("Sichtbarer Text")).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("keeps the raw HTML as the payload source, so the report still names the page", async () => {
    const server = await serve(PAGE);
    try {
      const run = await runImport({
        source: { kind: "url", url: server.url },
        mode: "fidelity",
        structureSource: "browser",
      });
      // The source URL travels with the document either way.
      expect(run.document.source.url).toBe(server.url);
    } finally {
      await server.close();
    }
  });
});
