// Wo geht die 30-Grad-Drehung verloren? IR des 1440er Abzugs: alle Kopien
// des Outfit-Knotens mit ihren Zustaenden, dann das gemappte Dokument.
import { readFileSync } from "node:fs";
import { captureHtml, normalize, mapDocument } from "../../packages/framer-import/src/index.ts";

const html = readFileSync(".scratch/p3-7-punkt-15/quelle.html", "utf8");
const document = captureHtml({ html, url: "https://unifiersofjapan.framer.website/" });

type State = {
  device: string;
  hiddenAt: string[];
  visual: Record<string, unknown>;
  box: Record<string, unknown> | null;
};
type IrNode = {
  key: string;
  tag: string;
  kind: string;
  baseClasses: string[];
  states: State[];
  children: IrNode[];
};

const WANT = "framer-4g55og";
const walk = (node: IrNode, chain: string[]): void => {
  const isOutfit = node.baseClasses.includes(WANT) || chain.includes(WANT);
  if (isOutfit) {
    console.log(`\n<${node.tag} ${node.baseClasses.join(".")}> kind=${node.kind} key=${node.key}`);
    console.log(`  kette: ${chain.join(" > ")}`);
    for (const state of node.states) {
      console.log(`  [${state.device}] hiddenAt=${JSON.stringify(state.hiddenAt)} transform=${JSON.stringify(state.visual["transform"] ?? null)} radius=${JSON.stringify(state.visual["borderBottomLeftRadius"] ?? null)}`);
      console.log(`    box=${JSON.stringify(state.box)}`);
    }
  }
  const nextChain = node.baseClasses.includes(WANT) ? [...chain, WANT] : chain;
  for (const child of node.children) walk(child, nextChain);
};
walk(document.pages[0]?.root as IrNode, []);

const normalized = normalize(document, { mode: "fidelity" });
const mapped = mapDocument(document, normalized.rules);
type Ed = {
  id: string;
  primitive: string;
  props: Record<string, unknown>;
  overrides?: Record<string, { props?: Record<string, unknown> }>;
  children?: string[];
};
const nodes = mapped.document.nodes as Record<string, Ed>;
const ids = Object.values(nodes).filter((node) => JSON.stringify(node.props["transform"] ?? "").includes("rotate") || JSON.stringify(node.overrides ?? {}).includes("rotate"));
console.log(`\nGemappte Knoten mit rotate(): ${ids.length}`);
for (const node of ids.slice(0, 20)) {
  console.log(`  ${node.id}(${node.primitive}) transform=${JSON.stringify(node.props["transform"] ?? null)}`);
  console.log(`    tablet=${JSON.stringify(node.overrides?.tablet?.props?.["transform"] ?? null)} mobile=${JSON.stringify(node.overrides?.mobile?.props?.["transform"] ?? null)}`);
}
