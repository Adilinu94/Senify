import type { ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { SenifyError } from "@senify/core";
import { AuthError } from "./auth.ts";
import { RateLimitError } from "./rate-limit.ts";
import { MaintenanceError } from "./maintenance.ts";
import { FormRejection } from "./forms.ts";

// The response primitives of the HTTP surface (P3-2 extraction from
// `http.ts`). Everything that writes bytes to the socket lives here, so the
// two rules that must hold for EVERY answer are written once:
//
//   * a stored or baked file is served with its declared type and
//     `nosniff` — never sniffed;
//   * an error carries the machine-readable category the client sees, in the
//     same envelope whichever category it is.
//
// The dispatcher (`handleRequest`) and the route table stay in `http.ts`;
// the build-file serving (`http-build-files.ts`) writes through these.

export const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".ico": "image/x-icon",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

export function sendFile(
  res: ServerResponse,
  file: {
    path: string;
    contentType?: string;
    headers?: Record<string, string>;
  },
): void {
  if (!existsSync(file.path) || !statSync(file.path).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const contentType =
    file.contentType ??
    CONTENT_TYPES[extname(file.path).toLowerCase()] ??
    "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": statSync(file.path).size,
    // The declared type is the type: no MIME sniffing of stored or baked files.
    "x-content-type-options": "nosniff",
    // An SVG can carry script; opened as a document it would run in the origin
    // that serves it. `sandbox` strips script and origin from the document;
    // <img> and CSS use are unaffected. The upload check accepts any `image/*`
    // case-sensitively, browsers compare the type case-insensitively - so
    // does this.
    ...(contentType.toLowerCase().startsWith("image/svg+xml")
      ? { "content-security-policy": "sandbox" }
      : {}),
    ...(file.headers ?? {}),
  });
  createReadStream(file.path).pipe(res);
}

function statusFor(error: SenifyError): number {
  switch (error.category) {
    case "validation":
      return 400;
    case "guardrail":
      return 422;
    case "conflict":
      return 409;
    case "auth":
      return 403;
    case "not_found":
      return 404;
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): void {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

export function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}

export function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  contentType: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

export function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof RateLimitError) {
    sendJson(
      res,
      429,
      {
        error: {
          category: error.category,
          message: error.message,
          ...(error.suggestion !== undefined
            ? { suggestion: error.suggestion }
            : {}),
        },
      },
      { "retry-after": String(error.retryAfterSeconds) },
    );
    return;
  }
  if (error instanceof MaintenanceError) {
    sendJson(
      res,
      503,
      {
        error: {
          category: error.category,
          message: error.message,
          ...(error.field !== undefined ? { field: error.field } : {}),
          ...(error.suggestion !== undefined
            ? { suggestion: error.suggestion }
            : {}),
        },
      },
      { "retry-after": "5" },
    );
    return;
  }
  if (error instanceof FormRejection) {
    sendJson(
      res,
      error.status,
      {
        error: {
          category: error.category,
          reason: error.reason,
          message: error.message,
          ...(error.field !== undefined ? { field: error.field } : {}),
          ...(error.suggestion !== undefined
            ? { suggestion: error.suggestion }
            : {}),
        },
      },
    );
    return;
  }
  if (error instanceof AuthError) {
    sendJson(res, error.status, {
      error: {
        category: error.category,
        message: error.message,
        ...(error.field !== undefined ? { field: error.field } : {}),
        ...(error.suggestion !== undefined
          ? { suggestion: error.suggestion }
          : {}),
      },
    });
    return;
  }
  if (error instanceof SenifyError) {
    sendJson(res, statusFor(error), {
      error: {
        category: error.category,
        message: error.message,
        ...(error.opIndex !== undefined ? { opIndex: error.opIndex } : {}),
        ...(error.field !== undefined ? { field: error.field } : {}),
        ...(error.currentVersion !== undefined
          ? { currentVersion: error.currentVersion }
          : {}),
        ...(error.suggestion !== undefined
          ? { suggestion: error.suggestion }
          : {}),
      },
    });
    return;
  }
  console.error("[engine] unexpected error", error);
  sendJson(res, 500, {
    error: {
      category: "internal",
      message: "Internal engine error",
    },
  });
}
