// Diagnose: Warum bleiben die beiden 8vw-Seitenschienen (fi671/fi849) im
// Import sichtbar, obwohl die Quelle sie unterhalb von 1440 px ausblendet?
// Das Skript liest die gemappte Editor-Dokumentstruktur und zeigt die
// Sichtbarkeitsfelder der Schienen und ihrer Nachbarn.

import { writeFileSync } from "node:fs";
import { runImport } from "../../packages/framer-import/src/index.ts";

const run = await runImport({ source: { kind: "url", url: "https://unifiersofjapan.framer.website/" }, mode: "fidelity" });
const document = run.mapped.document as {
  rootNodeId: string;
  nodes: Record<string, {
    primitive: string;
    name?: string;
    classes?: string[];
    hiddenDevices?: string[];
    visibleDevices?: string[];
    hidden?: boolean;
    children?: string[];
    props?: Record<string, unknown>;
  }>;
};

const lines: string[] = [];
const ids = Object.keys(document.nodes);
lines.push(`Knoten: ${ids.length}`);
for (const id of ["fi671", "fi681", "fi849", "fi670"]) {
  const node = document.nodes[id];
  lines.push(`\n### ${id}: ${node === undefined ? "fehlt" : JSON.stringify({
    primitive: node.primitive,
    name: node.name,
    hiddenDevices: node.hiddenDevices,
    visibleDevices: node.visibleDevices,
    hidden: node.hidden,
    classes: node.classes,
    children: node.children,
    width: node.props?.width,
    display: node.props?.display,
    transform: node.props?.transform,
  }, null, 1).slice(0, 1600)}`);
}

lines.push("\n### Knoten mit Sichtbarkeitsangaben:");
for (const [id, node] of Object.entries(document.nodes)) {
  if (node.hiddenDevices !== undefined || node.visibleDevices !== undefined || node.hidden === true) {
    lines.push(`${id} ${node.primitive} ${node.name ?? ""} hiddenDevices=${JSON.stringify(node.hiddenDevices)} visibleDevices=${JSON.stringify(node.visibleDevices)} hidden=${String(node.hidden)} classes=${(node.classes ?? []).join(" ")}`);
  }
}

writeFileSync(".scratch/p3-7-punkt-15/schienen-ir.log", lines.join("\n"));
console.log(lines.slice(0, 80).join("\n"));
