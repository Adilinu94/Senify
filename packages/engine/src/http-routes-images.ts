// Bild-Jobs einer Site (P3-2, Schritt 66): einen Auftrag starten (der Worker
// geht die Anbieter-Kette durch und legt das Ergebnis ueber die
// Medien-Pipeline ab) und die Job-Liste lesen, die ein Agent am haeufigsten
// abfragt.
//
// Die zwei Routen standen in `http-routes-sites.ts`. Sie sind ein eigener
// Fachbereich mit eigener Schemadatei (`images-contract.ts`) und eigenen
// Typen (`types.ts`); acht Importe wandern mit, und der Rest der Quelldatei
// braucht keinen davon.
//
// **Die Liste pagt NACH dem Statusfilter, nicht im Store.** Eine Job-Liste
// waechst unbegrenzt - jede Generierung ist eine Zeile - und sie ist die
// Liste, die ein Agent am haeufigsten abfragt. Deshalb steht das Paging hier
// und nicht in der Abfrage: der Store behaelt seine eigene Ordnung, diese
// Route schneidet nur ein Fenster heraus. Wer das in den Store zieht, aendert
// die Bedeutung von `total`.

import type { Route } from "./http-contract.ts";
import {
  readJsonBody,
  requireParam,
  withIdempotency,
} from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import { newEntityId } from "./ids.ts";
import { paginate, parsePaging } from "./paging.ts";
import { validateImageRequest } from "./image-provider.ts";
import { buildImagePrompt } from "./references-brief.ts";
import {
  CreateImageJobBodySchema,
  type CreateImageJobBody,
} from "./images-contract.ts";
import {
  IMAGE_JOB_STATUSES,
  type ImageJobRequest,
  type ImageJobStatus,
} from "./types.ts";
import { SenifyError } from "@senify/core";

export const imageRoutes: Route[] = [
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
