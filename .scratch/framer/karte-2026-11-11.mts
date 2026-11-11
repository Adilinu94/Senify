import { runImport } from "../../packages/framer-import/src/import.ts";

const ORIGIN = "https://gracious-balance-599544.framer.app";

const run = await runImport({
  source: { kind: "url", url: `${ORIGIN}/` },
  capture: "browser",
  includeAssets: false,
});

type Knoten = {
  key: string;
  tag: string;
  kind: string;
  assetUrl?: string | null;
  baseClasses: string[];
  variantClasses?: string[];
  htmlId?: string | null;
  inlineStyle?: string;
  states: {
    device: string;
    hiddenAt: string[];
    variantHash: string | null;
    visual: Record<string, string>;
    box: Record<string, string> | null;
  }[];
  children: Knoten[];
};

const root = run.document.pages[0]?.root as unknown as Knoten | undefined;
if (!root) throw new Error("kein Root");

function suchen(node: Knoten, name: string): Knoten[] | null {
  if (node.assetUrl?.includes(name)) return [node];
  for (const child of node.children) {
    const teil = suchen(child, name);
    if (teil) return [node, ...teil];
  }
  return null;
}

function beschreiben(node: Knoten): Record<string, unknown> {
  return {
    key: node.key,
    tag: node.tag,
    id: node.htmlId ?? null,
    klassen: node.baseClasses.slice(0, 3),
    varianten: node.variantClasses ?? [],
    inline: (node.inlineStyle ?? "").slice(0, 80),
    zustand: node.states.map((state) => ({
      device: state.device,
      width: state.visual["width"] ?? null,
      height: state.visual["height"] ?? null,
      flex: state.visual["flex"] ?? null,
      ratio: state.visual["aspectRatio"] ?? null,
      boxWidth: state.box?.["width"] ?? null,
      boxHeight: state.box?.["height"] ?? null,
    })),
  };
}

for (const name of ["carlpPM", "kKgWSP"]) {
  const kette = suchen(root, name);
  console.log(`===== ${name} =====`);
  if (!kette) {
    console.log("nicht gefunden");
    continue;
  }
  for (const node of kette.slice(-8)) console.log(JSON.stringify(beschreiben(node)));
}

const karten: Knoten[] = [];
const sammeln = (node: Knoten): void => {
  if ((node.inlineStyle ?? "").includes("width:190px;height:70px")) karten.push(node);
  for (const child of node.children) sammeln(child);
};
sammeln(root);
console.log(`===== Karten mit 190x70: ${karten.length} =====`);
for (const karte of karten.slice(0, 8)) {
  const bilder: string[] = [];
  const bildSammeln = (node: Knoten): void => {
    if (node.assetUrl) bilder.push(node.assetUrl.split("/").pop() ?? "");
    for (const child of node.children) bildSammeln(child);
  };
  bildSammeln(karte);
  console.log(JSON.stringify({ key: karte.key, bilder: bilder.slice(0, 3), zustand: beschreiben(karte).zustand }));
}
