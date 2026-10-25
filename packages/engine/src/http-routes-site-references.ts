// Referenzen einer Site (P3-2, Schritt 67): die Zuordnung der Referenzprojekte
// samt abgeleitetem Theme-Entwurf, das Anwenden einer Referenz und das Loesen
// einer Zuordnung.
//
// Die drei Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - was die Site von welcher Referenz uebernimmt und was davon
// schon angewendet ist - und brauchen deshalb sieben mitwandernde Importe:
// `referenceContext`, den Referenz-Vertrag und vier Funktionen aus
// `references-lifecycle.ts`.
//
// **Eine Regel, die beim Verschieben leicht kippt:** die Zuordnungen werden
// paginiert, Entwurf und Pruefung NICHT. Sie sind der abgeleitete Zustand der
// ganzen Menge - eine Seite davon wuerde nichts beschreiben. Wer das Paging
// auf die ganze Antwort zieht, liefert einen Entwurf, der zu den sichtbaren
// Zuordnungen nicht mehr passt.

import type { Route } from "./http-contract.ts";
import {
  readJsonBody,
  referenceContext,
  requireParam,
  resolveAuthor,
} from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import { paginate, parsePaging } from "./paging.ts";
import {
  ApplyReferenceBodySchema,
  type ApplyReferenceBody,
} from "./references-contract.ts";
import {
  applyReference,
  referenceThemeDraft,
  removeReferenceAssignment,
  verifyReferenceApply,
} from "./references-lifecycle.ts";

export const siteReferenceRoutes: Route[] = [
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

];
