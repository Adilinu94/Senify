// Die Routen des Bereichs api/references, api/reference-collections. Die Tabelle des
// Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019).

import type { Route } from "./http-contract.ts";
import { SenifyError } from "@senify/core";
import {
  CONTENT_TYPES,
} from "./http-response.ts";
import {
  parseBody,
} from "./mutations/contract.ts";
import {
  analyzeReference,
  deleteReference,
  editReferenceProfile,
  runDueReferenceJobs,
} from "./references-lifecycle.ts";
import {
  AnalyzeReferenceBodySchema,
  CreateReferenceCollectionBodySchema,
  EditReferenceProfileBodySchema,
  MANUAL_REFERENCE_BODY_LIMIT_BYTES,
  ManualReferenceBodySchema,
  mergeReferenceDocuments,
  parseReferenceListFilters,
  ReferenceBriefBodySchema,
  ReferenceTickBodySchema,
  referenceFooterText,
  UpdateReferenceBodySchema,
  UpdateReferenceCollectionBodySchema,
  VisualDiffBodySchema,
  type AnalyzeReferenceBody,
  type CreateReferenceCollectionBody,
  type EditReferenceProfileBody,
  type ManualReferenceBody,
  type ReferenceBriefBody,
  type ReferenceTickBody,
  type UpdateReferenceBody,
  type UpdateReferenceCollectionBody,
  type VisualDiffBody,
} from "./references-contract.ts";
import { diffReferenceAgainstDraft } from "./reference-visual-diff.ts";
import {
  createManualReference,
  referenceStyleCatalogInfo,
  seedReferenceStyles,
} from "./references-library.ts";
import { buildDesignSystemImport } from "./design-system-import.ts";
import {
  buildCollectionBrief,
  buildImagePrompt,
  buildReferenceBrief,
} from "./references-brief.ts";
import { resolveStoredFile, storedFileName } from "./storage.ts";
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import {
  referenceContext,
  resolveAuthor,
  withIdempotency,
  readJsonBody,
  publicBaseUrlOf,
  filterReferences,
  requireParam,
} from "./http-route-support.ts";

