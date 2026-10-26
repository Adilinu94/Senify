// The CSS compiler (Phase 0, second slice): node properties in, one CSS
// stylesheet out — the same string for the editor canvas and for the release.
//
// Input is plain data (no DOM): a node list with `id`, `primitive`, `props`
// (including the `_tablet` / `_mobile` device suffixes of `device.ts`),
// children and slots, plus optionally user classes, pseudo states and inline
// values. Output is a single stylesheet that follows the cascade decision of
// `cascade.ts`.

import {
  baseKeyOf,
  resolveAllForDevice,
  type Device,
  type DeviceValueMap,
} from "../device.ts";
import {
  CASCADE_LAYER,
  HOVER_GUARD,
  STATE_ORDER,
  classSelector,
  globalClassSelector,
  mediaQueryFor,
  nodeSelector,
  statePseudoClass,
  stateSelector,
  type CascadeStage,
  type MediaDevice,
  type StateName,
} from "./cascade.ts";
import {
  declarationsForValues,
  type Declaration,
  type DroppedValue,
  type TranslateOptions,
} from "./properties.ts";
import { isSafeRawCss, normalizeRawCss } from "./value-grammar.ts";
import type { Breakpoints } from "../breakpoints.ts";

export type CssNode = {
  id: string;
  primitive: string;
  props?: DeviceValueMap;
  // User-authored class rules that apply to this node (see `classRules`).
  classIds?: readonly string[];
  // Pseudo state values, same shape as `props` (device suffixes allowed).
  states?: Partial<Record<StateName, DeviceValueMap>>;
  // The strongest level: declarations for the element's `style` attribute.
  inline?: DeviceValueMap;
  children?: readonly CssNode[];
  slots?: Readonly<Record<string, readonly CssNode[]>>;
};

// A user-authored rule as the compiler reads it. `kind`/`selector`/`scope` are
// optional so a plain value bag (the editor's older class form) still works;
// a rule that carries them is emitted the way the site registry stores it
// (ADR-0005): `ambient` verbatim without a node anchor, `scoped` anchored on
// its node, `contextStyles` as custom conditions beside the device stages.
export type CssClassRule = {
  name: string;
  props: DeviceValueMap;
  // Pseudo states at the rule (O11). A node that carries the rule and a state
  // gets the combined selector `[data-node-id].cls:hover`.
  states?: Partial<Record<StateName, DeviceValueMap>>;
  kind?: "class" | "ambient" | "scoped";
  selector?: string;
  scope?: { nodeId: string };
  contextStyles?: Record<string, DeviceValueMap>;
  rawCss?: string;
};

export type CssDocument = {
  nodes: readonly CssNode[];
  classRules?: readonly CssClassRule[];
};

export type CompileOptions = TranslateOptions & {
  // Layer name for all authored output. `null` writes unlayered CSS (used by
  // the golden tests and for measuring what the layer wrapper costs).
  layer?: string | null;
  // How a node id becomes a selector. The default is the node attribute
  // (`[data-node-id="…"]`) the renderer marks every node with. The widget
  // defaults (`markup.ts`) compile the very same declarations under the
  // primitive's class instead, so a node rule and a widget default differ in
  // exactly one thing: which element they address.
  selectorFor?: (nodeId: string) => string;
  // How class rules reach the stylesheet (ticket 14, measured against each
  // other): `global` emits one `.cls` rule per class and dedupes it over all
  // carriers (the measured winner and the default), `regional` anchors every
  // class rule on every carrying node (`[data-node-id].cls`, the older path,
  // kept for the measurement and as the documented retreat). The global
  // variant translates the rule with the primitive of its first carrier and
  // keeps node-specific state combinations anchored (see `build`), because an
  // unanchored `.cls` loses against `[data-node-id]:hover` on specificity
  // alone.
  classEmission?: "global" | "regional";
  // The width pair the device media queries are written for (ADR-0020). Left
  // out, the platform default (tablet 1024, mobile 640) applies.
  breakpoints?: Breakpoints;
};

export function defaultSelectorFor(nodeId: string): string {
  return nodeSelector(nodeId);
}

// One emitted rule as data: its media wrapper, its selector, the cascade stage
// it belongs to and the selector modifiers it combines. The stylesheet string
// is built from exactly these rules, so a consumer (the renderer) can read the
// structure instead of re-parsing the CSS.
export type CompiledRule = {
  media: string | null;
  selector: string;
  stage: CascadeStage;
  state: StateName | null;
  classIds: readonly string[];
  // The custom condition a declaration sits in (ADR-0005). `media` stays the
  // device query, so the two levels of a nested at-rule stay readable.
  context?: string;
  declarations: Declaration[];
};

