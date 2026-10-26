// Die zwei Code-Payload-Routen einer Site: einen Payload anlegen und die
// vorhandenen lesen. Der Zuschnitt aus `http-routes-sites.ts` (Schritt 70).
//
// **Warum getrennt.** Beide Routen haengen an `code-payloads.ts` und an nichts
// sonst aus der Site-Tabelle. Gemessen mit
// `.scratch/p3-2-schnitte/messung-block.mjs 7-8`: drei Import-Quellen wandern
// mit (`CreateCodePayloadBody`, `CreateCodePayloadBodySchema`,
// `createCodePayload`), nur drei bleiben mit dem Rest gemeinsam. Das ist
// dieselbe Groessenordnung wie bei den Assets (Schritt 68) und den Reviews
// (Schritt 69) - ein Fachbereich, kein Anhaengsel.
//
// **Die zwei Routen sind ein Paar.** Schreiben und Lesen derselben Ressource
// gehoeren zusammen; getrennt waere jede einzelne Route kleiner als ihre
// eigenen Importe. Ein Payload ist der Fremd-Code einer importierten Seite
// (ADR-0010): der Baum bleibt Daten, der Code liegt daneben.

import type { Route } from "./http-contract.ts";
import { readJsonBody, requireParam } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  CreateCodePayloadBodySchema,
  type CreateCodePayloadBody,
} from "./code-payloads-contract.ts";
import { createCodePayload } from "./code-payloads.ts";

export const siteCodePayloadRoutes: Route[] = [
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
];
