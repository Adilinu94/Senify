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
import { declarationsForValues, type Declaration, type TranslateOptions } from "./properties.ts";
import { isSafeRawCss, normalizeRawCss } from "./value-grammar.ts";

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

export type CssReport = {
  css: string;
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
  return declarationsForValues(node.primitive, resolveAllForDevice(node.inline, device), options)
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
  options: TranslateOptions = {},
): string[] {
  const per = declarationsPerDevice(primitive, values, options);
  const blocks: string[] = [];
  if (per.desktop.length > 0) blocks.push(writeBlock(selector, per.desktop, 0));
  for (const device of ["tablet", "mobile"] as const) {
    if (per[device].length === 0) continue;
    blocks.push(writeMedia(mediaQueryFor(device), [writeBlock(selector, per[device], 1)], 0));
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
  devices: readonly Device[] = ["desktop", "tablet", "mobile"],
): { blocks: string[]; rules: CompiledRule[]; ruleCount: number; declarationCount: number } {
  const blocks: string[] = [];
  const rules: CompiledRule[] = [];
  let ruleCount = 0;
  let declarationCount = 0;
  const buckets: Record<MediaDevice, { blocks: string[]; rules: CompiledRule[] }> = {
    tablet: { blocks: [], rules: [] },
    mobile: { blocks: [], rules: [] },
  };

  for (const source of sources) {
    const per = declarationsPerDevice(source.primitive, source.values, options);
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

    // A custom condition nests the device blocks inside its at-rule: the two
    // conditions are independent, so they may not be merged with `and`.
    if (source.context !== undefined) {
      const inner: string[] = [];
      if (devices.includes("desktop") && per.desktop.length > 0) {
        inner.push(writeBlock(source.selector, per.desktop, 1));
        rules.push(ruleFor(null, per.desktop));
        ruleCount += 1;
        declarationCount += per.desktop.length;
      }
      for (const device of ["tablet", "mobile"] as const) {
        if (!devices.includes(device)) continue;
        const declarations = per[device];
        if (declarations.length === 0) continue;
        inner.push(
          writeMedia(mediaQueryFor(device), [writeBlock(source.selector, declarations, 2)], 1),
        );
        rules.push(ruleFor(mediaQueryFor(device), declarations));
        ruleCount += 1;
        declarationCount += declarations.length;
      }
      if (inner.length > 0) blocks.push(writeMedia(source.context, inner, 0));
      continue;
    }

    if (devices.includes("desktop") && per.desktop.length > 0) {
      blocks.push(writeBlock(source.selector, per.desktop, 0));
      rules.push(ruleFor(null, per.desktop));
      ruleCount += 1;
      declarationCount += per.desktop.length;
    }
    for (const device of ["tablet", "mobile"] as const) {
      if (!devices.includes(device)) continue;
      const declarations = per[device];
      if (declarations.length === 0) continue;
      const bucket = buckets[device];
      bucket.blocks.push(writeBlock(source.selector, declarations, 1));
      bucket.rules.push(ruleFor(mediaQueryFor(device), declarations));
      ruleCount += 1;
      declarationCount += declarations.length;
    }
  }

  for (const device of ["tablet", "mobile"] as const) {
    const bucket = buckets[device];
    if (bucket.blocks.length === 0) continue;
    blocks.push(writeMedia(mediaQueryFor(device), bucket.blocks, 0));
    rules.push(...bucket.rules);
  }

  return { blocks, rules, ruleCount, declarationCount };
}

type BuildResult = {
  blocks: string[];
  rules: CompiledRule[];
  ruleCount: number;
  declarationCount: number;
};

function build(document: CssDocument, options: CompileOptions): BuildResult {
  const flat = flattenNodes(document.nodes);
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

  const emitSources = (
    sources: readonly ValueSource[],
    devices: readonly Device[] = ["desktop", "tablet", "mobile"],
  ): void => {
    if (sources.length === 0) return;
    const stage = expandSources(sources, options, devices);
    blocks.push(...stage.blocks);
    rules.push(...stage.rules);
    ruleCount += stage.ruleCount;
    declarationCount += stage.declarationCount;
  };

  const emitNodeBase = (): void => {
    for (const node of flat) {
      const declarations = declarationsForNode(node, "desktop", options);
      if (declarations.length === 0) continue;
      const selector = selectorFor(node.id);
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
  };

  const emitNodeDevice = (): void => {
    for (const device of ["tablet", "mobile"] as const) {
      const deviceBlocks: string[] = [];
      const query = mediaQueryFor(device);
      for (const node of flat) {
        if (node.props === undefined) continue;
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
  };

  const classRules = new Map((document.classRules ?? []).map((rule) => [rule.name, rule]));

  // 1 — the node's own pseudo states. They are local and are emitted after the
  // global class states, so a local hover wins at the same condition.
  const nodeStateSources: ValueSource[] = [];
  for (const node of flat) {
    for (const state of STATE_ORDER) {
      const values = node.states?.[state];
      if (values === undefined) continue;
      nodeStateSources.push({
        selector: stateSelector(node.id, state),
        primitive: node.primitive,
        values,
        stage: "state",
        state,
        classIds: [],
      });
    }
  }

  // The sources of the matrix of ADR-0017. Global rules are classes and
  // ambient rules; local rules are node values and scoped rules.
  const globalBaseSources: ValueSource[] = [];
  const globalStateSources: ValueSource[] = [];
  const localBaseSources: ValueSource[] = [];
  const localStateSources: ValueSource[] = [];

  const pushRuleProps = (
    target: ValueSource[],
    rule: CssClassRule,
    selector: string,
    primitive: string | undefined,
    classIds: readonly string[],
  ): void => {
    target.push({
      selector,
      primitive,
      values: rule.props,
      stage: "class",
      state: null,
      classIds,
    });
    for (const [context, contextValues] of contextEntries(rule.contextStyles)) {
      target.push({
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

  // A rule state is a global (or local, for scoped rules) state source. The
  // node's own state stays a separate local source, so at the same condition
  // the later local rule wins. A rule state no longer needs the anchored
  // `[data-node-id].cls:hover` combination: `.cls:hover` carries the class
  // state, the node state carries the local values, and the cascade resolves
  // the overlap.
  const pushRuleStates = (
    target: ValueSource[],
    rule: CssClassRule,
    selector: string,
    primitive: string | undefined,
    classIds: readonly string[],
  ): void => {
    for (const state of STATE_ORDER) {
      const ruleState = rule.states?.[state];
      if (ruleState === undefined) continue;
      const stateValues = overlayDeviceValues(ruleState, rule.props);
      const stateSelector_ = `${selector}${statePseudoClass(state)}`;
      target.push({
        selector: stateSelector_,
        primitive,
        values: stateValues,
        stage: "class",
        state,
        classIds,
      });
      for (const [context, contextValues] of contextEntries(rule.contextStyles)) {
        target.push({
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
    baseTarget: ValueSource[],
    stateTarget: ValueSource[],
    rule: CssClassRule,
    selector: string,
    primitive: string | undefined,
    classIds: readonly string[],
  ): void => {
    pushRuleProps(baseTarget, rule, selector, primitive, classIds);
    pushRuleStates(stateTarget, rule, selector, primitive, classIds);
  };

  if (options.classEmission === "regional") {
    for (const node of flat) {
      for (const name of node.classIds ?? []) {
        const rule = classRules.get(name);
        if (rule === undefined) continue;
        pushRuleSources(
          globalBaseSources,
          globalStateSources,
          rule,
          classSelector(node.id, name),
          node.primitive,
          [name],
        );
      }
    }
  } else {
    // Ticket 14: one rule per class for all its carriers, in the rule order of
    // the document (`order` is the cascade order, ticket 07). The class base
    // (`.cls`) is global and weaker than a local node value of the same
    // condition; class states are emitted as `.cls:hover`, so a local node
    // state of the same condition follows and wins.
    const firstCarrier = new Map<string, CssNode>();
    for (const node of flat) {
      for (const name of node.classIds ?? []) {
        if (!firstCarrier.has(name)) firstCarrier.set(name, node);
      }
    }
    for (const rule of document.classRules ?? []) {
      if (rule.kind !== undefined && rule.kind !== "class") continue;
      const carrier = firstCarrier.get(rule.name);
      if (carrier === undefined) continue;
      pushRuleSources(
        globalBaseSources,
        globalStateSources,
        rule,
        globalClassSelector(rule.name),
        carrier.primitive,
        [rule.name],
      );
    }
  }

  for (const rule of document.classRules ?? []) {
    if (rule.kind === "ambient") {
      const selector = rule.selector ?? rule.name;
      pushRuleSources(globalBaseSources, globalStateSources, rule, selector, undefined, []);
      continue;
    }
    if (rule.kind === "scoped" && rule.scope !== undefined) {
      const node = flat.find((entry) => entry.id === rule.scope?.nodeId);
      // A scoped rule whose node is gone is dead; it is not emitted.
      if (node === undefined || rule.selector === undefined) continue;
      pushRuleSources(
        localBaseSources,
        localStateSources,
        rule,
        `${selectorFor(node.id)}${rule.selector}`,
        node.primitive,
        [rule.name],
      );
    }
  }

  // ADR-0017: condition before origin, local before global at the same
  // condition. The class base is the weakest authored level; the class device
  // and class state remain stronger than a local base, because the condition
  // is narrower. Inline stays outside the layer and is not part of this list.
  emitSources(globalBaseSources, ["desktop"]);
  emitNodeBase();
  emitSources(localBaseSources, ["desktop"]);
  emitSources(globalBaseSources, ["tablet", "mobile"]);
  emitNodeDevice();
  emitSources(localBaseSources, ["tablet", "mobile"]);
  emitSources(globalStateSources);
  emitSources(nodeStateSources);
  emitSources(localStateSources);

  // Raw at-rules (ADR-0005): only `@keyframes`, validated and normalized.
  // They carry no declarations of a rule, so they add bytes but no rule count.
  for (const rule of document.classRules ?? []) {
    if (rule.rawCss === undefined || !isSafeRawCss(rule.rawCss)) continue;
    blocks.push(normalizeRawCss(rule.rawCss));
  }

  return { blocks, rules, ruleCount, declarationCount };
}

export function compileCssReport(document: CssDocument, options: CompileOptions = {}): CssReport {
  const layer = options.layer === undefined ? CASCADE_LAYER : options.layer;
  const built = build(document, options);
  const body = built.blocks.join("\n\n");
  const css =
    built.blocks.length === 0 ? "" : layer === null ? body : `@layer ${layer} {\n${indentText(body, 1)}\n}`;
  return {
    css,
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
