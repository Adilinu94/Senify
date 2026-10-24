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

export const deployRoutes: Route[] = [
  {
    // Deploy (E14): delivers the active release's build to the target. The
    // first adapter is a static directory; the outcome is recorded.
    method: "POST",
    segments: ["api", "sites", ":siteId", "deployments"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateDeploymentBody>(
        CreateDeploymentBodySchema,
        body,
        "deployment",
      );
      const provider = input.provider ?? "static";
      if (provider === "static" && input.targetDir === undefined) {
        throw new SenifyError("validation", 'Static deploys need a "targetDir"', {
          field: "targetDir",
          suggestion: 'Send { "provider": "static", "targetDir": "C:\\\\sites\\\\seite" }.',
        });
      }
      const deployment = await deployActiveRelease(context.store, {
        siteId,
        provider,
        targetDir: input.targetDir ?? "",
        author: resolveAuthor(auth),
      });
      context.events.publish({
        kind: "deploy.finished",
        siteId,
        action: deployment.status,
        actor: resolveAuthor(auth),
      });
      return { status: 201, body: { deployment } };
    },
  },

  {
    // Deploy settings (E14): where a hosted provider delivers. The token is
    // encrypted at rest; the view only says whether one exists.
    method: "GET",
    segments: ["api", "sites", ":siteId", "deploy-settings"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getDeploySettings(requireParam(params, "siteId")),
    }),
  },

  {
    method: "PUT",
    segments: ["api", "sites", ":siteId", "deploy-settings"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateDeploySettingsBody>(
        UpdateDeploySettingsBodySchema,
        body,
        "deploy settings",
      );
      const patch: Parameters<Store["updateDeploySettings"]>[1] = {};
      if (input.provider !== undefined) patch.provider = input.provider;
      if (input.netlifySiteId !== undefined) patch.netlifySiteId = input.netlifySiteId;
      if (input.netlifyToken !== undefined) {
        patch.netlifyTokenEncrypted =
          input.netlifyToken === null
            ? null
            : await encryptImageApiKey(context.store, input.netlifyToken);
      }
      if (input.vercelProjectId !== undefined) patch.vercelProjectId = input.vercelProjectId;
      if (input.vercelToken !== undefined) {
        patch.vercelTokenEncrypted =
          input.vercelToken === null
            ? null
            : await encryptImageApiKey(context.store, input.vercelToken);
      }
      const settings = await context.store.updateDeploySettings(siteId, patch);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "update_deploy_settings",
        params: {
          provider: settings.provider,
          netlifySiteId: settings.netlifySiteId,
          vercelProjectId: settings.vercelProjectId,
          tokenChanged:
            input.netlifyToken !== undefined || input.vercelToken !== undefined,
        },
        author: resolveAuthor(auth),
      });
      return { status: 200, body: settings };
    },
  },

  {
    // The deploy history of a site (newest first).
    method: "GET",
    segments: ["api", "sites", ":siteId", "deployments"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: { deployments: await context.store.listDeployments(siteId) },
      };
    },
  },

];
