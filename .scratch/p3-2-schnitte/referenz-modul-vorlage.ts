// Die dreiundzwanzig Referenz-Werkzeuge: Analysieren, Sammeln, Zuweisen,
// Profil bearbeiten, Design-Vertrag lesen, Dokumente.
//
// Der Zuschnitt aus `tools.ts` (Schritt 71). Der Block war zusammenhaengend:
// `analyze_reference` bis `get_design_contract`, 945 Zeilen. `set_design_contract`
// blieb dort, weil es zum Design-Vertrag gehoert, nicht zur Referenz-Sammlung.
//
// **Warum diese Gruppe.** Die Werkzeuge teilen das Fachgebiet: eine Referenz
// wird analysiert, in Sammlungen gelegt, zugewiesen, in Revisionen gefuehrt und
// ueber Briefings und Dokumente beschrieben. Sie teilen keine lokalen Helfer
// untereinander (gemessen: 0 von 0 auf oberster Ebene); ihre 17 gemeinsamen
// Aufrufe (`objectSchema`, `requireString`, `optionalString`, `SenifyError` …)
// kommen aus `tools-support.ts` und `tools-schemas.ts` - also aus Modulen, die
// es schon gibt.
//
// **Die Reihenfolge bleibt Vertrag.** `server.ts` gibt `TOOLS.map(...)` an den
// Client, und der Manifest-Generator folgt den Spreizungen. Deshalb ersetzt
// `...REFERENZ_TOOLS,` in `tools.ts` den Block an GENAU derselben Stelle -
// zwischen den Medien-Werkzeugen und `set_design_contract`.

import { SenifyError } from "@senify/core";
import type { ToolDefinition } from "./types.ts";
import {
  objectSchema,
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireArray,
  requireRecord,
  requireString,
  tokenName,
} from "./tools-support.ts";

export const REFERENZ_TOOLS: ToolDefinition[] = [
  {
    name: "analyze_reference",
    title: "Analyze reference",
    description:
      "Starts the full design analysis of a reference URL: capture → deterministic extraction (frequency-ranked tokens, typography, radii, shadows), optional motion measurement, and an optional vision model (BYOK) for DNA statements. Runs in the background; the analysis job reports progress.",
    scope: "write",
    inputSchema: objectSchema(
      {
        siteId: { type: "string" },
        url: { type: "string" },
        kind: { type: "string", enum: ["website", "image", "document"] },
        mode: { type: "string", enum: ["dna", "fidelity"] },
        motion: { type: "boolean" },
        vision: { type: "boolean" },
        outDir: { type: "string" },
      },
      ["siteId", "url"],
    ),
    entity: (args) => `site:${String(args.siteId ?? "")}`,
    handler: async (context, args) => {
      const body: Record<string, unknown> = {
        url: requireString(args, "url"),
      };
      for (const [key, value] of Object.entries({
        kind: optionalString(args, "kind"),
        mode: optionalString(args, "mode"),
        motion: optionalBoolean(args, "motion"),
        vision: optionalBoolean(args, "vision"),
        outDir: optionalString(args, "outDir"),
      })) {
        if (value !== undefined) body[key] = value;
      }
      return context.client.request("POST", `/api/sites/${requireString(args, "siteId")}/references`, body);
    },
  },
];
