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
  mediaQueryFor,
  nodeSelector,
  statePseudoClass,
  stateSelector,
  type CascadeStage,
  type MediaDevice,
  type StateName,
} from "./cascade.ts";
import { declarationsForValues, type Declaration, type TranslateOptions } from "./properties.ts";

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

export type CssClassRule = {
  name: string;
  props: DeviceValueMap;
};

export type CssDocument = {
  nodes: readonly CssNode[];
  classRules?: readonly CssClassRule[];
};

export type CompileOptions = TranslateOptions & {
  // Layer name for all authored output. `null` writes unlayered CSS (used by
  // the golden tests and for measuring what the layer wrapper costs).
  layer?: string | null;
};

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
  primitive: string,
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
type ValueSource = {
  selector: string;
  primitive: string;
  values: DeviceValueMap;
  stage: "state" | "class";
  state: StateName | null;
  classIds: readonly string[];
};

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
    if (per.desktop.length > 0) {
      blocks.push(writeBlock(source.selector, per.desktop, 0));
      rules.push({
        media: null,
        selector: source.selector,
        stage: source.stage,
        state: source.state,
        classIds: source.classIds,
        declarations: per.desktop,
      });
      ruleCount += 1;
      declarationCount += per.desktop.length;
    }
    for (const device of ["tablet", "mobile"] as const) {
      const declarations = per[device];
      if (declarations.length === 0) continue;
      const bucket = buckets[device];
      bucket.blocks.push(writeBlock(source.selector, declarations, 1));
      bucket.rules.push({
        media: mediaQueryFor(device),
        selector: source.selector,
        stage: source.stage,
        state: source.state,
        classIds: source.classIds,
        declarations,
      });
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
    const declarations = declarationsForNode(node, "desktop", options);
    if (declarations.length === 0) continue;
    push(
      {
        media: null,
        selector: nodeSelector(node.id),
        stage: "base",
        state: null,
        classIds: [],
        declarations,
      },
      writeBlock(nodeSelector(node.id), declarations, 0),
    );
  }

  // 2 — device values. Only what differs from the inherited device reaches the
  // stylesheet, so a reset (dropped suffix key) simply inherits again.
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
      deviceBlocks.push(writeBlock(nodeSelector(node.id), declarations, 1));
      rules.push({
        media: query,
        selector: nodeSelector(node.id),
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
  const stateStage = expandSources(stateSources, options);
  blocks.push(...stateStage.blocks);
  rules.push(...stateStage.rules);
  ruleCount += stateStage.ruleCount;
  declarationCount += stateStage.declarationCount;

  // 4 — user classes, anchored on the node that carries them. A node that also
  // carries a state gets a combined rule (`[data-node-id].cls:hover`) with the
  // class values over the state values, so device, state and class meet in one
  // rule and the class stays the stronger stage.
  const classSources: ValueSource[] = [];
  for (const node of flat) {
    for (const name of node.classIds ?? []) {
      const rule = classRules.get(name);
      if (rule === undefined) continue;
      const selector = classSelector(node.id, name);
      classSources.push({
        selector,
        primitive: node.primitive,
        values: rule.props,
        stage: "class",
        state: null,
        classIds: [name],
      });
      for (const state of STATE_ORDER) {
        const stateValues = node.states?.[state];
        if (stateValues === undefined) continue;
        classSources.push({
          selector: `${selector}${statePseudoClass(state)}`,
          primitive: node.primitive,
          values: overlayDeviceValues(rule.props, stateValues),
          stage: "class",
          state,
          classIds: [name],
        });
      }
    }
  }
  const classStage = expandSources(classSources, options);
  blocks.push(...classStage.blocks);
  rules.push(...classStage.rules);
  ruleCount += classStage.ruleCount;
  declarationCount += classStage.declarationCount;

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
