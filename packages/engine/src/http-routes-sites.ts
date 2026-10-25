// Die Routen einer Site jenseits des Lebenszyklus: Seiten, Bibliothek,
// Inhalte (Sammlungen, Eintraege), Referenzen, Bilder, Code-Payloads,
// Vorschauen, Reviews, Redesign und Betrieb (Audit, Formulare,
// Benachrichtigungen, Deployments). Die Tabelle des Dispatchers in `http.ts`
// nimmt sie unveraendert auf (ADR-0019).
//
// Nicht mehr hier: der Lebenszyklus (`http-routes-site-lifecycle.ts`, Schritt
// 60), der Framer-Import (`http-routes-imports.ts`, Schritt 61), Theme und
// Style-Regeln (`http-routes-theme.ts`, Schritt 57), Assets
// (`http-routes-assets.ts`, Schritt 53), Formulare
// (`http-routes-formular.ts`, Schritt 54).
//
// Die Datei ist der groesste verbleibende Schnitt-Kandidat: die naechsten
// Gruppen mit sauberer Fachgrenze sind Bilder + Import-Vorschau (kein
// gemeinsamer Zustand) und Betrieb (Audit, Formulare, Benachrichtigungen -
// vier lesende Routen ohne Schreibpfad).

import type { Route } from "./http-contract.ts";
import { lifecycleContext, mediaContext, resolveAuthor, withIdempotency, readJsonBody, applyMutationsToPage, requireParam, limitParam } from "./http-route-support.ts";
import { SenifyError } from "@senify/core";
import { paginate, parsePaging } from "./paging.ts";
import { CreatePageBodySchema, parseBody, type CreatePageBody } from "./mutations/contract.ts";
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
import { listSiteForms } from "./forms.ts";
import { ApplyRedesignBodySchema, type ApplyRedesignBody } from "./references-contract.ts";
import { applyRedesign } from "./apply-redesign.ts";
import {
  CreateCodePayloadBodySchema,
  type CreateCodePayloadBody,
} from "./code-payloads-contract.ts";
import { createCodePayload } from "./code-payloads.ts";
import { createUploadTicket, parseAssetListFilters, queryAssets, UploadUrlBodySchema, type UploadUrlBody } from "./media.ts";
import { REVIEW_STATUSES, type ReviewStatus } from "./types.ts";
import { pageStarterById } from "./page-starters.ts";

export const siteRoutes: Route[] = [
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

];
