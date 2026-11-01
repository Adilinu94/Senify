// Der lesende Client zum Unframer-MCP (ADR-0028): die zweite Import-Quelle
// fuer Projektstruktur. Er kennt genau vier Werkzeuge - die vier lesenden.
// Die schreibenden Werkzeuge des MCP (`updateXmlForNode`, `createPage`,
// `deleteNode`) erreicht kein Aufrufer ueber diesen Client; ein Import
// veraendert das fremde Projekt nie.
//
// Der Transport ist injizierbar (dasselbe Muster wie der Capturer in
// `import.ts`): produktiv spricht er mit dem Framer-Plugin, in Tests liefert
// er Fixtures. Damit ist der Client ohne laufendes Framer pruefbar - und der
// Fehlerfall ohne kaputtes Plugin. Es gibt keinen stillen Rueckfall: ein
// fehlgeschlagener Lesevorgang ist ein Fehler, kein halbes Dokument.

import { SenifyError } from "@senify/core";

export const UNFRAMER_READ_TOOLS = [
  "getProjectXml",
  "getNodeXml",
  "getCMSCollections",
  "readCodeFile",
] as const;

export type UnframerReadTool = (typeof UNFRAMER_READ_TOOLS)[number];

export type UnframerRequest = {
  tool: UnframerReadTool;
  // Die semantischen Argumente. Ein produktiver Transport uebersetzt sie in
  // die Namen des MCP; `getProjectXml` und `getCMSCollections` arbeiten auf
  // dem geoeffneten Projekt und tragen keine.
  args: Record<string, unknown>;
};

export type UnframerTransport = (request: UnframerRequest) => Promise<unknown>;

export type UnframerUsage = "private" | "customer";

export type UnframerClientInput = {
  transport: UnframerTransport;
  // ADR-0028: Bis die Lizenz des Unframer-MCP schriftlich geklaert ist, ist
  // der Pfad auf private Nutzung beschraenkt. Die Angabe ist Pflicht, damit
  // "privat" eine Entscheidung des Aufrufers ist und kein stiller Standard.
  usage: UnframerUsage;
};

export type UnframerClient = {
  projectXml(): Promise<string>;
  nodeXml(nodeId: string): Promise<string>;
  // Die Antwort unveraendert als Text: im gemessenen Projekt war es nur die
  // Format-Doku, weil es keine Sammlungen gab. Was darin steht, entscheidet
  // erst das CMS-Mapping (Block 4).
  cmsCollections(): Promise<string>;
  codeFile(path: string): Promise<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Das MCP liefert Text in einem Umschlag (`content: [{ type: "text", … }]`);
// ein Transport darf ihn schon ausgepackt haben. Mehrere Text-Teile werden
// verbunden - das MCP zerlegt lange XML-Antworten nicht, aber ein Adapter
// koennte.
function textOf(result: unknown, tool: UnframerReadTool): string {
  if (typeof result === "string") return result;
  if (isRecord(result) && Array.isArray(result.content)) {
    const parts: string[] = [];
    for (const part of result.content) {
      if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  throw new SenifyError(
    "validation",
    `${tool} lieferte keine Textantwort`,
    {
      field: "unframer",
      suggestion:
        "Der Transport muss den MCP-Text liefern (String oder { content: [{ type: \"text\", text }] }).",
    },
  );
}

function requireXml(text: string, tool: UnframerReadTool): string {
  if (text.trim() === "" || !text.trimStart().startsWith("<")) {
    const start = text.trim().slice(0, 80);
    throw new SenifyError("validation", `${tool} lieferte kein XML`, {
      field: "unframer",
      suggestion:
        `Erwartet wird ein XML-Dokument. Die Antwort beginnt mit ${JSON.stringify(start)}.`,
    });
  }
  return text;
}

function requireArgument(
  value: string,
  field: "nodeId" | "path",
): string {
  if (value.trim() === "") {
    throw new SenifyError("validation", `"${field}" fehlt`, {
      field,
      suggestion:
        field === "nodeId"
          ? "Die nodeId steht im Projekt-XML (getProjectXml)."
          : "Der Pfad kommt aus der Anleitung des MCP zu Code-Dateien.",
    });
  }
  return value;
}

export function createUnframerClient(input: UnframerClientInput): UnframerClient {
  if (input.usage === "customer") {
    throw new SenifyError(
      "guardrail",
      "Der Unframer-Pfad ist fuer Kundenarbeit gesperrt (ADR-0028)",
      {
        field: "usage",
        suggestion:
          "Nur private Nutzung, bis die Lizenz des Unframer-MCP schriftlich geklaert ist; das npm-Manifest traegt kein license-Feld.",
      },
    );
  }

  async function read(
    tool: UnframerReadTool,
    args: Record<string, unknown>,
  ): Promise<string> {
    let result: unknown;
    try {
      result = await input.transport({ tool, args });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new SenifyError(
        "not_found",
        `Der Unframer-MCP antwortet nicht (${tool}): ${cause}`,
        {
          field: "unframer",
          suggestion:
            "Framer mit dem Unframer-Plugin oeffnen - das MCP antwortet nur, solange Framer laeuft - und erneut versuchen.",
        },
      );
    }
    return textOf(result, tool);
  }

  return {
    projectXml: async () => requireXml(await read("getProjectXml", {}), "getProjectXml"),
    nodeXml: async (nodeId) =>
      requireXml(
        await read("getNodeXml", { nodeId: requireArgument(nodeId, "nodeId") }),
        "getNodeXml",
      ),
    cmsCollections: async () => read("getCMSCollections", {}),
    codeFile: async (path) =>
      read("readCodeFile", { path: requireArgument(path, "path") }),
  };
}
