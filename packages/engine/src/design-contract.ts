import type { NodeTree } from "@senify/section-sdk";
import { SenifyError } from "@senify/core";
import type { Store } from "./store.ts";
import type { DesignContract, DesignContractViolation } from "./types.ts";

// Design-DNA per project (E26 slice 3, R9): the rules a reference-based design
// must follow live on the site, not only in the brief. The contract is derived
// from the assigned references (their family rules and vocabulary) and can be
// overridden by hand. In the write path the `never` rules are hard for agent
// tokens and a warning for humans — "nie Gradienten" is finally enforceable.

export type DesignContractInput = {
  constants: readonly string[];
  never: readonly string[];
  vocabulary: readonly string[];
};

const MAX_ENTRIES = 12;

function entries(list: readonly string[]): string[] {
  return [
    ...new Set(list.map((entry) => entry.trim()).filter((entry) => entry !== "")),
  ].slice(0, MAX_ENTRIES);
}

// Derived contract of the assigned references: the family rules of every
// profile feed constants/never, the vocabulary travels along. Deterministic —
// same assignments, same contract.
export function deriveDesignContract(
  profiles: readonly {
    constants: readonly string[];
    never: readonly string[];
    vocabulary: readonly string[];
  }[],
): DesignContractInput {
  const constants: string[] = [];
  const never: string[] = [];
  const vocabulary: string[] = [];
  for (const profile of profiles) {
    constants.push(...profile.constants);
    never.push(...profile.never);
    vocabulary.push(...profile.vocabulary);
  }
  return {
    constants: entries(constants),
    never: entries(never),
    vocabulary: entries(vocabulary),
  };
}

// Enforceable `never` patterns: free-text rules stay in the brief, but the
// patterns below map to measurable properties and block the write.
type NeverPattern = {
  // Substring of the rule text that activates the pattern (case-insensitive).
  match: string;
  code: string;
  test: (node: NodeTree["nodes"][string]) => boolean;
  suggestion: string;
};

// A gradient anywhere in the node's string props (background, image values,
// copy that embeds CSS) — the pattern the briefs warn about.
function hasGradientValue(node: NodeTree["nodes"][string]): boolean {
  return Object.values(node.props).some(
    (value) => typeof value === "string" && /gradient\(/i.test(value),
  );
}

const NEVER_PATTERNS: readonly NeverPattern[] = [
  {
    match: "verlaeufe",
    code: "dna-no-gradients",
    test: (node) => hasGradientValue(node),
    suggestion:
      "Die DNA verbietet Verläufe: nutze eine flächige Token-Farbe statt linear-gradient(...).",
  },
  {
    match: "verlauf",
    code: "dna-no-gradients",
    test: (node) => hasGradientValue(node),
    suggestion:
      "Die DNA verbietet Verläufe: nutze eine flächige Token-Farbe statt linear-gradient(...).",
  },
  {
    match: "gradienten",
    code: "dna-no-gradients",
    test: (node) => hasGradientValue(node),
    suggestion:
      "Die DNA verbietet Gradienten: nutze eine flächige Token-Farbe statt linear-gradient(...).",
  },
  {
    match: "gradient",
    code: "dna-no-gradients",
    test: (node) => hasGradientValue(node),
    suggestion:
      "Die DNA verbietet Gradienten: nutze eine flächige Token-Farbe statt linear-gradient(...).",
  },
  {
    match: "schatten",
    code: "dna-no-shadows",
    test: (node) => {
      const shadow = node.props["boxShadow"];
      const style = node.props["boxShadowStyle"];
      return (
        (typeof shadow === "string" && shadow.trim() !== "" && shadow !== "none") ||
        style === "shadow"
      );
    },
    suggestion:
      "Die DNA verbietet Schatten: setze boxShadow zurück oder nutze Konturen/Borders statt Tiefe.",
  },
  {
    match: "rundungen",
    code: "dna-no-radius",
    test: (node) => {
      const radius = node.props["borderRadius"];
      return typeof radius === "string" && radius.trim() !== "" && radius !== "0";
    },
    suggestion:
      "Die DNA verbietet Rundungen: setze borderRadius auf 0 (harte Kanten).",
  },
  {
    match: "weiss als grundflaeche",
    code: "dna-no-white-base",
    test: (node) => {
      const bg = node.props["background"];
      const color = node.props["backgroundColor"];
      return bg === "#ffffff" || color === "#ffffff";
    },
    suggestion:
      "Die DNA verbietet reines Weiß als Grundfläche: nutze eine dunkle oder getönte Token-Farbe.",
  },
  {
    match: "neon",
    code: "dna-no-neon",
    test: (node) => {
      const values = Object.values(node.props).filter(
        (value): value is string => typeof value === "string",
      );
      return values.some((value) =>
        /#(00ff|0f0|ff00|f0f|00ffff|0ff)/i.test(value),
      );
    },
    suggestion:
      "Die DNA verbietet Neonakzente: nutze eine gedeckte Akzentfarbe aus dem Theme.",
  },
  {
    match: "zentrierung",
    code: "dna-no-centering",
    test: (node) => {
      const align = node.props["textAlign"];
      return align === "center" && node.type === "heading";
    },
    suggestion:
      "Die DNA verlangt Linksausrichtung: setze textAlign auf left für Headings.",
  },
  {
    match: "monospace",
    code: "dna-no-mono",
    test: (node) => {
      const font = node.props["fontFamily"];
      return (
        typeof font === "string" &&
        /mono/i.test(font) &&
        node.type !== "code"
      );
    },
    suggestion:
      "Die DNA verbietet Monospace-Typografie außerhalb von Code: nutze die Theme-Schrift.",
  },
];

// Violations of the contract's `never` rules on a tree: one finding per node,
// with the rule that was broken. The `constants` are brief material (they
// describe intent, not measurable properties) and never block.
export function designContractViolations(
  tree: NodeTree,
  contract: DesignContract,
): DesignContractViolation[] {
  if (contract.never.length === 0) return [];
  const violations: DesignContractViolation[] = [];
  for (const node of Object.values(tree.nodes)) {
    for (const rule of contract.never) {
      const lower = rule.toLowerCase();
      for (const pattern of NEVER_PATTERNS) {
        if (!lower.includes(pattern.match)) continue;
        if (pattern.test(node)) {
          violations.push({
            nodeId: node.id,
            rule,
            code: pattern.code,
            message: `Design-DNA verletzt: „${rule}“ (Node ${node.id})`,
            suggestion: pattern.suggestion,
          });
          break;
        }
      }
    }
  }
  return violations;
}

export async function siteDesignContract(
  store: Store,
  siteId: string,
): Promise<DesignContract | null> {
  const site = await store.getSite(siteId);
  return site.designContract ?? null;
}

// Agent tokens get the hard gate, humans a warning (E26: Agenten hart,
// Menschen als Warnung mit Erklärung).
export function contractGate(
  violations: readonly DesignContractViolation[],
  authorKind: "human" | "agent",
): { error?: SenifyError; warnings: string[] } {
  if (violations.length === 0) return { warnings: [] };
  const warnings = violations.map(
    (violation) => `${violation.message} — ${violation.suggestion}`,
  );
  if (authorKind === "human") return { warnings };
  const first = violations[0];
  if (!first) return { warnings };
  return {
    error: new SenifyError("guardrail", first.message, {
      field: `nodes.${first.nodeId}`,
      suggestion: first.suggestion,
    }),
    warnings,
  };
}
