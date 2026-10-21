// Die Routen des Bereichs assets/:assetId, assets/:filename, _astro/:filename, api/assets, api/images, api/library-components, api/motion-vendor. Die Tabelle des
// Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019).

import type { Route } from "./http-contract.ts";
import { SenifyError } from "@senify/core";
import {
  BUILD_ROOT_FILES,
  buildRootFile,
} from "./http-build-files.ts";
import {
  AuthError,
} from "./auth.ts";
import { newEntityId } from "./ids.ts";
import {
  parseBody,
} from "./mutations/contract.ts";
import { motionVendorFiles } from "@senify/renderer";
import { createComfyImageProvider } from "./image-comfy.ts";
import { createImageCustomProvider } from "./image-custom.ts";
import { createImageUseProvider } from "./image-use-provider.ts";
import {
  resolveCustomApiKey,
} from "./settings.ts";
import {
  CreateLibraryComponentBodySchema,
  UpdateLibraryComponentBodySchema,
  type CreateLibraryComponentBody,
  type UpdateLibraryComponentBody,
} from "./library-contract.ts";
import { commitUpload } from "./media.ts";
import { resolveStoredFile, storedFileName } from "./storage.ts";
import {
  mediaContext,
  readJsonBody,
  readRawBody,
  requireParam,
} from "./http-route-support.ts";

