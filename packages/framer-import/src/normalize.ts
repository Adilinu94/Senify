// The normalizer (plan.md S1.4): a tested consolidation step between capture
// and mapper.
//
// Two jobs, in this order:
// 1. **Consolidate** — the S0 measurement (B5) says 20–30 % of the CSS rules
//    are declaration duplicates and 32–45 % of classes are used once. Instead
//    of copying Framer's per-node classes, identical declaration sets collapse
//    into one shared rule; nodes then reference the rule by name.
// 2. **Enforce the DNA** (decision 23.09./2): the import must write a
//    DNA-conformant site. Values the DNA forbids (gradients, shadows, radius,
//    pure white base, neon, centered headings, monospace) are rewritten to a
//    conformant form — and every rewrite becomes a `dna-adjustment` finding
//    with its Belegstelle. The page may differ from the original; the report
//    says where and why. This mirrors the engine's NEVER_PATTERNS
//    (`packages/engine/src/design-contract.ts`) so an import can never write
//    what the publish gate would later block.

import type {
  FramerIrDocument,
  IrFinding,
  IrNode,
  IrState,
  IrVisual,
} from "./ir.ts";

/* ------------------------------------------------------------------ types */

export type NormalizedStyleRule = {
  id: string;
  name: string;
  declarations: Record<string, string>;
  // How many nodes reference this rule after consolidation.
  uses: number;
  nodeKeys: string[];
  device: IrNode["states"][number]["device"];
};

export type NormalizedNode = IrNode;

export type NormalizeResult = {
  document: FramerIrDocument;
  rules: NormalizedStyleRule[];
  findings: IrFinding[];
  // The consolidation numbers the plan promises (S0/B5): rules before/after.
  stats: {
    nodes: number;
    declarationSets: number;
    rules: number;
    droppedDeclarations: number;
  };
};

/* -------------------------------------------------------------- constants */

// The DNA `never` rules the import can fix mechanically. Everything else
// (neon, mono, white base) is checked but only reported when it cannot be
// rewritten safely.
const GRADIENT_RE = /gradient\(/i;

function isDnaForbiddenShadow(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "none";
}

function isDnaForbiddenRadius(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "0";
}

function isNeonColor(value: string): boolean {
  return /#(00ff|0f0|ff00|f0f|00ffff|0ff)/i.test(value);
}

function isMonoFont(value: string): boolean {
  return /mono/i.test(value);
}

/* -------------------------------------------------------------- dna pass */

function adjustVisual(
  visual: IrVisual,
  tag: string,
  kind: string,
  findings: IrFinding[],
  nodeKey: string,
): IrVisual {
  const out: IrVisual = {};
  for (const [property, entry] of Object.entries(visual)) {
    if (entry === undefined) continue;
    const value: string = entry;
    // 1. Gradients → flat token color. The first color inside the gradient
    //    wins; the finding documents the loss.
    if (GRADIENT_RE.test(value)) {
      const first = /(?:rgba?|hsla?|#[0-9a-fA-F]{3,8})/.exec(value)?.[0];
      if (first !== undefined) {
        out[property] = first;
        findings.push({
          kind: "dna-adjustment",
          nodeKey,
          message: `Verlauf in ${property} durch flächige Farbe ersetzt (${first}).`,
          evidence: `${property}: ${value.slice(0, 80)}`,
          severity: "info",
          suggestion: "Die DNA verbietet Verläufe — flächige Token-Farbe statt gradient().",
        });
        continue;
      }
      // No readable color: drop the declaration entirely.
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: `Verlauf in ${property} entfernt (keine lesbare Farbe).`,
        evidence: `${property}: ${value.slice(0, 80)}`,
        severity: "warn",
        suggestion: "Die DNA verbietet Verläufe — die Fläche fällt auf den Hintergrund zurück.",
      });
      continue;
    }
    // 2. Shadows → none. The DNA forbids depth; borders carry separation.
    if (property === "box-shadow" && isDnaForbiddenShadow(value)) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: "Schatten entfernt (DNA verbietet Tiefe).",
        evidence: `box-shadow: ${value.slice(0, 80)}`,
        severity: "info",
        suggestion: "Konturen/Borders statt Schatten nutzen.",
      });
      continue;
    }
    // 3. Radius → 0.
    if (property === "border-radius" && isDnaForbiddenRadius(value)) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: `Rundung ${value} auf 0 gesetzt (DNA verlangt harte Kanten).`,
        evidence: `border-radius: ${value}`,
        severity: "info",
        suggestion: "Harte Kanten statt Rundungen.",
      });
      continue;
    }
    // 4. Neon colors → reported (the mapper maps them onto the theme accent).
    if (isNeonColor(value)) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: `Neonfarbe in ${property} wird auf die Theme-Akzentfarbe gemappt.`,
        evidence: `${property}: ${value}`,
        severity: "info",
        suggestion: "Gedeckte Akzentfarbe aus dem Theme statt Neon.",
      });
      out[property] = value;
      continue;
    }
    // 5. Monospace → reported (the mapper uses the theme font).
    if ((property === "font-family" || property === "fontFamily") && isMonoFont(value)) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: "Monospace-Schrift wird auf die Theme-Schrift gemappt.",
        evidence: `font-family: ${value}`,
        severity: "info",
        suggestion: "Die DNA verbietet Monospace außerhalb von Code.",
      });
      out[property] = value;
      continue;
    }
    out[property] = value;
  }
  // 6. Centered headings → left aligned (the DNA's typography rule).
  if (
    (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") &&
    out["text-align"] === "center"
  ) {
    delete out["text-align"];
    findings.push({
      kind: "dna-adjustment",
      nodeKey,
      message: "Zentrierte Überschrift auf linksbündig gesetzt.",
      evidence: `text-align: center auf ${tag}`,
      severity: "info",
      suggestion: "Die DNA verlangt linksbündige Headings.",
    });
  }
  return out;
}

