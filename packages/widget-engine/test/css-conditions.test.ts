import { describe, expect, it } from "vitest";
import { compileCss } from "../src/index.ts";

// Conditions come from `controls.ts` (`isControlVisible` / `isConditionSatisfied`)
// and are evaluated against the values of the context that is being written —
// the device-resolved bag, not the raw key.

describe("conditional properties", () => {
  it("writes a property while its condition holds", () => {
    const css = compileCss({
      nodes: [
        { id: "t1", primitive: "table", props: { striped: true, stripeColor: "#ff0000" } },
        { id: "b1", primitive: "body", props: { dropCap: true, dropCapLines: 4 } },
      ],
    });
    expect(css).toBe(`@layer user-authored {
  [data-node-id="t1"] {
    --table-stripe-color: #ff0000;
  }

  [data-node-id="b1"] {
    --drop-cap-lines: 4;
  }
}`);
  });

  it("drops the property when the condition fails", () => {
    const css = compileCss({
      nodes: [
        { id: "t2", primitive: "table", props: { striped: false, stripeColor: "#ff0000" } },
        { id: "b2", primitive: "body", props: { dropCap: false, dropCapLines: 4 } },
      ],
    });
    // `stripeColor` needs `striped !== false`, `dropCapLines` needs `dropCap === true`.
    expect(css).toBe("");
  });

  it("treats a missing switch as satisfied for notEquals", () => {
    const css = compileCss({ nodes: [{ id: "t3", primitive: "table", props: { stripeColor: "#ff0000" } }] });
    expect(css).toContain("--table-stripe-color: #ff0000;");
  });

  it("evaluates the condition per device", () => {
    const css = compileCss({
      nodes: [
        {
          id: "t4",
          primitive: "table",
          props: { striped: true, stripeColor: "#ff0000", striped_tablet: false },
        },
      ],
    });
    // Tablet switches the stripes off, so the stripe color leaves that context
    // only; the base context keeps it.
    expect(css).toContain("--table-stripe-color: #ff0000;");
    expect(css).not.toContain("@media (max-width: 1023.98px)");
  });
});
