// Die verbleibenden Routen einer Site: Seiten, Audit, Releases, Bake-Jobs,
// Formulare, Benachrichtigungen und Redesign. Die Tabelle des Dispatchers in
// `http.ts` nimmt sie unveraendert auf (ADR-0019).
//
// Nicht mehr hier - die zehn Schnitte, die diese Datei von 1 205 auf 270
// Zeilen gebracht haben: Theme und Style-Regeln (`http-routes-theme.ts`,
// Schritt 57), Formulare (`http-routes-formular.ts`, 54), Assets
// (`http-routes-assets.ts`, 53), der Lebenszyklus
// (`http-routes-site-lifecycle.ts`, 60), der Framer-Import
// (`http-routes-imports.ts`, 61), Deployments (`http-routes-deploy.ts`, 62),
// die Bibliothek (`http-routes-library.ts`, 63), Design-Records
// (`http-routes-design.ts`, 64), Inhalte und Eintraege
// (`http-routes-site-content.ts`, 65), Bilder (`http-routes-images.ts`, 66),
// die Referenzen (`http-routes-site-references.ts`, 67), die Assets dieser
// Site (`http-routes-site-assets.ts`, 68), Vorschauen und Reviews
// (`http-routes-site-reviews.ts`, 69) sowie die Code-Payloads
// (`http-routes-site-code-payloads.ts`, 70).
//
// Was bleibt, ist der Betrieb einer Site: Seiten, Audit, Releases, Bake-Jobs,
// Formulare, Benachrichtigungen, Redesign. Der Betriebs-Block wurde als
// Schnittkandidat GEPRUEFT und VERWORFEN: 2 von 6 Importen wandern mit, das
// ist eine Sammelgruppe und kein Fachbereich. Die verbleibenden Routen haengen
// an `lifecycle.ts`, `forms.ts` und den Store-Fassaden - also an dem, was sie
// gerade lesen.

import type { Route } from "./http-contract.ts";
import { lifecycleContext, resolveAuthor, withIdempotency, readJsonBody, applyMutationsToPage, requireParam, limitParam } from "./http-route-support.ts";
import { SenifyError } from "@senify/core";
import { paginate, parsePaging } from "./paging.ts";
import { CreatePageBodySchema, parseBody, type CreatePageBody } from "./mutations/contract.ts";
import { publishRelease } from "./lifecycle.ts";
import {
  PublishReleaseBodySchema,
  type PublishReleaseBody,
} from "./lifecycle-contract.ts";
import { listSiteForms } from "./forms.ts";
import { ApplyRedesignBodySchema, type ApplyRedesignBody } from "./references-contract.ts";
import { applyRedesign } from "./apply-redesign.ts";
import { pageStarterById } from "./page-starters.ts";

