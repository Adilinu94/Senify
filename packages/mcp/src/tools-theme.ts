// Das Theme (R12-Schnitt): die Design-Token einer Site lesen und schreiben.
//
// Zwei Werkzeuge, zwei Stellen in `tools.ts`: `get_theme` steht zwischen den
// Abschnitten und den Bausteinen, `update_theme` nach dem Seiten-Lebenszyklus.
// Der Gegenstand ist einer - der Entwurfsvertrag einer Site -, deshalb ein
// Modul mit zwei Spreizungen; die Manifest-Reihenfolge bleibt unveraendert.

import { objectSchema, requireRecord, requireString } from "./tools-support.ts";
import type { ToolDefinition } from "./tools.ts";

/** Das Theme lesen. */
export const THEME_READ_TOOLS: ToolDefinition[] = [
  {
    name: "get_theme",
    title: "Get theme",
    description:
      "Returns the design tokens of a site (primitives, semantic roles, modes, fonts, motion). Use token roles in style props instead of raw values.",
    scope: "read",
    inputSchema: objectSchema({ siteId: { type: "string" } }, ["siteId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) =>
      context.client.request(
        "GET",
        `/api/sites/${requireString(args, "siteId")}/theme`,
      ),
  },
];

/** Das Theme schreiben. */
export const THEME_WRITE_TOOLS: ToolDefinition[] = [
  {
    name: "update_theme",
    title: "Update theme",
    description:
      "Patches the theme of a site (scales, semantic roles, fonts, motion) and records the change in the audit log. Send only the branches you change.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        theme: { type: "object" },
      },
      ["siteId", "theme"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const siteId = requireString(args, "siteId");
      const name = await context.client.tokenName();
      return context.client.request("PUT", `/api/sites/${siteId}/theme`, {
        theme: requireRecord(args, "theme"),
        author: { kind: "agent", id: name, label: name },
      });
    },
  },
];
