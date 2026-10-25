// Die Bibliotheks-Installationen einer Site (P3-2, Schritt 63): was aus der
// geteilten Bibliothek uebernommen wurde, ein neues Installieren, das
// Nachziehen einer Installation, das Wieder-Anhaengen nach einem Detach und
// das Loesen.
//
// Die fuenf Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - der Lebenslauf einer Installation von "uebernommen" bis
// "geloest und wieder angehaengt" - und brauchen deshalb nur vier
// Import-Quellen: den Routen-Helfer, den Koerper-Parser, den
// Bibliotheks-Vertrag und die ID-Vergabe.
//
// **Die Reihenfolge ist Teil des Vertrags:** die Engine matcht Routen in
// Tabellen-Reihenfolge und die erste passende gewinnt. `reattach` steht
// deshalb VOR `:installId` - sonst wuerde "reattach" als
// Installations-ID gelesen. Das ist kein Zufall der Sortierung, sondern
// eine Bedingung, die beim Verschieben mitwandern muss.

import type { Route } from "./http-contract.ts";
import { readJsonBody, requireParam } from "./http-route-support.ts";
import { AuthorSchema, parseBody } from "./mutations/contract.ts";
import { newEntityId } from "./ids.ts";
import {
  InstallLibraryComponentBodySchema,
  LibraryReattachComponentSchema,
  type InstallLibraryComponentBody,
  type LibraryReattachComponentBody,
} from "./library-contract.ts";

export const libraryRoutes: Route[] = [
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
    // Re-Attach: eine geloeste Installation wieder an die Bibliothek haengen.
    // Das Gegenstueck zum Detach - der Plan nennt es ausdruecklich ("ein
    // Detach merkt sich seine Herkunft, Re-Attach ist moeglich").
    //
    // Die Route steht VOR der Route mit `:installId`, weil die Engine die
    // Routen in Reihenfolge matcht und die erste passende gewinnt: sonst
    // wuerde "reattach" als Installations-ID gelesen.
    method: "POST",
    segments: ["api", "sites", ":siteId", "library-installs", "reattach"],
    scope: "write",
    handler: async (context, params, req) => {
      const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
      const author = parseBody<{ kind: "human" | "agent"; id: string; label: string }>(AuthorSchema, body.author, "library reattach");
      // Das Schema ist geschlossen: der Autor steht deshalb ausserhalb, sonst
      // wuerde die Pruefung das Feld `author` als unbekannt ablehnen.
      const { author: _author, ...rest } = body;
      const componentId = parseBody<LibraryReattachComponentBody>(LibraryReattachComponentSchema, rest, "library reattach").componentId;
      return { status: 200, body: await context.store.reattachLibraryComponent({ id: newEntityId(), siteId: requireParam(params, "siteId"), componentId, author }) };
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

];
