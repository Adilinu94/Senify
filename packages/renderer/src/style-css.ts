import { PAGE_ROOT_TYPE, type NodeTree } from "@senify/section-sdk";
import { styleVarsFor } from "@senify/registry";
import {
  compileCssReport,
  resolveBreakpoints,
  scopeNameFor,
  scopeSelectorFor,
  styleRuleToClassRule,
  type CssDiagnostic,
  type Breakpoints,
  type CssNode,
  type StyleRule,
} from "@senify/widget-engine";
import { BREAKPOINTS } from "./breakpoints.ts";

// Breakpoint overrides cannot travel inline: they become a generated
// stylesheet keyed by data-node-id. The same numbers serve the editor
// frames (T13) and the bake. The numbers themselves live in `breakpoints.ts`
// so the canvas can read them without the registry. A site may carry its own
// pair (ADR-0020): the functions below take it as an option and fall back to
// the platform default, so a site without an entry bakes exactly as before.
export { BREAKPOINTS };

export type StyleCssPage = {
  path: string;
  tree: NodeTree;
  // Draft-id -> composed-id pairs of the layout splice (ticket 22). Scoped
  // rules are bound to draft node ids; with a map they are rebuilt on the
  // composed nodes (see `remapScopedRules`). A list per draft id: a component
  // part has one composed node per instance (ticket 04).
  nodeIdMap?: Readonly<Record<string, string[]>>;
};

function mediaQuery(maxWidth: number, body: string): string {
  return `@media (max-width: ${maxWidth - 0.02}px) {\n${body}\n}`;
}

// A node that states where it is shown (an explicit `hidden: false` on a
// device) is a node with its own visibility per device: a copy that exists
// only on mobile, or one hidden on tablet alone. The media queries of a
// breakpoint override cascade downwards (a tablet query also covers mobile), so
// "hidden on tablet only" cannot be written as one override. Each hidden
// device gets its own exact width range instead.
function deviceRanges(breakpoints: Breakpoints): Record<"desktop" | "tablet" | "mobile", string> {
  return {
    desktop: `(min-width: ${breakpoints.tablet}px)`,
    tablet: `(min-width: ${breakpoints.mobile}px) and (max-width: ${breakpoints.tablet - 0.02}px)`,
    mobile: `(max-width: ${breakpoints.mobile - 0.02}px)`,
  };
}

function hasExplicitVisibility(node: NodeTree["nodes"][string]): boolean {
  return node.overrides?.tablet?.hidden === false || node.overrides?.mobile?.hidden === false;
}

function visibilityBlocks(node: NodeTree["nodes"][string], breakpoints: Breakpoints): string[] {
  const ranges = deviceRanges(breakpoints);
  const desktopVisible = node.hidden !== true;
  const visible = {
    desktop: desktopVisible,
    tablet: node.overrides?.tablet?.hidden === undefined ? desktopVisible : node.overrides.tablet.hidden === false,
    mobile: node.overrides?.mobile?.hidden === undefined ? desktopVisible : node.overrides.mobile.hidden === false,
  };
  const blocks: string[] = [];
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    if (visible[device]) continue;
    blocks.push(
      `@media ${ranges[device]} {\n  [data-node-id="${node.id}"] {\n  display: none;\n  }\n}`,
    );
  }
  return blocks;
}

export function overridesCss(pages: StyleCssPage[], siteBreakpoints?: Breakpoints | null): string {
  const breakpoints = resolveBreakpoints(siteBreakpoints);
  const blocks: string[] = [];
  for (const page of pages) {
    for (const node of Object.values(page.tree.nodes)) {
      const overrides = node.overrides;
      if (!overrides) continue;
      const explicit = hasExplicitVisibility(node);
      if (explicit) blocks.push(...visibilityBlocks(node, breakpoints));
      for (const breakpoint of ["tablet", "mobile"] as const) {
        const override = overrides[breakpoint];
        if (!override) continue;
        const vars = styleVarsFor(override.props ?? {}) ?? {};
        const lines: string[] = [];
        if (override.hidden === true && !explicit) lines.push("  display: none;");
        for (const [name, value] of Object.entries(vars)) {
          lines.push(`  ${name}: ${value};`);
        }
        if (lines.length === 0) continue;
        blocks.push(
          mediaQuery(
            breakpoints[breakpoint],
            `  [data-node-id="${node.id}"] {\n${lines.join("\n")}\n  }`,
          ),
        );
      }
    }
  }
  if (blocks.length === 0) return "";
  return `${blocks.join("\n\n")}\n`;
}

// The site-wide style rules of the registry, compiled once for the whole bake.
// This is the release half of the one rule path (ADR-0005): the canvas
// compiles the same rule list through `toCssDocument`, the bake through this
// function, and both meet in the same compiler stages.
//
// The node anchors come from the section trees: `class` rules are emitted on
// the nodes that carry the name (`node.classes`), `scoped` rules on their one
// node, `ambient` rules and `rawCss` (@keyframes) verbatim. Nodes are
// deduplicated by id because layouts repeat across pages.
//
// Scoped rules survive the layout splice (ticket 22): the composition rekeys
// the page/template subtree (`engine/src/templates.ts` `rekeyChildren`), so a
// rule bound to its draft id is rebuilt on the composed node through the
// page's `nodeIdMap`. `class` rules travel on the node itself, `ambient` and
// `rawCss` are id-free. The DOM side is ticket 21: the element that carries
// `data-node-id` also carries the assigned classes and the node's generated
// scope class, which is what makes both selector forms match at all.
//
// The rules stay in `@layer user-authored` — the same layer the widget base
// stylesheet registers (`PRIMITIVE_BASE_CSS`) and the same the canvas frame
// compiles into. The template links this stylesheet after the base so the
// order inside the layer matches the canvas (base first, authored rules last).
export function styleRulesCss(
  pages: readonly StyleCssPage[],
  rules: readonly StyleRule[],
  siteBreakpoints?: Breakpoints | null,
): string {
  return styleRulesReport(pages, rules, siteBreakpoints).css;
}