// A value the compiler dropped because it is not valid CSS, with the selector
// of the rule it would have been part of. The stylesheet stays silent about it
// (the browser would ignore the declaration too), this list does not.
export type CssDiagnostic = DroppedValue & { selector: string };

export type CssReport = {
  css: string;
  // Dropped values, in the order the compiler met them, once per selector,
  // property and reason.
  diagnostics: CssDiagnostic[];
  bytes: number;
  characters: number;
  ruleCount: number;
  declarationCount: number;
  nodeCount: number;
  rules: CompiledRule[];
};

// UTF-8 byte size of a stylesheet — the number that matters for the wire.
export function measureCss(css: string): number {
  return new TextEncoder().encode(css).length;
}

// Document order: a node, then its children, then its slot children. Slots are
// visited in key order so the same tree always flattens the same way.
export function flattenNodes(nodes: readonly CssNode[]): CssNode[] {
  const flat: CssNode[] = [];
  const visit = (node: CssNode): void => {
    flat.push(node);
    for (const child of node.children ?? []) visit(child);
    for (const slot of Object.values(node.slots ?? {})) {
      for (const child of slot) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return flat;
}

export function declarationsForNode(
  node: CssNode,
  device: Device = "desktop",
  options: TranslateOptions = {},
): Declaration[] {
  if (node.props === undefined) return [];
  return declarationsForValues(node.primitive, resolveAllForDevice(node.props, device), options);
}

// The inline level of the cascade: what the renderer puts into `style`.
// It lives outside `@layer user-authored`, so it beats every rule above.
export function inlineStyleFor(
  node: CssNode,
  device: Device = "desktop",
  options: TranslateOptions = {},
): string {
  if (node.inline === undefined) return "";
  return declarationsForValues(node.primitive, resolveAllForDevice(node.inline, device), {
    ...options,
    includeDefaults: true,
  })
    .map((declaration) => `${declaration.property}: ${declaration.value}`)
    .join("; ");
}

export function writeBlock(selector: string, declarations: readonly Declaration[], indent: number): string {
  const pad = "  ".repeat(indent);
  const lines = declarations.map(
    (declaration) => `${pad}  ${declaration.property}: ${declaration.value};`,
  );
  return `${pad}${selector} {\n${lines.join("\n")}\n${pad}}`;
}

export function writeMedia(query: string, blocks: readonly string[], indent: number): string {
  const pad = "  ".repeat(indent);
  return `${pad}${query} {\n${blocks.join("\n\n")}\n${pad}}`;
}

function indentText(text: string, indent: number): string {
  const pad = "  ".repeat(indent);
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `${pad}${line}`))
    .join("\n");
}

function previousDevice(device: MediaDevice): Device {
  return device === "tablet" ? "desktop" : "tablet";
}

export type DeviceDeclarations = {
  desktop: Declaration[];
  tablet: Declaration[];
  mobile: Declaration[];
};

// The declarations of one value bag for every device. Only what differs from
// the inherited device is emitted, so a reset (dropped suffix key) inherits
// again. Base and device stages, state, class and the forced-state preview all
// share this one expansion.
export function declarationsPerDevice(
  primitive: string | undefined,
  values: DeviceValueMap,
  options: TranslateOptions = {},
): DeviceDeclarations {
  return {
    desktop: declarationsForValues(primitive, resolveAllForDevice(values, "desktop"), options),
    tablet: declarationsForValues(primitive, resolveAllForDevice(values, "tablet"), {
      ...options,
      baseline: resolveAllForDevice(values, "desktop"),
    }),
    mobile: declarationsForValues(primitive, resolveAllForDevice(values, "mobile"), {
      ...options,
      baseline: resolveAllForDevice(values, "tablet"),
    }),
  };
}

// Renders one selector + values source as portable top-level blocks: the
// desktop block and one media block per narrower device.
export function deviceExpandedBlocks(
  primitive: string,
  values: DeviceValueMap,
  selector: string,
  options: TranslateOptions & { breakpoints?: Breakpoints } = {},
): string[] {
  const per = declarationsPerDevice(primitive, values, options);
  const blocks: string[] = [];
  if (per.desktop.length > 0) blocks.push(writeBlock(selector, per.desktop, 0));
  for (const device of ["tablet", "mobile"] as const) {
    if (per[device].length === 0) continue;
    blocks.push(
      writeMedia(mediaQueryFor(device, options.breakpoints), [writeBlock(selector, per[device], 1)], 0),
    );
  }
  return blocks;
}

