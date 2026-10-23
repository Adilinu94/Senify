// Die Medien-Werkzeuge der MCP-Fassade (P3-2, Schritt 57): Assets lesen,
// hochladen, aendern, ersetzen, loeschen und wiederherstellen, Bilder
// erzeugen und abfragen, Sammlungen und Eintraege samt Einsendungen.
//
// Die 21 Werkzeuge standen in `tools.ts` und sind dort zusammenhaengend. Sie
// brauchen nur zwei Import-Quellen und ein Schema; der Manifest-Generator
// liest sie mit (`render-manifest.mjs` nimmt alle `tools-*.ts`).

import { SenifyError } from "@senify/core";
import { ASSET_SCHEMA } from "./tools-schemas.ts";
import type { ToolDefinition } from "./tools.ts";
import {
  listSchema,
  objectSchema,
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  pagingQuery,
  requireNumber,
  requireRecord,
  requireString,
  uploadLocalFile,
} from "./tools-support.ts";

/** Die Werkzeuge der Medien und der Inhalte. */
export const MEDIEN_TOOLS: ToolDefinition[] = [

  {
    name: "list_assets",
    title: "List assets",
    description:
      "Lists the media library of a site with filters (folder, tag, alt=missing, minBytes, q) and sorting. Use alt=missing for the no-alt-text smart list and sort=replacedAt for recently replaced files. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        folder: { type: "string" },
        tag: { type: "string" },
        alt: { type: "string", enum: ["missing"] },
        minBytes: { type: "number" },
        q: { type: "string" },
        sort: {
          type: "string",
          enum: ["createdAt", "name", "size", "replacedAt"],
        },
        status: { type: "string", enum: ["ready", "trashed", "all"] },
        limit: { type: "number" },
        offset: { type: "number" },
      },
      ["siteId"],
    ),
    outputSchema: listSchema("assets", ASSET_SCHEMA),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams();
      for (const key of ["folder", "tag", "alt", "q", "sort", "status"]) {
        const value = optionalString(args, key);
        if (value !== undefined) params.set(key, value);
      }
      const minBytes = optionalNumber(args, "minBytes");
      if (minBytes !== undefined) params.set("minBytes", String(minBytes));
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/assets${pagingQuery(args, params)}`,
      );
    },
  },
  {
    name: "upload_asset",
    title: "Upload asset",
    description:
      "Uploads a local file to the media library: asks for a signed upload URL, sends the bytes and returns the asset record. Identical bytes dedupe onto the existing asset instead of creating a second record. Pass an idempotencyKey to make a retry reuse the first upload URL.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        filePath: { type: "string" },
        altText: { type: "string" },
        decorative: { type: "boolean" },
        folderId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        idempotencyKey: { type: "string" },
      },
      ["siteId", "filePath"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const filePath = requireString(args, "filePath");
      const extra: Record<string, unknown> = {};
      const altText = optionalString(args, "altText");
      if (altText !== undefined) extra.altText = altText;
      const decorative = optionalBoolean(args, "decorative");
      if (decorative !== undefined) extra.decorative = decorative;
      const folderId = optionalString(args, "folderId");
      if (folderId !== undefined) extra.folderId = folderId;
      const tags = optionalStringArray(args, "tags");
      if (tags !== undefined) extra.tags = tags;
      const idempotencyKey = optionalString(args, "idempotencyKey");
      if (idempotencyKey !== undefined) extra.idempotencyKey = idempotencyKey;
      return uploadLocalFile(context, { siteId, filePath, extra });
    },
  },
  {
    name: "update_asset",
    title: "Update asset",
    description:
      "Updates asset metadata (alt text, decorative flag, folder, tags). Mark purely decorative images as decorative so the alt-text check exempts them; pass null for altText or folderId to clear it. The asset must belong to siteId.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        assetId: { type: "string" },
        altText: { type: ["string", "null"] },
        decorative: { type: "boolean" },
        folderId: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
      },
      ["siteId", "assetId"],
    ),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) => {
      const assetId = requireString(args, "assetId");
      const patch: Record<string, unknown> = {};
      const altText = optionalNullableString(args, "altText");
      if (altText !== undefined) patch.altText = altText;
      const decorative = optionalBoolean(args, "decorative");
      if (decorative !== undefined) patch.decorative = decorative;
      const folderId = optionalNullableString(args, "folderId");
      if (folderId !== undefined) patch.folderId = folderId;
      const tags = optionalStringArray(args, "tags");
      if (tags !== undefined) patch.tags = tags;
      if (Object.keys(patch).length === 0) {
        throw new SenifyError("validation", "No asset metadata to update", {
          field: "assetId",
          suggestion: "Pass altText, decorative, folderId or tags.",
        });
      }
      const siteId = requireString(args, "siteId");
      return context.client.request("PATCH", `/api/sites/${siteId}/assets/${assetId}`, patch);
    },
  },
  {
    name: "replace_asset",
    title: "Replace asset file",
    description:
      "Replaces the file of an asset under the same id and URL: every usage stays valid, the previous file lands in the history (restorable) and metadata like alt text and tags is kept.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        assetId: { type: "string" },
        filePath: { type: "string" },
        altText: { type: "string" },
      },
      ["siteId", "assetId", "filePath"],
    ),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const assetId = requireString(args, "assetId");
      const filePath = requireString(args, "filePath");
      const result = await uploadLocalFile(context, {
        siteId,
        filePath,
        extra: { replaceAssetId: assetId },
      });
      const altText = optionalString(args, "altText");
      if (altText === undefined) return result;
      return context.client.request("PATCH", `/api/sites/${siteId}/assets/${assetId}`, {
        altText,
      });
    },
  },
  {
    name: "delete_asset",
    title: "Delete asset",
    description:
      "Moves an asset to the trash (reversible). References to it are marked broken at submit and publish; restore it with restore_asset or delete it for good from the program. The asset must belong to siteId.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" }, assetId: { type: "string" } }, [
      "siteId",
      "assetId",
    ]),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const assetId = requireString(args, "assetId");
      await context.client.request("DELETE", `/api/sites/${siteId}/assets/${assetId}`);
      return { trashed: assetId };
    },
  },
  {
    name: "restore_asset",
    title: "Restore asset",
    description:
      "Takes an asset out of the trash so references become valid again. The file was never deleted; only the record status changes. The asset must belong to siteId.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" }, assetId: { type: "string" } }, [
      "siteId",
      "assetId",
    ]),
    entity: (args) => `asset:${String(args.assetId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "POST",
        `/api/sites/${requireString(args, "siteId")}/assets/${requireString(args, "assetId")}/restore`,
      ),
  },
  {
    name: "generate_image",
    title: "Generate image",
    description:
      "Starts an image generation job and returns its id — poll it with get_image_job. The provider chain is configured in the program (custom endpoint → ChatGPT subscription → local Qwen fallback); read providerUsed instead of guessing. The subscription takes ~1 min, the local Qwen fallback 9–45 min. Pass a prompt or a referenceId with a stored recipe; altText, decorative, folderId and tags carry the asset metadata. Not idempotent: an idempotencyKey makes retries safe.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        prompt: { type: "string" },
        referenceId: { type: "string" },
        provider: { type: "string", enum: ["image-use", "comfyui", "custom", "off"] },
        width: { type: "number" },
        height: { type: "number" },
        steps: { type: "number" },
        seed: { type: "number" },
        filename: { type: "string" },
        altText: { type: "string" },
        decorative: { type: "boolean" },
        folderId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        idempotencyKey: { type: "string" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const body: Record<string, unknown> = {};
      const prompt = optionalString(args, "prompt");
      if (prompt !== undefined) body.prompt = prompt;
      const referenceId = optionalString(args, "referenceId");
      if (referenceId !== undefined) body.referenceId = referenceId;
      const provider = optionalString(args, "provider");
      if (provider !== undefined) body.provider = provider;
      for (const key of ["width", "height", "steps", "seed"]) {
        const value = optionalNumber(args, key);
        if (value !== undefined) body[key] = value;
      }
      const filename = optionalString(args, "filename");
      if (filename !== undefined) body.filename = filename;
      const altText = optionalString(args, "altText");
      if (altText !== undefined) body.altText = altText;
      const decorative = optionalBoolean(args, "decorative");
      if (decorative !== undefined) body.decorative = decorative;
      const folderId = optionalString(args, "folderId");
      if (folderId !== undefined) body.folderId = folderId;
      const tags = optionalStringArray(args, "tags");
      if (tags !== undefined) body.tags = tags;
      const idempotencyKey = optionalString(args, "idempotencyKey");
      if (idempotencyKey !== undefined) body.idempotencyKey = idempotencyKey;
      return context.client.request("POST", `/api/sites/${siteId}/images/jobs`, body);
    },
  },
  {
    name: "get_image_job",
    title: "Get image job",
    description:
      "Returns the status of an image job: status, providerUsed, assetId, the provider attempt history and timestamps. Poll it (at least every 60 s); succeeded hands over the assetId for the assetRef.",
    scope: "read",
    inputSchema: objectSchema({ jobId: { type: "string" } }, ["jobId"]),
    entity: (args) => `job:${String(args.jobId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/images/jobs/${requireString(args, "jobId")}`,
      ),
  },
  {
    name: "list_image_jobs",
    title: "List image jobs",
    description:
      "Lists the image jobs of a site (newest first), optionally filtered by status. Use it to coordinate parallel generations. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        status: {
          type: "string",
          enum: ["queued", "running", "succeeded", "failed", "canceled"],
        },
        limit: { type: "number" },
        offset: { type: "number" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams();
      const status = optionalString(args, "status");
      if (status !== undefined) params.set("status", status);
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/images/jobs${pagingQuery(args, params)}`,
      );
    },
  },
  {
    name: "list_collections",
    title: "List collections",
    description:
      "Lists the content collections of a site with slug, fields and supports flags. Start here to find the collectionId that get_collection and list_entries need.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        includeDeprecated: { type: "boolean" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const includeDeprecated = optionalBoolean(args, "includeDeprecated");
      const query = includeDeprecated === true ? "?includeDeprecated=true" : "";
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/collections${query}`,
      );
    },
  },
  {
    name: "get_collection",
    title: "Get collection",
    description:
      "Loads one collection with its field definitions (id, key, type, required, description). Read it before writing entries: cells are keyed by field id.",
    scope: "read",
    inputSchema: objectSchema({ collectionId: { type: "string" } }, [
      "collectionId",
    ]),
    entity: (args) => `collection:${String(args.collectionId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/collections/${requireString(args, "collectionId")}`,
      ),
  },
  {
    name: "list_entries",
    title: "List entries",
    description:
      "Lists the entries of a site with filters (collectionId, status, q, trashed) and sorting (sort, dir). With q the hits come back ranked by weight (title, then slug, then body), not by the sort field. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "published", "unpublished", "scheduled"],
        },
        trashed: { type: "boolean" },
        q: { type: "string" },
        sort: {
          type: "string",
          enum: ["updatedAt", "createdAt", "publishedAt", "title", "dateField"],
        },
        dir: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "number" },
        offset: { type: "number" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams();
      for (const key of ["collectionId", "status", "q", "sort", "dir"]) {
        const value = optionalString(args, key);
        if (value !== undefined) params.set(key, value);
      }
      const trashed = optionalBoolean(args, "trashed");
      if (trashed !== undefined) params.set("trashed", String(trashed));
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/entries${pagingQuery(args, params)}`,
      );
    },
  },
  {
    name: "get_entry",
    title: "Get entry",
    description:
      "Loads one entry with its cells, slug, status and the baseVersion that update_entry expects. The version number also tells you how often the entry changed.",
    scope: "read",
    inputSchema: objectSchema({ entryId: { type: "string" } }, ["entryId"]),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/entries/${requireString(args, "entryId")}`,
      ),
  },
  {
    name: "create_entry",
    title: "Create entry",
    description:
      "Creates a draft entry in a collection. Cells are keyed by field id (see get_collection) and may stay incomplete; required fields are checked at publish. Without a slug it is derived from the title field. Pass an idempotencyKey to make a retry return the first result instead of creating a duplicate.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        cells: { type: "object" },
        slug: { type: "string" },
        idempotencyKey: { type: "string" },
      },
      ["siteId", "collectionId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const cells =
        args.cells === undefined ? undefined : requireRecord(args, "cells");
      const slug = optionalString(args, "slug");
      const idempotencyKey = optionalString(args, "idempotencyKey");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/sites/${siteId}/entries`, {
        collectionId: requireString(args, "collectionId"),
        ...(cells === undefined ? {} : { cells }),
        ...(slug === undefined ? {} : { slug }),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "update_entry",
    title: "Update entry",
    description:
      "Writes cells, slug or status of an entry. baseVersion from get_entry is mandatory; a conflict error means: reload the entry and retry. Cells are merged per field, null clears a field.",
    scope: "write",
    inputSchema: objectSchema(
      {
        entryId: { type: "string" },
        baseVersion: { type: "number" },
        cells: { type: "object" },
        slug: { type: "string" },
        status: { type: "string", enum: ["draft", "unpublished", "scheduled"] },
        scheduledAt: { type: "string" },
      },
      ["entryId", "baseVersion"],
    ),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const entryId = requireString(args, "entryId");
      const cells =
        args.cells === undefined ? undefined : requireRecord(args, "cells");
      const slug = optionalString(args, "slug");
      const status = optionalString(args, "status");
      const scheduledAt = optionalString(args, "scheduledAt");
      const name = await context.client.tokenName();
      return context.client.request("PUT", `/api/entries/${entryId}`, {
        baseVersion: requireNumber(args, "baseVersion"),
        ...(cells === undefined ? {} : { cells }),
        ...(slug === undefined ? {} : { slug }),
        ...(status === undefined ? {} : { status }),
        ...(scheduledAt === undefined ? {} : { scheduledAt }),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "publish_entry",
    title: "Publish entry",
    description:
      "Publishes an entry: validates required and unique fields, writes an immutable version, records the 301 redirect when the slug changed and triggers the re-bake of the affected routes.",
    scope: "write",
    inputSchema: objectSchema(
      {
        entryId: { type: "string" },
        baseVersion: { type: "number" },
      },
      ["entryId"],
    ),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const entryId = requireString(args, "entryId");
      const baseVersion = optionalNumber(args, "baseVersion");
      const name = await context.client.tokenName();
      return context.client.request("POST", `/api/entries/${entryId}/publish`, {
        ...(baseVersion === undefined ? {} : { baseVersion }),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
  {
    name: "delete_entry",
    title: "Delete entry",
    description:
      "Moves an entry to the trash (reversible) and drops its route from the bake. Nothing is deleted for good — restore it with restore_entry.",
    scope: "write",
    inputSchema: objectSchema({ entryId: { type: "string" } }, ["entryId"]),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const entryId = requireString(args, "entryId");
      const name = await context.client.tokenName();
      await context.client.request("DELETE", `/api/entries/${entryId}`, {
        author: { kind: "agent", id: name, label: name },
      });
      return { trashed: entryId };
    },
  },
  {
    name: "restore_entry",
    title: "Restore entry",
    description:
      "Takes an entry out of the trash. Fails with a conflict if another live entry took over its slug in the meantime.",
    scope: "write",
    inputSchema: objectSchema({ entryId: { type: "string" } }, ["entryId"]),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const name = await context.client.tokenName();
      return context.client.request(
        "POST",
        `/api/entries/${requireString(args, "entryId")}/restore`,
        { author: { kind: "agent", id: name, label: name } },
      );
    },
  },
  {
    name: "restore_entry_version",
    title: "Restore entry version",
    description:
      "Copies a published version into the draft (append-only, publishes nothing). Version ids come from the entry timeline; the next publish writes a new version.",
    scope: "write",
    inputSchema: objectSchema(
      {
        entryId: { type: "string" },
        versionId: { type: "string" },
      },
      ["entryId", "versionId"],
    ),
    entity: (args) => `entry:${String(args.entryId ?? "")}`,
    handler: async (context, args) => {
      const name = await context.client.tokenName();
      return context.client.request(
        "POST",
        `/api/entries/${requireString(args, "entryId")}/restore-version/${requireString(args, "versionId")}`,
        { author: { kind: "agent", id: name, label: name } },
      );
    },
  },
  {
    name: "search_entries",
    title: "Search entries",
    description:
      "Full-text search across the entries of a site, ranked by weight (title A, slug B, body C) and date. Returns the hits with their score; narrow with collectionId or status.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        q: { type: "string" },
        collectionId: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "published", "unpublished", "scheduled"],
        },
        limit: { type: "number" },
      },
      ["siteId", "q"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const collectionId = optionalString(args, "collectionId");
      const status = optionalString(args, "status");
      const limit = optionalNumber(args, "limit");
      return context.client.request(
        "POST",
        `/api/sites/${siteId}/entries/search`,
        {
          q: requireString(args, "q"),
          ...(collectionId === undefined ? {} : { collectionId }),
          ...(status === undefined ? {} : { status }),
          ...(limit === undefined ? {} : { limit }),
        },
      );
    },
  },
  {
    name: "list_submissions",
    title: "List submissions",
    description:
      "Lists the submissions of a collection as a flat inbox view (columns + rows mapped to their field labels). Submissions are ordinary entries, so list_entries, get_entry and search_entries work on them too; this view is the labelled inbox for form data.",
    scope: "read",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        collectionId: { type: "string" },
        limit: { type: "number" },
      },
      ["siteId", "collectionId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const params = new URLSearchParams({
        collectionId: requireString(args, "collectionId"),
      });
      const limit = optionalNumber(args, "limit");
      if (limit !== undefined) params.set("limit", String(limit));
      return context.client.request(
        "GET",
        `/api/sites/${siteId}/submissions?${params.toString()}`,
      );
    },
  },
];
