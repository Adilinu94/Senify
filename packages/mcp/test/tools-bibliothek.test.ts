import { describe, expect, it } from "vitest";
import { BIBLIOTHEK_TOOLS } from "../src/tools-bibliothek.ts";

// Die Bibliotheks-Werkzeuge (R12, Schritt 71).
//
// Sie standen bis zum 25.10.2026 in `tools.ts` und waren dort von den
// Workflow-Tests gedeckt. Nach dem Schnitt waren ihre Handler zu 26 Prozent
// gemessen: das neue Modul hatte keine Schwelle, und der Coverage-Waechter
// (`coverage-gate.test.ts`) hat genau das gemeldet. Dieser Test faehrt jeden
// Handler einmal und prueft die ANFRAGE, die er baut.
//
// Warum das nicht dasselbe ist wie "der Endpunkt funktioniert": der Endpunkt
// ist anderswo getestet. Hier steht die Uebersetzung - Argumente zu Pfad,
// Methode und Koerper. Ein Werkzeug, das den falschen Pfad baut, ist im
// Betrieb kaputt, auch wenn der Endpunkt stimmt.
//
// Der Client ist ein Doppel: er merkt sich den Aufruf und gibt ein leeres
// Ergebnis zurueck. Kein Netz, keine Datenbank.

type Aufruf = { method: string; path: string; body: unknown };

function werkzeug(name: string) {
  const tool = BIBLIOTHEK_TOOLS.find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`Werkzeug fehlt: ${name}`);
  return tool;
}

function lauf(name: string, args: Record<string, unknown> = {}) {
  const aufrufe: Aufruf[] = [];
  const context = {
    client: {
      request: async (method: string, path: string, body?: unknown) => {
        aufrufe.push({ method, path, body });
        return { ok: true };
      },
    },
  } as never;
  const tool = werkzeug(name);
  return {
    aufrufe,
    ergebnis: () => tool.handler(context, args as never),
  };
}

