import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UNFRAMER_READ_TOOLS,
  createUnframerClient,
  type UnframerClientInput,
  type UnframerRequest,
} from "@senify/framer-import";
import { SenifyError } from "@senify/core";

// Der lesende Client zum Unframer-MCP (R12-Strecke zu ADR-0028, Schritt 1).
//
// Ohne laufendes Framer: der Transport ist ein Doppel, das den Aufruf merkt
// und eine Fixture oder einen Fehler liefert. Die Fixtures unter
// `fixtures/unframer/` tragen die gemessenen Attributnamen (14.09./21.10.2026),
// keine Rohdatei - der Client-Vertrag haengt an den vier Werkzeugen, nicht am
// vollstaendigen XML.
//
// Was hier bewiesen wird und warum es zaehlt:
// - Die Werkzeugliste ist GESCHLOSSEN: die schreibenden Werkzeuge des MCP
//   (`updateXmlForNode`, `createPage`, `deleteNode`) erreicht niemand ueber
//   diesen Client. Ein Import veraendert das fremde Projekt nie.
// - Jeder Leseweg prueft seine Antwort. Ein leeres XML ist ein Fehler, kein
//   halbes Dokument; ein stummer Transport ist ein Fehler, kein Rueckfall.
// - Die Lizenz ist eine Betriebsbedingung: Kundenarbeit wird gesperrt, bevor
//   der Transport ueberhaupt gefragt wird.

const FIXTURES = join(fileURLToPath(new URL("./fixtures/unframer", import.meta.url)));
const PROJECT_XML = readFileSync(join(FIXTURES, "project.xml"), "utf8");
const PAGE_XML = readFileSync(join(FIXTURES, "page-home.xml"), "utf8");

type Aufruf = UnframerRequest;

function client(
  antwort: unknown | ((request: UnframerRequest) => Promise<unknown>),
  optionen: { usage?: UnframerClientInput["usage"] } = {},
) {
  const aufrufe: Aufruf[] = [];
  const transport = async (request: UnframerRequest) => {
    aufrufe.push(request);
    if (typeof antwort === "function") return antwort(request);
    return antwort;
  };
  return {
    aufrufe,
    client: createUnframerClient({ transport, usage: optionen.usage ?? "private" }),
  };
}

function ablehnung(promise: Promise<unknown>): Promise<SenifyError> {
  return promise.then(
    () => {
      throw new Error("Erwartet wurde ein Fehler, der Aufruf war gruen.");
    },
    (error: unknown) => {
      if (!(error instanceof SenifyError)) throw error;
      return error;
    },
  );
}

describe("Unframer-Client: nur lesen, nie schreiben", () => {
  it("fuehrt genau die vier lesenden Werkzeuge", () => {
    // Ein gewachsenes MCP bietet 23 Werkzeuge, darunter schreibende. Diese
    // Liste ist der Zaun: was nicht hier steht, ruft der Client nicht.
    expect([...UNFRAMER_READ_TOOLS]).toEqual([
      "getProjectXml",
      "getNodeXml",
      "getCMSCollections",
      "readCodeFile",
    ]);
  });
});

describe("Unframer-Client: die Uebersetzung", () => {
  it("liest das Projekt-XML ohne Argumente", async () => {
    const { aufrufe, client: unframer } = client(PROJECT_XML);
    await expect(unframer.projectXml()).resolves.toContain("<Pages>");
    expect(aufrufe).toEqual([{ tool: "getProjectXml", args: {} }]);
  });

  it("reicht die nodeId an getNodeXml weiter", async () => {
    const { aufrufe, client: unframer } = client(PAGE_XML);
    const xml = await unframer.nodeXml("page-home");
    expect(xml).toContain('nodeId="page-home"');
    expect(aufrufe).toEqual([{ tool: "getNodeXml", args: { nodeId: "page-home" } }]);
  });

  it("liest die CMS-Antwort unveraendert", async () => {
    // Im gemessenen Projekt war das nur die Format-Doku; der Client deutet
    // nichts, was er nicht kennt.
    const { aufrufe, client: unframer } = client("CMS format documentation");
    await expect(unframer.cmsCollections()).resolves.toBe("CMS format documentation");
    expect(aufrufe).toEqual([{ tool: "getCMSCollections", args: {} }]);
  });

  it("reicht den Pfad an readCodeFile weiter", async () => {
    const { aufrufe, client: unframer } = client("export default function Counter() {}");
    await expect(unframer.codeFile("components/Counter.tsx")).resolves.toContain("Counter");
    expect(aufrufe).toEqual([
      { tool: "readCodeFile", args: { path: "components/Counter.tsx" } },
    ]);
  });

  it("packt den MCP-Text-Umschlag aus und verbindet mehrere Teile", async () => {
    const { client: unframer } = client({
      content: [
        { type: "text", text: "<Project>" },
        { type: "text", text: "</Project>" },
      ],
    });
    await expect(unframer.projectXml()).resolves.toBe("<Project>\n</Project>");
  });
});