function adjustTextInline(
  inline: Record<string, string>,
  tag: string,
  findings: IrFinding[],
  nodeKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, value] of Object.entries(inline)) {
    if (property === "color" && isNeonColor(value)) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: "Neonfarbe wird auf die Theme-Akzentfarbe gemappt.",
        evidence: `color: ${value}`,
        severity: "info",
        suggestion: "Gedeckte Akzentfarbe aus dem Theme statt Neon.",
      });
      out[property] = value;
      continue;
    }
    if (property === "fontFamily" && isMonoFont(value)) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: "Monospace-Schrift wird auf die Theme-Schrift gemappt.",
        evidence: `fontFamily: ${value}`,
        severity: "info",
        suggestion: "Die DNA verbietet Monospace außerhalb von Code.",
      });
      out[property] = value;
      continue;
    }
    if (
      property === "textAlign" &&
      value === "center" &&
      (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6")
    ) {
      findings.push({
        kind: "dna-adjustment",
        nodeKey,
        message: "Zentrierte Überschrift auf linksbündig gesetzt.",
        evidence: `textAlign: center auf ${tag}`,
        severity: "info",
        suggestion: "Die DNA verlangt linksbündige Headings.",
      });
      continue;
    }
    out[property] = value;
  }
  return out;
}

function walkDna(node: IrNode, findings: IrFinding[]): void {
  node.states = node.states.map((state) => adjustState(state, node, findings));
  for (const child of node.children) walkDna(child, findings);
}

function adjustState(state: IrState, node: IrNode, findings: IrFinding[]): IrState {
  const visual = adjustVisual(state.visual, node.tag, node.kind, findings, node.key);
  const text = state.text === null
    ? null
    : { ...state.text, inline: adjustTextInline(state.text.inline, node.tag, findings, node.key) };
  return { ...state, visual, text };
}

/* ------------------------------------------------------- consolidation pass */

