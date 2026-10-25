// Die Framer-Import-Routen einer Site (P3-2, Schritt 61): Import anlegen
// (mit Idempotenz und Job-Zustand), Vorschau ohne Schreiben und der Verlauf.
//
// Die drei Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - ein Import entsteht, wird geprueft und bleibt nachlesbar - und
// brauchen deshalb nur fuenf Import-Quellen: den Routen-Helfer, den
// Koerper-Parser, `imports.ts` (Job, Quell-Pruefung, Quell-Aufloesung),
// `import-preview.ts` (die Vorschau samt Browser-Treiber) und den
// Import-Vertrag.

import type { Route } from "./http-contract.ts";
import {
  mediaContext,
  readJsonBody,
  requireParam,
  resolveAuthor,
  withIdempotency,
} from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import {
  CreateImportBodySchema,
  type CreateImportBody,
} from "./imports-contract.ts";
import {
  IMPORT_MAX_ATTEMPTS,
  assertImportRootAllowed,
  runFramerImportJob,
  sourceOf,
} from "./imports.ts";
import { createImportPreviewDriver, previewFramerImport } from "./import-preview.ts";
import { parseDurationMs } from "@senify/renderer";
import { resolveTheme } from "@senify/tokens";

export const importRoutes: Route[] = [
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "imports", "framer"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<CreateImportBody>(CreateImportBodySchema, body, "import");
      const { idempotencyKey, ...importInput } = parsed;
      if (importInput.source.rootDir !== undefined && importInput.source.rootDir !== "") {
        assertImportRootAllowed(importInput.source.rootDir);
      }
      return withIdempotency(context, auth, req, url, idempotencyKey, parsed, async () => {
        const author = resolveAuthor(auth);
        const dryRun = importInput.write !== true;
        const pagePath = importInput.pagePath ?? "/";
        const job = await context.store.createImportJob({
          siteId,
          source: {
            kind: importInput.source.url !== undefined
              ? "url"
              : importInput.source.rootDir !== undefined
                ? "mirror"
                : "html",
            url: importInput.source.url ?? null,
            rootDir: importInput.source.rootDir ?? null,
            html: importInput.source.html ?? null,
            baseUrl: importInput.source.baseUrl ?? null,
          },
          pagePath,
          dryRun,
          maxAttempts: IMPORT_MAX_ATTEMPTS,
          payload: importInput as Record<string, unknown>,
        });
        try {
          await context.store.updateImportJob({
            id: job.id,
            status: "running",
            stage: "capture",
            progress: 10,
            attempts: job.attempts + 1,
            nextAttemptAt: job.nextAttemptAt,
            lastError: null,
            finishedAt: null,
          });
          const result = await runFramerImportJob(context.store, {
            siteId,
            jobId: job.id,
            body: importInput,
            author,
            media: mediaContext(context),
          });
          if (importInput.write !== true) {
            await context.store.updateImportJob({
              id: job.id,
              status: "succeeded",
              stage: "done",
              progress: 100,
              attempts: job.attempts + 1,
              nextAttemptAt: job.nextAttemptAt,
              lastError: null,
              finishedAt: new Date().toISOString(),
            });
            await context.store.setImportJobResult(
              job.id,
              result.report as unknown as Record<string, unknown>,
            );
          }
          // Re-read: the answer carries the final job state, not the
          // queued snapshot from the insert.
          const finished = await context.store.getImportJob(job.id);
          if (importInput.write === true && !result.report.replayed) {
            context.events.publish({
              kind: "page.created",
              siteId,
              pageId: result.report.pageId ?? undefined,
              action: "importFramer",
              actor: author,
            });
          }
          return { status: 201, body: { job: finished, report: result.report } };
        } catch (error) {
          const message =
            error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
          await context.store
            .updateImportJob({
              id: job.id,
              status: "failed",
              stage: "failed",
              progress: job.progress,
              attempts: job.attempts + 1,
              nextAttemptAt: job.nextAttemptAt,
              lastError: message,
              finishedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
          throw error;
        }
      });
    },
  },

  {
    // The preview of an import (nothing is written): the page next to the page
    // the import makes of it, at the platform's three widths. It opens a
    // browser and loads the source, so it is a write-scope call.
    method: "POST",
    segments: ["api", "sites", ":siteId", "imports", "framer", "preview"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const parsed = parseBody<CreateImportBody>(CreateImportBodySchema, (await readJsonBody(req)) ?? {}, "import");
      const site = await context.store.getSite(siteId);
      const siteTheme = await context.store.getTheme(siteId);
      const resolved = resolveTheme(siteTheme.theme);
      const baseDuration = resolved.motion.duration.base;
      // The write would set the source's breakpoints only on a site without a
      // pair and without other pages; the preview bakes with what it would leave.
      const targetPath = parsed.pagePath ?? "/";
      const otherPages = (await context.store.listPageDrafts(siteId)).some((page) =>
        parsed.pageId === undefined ? page.path !== targetPath : page.id !== parsed.pageId,
      );
      const preview = await previewFramerImport({
        source: sourceOf(parsed),
        pagePath: parsed.pagePath ?? "/",
        mode: parsed.mode ?? "dna",
        themeCss: siteTheme.css,
        motionTokens: {
          ease: resolved.motion.ease,
          baseDurationMs: baseDuration === undefined ? 300 : parseDurationMs(baseDuration),
          baseStaggerMs: 80,
        },
        siteName: site.name,
        site: { ...(site.breakpoints === undefined ? {} : { breakpoints: site.breakpoints }), otherPages },
        driver: context.importPreview ?? createImportPreviewDriver(),
      });
      return { status: 200, body: preview };
    },
  },

  {
    // The site-scoped import history shown by the editor.
    method: "GET",
    segments: ["api", "sites", ":siteId", "imports"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: { jobs: await context.store.listImportJobsForSite(siteId, 100) },
      };
    },
  },
];
