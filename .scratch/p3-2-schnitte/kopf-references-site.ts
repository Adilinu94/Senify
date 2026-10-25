// Referenzen einer Site (P3-2, Schritt 67): die Zuordnung der Referenzprojekte
// samt abgeleitetem Theme-Entwurf, das Anwenden einer Referenz und das Loesen
// einer Zuordnung.
//
// Die drei Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - was die Site von welcher Referenz uebernimmt und was davon
// schon angewendet ist - und brauchen deshalb sieben mitwandernde Importe:
// `referenceContext`, den Referenz-Vertrag und vier Funktionen aus
// `references-lifecycle.ts`.
//
// **Eine Regel, die beim Verschieben leicht kippt:** die Zuordnungen werden
// paginiert, Entwurf und Pruefung NICHT. Sie sind der abgeleitete Zustand der
// ganzen Menge - eine Seite davon wuerde nichts beschreiben. Wer das Paging
// auf die ganze Antwort zieht, liefert einen Entwurf, der zu den sichtbaren
// Zuordnungen nicht mehr passt.

import type { Route } from "./http-contract.ts";
import {
  readJsonBody,
  referenceContext,
  requireParam,
  resolveAuthor,
} from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import { paginate, parsePaging } from "./paging.ts";
import {
  ApplyReferenceBodySchema,
  type ApplyReferenceBody,
} from "./references-contract.ts";
import {
  applyReference,
  referenceThemeDraft,
  removeReferenceAssignment,
  verifyReferenceApply,
} from "./references-lifecycle.ts";
