import { describe, expect, it } from "vitest";
import type { Control } from "../src/index.ts";
import {
  getPrimitive,
  isControlVisible,
  validateControl,
} from "../src/index.ts";

function findControl(type: string, key: string): Control | undefined {
  return getPrimitive(type)?.controls.find((control) => control.key === key);
}

describe("slider control", () => {
  it("exposes min, max, step and a unit", () => {
    const control = findControl("icon", "size");
    expect(control?.kind).toBe("slider");
    expect(control?.valueType).toBe("number");
    expect(control?.min).toBe(8);
    expect(control?.max).toBe(200);
    expect(control?.step).toBe(1);
    expect(control?.units).toContain("px");
    expect(validateControl(control as Control, "test")).toEqual([]);
  });

  it("rejects a slider without a unit", () => {
    const broken: Control = {
      key: "x",
      label: "X",
      kind: "slider",
      valueType: "number",
      default: 1,
      min: 0,
      max: 10,
      step: 1,
      units: [],
    };
    expect(validateControl(broken, "test").map((issue) => issue.message).join(" ")).toContain("Einheit");
  });

  it("rejects a default outside the range", () => {
    const broken: Control = {
      key: "x",
      label: "X",
      kind: "slider",
      valueType: "number",
      default: 99,
      min: 0,
      max: 10,
      step: 1,
      units: ["px"],
    };
    expect(validateControl(broken, "test").map((issue) => issue.message).join(" ")).toContain("außerhalb");
  });
});

describe("color control", () => {
  it("supports alpha and a string default", () => {
    const control = findControl("root", "background");
    expect(control?.kind).toBe("color");
    expect(control?.valueType).toBe("color");
    expect(control?.alpha).toBe(true);
    expect(typeof control?.default).toBe("string");
    expect(validateControl(control as Control, "test")).toEqual([]);
  });
});

describe("switcher control", () => {
  it("is a plain boolean", () => {
    const control = findControl("checkbox", "required");
    expect(control?.kind).toBe("switcher");
    expect(control?.valueType).toBe("boolean");
    expect(control?.default).toBe(false);
    expect(validateControl(control as Control, "test")).toEqual([]);
  });
});

describe("choose and select controls", () => {
  it("offers options and a matching default", () => {
    const control = findControl("heading", "level");
    expect(control?.kind).toBe("choose");
    expect(control?.options?.map((option) => option.value)).toContain("h2");
    expect(control?.default).toBe("h2");
  });

  it("supports the dropdown variant", () => {
    const control = findControl("frame", "semantic");
    expect(control?.kind).toBe("select");
    expect(control?.options?.length).toBe(7);
  });

  it("rejects a default that is not an option", () => {
    const broken: Control = {
      key: "x",
      label: "X",
      kind: "choose",
      valueType: "enum",
      default: "nope",
      options: [{ value: "a", label: "A" }],
    };
    expect(validateControl(broken, "test").map((issue) => issue.message).join(" ")).toContain("keine der Optionen");
  });
});

describe("dimensions control", () => {
  it("carries four sides and a unit", () => {
    const control = findControl("frame", "padding");
    expect(control?.kind).toBe("dimensions");
    expect(control?.valueType).toBe("spacing");
    expect(control?.linkable).toBe(true);
    expect(control?.units).toContain("rem");
    expect(validateControl(control as Control, "test")).toEqual([]);
  });
});

describe("gaps control", () => {
  it("carries row and column", () => {
    const control = findControl("grid", "gap");
    expect(control?.kind).toBe("gaps");
    expect(control?.valueType).toBe("gaps");
    expect(validateControl(control as Control, "test")).toEqual([]);
  });
});

describe("repeater control", () => {
  it("declares fields and an array default", () => {
    const control = findControl("table", "columns");
    expect(control?.kind).toBe("repeater");
    expect(control?.valueType).toBe("list");
    expect(control?.fields?.map((field) => field.key)).toEqual(["header"]);
    expect(Array.isArray(control?.default)).toBe(true);
    expect(validateControl(control as Control, "test")).toEqual([]);
  });

  it("rejects a repeater without fields", () => {
    const broken: Control = {
      key: "x",
      label: "X",
      kind: "repeater",
      valueType: "list",
      default: [],
      fields: [],
    };
    expect(validateControl(broken, "test").map((issue) => issue.message).join(" ")).toContain("Felder");
  });
});

describe("conditions", () => {
  it("shows a control only when equals matches", () => {
    const control = findControl("body", "dropCapLines");
    expect(control?.condition).toEqual({ prop: "dropCap", equals: true });
    expect(isControlVisible(control as Control, { dropCap: true })).toBe(true);
    expect(isControlVisible(control as Control, { dropCap: false })).toBe(false);
    expect(isControlVisible(control as Control, {})).toBe(false);
  });

  it("supports notEquals", () => {
    const control = findControl("table", "stripeColor");
    expect(control?.condition).toEqual({ prop: "striped", notEquals: false });
    expect(isControlVisible(control as Control, { striped: true })).toBe(true);
    expect(isControlVisible(control as Control, { striped: false })).toBe(false);
  });

  it("rejects a condition that sets equals and notEquals", () => {
    const broken: Control = {
      key: "x",
      label: "X",
      kind: "text",
      valueType: "string",
      default: "",
      condition: { prop: "mode", equals: "a", notEquals: "b" },
    };
    expect(validateControl(broken, "test").map((issue) => issue.message).join(" ")).toContain("zugleich");
  });
});