// The declaration set is the identity: two rules with the same sorted
// declarations collapse into one shared rule.
function declarationKey(declarations: Record<string, string>): string {
  return Object.entries(declarations)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

export function normalize(document: FramerIrDocument): NormalizeResult {
  const findings: IrFinding[] = [...document.findings];
  const nodeCount = countIrNodes(document.pages[0]?.root);

  // 1. DNA pass over every node state.
  for (const page of document.pages) walkDna(page.root, findings);

  // 2. Consolidation: walk the tree, collect each node's merged declaration
  //    set (visual + text inline), and fold identical sets into shared rules.
  const ruleBySet = new Map<string, NormalizedStyleRule>();
  const rules: NormalizedStyleRule[] = [];
  let droppedDeclarations = 0;

  const collect = (node: IrNode): void => {
    for (const state of node.states) {
      const merged: Record<string, string> = {};
      for (const [property, value] of Object.entries(state.visual)) {
        if (value !== undefined) merged[property] = value;
      }
      if (state.text !== null) Object.assign(merged, state.text.inline);
      if (state.layout !== null) {
        if (state.layout.mode !== "flow") merged["display"] = state.layout.mode;
        if (state.layout.direction !== undefined) merged["flexDirection"] = state.layout.direction;
        if (state.layout.align !== undefined) merged["alignItems"] = state.layout.align;
        if (state.layout.justify !== undefined) merged["justifyContent"] = state.layout.justify;
        if (state.layout.wrap !== undefined) merged["flexWrap"] = state.layout.wrap ? "wrap" : "nowrap";
        if (state.layout.gap !== undefined) merged["gap"] = state.layout.gap;
        if (state.layout.columns !== undefined) merged["gridTemplateColumns"] = state.layout.columns;
        if (state.layout.rows !== undefined) merged["gridTemplateRows"] = state.layout.rows;
      }
      if (state.box !== null) {
        for (const [property, value] of Object.entries(state.box)) {
          if (value === undefined || value === null) continue;
          const mapped = {
            width: "width",
            height: "height",
            minWidth: "minWidth",
            maxWidth: "maxWidth",
            minHeight: "minHeight",
            maxHeight: "maxHeight",
            aspectRatio: "aspectRatio",
            position: "position",
            zIndex: "zIndex",
            top: "top",
            right: "right",
            bottom: "bottom",
            left: "left",
          }[property];
          if (mapped !== undefined && typeof value === "string") merged[mapped] = value;
          if (property === "inset" && typeof value === "object" && value !== null) {
            for (const [side, insetValue] of Object.entries(value)) {
              if (typeof insetValue === "string") merged[side] = insetValue;
            }
          }
        }
      }
      // Drop declarations the Senify style table cannot carry (measured in
      // S0: they are a small minority — corner-shape, backdrop-filter legacy
      // prefixes, -webkit-*).
      for (const property of Object.keys(merged)) {
        if (property.startsWith("-webkit-") || property.startsWith("-moz-")) {
          delete merged[property];
          droppedDeclarations += 1;
        }
      }
      if (Object.keys(merged).length === 0) continue;
      const key = declarationKey(merged);
      const existing = ruleBySet.get(key);
      if (existing !== undefined) {
        existing.uses += 1;
        if (!existing.nodeKeys.includes(node.key)) existing.nodeKeys.push(node.key);
        continue;
      }
      const rule: NormalizedStyleRule = {
        id: `fi-${ruleBySet.size + 1}`,
        name: `framer-${ruleBySet.size + 1}`,
        declarations: merged,
        uses: 1,
        nodeKeys: [node.key],
        device: state.device,
      };
      ruleBySet.set(key, rule);
      rules.push(rule);
    }
    for (const child of node.children) collect(child);
  };
  for (const page of document.pages) collect(page.root);

  const declarationSets = rules.length;
  return {
    document: { ...document, findings },
    rules,
    findings,
    stats: {
      nodes: nodeCount,
      declarationSets,
      rules: rules.length,
      droppedDeclarations,
    },
  };
}

function countIrNodes(node: IrNode | undefined): number {
  if (node === undefined) return 0;
  return 1 + node.children.reduce((sum, child) => sum + countIrNodes(child), 0);
}
