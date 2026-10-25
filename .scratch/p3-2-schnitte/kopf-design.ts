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
