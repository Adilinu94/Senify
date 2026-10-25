// Die Definition einer Bibliotheks-Installation in den Draft einer Site
// uebernehmen.
//
// Der Vertrag (Plan §5.1, Schritt 4) lautet: "Definition aendern = Version
// erhoehen. Instanzen bleiben auf ihrem Pin; `update_instances` zieht sie in
// EINEM Schritt nach (ein Undo)."
//
// Das heisst: das Update ersetzt den Inhalt der lokalen Definition, ohne die
// Ueberschreibungen der Instanz zu verlieren. Die Ueberschreibungen sind
// ueber die Teil-IDs adressiert (Plan: "Overrides adressieren stabile
// Part-IDs, nie Labels"), und die Teil-IDs sind die Knoten-IDs der lokalen
// Definition. Wer beim Update neue IDs vergibt, verliert jede
// Ueberschreibung - also behaelt die lokale Definition ihre IDs, und nur
// wirklich neue Teile bekommen neue.
//
// Zwei Betriebsarten (das Feld `mode` der Installation):
//
// - `linked`: die Seite benutzt die Bibliotheksdefinition. Das Update zieht
//   den neuen Inhalt nach. Das ist der Normalfall.
// - `copied`: die Seite hat eine eigene Kopie. Das Update fasst sie nicht an
//   - der Pin wandert, der Inhalt bleibt der der Seite. Sonst wuerde ein
//   Bibliotheks-Update die Kopie ueberschreiben, und genau das darf bei einer
//   Kopie nicht passieren.
//
// Was beim Update mit den Ueberschreibungen passiert, ist eine Tatsache, keine
// Entscheidung: sie bleiben, weil ihre Adressen (die Teil-IDs) bleiben.
// Ueberschreibungen fuer Teile, die es in der neuen Definition nicht mehr
// gibt, bleiben im Beutel - der section-sdk meldet sie als verwaist
// (`staleOverrides`), statt sie still zu verlieren.
import type { Node, NodeTree, PropValue } from "@senify/section-sdk";

export type DefinitionMergeOptions = {
  // Die Version der Bibliothek, die in die Definition geschrieben wird.
  version: number;
  // Der Name der Bibliothek (die Definition traegt ihn als Anzeigename).
  name: string;
  // Die ID des Bibliothekseintrags.
  libraryComponentId: string;
  // Die Herkunft der Definition im Draft: `linked` (an die Bibliothek
  // gebunden) oder `copied` (eine eigene Kopie der Seite).
  origin: "linked" | "copied";
  // Die ID-Geberin fuer neue Knoten. Der Aufrufer gibt sie vor, damit die
  // IDs der Engine folgen (nicht `Math.random`).
  newId: () => string;
};

export type DefinitionMergeResult = {
  tree: NodeTree;
  // Hat sich der Inhalt der Definition geaendert? Bei `copied` nie.
  changed: boolean;
  // Die Teile, die es in der neuen Definition nicht mehr gibt. Ihre
  // Ueberschreibungen bleiben im Beutel, aber sie gehoeren zu keinem Teil
  // mehr - der section-sdk meldet das als `staleOverrides`.
  droppedPartIds: string[];
};

// Die Props, die ein Knoten der lokalen Definition traegt: die der
// Bibliothek (der neue Inhalt) plus die Marker der Bibliotheksbindung.
//
// Die Props der BIBLIOTHEK sind die Wahrheit fuer den Inhalt - eine
// Aenderung des Textes muss in der Seite ankommen. Die lokalen Props werden
// dabei ersetzt, nicht ergaenzt: sonst bliebe der alte Text des Bausteins
// stehen, weil er im lokalen Knoten stuende.
function definitionProps(options: DefinitionMergeOptions, library: Node): Record<string, PropValue> {
  return {
    ...library.props,
    name: options.name,
    version: options.version,
    libraryComponentId: options.libraryComponentId,
    libraryOrigin: options.origin,
  };
}

