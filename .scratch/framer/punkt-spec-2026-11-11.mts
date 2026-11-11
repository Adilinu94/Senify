import { runImport } from "../../packages/framer-import/src/import.ts";

const ORIGIN = "https://gracious-balance-599544.framer.app";

const run = await runImport({
  source: { kind: "url", url: `${ORIGIN}/` },
  capture: "browser",
  includeAssets: false,
});
const document = run.document as unknown as {
  appear?: { appearId: string; variants: Record<string, unknown> }[];
  motion?: { nodeKey: string | null; library: string; trigger: string; params: Record<string, unknown>; raw?: string }[];
  pages: { root: Record<string, unknown> }[];
};

const spec = document.appear?.find((entry) => entry.appearId === "n47") ?? null;
console.log("spec n47:", JSON.stringify(spec));
const sample = document.motion?.find((entry) => entry.nodeKey === "n47") ?? null;
console.log("sample n47:", JSON.stringify(sample));

function find(node: Record<string, unknown>, key: string): Record<string, unknown> | null {
  if (node.key === key) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children as Record<string, unknown>[]) {
    const hit = find(child, key);
    if (hit !== null) return hit;
  }
  return null;
}
const punkt = find(document.pages[0]?.root ?? {}, "n47");
console.log(
  "node n47:",
  JSON.stringify(
    punkt === null
      ? null
      : {
          tag: punkt.tag,
          classes: punkt.baseClasses,
          visual: punkt.visual,
          box: punkt.box,
          inline: punkt.inlineStyle,
          appearId: punkt.appearId,
          derived: punkt.derivedAppearId,
          children: (punkt.children as { key: string; tag: string }[]).map((child) => ({ key: child.key, tag: child.tag })),
        },
  ),
);
