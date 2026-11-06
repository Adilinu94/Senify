// Theme und Style-Regeln einer Site (P3-2, Schritt 57): das Theme lesen,
// als CSS ausliefern, schreiben, den Theme-Bericht, den Design-Bericht und
// die sechs Style-Regel-Routen (lesen, anlegen, aendern, sortieren, loeschen).
//
// Die elf Routen standen in `http-routes-sites.ts`. Sie teilen einen
// Fachbereich - Theme und Regelwerk haengen beide an der Site und tragen
// dieselbe Versionskopfzeile (`styleVersionHeaders`) - und brauchen deshalb
// nur fuenf Import-Quellen: den Routen-Helfer, den Koerper-Parser, den
// Site-Vertrag, den Theme-Bericht und den Design-Bericht.

import type { Route } from "./http-contract.ts";
import { readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";
import { parseBody } from "./mutations/contract.ts";
import { UpdateThemeBodySchema, type UpdateThemeBody } from "./mutations/contract.ts";
import {
  CreateStyleRuleBodySchema,
  DeleteGlobalClassBodySchema,
  DeleteStyleRuleBodySchema,
  ReorderStyleRuleBodySchema,
  RestoreGlobalClassBodySchema,
  UpdateStyleRuleBodySchema,
  VariableDeletionBodySchema,
  VariableRenameBodySchema,
  type CreateStyleRuleBody,
  type DeleteGlobalClassBody,
  type DeleteStyleRuleBody,
  type ReorderStyleRuleBody,
  type RestoreGlobalClassBody,
  type UpdateStyleRuleBody,
  type VariableDeletionBody,
  type VariableRenameBody,
} from "./site-contract.ts";
import { getVariableUsage } from "./variable-usage.ts";
import { buildThemeReport } from "./theme-report.ts";
import { buildDesignReport } from "./design-report.ts";
import { SenifyError } from "@senify/core";

function styleVersionHeaders(version: number): Record<string, string> {
  return {
    etag: `"style-v${version}"`,
    "x-senify-style-version": String(version),
  };
}

/** Die Routen des Themes und der Style-Regeln. */
export const themeRoutes: Route[] = [
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: await context.store.getTheme(siteId) };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme.css"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const stored = await context.store.getTheme(siteId);
      return {
        status: 200,
        text: { contentType: "text/css; charset=utf-8", body: stored.css },
        headers: {
          "cache-control": "no-store",
          "x-senify-theme-version": String(stored.version),
        },
      };
    },
  },

  {
    method: "PUT",
    segments: ["api", "sites", ":siteId", "theme"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const themeBody = parseBody<UpdateThemeBody>(UpdateThemeBodySchema, body, "theme update");
      const updated = await context.store.updateTheme(
        siteId,
        themeBody.theme,
        resolveAuthor(auth),
        themeBody.baseVersion,
      );
      return { status: 200, body: updated };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme", "variables", ":family", ":name", "usage"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await getVariableUsage(context.store, requireParam(params, "siteId"), requireParam(params, "family"), requireParam(params, "name")),
    }),
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "theme", "variables", ":family", ":name", "rename"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const body = parseBody<VariableRenameBody>(VariableRenameBodySchema, (await readJsonBody(req)) ?? {}, "variable rename");
      return { status: 200, body: await context.store.renameVariable(requireParam(params, "siteId"), requireParam(params, "family"), requireParam(params, "name"), body, resolveAuthor(auth)) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "theme", "variables", ":family", ":name", "delete"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const body = parseBody<VariableDeletionBody>(VariableDeletionBodySchema, (await readJsonBody(req)) ?? {}, "variable deletion");
      return { status: 200, body: await context.store.deleteUnusedVariable(requireParam(params, "siteId"), requireParam(params, "family"), requireParam(params, "name"), body, resolveAuthor(auth)) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "theme", "variables", ":family", ":name", "restore"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const body = parseBody<VariableDeletionBody>(VariableDeletionBodySchema, (await readJsonBody(req)) ?? {}, "variable restoration");
      return { status: 200, body: await context.store.restoreVariable(requireParam(params, "siteId"), requireParam(params, "family"), requireParam(params, "name"), body, resolveAuthor(auth)) };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme", "report"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return {
        status: 200,
        body: await buildThemeReport({
          store: context.store,
          registry: context.registry,
          siteId,
        }),
      };
    },
  },

  {
    // Design report (E26): the reproducible 0-100 score with its eight
    // dimensions and the named slop findings (S1-S12). A read; the gate
    // stages stay in the release checks.
    method: "GET",
    segments: ["api", "sites", ":siteId", "design-report"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await buildDesignReport({
        store: context.store,
        siteId: requireParam(params, "siteId"),
      }),
    }),
  },

  // Style rules (Phase 2): site-wide, so they hang off the site like the theme
