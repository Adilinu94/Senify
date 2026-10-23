// Die Asset-Routen einer Site (P3-2, Schritt 53): Upload-Adresse, Liste,
// Lesen, Aendern, Papierkorb, Wiederherstellen, Verlauf, Massenoperation
// und die Asset-Ordner.
//
// Die elf Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich (die Tabelle `assets` samt Ableitungen und Ordnern) und
// brauchen deshalb nur drei Import-Quellen - den Routen-Helfer, den
// Koerper-Parser und `media.ts`.

import type { Route } from "./http-contract.ts";
import { mediaContext, readJsonBody, requireParam } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  applyAssetPatch,
  bulkAssets,
  createAssetFolder,
  purgeAsset,
  restoreAssetHistory,
  AssetPatchBodySchema,
  BulkAssetsBodySchema,
  CreateAssetFolderBodySchema,
  type AssetPatchBody,
  type BulkAssetsBody,
  type CreateAssetFolderBody,
} from "./media.ts";

/** Die Routen der Assets und ihrer Ordner. */
export const assetRoutes: Route[] = [
  {
    // Asset access is site-scoped (ADR-0014): a token is not bound to a site,
    // so the site comes from the path and the loaded asset carries its own.
    method: "GET",
    segments: ["api", "sites", ":siteId", "assets", ":assetId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getAssetOfSite(
        requireParam(params, "assetId"),
        requireParam(params, "siteId"),
      ),
    }),
  },

  {
    method: "PATCH",
    segments: ["api", "sites", ":siteId", "assets", ":assetId"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const assetId = requireParam(params, "assetId");
      const body = (await readJsonBody(req)) ?? {};
      const patch = parseBody<AssetPatchBody>(
        AssetPatchBodySchema,
        body,
        "asset update",
      );
      return {
        status: 200,
        body: await applyAssetPatch(context.store, { siteId, assetId }, patch),
      };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "assets", ":assetId"],
    scope: "write",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const assetId = requireParam(params, "assetId");
      // Soft delete: files stay on disk, the record flips to "trashed".
      await context.store.getAssetOfSite(assetId, siteId);
      return {
        status: 200,
        body: await context.store.updateAsset(assetId, {
          status: "trashed",
          trashedAt: new Date().toISOString(),
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", ":assetId", "restore"],
    scope: "write",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const assetId = requireParam(params, "assetId");
      await context.store.getAssetOfSite(assetId, siteId);
      return {
        status: 200,
        body: await context.store.updateAsset(assetId, {
          status: "ready",
          trashedAt: null,
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", ":assetId", "purge"],
    scope: "publish",
    destructive: true,
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const assetId = requireParam(params, "assetId");
      const asset = await purgeAsset(mediaContext(context), { siteId, assetId });
      return { status: 200, body: { purged: asset.id } };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "assets", ":assetId", "history"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const assetId = requireParam(params, "assetId");
      await context.store.getAssetOfSite(assetId, siteId);
      return {
        status: 200,
        body: { history: await context.store.listAssetHistory(assetId) },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", ":assetId", "restore-history", ":historyId"],
    scope: "write",
    handler: async (context, params) => ({
      status: 200,
      body: await restoreAssetHistory(mediaContext(context), {
        siteId: requireParam(params, "siteId"),
        assetId: requireParam(params, "assetId"),
        historyId: requireParam(params, "historyId"),
      }),
    }),
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", "bulk"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<BulkAssetsBody>(
        BulkAssetsBodySchema,
        body,
        "asset bulk request",
      );
      // Bulk is a write route; permanent deletes still need the publish scope.
      const allowPurge = auth?.scopes.includes("publish") === true;
      return {
        status: 200,
        body: await bulkAssets(mediaContext(context), {
          siteId,
          body: input,
          allowPurge,
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "asset-folders"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateAssetFolderBody>(
        CreateAssetFolderBodySchema,
        body,
        "asset folder",
      );
      return {
        status: 201,
        body: await createAssetFolder(mediaContext(context), {
          siteId,
          name: input.name,
          parentId: input.parentId ?? null,
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "asset-folders"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        folders: await context.store.listAssetFolders(
          requireParam(params, "siteId"),
        ),
      },
    }),
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "asset-folders", ":folderId"],
    scope: "write",
    handler: async (context, params) => {
      const folderId = requireParam(params, "folderId");
      await context.store.getAssetFolderOfSite(
        folderId,
        requireParam(params, "siteId"),
      );
      await context.store.deleteAssetFolder(folderId);
      return { status: 204 };
    },
  },
];