// Die Definition im Draft und die Definition der Bibliothek haben dieselbe
// Form: ein Wurzelknoten mit Kindern und Slots. Der Abgleich laeuft ueber die
// Position (Kinder nach Index, Slots nach Name) - das ist die stabilste
// Entsprechung, die es zwischen zwei Baeumen ueberhaupt gibt: die IDs der
// Bibliothek sind ihre Import-IDs und sagen nichts ueber die Reihenfolge aus.
function mergeChildren(
  tree: NodeTree,
  localId: string,
  library: Node,
  libraryNodes: Record<string, Node>,
  options: DefinitionMergeOptions,
  dropped: string[],
): { children: string[]; slots: Record<string, string[]> } {
  const local = tree.nodes[localId];
  const localChildren = local?.children ?? [];
  const libraryChildren = library.children ?? [];
  const children: string[] = [];
  for (let index = 0; index < libraryChildren.length; index += 1) {
    const libraryChildId = libraryChildren[index] as string;
    const libraryChild = libraryNodes[libraryChildId];
    if (libraryChild === undefined) continue;
    const localChildId = localChildren[index];
    if (localChildId === undefined || tree.nodes[localChildId] === undefined) {
      // Ein neuer Teil: er bekommt eine neue ID (es gibt keine alte, die man
      // behaalten koennte).
      const fresh = options.newId();
      tree.nodes[fresh] = { ...libraryChild, id: fresh, props: { ...libraryChild.props } };
      const merged = mergeChildren(tree, fresh, libraryChild, libraryNodes, options, dropped);
      tree.nodes[fresh] = { ...tree.nodes[fresh] as Node, children: merged.children, slots: merged.slots };
      children.push(fresh);
      continue;
    }
    const merged = mergeChildren(tree, localChildId, libraryChild, libraryNodes, options, dropped);
    tree.nodes[localChildId] = {
      ...tree.nodes[localChildId] as Node,
      props: definitionProps(options, libraryChild),
      children: merged.children,
      slots: merged.slots,
    };
    children.push(localChildId);
  }
  // Lokale Teile ohne Gegenstueck in der Bibliothek fallen weg. Ihre IDs
  // wandern in `dropped` - sie tragen moeglicherweise noch Ueberschreibungen.
  for (let index = libraryChildren.length; index < localChildren.length; index += 1) {
    const localChildId = localChildren[index] as string;
    dropped.push(localChildId);
    delete tree.nodes[localChildId];
  }
  // Die Slots: nach Name zugeordnet, die Inhalte nach Index.
  const slots: Record<string, string[]> = {};
  const localSlots = local?.slots ?? {};
  for (const [name, librarySlotIds] of Object.entries(library.slots ?? {})) {
    const localSlotIds = localSlots[name] ?? [];
    const mergedIds: string[] = [];
    for (let index = 0; index < librarySlotIds.length; index += 1) {
      const librarySlotId = librarySlotIds[index] as string;
      const librarySlotNode = libraryNodes[librarySlotId];
      if (librarySlotNode === undefined) continue;
      const localSlotId = localSlotIds[index];
      if (localSlotId === undefined || tree.nodes[localSlotId] === undefined) {
        // Der Slot bekommt Inhalt, den die Seite noch nicht hatte: eine neue
        // Node. Der alte Inhalt an dieser Stelle (falls es einen gab und er
        // nicht mehr gebraucht wird) wird unten gemeldet und entfernt.
        const fresh = options.newId();
        tree.nodes[fresh] = { ...librarySlotNode, id: fresh, props: { ...librarySlotNode.props } };
        const merged = mergeChildren(tree, fresh, librarySlotNode, libraryNodes, options, dropped);
        tree.nodes[fresh] = { ...tree.nodes[fresh] as Node, children: merged.children, slots: merged.slots };
        mergedIds.push(fresh);
        continue;
      }
      const merged = mergeChildren(tree, localSlotId, librarySlotNode, libraryNodes, options, dropped);
      tree.nodes[localSlotId] = {
        ...tree.nodes[localSlotId] as Node,
        props: definitionProps(options, librarySlotNode),
        children: merged.children,
        slots: merged.slots,
      };
      mergedIds.push(localSlotId);
    }
    // Slot-Inhalte, die es in der Bibliothek an dieser Stelle nicht mehr gibt,
    // fallen weg. Sie werden gemeldet: sie koennten eine Ueberschreibung
    // tragen, und ein stiller Verlust waere genau die Art Datenverlust, die
    // dieses Modul vermeiden soll.
    //
    // Der Fall "die Bibliothek hat hier nichts mehr" und der Fall "der lokale
    // Knoten existiert nicht (mehr)" sind verschiedene Faelle, aber beide
    // enden damit, dass der lokale Knoten an dieser Stelle nicht mehr in den
    // Slot gehoert. Deshalb wird hier ueber ALLE lokalen Slot-Eintraege
    // gelaufen, nicht nur ueber die, die die Bibliothek nicht mehr fuehrt.
    for (let index = 0; index < localSlotIds.length; index += 1) {
      const localSlotId = localSlotIds[index] as string;
      // Der Eintrag ist noch im Slot der Bibliothek: er wurde wiederverwendet.
      if (mergedIds[index] === localSlotId) continue;
      // Die Bibliothek fuehrt an dieser Stelle gar nichts mehr.
      if (index >= librarySlotIds.length) {
        dropped.push(localSlotId);
        delete tree.nodes[localSlotId];
        continue;
      }
      // Die Bibliothek fuehrt an dieser Stelle etwas anderes: der lokale
      // Eintrag gehoert nicht mehr in den Slot. Existiert sein Knoten nicht
      // mehr, gibt es nichts zu entfernen - aber es wird trotzdem gemeldet,
      // weil der Slot auf ihn zeigte.
      dropped.push(localSlotId);
      delete tree.nodes[localSlotId];
    }
    slots[name] = mergedIds;
  }
  // Slots, die es in der Bibliothek nicht mehr gibt, fallen weg.
  for (const name of Object.keys(localSlots)) {
    if (library.slots?.[name] === undefined) {
      for (const localSlotId of localSlots[name] ?? []) {
        dropped.push(localSlotId);
        delete tree.nodes[localSlotId];
      }
    }
  }
  return { children, slots };
}

