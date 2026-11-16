import { runImport } from "../../packages/framer-import/src/import.ts";

const ORIGIN = "https://gracious-balance-599544.framer.app";

const run = await runImport({
  source: { kind: "url", url: `${ORIGIN}/` },
  capture: "browser",
  includeAssets: false,
});
type Zustand = { device: string; visual?: Record<string, string>; box?: Record<string, string> };
type Knoten = {
  key: string;
  tag: string;
  baseClasses: string[];
  variantClasses?: string[];
  visual?: Record<string, string>;
  box?: Record<string, string>;
  states?: Zustand[];
  children?: Knoten[];
};
const document = run.document as unknown as { pages: { root: Knoten }[] };

const treffer: Knoten[] = [];
function suchen(node: Knoten): void {
  const namen = [...(node.baseClasses ?? []), ...(node.variantClasses ?? [])];
  if (namen.some((name) => name.includes("185vnn3"))) treffer.push(node);
  for (const child of node.children ?? []) suchen(child);
}
suchen(document.pages[0]?.root as Knoten);
console.log("Punktknoten:", treffer.length);
for (const node of treffer.slice(0, 4)) {
  console.log(
    JSON.stringify({
      key: node.key,
      tag: node.tag,
      classes: node.baseClasses,
      variants: node.variantClasses,
      states: (node.states ?? []).map((state) => ({
        device: state.device,
        width: state.visual?.["width"],
        height: state.visual?.["height"],
        radius: state.visual?.["border-radius"],
        transform: state.visual?.["transform"],
        opacity: state.visual?.["opacity"],
        boxWidth: state.box?.["width"],
        boxHeight: state.box?.["height"],
      })),
    }),
  );
}
