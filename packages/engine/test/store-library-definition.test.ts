// Das Zusammenfuehren einer Bibliotheksdefinition mit der lokalen Definition
// im Draft.
//
// Der Vertrag (Plan §5.1, Schritt 4): das Update zieht die Instanzen in EINEM
// Schritt nach, und die Ueberschreibungen ueberleben es. Die Ueberschreibungen
// sind ueber die Teil-IDs adressiert - also muss die lokale Definition ihre
// IDs behalten. Nur wirklich neue Teile bekommen neue IDs.
//
// Diese Tests decken die Faelle ab, die das Update vom Nicht-Update
// unterscheiden: geaenderter Text, neue Teile, weggefallene Teile, Slots und
// die Kopie (mode `copied`), die nicht angefasst wird.
import { describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import {
  mergeLibraryDefinition,
  type DefinitionMergeOptions,
} from "../src/store-library-definition.ts";

function optionen(overrides: Partial<DefinitionMergeOptions> = {}): DefinitionMergeOptions {
  let naechste = 0;
  return {
    version: 2,
    name: "Karte",
    libraryComponentId: "lib-1",
    origin: "linked",
    newId: () => `neu${(naechste += 1)}`,
    ...overrides,
  };
}

// Die lokale Definition im Draft: eine Definition mit einem Kind, das eine
// Ueberschreibung traegt.
function lokalerDraft(): { tree: NodeTree; definitionId: string; teilId: string } {
  const tree: NodeTree = {
    rootNodeId: "wurzel",
    nodes: {
      wurzel: { id: "wurzel", type: "page", props: {}, children: ["def"] },
      def: {
        id: "def",
        type: "__component",
        props: { name: "Karte", version: 1, libraryComponentId: "lib-1", libraryOrigin: "linked" },
        children: ["teil"],
      },
      teil: { id: "teil", type: "card", props: { headline: "Alter Text", name: "Karte", version: 1 } },
    },
  };
  return { tree, definitionId: "def", teilId: "teil" };
}

describe("mergeLibraryDefinition", () => {
  it("holt den neuen Text in die Seite und behaelt die Teil-IDs", () => {
    const { tree, definitionId, teilId } = lokalerDraft();
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["teil"] },
        teil: { id: "teil", type: "card", props: { headline: "Neuer Text" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, definitionId, bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    // Der Text ist der der Bibliothek.
    expect(tree.nodes[teilId]!.props["headline"]).toBe("Neuer Text");
    // Die Teil-ID ist dieselbe: eine Ueberschreibung, die auf sie zeigt,
    // bleibt gueltig.
    expect(tree.nodes[teilId]!.id).toBe("teil");
    // Und die Marker der Bibliotheksbindung stehen am Knoten.
    expect(tree.nodes[teilId]!.props["libraryComponentId"]).toBe("lib-1");
    expect(tree.nodes[teilId]!.props["version"]).toBe(2);
  });

  it("gibt einem neuen Teil eine neue ID", () => {
    const { tree, definitionId } = lokalerDraft();
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["teil", "zweiter"] },
        teil: { id: "teil", type: "card", props: { headline: "Text" } },
        zweiter: { id: "zweiter", type: "card", props: { headline: "Zweiter Teil" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, definitionId, bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    const kinder = tree.nodes[definitionId]!.children ?? [];
    expect(kinder).toHaveLength(2);
    // Der zweite Teil ist neu und hat eine eigene ID bekommen.
    const neuer = kinder[1] as string;
    expect(neuer).toBe("neu1");
    expect(tree.nodes[neuer]!.props["headline"]).toBe("Zweiter Teil");
  });

  it("meldet einen Teil, den es in der Bibliothek nicht mehr gibt", () => {
    const { tree, definitionId } = lokalerDraft();
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: [] },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, definitionId, bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    // Der weggefallene Teil wird gemeldet - seine Ueberschreibung (falls es
    // eine gibt) bleibt im Beutel, aber sie gehoert zu keinem Teil mehr.
    expect(ergebnis.droppedPartIds).toEqual(["teil"]);
    expect(tree.nodes["teil"]).toBeUndefined();
  });

  it("ordnet die Slots nach Namen zu", () => {
    const tree: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "page", props: {}, children: ["def"] },
        def: {
          id: "def",
          type: "__component",
          props: { name: "Karte", version: 1, libraryComponentId: "lib-1", libraryOrigin: "linked" },
          children: ["kopf"],
          slots: { inhalt: ["alt"] },
        },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        alt: { id: "alt", type: "body", props: { html: "Alter Inhalt" } },
      },
    };
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["kopf"], slots: { inhalt: ["neuinhalt"] } },
        kopf: { id: "kopf", type: "heading", props: { text: "Neuer Kopf" } },
        neuinhalt: { id: "neuinhalt", type: "body", props: { html: "Neuer Inhalt" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, "def", bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    // Der Slot-Inhalt folgt der Bibliothek. Seine ID bleibt dieselbe - so
    // bleibt eine Ueberschreibung, die auf sie zeigt, gueltig.
    const slot = tree.nodes["def"]!.slots?.["inhalt"] ?? [];
    expect(slot).toHaveLength(1);
    expect(tree.nodes[slot[0] as string]!.props["html"]).toBe("Neuer Inhalt");
    expect(slot[0]).toBe("alt");
  });

  it("fuellt einen Slot, den die Seite noch nicht hatte", () => {
    // Die Bibliothek hat den Slot "inhalt" belegt, die Seite nicht: der Slot
    // bekommt den Inhalt der Bibliothek - als neue Node, mit neuer ID.
    const tree: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "page", props: {}, children: ["def"] },
        def: {
          id: "def",
          type: "__component",
          props: { name: "Karte", version: 1, libraryComponentId: "lib-1", libraryOrigin: "linked" },
          children: ["kopf"],
        },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
      },
    };
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["kopf"], slots: { inhalt: ["bibliothek"] } },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        bibliothek: { id: "bibliothek", type: "body", props: { html: "Aus der Bibliothek" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, "def", bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    const slot = tree.nodes["def"]!.slots?.["inhalt"] ?? [];
    expect(slot).toHaveLength(1);
    expect(tree.nodes[slot[0] as string]!.props["html"]).toBe("Aus der Bibliothek");
    // Eine neue Node - es gab keine alte, die man behaetten koennte.
    expect(slot[0]).toBe("neu1");
  });

  it("meldet einen Slot-Inhalt, den es in der Bibliothek nicht mehr gibt", () => {
    const tree: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "page", props: {}, children: ["def"] },
        def: {
          id: "def",
          type: "__component",
          props: { name: "Karte", version: 1, libraryComponentId: "lib-1", libraryOrigin: "linked" },
          children: ["kopf"],
          slots: { inhalt: ["alt"], fuss: ["fuss"] },
        },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        alt: { id: "alt", type: "body", props: { html: "Inhalt" } },
        fuss: { id: "fuss", type: "body", props: { html: "Fuss" } },
      },
    };
    // Die Bibliothek kennt den Slot "fuss" nicht mehr.
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["kopf"], slots: { inhalt: ["neuinhalt"] } },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        neuinhalt: { id: "neuinhalt", type: "body", props: { html: "Inhalt" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, "def", bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    // Der weggefallene Slot-Inhalt wird gemeldet und entfernt - nicht still
    //schlucken.
    expect(ergebnis.droppedPartIds).toContain("fuss");
    expect(tree.nodes["fuss"]).toBeUndefined();
  });

  it("meldet einen Slot-Inhalt, den die Bibliothek an dieser Stelle nicht mehr hat", () => {
    // Die Bibliothek hat den Slot "inhalt" mit EINEM Eintrag, die Seite mit
    // ZWEI. Der zweite gehoert nicht mehr in den Slot - er wird gemeldet und
    // entfernt, statt als Waise im Draft zu bleiben.
    const tree: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "page", props: {}, children: ["def"] },
        def: {
          id: "def",
          type: "__component",
          props: { name: "Karte", version: 1, libraryComponentId: "lib-1", libraryOrigin: "linked" },
          children: ["kopf"],
          slots: { inhalt: ["erst", "zweit"] },
        },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        erst: { id: "erst", type: "body", props: { html: "Erster" } },
        zweit: { id: "zweit", type: "body", props: { html: "Zweiter" } },
      },
    };
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["kopf"], slots: { inhalt: ["bibliothek"] } },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        bibliothek: { id: "bibliothek", type: "body", props: { html: "Aus der Bibliothek" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, "def", bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    // Der Slot hat jetzt genau einen Inhalt - den der Bibliothek.
    const slot = tree.nodes["def"]!.slots?.["inhalt"] ?? [];
    expect(slot).toHaveLength(1);
    expect(tree.nodes[slot[0] as string]!.props["html"]).toBe("Aus der Bibliothek");
    // Der ueberzaehlige Eintrag ist gemeldet und entfernt.
    expect(ergebnis.droppedPartIds).toContain("zweit");
    expect(tree.nodes["zweit"]).toBeUndefined();
  });

  it("meldet einen Slot-Inhalt, dessen Knoten es im Draft nicht mehr gibt", () => {
    // Die Seite zeigt auf einen Slot-Inhalt, dessen Knoten fehlt (der Draft
    // wurde zwischenzeitlich von Hand bearbeitet). Der Slot bekommt den
    // Inhalt der Bibliothek - und der Eintrag, auf den der Slot zeigte, wird
    // gemeldet, weil der Slot nicht mehr auf ihn zeigt.
    const tree: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "page", props: {}, children: ["def"] },
        def: {
          id: "def",
          type: "__component",
          props: { name: "Karte", version: 1, libraryComponentId: "lib-1", libraryOrigin: "linked" },
          children: ["kopf"],
          slots: { inhalt: ["weg"] },
        },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        // "weg" ist im Draft nicht (mehr) vorhanden.
      },
    };
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["kopf"], slots: { inhalt: ["bibliothek"] } },
        kopf: { id: "kopf", type: "heading", props: { text: "Kopf" } },
        bibliothek: { id: "bibliothek", type: "body", props: { html: "Aus der Bibliothek" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, "def", bibliothek, optionen());
    expect(ergebnis.changed).toBe(true);
    // Der Slot bekommt den Inhalt der Bibliothek.
    const slot = tree.nodes["def"]!.slots?.["inhalt"] ?? [];
    expect(slot).toHaveLength(1);
    expect(tree.nodes[slot[0] as string]!.props["html"]).toBe("Aus der Bibliothek");
    // Und der Eintrag, auf den der Slot vorher zeigte, ist gemeldet.
    expect(ergebnis.droppedPartIds).toContain("weg");
  });

  it("fasst eine Kopie nicht an", () => {
    const { tree, definitionId, teilId } = lokalerDraft();
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: {
        wurzel: { id: "wurzel", type: "section", props: {}, children: ["teil"] },
        teil: { id: "teil", type: "card", props: { headline: "Neuer Text" } },
      },
    };
    const ergebnis = mergeLibraryDefinition(tree, definitionId, bibliothek, optionen({ origin: "copied" }));
    // Die Kopie gehoert der Seite: ein Bibliotheks-Update darf sie nicht
    // ueberschreiben.
    expect(ergebnis.changed).toBe(false);
    expect(ergebnis.droppedPartIds).toEqual([]);
    expect(tree.nodes[teilId]!.props["headline"]).toBe("Alter Text");
  });

  it("aendert nichts, wenn die Definition fehlt", () => {
    const { tree } = lokalerDraft();
    const bibliothek: NodeTree = {
      rootNodeId: "wurzel",
      nodes: { wurzel: { id: "wurzel", type: "section", props: {} } },
    };
    // Die lokale Definition gibt es nicht (mehr).
    const ergebnis = mergeLibraryDefinition(tree, "gibt-es-nicht", bibliothek, optionen());
    expect(ergebnis.changed).toBe(false);
    expect(ergebnis.droppedPartIds).toEqual([]);
  });

  it("aendert nichts, wenn die Bibliotheksdefinition keine Wurzel hat", () => {
    const { tree, teilId } = lokalerDraft();
    const bibliothek: NodeTree = { rootNodeId: "wurzel", nodes: {} };
    const ergebnis = mergeLibraryDefinition(tree, "def", bibliothek, optionen());
    expect(ergebnis.changed).toBe(false);
    expect(tree.nodes[teilId]!.props["headline"]).toBe("Alter Text");
  });
});
