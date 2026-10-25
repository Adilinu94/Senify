// Sammlungen und Eintraege EINER SITE (P3-2, Schritt 65): anlegen, auflisten,
// aus Feldern ableiten, Eintraege schreiben, lesen, suchen und einen Pfad
// aufloesen.
//
// Die sieben Routen standen in `http-routes-sites.ts`. Sie sind der groesste
// zusammenhaengende Fachbereich, der dort noch lag: **14 mitwandernde
// Importe**, alle aus `content-contract.ts` und `content.ts` - und nichts
// davon braucht der Rest der Quelldatei.
//
// **Nicht zu verwechseln mit `http-routes-content.ts`:** dort stehen die
// Routen *per ID* (`/api/collections/:collectionId`,
// `/api/code-payloads/:payloadId`) plus Reviews, Formulare und
// Redesign-Vorschlaege. Hier steht die Site-Ebene: was eine Site an
// Sammlungen und Eintraegen hat. Zwei Ebenen, zwei Module - wer sie
// zusammenlegt, muss bei jeder Aenderung beide Adressformen im Kopf halten.

import type { Route } from "./http-contract.ts";
import {
  readJsonBody,
  requireParam,
  resolveAuthor,
  withIdempotency,
} from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import { paginate, parsePaging } from "./paging.ts";
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
  createCollection,
  createCollectionFromFields,
  createEntry,
  listEntries,
  resolveEntryPath,
  searchEntries,
} from "./content.ts";
import { SenifyError } from "@senify/core";

export const siteContentRoutes: Route[] = [
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

];