export const siteRoutes: Route[] = [
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "pages"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const pageBody = parseBody<CreatePageBody>(CreatePageBodySchema, body, "page");
      const { idempotencyKey, starter: starterId, ...pageInput } = pageBody;
      return withIdempotency(context, auth, req, url, idempotencyKey, pageBody, async () => {
        const starter = starterId === undefined ? undefined : pageStarterById(starterId);
        const created = await context.store.createPage(siteId, {
          ...pageInput,
          ...(pageInput.title === undefined && starter !== undefined
            ? { title: starter.defaultTitle }
            : {}),
        });
        let page = created;
        let starterResult: { applied: boolean; reason?: string } | undefined;
        if (starter !== undefined && starter.sections.length > 0) {
          // The sections go in through the ordinary mutation path, so a start
          // template is held to the same rules as any edit (registry schemas,
          // guardrails, design fence). When the batch is refused the page stays
          // what it was — an empty page — and the response says why.
          try {
            await applyMutationsToPage(
              context,
              created.id,
              {
                baseDraftVersion: created.draftVersion,
                mutations: starter.sections.map((section) => ({
                  op: "insertNode" as const,
                  parent: { nodeId: created.draft.rootNodeId },
                  node: section,
                })),
              },
              auth,
            );
            page = await context.store.getPage(created.id);
            starterResult = { applied: true };
          } catch (error) {
            if (!(error instanceof SenifyError)) throw error;
            starterResult = { applied: false, reason: error.message };
          }
        }
        context.events.publish({
          kind: "page.created",
          siteId,
          pageId: page.id,
          action: "createPage",
          actor: resolveAuthor(auth),
        });
        return { status: 201, body: starterResult === undefined ? page : { ...page, starter: starterResult } };
      });
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "pages"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const all = await context.store.listPages(siteId);
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return { status: 200, body: { pages: page.items, ...page, items: undefined } };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "audit"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      await context.store.getSite(siteId);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      // Site-wide activity log: pages, themes, assets and content writes.
      return {
        status: 200,
        body: { entries: await context.store.listSiteAudit(siteId, limit) },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishReleaseBody>(
        PublishReleaseBodySchema,
        body,
        "release",
      );
      const result = await publishRelease(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
        note: input.note ?? null,
        basisReleaseId: input.basisReleaseId ?? null,
      });
      context.events.publish({
        kind: "release.published",
        siteId,
        action: "publishRelease",
        actor: resolveAuthor(auth),
      });
      return { status: 201, body: result };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const all = await context.store.listReleases(siteId);
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: {
          releases: page.items,
          ...page,
          items: undefined,
          // The active release is a POINTER, not part of the list, and it stays
          // outside the paging: a caller asking for page 3 of the history still
          // needs to know which one is live, or it could roll back to something
          // that was already superseded.
          activeReleaseId: await context.store.getActiveReleaseId(siteId),
        },
      };
    },
  },

  {
    // Re-bake jobs (E12 slice 1): the durable outbox behind content changes.
    // The status is the read side of the worker — queued, running, done, failed
    // with attempts, next attempt time and the last error.
    method: "GET",
    segments: ["api", "sites", ":siteId", "bake-jobs"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const all = await context.store.listBakeJobs(siteId);
      const page = paginate(all, parsePaging(url.searchParams), all.length);
      return {
        status: 200,
        body: { jobs: page.items, ...page, items: undefined },
      };
    },
  },

  {
    // The program's form overview: latest snapshot per form, for the
    // submissions view (fields, target collection, source page).
    method: "GET",
    segments: ["api", "sites", ":siteId", "forms"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: { forms: await listSiteForms(context.store, requireParam(params, "siteId")) },
    }),
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "notifications"],
    scope: "read",
    handler: async (context, params, _req, url) => ({
      status: 200,
      body: {
        notifications: await context.store.listNotifications(
          requireParam(params, "siteId"),
          limitParam(url, 50),
        ),
      },
    }),
  },

  {
    // apply_redesign (E25 slice 2): the mechanical steps of the redesign
    // journey — duplicate (or rebuild one page), theme patch, section
    // skeleton — through the canonical write paths. Never the active release:
    // the duplicate is a new site, the rebuild runs against the draft.
    method: "POST",
    segments: ["api", "sites", ":siteId", "redesign"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ApplyRedesignBody>(
        ApplyRedesignBodySchema,
        body,
        "apply redesign",
      );
      const siteId = requireParam(params, "siteId");
      if (input.siteId !== undefined && input.siteId !== siteId) {
        throw new SenifyError("validation", "The body siteId does not match the route", {
          field: "siteId",
          suggestion: "Use the siteId from the route path.",
        });
      }
      return withIdempotency(context, auth, req, url, input.idempotencyKey, { ...input }, async () => {
        const result = await applyRedesign({
          store: context.store,
          registry: context.registry,
          siteId,
          ...(input.referenceIds === undefined ? {} : { referenceIds: input.referenceIds }),
          ...(input.collectionId === undefined ? {} : { collectionId: input.collectionId }),
          ...(input.pageId === undefined ? {} : { pageId: input.pageId }),
          ...(input.withContent === undefined ? {} : { withContent: input.withContent }),
          author: resolveAuthor(auth),
        });
        return { status: 201, body: result };
      });
    },
  },

];
