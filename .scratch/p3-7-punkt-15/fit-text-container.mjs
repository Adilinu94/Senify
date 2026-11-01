// Probe zu P3-7 Punkt 15, Ursache 1 (Fit-Text, Faktor 1,3345).
//
// Die `font-size` eines Fit-Textes reist als `cqw`-Anteil, und `cqw` löst der
// Browser gegen den nächsten Container auf. Auf `unifiersofjapan` steht im
// Backen keine `container-type`-Deklaration (0×) — die Einheit fällt auf das
// Fenster zurück: 71,2521 % × 1440 = 1026,03 px; die Quelle zeigt 281,3 px
// (768,857 × 394,8 / 1079,066). Diese Probe zeigt, an welchem Knoten die
// Deklaration im IR steht (und ob sie den Mapper erreicht).
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/fit-text-container.mjs

import { readFileSync } from "node:fs";
import { captureHtml, mapDocument, normalize } from "../../packages/framer-import/src/index.ts";

const html = readFileSync(new URL("./quelle.html", import.meta.url), "utf8");
const document = captureHtml({ html, url: "https://unifiersofjapan.framer.website/" });

const fits = [];
const carries = [];
const walk = (node, parent) => {
  if (node.kind === "fit-text") fits.push({ node, parent });
  if (node.kind !== "fit-text" && node.children.some((child) => child.kind === "fit-text")) {
    carries.push({ node, direct: true });
  } else if (parent !== null && node.children.some((child) => child.kind === "fit-text")) {
    carries.push({ node, direct: true });
  }
  for (const child of node.children) walk(child, node);
};
for (const page of document.pages) walk(page.root, null);

console.log(`Fit-Text-Knoten im IR: ${fits.length}`);
for (const { node, parent } of fits.slice(0, 8)) {
  console.log(`  ${node.key}  text=${JSON.stringify(node.states[0]?.text?.content ?? "")}`);
  console.log(
    `    eigene visual: width=${node.states[0]?.visual["width"] ?? "-"}  font-size=${node.states[0]?.visual["font-size"] ?? "-"}`,
  );
  console.log(
    `    eltern ${parent?.key ?? "-"} (${parent?.tag ?? "-"}): container-type=${parent?.states[0]?.visual["container-type"] ?? "-"}  width=${parent?.states[0]?.visual["width"] ?? "-"}`,
  );
}
console.log("\nKnoten mit direktem Fit-Text-Kind (container-type-Kandidaten):");
for (const { node } of carries.slice(0, 8)) {
  console.log(
    `  ${node.key} (${node.tag}): container-type=${node.states[0]?.visual["container-type"] ?? "-"}  width=${node.states[0]?.visual["width"] ?? "-"}`,
  );
}

const normalized = normalize(document, { mode: "fidelity" });
const mapped = mapDocument(document, normalized.rules, { mode: "fidelity" });
console.log("\nGemappte Dokument-Knoten der Fit-Texte:");
for (const { node } of fits.slice(0, 8)) {
  const id = mapped.nodeIdByIrKey[node.key];
  const mappedNode = id === undefined ? undefined : mapped.document.nodes[id];
  if (mappedNode === undefined) {
    console.log(`  ${node.key} -> nicht gemappt`);
    continue;
  }
  console.log(
    `  ${node.key} -> ${id} ${mappedNode.primitive}  fontSize=${mappedNode.props["fontSize"] ?? "-"}  width=${mappedNode.props["width"] ?? "-"}  containerType=${mappedNode.props["containerType"] ?? "-"}`,
  );
  const parentId = mappedNode.parentId;
  const parent = parentId === undefined || parentId === null ? undefined : mapped.document.nodes[parentId];
  if (parent !== undefined) {
    console.log(
      `    eltern ${parentId} ${parent.primitive}: containerType=${parent.props["containerType"] ?? "-"} width=${parent.props["width"] ?? "-"}`,
    );
  }
}
