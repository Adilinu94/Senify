import { listenReachable } from "@senify/core/net";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { runImport } from "@senify/framer-import";

// `runImport({ capture: "browser" })`: die Quelle wird in Chromium geladen,
// statt ihr Server-HTML zu lesen. Das ist der einzige Weg, Inhalt zu bekommen,
// den erst ein Skript baut - an der veröffentlichten Earn-Seite gemessen (fünf
// leere `display:contents`-Platzhalter, die eine Framer-Code-Komponente im
// Browser füllt, `viewBox="0 0 256 256"` im SSR 0-mal, im DOM 5-mal).
//
// Der Test misst den Unterschied an einer Seite, die genau das tut, und prüft
// beide Wege: statisch fehlen die Grafiken, im Browser sind sie da. Dazu der
// Wächter, dass der Standard unverändert statisch bleibt (Idempotenz-Hash).

const playwright = await import("playwright").catch(() => undefined);
const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

// Die Sterne entstehen erst im Browser - genau die Form, die im SSR fehlt.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>JS-Inhalt</title></head>
<body><div id="main" data-framer-hydrate-v2>
  <div data-framer-name="Bewertung">
    <div class="slot" data-slot="1" style="display:contents"></div>
    <div class="slot" data-slot="2" style="display:contents"></div>
    <div class="slot" data-slot="3" style="display:contents"></div>
  </div>
  <p>Fester Text</p>
</div>
<script>
  for (const slot of document.querySelectorAll('.slot')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M128 0 L158 90 L256 90 Z');
    svg.appendChild(path);
    slot.appendChild(svg);
  }
</script></body></html>`;

function startServer(): Promise<{ server: import("node:http").Server; origin: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
  });
  return new Promise((done) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      done({ server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}` });
    });
  });
}

const iconCount = (document: { nodes: Record<string, { primitive: string }> }): number =>
  Object.values(document.nodes).filter((node) => node.primitive === "icon").length;

describe.skipIf(!browserAvailable)("runImport mit Browser-Capture", () => {
  it("nimmt Inhalt mit, den erst ein Skript baut", async () => {
    const { server, origin } = await startServer();
    try {
      const statisch = await runImport({ source: { kind: "url", url: `${origin}/` }, mode: "fidelity" });
      const browser = await runImport({ source: { kind: "url", url: `${origin}/` }, mode: "fidelity", capture: "browser" });

      // Der statische Weg sieht die Platzhalter, aber nicht die Sterne.
      expect(iconCount(statisch.mapped.document)).toBe(0);
      // Der Browser-Weg sieht sie.
      expect(iconCount(browser.mapped.document)).toBe(3);
      // Und sagt, woher er kommt.
      expect(browser.document.source.kind).toBe("browser");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 180_000);

  it("bleibt ohne Angabe beim statischen Weg", async () => {
    const { server, origin } = await startServer();
    try {
      const standard = await runImport({ source: { kind: "url", url: `${origin}/` }, mode: "fidelity" });
      // Der Standard ist der statische Pfad: dieselbe Quelle, derselbe Hash,
      // keine Chromium-Instanz. Ein stiller Wechsel würde jeden gespeicherten
      // Idempotenz-Schlüssel entwerten.
      expect(standard.document.source.kind).toBe("html");
      expect(iconCount(standard.mapped.document)).toBe(0);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 120_000);
});
