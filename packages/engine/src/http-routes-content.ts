// Die Routen des Bereichs api/reviews, api/forms, api/redesign-proposals, api/collections, api/code-payloads, api/imports. Die Tabelle des
// Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019).

import type { Route } from "./http-contract.ts";
import { SenifyError } from "@senify/core";
import {
  CONTENT_TYPES,
} from "./http-response.ts";
import {
  parseBody,
} from "./mutations/contract.ts";
import {
  approveReview,
  discardReview,
  requestChanges,
} from "./lifecycle.ts";
import {
  ReviewActionBodySchema,
  type ReviewActionBody,
} from "./lifecycle-contract.ts";
import { reviewVisualFileNames } from "./review-visuals.ts";
import {
  buildSubmissionsCsv,
  FormRejection,
  listSubmissions,
  submitForm,
} from "./forms.ts";
import {
  updateCollection,
} from "./content.ts";
import {
  UpdateCollectionBodySchema,
  type UpdateCollectionBody,
} from "./content-contract.ts";
import {
  ConfirmRedesignProposalBodySchema,
  ResolveMediaNeedsBodySchema,
  type ConfirmRedesignProposalBody,
  type ResolveMediaNeedsBody,
} from "./redesign-proposal-contract.ts";
import {
  confirmRedesignProposal,
  getRedesignProposalView,
  proposalCardScreenshot,
  resolveRedesignMediaNeeds,
} from "./redesign-proposals.ts";
import { resolveStoredFile } from "./storage.ts";
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import {
  redesignProposalContext,
  lifecycleContext,
  resolveAuthor,
  withIdempotency,
  readJsonBody,
  clientIpOf,
  originOf,
  refererPath,
  requestHostOf,
  wantsJson,
  readSubmitBody,
  requireParam,
  limitParam,
} from "./http-route-support.ts";

