// Forced states for the preview (Phase 0). The editor must show a hover, focus
// or active state without the pointer being on the element (hover on a phone,
// keyboard focus, the pressed state).
//
// Decision: the editor sets one attribute on the frame root
// (`<html data-force-state="hover">`) and this module generates the preview
// rules for that attribute. The rules are unlayered editor chrome, exactly like
// the rest of the chrome (Instatic pattern): unlayered CSS beats the single
// `@layer user-authored` of the authored output, so the forced state wins where
// it matters. Nothing in the release stylesheet changes — `compileCss` does not
// know about this module, and the release never carries the attribute.
//
// Why the attribute and not a doubled `[data-node-id="x"][data-node-id="x"]`
// selector: the attribute is one switch for the whole frame, it does not raise
// specificity against the authored cascade, and it is trivially removable in
// the release. The generated declarations are exactly the ones the real state
// would produce, because both paths share `declarationsPerDevice`.

import { classSelector, nodeSelector, type StateName } from "./cascade.ts";
import {
  deviceExpandedBlocks,
  flattenNodes,
  overlayDeviceValues,
  type CompileOptions,
  type CssDocument,
} from "./compile.ts";

export const FORCED_STATE_ATTRIBUTE = "data-force-state";

export type ForcedStateOptions = CompileOptions & {
  // The root attribute name. Defaults to `data-force-state`.
  attribute?: string;
  // Only force these node ids (the selected node in the editor).
  nodeIds?: readonly string[];
};

export function forcedStateRootSelector(state: StateName, attribute = FORCED_STATE_ATTRIBUTE): string {
  return `[${attribute}="${state}"]`;
}

// The preview rule of the plain state: `[data-force-state="hover"] [data-node-id="x"]`.
export function forcedStateSelector(
  id: string,
  state: StateName,
  attribute = FORCED_STATE_ATTRIBUTE,
): string {
  return `${forcedStateRootSelector(state, attribute)} ${nodeSelector(id)}`;
}

// Editor-chrome stylesheet that paints the given state for every node that
// carries it. Empty when no such node exists.
export function forcedStateCss(
  document: CssDocument,
  state: StateName,
  options: ForcedStateOptions = {},
): string {
  const attribute = options.attribute ?? FORCED_STATE_ATTRIBUTE;
  const wanted = options.nodeIds ? new Set(options.nodeIds) : undefined;
  const classRules = new Map((document.classRules ?? []).map((rule) => [rule.name, rule]));
  const parts: string[] = [];

  for (const node of flattenNodes(document.nodes)) {
    if (wanted !== undefined && !wanted.has(node.id)) continue;
    const values = node.states?.[state];
    if (values === undefined) continue;

    parts.push(
      ...deviceExpandedBlocks(
        node.primitive,
        values,
        forcedStateSelector(node.id, state, attribute),
        options,
      ),
    );

    // A node that carries a class gets the same combined rule the release has
    // (`[data-node-id].cls:hover`), so the preview matches the real hover where
    // class and state meet.
    for (const name of node.classIds ?? []) {
      const rule = classRules.get(name);
      if (rule === undefined) continue;
      parts.push(
        ...deviceExpandedBlocks(
          node.primitive,
          overlayDeviceValues(rule.props, values),
          `${forcedStateRootSelector(state, attribute)} ${classSelector(node.id, name)}`,
          options,
        ),
      );
    }
  }

  return parts.join("\n\n");
}
