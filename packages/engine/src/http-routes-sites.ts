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
import { AuthorSchema, CreatePageBodySchema, parseBody, type CreatePageBody } from "./mutations/contract.ts";
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
import { listSiteForms } from "./forms.ts";
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
import { buildImagePrompt } from "./references-brief.ts";
import { createUploadTicket, parseAssetListFilters, queryAssets, UploadUrlBodySchema, type UploadUrlBody } from "./media.ts";
import type {
  ImageJobRequest,
  ImageJobStatus,
  ReviewStatus,
} from "./types.ts";
import { IMAGE_JOB_STATUSES, REVIEW_STATUSES } from "./types.ts";
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

];
