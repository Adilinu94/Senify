// Deploy und Deploy-Einstellungen einer Site (P3-2, Schritt 62): eine
// Veroeffentlichung ausliefern, die Auslieferungshistorie und die Ziele
// (statisch, Netlify, Vercel) samt verschluesseltem Token.
//
// Die vier Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - was ausgeliefert wird, wohin und mit welchem Nachweis - und
// brauchen deshalb nur fuenf Import-Quellen: den Routen-Helfer, den
// Koerper-Parser, den Deploy-Vertrag, `deploy.ts` und `settings.ts` (das
// Token wird wie ein API-Schluessel verschluesselt).
//
// **Der Block war im Quelltext nicht zusammenhaengend:** `deployments` stand
// als POST (Route 7) und GET (Route 12) mit `design-contract` dazwischen. Wer
// nur den POST schneidet, verteilt eine Ressource auf zwei Module.

import type { Route } from "./http-contract.ts";
import { readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  CreateDeploymentBodySchema,
  UpdateDeploySettingsBodySchema,
  type CreateDeploymentBody,
  type UpdateDeploySettingsBody,
} from "./deploy-contract.ts";
import { deployActiveRelease } from "./deploy.ts";
import { encryptImageApiKey } from "./settings.ts";
import type { Store } from "./store.ts";
import { SenifyError } from "@senify/core";
