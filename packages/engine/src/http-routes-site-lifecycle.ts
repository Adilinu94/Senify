// Die Routen des Site-Lebenszyklus (P3-2, Schritt 60): anlegen, listen,
// aendern, Papierkorb, wiederherstellen, duplizieren, lesen, loeschen.
//
// Die acht Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - eine Site entsteht, wechselt ihren Zustand und verschwindet -
// und brauchen deshalb nur fuenf Import-Quellen: den Routen-Helfer, den
// Koerper-Parser, den Site-Vertrag, `media.ts` (das Duplizieren kopiert die
// Assets mit) und `storage.ts` (das Loeschen raeumt die Dateien ab).

import type { Route } from "./http-contract.ts";
import { mediaContext, readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  CreateSiteBodySchema,
  type CreateSiteBody,
} from "./mutations/contract.ts";
import {
  DuplicateSiteBodySchema,
  SiteEventBodySchema,
  UpdateSiteBodySchema,
  type DuplicateSiteBody,
  type SiteEventBody,
  type UpdateSiteBody,
} from "./site-contract.ts";
import { collectAssetIds, copySiteAssets, rewriteAssetRefs } from "./media.ts";
import { removeSiteFiles } from "./storage.ts";
import { paginate, parsePaging } from "./paging.ts";
import { SenifyError } from "@senify/core";

export const siteLifecycleRoutes: Route[] = [
  {
    method: "POST",
    segments: ["api", "sites"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const siteBody = parseBody<CreateSiteBody>(CreateSiteBodySchema, body, "site");
      const site = await context.store.createSite(siteBody);
      return { status: 201, body: site };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const trash = url.searchParams.get("trash");
      const paging = parsePaging(url.searchParams);
      if (trash === "1" || trash === "true") {
        // Paging applies to the trash list too. It is a list like any other, and
        // a site that was deleted a year ago does not make today's reading
        // faster.
        const all = await context.store.listTrashedSites();
        const page = paginate(all, paging, all.length);
        return {
          status: 200,
          body: { sites: page.items, ...page, items: undefined },
        };
      }
      const all = await context.store.listSites();
      const page = paginate(all, paging, all.length);
      return {
        status: 200,
        // The list under its own name, plus the paging block. Both, not one or
        // the other: a client that only wants rows reads `sites`, and a client
        // that wants to keep reading reads `page`/`total`/`hasMore`.
        body: { sites: page.items, ...page, items: undefined },
      };
    },
  },

  {
    method: "PATCH",
    segments: ["api", "sites", ":siteId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<UpdateSiteBody>(
        UpdateSiteBodySchema,
        body,
        "site update",
      );
      if (
        parsed.name === undefined &&
        parsed.profile === undefined &&
        parsed.baseUrl === undefined &&
        parsed.breakpoints === undefined
      ) {
        throw new SenifyError(
          "validation",
          "Nothing to update: pass a name, a profile, a baseUrl or breakpoints",
          {
            field: "body",
            suggestion:
              'Send { "name": "…" }, { "profile": "clean|standard|showcase" }, { "baseUrl": "https://www.kunde.de" } or { "breakpoints": { "tablet": 1024, "mobile": 640 } }.',
          },
        );
      }
      let site = await context.store.getSite(siteId);
      if (parsed.name !== undefined) {
        site = await context.store.renameSite(siteId, parsed.name);
        await context.store.recordSiteEvent({
          siteId,
          mutation: "rename_site",
          params: { name: parsed.name },
          author: resolveAuthor(auth),
        });
      }
      if (parsed.profile !== undefined) {
        site = await context.store.updateSiteProfile(siteId, parsed.profile);
        await context.store.recordSiteEvent({
          siteId,
          mutation: "update_site_profile",
          params: { profile: parsed.profile },
          author: resolveAuthor(auth),
        });
      }
      // Last, so the response carries the stored address next to the other
      // changes of the same request.
      if (parsed.baseUrl !== undefined) {
        site = await context.store.updateSiteBaseUrl(siteId, parsed.baseUrl);
        await context.store.recordSiteEvent({
          siteId,
          mutation: "update_site_base_url",
          params: { baseUrl: site.baseUrl ?? null },
          author: resolveAuthor(auth),
        });
      }
      if (parsed.breakpoints !== undefined) {
        site = await context.store.updateSiteBreakpoints(siteId, parsed.breakpoints);
        await context.store.recordSiteEvent({
          siteId,
          mutation: "update_site_breakpoints",
          params: { breakpoints: site.breakpoints ?? null },
          author: resolveAuthor(auth),
        });
      }
      return { status: 200, body: site };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "trash"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<SiteEventBody>(SiteEventBodySchema, body, "site trash");
      const site = await context.store.trashSite(siteId);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "trash_site",
        params: {},
        author: resolveAuthor(auth),
      });
      return { status: 200, body: site };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "restore"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<SiteEventBody>(SiteEventBodySchema, body, "site restore");
      const site = await context.store.restoreSite(siteId);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "restore_site",
        params: {},
        author: resolveAuthor(auth),
      });
      return { status: 200, body: site };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "duplicate"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<DuplicateSiteBody>(
        DuplicateSiteBodySchema,
        body,
        "site duplicate",
      );
      const author = resolveAuthor(auth);
      const sourcePages = await context.store.listPageDrafts(siteId);
      const needed = collectAssetIds(sourcePages);
      const { site, pageIds } = await context.store.duplicateSiteWithPlan(siteId, {
        withContent: parsed.withContent ?? false,
        author,
      });
      // The copy gets its own media (ADR-0014): without this the drafts would
      // point at the source's assets, the copy could not be published, and a
      // purge of the copy would delete the source's files.
      const copy = await copySiteAssets(mediaContext(context), {
        sourceSiteId: siteId,
        targetSiteId: site.id,
        assetIds: needed,
        now: new Date().toISOString(),
      });
      for (const [sourcePageId, targetPageId] of pageIds) {
        const page = sourcePages.find((candidate) => candidate.id === sourcePageId);
        if (page === undefined) continue;
        const draft = rewriteAssetRefs(page.draft, copy.idMap);
        await context.store.replacePageDraft(targetPageId, draft);
      }
      if (copy.assets > 0 || copy.folders > 0 || copy.skipped.length > 0) {
        await context.store.recordSiteEvent({
          siteId: site.id,
          mutation: "duplicate_site_assets",
          params: {
            sourceSiteId: siteId,
            assets: copy.assets,
            folders: copy.folders,
            skipped: copy.skipped.length,
          },
          author,
        });
      }
      return { status: 201, body: site };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: await context.store.getSite(siteId) };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const removed = await context.store.deleteSite(siteId);
      removeSiteFiles(context.dataDir, siteId, removed.fileRefs);
      return { status: 204 };
    },
  },
];
