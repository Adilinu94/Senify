// Wo bleiben „nobu"/„naga"? Quelle: gespeichertes HTML (1440er Abzug).
// Erst der Capture-IR, dann das gemappte Dokument.
import { readFileSync } from "node:fs";
import { captureHtml, normalize, mapDocument } from "../../packages/framer-import/src/index.ts";

const html = readFileSync(".scratch/p3-7-punkt-15/quelle.html", "utf8");
const document = captureHtml({ html, url: "https://unifiersofjapan.framer.website/" });

type IrNode = {
  key: string;
  tag: string;
  baseClasses: string[];
  states: { device: string; hiddenAt: string[]; text: { content: string } | null }[];
  children: IrNode[];
};
const hits: string[] = [];
const walk = (node: IrNode, chain: string[]): void => {
  const text = node.states.map((state) => state.text?.content ?? "").join(" | ");
  if (/nobu|naga/i.test(text)) {
    hits.push(
      `${chain.join(" > ")} > <${node.tag} ${node.baseClasses.slice(0, 4).join(".")}> text="${text}" hiddenAt=${JSON.stringify(node.states.map((s) => s.hiddenAt))} key=${node.key}`,
    );
  }
  for (const child of node.children) walk(child, [...chain, `<${node.tag} ${node.baseClasses.slice(0, 2).join(".")}>`]);
};
walk(document.pages[0]?.root as IrNode, []);
console.log(`IR-Treffer: ${hits.length}`);
for (const line of hits.slice(0, 20)) console.log(`  ${line}`);

const normalized = normalize(document, { mode: "fidelity" });
const mapped = mapDocument(document, normalized.rules);
type Ed = {
  id: string;
  primitive: string;
  props: Record<string, unknown>;
  children?: string[];
  visibleDevices?: string[];
  hiddenDevices?: string[];
  hidden?: boolean;
};
const nodes = mapped.document.nodes as Record<string, Ed>;
const roots = mapped.document.nodes[mapped.document.rootNodeId]?.children ?? [];
const mappedHits: string[] = [];
const walkEd = (id: string, chain: string[]): void => {
  const node = nodes[id];
  if (node === undefined) return;
  const text = JSON.stringify(node.props["text"] ?? node.props["content"] ?? "");
  if (/nobu|naga/i.test(text)) {
    mappedHits.push(
      `${chain.join(" > ")} > ${node.id}(${node.primitive}) text=${text} visible=${JSON.stringify(node.visibleDevices)} hidden=${JSON.stringify(node.hiddenDevices)} hiddenByDefault=${String(node.hidden)}`,
    );
  }
  for (const child of node.children ?? []) walkEd(child, [...chain, `${node.id}(${node.primitive})`]);
};
for (const id of roots) walkEd(id, []);
console.log(`Mapped-Treffer: ${mappedHits.length}`);
for (const line of mappedHits.slice(0, 20)) console.log(`  ${line}`);

for (const key of ["n285", "n288", "n290", "n292"]) {
  const id = mapped.nodeIdByIrKey[key];
  const node = id === undefined ? undefined : nodes[id];
  console.log(
    `${key} -> ${String(id)} ${node === undefined ? "FEHLT" : `${node.primitive} props=${JSON.stringify(node.props).slice(0, 220)} visible=${JSON.stringify(node.visibleDevices)}`}`,
  );
}
