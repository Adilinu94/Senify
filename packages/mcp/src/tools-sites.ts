// Identitaet und Projekte (R12-Schnitt): wer bin ich, welche Sites gibt es,
// eine laden, anlegen, kopieren.
//
// Die fuenf Werkzeuge standen als geschlossener Block am Anfang von `tools.ts`.
// Sie teilen den Site-Begriff und die Listen-/Paging-Form; kein anderes Werkzeug
// greift auf SITE_SCHEMA zu. Die Reihenfolge in `SITE_TOOLS` ist die Reihenfolge
// im Manifest.

import {
  listSchema,
  objectSchema,
  optionalBoolean,
  optionalString,
  pagingQuery,
  requireString,
} from "./tools-support.ts";
import { SITE_SCHEMA } from "./tools-schemas.ts";
import type { ToolDefinition } from "./tools.ts";

/** Die Werkzeuge der Identitaet und der Projekte. */
export const SITE_TOOLS: ToolDefinition[] = [
  {
    name: "whoami",
    title: "Who am I",
    description:
      "Returns the token identity, its scopes and last usage. Use it to debug a client setup and to check that `senify setup` worked.",
    scope: "read",
    inputSchema: objectSchema({}),
    handler: async (context) => context.client.request("GET", "/api/whoami"),
  },
  {
    name: "list_sites",
    title: "List sites",
    description:
      "Lists all website projects with id, name, slug and profile. Start here to discover the siteId other tools need. Paged: limit (1-200, default 50) and offset; follow hasMore.",
    scope: "read",
    inputSchema: objectSchema({ limit: { type: "number" }, offset: { type: "number" } }),
    outputSchema: listSchema("sites", SITE_SCHEMA),
    handler: async (context, args) =>
      context.client.request("GET", `/api/sites${pagingQuery(args)}`),
  },
  {
    name: "get_site",
    title: "Get site",
    description:
      "Loads one site with its profile and timestamps. Use it to confirm a siteId before writing.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    outputSchema: SITE_SCHEMA,
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request("GET", `/api/sites/${requireString(args, "siteId")}`),
  },
  {
    name: "create_site",
    title: "Create site",
    description:
      "Legt ein Website-Projekt an: name ist Pflicht, slug und profile (clean|standard|showcase) sind optional. Für ein Redesign ist duplicate_site meist der bessere Start, weil es Inhalte und Theme mitbringt.",
    scope: "write",
    outputSchema: SITE_SCHEMA,
    inputSchema: objectSchema(
      {
        name: { type: "string" },
        slug: { type: "string" },
        profile: { type: "string" },
      },
      ["name"],
    ),
    handler: async (context, args) => {
      const name = requireString(args, "name");
      const slug = optionalString(args, "slug");
      const profile = optionalString(args, "profile");
      return context.client.request("POST", "/api/sites", {
        name,
        ...(slug === undefined ? {} : { slug }),
        ...(profile === undefined ? {} : { profile }),
      });
    },
  },
  {
    name: "duplicate_site",
    title: "Duplicate site",
    description:
      "Kopiert ein Projekt samt Theme; withContent (Default true) übernimmt Seiten, Artikel und Sammlungen, sonst nur Struktur und Design. name benennt die Kopie direkt um (sonst \"<Name> (Kopie)\"). Der Weg für ein Redesign: je Referenz eine Kopie, danach update_theme mit dem themePatch aus plan_redesign.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        name: { type: "string" },
        withContent: { type: "boolean" },
      },
      ["siteId"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const name = optionalString(args, "name");
      const withContent = optionalBoolean(args, "withContent");
      const created = (await context.client.request(
        "POST",
        `/api/sites/${siteId}/duplicate`,
        { withContent: withContent ?? true },
      )) as { id?: string };
      if (name === undefined || created.id === undefined) return created;
      // The copy is named "<Name> (Kopie)" by the store; the rename makes the
      // two redesign copies distinguishable in the project list.
      return context.client.request("PATCH", `/api/sites/${created.id}`, { name });
    },
  },
];
