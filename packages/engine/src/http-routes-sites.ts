// Die Routen der Sites: Seiten, Bausteine, Themes, Breakpoints, Assets und
// Ereignisse einer Site. Die Tabelle des Dispatchers in `http.ts` nimmt sie
// unveraendert auf (ADR-0019).

import type { Route } from "./http-contract.ts";
import {
  referenceContext,
  lifecycleContext,
  mediaContext,
  resolveAuthor,
  withIdempotency,
  readJsonBody,
  applyMutationsToPage,
  requireParam,
  limitParam,
} from "./http-route-support.ts";
import { SenifyError } from "@senify/core";
import { paginate, parsePaging } from "./paging.ts";
import { newEntityId } from "./ids.ts";
import { assertImportRootAllowed, IMPORT_MAX_ATTEMPTS, runFramerImportJob, sourceOf } from "./imports.ts";
import { createImportPreviewDriver, previewFramerImport } from "./import-preview.ts";
import {
  CreateImportBodySchema,
  type CreateImportBody,
} from "./imports-contract.ts";
import {
  AuthorSchema,
  CreatePageBodySchema,
  CreateSiteBodySchema,
  parseBody,
  UpdateThemeBodySchema,
  type CreatePageBody,
  type CreateSiteBody,
  type UpdateThemeBody,
} from "./mutations/contract.ts";
import { parseDurationMs } from "@senify/renderer";
import { resolveTheme } from "@senify/tokens";
import {
  CreateStyleRuleBodySchema,
  DuplicateSiteBodySchema,
  ReorderStyleRuleBodySchema,
  SiteEventBodySchema,
  UpdateSiteBodySchema,
  UpdateStyleRuleBodySchema,
  type CreateStyleRuleBody,
  type DuplicateSiteBody,
  type UpdateSiteBody,
  type ReorderStyleRuleBody,
  type SiteEventBody,
  type UpdateStyleRuleBody,
} from "./site-contract.ts";
import {
  createPreview,
  expirePreviews,
  publishRelease,
  submitReview,
} from "./lifecycle.ts";
import {
  CreatePreviewBodySchema,
  PublishReleaseBodySchema,
  SubmitReviewBodySchema,
  type CreatePreviewBody,
  type PublishReleaseBody,
  type SubmitReviewBody,
} from "./lifecycle-contract.ts";
import { Store } from "./store.ts";
import { validateImageRequest } from "./image-provider.ts";
import {
  CreateImageJobBodySchema,
  type CreateImageJobBody,
} from "./images-contract.ts";
import { encryptImageApiKey } from "./settings.ts";
import {
  createCollectionFromForm,
  listSiteForms,
  listSubmissions,
  planCollectionFromForm,
} from "./forms.ts";
import {
  FormCollectionCreateBodySchema,
  FormCollectionPlanBodySchema,
  type FormCollectionCreateBody,
  type FormCollectionPlanBody,
} from "./forms-contract.ts";
import {
  createCollection,
  createCollectionFromFields,
  createEntry,
  listEntries,
  resolveEntryPath,
  searchEntries,
} from "./content.ts";
import {
  CreateCollectionBodySchema,
  CreateEntryBodySchema,
  FromFieldsBodySchema,
  SearchEntriesBodySchema,
  parseEntryListFilters,
  type CreateCollectionBody,
  type CreateEntryBody,
  type SearchEntriesBody,
} from "./content-contract.ts";
import {
  CreateDeploymentBodySchema,
  UpdateDeploySettingsBodySchema,
  type CreateDeploymentBody,
  type UpdateDeploySettingsBody,
} from "./deploy-contract.ts";
import {
  UpdateDesignContractBodySchema,
  type UpdateDesignContractBody,
} from "./design-contract-schema.ts";
import { deployActiveRelease } from "./deploy.ts";
import {
  applyReference,
  referenceThemeDraft,
  removeReferenceAssignment,
  verifyReferenceApply,
} from "./references-lifecycle.ts";
import {
  ApplyReferenceBodySchema,
  ApplyRedesignBodySchema,
  type ApplyReferenceBody,
  type ApplyRedesignBody,
} from "./references-contract.ts";
import { applyRedesign } from "./apply-redesign.ts";
import {
  CreateCodePayloadBodySchema,
  type CreateCodePayloadBody,
} from "./code-payloads-contract.ts";
import { createCodePayload } from "./code-payloads.ts";
import {
  InstallLibraryComponentBodySchema,
  type InstallLibraryComponentBody,
} from "./library-contract.ts";
import { buildDesignReport } from "./design-report.ts";
import { buildImagePrompt } from "./references-brief.ts";
import {
  applyAssetPatch,
  bulkAssets,
  collectAssetIds,
  copySiteAssets,
  createAssetFolder,
  createUploadTicket,
  parseAssetListFilters,
  purgeAsset,
  queryAssets,
  restoreAssetHistory,
  rewriteAssetRefs,
  AssetPatchBodySchema,
  BulkAssetsBodySchema,
  CreateAssetFolderBodySchema,
  UploadUrlBodySchema,
  type AssetPatchBody,
  type BulkAssetsBody,
  type CreateAssetFolderBody,
  type UploadUrlBody,
} from "./media.ts";
import { removeSiteFiles } from "./storage.ts";
import { buildThemeReport } from "./theme-report.ts";
import type {
  ImageJobRequest,
  ImageJobStatus,
  ReviewStatus,
} from "./types.ts";
import { IMAGE_JOB_STATUSES, REVIEW_STATUSES } from "./types.ts";
import { pageStarterById } from "./page-starters.ts";

