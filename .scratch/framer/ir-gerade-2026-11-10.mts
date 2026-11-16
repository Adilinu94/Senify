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
    kind: node.kind,
    id: node.htmlId ?? null,
    klassen: node.baseClasses.slice(0, 4),
    varianten: node.variantClasses ?? [],
    zustand: node.states.map((state) => ({
      device: state.device,
      hiddenAt: state.hiddenAt.length,
      variantHash: state.variantHash,
      width: state.visual["width"] ?? null,
      height: state.visual["height"] ?? null,
      flex: state.visual["flex"] ?? null,
      aspectRatio: state.visual["aspectRatio"] ?? null,
      display: state.visual["display"] ?? null,
      boxWidth: state.box?.["width"] ?? null,
      boxHeight: state.box?.["height"] ?? null,
    })),
    kinder: node.children.length,
  };
}

for (const name of ["carlpPM", "23zbhL", "kmzIY3"]) {
  const kette = suchen(root, name);
  console.log(`===== ${name} =====`);
  if (!kette) {
    console.log("nicht gefunden");
    continue;
  }
  const gekuerzt = kette.slice(-6);
  for (const node of gekuerzt) console.log(JSON.stringify(beschreiben(node)));
  const container = kette[kette.length - 2];
  if (container) {
    console.log("Kinder des Containers:");
    for (const child of container.children) console.log(JSON.stringify(beschreiben(child)));
  }
}