export const contentRoutes: Route[] = [
  {
    method: "GET",
    segments: ["api", "reviews", ":reviewId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getReviewItem(requireParam(params, "reviewId")),
    }),
  },

  {
    // Screenshot, diff or motion file of a review (T07). The filename is
    // whitelisted against the item's own visuals, so traversal never resolves.
    method: "GET",
    segments: ["api", "reviews", ":reviewId", "visuals", ":filename"],
    scope: "read",
    handler: async (context, params) => {
      const review = await context.store.getReviewItem(
        requireParam(params, "reviewId"),
      );
      const filename = requireParam(params, "filename");
      if (!reviewVisualFileNames(review.visuals).includes(filename)) {
        throw new SenifyError("not_found", `Visual "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(
        context.dataDir,
        ["reviews", review.id, "visuals", filename].join("/"),
      );
      if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
        throw new SenifyError("not_found", `Visual file "${filename}" is missing`, {
          field: "filename",
        });
      }
      return {
        status: 200,
        file: {
          path: file,
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "approve"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
      const reviewId = requireParam(params, "reviewId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReviewActionBody>(
        ReviewActionBodySchema,
        body,
        "review action",
      );
      return {
        status: 200,
        body: await approveReview(lifecycleContext(context), {
          reviewId,
          author: resolveAuthor(auth),
          note: input.note,
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "request-changes"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const reviewId = requireParam(params, "reviewId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReviewActionBody>(
        ReviewActionBodySchema,
        body,
        "review action",
      );
      return {
        status: 200,
        body: await requestChanges(lifecycleContext(context), {
          reviewId,
          author: resolveAuthor(auth),
          note: input.note ?? "",
        }),
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "discard"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const reviewId = requireParam(params, "reviewId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReviewActionBody>(
        ReviewActionBodySchema,
        body,
        "review action",
      );
      return {
        status: 200,
        body: await discardReview(lifecycleContext(context), {
          reviewId,
          author: resolveAuthor(auth),
          note: input.note,
        }),
      };
    },
  },

  // Imported foreign code (ADR-0010): a payload is a site's code package with
  // its provenance. Writing one is an audited write (MCP needs the write
  // scope); reading the metadata is enough for the report and the editor.
  {
    method: "GET",
    segments: ["api", "code-payloads", ":payloadId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getCodePayload(requireParam(params, "payloadId")),
    }),
  },

  {
    method: "DELETE",
    segments: ["api", "code-payloads", ":payloadId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.deleteCodePayload(requireParam(params, "payloadId")),
    }),
  },

  {
    method: "GET",
    segments: ["api", "collections", ":collectionId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getCollection(
        requireParam(params, "collectionId"),
      ),
    }),
  },

  {
    method: "PUT",
    segments: ["api", "collections", ":collectionId"],
    scope: "write",
    handler: async (context, params, req) => {
      const collectionId = requireParam(params, "collectionId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateCollectionBody>(
        UpdateCollectionBodySchema,
        body,
        "collection update",
      );
      return {
        status: 200,
        body: await updateCollection(context.store, {
          collectionId,
          body: input,
        }),
      };
    },
  },

  // ------------------------------------------------------- forms (T11)
  {
    // Public, no bearer: the signed token in the page is the authorization.
    method: "POST",
    segments: ["api", "forms", ":formId", "submit"],
    public: true,
    handler: async (context, params, req) => {
      const formId = requireParam(params, "formId");
      const parsed = await readSubmitBody(req);
      if (parsed.token === "") {
        throw new FormRejection("token", "Formular-Token fehlt", {
          field: "form_token",
        });
      }
      const json = wantsJson(req);
      try {
        const result = await submitForm({
          store: context.store,
          signer: context.formSigner,
          rateLimiter: context.formRateLimiter,
          formId,
          token: parsed.token,
          values: parsed.values,
          consent: parsed.consent,
          honeypot: parsed.honeypot,
          origin: originOf(req),
          requestHost: requestHostOf(req),
          clientIp: clientIpOf(req),
        });
        if (json) return { status: 200, body: { ...result } };
        return {
          status: 303,
          redirect: result.redirectUrl ?? `${result.pagePath}?gesendet=1`,
        };
      } catch (error) {
        // No-JS: back to the form with a visible error reason instead of JSON.
        if (!json && error instanceof FormRejection) {
          const back = refererPath(req);
          if (back !== undefined) {
            return {
              status: 303,
              redirect: `${back}?form_fehler=${encodeURIComponent(error.reason)}`,
            };
          }
        }
        throw error;
      }
    },
  },

  {
    method: "GET",
    segments: ["api", "forms", ":formId", "submissions"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const formId = requireParam(params, "formId");
      const view = await listSubmissions(context.store, {
        formId,
        limit: limitParam(url, 200),
      });
      return {
        status: 200,
        body: { source: view.source, columns: view.columns, rows: view.rows },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "forms", ":formId", "submissions.csv"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const formId = requireParam(params, "formId");
      const view = await listSubmissions(context.store, {
        formId,
        limit: limitParam(url, 500),
      });
      return {
        status: 200,
        text: {
          contentType: "text/csv; charset=utf-8",
          body: buildSubmissionsCsv({ columns: view.columns, rows: view.rows }),
        },
        headers: {
          "content-disposition": `attachment; filename="submissions-${formId}.csv"`,
        },
      };
    },
  },

  // ----------------------------------------------- redesign proposals (ADR-0012)
  // The human direction step. The agent proposes and reads; only a human
  // operator confirms, and the confirm is one command (decision + apply).
  {
    method: "GET",
    segments: ["api", "redesign-proposals", ":proposalId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        proposal: await getRedesignProposalView(
          redesignProposalContext(context),
          requireParam(params, "proposalId"),
        ),
      },
    }),
  },

  {
    // The card image. Resolved only through the proposal's own folder and the
    // file name the stored card carries, so a foreign id or a traversal never
    // resolves (same guard as the reference snapshot route).
    method: "GET",
    segments: ["api", "redesign-proposals", ":proposalId", "cards", ":directionId", "screenshot"],
    scope: "read",
    rateLimit: false,
    handler: async (context, params) => {
      const proposal = await context.store.getRedesignProposal(
        requireParam(params, "proposalId"),
      );
      const found = proposalCardScreenshot(
        context.dataDir,
        proposal,
        requireParam(params, "directionId"),
      );
      if (found === null) {
        throw new SenifyError(
          "not_found",
          `Direction "${params.directionId ?? ""}" has no stored image in this proposal`,
          { field: "directionId" },
        );
      }
      return {
        status: 200,
        file: {
          path: found.path,
          contentType:
            CONTENT_TYPES[extname(found.path).toLowerCase()] ?? "image/png",
          headers: { "cache-control": "no-store" },
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "redesign-proposals", ":proposalId", "confirm"],
    operatorOnly: true,
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ConfirmRedesignProposalBody>(
        ConfirmRedesignProposalBodySchema,
        body,
        "redesign confirmation",
      );
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        { ...input },
        async () => {
          const author = resolveAuthor(auth);
          const confirmed = await confirmRedesignProposal(
            redesignProposalContext(context),
            {
              proposalId: requireParam(params, "proposalId"),
              directionId: input.directionId,
              // operatorOnly already rejected every agent token above; the
              // narrowing keeps the decision's author honest in the record.
              author: { kind: "human" as const, id: author.id, label: author.label },
              idempotencyKey: input.idempotencyKey,
            },
          );
          return { status: 200, body: confirmed };
        },
      );
    },
  },

  // ------------------------------------------------ redesign media needs (P2-2)
  {
    // Closing the open media needs an apply left. A write, and a normal one: it
    // goes through the draft's optimistic lock and the audit ledger like any
    // other edit, so a need closed here is undoable like any other change.
    method: "POST",
    segments: ["api", "redesign-proposals", ":proposalId", "media-needs"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ResolveMediaNeedsBody>(
        ResolveMediaNeedsBodySchema,
        body,
        "media need resolution",
      );
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        { ...input },
        async () => {
          const author = resolveAuthor(auth);
          const resolved = await resolveRedesignMediaNeeds(
            redesignProposalContext(context),
            {
              proposalId: requireParam(params, "proposalId"),
              // The schema already discriminated the union: an entry that
              // validated as `manual` has no `assetId`, and the other three
              // have one. The engine re-checks the need id and the asset
              // ownership, because a shape check cannot know either.
              resolutions: input.resolutions.map((entry) =>
                entry.treatment === "manual"
                  ? { needId: entry.needId, resolution: { treatment: "manual" as const } }
                  : {
                      needId: entry.needId,
                      resolution: { treatment: entry.treatment, assetId: entry.assetId },
                    },
              ),
              author: { kind: "human" as const, id: author.id, label: author.label },
            },
          );
          return {
            status: 200,
            body: {
              proposal: resolved.proposal,
              closed: resolved.closed,
              stillOpen: resolved.stillOpen,
              draftVersion: resolved.draftVersion,
            },
          };
        },
      );
    },
  },

  // Framer import (plan S3.3): the job protocol plus the run. The job row is
  // created first (so a crashed run leaves its record), then the import runs
  // inline ΓÇö local sources are fast, the durable job keeps the report for
  // clients that poll instead of re-running.
  // The job list of a site (the editor's import history).
  {
    // The poll answer: the job record plus its report when the run finished.
    method: "GET",
    segments: ["api", "imports", ":jobId"],
    scope: "read",
    handler: async (context, params) => {
      const jobId = requireParam(params, "jobId");
      const job = await context.store.getImportJob(jobId);
      const report = await context.store.getImportJobResult(jobId);
      return {
        status: 200,
        body: { job, ...(report === null ? {} : { report }) },
      };
    },
  },
];