// The same compile as `styleRulesCss`, with the values the compiler had to drop
// (an invalid keyword, an unsafe property name, an object where a value belongs).
// The bake turns them into warnings, so a rule that silently did nothing is
// visible in the release report.
export function styleRulesReport(
  pages: readonly StyleCssPage[],
  rules: readonly StyleRule[],
  siteBreakpoints?: Breakpoints | null,
): { css: string; diagnostics: CssDiagnostic[] } {
  const nodes = new Map<string, CssNode>();
  for (const page of pages) {
    for (const node of Object.values(page.tree.nodes)) {
      if (nodes.has(node.id)) continue;
      const props = { ...node.props };
      // `title` and `lang` of the page root are page metadata, not styles; left
      // in the props the compiler wrote them as declarations (`lang: de;`).
      if (node.type === PAGE_ROOT_TYPE) {
        delete props["title"];
        delete props["lang"];
      }
      const cssNode: CssNode = { id: node.id, primitive: node.type, props };
      if (node.classes !== undefined && node.classes.length > 0) {
        cssNode.classIds = [...node.classes];
      }
      if (node.overrides !== undefined) {
        cssNode.props = {
          ...cssNode.props,
          ...(node.overrides.tablet?.props === undefined
            ? {}
            : Object.fromEntries(
                Object.entries(node.overrides.tablet.props).map(([key, value]) => [
                  `${key}_tablet`,
                  value,
                ]),
              )),
          ...(node.overrides.mobile?.props === undefined
            ? {}
            : Object.fromEntries(
                Object.entries(node.overrides.mobile.props).map(([key, value]) => [
                  `${key}_mobile`,
                  value,
                ]),
              )),
        };
      }
      nodes.set(node.id, cssNode);
    }
  }
  const classRules = remapScopedRules(pages, rules)
    .flatMap((rule) => {
      if (rule.origin?.source !== "framer-import") return [rule];
      // A definition that attaches by selector and belongs to no node — the
      // source's `:root` colour variables — has no node prop that already
      // carries it, and dropping it loses every `var(--token-…)` on the page.
      // Measured on `rare-works`: 1379 uses, and without the block the icon
      // glyphs fell back to `rgb(0,0,0)` and "One Panel" lost its blue.
      if (rule.kind === "ambient") return [{ ...rule, contextStyles: rule.contextStyles ?? {} }];
      // A word reveal that plays on its own `<span>` inside a container's inline
      // markup: the class stands in the HTML, no node carries it, and the
      // container's own props do not describe it. Dropped, the headline fades as
      // one block — exactly what the source does not do.
      if (rule.name.startsWith("senify-inline-")) return [{ ...rule, contextStyles: rule.contextStyles ?? {} }];
      // An imported rule's base declarations already live in its nodes' own
      // props, so emitting them twice would only repeat them. Its `:hover` /
      // `:focus` / `:active` / `:disabled` states exist nowhere else, so
      // those alone are emitted (and win over the node's base by specificity).
      //
      // Two kinds are the exception and must survive whole:
      //  - a rule with `rawCss` (the compiled appear channel, step 4b): the
      //    `@keyframes` block lives only there, and the `animation` declaration
      //    is what binds it to the node. Dropping the rule drops the effect.
      //  - a rule with `contextStyles` (a breakpoint variant of the same):
      //    the base rule is empty by design and the context carries it.
      if (rule.rawCss !== undefined || Object.keys(rule.contextStyles).length > 0) return [rule];
      const hasStates = Object.values(rule.states ?? {}).some((bag) => Object.keys(bag ?? {}).length > 0);
      return hasStates ? [{ ...rule, styles: {}, contextStyles: {} }] : [];
    })
    .map((rule) => styleRuleToClassRule(rule));
  const report = compileCssReport(
    { nodes: [...nodes.values()], classRules },
    { breakpoints: resolveBreakpoints(siteBreakpoints) },
  );
  return { css: report.css, diagnostics: report.diagnostics };
}

// A scoped rule is owned by exactly one node and generated (`createScopedRule`),
// so a copy for a composed node is built canonically — the same rebuild the
// editor's `applyDuplicateNode` does. One copy per composed occurrence,
// deduplicated by rule id + target id: an entry template used by ten entries
// yields ten selectors, one per composed node. Since ticket 04 a draft id can
// map to several composed ids (one per component instance) — every target gets
// its selector.
function remapScopedRules(
  pages: readonly StyleCssPage[],
  rules: readonly StyleRule[],
): StyleRule[] {
  const maps = pages
    .map((page) => page.nodeIdMap)
    .filter((map): map is Readonly<Record<string, string[]>> => map !== undefined);
  if (maps.length === 0) return [...rules];
  const out: StyleRule[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.kind !== "scoped" || rule.scope === undefined) {
      out.push(rule);
      continue;
    }
    const draftId = rule.scope.nodeId;
    let remapped = false;
    for (const map of maps) {
      for (const target of map[draftId] ?? []) {
        if (target === undefined || target === draftId) continue;
        const key = `${rule.id}\u0000${target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        remapped = true;
        out.push({
          ...rule,
          name: scopeNameFor(target),
          selector: scopeSelectorFor(target),
          scope: { ...rule.scope, nodeId: target },
        });
      }
    }
    // No page composed this node: keep the rule as-is; the compiler drops it
    // when the node is gone (the behavior before ticket 22).
    if (!remapped) out.push(rule);
  }
  return out;
}
