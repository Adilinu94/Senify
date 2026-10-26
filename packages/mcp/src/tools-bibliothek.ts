// Die Bibliotheks-Werkzeuge der MCP-Fassade (R12, Schritt 71).
//
// Die acht Werkzeuge standen in `tools.ts` und sind dort zusammenhaengend:
// Liste, Einzelnes, Befoerdern, Installieren, Deinstallieren, Aendern,
// Instanzen nachziehen, Audit, Wiederanheften und Aehnlichkeit. Sie teilen
// das Thema "geteilte Bausteine" und brauchen nur die Schema-Helfer.
//
// Die REIHENFOLGE ist der Vertrag: `server.ts` gibt `TOOLS.map(...)` an den
// Client, und der Manifest-Generator folgt den Spreizungen in `tools.ts`.
// Der Block steht deshalb im neuen Modul in derselben Folge, und `tools.ts`
// setzt ihn an derselben Stelle ein.

import type { ToolDefinition } from "./tools.ts";
import { objectSchema, requireRecord, requireString } from "./tools-support.ts";

/** Die Werkzeuge der geteilten Bausteinbibliothek. */
export const BIBLIOTHEK_TOOLS: ToolDefinition[] = [
  {
    name: "list_library_components",
    title: "List library components",
    description: "Lists reusable global component definitions with name, kind, version, fingerprint, tags, provenance, license and deprecation state.",
    scope: "read",
    inputSchema: objectSchema({}),
    entity: () => "library:global",
    handler: async (context) => context.client.request("GET", "/api/library-components"),
  },
  {
    name: "get_library_component",
    title: "Get library component",
    description: "Reads one reusable component definition, including its NodeTree structure, variants through props, slots, fingerprint, provenance and license status.",
    scope: "read",
    inputSchema: objectSchema({ componentId: { type: "string" } }, ["componentId"]),
    entity: (args) => `library:${String(args.componentId ?? "")}`,
    handler: async (context, args) => context.client.request("GET", `/api/library-components/${requireString(args, "componentId")}`),
  },
  {
    name: "promote_to_library",
    title: "Promote component to library",
    description: "Promotes a normalized component candidate into the global reusable library. Fingerprints deduplicate; imported foreign code with an unknown license is rejected by the engine policy.",
    scope: "write",
    inputSchema: objectSchema({ component: { type: "object" }, fingerprint: { type: "string" }, name: { type: "string" }, tags: { type: "array", items: { type: "string" } }, license: { type: "object" }, notes: { type: "string" } }, ["component", "fingerprint", "name"]),
    entity: (args) => `library:${String(args.name ?? "")}`,
    handler: async (context, args) => context.client.request("POST", "/api/library-components", { name: requireString(args, "name"), kind: "component", definition: requireRecord(args, "component"), fingerprint: requireString(args, "fingerprint"), tags: Array.isArray(args.tags) ? args.tags : [], ...(args.license === undefined ? {} : { license: args.license }), ...(args.notes === undefined ? {} : { notes: args.notes }), author: { kind: "human", id: "mcp", label: "MCP" } }),
  },
  {
    name: "install_library_component",
    title: "Install library component",
    description: "Installs a reusable component into a site and optionally inserts a real component instance into a target page.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" }, componentId: { type: "string" }, pageId: { type: "string" }, parentNodeId: { type: "string" }, mode: { type: "string", enum: ["linked", "copied"] } }, ["siteId", "componentId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}:library:${String(args.componentId ?? "")}`,
    handler: async (context, args) => context.client.request("POST", `/api/sites/${requireString(args, "siteId")}/library-installs`, { componentId: requireString(args, "componentId"), ...(args.pageId === undefined ? {} : { pageId: args.pageId }), ...(args.parentNodeId === undefined ? {} : { parentNodeId: args.parentNodeId }), ...(args.mode === undefined ? {} : { mode: args.mode }), author: { kind: "human", id: "mcp", label: "MCP" } }),
  },
  {
    name: "uninstall_library_component",
    title: "Uninstall library component",
    description: "Detaches a site installation without data loss: installed instances become local definitions marked with their library provenance before the installation row is removed.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" }, installId: { type: "string" } }, ["siteId", "installId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}:library-install:${String(args.installId ?? "")}`,
    handler: async (context, args) => context.client.request("DELETE", `/api/sites/${requireString(args, "siteId")}/library-installs/${requireString(args, "installId")}`, { author: { kind: "human", id: "mcp", label: "MCP" } }),
  },
  {
    name: "update_library_component",
    title: "Update library component",
    description:
      "Aendert einen Bibliothekseintrag: Name, Tags, Notiz, Lizenz, Deprecation - und optional die Definition. NUR die Definition erhoeht die Version (die Version zaehlt Definitionen, nicht Metadaten): eine Aenderung an der Definition erzeugt damit erst den Drift, den die installierten Seiten mit update_library_instances nachziehen. Der Fingerabdruck folgt der Definition und ist der Dubletten-Schluessel.",
    scope: "write",
    inputSchema: objectSchema({ componentId: { type: "string" }, name: { type: "string" }, tags: { type: "array", items: { type: "string" } }, notes: { type: "string" }, license: { type: "object" }, deprecated: { type: "boolean" }, definition: { type: "object" } }, ["componentId"]),
    entity: (args) => `library:${String(args.componentId ?? "")}`,
    handler: async (context, args) => {
      const body: Record<string, unknown> = { author: { kind: "human", id: "mcp", label: "MCP" } };
      if (args.name !== undefined) body["name"] = requireString(args, "name");
      if (args.tags !== undefined) body["tags"] = Array.isArray(args.tags) ? args.tags : [];
      if (args.notes !== undefined) body["notes"] = requireString(args, "notes");
      if (args.license !== undefined) body["license"] = requireRecord(args, "license");
      if (args.deprecated !== undefined) body["deprecated"] = args.deprecated === true;
      if (args.definition !== undefined) body["definition"] = requireRecord(args, "definition");
      return context.client.request("PATCH", `/api/library-components/${requireString(args, "componentId")}`, body);
    },
  },
  {
    name: "update_library_instances",
    title: "Update library instances",
    description: "Moves a site installation to the current global component version. Existing instance override bags remain addressed by stable part ids.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" }, installId: { type: "string" } }, ["siteId", "installId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}:library-install:${String(args.installId ?? "")}`,
    handler: async (context, args) => context.client.request("POST", `/api/sites/${requireString(args, "siteId")}/library-installs/${requireString(args, "installId")}/update`, { author: { kind: "human", id: "mcp", label: "MCP" } }),
  },
  {
    name: "library_audit",
    title: "Library audit",
    description: "Reads the global library audit trail: creates, updates, installs, version updates and detaches with author and timestamp.",
    scope: "read",
    inputSchema: objectSchema({}),
    entity: () => "library:audit",
    handler: async (context) => context.client.request("GET", "/api/library-components/audit"),
  },
  {
    name: "reattach_library_component",
    title: "Re-attach library component",
    description:
      "Haengt eine geloeste Installation wieder an die Bibliothek: die lokalen Knoten bleiben stehen (Ueberschreibungen bleiben erhalten), die Bindung an den Bibliothekseintrag kommt zurueck und die Installationszeile wird wieder angelegt. Das Gegenstueck zu uninstall_library_component.",
    scope: "write",
    inputSchema: objectSchema({ siteId: { type: "string" }, componentId: { type: "string" } }, ["siteId", "componentId"]),
    entity: (args) => `site:${String(args.siteId ?? "")}:library:${String(args.componentId ?? "")}`,
    handler: async (context, args) => context.client.request("POST", `/api/sites/${requireString(args, "siteId")}/library-installs/reattach`, { componentId: requireString(args, "componentId"), author: { kind: "human", id: "mcp", label: "MCP" } }),
  },
  {
    name: "find_similar_library_components",
    title: "Find similar library components",
    description:
      "Findet Bausteine, deren Definitionen strukturell ahnlich sind (ab 85 Prozent Aehnlichkeit der Knotenform). Rein lesend - ein Hinweis, kein Urteil: das Zusammenlegen entscheidet der Mensch.",
    scope: "read",
    inputSchema: objectSchema({}),
    entity: () => "library:similar",
    handler: async (context) => context.client.request("GET", "/api/library-components/similar"),
  },
];
