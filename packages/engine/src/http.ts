import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { SenifyError } from "@senify/core";
import {
  servePreviewFile,
  serveReleaseFile,
} from "./http-build-files.ts";
import {
  sendError,
  sendFile,
  sendJson,
  sendRedirect,
  sendText,
} from "./http-response.ts";
import {
  AuthError,
  hashToken,
  parseBearer,
} from "./auth.ts";
import type {
  TokenScope,
} from "./types.ts";
import type { AuthInfo, EngineContext, Route, RouteParams } from "./http-contract.ts";
import { siteRoutes } from "./http-routes-sites.ts";
import { importRoutes } from "./http-routes-imports.ts";
import { deployRoutes } from "./http-routes-deploy.ts";
import { libraryRoutes } from "./http-routes-library.ts";
import { designRoutes } from "./http-routes-design.ts";
import { siteContentRoutes } from "./http-routes-site-content.ts";
import { imageRoutes } from "./http-routes-images.ts";
import { siteLifecycleRoutes } from "./http-routes-site-lifecycle.ts";
import { themeRoutes } from "./http-routes-theme.ts";
import { assetRoutes } from "./http-routes-assets.ts";
import { formularRoutes } from "./http-routes-formular.ts";
import { referenceRoutes } from "./http-routes-references.ts";
import { pageRoutes } from "./http-routes-pages.ts";
import { mediaRoutes } from "./http-routes-media.ts";
import { opsRoutes } from "./http-routes-ops.ts";
import { contentRoutes } from "./http-routes-content.ts";
export { clientIpOf } from "./http-route-support.ts";
export type { EngineContext } from "./http-contract.ts";

async function authenticate(
  context: EngineContext,
  req: IncomingMessage,
  route: Route,
): Promise<AuthInfo | undefined> {
  if (route.public === true) return undefined;
  const secret = parseBearer(req.headers.authorization);
  if (!secret) {
    throw new AuthError(401, "Missing bearer token", {
      suggestion:
        'Create a token with `senify tokens create --name "<client>" --scopes read,write` and send it as `Authorization: Bearer <token>`.',
    });
  }
  const record = await context.store.findTokenByHash(hashToken(secret));
  if (!record || record.revokedAt !== null) {
    throw new AuthError(401, "Token is unknown or revoked", {
      suggestion:
        "Create a new token (`senify tokens create`) or check `senify tokens list`.",
    });
  }
  if (record.expiresAt !== null && Date.parse(record.expiresAt) <= Date.now()) {
    throw new AuthError(401, `Token "${record.name}" expired on ${record.expiresAt}`, {
      suggestion: "Create a new token with `senify tokens create`.",
    });
  }
  if (route.operatorOnly === true && record.kind !== "human") {
    throw new AuthError(403, "This route requires a human operator", {
      suggestion:
        "Nur das lokale Programm (oder ein Human-Token) darf das — Agenten planen und lesen, der Mensch entscheidet.",
    });
  }
  const required: TokenScope = route.scope ?? "read";
  if (!record.scopes.includes(required)) {
    const suggested = [...new Set([...record.scopes, required])].join(",");
    throw new AuthError(403, `Missing scope "${required}"`, {
      suggestion: `Create a token with the "${required}" scope: senify tokens create --name "<client>" --scopes ${suggested}`,
    });
  }
  if (route.rateLimit !== false) {
    context.rateLimiter.check(record.id, route.destructive === true);
  }
  await context.store.touchToken(record.id);
  return {
    tokenId: record.id,
    tokenName: record.name,
    kind: record.kind,
    scopes: record.scopes,
  };
}

