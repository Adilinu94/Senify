// Die Routen des Bereichs api/pages, api/entries, api/page-starters, api/releases, api/revisions. Die Tabelle des
// Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019).

import type { Route } from "./http-contract.ts";
import { SenifyError } from "@senify/core";
import { renderEntryPreview } from "./bake.ts";
import {
  parseApplyMutationsBody,
  parseBody,
  type ApplyMutationsBody,
} from "./mutations/contract.ts";
import { parseApplyEditorMutationsBody } from "./mutations/editor-contract.ts";
import { parseUndoBatchBody, undoBatches } from "./undo-batch.ts";
import {
  restoreRevisionAsDraft,
} from "./lifecycle.ts";
import {
  RestoreRevisionBodySchema,
  type RestoreRevisionBody,
} from "./lifecycle-contract.ts";
import {
  publishEntry,
  purgeEntry,
  restoreEntryFromTrash,
  restoreEntryVersionAsDraft,
  tickScheduledEntries,
  trashEntry,
  unpublishEntry,
  updateEntry,
} from "./content.ts";
import {
  EntryActionBodySchema,
  EntryPreviewBodySchema,
  EntryTickBodySchema,
  PublishEntryBodySchema,
  UpdateEntryBodySchema,
  type EntryActionBody,
  type EntryPreviewBody,
  type EntryTickBody,
  type PublishEntryBody,
  type UpdateEntryBody,
} from "./content-contract.ts";
import {
  PutPageTemplateBodySchema,
  type PutPageTemplateBody,
} from "./templates-contract.ts";
import { putPageTemplate } from "./templates.ts";
import {
  CreateRedesignProposalBodySchema,
  type CreateRedesignProposalBody,
} from "./redesign-proposal-contract.ts";
import {
  createRedesignProposal,
  listRedesignProposals,
} from "./redesign-proposals.ts";
import { buildRedesignPackage } from "./redesign-package.ts";
import type {
  RedesignProposalStatus,
} from "./types.ts";
import { REDESIGN_PROPOSAL_STATUSES } from "./types.ts";
import { isRedesignProposalStatus } from "./redesign-proposal-contract.ts";
import { PAGE_STARTERS } from "./page-starters.ts";
import {
  redesignProposalContext,
  lifecycleContext,
  resolveAuthor,
  withIdempotency,
  readJsonBody,
  applyMutationsToPage,
  applyEditorMutationsToPage,
  requireParam,
} from "./http-route-support.ts";

