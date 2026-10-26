// Die zwei Asset-Routen einer Site: eine Upload-Adresse ausstellen und den
// Bestand lesen. Der Zuschnitt aus `http-routes-sites.ts` (Schritt 68).
//
// **Warum getrennt.** Beide Routen haengen an `media.ts` - und an nichts
// sonst aus der Site-Tabelle. Gemessen mit
// `.scratch/p3-2-schnitte/messung-block.mjs 11-12`: sechs Import-Quellen
// wandern mit (`mediaContext`, `UploadUrlBody`, `UploadUrlBodySchema`,
// `createUploadTicket`, `parseAssetListFilters`, `queryAssets`), nur sechs
// bleiben mit dem Rest gemeinsam. Das ist die klare Fachgrenze: Assets sind
// ein eigenes Gebiet, kein Anhaengsel der Seiten.
//
// **Die Paging-Regel bleibt woertlich hier.** `queryAssets` versteht `limit`
// bereits; der Paging-Block wird aus der GEFILTERTEN Liste gebaut, damit
// `total` und `hasMore` beschreiben, was der Filter getroffen hat - nicht den
// ganzen Bestand. Wer auf eine Ordner-Auswahl filtert und `total: 4000`
// bekaeme, wuerde aufhoeren zu blaettern und glauben, alles gesehen zu haben.
// Der Kommentar stand in `http-routes-sites.ts` und wandert mit; ein Schnitt
// darf eine solche Regel nicht stillschweigend zuruecklassen.

import type { Route } from "./http-contract.ts";
import { mediaContext, readJsonBody, requireParam, withIdempotency } from "./http-route-support.ts";
import { paginate, parsePaging } from "./paging.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  createUploadTicket,
  parseAssetListFilters,
  queryAssets,
  UploadUrlBodySchema,
  type UploadUrlBody,
} from "./media.ts";

export const siteAssetRoutes: Route[] = [
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", "upload-url"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UploadUrlBody>(
        UploadUrlBodySchema,
        body,
        "upload request",
      );
      const { idempotencyKey, ...uploadInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => {
        const { uploadId, ticket } = await createUploadTicket(mediaContext(context), {
          siteId,
          body: uploadInput,
        });
        const token = context.uploadSigner.sign(ticket);
        return {
          status: 201,
          body: {
            uploadId,
            url: `/api/assets/upload/${uploadId}?token=${encodeURIComponent(token)}`,
            expiresAt: ticket.expiresAt,
          },
        };
      });
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "assets"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const all = await queryAssets(
        context.store,
        siteId,
        parseAssetListFilters(url.searchParams),
      );
      // `queryAssets` already understands `limit`; the paging block is built
      // from the FILTERED list so `total` and `hasMore` describe what the filter
      // matched, not the whole library. A caller that filtered to one folder and
      // got `total: 4000` would stop paging and think it had seen everything.
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: { assets: page.items, ...page, items: undefined },
      };
    },
  },
];