function matchRoute(route: Route, method: string, segments: string[]): RouteParams | undefined {
  if (route.method !== method) return undefined;
  if (route.segments.length !== segments.length) return undefined;
  const params: RouteParams = {};
  for (let index = 0; index < route.segments.length; index += 1) {
    const pattern = route.segments[index];
    const actual = segments[index];
    if (pattern === undefined || actual === undefined) return undefined;
    if (pattern.startsWith(":")) {
      try {
        params[pattern.slice(1)] = decodeURIComponent(actual);
      } catch {
        throw new SenifyError(
          "validation",
          `Invalid URL encoding in path segment "${actual}"`,
          { suggestion: "Use percent-encoded UTF-8 path segments." },
        );
      }
    } else if (pattern !== actual) {
      return undefined;
    }
  }
  return params;
}

const ROUTES: Route[] = [
  ...assetRoutes,
  ...formularRoutes,
  ...mediaRoutes,
  ...opsRoutes,
  ...contentRoutes,
  ...siteRoutes,
  ...importRoutes,
  ...deployRoutes,
  ...libraryRoutes,
  ...designRoutes,
  ...siteContentRoutes,
  ...imageRoutes,
  ...siteLifecycleRoutes,
  ...themeRoutes,
  ...referenceRoutes,
  ...pageRoutes,
];

async function handleRequest(
  context: EngineContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  let url: URL;
  try {
    url = new URL(req.url ?? "/", "http://engine.local");
  } catch {
    sendError(
      res,
      new SenifyError("validation", "Malformed request URL", {
        suggestion: "Use percent-encoded UTF-8 path segments.",
      }),
    );
    return;
  }
  const segments = url.pathname.split("/").filter((part) => part.length > 0);
  // Build files are served from a bake directory: the signed preview and the
  // published release share this shape (deeper paths than a route segment).
  const previewFile = url.pathname.match(
    /^\/api\/previews\/([^/]+)\/files(?:\/(.*))?$/,
  );
  const releaseFile = url.pathname.match(
    /^\/api\/releases\/([^/]+)\/files(?:\/(.*))?$/,
  );
  let matchedRoute: Route | undefined;
  let matchedParams: RouteParams | undefined;
  for (const route of ROUTES) {
    const params = matchRoute(route, method, segments);
    if (params !== undefined) {
      matchedRoute = route;
      matchedParams = params;
      break;
    }
  }
  // A maintenance window keeps the door shut for everything except its own
  // routes (health, the restore): those requests get a 503 to retry later.
  const releaseMaintenance =
    matchedRoute?.maintenanceExempt === true ? null : context.maintenance.enter();
  try {
    if (method === "GET" && previewFile) {
      await servePreviewFile(
        context,
        res,
        decodeURIComponent(previewFile[1] ?? ""),
        decodeURIComponent(previewFile[2] ?? ""),
        url,
      );
      return;
    }
    if (method === "GET" && releaseFile) {
      await serveReleaseFile(
        context,
        res,
        decodeURIComponent(releaseFile[1] ?? ""),
        decodeURIComponent(releaseFile[2] ?? ""),
      );
      return;
    }
    if (matchedRoute !== undefined && matchedParams !== undefined) {
      const auth = await authenticate(context, req, matchedRoute);
      const result = await matchedRoute.handler(
        context,
        matchedParams,
        req,
        url,
        auth,
      );
      if (result.redirect !== undefined) {
        sendRedirect(res, result.redirect);
        return;
      }
      if (result.stream !== undefined) {
        res.writeHead(result.status, {
          "content-type": result.stream.contentType,
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          ...(result.headers ?? {}),
        });
        result.stream.open(res);
        return;
      }
      if (result.text !== undefined) {
        sendText(
          res,
          result.status,
          result.text.body,
          result.text.contentType,
          result.headers ?? {},
        );
        return;
      }
      if (result.file) {
        sendFile(res, result.file);
        return;
      }
      sendJson(res, result.status, result.body, result.headers);
      return;
    }
    sendError(
      res,
      new SenifyError("not_found", `Route ${method} ${url.pathname} does not exist`),
    );
  } finally {
    releaseMaintenance?.();
  }
}

export function createRequestHandler(
  context: EngineContext,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handleRequest(context, req, res).catch((error: unknown) => {
      sendError(res, error);
    });
  };
}
