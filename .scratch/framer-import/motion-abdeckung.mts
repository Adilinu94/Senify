// S8: Wie vollständig ist die Motion-Abdeckung? Gemessen auf den drei
// Exporten (statisch und Browser) und an der veröffentlichten Earn-Seite.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";
import { runImport } from "@senify/framer-import";

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    let body: Buffer;
    try { body = readFileSync(file); } catch { response.writeHead(404).end(); return; }
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    response.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) => listenReachable(server, 0, "127.0.0.1").then(() => {
    const port = (server.address() as { port: number }).port;
    done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
  }));
}

const fixtures = ["framer-stupendous-football-158496", "framer-easier-train-154753", "framer-fluffy-rectangle-418998"];
const rows: unknown[] = [];

for (const name of fixtures) {
  const root = resolve(".", "packages", "framer-import", "test", "fixtures", name);
  const server = await serve(root);
  try {
    const run = await runImport({ source: { kind: "url", url: `${server.url}/index.html` }, mode: "fidelity" });
    const triggers: Record<string, number> = {};
    for (const sample of run.document.motion) {
      const key = `${sample.library}/${sample.trigger}`;
      triggers[key] = (triggers[key] ?? 0) + 1;
    }
    rows.push({ fixture: name, ...run.report.motion, triggers, findings: run.report.findings.filter((f) => f.kind === "unsupported-declaration").length });
  } finally {
    await server.close();
  }
}

// Earn, beide Wege
for (const capture of ["static", "browser"] as const) {
  const run = await runImport({ source: { kind: "url", url: "https://distinct-assistant-875072.framer.app" }, mode: "fidelity", capture });
  const triggers: Record<string, number> = {};
  for (const sample of run.document.motion) {
    const key = `${sample.library}/${sample.trigger}`;
    triggers[key] = (triggers[key] ?? 0) + 1;
  }
  rows.push({ fixture: `earn-${capture}`, ...run.report.motion, triggers });
}

console.log(JSON.stringify(rows, null, 1));
