// Die Routen des Site-Lebenszyklus (P3-2, Schritt 60): anlegen, listen,
// aendern, Papierkorb, wiederherstellen, duplizieren, lesen, loeschen.
//
// Die acht Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - eine Site entsteht, wechselt ihren Zustand und verschwindet -
// und brauchen deshalb nur fuenf Import-Quellen: den Routen-Helfer, den
// Koerper-Parser, den Site-Vertrag, `media.ts` (das Duplizieren kopiert die
// Assets mit) und `storage.ts` (das Loeschen raeumt die Dateien ab).

import type { Route } from "./http-contract.ts";
import { mediaContext, readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  CreateSiteBodySchema,
  type CreateSiteBody,
} from "./mutations/contract.ts";
import {
  DuplicateSiteBodySchema,
  SiteEventBodySchema,
  UpdateSiteBodySchema,
  type DuplicateSiteBody,
  type SiteEventBody,
  type UpdateSiteBody,
} from "./site-contract.ts";
import { collectAssetIds, copySiteAssets, rewriteAssetRefs } from "./media.ts";
import { removeSiteFiles } from "./storage.ts";
import { paginate, parsePaging } from "./paging.ts";
