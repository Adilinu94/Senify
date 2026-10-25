// Aehnlichkeit zweier Baustein-Definitionen.
//
// Der Plan (`.scratch/framer-import/plan.md` §5.3) sagt: "Aehnlichkeit statt
// Gleichheit. Bei 85-99 % Aehnlichkeit KEIN automatisches Zusammenlegen,
// sondern ein Hinweis." Der Fingerabdruck allein beantwortet die Frage nicht:
// er ist eine Gleichheit (SHA-256 ueber die normalisierte Definition), und
// zwei Karten, die sich um eine Zeile unterscheiden, haben zwei verschiedene
// Fingerabdruecke - obwohl der Mensch sie sofort als "derselbe Baustein mit
// einer anderen Farbe" erkennt.
//
// Die Aehnlichkeit misst deshalb die STRUKTUR, nicht den Fingerabdruck:
// dieselbe Knotenform, dieselben Prop-Schluessel, dieselben Slots. Zwei
// Definitionen, die sich nur in einem Prop-Wert unterscheiden, sind sehr
// aehnlich (99 %); zwei, die verschiedene Bausteine sind, sind es nicht.
//
// Die Zahl ist ein Hinweis, kein Urteil: das Muster ist derselbe wie bei den
// Referenz-Dubletten ("rein lesend, das Loeschen bleibt Handarbeit") und wie
// beim Design-Score ("der Design-Score zeigt Zahlen, der Mensch entscheidet").
import { createHash } from "node:crypto";
import type { NodeTree } from "@senify/section-sdk";

// Die Projektion einer Definition: was sie strukturell IST, ohne die Werte.
// Props werden auf ihre Schluessel reduziert, weil ein Wert ("#ff0000" gegen
// "#00ff00") die Aehnlichkeit nicht strukturell, sondern nur farblich betrifft
// - der Mensch soll den Hinweis sehen, nicht die Farbe.
export type DefinitionShape = {
  // Die Knotenform als eine Liste: Typ, Prop-Schluessel, Zahl der Kinder,
  // Slot-Namen. Die Liste ist nach dem Baum geordnet, damit der Vergleich
  // stabil bleibt.
  nodes: { type: string; props: string[]; children: number; slots: string[] }[];
  // Die Zahl der Knoten - sie entscheidet, wie stark zwei Definitionen
  // ueberhaupt zusammenpassen.
  size: number;
};

function shapeOf(definition: NodeTree): DefinitionShape {
  const nodes: DefinitionShape["nodes"] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = definition.nodes[id];
    if (node === undefined) return;
    nodes.push({
      type: node.type,
      props: Object.keys(node.props ?? {}).sort(),
      children: node.children?.length ?? 0,
      slots: Object.keys(node.slots ?? {}).sort(),
    });
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(definition.rootNodeId);
  return { nodes, size: nodes.length };
}

// Der Anteil der uebereinstimmenden Knoten an allen Knoten beider
// Definitionen (Jaccard ueber die Knotenformen, mit Multiset-Verhalten:
// gleiche Form zaehlt so oft, wie sie vorkommt).
function matchingNodes(left: DefinitionShape, right: DefinitionShape): number {
  const key = (node: DefinitionShape["nodes"][number]): string =>
    JSON.stringify([node.type, node.props, node.children, node.slots]);
  const rightCounts = new Map<string, number>();
  for (const node of right.nodes) {
    rightCounts.set(key(node), (rightCounts.get(key(node)) ?? 0) + 1);
  }
  let matches = 0;
  for (const node of left.nodes) {
    const k = key(node);
    const available = rightCounts.get(k) ?? 0;
    if (available > 0) {
      matches += 1;
      rightCounts.set(k, available - 1);
    }
  }
  return matches;
}

// Die Aehnlichkeit zweier Definitionen in Prozent (0 bis 100, ganzzahlig).
//
// Zwei leere Definitionen sind 100 % aehnlich (nichts steckt in keiner von
// beiden); eine leere gegen eine volle sind 0 %.
export function definitionSimilarity(left: NodeTree, right: NodeTree): number {
  const a = shapeOf(left);
  const b = shapeOf(right);
  if (a.size === 0 && b.size === 0) return 100;
  if (a.size === 0 || b.size === 0) return 0;
  const matches = matchingNodes(a, b);
  return Math.round((matches / (a.size + b.size - matches)) * 100);
}

// Der Fingerabdruck einer Definition - derselbe Hash, den der Import
// uebergibt, aber aus der Definition selbst berechnet. Damit kann der Store
// zwei Eintraege vergleichen, ohne den Import zu fragen.
export function definitionFingerprint(definition: NodeTree): string {
  const shape = shapeOf(definition);
  const payload = {
    nodes: shape.nodes.map((node) => ({
      type: node.type,
      props: node.props,
      children: node.children,
      slots: node.slots,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
