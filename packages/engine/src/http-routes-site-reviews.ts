// Die zwei Vorschau- und zwei Review-Routen einer Site: eine Vorschau
// ausstellen, die Vorschauen lesen (und dabei abgelaufene aufraeumen), einen
// Review einreichen und Reviews lesen. Der Zuschnitt aus
// `http-routes-sites.ts` (Schritt 69).
//
// **Warum zusammen und nicht getrennt.** Die vier Routen bilden einen
// Vorgang: eine Vorschau ist die Vorstufe eines Reviews, und `submitReview`
// gibt beides zurueck (`review`, `preview`, `checks`). Gemessen mit
// `.scratch/p3-2-schnitte/messung-block.mjs 7-10`: neun Import-Quellen
// wandern mit (`CreatePreviewBody`, `SubmitReviewBody`, ihre Schemata,
// `createPreview`, `expirePreviews`, `submitReview`, `REVIEW_STATUSES`,
// `ReviewStatus`), nur sechs bleiben mit dem Rest gemeinsam. Getrennt waeren
// es fuenf bzw. vier - jeweils weniger als die Haelfte. Das Paar ist der
// Fachbereich, nicht die einzelne Route.
//
// **Die Statuspruefung bleibt woertlich hier.** `REVIEW_STATUSES` ist die
// geschlossene Liste; ein unbekannter Wert ist ein 400 mit Feld `status` und
// einem Vorschlag, keine stille leere Antwort. Der Test
// "weist einen unbekannten Review-Status ab und laesst einen gueltigen durch"
// haelt das fest. Ein Schnitt darf eine solche Regel nicht zuruecklassen.

import type { Route } from "./http-contract.ts";
import { lifecycleContext, readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";
import { SenifyError } from "@senify/core";
import { parseBody } from "./mutations/contract.ts";
import {
  CreatePreviewBodySchema,
  SubmitReviewBodySchema,
  type CreatePreviewBody,
  type SubmitReviewBody,
} from "./lifecycle-contract.ts";
import { createPreview, expirePreviews, submitReview } from "./lifecycle.ts";
import { REVIEW_STATUSES, type ReviewStatus } from "./types.ts";

export const siteReviewRoutes: Route[] = [
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
];
