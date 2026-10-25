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
