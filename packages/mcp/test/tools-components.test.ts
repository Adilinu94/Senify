import { describe, expect, it } from "vitest";
import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
  type NodeTree,
} from "@senify/section-sdk";
import {
  componentInstanceList,
  componentName,
  definitionVersion,
  readOverrideBag,
  walkComponent,
} from "../src/tools-components.ts";

// Die Lese-Hilfen der Komponenten-Werkzeuge. Sie werden von `tools.ts`
// aufgerufen; die Werkzeuge sind ueber den Workflow-Test gedeckt, die
// RANDZWEIGE dieser fuenf Funktionen waren es nicht (gemessen: 84,61 %
// Statements, offene Zeilen 34, 37, 45, 53, 64).
//
// Jeder Fall entspricht einer dieser Zeilen. Sie sind keine Formalitaet: eine
// Definition ohne Kinder, ein Knoten, den der Baum nicht kennt, ein
// Definition-Knoten als Kind und ein Override-Sack mit Unsinn sind alle real -
// der Letzte kommt aus alten Drafts, in denen `overrides` noch ein Array war.
//
// WICHTIG fuer den Baum: `componentDefinitions` laeuft vom WURZELKNOTEN aus.
// Ein Testbaum ohne Wurzel findet keine Definition, und `definitionVersion`
// faellt dann stumm auf 1 zurueck - das war beim ersten Anlauf genau der
// Fehler in diesen Tests.

function tree(nodes: NodeTree["nodes"], rootNodeId = "page"): NodeTree {
  return { rootNodeId, nodes } as NodeTree;
}

describe("walkComponent: die Randzweige", () => {
  it("eine Definition ohne Kinder hat weder Teile noch Slots (Zeile 34)", () => {
    const t = tree({
      def: { id: "def", type: COMPONENT_DEFINITION_TYPE, props: {}, children: [] },
    } as unknown as NodeTree["nodes"]);
    expect(walkComponent(t, "def")).toEqual({ parts: [], slots: [] });
  });

  it("ein Kind, das der Baum nicht kennt, wird uebersprungen (Zeile 37)", () => {
    // Ein Draft kann auf einen geloeschten Knoten zeigen; die Leseseite darf
    // daran nicht werfen, sonst waere das ganze Werkzeug unbrauchbar.
    const t = tree({
      def: {
        id: "def",
        type: COMPONENT_DEFINITION_TYPE,
        props: {},
        children: ["fehlt"],
      },
    } as unknown as NodeTree["nodes"]);
    expect(walkComponent(t, "def")).toEqual({ parts: [], slots: [] });
  });

  it("eine verschachtelte Definition ist Struktur, kein Teil (Zeile 45)", () => {
    const t = tree({
      def: {
        id: "def",
        type: COMPONENT_DEFINITION_TYPE,
        props: {},
        children: ["frame"],
      },
      frame: {
        id: "frame",
        type: "frame",
        props: {},
        children: ["innen"],
      },
      innen: { id: "innen", type: COMPONENT_DEFINITION_TYPE, props: {} },
    } as unknown as NodeTree["nodes"]);
    const walk = walkComponent(t, "def");
    expect(walk.parts.map((part) => part.id)).toEqual(["frame"]);
  });

  it("Kinder in Slots werden mitgelaufen (Zeile 53)", () => {
    const t = tree({
      def: {
        id: "def",
        type: COMPONENT_DEFINITION_TYPE,
        props: {},
        children: ["frame"],
      },
      frame: {
        id: "frame",
        type: "frame",
        props: {},
        slots: { content: ["text"] },
      },
      text: { id: "text", type: "text", props: {} },
    } as unknown as NodeTree["nodes"]);
    const walk = walkComponent(t, "def");
    expect(walk.parts.map((part) => part.id)).toEqual(["frame", "text"]);
  });

  it("ein Slot wird als Slot gefuehrt, nicht als Teil", () => {
    const t = tree({
      def: {
        id: "def",
        type: COMPONENT_DEFINITION_TYPE,
        props: {},
        children: ["frame"],
      },
      frame: { id: "frame", type: "frame", props: {}, children: ["slot"] },
      slot: {
        id: "slot",
        type: COMPONENT_SLOT_TYPE,
        props: { name: "Inhalt" },
      },
    } as unknown as NodeTree["nodes"]);
    expect(walkComponent(t, "def").slots).toEqual([{ id: "slot", name: "Inhalt" }]);
  });
});

