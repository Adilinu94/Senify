import { describe, expect, it } from "vitest";
import { PRIMITIVES } from "../src/catalog.ts";
import { compileCss, compileCssReport, measureCss } from "../src/index.ts";
import type { DeviceValueMap } from "../src/index.ts";

// Golden per primitive: one node with a fixed style sample plus the properties
// that only that primitive owns. The sample covers every style group, so a
// golden also shows which groups a primitive does *not* have (`heading` drops
// `border-width`, `text` drops `border-width`, `box-shadow` and `opacity`).

const PADDING = { top: "8", right: "16", bottom: "8", left: "16", isLinked: false, unit: "px" };
const GAP = { row: "12", column: "16", isLinked: false, unit: "px" };

const SAMPLE: DeviceValueMap = {
  padding: PADDING,
  color: "#111111",
  fontSize: 16,
  borderWidth: 1,
  borderRadius: "8px",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
  opacity: 0.5,
  gap: GAP,
  width: 320,
};

const OWN: Record<string, DeviceValueMap> = {
  frame: { display: "flex" },
  column: { width: 50, order: 2 },
  grid: { columns: 4 },
  section: { contentWidth: "narrow", align: "center" },
  body: { dropCap: true, dropCapLines: 3 },
  list: { ordered: true, marker: "none" },
  image: { aspect: "16/9", fit: "contain" },
  icon: { size: 32, strokeWidth: 2 },
  table: { striped: true, stripeColor: "#ff0000", bordered: true },
  divider: { style: "dashed", thickness: 3, spacing: 32 },
  embed: { aspect: "4/3" },
  root: { background: "#f5f5f5" },
};

function golden(primitive: string, own: DeviceValueMap = {}): string {
  return compileCss({ nodes: [{ id: "n1", primitive, props: { ...SAMPLE, ...own } }] }, { layer: null });
}

const EXPECTED: Record<string, string> = {
  frame: `[data-node-id="n1"] {
  display: flex;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  column: `[data-node-id="n1"] {
  order: 2;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 50%;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  grid: `[data-node-id="n1"] {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  section: `[data-node-id="n1"] {
  max-width: 640px;
  margin-inline: auto;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  heading: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  text: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  body: `[data-node-id="n1"] {
  --drop-cap-lines: 3;
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  button: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  link: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  list: `[data-node-id="n1"] {
  list-style-type: none;
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  image: `[data-node-id="n1"] {
  aspect-ratio: 16 / 9;
  object-fit: contain;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  video: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  icon: `[data-node-id="n1"] {
  width: 32px;
  height: 32px;
  stroke-width: 2px;
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  input: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  select: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  checkbox: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  submit: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
  table: `[data-node-id="n1"] {
  --table-stripe-color: #ff0000;
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
}`,
  accordion: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
}`,
  divider: `[data-node-id="n1"] {
  border-top-style: dashed;
  border-top-width: 3px;
  margin-block: 32px;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  border-width: 1px;
  border-radius: 8px;
}`,
  embed: `[data-node-id="n1"] {
  aspect-ratio: 4 / 3;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  border-width: 1px;
  border-radius: 8px;
}`,
  collection: `[data-node-id="n1"] {
  padding: 8px 16px;
  gap: 12px 16px;
  font-size: 16px;
  color: #111111;
}`,
  root: `[data-node-id="n1"] {
  background-color: #f5f5f5;
  padding: 8px 16px;
  gap: 12px 16px;
  width: 320px;
  font-size: 16px;
  color: #111111;
  border-width: 1px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  opacity: 0.5;
}`,
};

describe("css golden per primitive", () => {
  it("has a golden for every catalog primitive", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(PRIMITIVES.map((entry) => entry.type).sort());
  });

  for (const primitive of PRIMITIVES) {
    it(`compiles ${primitive.type}`, () => {
      expect(golden(primitive.type, OWN[primitive.type] ?? {})).toBe(EXPECTED[primitive.type]);
    });
  }
});

describe("only visible values", () => {
  // Every catalog default for one node per primitive, unfiltered vs. filtered.
  function catalogDefaults(primitive: (typeof PRIMITIVES)[number]): DeviceValueMap {
    const bag: DeviceValueMap = {};
    for (const control of primitive.controls) {
      if (control.kind === "repeater") continue;
      bag[control.key] = control.default;
    }
    return bag;
  }

  const defaultsOnly: DeviceValueMap[] = [];
  for (const primitive of PRIMITIVES) defaultsOnly.push(catalogDefaults(primitive));
  const asDocument = (props: DeviceValueMap[]): {
    nodes: Array<{ id: string; primitive: string; props: DeviceValueMap }>;
  } => ({
    nodes: PRIMITIVES.map((primitive, index) => ({
      id: `n${index + 1}`,
      primitive: primitive.type,
      props: props[index] ?? {},
    })),
  });

  const overridesOnly = asDocument(
    PRIMITIVES.map((primitive) => ({ ...SAMPLE, ...(OWN[primitive.type] ?? {}) })),
  );

  it("reports the output size as a number", () => {
    const report = compileCssReport(overridesOnly);
    expect(report.nodeCount).toBe(23);
    expect(report.ruleCount).toBe(23);
    expect(report.bytes).toBe(measureCss(report.css));
    expect(report.bytes).toBeGreaterThan(0);
  });

  it("writes nothing for props that still hold their catalog default", () => {
    // Without the filter the same nodes would cost 815 bytes of pure noise.
    const filtered = compileCssReport(asDocument(defaultsOnly));
    const unfiltered = compileCssReport(asDocument(defaultsOnly), { includeDefaults: true });
    expect(filtered.css).toBe("");
    expect(filtered.bytes).toBe(0);
    expect(unfiltered.bytes).toBe(815);
    expect(unfiltered.bytes).toBeGreaterThan(filtered.bytes);
  });

  it("keeps a single default value out of the rule", () => {
    const node = {
      id: "d1",
      primitive: "divider",
      props: { style: "dashed", thickness: 1, spacing: 24 },
    };
    expect(compileCss({ nodes: [node] }, { layer: null })).toBe(
      `[data-node-id="d1"] {\n  border-top-style: dashed;\n}`,
    );
    const unfiltered = compileCss({ nodes: [node] }, { layer: null, includeDefaults: true });
    expect(unfiltered).toContain("border-top-width: 1px;");
    expect(unfiltered).toContain("margin-block: 24px;");
  });
});
