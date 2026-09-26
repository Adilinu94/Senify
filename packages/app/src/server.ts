import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { loadFrameCss } from "./frame-css.ts";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
// The editor chrome fonts (Inter / Inter Display, SIL OFL 1.1) live next to the
// editor they belong to; the dashboard serves them under `/editor-fonts/*` so
// the injected `@font-face` rules resolve without a network fetch.
const EDITOR_FONT_DIR = fileURLToPath(
  new URL("../../editor/assets/fonts", import.meta.url),
);
// The theme webfonts (Sora, Inter) live with the deliverable they ship in
// (`@senify/renderer`); the program serves them under `/assets/<file>.woff2`,
// the path the emitted theme CSS names.
const THEME_FONT_DIR = fileURLToPath(
  new URL("../../renderer/assets/fonts", import.meta.url),
);
const require = createRequire(import.meta.url);

let editorBundle: Promise<string> | undefined;

// The editor ships as TypeScript sources: the local program bundles them on
// first request, so there is no build artifact to keep in sync.
function loadEditorBundle(): Promise<string> {
  if (!editorBundle) {
    const entry = require.resolve("@senify/editor/browser");
    // No alias is needed: the editor and the widget engine read the renderer's
    // breakpoints through the browser-safe `@senify/renderer/breakpoints`
    // subpath, so the Node-side bake never enters the browser bundle.
    editorBundle = build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      logLevel: "silent",
    })
      .then((result) => result.outputFiles[0]?.text ?? "")
      .catch((error: unknown) => {
        editorBundle = undefined;
        throw error;
      });
  }
  return editorBundle;
}

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

function trustedProxyRequest(req: IncomingMessage): boolean {
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
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
  // The engine sees its own host; the browser asked on the dashboard. Links the
  // engine renders into answers (the screenshot URL of a reference brief) must
  // point back at the dashboard, because only that origin injects the operator
  // token — a bare engine URL would answer 401 in the browser.
  const dashboardHost = req.headers.host;
  if (typeof dashboardHost === "string" && dashboardHost !== "") {
    headers["x-forwarded-host"] = dashboardHost;
    headers["x-forwarded-proto"] = "http";
  }
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
  // The live channel (ticket 05) stays open by design: when the client goes
  // away, the upstream request must go with it — otherwise the engine stream
  // and both servers keep a dead connection and a shutdown waits forever.
  res.on("close", () => {
    if (!res.writableEnded) upstream.destroy();
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
    if (url === "/editor-frame.css") {
      void loadFrameCss()
        .then((css) => {
          res.writeHead(200, {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(css);
        })
        .catch((error: unknown) => {
          sendError(
            res,
            502,
            "Das Editor-Stylesheet konnte nicht gebaut werden",
            error instanceof Error ? error.message : String(error),
          );
        });
      return;
    }
    if (url === "/editor.js") {
      void loadEditorBundle()
        .then((code) => {
          res.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(code);
        })
        .catch((error: unknown) => {
          sendError(
            res,
            502,
            "Der Editor konnte nicht gebündelt werden",
            error instanceof Error ? error.message : String(error),
          );
        });
      return;
    }
    if (url.startsWith("/editor-fonts/")) {
      serveStatic(EDITOR_FONT_DIR, url.slice("/editor-fonts".length), res);
      return;
    }
    // The theme webfonts (Sora, Inter): the editor frame's `/theme.css` names
    // them as root files; the engine serves the same files from a build once a
    // release exists, the program serves them locally so the editor never
    // depends on a published build (ticket 17).
    const themeFont = /^\/assets\/(sora|inter)-\d{3}\.woff2$/.exec(url);
    if (themeFont) {
      serveStatic(THEME_FONT_DIR, url.slice("/assets".length), res);
      return;
    }
    // `/api/`, `/assets/` and `/_astro/` belong to the engine: the asset store,
    // the signed previews/releases and the bake's root files (theme.css,
    // islands.js, Astro's hashed bundles) are all served from there.
    if (
      url.startsWith("/api/") ||
      url.startsWith("/assets/") ||
      url.startsWith("/_astro/")
    ) {
      if (!trustedProxyRequest(req)) {
        sendError(
          res,
          403,
          "Die Anfrage stammt nicht vom lokalen Dashboard",
          "Öffne Senify direkt über die lokale Dashboard-Adresse.",
        );
        return;
      }
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