export const referenceRoutes: Route[] = [
  {
    // analyze_reference: URL → analysis job → profile (artifacts/28 §1).
    method: "POST",
    segments: ["api", "references"],
    scope: "write",
    handler: async (context, _params, req, _url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<AnalyzeReferenceBody>(
        AnalyzeReferenceBodySchema,
        body,
        "reference analysis",
      );
      const result = await analyzeReference(referenceContext(context), {
        url: input.url,
        author: resolveAuthor(auth),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
        ...(input.wait === undefined ? {} : { wait: input.wait }),
      });
      return { status: 201, body: result };
    },
  },

  {
    // FTS over the library (E24, L42): the search hits with weight ranking —
    // the haystack includes the verbatim documents (design.md & Co.), so
    // "vault first: search before capturing" works over the whole corpus.
    method: "GET",
    segments: ["api", "references", "search"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const query = (url.searchParams.get("q") ?? "").trim();
      if (query === "") {
        throw new SenifyError("validation", "Missing search query", {
          field: "q",
          suggestion: "Pass a query, e.g. ?q=swiss+grid.",
        });
      }
      const hits = await context.store.searchReferences(query.split(/\s+/));
      return {
        status: 200,
        body: {
          query,
          count: hits.length,
          hits: hits.map((hit) => ({
            reference: hit.reference,
            weight: hit.weight,
          })),
        },
      };
    },
  },

  {
    // Dedupe candidates (E24, L42): near-duplicates of the library (same
    // source url or same normalised name). Read-only — deleting stays manual
    // (delete_reference) so a fork with a different url is never lost.
    method: "GET",
    segments: ["api", "references", "duplicates"],
    scope: "read",
    handler: async (context) => {
      const duplicates = await context.store.findDuplicateReferences();
      return {
        status: 200,
        body: {
          count: duplicates.length,
          duplicates,
        },
      };
    },
  },

  {
    // The library list: collection filter, search over title/family/note/
    // vocabulary/collection name, sort and the numbers of the footer line.
    method: "GET",
    segments: ["api", "references"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const filters = parseReferenceListFilters(url.searchParams);
      if (filters.collection !== undefined && filters.collection !== "none") {
        // A mistyped collection id is an error, not an empty view.
        await context.store.getReferenceCollection(filters.collection);
      }
      const [all, collections] = await Promise.all([
        context.store.listReferences({ sort: filters.sort }),
        context.store.listReferenceCollections(),
      ]);
      const references = filterReferences(all, filters);
      return {
        status: 200,
        body: {
          references,
          collections,
          counts: {
            references: all.length,
            inView: references.length,
            collections: collections.length,
            styles: collections.filter((collection) => collection.kind === "style").length,
          },
          footer: {
            total: all.length,
            inView: references.length,
            query: filters.query ?? null,
            text: referenceFooterText({
              count: references.length,
              ...(filters.query === undefined ? {} : { query: filters.query }),
            }),
          },
          styleCatalog: referenceStyleCatalogInfo(),
        },
      };
    },
  },

  {
    // Manually stored reference: an uploaded image plus the library fields. It
    // is ready on arrival, carries a snapshot and no analysis profile.
    method: "POST",
    segments: ["api", "references", "manual"],
    scope: "write",
    handler: async (context, _params, req, _url, auth) => {
      const body = (await readJsonBody(req, MANUAL_REFERENCE_BODY_LIMIT_BYTES)) ?? {};
      const input = parseBody<ManualReferenceBody>(
        ManualReferenceBodySchema,
        body,
        "manual reference",
      );
      return {
        status: 201,
        body: {
          reference: await createManualReference(referenceContext(context), {
            ...input,
            author: resolveAuthor(auth),
          }),
        },
      };
    },
  },

  {
    // Combined brief of several references (the comparison dialog). A read, so
    // no write scope is needed.
    method: "POST",
    segments: ["api", "references", "brief"],
    scope: "read",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReferenceBriefBody>(
        ReferenceBriefBodySchema,
        body,
        "reference brief",
      );
      const ids = [...new Set(input.referenceIds)];
      const references = [];
      for (const id of ids) {
        references.push(await context.store.getReference(id));
      }
      const settings = await context.store.getReferenceSettings();
      return {
        status: 200,
        body: {
          brief: buildReferenceBrief({
            references,
            dna: settings.dna,
            preferences: settings.preferences,
            baseUrl: publicBaseUrlOf(req),
          }),
          imagePrompt:
            references.length === 1
              ? buildImagePrompt(references[0]!, { baseUrl: publicBaseUrlOf(req) })
              : null,
          vocabulary: null,
        },
      };
    },
  },

  {
    // Job tick: due jobs retry with backoff and progress (long captures).
    method: "POST",
    segments: ["api", "references", "tick"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReferenceTickBody>(
        ReferenceTickBodySchema,
        body,
        "reference tick",
      );
      const result = await runDueReferenceJobs(
        referenceContext(context),
        input.limit === undefined ? {} : { limit: input.limit },
      );
      return { status: 200, body: result };
    },
  },

  {
    method: "GET",
    segments: ["api", "references", ":referenceId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getReference(requireParam(params, "referenceId")),
    }),
  },

  {
    // Library fields of one reference: name, collection, note, vocabulary,
    // recipe, composition and family ("Die Idee zum Mitnehmen" of the detail).
    method: "PATCH",
    segments: ["api", "references", ":referenceId"],
    scope: "write",
    handler: async (context, params, req) => {
      const referenceId = requireParam(params, "referenceId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateReferenceBody>(
        UpdateReferenceBodySchema,
        body,
        "reference",
      );
      const name = input.name?.trim();
      if (input.name !== undefined && (name === undefined || name === "")) {
        throw new SenifyError(
          "validation",
          "Der Name der Referenz darf nicht leer sein",
          {
            field: "name",
            suggestion: "Einen Namen mit mindestens einem sichtbaren Zeichen senden.",
          },
        );
      }
      if (input.collectionId !== undefined && input.collectionId !== null) {
        await context.store.getReferenceCollection(input.collectionId);
      }
      // A single document kind updates in place; the other kinds keep their
      // text (mergeReferenceDocuments), null clears one explicitly.
      const documents =
        input.documents === undefined
          ? undefined
          : mergeReferenceDocuments(
              (await context.store.getReference(referenceId)).documents,
              input.documents,
            );
      return {
        status: 200,
        body: {
          reference: await context.store.updateReference(referenceId, {
            ...(name === undefined ? {} : { name }),
            ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl }),
            ...(input.collectionId === undefined ? {} : { collectionId: input.collectionId }),
            ...(input.note === undefined ? {} : { note: input.note }),
            ...(input.vocabulary === undefined ? {} : { vocabulary: input.vocabulary }),
            ...(input.imageRecipe === undefined ? {} : { imageRecipe: input.imageRecipe }),
            ...(input.heroUsage === undefined ? {} : { heroUsage: input.heroUsage }),
            ...(input.family === undefined ? {} : { family: input.family }),
            ...(documents === undefined ? {} : { documents }),
          }),
        },
      };
    },
  },

  {
    // design.md → Theme (E27): the documented tokens as a theme patch with the
    // evidence of every value, the gaps of the document and the conflicts
    // against the current theme. A read; the write stays update_theme.
    method: "GET",
    segments: ["api", "references", ":referenceId", "design-system"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = url.searchParams.get("siteId") ?? "";
      if (siteId === "") {
        throw new SenifyError("validation", 'Missing "siteId"', {
          field: "siteId",
          suggestion:
            "Pass the target site (?siteId=…): the patch is derived against its current theme.",
        });
      }
      return {
        status: 200,
        body: await buildDesignSystemImport(context.store, {
          referenceId: requireParam(params, "referenceId"),
          siteId,
        }),
      };
    },
  },

  {
    // Design brief of one reference plus its image prompt.
    method: "GET",
    segments: ["api", "references", ":referenceId", "brief"],
    scope: "read",
    handler: async (context, params, req) => {
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const settings = await context.store.getReferenceSettings();
      const baseUrl = publicBaseUrlOf(req);
      return {
        status: 200,
        body: {
          brief: buildReferenceBrief({
            references: [reference],
            dna: settings.dna,
            preferences: settings.preferences,
            baseUrl,
          }),
          imagePrompt: buildImagePrompt(reference, { baseUrl }),
          vocabulary: null,
        },
      };
    },
  },

  {
    // Löschen mit Nutzungs-Hinweis: ohne force nur ohne Projekt-Zuordnung.
    method: "DELETE",
    segments: ["api", "references", ":referenceId"],
    scope: "write",
    destructive: true,
    handler: async (context, params, _req, url) => {
      const force = url.searchParams.get("force");
      return {
        status: 200,
        body: await deleteReference(referenceContext(context), {
          referenceId: requireParam(params, "referenceId"),
          force: force === "1" || force === "true",
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "references", ":referenceId", "revisions"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        revisions: await context.store.listReferenceProfileRevisions(
          requireParam(params, "referenceId"),
        ),
      },
    }),
  },

  {
    // Nachbearbeitung: jede Aenderung erzeugt eine neue Profil-Revision.
    method: "POST",
    segments: ["api", "references", ":referenceId", "revisions"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const referenceId = requireParam(params, "referenceId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EditReferenceProfileBody>(
        EditReferenceProfileBodySchema,
        body,
        "reference profile edit",
      );
      const revision = await editReferenceProfile(referenceContext(context), {
        referenceId,
        author: resolveAuthor(auth),
        ...(input.vocabulary === undefined ? {} : { vocabulary: input.vocabulary }),
        ...(input.families === undefined ? {} : { families: input.families }),
        ...(input.rules === undefined ? {} : { rules: input.rules }),
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      return { status: 201, body: revision };
    },
  },

  {
    // Gestored snapshot PNG of a reference. The filename is whitelisted against
    // the reference's own snapshots, so traversal and foreign ids never resolve
    // (artifacts/28 §4: snapshots stay internal, they do not enter the media
    // library).
    method: "GET",
    segments: ["api", "references", ":referenceId", "snapshots", ":filename"],
    scope: "read",
    rateLimit: false,
    handler: async (context, params) => {
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const filename = requireParam(params, "filename");
      const snapshot = reference.snapshots.find(
        (entry) => storedFileName(entry.storageRef) === filename,
      );
      if (snapshot === undefined) {
        throw new SenifyError("not_found", `Snapshot "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(context.dataDir, snapshot.storageRef);
      if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
        throw new SenifyError("not_found", `Snapshot file "${filename}" is missing`, {
          field: "filename",
        });
      }
      return {
        status: 200,
        file: {
          path: file,
          // Captures are PNG; a manually stored reference keeps its container.
          contentType:
            CONTENT_TYPES[extname(file).toLowerCase()] ?? "image/png",
          // A re-analysis may overwrite the file under a stable name, so the
          // response revalidates instead of caching hard.
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },

  {
    // Visual diff reference ↔ result (E26 slice 2): bakes the page drafts to
    // a throwaway directory, captures them at the slot widths of the
    // reference and diffs slot by slot. Read-only in effect — no preview
    // record, no review item; the heatmaps persist under the reference.
    method: "POST",
    segments: ["api", "references", ":referenceId", "visual-diff"],
    scope: "read",
    handler: async (context, params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<VisualDiffBody>(
        VisualDiffBodySchema,
        body,
        "reference visual diff",
      );
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const result = await diffReferenceAgainstDraft({
        store: context.store,
        siteId: input.siteId,
        ...(input.pageId === undefined ? {} : { pageId: input.pageId }),
        reference,
        dataDir: context.dataDir,
        formSigner: context.formSigner,
        formBaseUrl: context.formBaseUrl,
        ...(context.referenceDiffs === undefined
          ? {}
          : { deps: context.referenceDiffs }),
      });
      return { status: 200, body: result };
    },
  },

  {
    // Stored heatmaps of the reference diff. The filename is validated
    // against its own directory, so traversal never resolves.
    method: "GET",
    segments: ["api", "references", ":referenceId", "visual-diffs", ":filename"],
    scope: "read",
    rateLimit: false,
    handler: async (context, params) => {
      const referenceId = requireParam(params, "referenceId");
      await context.store.getReference(referenceId);
      const filename = requireParam(params, "filename");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(filename)) {
        throw new SenifyError("not_found", `Visual "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(
        context.dataDir,
        ["references", referenceId, "visual-diffs", filename].join("/"),
      );
      if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
        throw new SenifyError("not_found", `Visual file "${filename}" is missing`, {
          field: "filename",
        });
      }
      return {
        status: 200,
        file: {
          path: file,
          contentType: "image/png",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },

  // ------------------------------------- reference collections (T14)
  {
    method: "GET",
    segments: ["api", "reference-collections"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const kind = url.searchParams.get("kind");
      if (kind !== null && kind !== "collection" && kind !== "style") {
        throw new SenifyError("validation", `Unknown collection kind "${kind}"`, {
          field: "kind",
          suggestion: 'Use kind=collection or kind=style.',
        });
      }
      return {
        status: 200,
        body: {
          collections: await context.store.listReferenceCollections(
            kind === null ? {} : { kind },
          ),
          styleCatalog: referenceStyleCatalogInfo(),
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "reference-collections"],
    scope: "write",
    handler: async (context, _params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateReferenceCollectionBody>(
        CreateReferenceCollectionBodySchema,
        body,
        "reference collection",
      );
      const { idempotencyKey, ...collectionInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => ({
        status: 201,
        body: { collection: await context.store.createReferenceCollection(collectionInput) },
      }));
    },
  },

  {
    // Seed of the style families ("Style guide"). Idempotent: existing families
    // are never overwritten.
    method: "POST",
    segments: ["api", "reference-collections", "styles"],
    scope: "write",
    handler: async (context) => ({
      status: 201,
      body: {
        seed: await seedReferenceStyles(context.store),
        styleCatalog: referenceStyleCatalogInfo(),
      },
    }),
  },

  {
    method: "PATCH",
    segments: ["api", "reference-collections", ":collectionId"],
    scope: "write",
    handler: async (context, params, req) => {
      const collectionId = requireParam(params, "collectionId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateReferenceCollectionBody>(
        UpdateReferenceCollectionBodySchema,
        body,
        "reference collection",
      );
      const name = input.name?.trim();
      if (input.name !== undefined && (name === undefined || name === "")) {
        throw new SenifyError("validation", "Der Name der Sammlung darf nicht leer sein", {
          field: "name",
          suggestion: "Einen Namen mit mindestens einem sichtbaren Zeichen senden.",
        });
      }
      return {
        status: 200,
        body: {
          collection: await context.store.updateReferenceCollection(collectionId, {
            ...(name === undefined ? {} : { name }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.deployFor === undefined ? {} : { deployFor: input.deployFor }),
            ...(input.vocabulary === undefined ? {} : { vocabulary: input.vocabulary }),
            ...(input.risk === undefined ? {} : { risk: input.risk }),
            ...(input.accent === undefined ? {} : { accent: input.accent }),
            ...(input.imageStyle === undefined ? {} : { imageStyle: input.imageStyle }),
            ...(input.recognize === undefined ? {} : { recognize: input.recognize }),
            ...(input.examples === undefined ? {} : { examples: input.examples }),
            ...(input.warning === undefined ? {} : { warning: input.warning }),
            ...(input.position === undefined ? {} : { position: input.position }),
          }),
        },
      };
    },
  },

  {
    // Deleting a collection keeps its references: they fall back to "without
    // collection" and the count of affected references is reported.
    method: "DELETE",
    segments: ["api", "reference-collections", ":collectionId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => {
      const collectionId = requireParam(params, "collectionId");
      return {
        status: 200,
        body: {
          deleted: collectionId,
          affectedReferences: await context.store.deleteReferenceCollection(collectionId),
        },
      };
    },
  },

  {
    // Collection brief (the "About this collection" dialog), with the style
    // families of the style guide as well.
    method: "GET",
    segments: ["api", "reference-collections", ":collectionId", "brief"],
    scope: "read",
    handler: async (context, params, req) => {
      const collection = await context.store.getReferenceCollection(
        requireParam(params, "collectionId"),
      );
      const settings = await context.store.getReferenceSettings();
      // The collection brief carries the entry sections of all its references;
      // a style family has none and briefs from the style guide instead.
      const references =
        collection.kind === "style"
          ? []
          : await Promise.all(
              (await context.store.listReferences())
                .filter((entry) => entry.collectionId === collection.id)
                .map((entry) => context.store.getReference(entry.id)),
            );
      return {
        status: 200,
        body: {
          brief: buildCollectionBrief({
            collection,
            references,
            dna: settings.dna,
            preferences: settings.preferences,
            baseUrl: publicBaseUrlOf(req),
          }),
          imagePrompt: null,
          vocabulary: collection.vocabulary.join(", "),
        },
      };
    },
  },
];