export const pageRoutes: Route[] = [
  {
    // The start templates the dashboard offers for a new page.
    method: "GET",
    segments: ["api", "page-starters"],
    scope: "read",
    handler: async () => ({
      status: 200,
      body: {
        starters: PAGE_STARTERS.map((starter) => ({
          id: starter.id,
          label: starter.label,
          description: starter.description,
          defaultTitle: starter.defaultTitle,
          sections: starter.sections.map((section) => section.type),
        })),
      },
    }),
  },

  {
    method: "GET",
    segments: ["api", "pages", ":pageId"],
    scope: "read",
    handler: async (context, params) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      return { status: 200, body: await context.store.getPage(pageId) };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "pages", ":pageId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      await context.store.deletePage(pageId);
      return { status: 204 };
    },
  },

  {
    // Marks a page as layout/collection template or picks its layout
    // (artifacts/23 §1); template pages never get an own route.
    method: "PUT",
    segments: ["api", "pages", ":pageId", "template"],
    scope: "write",
    handler: async (context, params, req) => {
      const pageId = requireParam(params, "pageId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PutPageTemplateBody>(
        PutPageTemplateBodySchema,
        body,
        "page template",
      );
      return {
        status: 200,
        body: await putPageTemplate(context.store, { pageId, body: input }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "mutations"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const input: ApplyMutationsBody = parseApplyMutationsBody(body);
      const result = await applyMutationsToPage(context, pageId, input, auth);
      return { status: 200, body: result };
    },
  },

  {
    // The canvas (rebuild Phase 0) persists its v2 editor ops here. Additive to
    // the section mutations route above: same envelope, same write path, only
    // the op vocabulary differs. The draft stays a section NodeTree.
    method: "POST",
    segments: ["api", "pages", ":pageId", "editor-mutations"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const input = parseApplyEditorMutationsBody(body);
      const result = await applyEditorMutationsToPage(context, pageId, input, auth);
      return { status: 200, body: result };
    },
  },

  {
    // Agent undo (E17): the server-side Cmd+Z. Walks the page's audit log
    // backwards (newest batches first), runs the inverse patches through the
    // same integrity check as a forward batch and writes the result as a
    // fresh, audited batch. A stale baseDraftVersion is a conflict.
    method: "POST",
    segments: ["api", "pages", ":pageId", "undo-batch"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const request = parseUndoBatchBody(body);
      const author = resolveAuthor(auth);
      return {
        status: 200,
        body: await undoBatches(context, pageId, request, author),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "pages", ":pageId", "audit"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      await context.store.getPage(pageId);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      // Out-of-range limits are clamped (1..500) rather than rejected:
      // pagination stays total, the store documents the bounds.
      return {
        status: 200,
        body: { entries: await context.store.listAudit(pageId, limit) },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "releases", ":releaseId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getRelease(requireParam(params, "releaseId")),
    }),
  },

  {
    method: "GET",
    segments: ["api", "pages", ":pageId", "revisions"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        revisions: await context.store.listRevisions(
          requireParam(params, "pageId"),
        ),
      },
    }),
  },

  {
    method: "GET",
    segments: ["api", "revisions", ":revisionId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getRevision(requireParam(params, "revisionId")),
    }),
  },

  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "restore"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const pageId = requireParam(params, "pageId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<RestoreRevisionBody>(
        RestoreRevisionBodySchema,
        body,
        "restore",
      );
      return {
        status: 200,
        body: await restoreRevisionAsDraft(lifecycleContext(context), {
          pageId,
          revisionId: input.revisionId,
          author: resolveAuthor(auth),
        }),
      };
    },
  },

  {
    // Job tick for scheduled entries; a scheduler may scope it to one site.
    method: "POST",
    segments: ["api", "entries", "tick"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryTickBody>(
        EntryTickBodySchema,
        body,
        "entry tick",
      );
      return {
        status: 200,
        body: await tickScheduledEntries(context.store, {
          ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "entries", ":entryId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getEntry(requireParam(params, "entryId")),
    }),
  },

  {
    // Live preview of the Entry-Editor (artifacts/23 §5): the same bake path as
    // the build, rendered into a throw-away directory and returned as HTML.
    method: "GET",
    segments: ["api", "entries", ":entryId", "preview"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await renderEntryPreview({
        store: context.store,
        dataDir: context.dataDir,
        entryId: requireParam(params, "entryId"),
        formSigner: context.formSigner,
      }),
    }),
  },

  {
    // Preview with unsaved form values (T10): the editor posts its cells, the
    // engine overlays them on the stored row without writing anything.
    method: "POST",
    segments: ["api", "entries", ":entryId", "preview"],
    scope: "read",
    handler: async (context, params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryPreviewBody>(
        EntryPreviewBodySchema,
        body,
        "entry preview",
      );
      return {
        status: 200,
        body: await renderEntryPreview({
          store: context.store,
          dataDir: context.dataDir,
          entryId: requireParam(params, "entryId"),
          formSigner: context.formSigner,
          ...(input.cells === undefined ? {} : { cells: input.cells }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
        }),
      };
    },
  },

  {
    method: "PUT",
    segments: ["api", "entries", ":entryId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateEntryBody>(
        UpdateEntryBodySchema,
        body,
        "entry update",
      );
      return {
        status: 200,
        body: await updateEntry(context.store, {
          entryId,
          body: { ...input, author: resolveAuthor(auth) },
        }),
      };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "entries", ":entryId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(EntryActionBodySchema, body, "entry action");
      return {
        status: 200,
        body: await trashEntry(context.store, {
          entryId,
          author: resolveAuthor(auth),
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "restore"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(EntryActionBodySchema, body, "entry restore");
      return {
        status: 200,
        body: await restoreEntryFromTrash(context.store, {
          entryId,
          author: resolveAuthor(auth),
        }),
      };
    },
  },

  {
    // Permanent: only into the trash first, and only with the publish scope.
    method: "POST",
    segments: ["api", "entries", ":entryId", "purge"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(EntryActionBodySchema, body, "entry purge");
      return {
        status: 200,
        body: await purgeEntry(context.store, { entryId, author: resolveAuthor(auth) }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "publish"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishEntryBody>(
        PublishEntryBodySchema,
        body,
        "entry publish",
      );
      return {
        status: 200,
        body: await publishEntry(context.store, {
          entryId,
          author: resolveAuthor(auth),
          ...(input.baseVersion === undefined
            ? {}
            : { baseVersion: input.baseVersion }),
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "unpublish"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishEntryBody>(
        PublishEntryBodySchema,
        body,
        "entry unpublish",
      );
      return {
        status: 200,
        body: await unpublishEntry(context.store, {
          entryId,
          author: resolveAuthor(auth),
          ...(input.baseVersion === undefined
            ? {}
            : { baseVersion: input.baseVersion }),
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "entries", ":entryId", "versions"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        versions: await context.store.listEntryVersions(
          requireParam(params, "entryId"),
        ),
      },
    }),
  },

  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "restore-version", ":versionId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(
        EntryActionBodySchema,
        body,
        "entry version restore",
      );
      return {
        status: 200,
        body: await restoreEntryVersionAsDraft(context.store, {
          entryId,
          versionId: requireParam(params, "versionId"),
          author: resolveAuthor(auth),
        }),
      };
    },
  },

  {
    // The redesign package for one page: the content plus one theme patch per
    // reference. A read; nothing is written.
    method: "GET",
    segments: ["api", "pages", ":pageId", "redesign-package"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const referenceIds = (url.searchParams.get("referenceIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "");
      return {
        status: 200,
        body: await buildRedesignPackage(context.store, {
          pageId: requireParam(params, "pageId"),
          referenceIds,
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "redesign-proposals"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateRedesignProposalBody>(
        CreateRedesignProposalBodySchema,
        body,
        "redesign proposal",
      );
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        { ...input },
        async () => ({
          status: 201,
          body: {
            proposal: await createRedesignProposal(redesignProposalContext(context), {
              pageId: requireParam(params, "pageId"),
              referenceIds: input.referenceIds,
              author: resolveAuthor(auth),
            }),
          },
        }),
      );
    },
  },

  {
    method: "GET",
    segments: ["api", "pages", ":pageId", "redesign-proposals"],
    scope: "read",
    handler: async (context, params, req) => {
      // `?status=` narrows the inbox. Without it the list is everything for
      // the page, open and finished alike. The value is checked against the
      // known statuses rather than passed through, so a typo answers 400
      // instead of an empty list that reads like "nothing is open".
      const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("status");
      let status: RedesignProposalStatus | undefined;
      if (requested !== null && requested !== "") {
        if (!isRedesignProposalStatus(requested)) {
          throw new SenifyError("validation", `Unknown proposal status "${requested}"`, {
            field: "status",
            suggestion: `One of: ${REDESIGN_PROPOSAL_STATUSES.join(", ")}.`,
          });
        }
        // The guard above narrows `requested`; the explicit read keeps that
        // narrowing visible to the type checker across the `let`.
        status = requested as RedesignProposalStatus;
      }
      return {
        status: 200,
        body: {
          proposals: await listRedesignProposals(redesignProposalContext(context), {
            pageId: requireParam(params, "pageId"),
            ...(status === undefined ? {} : { status }),
          }),
        },
      };
    },
  },
];
