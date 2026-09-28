// The one module both sides may import.
//
// `tools.ts` is GENERATED and holds nothing but the facts. `tools-index.ts`
// holds the logic. This file is what joins them, and it is the only place that
// sees both - which is exactly why the join lives here and not in either of
// them. An earlier version re-exported the helpers from the generated file,
// which made the generated file import its own consumer; the cycle only showed
// up in a built bundle, as a `.map` of `undefined` in a stack trace naming
// neither module.
export { TOOL_MANIFEST } from "./tools.ts";
export { toolsByName, toolsInGroup, TOOL_GROUP_LABELS, TOOL_GROUP_ORDER } from "./tools-index.ts";
export type { ToolFact, ToolGroup, ToolScope } from "./types.ts";