describe("Unframer-Client: Fehler sind Fehler, kein Rueckfall", () => {
  it("verlangt die nodeId, statt 'undefined' ans MCP zu schicken", async () => {
    const { aufrufe, client: unframer } = client(PAGE_XML);
    const fehler = await ablehnung(unframer.nodeXml("  "));
    expect(fehler.category).toBe("validation");
    expect(fehler.field).toBe("nodeId");
    expect(aufrufe).toHaveLength(0);
  });

  it("verlangt den Pfad einer Code-Datei", async () => {
    const { aufrufe, client: unframer } = client("x");
    const fehler = await ablehnung(unframer.codeFile(""));
    expect(fehler.field).toBe("path");
    expect(aufrufe).toHaveLength(0);
  });

  it("meldet einen stummen Transport mit Werkzeugnamen und Hinweis", async () => {
    // Framer zu - das MCP antwortet nicht. Der Fehler nennt das Werkzeug und
    // den Ausweg; ein Rueckfall auf den URL-Weg waere ein anderes Dokument.
    const { aufrufe, client: unframer } = client(async () => {
      throw new Error("MCP server not connected");
    });
    const fehler = await ablehnung(unframer.projectXml());
    expect(fehler.category).toBe("not_found");
    expect(fehler.message).toContain("getProjectXml");
    expect(fehler.message).toContain("MCP server not connected");
    expect(fehler.suggestion).toMatch(/Framer/);
    expect(aufrufe).toEqual([{ tool: "getProjectXml", args: {} }]);
  });

  it("lehnt eine Antwort ab, die kein XML ist", async () => {
    const { client: unframer } = client("Der Knoten ist kein Textknoten");
    const fehler = await ablehnung(unframer.nodeXml("comp-pricing"));
    expect(fehler.category).toBe("validation");
    expect(fehler.message).toBe("getNodeXml lieferte kein XML");
  });

  it("lehnt ein leeres XML ab", async () => {
    const { client: unframer } = client("   \n  ");
    await expect(ablehnung(unframer.projectXml())).resolves.toMatchObject({
      category: "validation",
    });
  });

  it("lehnt eine Antwort ohne Text ab", async () => {
    const { client: unframer } = client({ content: [{ type: "image", data: "…" }] });
    const fehler = await ablehnung(unframer.cmsCollections());
    expect(fehler.category).toBe("validation");
    expect(fehler.message).toContain("keine Textantwort");
  });
});

describe("Unframer-Client: die Lizenz ist eine Betriebsbedingung", () => {
  it("sperrt Kundenarbeit, bevor ein Werkzeug laeuft", () => {
    // ADR-0028: nur private Nutzung, bis die Lizenz schriftlich geklaert ist.
    // Die Sperre sitzt am Client, weil dort der Anschluss entsteht.
    let gefragt = false;
    expect(() =>
      createUnframerClient({
        usage: "customer",
        transport: async () => {
          gefragt = true;
          return PROJECT_XML;
        },
      }),
    ).toThrow(/Kundenarbeit gesperrt/);
    expect(gefragt).toBe(false);

    try {
      createUnframerClient({ usage: "customer", transport: async () => PROJECT_XML });
    } catch (error) {
      expect(error).toBeInstanceOf(SenifyError);
      expect((error as SenifyError).category).toBe("guardrail");
      expect((error as SenifyError).suggestion).toMatch(/license/);
    }
  });
});