function styleVersionHeaders(version: number): Record<string, string> {
  return {
    etag: `"style-v${version}"`,
    "x-senify-style-version": String(version),
  };
}

export const siteRoutes: Route[] = [

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

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "pages"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const pageBody = parseBody<CreatePageBody>(CreatePageBodySchema, body, "page");
      const { idempotencyKey, starter: starterId, ...pageInput } = pageBody;
      return withIdempotency(context, auth, req, url, idempotencyKey, pageBody, async () => {
        const starter = starterId === undefined ? undefined : pageStarterById(starterId);
        const created = await context.store.createPage(siteId, {
          ...pageInput,
          ...(pageInput.title === undefined && starter !== undefined
            ? { title: starter.defaultTitle }
            : {}),
        });
        let page = created;
        let starterResult: { applied: boolean; reason?: string } | undefined;
        if (starter !== undefined && starter.sections.length > 0) {
          // The sections go in through the ordinary mutation path, so a start
          // template is held to the same rules as any edit (registry schemas,
          // guardrails, design fence). When the batch is refused the page stays
          // what it was — an empty page — and the response says why.
          try {
            await applyMutationsToPage(
              context,
              created.id,
              {
                baseDraftVersion: created.draftVersion,
                mutations: starter.sections.map((section) => ({
                  op: "insertNode" as const,
                  parent: { nodeId: created.draft.rootNodeId },
                  node: section,
                })),
              },
              auth,
            );
            page = await context.store.getPage(created.id);
            starterResult = { applied: true };
          } catch (error) {
            if (!(error instanceof SenifyError)) throw error;
            starterResult = { applied: false, reason: error.message };
          }
        }
        context.events.publish({
          kind: "page.created",
          siteId,
          pageId: page.id,
          action: "createPage",
          actor: resolveAuthor(auth),
        });
        return { status: 201, body: starterResult === undefined ? page : { ...page, starter: starterResult } };
      });
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "pages"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const all = await context.store.listPages(siteId);
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return { status: 200, body: { pages: page.items, ...page, items: undefined } };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: await context.store.getTheme(siteId) };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme.css"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const stored = await context.store.getTheme(siteId);
      return {
        status: 200,
        text: { contentType: "text/css; charset=utf-8", body: stored.css },
        headers: {
          "cache-control": "no-store",
          "x-senify-theme-version": String(stored.version),
        },
      };
    },
  },

  {
    method: "PUT",
    segments: ["api", "sites", ":siteId", "theme"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const themeBody = parseBody<UpdateThemeBody>(UpdateThemeBodySchema, body, "theme update");
      const updated = await context.store.updateTheme(
        siteId,
        themeBody.theme,
        resolveAuthor(auth),
      );
      return { status: 200, body: updated };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme", "report"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return {
        status: 200,
        body: await buildThemeReport({
          store: context.store,
          registry: context.registry,
          siteId,
        }),
      };
    },
  },

  {
    // Design report (E26): the reproducible 0-100 score with its eight
    // dimensions and the named slop findings (S1-S12). A read; the gate
    // stages stay in the release checks.
    method: "GET",
    segments: ["api", "sites", ":siteId", "design-report"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await buildDesignReport({
        store: context.store,
        siteId: requireParam(params, "siteId"),
      }),
    }),
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "style-rules"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const registry = await context.store.getStyleRegistry(siteId);
      return { status: 200, body: registry, headers: styleVersionHeaders(registry.version) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<CreateStyleRuleBody>(
        CreateStyleRuleBodySchema,
        body,
        "style rule",
      );
      const { author: _suggestion, ...input } = parsed;
      const rule = await context.store.createStyleRule(siteId, input, resolveAuthor(auth));
      const version = (await context.store.getStyleRegistry(siteId)).version;
      return { status: 201, body: rule, headers: styleVersionHeaders(version) };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      return { status: 200, body: await context.store.getStyleRule(siteId, ruleId) };
    },
  },

  {
    method: "PATCH",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<UpdateStyleRuleBody>(
        UpdateStyleRuleBodySchema,
        body,
        "style rule update",
      );
      const { author: _suggestion, ...patch } = parsed;
      const rule = await context.store.updateStyleRule(siteId, ruleId, patch, resolveAuthor(auth));
      const version = (await context.store.getStyleRegistry(siteId)).version;
      return { status: 200, body: rule, headers: styleVersionHeaders(version) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId", "reorder"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<ReorderStyleRuleBody>(
        ReorderStyleRuleBodySchema,
        body,
        "style rule reorder",
      );
      const rules = await context.store.reorderStyleRule(
        siteId,
        ruleId,
        parsed.index,
        resolveAuthor(auth),
        parsed.baseVersion,
      );
      const version = (await context.store.getStyleRegistry(siteId)).version;
      return { status: 200, body: { rules }, headers: styleVersionHeaders(version) };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      const parsed = parseBody<SiteEventBody>(SiteEventBodySchema, body, "style rule delete");
      await context.store.deleteStyleRule(
        siteId,
        ruleId,
        resolveAuthor(auth),
        parsed.baseVersion,
      );
      const version = (await context.store.getStyleRegistry(siteId)).version;
      return { status: 204, headers: styleVersionHeaders(version) };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "audit"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      await context.store.getSite(siteId);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      // Site-wide activity log: pages, themes, assets and content writes.
      return {
        status: 200,
        body: { entries: await context.store.listSiteAudit(siteId, limit) },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishReleaseBody>(
        PublishReleaseBodySchema,
        body,
        "release",
      );
      const result = await publishRelease(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
        note: input.note ?? null,
        basisReleaseId: input.basisReleaseId ?? null,
      });
      context.events.publish({
        kind: "release.published",
        siteId,
        action: "publishRelease",
        actor: resolveAuthor(auth),
      });
      return { status: 201, body: result };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const all = await context.store.listReleases(siteId);
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: {
          releases: page.items,
          ...page,
          items: undefined,
          // The active release is a POINTER, not part of the list, and it stays
          // outside the paging: a caller asking for page 3 of the history still
          // needs to know which one is live, or it could roll back to something
          // that was already superseded.
          activeReleaseId: await context.store.getActiveReleaseId(siteId),
        },
      };
    },
  },

  {
    // Re-bake jobs (E12 slice 1): the durable outbox behind content changes.
    // The status is the read side of the worker — queued, running, done, failed
    // with attempts, next attempt time and the last error.
    method: "GET",
    segments: ["api", "sites", ":siteId", "bake-jobs"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const all = await context.store.listBakeJobs(siteId);
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: { jobs: page.items, ...page, items: undefined },
      };
    },
  },

  {
    // Deploy (E14): delivers the active release's build to the target. The
    // first adapter is a static directory; the outcome is recorded.
    method: "POST",
    segments: ["api", "sites", ":siteId", "deployments"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateDeploymentBody>(
        CreateDeploymentBodySchema,
        body,
        "deployment",
      );
      const provider = input.provider ?? "static";
      if (provider === "static" && input.targetDir === undefined) {
        throw new SenifyError("validation", 'Static deploys need a "targetDir"', {
          field: "targetDir",
          suggestion: 'Send { "provider": "static", "targetDir": "C:\\\\sites\\\\seite" }.',
        });
      }
      const deployment = await deployActiveRelease(context.store, {
        siteId,
        provider,
        targetDir: input.targetDir ?? "",
        author: resolveAuthor(auth),
      });
      context.events.publish({
        kind: "deploy.finished",
        siteId,
        action: deployment.status,
        actor: resolveAuthor(auth),
      });
      return { status: 201, body: { deployment } };
    },
  },

  {
    // Deploy settings (E14): where a hosted provider delivers. The token is
    // encrypted at rest; the view only says whether one exists.
    method: "GET",
    segments: ["api", "sites", ":siteId", "deploy-settings"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getDeploySettings(requireParam(params, "siteId")),
    }),
  },

  {
    method: "PUT",
    segments: ["api", "sites", ":siteId", "deploy-settings"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateDeploySettingsBody>(
        UpdateDeploySettingsBodySchema,
        body,
        "deploy settings",
      );
      const patch: Parameters<Store["updateDeploySettings"]>[1] = {};
      if (input.provider !== undefined) patch.provider = input.provider;
      if (input.netlifySiteId !== undefined) patch.netlifySiteId = input.netlifySiteId;
      if (input.netlifyToken !== undefined) {
        patch.netlifyTokenEncrypted =
          input.netlifyToken === null
            ? null
            : await encryptImageApiKey(context.store, input.netlifyToken);
      }
      if (input.vercelProjectId !== undefined) patch.vercelProjectId = input.vercelProjectId;
      if (input.vercelToken !== undefined) {
        patch.vercelTokenEncrypted =
          input.vercelToken === null
            ? null
            : await encryptImageApiKey(context.store, input.vercelToken);
      }
      const settings = await context.store.updateDeploySettings(siteId, patch);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "update_deploy_settings",
        params: {
          provider: settings.provider,
          netlifySiteId: settings.netlifySiteId,
          vercelProjectId: settings.vercelProjectId,
          tokenChanged:
            input.netlifyToken !== undefined || input.vercelToken !== undefined,
        },
        author: resolveAuthor(auth),
      });
      return { status: 200, body: settings };
    },
  },

  {
    // Design contract (E26, R9): the project's design DNA. GET returns the
    // contract or null; PUT sets a manual one (null clears it).
    method: "GET",
    segments: ["api", "sites", ":siteId", "design-contract"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getDesignContract(requireParam(params, "siteId")),
    }),
  },

  {
    method: "PUT",
    segments: ["api", "sites", ":siteId", "design-contract"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateDesignContractBody>(
        UpdateDesignContractBodySchema,
        body,
        "design contract",
      );
      const contract = await context.store.updateDesignContract(
        siteId,
        input.constants === undefined && input.never === undefined && input.vocabulary === undefined
          ? null
          : {
              constants: input.constants ?? [],
              never: input.never ?? [],
              vocabulary: input.vocabulary ?? [],
            },
      );
      await context.store.recordSiteEvent({
        siteId,
        mutation: "update_design_contract",
        params: { manual: contract !== null },
        author: resolveAuthor(auth),
      });
      return { status: 200, body: contract };
    },
  },

  {
    // The deploy history of a site (newest first).
    method: "GET",
    segments: ["api", "sites", ":siteId", "deployments"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: { deployments: await context.store.listDeployments(siteId) },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "previews"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreatePreviewBody>(
        CreatePreviewBodySchema,
        body,
        "preview",
      );
      const preview = await createPreview(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
        ttlDays: input.ttlDays,
      });
      return {
        status: 201,
        body: {
          preview,
          url: `/api/previews/${preview.id}/files/index.html?token=${preview.token}`,
        },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "previews"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const expired = await expirePreviews(lifecycleContext(context), siteId);
      return {
        status: 200,
        body: {
          previews: await context.store.listPreviews(siteId),
          expired,
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "reviews"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<SubmitReviewBody>(
        SubmitReviewBodySchema,
        body,
        "review",
      );
      const result = await submitReview(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
        note: input.note ?? null,
        pageIds: input.pageIds,
      });
      return {
        status: 201,
        body: {
          review: result.review,
          preview: result.preview,
          checks: result.checks,
        },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "reviews"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const statusParam = url.searchParams.get("status");
      if (statusParam !== null && !REVIEW_STATUSES.includes(statusParam as ReviewStatus)) {
        throw new SenifyError("validation", `Unknown review status "${statusParam}"`, {
          field: "status",
          suggestion: `Use one of: ${REVIEW_STATUSES.join(", ")}.`,
        });
      }
      return {
        status: 200,
        body: {
          reviews: await context.store.listReviewItems(siteId, {
            ...(statusParam === null
              ? {}
              : { status: statusParam as ReviewStatus }),
          }),
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", "upload-url"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UploadUrlBody>(
        UploadUrlBodySchema,
        body,
        "upload request",
      );
      const { idempotencyKey, ...uploadInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => {
        const { uploadId, ticket } = await createUploadTicket(mediaContext(context), {
          siteId,
          body: uploadInput,
        });
        const token = context.uploadSigner.sign(ticket);
        return {
          status: 201,
          body: {
            uploadId,
            url: `/api/assets/upload/${uploadId}?token=${encodeURIComponent(token)}`,
            expiresAt: ticket.expiresAt,
          },
        };
      });
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "assets"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const all = await queryAssets(
        context.store,
        siteId,
        parseAssetListFilters(url.searchParams),
      );
      // `queryAssets` already understands `limit`; the paging block is built
      // from the FILTERED list so `total` and `hasMore` describe what the filter
      // matched, not the whole library. A caller that filtered to one folder and
      // got `total: 4000` would stop paging and think it had seen everything.
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: { assets: page.items, ...page, items: undefined },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "library-installs"],
    scope: "read",
    handler: async (context, params) => ({ status: 200, body: { installs: await context.store.listLibraryInstalls(requireParam(params, "siteId")) } }),
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "library-installs"],
    scope: "write",
    handler: async (context, params, req) => {
      const body = parseBody<InstallLibraryComponentBody>(InstallLibraryComponentBodySchema, (await readJsonBody(req)) ?? {}, "library install");
      return { status: 201, body: await context.store.installLibraryComponent({ id: newEntityId(), siteId: requireParam(params, "siteId"), ...body, mode: body.mode ?? "linked" }) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "library-installs", ":installId", "update"],
    scope: "write",
    handler: async (context, params, req) => {
      const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
      const author = parseBody<{ kind: "human" | "agent"; id: string; label: string }>(AuthorSchema, body.author, "library install update");
      return { status: 200, body: await context.store.updateLibraryInstall(requireParam(params, "installId"), author) };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "library-installs", ":installId"],
    scope: "write",
    destructive: true,
    handler: async (context, params, req) => {
      const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
      const author = parseBody<{ kind: "human" | "agent"; id: string; label: string }>(AuthorSchema, body.author, "library detach");
      return { status: 200, body: await context.store.deleteLibraryInstall(requireParam(params, "installId"), author) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "code-payloads"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<CreateCodePayloadBody>(
        CreateCodePayloadBodySchema,
        body,
        "code payload",
      );
      const payload = await createCodePayload(context.store, { siteId, body: parsed });
      return { status: 201, body: payload };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "code-payloads"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: { payloads: await context.store.listCodePayloads(siteId) },
      };
    },
  },

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

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "collections"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateCollectionBody>(
        CreateCollectionBodySchema,
        body,
        "collection",
      );
      return {
        status: 201,
        body: await createCollection(context.store, { siteId, body: input }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "collections", "from-fields"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateCollectionBody>(
        FromFieldsBodySchema,
        body,
        "collection from fields",
      );
      return {
        status: 201,
        body: await createCollectionFromFields(context.store, {
          siteId,
          body: input,
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "collections"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: {
          collections: await context.store.listCollections(siteId, {
            includeDeprecated: url.searchParams.get("includeDeprecated") === "true",
          }),
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "entries"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateEntryBody>(
        CreateEntryBodySchema,
        body,
        "entry",
      );
      const { idempotencyKey, ...entryInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => ({
        status: 201,
        body: await createEntry(context.store, {
          siteId,
          body: { ...entryInput, author: resolveAuthor(auth) },
        }),
      }));
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "entries"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      // Entries page like every other list. A collection with a few hundred
      // rows is normal, and an agent that has to hold all of them to find the
      // last one has no room left for the answer.
      const all = await listEntries(context.store, {
        siteId,
        filters: parseEntryListFilters(url.searchParams),
      });
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: { entries: page.items, ...page, items: undefined },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "entries", "search"],
    scope: "read",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<SearchEntriesBody>(
        SearchEntriesBodySchema,
        body,
        "entry search",
      );
      return {
        status: 200,
        body: await searchEntries(context.store, {
          siteId,
          q: input.q,
          ...(input.collectionId === undefined
            ? {}
            : { collectionId: input.collectionId }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "entries", "resolve"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const path = url.searchParams.get("path");
      if (path === null || path.trim() === "") {
        throw new SenifyError("validation", "Query parameter \"path\" is missing", {
          field: "path",
          suggestion: "Resolve a path, e.g. ?path=/blog/mein-beitrag.",
        });
      }
      return {
        status: 200,
        body: await resolveEntryPath(context.store, { siteId, path }),
      };
    },
  },

  {
    // The program's form overview: latest snapshot per form, for the
    // submissions view (fields, target collection, source page).
    method: "GET",
    segments: ["api", "sites", ":siteId", "forms"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: { forms: await listSiteForms(context.store, requireParam(params, "siteId")) },
    }),
  },

  {
    // Entry-based view for the program; the same rows the entry tools expose.
    method: "GET",
    segments: ["api", "sites", ":siteId", "submissions"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const collectionId = url.searchParams.get("collectionId") ?? undefined;
      const view = await listSubmissions(context.store, {
        siteId,
        ...(collectionId === undefined ? {} : { collectionId }),
        limit: limitParam(url, 200),
      });
      return {
        status: 200,
        body: { source: view.source, columns: view.columns, rows: view.rows },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "forms", "collection-plan"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<FormCollectionPlanBody>(
        FormCollectionPlanBodySchema,
        body,
        "form collection plan",
      );
      return {
        status: 200,
        body: await planCollectionFromForm(context.store, {
          siteId,
          formId: input.formId,
        }),
      };
    },
  },

  {
    // One click: creates the target collection with fields + status template.
    method: "POST",
    segments: ["api", "sites", ":siteId", "forms", "collection"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<FormCollectionCreateBody>(
        FormCollectionCreateBodySchema,
        body,
        "form collection",
      );
      return {
        status: 201,
        body: await createCollectionFromForm(context.store, {
          siteId,
          formId: input.formId,
          ...(input.name === undefined ? {} : { name: input.name }),
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "notifications"],
    scope: "read",
    handler: async (context, params, _req, url) => ({
      status: 200,
      body: {
        notifications: await context.store.listNotifications(
          requireParam(params, "siteId"),
          limitParam(url, 50),
        ),
      },
    }),
  },

  {
    // Project assignment of references + the derived theme draft (T14 reuse).
    method: "GET",
    segments: ["api", "sites", ":siteId", "references"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const references = referenceContext(context);
      const { draft, verification } = await referenceThemeDraft(references, siteId);
      // The assignments are a list like any other, so they page. The draft and
      // the verification are NOT paged: they are the derived state of the whole
      // set, and a page of them would describe nothing.
      const assignments = await context.store.listReferenceAssignments(siteId);
      const page = paginate(assignments, parsePaging(url.searchParams), assignments.length);
      return {
        status: 200,
        body: {
          assignments: page.items,
          ...page,
          items: undefined,
          draft,
          verification,
          unchanged: await verifyReferenceApply(references, siteId),
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "references"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ApplyReferenceBody>(
        ApplyReferenceBodySchema,
        body,
        "reference assignment",
      );
      const result = await applyReference(referenceContext(context), {
        siteId: requireParam(params, "siteId"),
        referenceId: input.referenceId,
        author: resolveAuthor(auth),
        ...(input.scales === undefined ? {} : { scales: input.scales }),
      });
      return { status: 201, body: result };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "references", ":referenceId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => ({
      status: 200,
      body: await removeReferenceAssignment(referenceContext(context), {
        siteId: requireParam(params, "siteId"),
        referenceId: requireParam(params, "referenceId"),
      }),
    }),
  },

  {
    // apply_redesign (E25 slice 2): the mechanical steps of the redesign
    // journey — duplicate (or rebuild one page), theme patch, section
    // skeleton — through the canonical write paths. Never the active release:
    // the duplicate is a new site, the rebuild runs against the draft.
    method: "POST",
    segments: ["api", "sites", ":siteId", "redesign"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ApplyRedesignBody>(
        ApplyRedesignBodySchema,
        body,
        "apply redesign",
      );
      const siteId = requireParam(params, "siteId");
      if (input.siteId !== undefined && input.siteId !== siteId) {
        throw new SenifyError("validation", "The body siteId does not match the route", {
          field: "siteId",
          suggestion: "Use the siteId from the route path.",
        });
      }
      return withIdempotency(context, auth, req, url, input.idempotencyKey, { ...input }, async () => {
        const result = await applyRedesign({
          store: context.store,
          registry: context.registry,
          siteId,
          ...(input.referenceIds === undefined ? {} : { referenceIds: input.referenceIds }),
          ...(input.collectionId === undefined ? {} : { collectionId: input.collectionId }),
          ...(input.pageId === undefined ? {} : { pageId: input.pageId }),
          ...(input.withContent === undefined ? {} : { withContent: input.withContent }),
          author: resolveAuthor(auth),
        });
        return { status: 201, body: result };
      });
    },
  },

  {
    // Starts a durable image job (S2): the worker walks the provider chain and
    // commits the result through the media pipeline.
    method: "POST",
    segments: ["api", "sites", ":siteId", "images", "jobs"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      await context.store.getSite(siteId);
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateImageJobBody>(
        CreateImageJobBodySchema,
        body,
        "image job",
      );
      const settings = await context.store.getImageSettings();
      const provider = input.provider ?? settings.provider;
      if (provider === "off") {
        throw new SenifyError(
          "validation",
          "Bildgenerierung ist in den Einstellungen deaktiviert (provider: off)",
          {
            field: "image.provider",
            suggestion: "Den Provider in den Einstellungen aktivieren.",
          },
        );
      }
      let prompt = input.prompt?.trim() ?? "";
      if (prompt === "" && input.referenceId !== undefined) {
        const reference = await context.store.getReference(input.referenceId);
        const built = buildImagePrompt(reference);
        if (built === null) {
          throw new SenifyError(
            "validation",
            `Referenz "${input.referenceId}" hat kein Bildrezept`,
            {
              field: "referenceId",
              suggestion:
                "get_reference_brief liefert imagePrompt, sobald ein Rezept hinterlegt ist.",
            },
          );
        }
        prompt = built;
      }
      if (prompt === "") {
        throw new SenifyError("validation", "prompt oder referenceId ist nötig", {
          field: "prompt",
          suggestion: "Einen Prompt senden oder eine Referenz mit Bildrezept angeben.",
        });
      }
      const request: ImageJobRequest = {
        prompt,
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        steps: input.steps ?? settings.defaultSteps,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
        filename:
          input.filename?.trim() ?? `senify-bild-${newEntityId().slice(0, 8)}.png`,
        altText: input.altText?.trim() ?? null,
        decorative: input.decorative ?? false,
        folderId: input.folderId ?? null,
        tags: input.tags ?? [],
        provider,
        ...(input.referenceId === undefined
          ? {}
          : { referenceId: input.referenceId }),
      };
      validateImageRequest(provider, request, settings.maxPixels);
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        input,
        async () => {
          const job = await context.store.enqueueImageJob({ siteId, request });
          return {
            status: 202,
            body: { jobId: job.id, status: job.status, provider },
          };
        },
      );
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "images", "jobs"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const status = url.searchParams.get("status");
      if (
        status !== null &&
        !IMAGE_JOB_STATUSES.includes(status as ImageJobStatus)
      ) {
        throw new SenifyError("validation", `Unknown image job status "${status}"`, {
          field: "status",
          suggestion: `Use one of: ${IMAGE_JOB_STATUSES.join(", ")}.`,
        });
      }
      // Paging happens HERE, after the status filter, not in the store query.
      // A job list grows without bound - every generation is a row - and it is
      // the list an agent polls most often, so it is the one that most needs a
      // page size. The store keeps its own ordering; this only cuts a window.
      const all = await context.store.listImageJobs(siteId, {
        ...(status === null ? {} : { status: status as ImageJobStatus }),
      });
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: { jobs: page.items, ...page, items: undefined },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "imports", "framer"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<CreateImportBody>(CreateImportBodySchema, body, "import");
      const { idempotencyKey, ...importInput } = parsed;
      if (importInput.source.rootDir !== undefined && importInput.source.rootDir !== "") {
        assertImportRootAllowed(importInput.source.rootDir);
      }
      return withIdempotency(context, auth, req, url, idempotencyKey, parsed, async () => {
        const author = resolveAuthor(auth);
        const dryRun = importInput.write !== true;
        const pagePath = importInput.pagePath ?? "/";
        const job = await context.store.createImportJob({
          siteId,
          source: {
            kind: importInput.source.url !== undefined
              ? "url"
              : importInput.source.rootDir !== undefined
                ? "mirror"
                : "html",
            url: importInput.source.url ?? null,
            rootDir: importInput.source.rootDir ?? null,
            html: importInput.source.html ?? null,
            baseUrl: importInput.source.baseUrl ?? null,
          },
          pagePath,
          dryRun,
          maxAttempts: IMPORT_MAX_ATTEMPTS,
          payload: importInput as Record<string, unknown>,
        });
        try {
          await context.store.updateImportJob({
            id: job.id,
            status: "running",
            stage: "capture",
            progress: 10,
            attempts: job.attempts + 1,
            nextAttemptAt: job.nextAttemptAt,
            lastError: null,
            finishedAt: null,
          });
          const result = await runFramerImportJob(context.store, {
            siteId,
            jobId: job.id,
            body: importInput,
            author,
            media: mediaContext(context),
          });
          if (importInput.write !== true) {
            await context.store.updateImportJob({
              id: job.id,
              status: "succeeded",
              stage: "done",
              progress: 100,
              attempts: job.attempts + 1,
              nextAttemptAt: job.nextAttemptAt,
              lastError: null,
              finishedAt: new Date().toISOString(),
            });
            await context.store.setImportJobResult(
              job.id,
              result.report as unknown as Record<string, unknown>,
            );
          }
          // Re-read: the answer carries the final job state, not the
          // queued snapshot from the insert.
          const finished = await context.store.getImportJob(job.id);
          if (importInput.write === true && !result.report.replayed) {
            context.events.publish({
              kind: "page.created",
              siteId,
              pageId: result.report.pageId ?? undefined,
              action: "importFramer",
              actor: author,
            });
          }
          return { status: 201, body: { job: finished, report: result.report } };
        } catch (error) {
          const message =
            error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
          await context.store
            .updateImportJob({
              id: job.id,
              status: "failed",
              stage: "failed",
              progress: job.progress,
              attempts: job.attempts + 1,
              nextAttemptAt: job.nextAttemptAt,
              lastError: message,
              finishedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
          throw error;
        }
      });
    },
  },

  {
    // The preview of an import (nothing is written): the page next to the page
    // the import makes of it, at the platform's three widths. It opens a
    // browser and loads the source, so it is a write-scope call.
    method: "POST",
    segments: ["api", "sites", ":siteId", "imports", "framer", "preview"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const parsed = parseBody<CreateImportBody>(CreateImportBodySchema, (await readJsonBody(req)) ?? {}, "import");
      const site = await context.store.getSite(siteId);
      const siteTheme = await context.store.getTheme(siteId);
      const resolved = resolveTheme(siteTheme.theme);
      const baseDuration = resolved.motion.duration.base;
      // The write would set the source's breakpoints only on a site without a
      // pair and without other pages; the preview bakes with what it would leave.
      const targetPath = parsed.pagePath ?? "/";
      const otherPages = (await context.store.listPageDrafts(siteId)).some((page) =>
        parsed.pageId === undefined ? page.path !== targetPath : page.id !== parsed.pageId,
      );
      const preview = await previewFramerImport({
        source: sourceOf(parsed),
        pagePath: parsed.pagePath ?? "/",
        mode: parsed.mode ?? "dna",
        themeCss: siteTheme.css,
        motionTokens: {
          ease: resolved.motion.ease,
          baseDurationMs: baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
          baseStaggerMs: 80,
        },
        siteName: site.name,
        site: { ...(site.breakpoints === undefined ? {} : { breakpoints: site.breakpoints }), otherPages },
        driver: context.importPreview ?? createImportPreviewDriver(),
      });
      return { status: 200, body: preview };
    },
  },

  {
    // The site-scoped import history shown by the editor.
    method: "GET",
    segments: ["api", "sites", ":siteId", "imports"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: { jobs: await context.store.listImportJobsForSite(siteId, 100) },
      };
    },
  },

];
