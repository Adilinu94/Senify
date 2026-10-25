// Der Design-Vertrag einer Site (P3-2, Schritt 64): die Konstanten, die
// Verbote und das Vokabular, an denen sich jeder Entwurf messen lassen muss.
//
// Die zwei Routen standen in `http-routes-sites.ts`. Sie sind ein eigener
// Fachbereich mit eigener Schemadatei (`design-contract-schema.ts`) und nur
// zwei mitwandernden Importen - der Rest der Datei braucht sie nicht.
//
// **Ein leerer PUT loescht den Vertrag, er schreibt keinen leeren.** Das ist
// die einzige Stelle, an der `null` als Inhalt erlaubt ist: alle drei Felder
// fehlen heisst "kein Vertrag", nicht "Vertrag ohne Regeln". Wer das beim
// Verschieben zu `?? []` vereinfacht, macht aus einem Loeschen ein
// Ueberschreiben mit leeren Listen - und die Pruefung gegen den Vertrag
// haette dann nichts mehr zu pruefen.

import type { Route } from "./http-contract.ts";
import { readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  UpdateDesignContractBodySchema,
  type UpdateDesignContractBody,
} from "./design-contract-schema.ts";

export const designRoutes: Route[] = [
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

];
