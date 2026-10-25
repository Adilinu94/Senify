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
