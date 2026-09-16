import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export type AppServerOptions = {
  engineOrigin: string;
  // The dashboard acts as the local operator: the token is injected into
  // proxied API calls when the browser sends none.
  operatorToken?: string;
  publicDir?: string;
  port?: number;
};

export type AppServer = {
  origin: string;
  port: number;
  close(): Promise<void>;
};

function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  suggestion: string,
): void {
  const body = JSON.stringify({
    error: { category: "internal", message, suggestion },
  });
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function proxyRequest(
  engineOrigin: string,
  operatorToken: string | undefined,
  url: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const target = new URL(url, engineOrigin);
  const headers: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: target.host,
  };
  if (operatorToken !== undefined && headers.authorization === undefined) {
    headers.authorization = `Bearer ${operatorToken}`;
  }
  const upstream = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    },
  );
  upstream.on("error", () => {
    sendError(
      res,
      502,
      "Die Engine ist nicht erreichbar",
      "Starte das Programm erneut mit `senify start`.",
    );
  });
  req.pipe(upstream);
}

function serveStatic(
  publicDir: string,
  url: string,
  res: ServerResponse,
): void {
  const raw = url.split("?")[0] ?? "/";
  const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  const resolved = normalize(join(publicDir, relative));
  if (!resolved.startsWith(publicDir) || !existsSync(resolved) || !statSync(resolved).isFile()) {
    sendError(res, 404, `Unbekannte Datei "${raw}"`, "Prüfe die Adresse.");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME_TYPES[extname(resolved).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(readFileSync(resolved));
}

// The local program server: static dashboard, platform theme as CSS and a
// same-origin proxy to the engine (no CORS, no token in the browser).
export function createAppServer(options: AppServerOptions): Promise<AppServer> {
  const publicDir = options.publicDir ?? PUBLIC_DIR;
  const themeCss = emitCss(resolveTheme(defaultTheme()));
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/theme.css") {
      res.writeHead(200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(themeCss);
      return;
    }
    if (url.startsWith("/api/") || url.startsWith("/assets/")) {
      proxyRequest(options.engineOrigin, options.operatorToken, url, req, res);
      return;
    }
    serveStatic(publicDir, url, res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
      });
    });
  });
}