export const mediaRoutes: Route[] = [
  // The self-hosted motion runtime for the editor's play preview (ticket 19,
  // M4): the same files the bake copies into a release. The local program
  // proxies `/api/` with its operator token, so the editor frame can load
  // them without a token of its own.
  {
    method: "GET",
    segments: ["api", "motion-vendor", ":name"],
    scope: "read",
    handler: async (_context, params) => {
      const name = requireParam(params, "name");
      const file = motionVendorFiles().find((entry) => entry.name === name);
      if (file === undefined) {
        throw new SenifyError("not_found", `Unknown motion vendor file "${name}"`, {
          field: "name",
          suggestion: "Use gsap.min.js, ScrollTrigger.min.js, SplitText.min.js or lenis.min.js.",
        });
      }
      return {
        status: 200,
        file: { path: file.from, contentType: "text/javascript; charset=utf-8" },
      };
    },
  },

  {
    method: "PUT",
    segments: ["api", "assets", "upload", ":uploadId"],
    public: true,
    handler: async (context, params, req, url) => {
      const uploadId = requireParam(params, "uploadId");
      const token = url.searchParams.get("token");
      if (token === null) {
        throw new AuthError(401, "Upload token is missing", {
          suggestion: "Use the signed URL returned by the upload-url endpoint.",
        });
      }
      const ticket = context.uploadSigner.verify(token);
      if (!ticket || ticket.uploadId !== uploadId) {
        throw new AuthError(401, "Upload token is invalid", {
          suggestion: "Request a fresh upload URL and retry.",
        });
      }
      if (Date.parse(ticket.expiresAt) <= Date.now()) {
        throw new SenifyError("validation", "Upload URL is expired", {
          field: "uploadId",
          suggestion: "Request a fresh upload URL.",
        });
      }
      const data = await readRawBody(req, context.maxUploadBytes);
      const upload = await commitUpload(mediaContext(context), { ticket, data });
      context.events.publish({
        kind: "asset.uploaded",
        siteId: upload.asset.siteId,
        action: "uploadAsset",
      });
      return { status: 201, body: upload };
    },
  },

  {
    method: "GET",
    segments: ["api", "library-components"],
    scope: "read",
    handler: async (context) => ({ status: 200, body: { components: await context.store.listLibraryComponents() } }),
  },

  {
    method: "POST",
    segments: ["api", "library-components"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = parseBody<CreateLibraryComponentBody>(CreateLibraryComponentBodySchema, (await readJsonBody(req)) ?? {}, "library component");
      return {
        status: 201,
        body: await context.store.createLibraryComponent({
          id: newEntityId(),
          name: body.name,
          kind: body.kind ?? "component",
          definition: body.definition,
          fingerprint: body.fingerprint,
          tags: body.tags ?? [],
          provenance: body.provenance === undefined ? { kind: "hand", sourceUrl: null, pagePath: null, irHash: null } : { kind: body.provenance.kind, sourceUrl: body.provenance.sourceUrl ?? null, pagePath: body.provenance.pagePath ?? null, irHash: body.provenance.irHash ?? null },
          license: body.license === undefined ? { id: "unknown", note: null, status: "unknown" } : { id: body.license.id, note: body.license.note ?? null, status: body.license.status ?? "unknown" },
          notes: body.notes ?? "",
          author: body.author,
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "library-components", "audit"],
    scope: "read",
    handler: async (context) => ({ status: 200, body: { entries: await context.store.listLibraryAudit() } }),
  },

  {
    method: "GET",
    segments: ["api", "library-components", ":componentId"],
    scope: "read",
    handler: async (context, params) => ({ status: 200, body: await context.store.getLibraryComponent(requireParam(params, "componentId")) }),
  },

  {
    method: "PATCH",
    segments: ["api", "library-components", ":componentId"],
    scope: "write",
    handler: async (context, params, req) => {
      const body = parseBody<UpdateLibraryComponentBody>(UpdateLibraryComponentBodySchema, (await readJsonBody(req)) ?? {}, "library component update");
      return { status: 200, body: await context.store.updateLibraryComponent({ id: requireParam(params, "componentId"), ...body, license: body.license === undefined ? undefined : { id: body.license.id, note: body.license.note ?? null, status: body.license.status ?? "unknown" } }) };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "library-components", ":componentId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => ({ status: 200, body: await context.store.deleteLibraryComponent(requireParam(params, "componentId")) }),
  },

  {
    // Root files of a bake: the baked pages link `/assets/theme.css`,
    // `/assets/sections.css`, `/assets/islands.js` … next to the asset store's
    // own `/assets/<id>/<file>` (one segment less, so no collision). Served for
    // the published release and, while nothing is published, for the newest
    // preview — `?release=`/`?preview=` pick a build explicitly.
    method: "GET",
    segments: ["assets", ":filename"],
    public: true,
    handler: async (context, params, _req, url) => {
      const filename = requireParam(params, "filename");
      if (!BUILD_ROOT_FILES.has(filename)) {
        throw new SenifyError("not_found", `File "${filename}" does not exist`, {
          field: "filename",
        });
      }
      return buildRootFile(context, url, `assets/${filename}`);
    },
  },

  {
    // Astro's hashed bundle output (`/_astro/<name>.css`) lives in the build
    // root as well; the document links it with an absolute path.
    method: "GET",
    segments: ["_astro", ":filename"],
    public: true,
    handler: async (context, params, _req, url) => {
      const filename = requireParam(params, "filename");
      if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
        throw new SenifyError("validation", `Invalid file name "${filename}"`, {
          field: "filename",
        });
      }
      return buildRootFile(context, url, `_astro/${filename}`);
    },
  },

  {
    // Public asset delivery under the path the bake writes into the build.
    method: "GET",
    segments: ["assets", ":assetId", ":filename"],
    public: true,
    handler: async (context, params) => {
      const asset = await context.store.getAsset(requireParam(params, "assetId"));
      if (asset.status !== "ready") {
        throw new SenifyError("not_found", `Asset "${asset.id}" is in the trash`, {
          field: "assetId",
        });
      }
      const filename = requireParam(params, "filename");
      if (storedFileName(asset.storageRef) !== filename) {
        throw new SenifyError("not_found", `File "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(context.dataDir, asset.storageRef);
      if (file === undefined) {
        throw new SenifyError(
          "not_found",
          `File of asset "${asset.id}" is not resolvable`,
          { field: "assetId" },
        );
      }
      // Revalidate: a replace keeps the URL stable, the content must not be
      // served from a stale cache. The type follows the stored MIME, because a
      // replace may swap the file type under the old name.
      return {
        status: 200,
        file: {
          path: file,
          contentType: asset.mime,
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },

  {
    // Encoded ladder rungs, served under the same path the bake writes them to.
    method: "GET",
    segments: ["assets", ":assetId", "variants", ":filename"],
    public: true,
    handler: async (context, params) => {
      const asset = await context.store.getAsset(requireParam(params, "assetId"));
      if (asset.status !== "ready") {
        throw new SenifyError("not_found", `Asset "${asset.id}" is in the trash`, {
          field: "assetId",
        });
      }
      const filename = requireParam(params, "filename");
      const variant = asset.variants.find(
        (entry) => `${entry.width}.${entry.format}` === filename,
      );
      if (variant === undefined) {
        throw new SenifyError("not_found", `Variant "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(context.dataDir, variant.storageRef);
      if (file === undefined) {
        throw new SenifyError(
          "not_found",
          `Variant file of asset "${asset.id}" is not resolvable`,
          { field: "assetId" },
        );
      }
      return {
        status: 200,
        file: {
          path: file,
          contentType: variant.format === "avif" ? "image/avif" : "image/webp",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },

  // ------------------------------------------------------- images (S1)
  {
    // Diagnosis of both providers of the chain: the image-use backend (doctor,
    // capped) and ComfyUI reachability plus the configured model files. With
    // `provider: off` the answer stays a clean state, not an error.
    method: "GET",
    segments: ["api", "images", "health"],
    scope: "read",
    handler: async (context) => {
      const settings = await context.store.getImageSettings();
      if (settings.provider === "off") {
        return {
          status: 200,
          body: {
            provider: settings.provider,
            fallbackProvider: settings.fallbackProvider,
            detail:
              "Bildgenerierung ist in den Einstellungen deaktiviert (provider: off).",
            providers: { "image-use": null, comfyui: null, custom: null },
          },
        };
      }
      const [imageUse, comfyui, custom] = await Promise.all([
        createImageUseProvider(settings).health(),
        createComfyImageProvider(settings).health(),
        createImageCustomProvider(
          {
            baseUrl: settings.customBaseUrl,
            model: settings.customModel,
            format: settings.customFormat,
            maxPixels: settings.maxPixels,
          },
          { resolveApiKey: () => resolveCustomApiKey(context.store) },
        ).health(),
      ]);
      return {
        status: 200,
        body: {
          provider: settings.provider,
          fallbackProvider: settings.fallbackProvider,
          providers: { "image-use": imageUse, comfyui, custom },
        },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "images", "jobs", ":jobId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getImageJob(requireParam(params, "jobId")),
    }),
  },

  {
    method: "DELETE",
    segments: ["api", "images", "jobs", ":jobId"],
    scope: "write",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.cancelImageJob(requireParam(params, "jobId")),
    }),
  },
];