// does. Reads are open to any token, writes need `write`, deletion needs
// `publish` (same ladder the other destructive site resources use).
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "style-rules"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const registry = await context.store.getStyleRegistry(siteId);
      return { status: 200, body: registry, headers: styleVersionHeaders(registry.version) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<CreateStyleRuleBody>(
        CreateStyleRuleBodySchema,
        body,
        "style rule",
      );
      const { author: _suggestion, ...input } = parsed;
      const rule = await context.store.createStyleRule(siteId, input, resolveAuthor(auth));
      const version = (await context.store.getStyleRegistry(siteId)).version;
      return { status: 201, body: rule, headers: styleVersionHeaders(version) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId", "delete-globally"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const body = parseBody<DeleteGlobalClassBody>(DeleteGlobalClassBodySchema, (await readJsonBody(req)) ?? {}, "global class deletion");
      const result = await context.store.deleteGlobalClass(requireParam(params, "siteId"), requireParam(params, "ruleId"), body, resolveAuthor(auth));
      return { status: 200, body: result, headers: styleVersionHeaders(result.version) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId", "restore-globally"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const body = parseBody<RestoreGlobalClassBody>(RestoreGlobalClassBodySchema, (await readJsonBody(req)) ?? {}, "global class restore");
      const result = await context.store.restoreGlobalClass(requireParam(params, "siteId"), requireParam(params, "ruleId"), body, resolveAuthor(auth));
      return { status: 200, body: result, headers: styleVersionHeaders(result.version) };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId", "usage"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const [rule, pages] = await Promise.all([
        context.store.getStyleRule(siteId, ruleId),
        context.store.listPageDrafts(siteId),
      ]);
      if (rule.kind !== "class" || rule.scope !== undefined) {
        throw new SenifyError("validation", "Die Verwendungsübersicht gilt für globale Klassen", { field: "ruleId" });
      }
      const usage = pages.flatMap((page) => {
        const nodeIds = Object.values(page.draft.nodes)
          .filter((node) => node.classes?.includes(rule.name))
          .map((node) => node.id);
        return nodeIds.length === 0 ? [] : [{ pageId: page.id, title: page.title, path: page.path, nodeIds }];
      });
      return { status: 200, body: { ruleId, name: rule.name, usage } };
    },
  },

  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      return { status: 200, body: await context.store.getStyleRule(siteId, ruleId) };
    },
  },

  {
    method: "PATCH",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<UpdateStyleRuleBody>(
        UpdateStyleRuleBodySchema,
        body,
        "style rule update",
      );
      const { author: _suggestion, pageContext, ...patch } = parsed;
      const result = await context.store.updateStyleRule(siteId, ruleId, patch, resolveAuthor(auth), pageContext);
      return { status: 200, body: { ...result.rule, version: result.version, ...(result.pageDraftVersion === undefined ? {} : { pageDraftVersion: result.pageDraftVersion }) }, headers: styleVersionHeaders(result.version) };
    },
  },

  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId", "reorder"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<ReorderStyleRuleBody>(
        ReorderStyleRuleBodySchema,
        body,
        "style rule reorder",
      );
      if ((parsed.index === undefined) === (parsed.classIndex === undefined)) {
        throw new SenifyError("validation", "Genau ein Index muss angegeben werden", { field: "index" });
      }
      const rules = await context.store.reorderStyleRule(
        siteId,
        ruleId,
        parsed.classIndex === undefined ? parsed.index! : { classIndex: parsed.classIndex },
        resolveAuthor(auth),
        parsed.baseVersion,
      );
      const version = (await context.store.getStyleRegistry(siteId)).version;
      return { status: 200, body: { rules, version }, headers: styleVersionHeaders(version) };
    },
  },

  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      const parsed = parseBody<DeleteStyleRuleBody>(DeleteStyleRuleBodySchema, body, "style rule delete");
      const result = await context.store.deleteStyleRule(
        siteId,
        ruleId,
        resolveAuthor(auth),
        parsed.baseVersion,
        parsed.pageContext,
      );
      return parsed.pageContext === undefined
        ? { status: 204, headers: styleVersionHeaders(result.version) }
        : { status: 200, body: result, headers: styleVersionHeaders(result.version) };
    },
  },
];
