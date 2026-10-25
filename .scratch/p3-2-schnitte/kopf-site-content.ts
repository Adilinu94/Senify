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