// Die lokale Definition (`localDefinitionId` im Draft) auf den Inhalt der
// Bibliotheksdefinition bringen.
//
// `copied` aendert nichts: die Seite hat eine eigene Kopie, und ein
// Bibliotheks-Update darf sie nicht ueberschreiben.
export function mergeLibraryDefinition(
  tree: NodeTree,
  localDefinitionId: string,
  libraryDefinition: NodeTree,
  options: DefinitionMergeOptions,
): DefinitionMergeResult {
  if (options.origin === "copied") return { tree, changed: false, droppedPartIds: [] };
  const local = tree.nodes[localDefinitionId];
  const libraryRoot = libraryDefinition.nodes[libraryDefinition.rootNodeId];
  if (local === undefined || libraryRoot === undefined) {
    return { tree, changed: false, droppedPartIds: [] };
  }
  const dropped: string[] = [];
  const merged = mergeChildren(tree, localDefinitionId, libraryRoot, libraryDefinition.nodes, options, dropped);
  const before = JSON.stringify(local);
  tree.nodes[localDefinitionId] = {
    ...local,
    // Der Typ bleibt `__component`: er ist die Marke, dass dieser Knoten im
    // Draft eine Definition ist (und nicht etwa eine Seite). Die Props kommen
    // aus der Bibliothek.
    type: local.type,
    props: definitionProps(options, libraryRoot),
    children: merged.children,
    slots: merged.slots,
  };
  const after = JSON.stringify(tree.nodes[localDefinitionId]);
  return { tree, changed: before !== after, droppedPartIds: dropped };
}
