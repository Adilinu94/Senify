import type { IrNode } from "./ir.ts";

// A motion sample names the IR node it was measured on. That node is not
// always an editor node: a text link folds its children into inline markup,
// so a sample on a word inside the link has no editor node of its own. The
// sample still belongs to the page, one level up. This map carries the
// nearest mapped ancestor for every IR key without touching the mapping of
// the nodes themselves.
export function nearestMappedNodeByIrKey(
  root: IrNode | undefined,
  nodeIdByIrKey: Readonly<Record<string, string>>,
): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: IrNode | undefined, nearest: string | undefined): void => {
    if (node === undefined) return;
    const own = nodeIdByIrKey[node.key];
    const mapped = own ?? nearest;
    if (mapped !== undefined) out.set(node.key, mapped);
    for (const child of node.children) walk(child, mapped);
  };
  walk(root, undefined);
  return out;
}