describe("Bibliotheks-Werkzeuge: die Uebersetzung", () => {
  it("fuehrt genau die zehn Werkzeuge der Bibliothek", () => {
    // Eine stille Loeschung beim Schnitt waere sonst nicht aufgefallen: das
    // Manifest haette sie gemeldet, diese Zahl haelt sie zusaetzlich fest.
    expect(BIBLIOTHEK_TOOLS.map((tool) => tool.name)).toEqual([
      "list_library_components",
      "get_library_component",
      "promote_to_library",
      "install_library_component",
      "uninstall_library_component",
      "update_library_component",
      "update_library_instances",
      "library_audit",
      "reattach_library_component",
      "find_similar_library_components",
    ]);
  });

  it("listet ohne Argumente", async () => {
    const { aufrufe, ergebnis } = lauf("list_library_components");
    await ergebnis();
    expect(aufrufe).toEqual([{ method: "GET", path: "/api/library-components", body: undefined }]);
  });

  it("liest einen Baustein ueber seine Kennung", async () => {
    const { aufrufe, ergebnis } = lauf("get_library_component", { componentId: "c1" });
    await ergebnis();
    expect(aufrufe[0]?.path).toBe("/api/library-components/c1");
  });

  it("befoerdert einen Baustein mit Definition, Fingerabdruck und Namen", async () => {
    const { aufrufe, ergebnis } = lauf("promote_to_library", {
      component: { rootNodeId: "a", nodes: {} },
      fingerprint: "abc",
      name: "Karte",
      tags: ["layout"],
    });
    await ergebnis();
    const body = aufrufe[0]?.body as Record<string, unknown>;
    expect(aufrufe[0]?.method).toBe("POST");
    // Die Definition geht als Objekt mit, nicht als String - sonst kaeme beim
    // Server ein Text an, wo ein Baum erwartet wird.
    expect(body.definition).toEqual({ rootNodeId: "a", nodes: {} });
    expect(body.fingerprint).toBe("abc");
    expect(body.tags).toEqual(["layout"]);
    expect(body.author).toEqual({ kind: "human", id: "mcp", label: "MCP" });
  });

  it("laesst optionale Felder weg, wenn sie fehlen", async () => {
    // Ein `license: undefined` im Koerper waere kein Fehler, aber es macht die
    // Anfrage uneindeutig - der Server kann "nicht gesetzt" nicht von
    // "ausdruecklich leer" unterscheiden.
    const { aufrufe, ergebnis } = lauf("promote_to_library", {
      component: {},
      fingerprint: "abc",
      name: "Karte",
    });
    await ergebnis();
    const body = aufrufe[0]?.body as Record<string, unknown>;
    expect("license" in body).toBe(false);
    expect("notes" in body).toBe(false);
    expect(body.tags).toEqual([]);
  });

  it("installiert einen Baustein in einer Site", async () => {
    const install = lauf("install_library_component", { siteId: "s1", componentId: "c1" });
    await install.ergebnis();
    expect(install.aufrufe[0]?.method).toBe("POST");
    expect(install.aufrufe[0]?.path).toBe("/api/sites/s1/library-installs");
    const body = install.aufrufe[0]?.body as Record<string, unknown>;
    expect(body.componentId).toBe("c1");
    // Ohne pageId wird nichts eingefuegt - das Feld darf nicht als
    // `undefined` im Koerper landen.
    expect("pageId" in body).toBe(false);
  });

  it("deinstalliert eine INSTALLATION, nicht den Baustein", async () => {
    // Die Adresse traegt die Installation: eine Site kann denselben Baustein
    // mehrfach installiert haben, und gemeint ist immer eine davon.
    const { aufrufe, ergebnis } = lauf("uninstall_library_component", {
      siteId: "s1",
      installId: "i1",
    });
    await ergebnis();
    expect(aufrufe[0]?.method).toBe("DELETE");
    expect(aufrufe[0]?.path).toBe("/api/sites/s1/library-installs/i1");
  });

  it("heftet eine geloeste Installation wieder an", async () => {
    const { aufrufe, ergebnis } = lauf("reattach_library_component", {
      siteId: "s1",
      componentId: "c1",
    });
    await ergebnis();
    expect(aufrufe[0]?.method).toBe("POST");
    expect(aufrufe[0]?.path).toBe("/api/sites/s1/library-installs/reattach");
  });

  it("aendert nur die Felder, die hereinkommen", async () => {
    const { aufrufe, ergebnis } = lauf("update_library_component", {
      componentId: "c1",
      name: "Neuer Name",
      deprecated: true,
    });
    await ergebnis();
    const body = aufrufe[0]?.body as Record<string, unknown>;
    expect(aufrufe[0]?.method).toBe("PATCH");
    expect(body.name).toBe("Neuer Name");
    expect(body.deprecated).toBe(true);
    // Nicht mitgeschickte Felder stehen nicht im Koerper: sonst setzte ein
    // Update alles andere auf leer.
    expect("tags" in body).toBe(false);
    expect("definition" in body).toBe(false);
  });

  it("zieht Instanzen nach", async () => {
    // Auch hier die INSTALLATION: nachgezogen wird eine Installation auf die
    // aktuelle Version des Bausteins.
    const { aufrufe, ergebnis } = lauf("update_library_instances", {
      siteId: "s1",
      installId: "i1",
    });
    await ergebnis();
    expect(aufrufe[0]?.method).toBe("POST");
    expect(aufrufe[0]?.path).toBe("/api/sites/s1/library-installs/i1/update");
  });

  it("liest Audit und Aehnlichkeit", async () => {
    const audit = lauf("library_audit");
    await audit.ergebnis();
    expect(audit.aufrufe[0]?.path).toBe("/api/library-components/audit");

    const similar = lauf("find_similar_library_components");
    await similar.ergebnis();
    expect(similar.aufrufe[0]?.path).toBe("/api/library-components/similar");
  });

  it("verlangt die Kennung, statt einen Pfad mit 'undefined' zu bauen", async () => {
    // Der teure Fehler: `/api/library-components/undefined` saehe aus wie eine
    // Anfrage und waere ein 404 statt einer klaren Meldung.
    const { ergebnis } = lauf("get_library_component");
    await expect(ergebnis()).rejects.toThrow(/componentId/);
  });

  it("verlangt die Site, wo ein Site-Pfad noetig ist", async () => {
    for (const name of [
      "install_library_component",
      "uninstall_library_component",
      "reattach_library_component",
      "update_library_instances",
    ]) {
      const { ergebnis } = lauf(name, {});
      await expect(ergebnis()).rejects.toThrow(/siteId/);
    }
  });

  it("nennt zu jedem Werkzeug seine Entitaet fuer das Audit", () => {
    // `entity` landet im MCP-Audit (`POST /api/mcp/audit`) und ist die Spur,
    // die ein Betreiber bei einem Vorfall liest: welcher Baustein, welche
    // Site, welche Installation. Ein leerer Wert waere dort ein Loch.
    //
    // Auch die reinen Lesewerkzeuge tragen eine: "wer hat die Bibliothek
    // gelesen" ist eine Frage, die ein Audit beantworten koennen muss.
    const faelle: [string, Record<string, unknown>, string][] = [
      ["list_library_components", {}, "library:global"],
      ["get_library_component", { componentId: "c1" }, "library:c1"],
      // Der Befoerderer kennt noch keine Kennung; die Spur ist der Name.
      ["promote_to_library", { name: "Karte" }, "library:Karte"],
      ["install_library_component", { siteId: "s1", componentId: "c1" }, "site:s1:library:c1"],
      ["uninstall_library_component", { siteId: "s1", installId: "i1" }, "site:s1:library-install:i1"],
      ["update_library_component", { componentId: "c1" }, "library:c1"],
      ["update_library_instances", { siteId: "s1", installId: "i1" }, "site:s1:library-install:i1"],
      ["library_audit", {}, "library:audit"],
      ["reattach_library_component", { siteId: "s1", componentId: "c1" }, "site:s1:library:c1"],
      ["find_similar_library_components", {}, "library:similar"],
    ];
    for (const [name, args, erwartet] of faelle) {
      const tool = werkzeug(name);
      expect(tool.entity?.(args as never, {})).toBe(erwartet);
    }
  });
});
