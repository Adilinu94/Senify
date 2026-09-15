import type { NodeTree } from "@senify/section-sdk";
import { styleVarsFor } from "@senify/registry";

// Breakpoint overrides cannot travel inline: they become a generated
// stylesheet keyed by data-node-id. The same numbers serve the editor
// frames (T13) and the bake.

export const BREAKPOINTS = {
  tablet: 1024,
  mobile: 640,
} as const;

export type StyleCssPage = {
  path: string;
  tree: NodeTree;
};

function mediaQuery(maxWidth: number, body: string): string {
  return `@media (max-width: ${maxWidth - 0.02}px) {\n${body}\n}`;
}

export function overridesCss(pages: StyleCssPage[]): string {
  const blocks: string[] = [];
  for (const page of pages) {
    for (const node of Object.values(page.tree.nodes)) {
      const overrides = node.overrides;
      if (!overrides) continue;
      for (const breakpoint of ["tablet", "mobile"] as const) {
        const override = overrides[breakpoint];
        if (!override) continue;
        const vars = styleVarsFor(override.props ?? {}) ?? {};
        const lines: string[] = [];
        if (override.hidden === true) lines.push("  display: none;");
        for (const [name, value] of Object.entries(vars)) {
          lines.push(`  ${name}: ${value};`);
        }
        if (lines.length === 0) continue;
        blocks.push(
          mediaQuery(
            BREAKPOINTS[breakpoint],
            `  [data-node-id="${node.id}"] {\n${lines.join("\n")}\n  }`,
          ),
        );
      }
    }
  }
  if (blocks.length === 0) return "";
  return `${blocks.join("\n\n")}\n`;
}