// A value source of the `state` / `class` stages: one selector plus the values
// that belong to it. Device expansion happens when the source is flushed.
// `primitive` may be undefined (an ambient rule belongs to no widget), and
// `context` wraps the source in a custom condition (ADR-0005).
type ValueSource = {
  selector: string;
  primitive: string | undefined;
  values: DeviceValueMap;
  stage: "state" | "class";
  state: StateName | null;
  classIds: readonly string[];
  context?: string;
};

// A context id is either a full at-rule prelude (`@media …`, `@container …`,
// `@supports …`) or a bare condition (`(orientation: landscape)`), which is a
// media condition. Sorted by id so the output is stable.
export function contextPrelude(contextId: string): string {
  const trimmed = contextId.trim();
  return trimmed.startsWith("@") ? trimmed : `@media ${trimmed}`;
}

function contextEntries(
  contexts: Record<string, DeviceValueMap> | undefined,
): [string, DeviceValueMap][] {
  if (contexts === undefined) return [];
  return Object.entries(contexts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// The stronger bag wins per base prop key, including all its device levels: a
// class that overrides a prop for tablet replaces the state value entirely, so
// the class stays the stronger stage (O1) instead of mixing device levels.
export function overlayDeviceValues(strong: DeviceValueMap, weak: DeviceValueMap): DeviceValueMap {
  const strongBases = new Set(Object.keys(strong).map(baseKeyOf));
  const merged: DeviceValueMap = {};
  for (const [key, value] of Object.entries(weak)) {
    if (strongBases.has(baseKeyOf(key))) continue;
    merged[key] = value;
  }
  for (const [key, value] of Object.entries(strong)) {
    merged[key] = value;
  }
  return merged;
}

// Device-expands a list of value sources: the desktop rules first, then one
// media block per narrower device (tablet before mobile), everything carrying
// the combined selector of the source.
function expandSources(
  sources: readonly ValueSource[],
  options: CompileOptions,
  scope: { selector: string },
): { blocks: string[]; rules: CompiledRule[]; ruleCount: number; declarationCount: number } {
  const blocks: string[] = [];
  const rules: CompiledRule[] = [];
  let ruleCount = 0;
  let declarationCount = 0;

  // A rule waiting for its block. Hover rules are written inside the hover
  // guard, and neighbours in the same layer share one guard; everything else
  // keeps the plain block. The order of the layer is never changed — a hover
  // rule stays between the rules it was emitted between.
  type Pending = { hover: boolean; selector: string; declarations: Declaration[] };
  const renderLayer = (pending: readonly Pending[], indent: number): string[] => {
    const out: string[] = [];
    let run: string[] = [];
    const flushRun = (): void => {
      if (run.length === 0) return;
      out.push(writeMedia(HOVER_GUARD, run, indent));
      run = [];
    };
    for (const entry of pending) {
      if (entry.hover) {
        run.push(writeBlock(entry.selector, entry.declarations, indent + 1));
        continue;
      }
      flushRun();
      out.push(writeBlock(entry.selector, entry.declarations, indent));
    }
    flushRun();
    return out;
  };

  let desktopRun: Pending[] = [];
  const flushDesktop = (): void => {
    if (desktopRun.length === 0) return;
    blocks.push(...renderLayer(desktopRun, 0));
    desktopRun = [];
  };
  const buckets: Record<MediaDevice, { pending: Pending[]; rules: CompiledRule[] }> = {
    tablet: { pending: [], rules: [] },
    mobile: { pending: [], rules: [] },
  };

  // State and class rules sit above the node's own values: a default value there
  // overrides what is below, so it must not be dropped as redundant.
  const layerOptions: CompileOptions = { ...options, includeDefaults: true };
  for (const source of sources) {
    scope.selector = source.selector;
    const per = declarationsPerDevice(source.primitive, source.values, layerOptions);
    const ruleFor = (
      media: string | null,
      declarations: Declaration[],
    ): CompiledRule => ({
      media,
      selector: source.selector,
      stage: source.stage,
      state: source.state,
      classIds: source.classIds,
      ...(source.context === undefined ? {} : { context: source.context }),
      declarations,
    });
    const hover = source.state === "hover";

    // A custom condition nests the device blocks inside its at-rule: the two
    // conditions are independent, so they may not be merged with `and`. A hover
    // rule nests inside the condition the same way.
    if (source.context !== undefined) {
      const depth = hover ? 2 : 1;
      const inner: string[] = [];
      if (per.desktop.length > 0) {
        inner.push(writeBlock(source.selector, per.desktop, depth));
        rules.push(ruleFor(null, per.desktop));
        ruleCount += 1;
        declarationCount += per.desktop.length;
      }
      for (const device of ["tablet", "mobile"] as const) {
        const declarations = per[device];
        if (declarations.length === 0) continue;
        inner.push(
          writeMedia(
            mediaQueryFor(device, options.breakpoints),
            [writeBlock(source.selector, declarations, depth + 1)],
            depth,
          ),
        );
        rules.push(ruleFor(mediaQueryFor(device, options.breakpoints), declarations));
        ruleCount += 1;
        declarationCount += declarations.length;
      }
      if (inner.length > 0) {
        flushDesktop();
        blocks.push(
          writeMedia(source.context, hover ? [writeMedia(HOVER_GUARD, inner, 1)] : inner, 0),
        );
      }
      continue;
    }

    if (per.desktop.length > 0) {
      desktopRun.push({ hover, selector: source.selector, declarations: per.desktop });
      rules.push(ruleFor(null, per.desktop));
      ruleCount += 1;
      declarationCount += per.desktop.length;
    }
    for (const device of ["tablet", "mobile"] as const) {
      const declarations = per[device];
      if (declarations.length === 0) continue;
      const bucket = buckets[device];
      bucket.pending.push({ hover, selector: source.selector, declarations });
      bucket.rules.push(ruleFor(mediaQueryFor(device, options.breakpoints), declarations));
      ruleCount += 1;
      declarationCount += declarations.length;
    }
  }
  flushDesktop();

  for (const device of ["tablet", "mobile"] as const) {
    const bucket = buckets[device];
    if (bucket.pending.length === 0) continue;
    blocks.push(writeMedia(mediaQueryFor(device, options.breakpoints), renderLayer(bucket.pending, 1), 0));
    rules.push(...bucket.rules);
  }

  return { blocks, rules, ruleCount, declarationCount };
}

type BuildResult = {
  diagnostics: CssDiagnostic[];
  blocks: string[];
  rules: CompiledRule[];
  ruleCount: number;
  declarationCount: number;
};

function build(document: CssDocument, compileOptions: CompileOptions): BuildResult {
  const flat = flattenNodes(document.nodes);
  // Dropped values are collected on the way: one shared callback, the scope
  // tells it which selector the value belonged to. No allocation per node.
  const diagnostics: CssDiagnostic[] = [];
  const seen = new Set<string>();
  const scope = { selector: "" };
  const options: CompileOptions = {
    ...compileOptions,
    onDrop: (drop) => {
      const key = `${scope.selector}\u0000${drop.property}\u0000${drop.reason}`;
      if (!seen.has(key)) {
        seen.add(key);
        diagnostics.push({ ...drop, selector: scope.selector });
      }
      compileOptions.onDrop?.(drop);
    },
  };
  const selectorFor = options.selectorFor ?? defaultSelectorFor;
  const blocks: string[] = [];
  const rules: CompiledRule[] = [];
  let ruleCount = 0;
  let declarationCount = 0;

  const push = (rule: CompiledRule, block: string): void => {
    blocks.push(block);
    rules.push(rule);
    ruleCount += 1;
    declarationCount += rule.declarations.length;
  };

  // 1 — base values (desktop).
  for (const node of flat) {
    scope.selector = selectorFor(node.id);
    const declarations = declarationsForNode(node, "desktop", options);
    if (declarations.length === 0) continue;
    const selector = scope.selector;
    push(
      {
        media: null,
        selector,
        stage: "base",
        state: null,
        classIds: [],
        declarations,
      },
      writeBlock(selector, declarations, 0),
    );
  }

  // 2 — device values. Only what differs from the inherited device reaches the
  // stylesheet, so a reset (dropped suffix key) simply inherits again.
  for (const device of ["tablet", "mobile"] as const) {
    const deviceBlocks: string[] = [];
    const query = mediaQueryFor(device, compileOptions.breakpoints);
    for (const node of flat) {
      if (node.props === undefined) continue;
      scope.selector = selectorFor(node.id);
      const resolved = resolveAllForDevice(node.props, device);
      const baseline = resolveAllForDevice(node.props, previousDevice(device));
      const declarations = declarationsForValues(node.primitive, resolved, {
        ...options,
        baseline,
      });
      if (declarations.length === 0) continue;
      const selector = selectorFor(node.id);
      deviceBlocks.push(writeBlock(selector, declarations, 1));
      rules.push({
        media: query,
        selector,
        stage: "device",
        state: null,
        classIds: [],
        declarations,
      });
      ruleCount += 1;
      declarationCount += declarations.length;
    }
    if (deviceBlocks.length > 0) {
      blocks.push(writeMedia(query, deviceBlocks, 0));
    }
  }

  const classRules = new Map((document.classRules ?? []).map((rule) => [rule.name, rule]));

  // 3 — pseudo states, device-expanded: `[data-node-id]:hover` and, when the
  // state carries device values, the same rule inside the media query.
  const stateSources: ValueSource[] = [];
  for (const node of flat) {
    for (const state of STATE_ORDER) {
      const values = node.states?.[state];
      if (values === undefined) continue;
      stateSources.push({
        selector: stateSelector(node.id, state),
        primitive: node.primitive,
        values,
        stage: "state",
        state,
        classIds: [],
      });
    }
  }
  const stateStage = expandSources(stateSources, options, scope);
  blocks.push(...stateStage.blocks);
  rules.push(...stateStage.rules);
  ruleCount += stateStage.ruleCount;
  declarationCount += stateStage.declarationCount;

  // 4 — user rules, in the class stage.
  //
  // A class rule is emitted once for all its carriers (`.cls`, ticket 14) by
  // default; the rule order of the document carries the class stage. A state
  // at the node or at the rule becomes a combined selector — anchored on the
  // node when the node state is involved (`[data-node-id].cls:hover`), global
  // when only the rule state is — with the class stage staying the stronger
  // one (O1): class state over class props over node state.
  //
  // An ambient rule is emitted verbatim and never anchored — it attaches by
  // selector matching. A scoped rule is anchored on the one node it belongs to.
  // Both are skipped when nothing can carry them.
  const classSources: ValueSource[] = [];

  // The props of a rule (and its custom conditions), one selector each.
  const pushRuleProps = (
    rule: CssClassRule,
    selector: string,
    primitive: string | undefined,
    classIds: readonly string[],
  ): void => {
    classSources.push({
      selector,
      primitive,
      values: rule.props,
      stage: "class",
      state: null,
      classIds,
    });
    for (const [context, contextValues] of contextEntries(rule.contextStyles)) {
      classSources.push({
        selector,
        primitive,
        values: overlayDeviceValues(contextValues, rule.props),
        stage: "class",
        state: null,
        classIds,
        context: contextPrelude(context),
      });
    }
  };

  // The pseudo states of a rule, combined with the states of a node when the
  // call comes from a carrying node. The rule state wins over the node state,
  // the class stage stays stronger than both (O1).
  const pushRuleStates = (
    rule: CssClassRule,
    selector: string,
    primitive: string | undefined,
    nodeStates: Partial<Record<StateName, DeviceValueMap>> | undefined,
    classIds: readonly string[],
  ): void => {
    for (const state of STATE_ORDER) {
      const nodeState = nodeStates?.[state];
      const ruleState = rule.states?.[state];
      if (nodeState === undefined && ruleState === undefined) continue;
      const overNode = overlayDeviceValues(rule.props, nodeState ?? {});
      const stateValues = ruleState === undefined ? overNode : overlayDeviceValues(ruleState, overNode);
      const stateSelector_ = `${selector}${statePseudoClass(state)}`;
      classSources.push({
        selector: stateSelector_,
        primitive,
        values: stateValues,
        stage: "class",
        state,
        classIds,
      });
      for (const [context, contextValues] of contextEntries(rule.contextStyles)) {
        classSources.push({
          selector: stateSelector_,
          primitive,
          values: overlayDeviceValues(contextValues, stateValues),
          stage: "class",
          state,
          classIds,
          context: contextPrelude(context),
        });
      }
    }
  };

  const pushRuleSources = (
    rule: CssClassRule,
    selector: string,
    primitive: string | undefined,
    nodeStates: Partial<Record<StateName, DeviceValueMap>> | undefined,
    classIds: readonly string[],
  ): void => {
    pushRuleProps(rule, selector, primitive, classIds);
    pushRuleStates(rule, selector, primitive, nodeStates, classIds);
  };

  if (options.classEmission === "regional") {
    for (const node of flat) {
      for (const name of node.classIds ?? []) {
        const rule = classRules.get(name);
        if (rule === undefined) continue;
        pushRuleSources(
          rule,
          classSelector(node.id, name),
          node.primitive,
          node.states,
          [name],
        );
      }
    }
  } else {
    // Ticket 14: one rule per class for all its carriers, in the rule order of
    // the document (`order` is the cascade order, ticket 07) — the class stage
    // no longer depends on where the first carrier sits in the tree. The props
    // (and rule states) are emitted once; a node that carries both the class
    // and its own state keeps the anchored combination, because the unanchored
    // `.cls` would lose against `[data-node-id]:hover` (two simple selectors
    // beat one) and the class stage must stay the stronger one (O1).
    const firstCarrier = new Map<string, CssNode>();
    for (const node of flat) {
      for (const name of node.classIds ?? []) {
        if (!firstCarrier.has(name)) firstCarrier.set(name, node);
      }
    }
    for (const rule of document.classRules ?? []) {
      if (rule.kind !== undefined && rule.kind !== "class") continue;
      const carrier = firstCarrier.get(rule.name);
      // A rule whose class stands in a container's INLINE MARKUP has no node of
      // its own (the word spans of an imported headline). It is emitted like an
      // ambient rule: by its own selector, without a carrier. Dropped here, the
      // per-word animation never reaches the page and the headline fades as one
      // block.
      if (carrier === undefined) {
        if (!rule.name.startsWith("senify-inline-")) continue;
        pushRuleSources(rule, `.${rule.name}`, undefined, undefined, [rule.name]);
        continue;
      }
      pushRuleSources(rule, globalClassSelector(rule.name), carrier.primitive, undefined, [rule.name]);
    }
    for (const node of flat) {
      if (node.states === undefined) continue;
      for (const name of node.classIds ?? []) {
        const rule = classRules.get(name);
        if (rule === undefined) continue;
        pushRuleStates(rule, classSelector(node.id, name), node.primitive, node.states, [name]);
      }
    }
  }

  for (const rule of document.classRules ?? []) {
    if (rule.kind === "ambient") {
      const selector = rule.selector ?? rule.name;
      pushRuleSources(rule, selector, undefined, undefined, []);
      continue;
    }
    if (rule.kind === "scoped" && rule.scope !== undefined) {
      const node = flat.find((entry) => entry.id === rule.scope?.nodeId);
      // A scoped rule whose node is gone is dead; it is not emitted.
      if (node === undefined || rule.selector === undefined) continue;
      pushRuleSources(
        rule,
        `${selectorFor(node.id)}${rule.selector}`,
        node.primitive,
        node.states,
        [rule.name],
      );
    }
  }

  const classStage = expandSources(classSources, options, scope);
  blocks.push(...classStage.blocks);
  rules.push(...classStage.rules);
  ruleCount += classStage.ruleCount;
  declarationCount += classStage.declarationCount;

  // 5 — raw at-rules (ADR-0005): only `@keyframes`, validated and normalized.
  // They carry no declarations of a rule, so they add bytes but no rule count.
  for (const rule of document.classRules ?? []) {
    if (rule.rawCss === undefined || !isSafeRawCss(rule.rawCss)) continue;
    blocks.push(normalizeRawCss(rule.rawCss));
  }

  return { diagnostics, blocks, rules, ruleCount, declarationCount };
}

export function compileCssReport(document: CssDocument, options: CompileOptions = {}): CssReport {
  const layer = options.layer === undefined ? CASCADE_LAYER : options.layer;
  const built = build(document, options);
  const body = built.blocks.join("\n\n");
  const css =
    built.blocks.length === 0 ? "" : layer === null ? body : `@layer ${layer} {\n${indentText(body, 1)}\n}`;
  return {
    css,
    diagnostics: built.diagnostics,
    bytes: measureCss(css),
    characters: css.length,
    ruleCount: built.ruleCount,
    declarationCount: built.declarationCount,
    nodeCount: flattenNodes(document.nodes).length,
    rules: built.rules,
  };
}

export function compileCss(document: CssDocument, options: CompileOptions = {}): string {
  return compileCssReport(document, options).css;
}
