// Die Formular-Routen einer Site (P3-2, Schritt 54): die Einsendungen eines
// Formulars, der Plan fuer eine Sammlung aus einem Formular und ihre
// Anlage.
//
// Die drei Routen standen in `http-routes-sites.ts`. Sie teilen den
// Fachbereich `forms.ts` und brauchen nichts aus der Site-Tabelle; die
// vier Import-Quellen sind der Grund, warum sie zusammenbleiben.

import { readJsonBody, requireParam, limitParam } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import { createCollectionFromForm, listSubmissions, planCollectionFromForm } from "./forms.ts";
import {
  FormCollectionCreateBodySchema,
  FormCollectionPlanBodySchema,
  type FormCollectionCreateBody,
  type FormCollectionPlanBody,
} from "./forms-contract.ts";
import type { Route } from "./http-contract.ts";

/** Die Routen der Einsendungen und der Formular-Sammlungen. */
export const formularRoutes: Route[] = [

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
];
