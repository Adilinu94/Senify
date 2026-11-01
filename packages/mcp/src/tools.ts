// Die Werkzeug-Tabelle der MCP-Fassade: der Komponist der Fachmodule.
//
// Bis zum 23.10.2026 lag jedes Werkzeug in dieser Datei; seitdem wandert je
// ein Fachgebiet in sein Modul (R12, ADR-0019): Bibliothek, Medien,
// Referenzen, Veroeffentlichung/Betrieb, Komponenten, Stile, Mutationen,
// Seiten, Katalog, Theme, Doku, Import, Identitaet und Projekte. Hier bleiben
// nur die Typen des Vertrags und die Reihenfolge der Spreizungen. Sie IST der
// Vertrag: `server.ts` liest `TOOLS.map`, und der Manifest-Generator folgt den
// `...X_TOOLS`-Spreizungen. Ein Werkzeug verschieben heisst, seine Spreizung
// zu verschieben - der Manifest-Diff ist der Beweis, nicht die Zeilenzahl.

import type { EngineClient } from "./client.ts";
import { BIBLIOTHEK_TOOLS } from "./tools-bibliothek.ts";
import { DOCS_TOOLS } from "./tools-doku.ts";
import { IMPORT_TOOLS } from "./tools-import.ts";
import { SECTION_TOOLS } from "./tools-katalog.ts";
import { WIDGET_TOOLS } from "./tools-katalog.ts";
import { COMPONENT_TOOLS } from "./tools-komponenten.ts";
import { MEDIEN_TOOLS } from "./tools-medien.ts";
import { MUTATION_TOOLS } from "./tools-mutationen.ts";
import { REFERENZ_TOOLS } from "./tools-referenzen.ts";
import { RELEASE_TOOLS } from "./tools-release.ts";
import { PAGE_CREATE_TOOLS } from "./tools-seiten.ts";
import { PAGE_LIFECYCLE_TOOLS } from "./tools-seiten.ts";
import { PAGE_READ_TOOLS } from "./tools-seiten.ts";
import { SITE_TOOLS } from "./tools-sites.ts";
import { STYLE_TOOLS } from "./tools-stile.ts";
import { THEME_READ_TOOLS } from "./tools-theme.ts";
import { THEME_WRITE_TOOLS } from "./tools-theme.ts";

export type ToolScope = "read" | "write" | "publish";

// Elicitation (E4 slice 2): ask the client for a missing or ambiguous
// parameter. The server wires this only when the client declared the
// elicitation capability; declined or unsupported resolves to undefined and
// the tool's own validation error stands.
export type ElicitRequest = {
  message: string;
  fields: { name: string; description: string; required?: boolean }[];
};

export type ToolContext = {
  client: EngineClient;
  elicit?: (request: ElicitRequest) => Promise<Record<string, unknown> | undefined>;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  inputSchema: Record<string, unknown>;
  // The JSON Schema of what the handler returns (P3-3, R8). The reading tools
  // carry one, and so do the writes whose result has a fixed shape a client
  // needs (the new id of a site, page, preview, review or release). A write
  // whose result is only a confirmation that depends on which write it was has
  // none: a wrong schema there would be a lie the client believes. The
  // handler's return value must validate against it, otherwise
  // `structuredContent` would disagree with the text the client already parses.
  outputSchema?: Record<string, unknown>;
  entity?: (args: Record<string, unknown>, result: unknown) => string | undefined;
  handler: (
    context: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
};

export const TOOLS: ToolDefinition[] = [
  ...SITE_TOOLS,
  ...PAGE_READ_TOOLS,
  ...SECTION_TOOLS,
  ...THEME_READ_TOOLS,
  ...WIDGET_TOOLS,
  ...DOCS_TOOLS,
  ...MUTATION_TOOLS,
  ...COMPONENT_TOOLS,
  ...STYLE_TOOLS,
  ...PAGE_CREATE_TOOLS,
  ...THEME_WRITE_TOOLS,
  ...RELEASE_TOOLS,
  ...PAGE_LIFECYCLE_TOOLS,
  ...MEDIEN_TOOLS,
  ...REFERENZ_TOOLS,
  ...BIBLIOTHEK_TOOLS,
  ...IMPORT_TOOLS,
];

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}
