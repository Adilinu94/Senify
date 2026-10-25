// Was meldet der Sensor jetzt noch? Position und Transform der Treffer.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";
import { captureBrowser } from "@senify/framer-import";

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

const fixtures = ["framer-easier-train-154753", "framer-fluffy-rectangle-418998"];

for (const name of fixtures) {
  const root = resolve(".", "packages", "framer-import", "test", "fixtures", name);
  const server = await serve(root);
  try {
    const result = await captureBrowser({ url: `${server.url}/index.html`, settleMs: 800 });
    const scroll = result.document.motion.filter((s) => s.trigger === "scroll");
    // Knoten zu den Schlüsseln suchen
    const byKey = new Map<string, Record<string, unknown>>();
    const visit = (node: Record<string, unknown>): void => {
      byKey.set(node["key"] as string, node);
      for (const child of node["children"] as Record<string, unknown>[]) visit(child);
    };
    visit(result.document.pages[0]!.root as never);
    const rows = scroll.map((s) => {
      const node = byKey.get(s.nodeKey as string);
      const states = node?.["states"] as Array<Record<string, unknown>> | undefined;
      const visual = (states?.[0]?.["visual"] ?? {}) as Record<string, string>;
      return {
        key: s.nodeKey,
        delta: s.params["delta"],
        kind: node?.["kind"],
        name: node?.["name"],
        tag: node?.["tag"],
        position: visual["position"],
        transform: visual["transform"]?.slice(0, 30),
        top: visual["top"],
      };
    });
    console.log(JSON.stringify({ fixture: name, count: rows.length, rows }, null, 1));
  } finally {
    await server.close();
  }
}