describe("readOverrideBag: Unsinn wird verworfen (Zeile 64)", () => {
  it("nimmt nur Objekte je Teil", () => {
    const bag = readOverrideBag({
      gut: { size: 12 },
      nullWert: null,
      liste: [1, 2, 3],
      zahl: 42,
      text: "nein",
    });
    expect(bag).toEqual({ gut: { size: 12 } });
  });

  it("ein Nicht-Objekt ergibt einen leeren Sack", () => {
    expect(readOverrideBag(null)).toEqual({});
    expect(readOverrideBag("x")).toEqual({});
    expect(readOverrideBag([1])).toEqual({});
    expect(readOverrideBag(undefined)).toEqual({});
  });
});

describe("Definition und Instanzen", () => {
  it("ohne Version gilt 1, eine genannte Version gewinnt", () => {
    // Die Definitionen haengen am Wurzelknoten - `componentDefinitions` laeuft
    // von dort aus.
    const t = tree({
      page: { id: "page", type: "root", props: {}, children: ["def", "alt"] },
      def: { id: "def", type: COMPONENT_DEFINITION_TYPE, props: { name: "Karte" } },
      alt: {
        id: "alt",
        type: COMPONENT_DEFINITION_TYPE,
        props: { name: "Alt", version: 4 },
      },
    } as unknown as NodeTree["nodes"]);
    expect(definitionVersion(t, "def")).toBe(1);
    expect(definitionVersion(t, "alt")).toBe(4);
    expect(definitionVersion(t, "fehlt")).toBe(1);
  });

  it("der Name faellt auf die id zurueck", () => {
    const t = tree({
      page: { id: "page", type: "root", props: {}, children: ["def"] },
      def: { id: "def", type: COMPONENT_DEFINITION_TYPE, props: {} },
    } as unknown as NodeTree["nodes"]);
    expect(componentName(t, "def")).toBe("def");
  });

  it("listet nur Instanzen dieser Definition, mit Drift und Overrides", () => {
    const t = tree({
      page: { id: "page", type: "root", props: {}, children: ["def", "alt"] },
      def: { id: "def", type: COMPONENT_DEFINITION_TYPE, props: { version: 3 } },
      alt: { id: "alt", type: COMPONENT_DEFINITION_TYPE, props: { version: 1 } },
      a: {
        id: "a",
        type: COMPONENT_INSTANCE_TYPE,
        props: { componentId: "def", componentVersion: 2, overrides: { p1: { size: 8 } } },
      },
      b: {
        id: "b",
        type: COMPONENT_INSTANCE_TYPE,
        props: { componentId: "def", componentVersion: 3 },
      },
      fremd: {
        id: "fremd",
        type: COMPONENT_INSTANCE_TYPE,
        props: { componentId: "alt", componentVersion: 1 },
      },
    } as unknown as NodeTree["nodes"]);
    const list = componentInstanceList(t, "def");
    expect(list.map((entry) => entry.id)).toEqual(["a", "b"]);
    // `a` pinnt Version 2, die Definition steht auf 3 -> Drift.
    expect(list[0]?.outdated).toBe(true);
    // `b` pinnt 3 -> kein Drift.
    expect(list[1]?.outdated).toBe(false);
    expect(list[0]?.overrides).toEqual({ p1: { size: 8 } });
  });
});
